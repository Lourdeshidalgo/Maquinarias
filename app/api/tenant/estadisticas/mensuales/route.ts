import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

// Obtiene los últimos N meses completos (incluyendo el actual en curso)
function getMeses(cantidad: number = 12) {
  const hoy = new Date();
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({
      anio: fecha.getFullYear(),
      mes: fecha.getMonth() + 1, // 1-12
      etiqueta: fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      start: new Date(fecha.getFullYear(), fecha.getMonth(), 1),
      end: new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999),
    });
  }
  return meses;
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const mesesAtras = parseInt(searchParams.get('meses') || '12', 10);

    const meses = getMeses(mesesAtras);

    // Obtener todas las ventas del período completo (para filtrar luego en memoria por mes)
    const startGlobal = meses[0].start;
    const endGlobal = meses[meses.length - 1].end;

    const ventas = await prisma.venta.findMany({
      where: {
        empresaId,
        fecha: { gte: startGlobal, lte: endGlobal },
        estado: { in: ['COMPLETADO', 'DEMO'] },
      },
      include: {
        items: {
          include: {
            producto: {
              select: { id: true, precioCosto: true },
            },
          },
        },
      },
    });

    // Obtener egresos del período
    const egresos = await prisma.egresoCaja.findMany({
      where: {
        empresaId,
        fecha: { gte: startGlobal, lte: endGlobal },
      },
      select: {
        fecha: true,
        monto: true,
      },
    });

    // Indexar egresos por mes (YYYY-MM)
    const egresosPorMes = new Map<string, number>();
    for (const e of egresos) {
      const clave = `${e.fecha.getFullYear()}-${String(e.fecha.getMonth() + 1).padStart(2, '0')}`;
      egresosPorMes.set(clave, (egresosPorMes.get(clave) || 0) + e.monto.toNumber());
    }

    // Calcular por mes
    const resultados = meses.map((m) => {
      const clave = `${m.anio}-${String(m.mes).padStart(2, '0')}`;

      let facturacion = 0;
      let costoProductos = 0;
      let descuentos = 0;

      for (const v of ventas) {
        const fechaVenta = new Date(v.fecha);
        const ventaClave = `${fechaVenta.getFullYear()}-${String(fechaVenta.getMonth() + 1).padStart(2, '0')}`;
        if (ventaClave !== clave) continue;

        const mult = v.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
        const total = v.total.toNumber() * mult;
        facturacion += total;

        // Descuentos (solo restamos del monto, no de la facturación bruta)
        descuentos += (v.descuentoTotal?.toNumber() || 0) * Math.abs(mult);

        // Costo de productos vendidos (COGS)
        for (const item of v.items) {
          if (item.producto) {
            const costoUnitario = item.producto.precioCosto.toNumber();
            const qty = item.cantidad.toNumber() * mult;
            if (qty > 0) {
              costoProductos += costoUnitario * qty;
            }
          }
        }
      }

      const egresosMes = egresosPorMes.get(clave) || 0;
      const gananciaBruta = facturacion - costoProductos;
      const gananciaNeta = gananciaBruta - egresosMes;

      return {
        anio: m.anio,
        mes: m.mes,
        etiqueta: m.etiqueta,
        clave,
        facturacion: Math.max(0, facturacion), // evitar negativos por notas de crédito excesivas
        costoProductos: Math.max(0, costoProductos),
        gananciaBruta: Math.max(0, gananciaBruta),
        egresos: egresosMes,
        gananciaNeta: gananciaNeta, // puede ser negativa
        descuentos: Math.max(0, descuentos),
      };
    });

    // Totales globales
    const totales = resultados.reduce(
      (acc, r) => ({
        facturacion: acc.facturacion + r.facturacion,
        costoProductos: acc.costoProductos + r.costoProductos,
        gananciaBruta: acc.gananciaBruta + r.gananciaBruta,
        egresos: acc.egresos + r.egresos,
        gananciaNeta: acc.gananciaNeta + r.gananciaNeta,
        descuentos: acc.descuentos + r.descuentos,
      }),
      { facturacion: 0, costoProductos: 0, gananciaBruta: 0, egresos: 0, gananciaNeta: 0, descuentos: 0 }
    );

    return NextResponse.json({
      meses: resultados,
      totales,
      promedioMensual: {
        facturacion: totales.facturacion / resultados.length,
        gananciaNeta: totales.gananciaNeta / resultados.length,
      },
    });
  } catch (error: any) {
    console.error('Estadisticas mensuales error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
