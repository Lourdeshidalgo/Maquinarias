import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

// Resumen liviano de la jornada para el panel de inicio.
// Antes el panel bajaba TODAS las ventas de la empresa y las sumaba en el
// navegador solo para mostrar el total del día. Con muchos registros eso era
// lento. Acá el cálculo se hace en la base y viajan unos pocos números.
//
// El total del día junto con las alertas de stock. Lo usan todos los roles
// (por eso incluye el stock, que el endpoint de reportes no expone a empleados).
export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);

    // Día comercial en horario de Argentina (00:00 a 23:59:59.999)
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const start = new Date(`${hoy}T00:00:00-03:00`);
    const end = new Date(`${hoy}T23:59:59.999-03:00`);

    const [ventas, productos] = await Promise.all([
      prisma.venta.findMany({
        where: {
          empresaId,
          fecha: { gte: start, lte: end },
          estado: { not: 'RECHAZADO_AFIP' },
        },
        select: { tipoComprobante: true, total: true },
      }),
      prisma.producto.findMany({
        where: { empresaId, activo: true },
        select: { id: true, codigo: true, nombre: true, stockActual: true, stockMinimo: true, unidad: true },
      }),
    ]);

    let totalVentas = 0;
    for (const v of ventas) {
      const monto = Number(v.total) || 0;
      totalVentas += v.tipoComprobante.startsWith('Nota de Crédito') ? -monto : monto;
    }

    const lowStock = productos
      .filter((p) => Number(p.stockActual) <= Number(p.stockMinimo))
      .sort((a, b) => Number(a.stockActual) - Number(b.stockActual))
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stock: Number(p.stockActual),
        min: Number(p.stockMinimo),
        unidad: p.unidad,
      }));

    return NextResponse.json({
      stats: {
        totalVentas: Math.round(totalVentas * 100) / 100,
        cantidadVentas: ventas.length,
      },
      lowStock,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
