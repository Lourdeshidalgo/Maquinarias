import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

function getDateLimit(periodo: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const dateLimit = new Date(`${today}T00:00:00-03:00`);

  if (periodo === 'diario' || periodo === 'dia') {
    // Hoy: sin desplazamiento
  } else if (periodo === 'semana') {
    dateLimit.setDate(dateLimit.getDate() - 7);
  } else if (periodo === 'mes') {
    dateLimit.setDate(dateLimit.getDate() - 30);
  } else if (periodo === 'todos') {
    dateLimit.setFullYear(dateLimit.getFullYear() - 5);
  }

  return dateLimit;
}

// Período anterior equivalente, para comparar (ej: últimos 30 días vs los 30 previos).
function getPreviousRange(periodo: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const end = new Date(`${today}T23:59:59.999-03:00`);
  let days = 30;

  if (periodo === 'diario' || periodo === 'dia') days = 1;
  else if (periodo === 'semana') days = 7;
  else if (periodo === 'todos') return null;

  const start = new Date(`${today}T00:00:00-03:00`);
  start.setDate(start.getDate() - days * 2);

  const prevEnd = new Date(`${today}T00:00:00-03:00`);
  prevEnd.setDate(prevEnd.getDate() - days);

  return { start, end: prevEnd, currentEnd: end };
}

function signedTotal(tipoComprobante: string, total: unknown) {
  const amount = Number(total);
  return tipoComprobante.startsWith('Nota de Crédito') ? -amount : amount;
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'mes'; // 'dia', 'semana', 'mes', 'todos'

    const dateLimit = getDateLimit(periodo);

    const ventas = await prisma.venta.findMany({
      where: {
        empresaId,
        fecha: { gte: dateLimit },
        estado: { in: ['COMPLETADO', 'DEMO'] },
      },
      include: {
        items: true,
      },
    });

    const stats = ventas.reduce(
      (acc, venta) => {
        const multiplier = venta.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
        acc.totalVentas += multiplier * venta.total.toNumber();
        acc.totalIva += multiplier * venta.iva.toNumber();
        acc.totalNeto += multiplier * venta.subtotal.toNumber();
        acc.cantidadVentas += 1;
        return acc;
      },
      { totalVentas: 0, totalIva: 0, totalNeto: 0, cantidadVentas: 0 }
    );

    // 2. Best Selling Products (grouped)
    const bestSellersMap = new Map<string, { id: string; nombre: string; cantidad: number; total: number }>();
    for (const venta of ventas) {
      if (!venta.tipoComprobante.startsWith('Factura')) continue;
      for (const item of venta.items) {
        const current = bestSellersMap.get(item.productoId) || {
          id: item.productoId,
          nombre: item.productoName,
          cantidad: 0,
          total: 0,
        };
        current.cantidad += item.cantidad.toNumber();
        current.total += item.subtotal.toNumber();
        bestSellersMap.set(item.productoId, current);
      }
    }

    const bestSellers = Array.from(bestSellersMap.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // 3. Debtor Clients (sorted highest to lowest debt)
    const debtors = await prisma.cliente.findMany({
      where: {
        empresaId,
        saldoCuentaCorriente: { gt: 0 },
      },
      orderBy: {
        saldoCuentaCorriente: 'desc',
      },
      take: 10,
    });

    // 4. Low stock products (filter in-memory for database-agnostic comparison)
    const allProducts = await prisma.producto.findMany({
      where: { empresaId, soloCatalogo: false },
    });
    
    const lowStock = allProducts
      .filter((p) => p.stockActual.toNumber() <= p.stockMinimo.toNumber())
      .sort((a, b) => a.stockActual.toNumber() - b.stockActual.toNumber())
      .slice(0, 10);

    const paymentMethodsMap = ventas.reduce<Record<string, number>>((acc, venta) => {
      acc[venta.formaPago] = (acc[venta.formaPago] || 0) + signedTotal(venta.tipoComprobante, venta.total);
      return acc;
    }, {});

    // 5. Ticket promedio
    const ticketPromedio = stats.cantidadVentas > 0 ? Math.round((stats.totalVentas / stats.cantidadVentas) * 100) / 100 : 0;

    // 6. Comparación con el período anterior (para saber si mejoró o empeoró)
    const prevRange = getPreviousRange(periodo);
    let comparacion: { totalAnterior: number; variacionPct: number } | null = null;
    if (prevRange) {
      const ventasAnteriores = await prisma.venta.findMany({
        where: {
          empresaId,
          fecha: { gte: prevRange.start, lt: prevRange.end },
          estado: { in: ['COMPLETADO', 'DEMO'] },
        },
        select: { tipoComprobante: true, total: true },
      });
      const totalAnterior = ventasAnteriores.reduce(
        (acc, v) => acc + signedTotal(v.tipoComprobante, v.total),
        0
      );
      const variacionPct =
        totalAnterior > 0 ? ((stats.totalVentas - totalAnterior) / totalAnterior) * 100 : null;
      comparacion = {
        totalAnterior,
        variacionPct: variacionPct === null ? 0 : variacionPct,
      };
    }

    // 7. Productos sin movimiento: tienen stock pero no se vendieron en el período
    const vendidosIds = new Set<string>();
    for (const venta of ventas) {
      if (!venta.tipoComprobante.startsWith('Factura')) continue;
      for (const item of venta.items) vendidosIds.add(item.productoId);
    }

    const sinMovimiento = allProducts
      .filter((p) => p.activo && p.stockActual.toNumber() > 0 && !vendidosIds.has(p.id))
      .sort((a, b) => b.stockActual.toNumber() - a.stockActual.toNumber())
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stock: p.stockActual.toNumber(),
        precioVenta: p.precioVenta.toNumber(),
        unidad: p.unidad,
      }));

    // 8. Ventas por día (para el mini gráfico)
    const ventasPorDiaMap = new Map<string, { total: number; cantidad: number }>();
    for (const venta of ventas) {
      const day = new Date(venta.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      const current = ventasPorDiaMap.get(day) || { total: 0, cantidad: 0 };
      current.total += signedTotal(venta.tipoComprobante, venta.total);
      current.cantidad += 1;
      ventasPorDiaMap.set(day, current);
    }
    const ventasPorDia = Array.from(ventasPorDiaMap.entries())
      .map(([fecha, v]) => ({ fecha, total: v.total, cantidad: v.cantidad }))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

    return NextResponse.json({
      periodo,
      stats: {
        totalVentas: stats.totalVentas,
        totalIva: stats.totalIva,
        totalNeto: stats.totalNeto,
        cantidadVentas: stats.cantidadVentas,
        ticketPromedio,
      },
      comparacion,
      bestSellers,
      sinMovimiento,
      ventasPorDia,
      debtors: debtors.map((d) => ({
        id: d.id,
        razonSocial: d.razonSocial,
        nroDoc: d.nroDoc,
        saldo: d.saldoCuentaCorriente.toNumber(),
      })),
      lowStock: lowStock.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stock: p.stockActual.toNumber(),
        min: p.stockMinimo.toNumber(),
        unidad: p.unidad,
      })),
      paymentMethods: Object.entries(paymentMethodsMap).map(([metodo, total]) => ({ metodo, total })),
    });
  } catch (error: any) {
    console.error('Reports endpoint error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
