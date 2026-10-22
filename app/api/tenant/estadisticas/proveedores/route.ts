import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

function getRange(periodo: string, desde?: string | null, hasta?: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

  let start: Date;
  let end: Date;

  if (desde && hasta) {
    start = new Date(`${desde}T00:00:00-03:00`);
    end = new Date(`${hasta}T23:59:59.999-03:00`);
    return { start, end };
  }

  start = new Date(`${today}T00:00:00-03:00`);
  if (periodo === 'semana') {
    start.setDate(start.getDate() - 7);
  } else if (periodo === 'mes') {
    start.setDate(start.getDate() - 30);
  } else if (periodo === 'trimestre') {
    start.setDate(start.getDate() - 90);
  } else if (periodo === 'anio') {
    start.setDate(start.getDate() - 365);
  } else {
    // todos
    start.setFullYear(start.getFullYear() - 5);
  }
  end = new Date(`${today}T23:59:59.999-03:00`);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'mes';

    const { start, end } = getRange(periodo, searchParams.get('desde'), searchParams.get('hasta'));

    // Obtener items de ventas en el período, solo ventas completadas/demo (excluye notas de crédito y rechazadas)
    const ventaItems = await prisma.ventaItem.findMany({
      where: {
        venta: {
          empresaId,
          fecha: { gte: start, lte: end },
          estado: { in: ['COMPLETADO', 'DEMO'] },
        },
      },
      include: {
        producto: {
          select: {
            id: true,
            nombre: true,
            proveedorId: true,
            proveedor: {
              select: { id: true, nombre: true },
            },
          },
        },
        venta: {
          select: {
            id: true,
            total: true,
            tipoComprobante: true,
          },
        },
      },
    });

    // Agrupar por proveedor
    const proveedorMap = new Map<
      string,
      {
        id: string;
        nombre: string;
        unidadesVendidas: number;
        cantidadVentas: number;
        montoTotal: number;
        productos: Map<string, { id: string; nombre: string; cantidad: number; monto: number }>;
      }
    >();

    let totalUnidadesGlobales = 0;

    for (const item of ventaItems) {
      const mult = item.venta.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
      const qty = item.cantidad.toNumber() * mult;
      const monto = item.subtotal.toNumber() * mult;

      // Solo contabilizar ventas positivas para ranking (notas de crédito restan)
      if (qty <= 0) continue;

      const prov = item.producto.proveedor;
      if (!prov) {
        // Producto sin proveedor asignado: agrupar bajo "Sin proveedor"
        const key = '__sin_proveedor__';
        if (!proveedorMap.has(key)) {
          proveedorMap.set(key, {
            id: key,
            nombre: 'Sin proveedor asignado',
            unidadesVendidas: 0,
            cantidadVentas: 0,
            montoTotal: 0,
            productos: new Map(),
          });
        }
        const entry = proveedorMap.get(key)!;
        entry.unidadesVendidas += qty;
        entry.montoTotal += monto;
        entry.cantidadVentas += 1;

        const prodKey = item.productoId;
        const prodEntry = entry.productos.get(prodKey) || {
          id: item.productoId,
          nombre: item.producto.nombre,
          cantidad: 0,
          monto: 0,
        };
        prodEntry.cantidad += qty;
        prodEntry.monto += monto;
        entry.productos.set(prodKey, prodEntry);

        totalUnidadesGlobales += qty;
        continue;
      }

      if (!proveedorMap.has(prov.id)) {
        proveedorMap.set(prov.id, {
          id: prov.id,
          nombre: prov.nombre,
          unidadesVendidas: 0,
          cantidadVentas: 0,
          montoTotal: 0,
          productos: new Map(),
        });
      }
      const entry = proveedorMap.get(prov.id)!;
      entry.unidadesVendidas += qty;
      entry.montoTotal += monto;
      entry.cantidadVentas += 1;

      const prodKey = item.productoId;
      const prodEntry = entry.productos.get(prodKey) || {
        id: item.productoId,
        nombre: item.producto.nombre,
        cantidad: 0,
        monto: 0,
      };
      prodEntry.cantidad += qty;
      prodEntry.monto += monto;
      entry.productos.set(prodKey, prodEntry);

      totalUnidadesGlobales += qty;
    }

    // Convertir a array y calcular porcentajes
    const ranking = Array.from(proveedorMap.values())
      .map((entry) => ({
        id: entry.id,
        nombre: entry.nombre,
        unidadesVendidas: entry.unidadesVendidas,
        porcentaje: totalUnidadesGlobales > 0 ? (entry.unidadesVendidas / totalUnidadesGlobales) * 100 : 0,
        montoTotal: entry.montoTotal,
        cantidadVentas: entry.cantidadVentas,
        productos: Array.from(entry.productos.values()).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          monto: p.monto,
          porcentaje: entry.unidadesVendidas > 0 ? (p.cantidad / entry.unidadesVendidas) * 100 : 0,
        })),
      }))
      .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);

    return NextResponse.json({
      periodo,
      rango: { desde: start, hasta: end },
      totalUnidades: totalUnidadesGlobales,
      ranking,
    });
  } catch (error: any) {
    console.error('Estadisticas proveedores error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
