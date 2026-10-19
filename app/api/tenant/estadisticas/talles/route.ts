import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getTenantId(req: NextRequest): string {
  const empresaId = req.headers.get('x-empresa-id');
  if (!empresaId) {
    throw new Error('Tenant context is missing.');
  }
  return empresaId;
}

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
    start.setFullYear(start.getFullYear() - 5);
  }
  end = new Date(`${today}T23:59:59.999-03:00`);
  return { start, end };
}

// Determina si un talle es alfabético (XS, S, M, L, XL...) o numérico (36, 38, 40...)
function clasificarTalle(talle: string): 'alfabetico' | 'numerico' | 'otro' {
  const t = talle.trim().toUpperCase();
  // Alfabéticos: solo letras, entre 1 y 3 caracteres comunes de talle
  if (/^[XSML]+[A-Z]?$/.test(t) || /^[XS]?[SML]XL?$/.test(t) || /^(XS|S|M|L|XL|XXL|XXXL|TU|U)$/.test(t)) {
    return 'alfabetico';
  }
  // Numéricos: solo dígitos
  if (/^\d{1,3}$/.test(t)) {
    return 'numerico';
  }
  return 'otro';
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'mes';
    const productoId = searchParams.get('productoId') || null;
    const proveedorId = searchParams.get('proveedorId') || null;

    const { start, end } = getRange(periodo, searchParams.get('desde'), searchParams.get('hasta'));

    const ventaItems = await prisma.ventaItem.findMany({
      where: {
        NOT: [{ talle: null }, { talle: '' }],
        venta: {
          empresaId,
          fecha: { gte: start, lte: end },
          estado: { in: ['COMPLETADO', 'DEMO'] },
        },
        ...(productoId ? { productoId } : {}),
        ...(proveedorId
          ? {
              producto: {
                proveedorId,
              },
            }
          : {}),
      },
      include: {
        producto: {
          select: {
            id: true,
            nombre: true,
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
            fecha: true,
          },
        },
      },
    });

    const tallesMap = new Map<
      string,
      {
        talle: string;
        tipo: 'alfabetico' | 'numerico' | 'otro';
        cantidad: number;
        monto: number;
        ventas: number;
        productos: Map<string, { id: string; nombre: string; cantidad: number }>;
      }
    >();

    let totalUnidades = 0;

    for (const item of ventaItems) {
      const mult = item.venta.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
      const qty = item.cantidad.toNumber() * mult;
      if (qty <= 0) continue;

      const talleRaw = (item.talle || '').trim();
      const tipo = clasificarTalle(talleRaw);

      let entry = tallesMap.get(talleRaw);
      if (!entry) {
        entry = {
          talle: talleRaw,
          tipo,
          cantidad: 0,
          monto: 0,
          ventas: 0,
          productos: new Map(),
        };
        tallesMap.set(talleRaw, entry);
      }

      entry.cantidad += qty;
      entry.monto += item.subtotal.toNumber() * mult;
      entry.ventas += 1;
      totalUnidades += qty;

      const prodKey = item.productoId;
      const prodEntry = entry.productos.get(prodKey) || {
        id: item.productoId,
        nombre: item.producto.nombre,
        cantidad: 0,
      };
      prodEntry.cantidad += qty;
      entry.productos.set(prodKey, prodEntry);
    }

    // Separar por tipo
    const alfabeticos = Array.from(tallesMap.values())
      .filter((e) => e.tipo === 'alfabetico')
      .map((e) => ({
        talle: e.talle,
        cantidad: e.cantidad,
        monto: e.monto,
        ventas: e.ventas,
        porcentaje: totalUnidades > 0 ? (e.cantidad / totalUnidades) * 100 : 0,
        productos: Array.from(e.productos.values()),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const numericos = Array.from(tallesMap.values())
      .filter((e) => e.tipo === 'numerico')
      .map((e) => ({
        talle: e.talle,
        cantidad: e.cantidad,
        monto: e.monto,
        ventas: e.ventas,
        porcentaje: totalUnidades > 0 ? (e.cantidad / totalUnidades) * 100 : 0,
        productos: Array.from(e.productos.values()),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const otros = Array.from(tallesMap.values())
      .filter((e) => e.tipo === 'otro')
      .map((e) => ({
        talle: e.talle,
        cantidad: e.cantidad,
        monto: e.monto,
        ventas: e.ventas,
        porcentaje: totalUnidades > 0 ? (e.cantidad / totalUnidades) * 100 : 0,
        productos: Array.from(e.productos.values()),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const totalAlfabeticos = alfabeticos.reduce((acc, a) => acc + a.cantidad, 0);
    const totalNumericos = numericos.reduce((acc, a) => acc + a.cantidad, 0);

    return NextResponse.json({
      periodo,
      rango: { desde: start, hasta: end },
      productoId,
      proveedorId,
      totalUnidades,
      totalAlfabeticos,
      totalNumericos,
      alfabeticos,
      numericos,
      otros,
      resumen: [
        { tipo: 'Alfabéticos', cantidad: totalAlfabeticos, porcentaje: totalUnidades > 0 ? (totalAlfabeticos / totalUnidades) * 100 : 0 },
        { tipo: 'Numéricos', cantidad: totalNumericos, porcentaje: totalUnidades > 0 ? (totalNumericos / totalUnidades) * 100 : 0 },
      ],
    });
  } catch (error: any) {
    console.error('Estadisticas talles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
