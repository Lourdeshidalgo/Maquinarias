import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getTenantId(req: NextRequest): string {
  const empresaId = req.headers.get('x-empresa-id');
  if (!empresaId) {
    throw new Error('Tenant context is missing.');
  }
  return empresaId;
}

// Rango de los últimos 30 días en horario de Argentina
function getRangoUltimos30Dias() {
  const now = new Date();
  const hasta = new Date(now);
  const desde = new Date(now);
  desde.setDate(desde.getDate() - 30);
  // Alinear al inicio del día (Argentina) para un rango consistente
  const desdeStr = desde.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const start = new Date(`${desdeStr}T00:00:00-03:00`);
  return { start, end: hasta };
}

type ProductoRanking = {
  productoId: string;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioVenta: number;
  stockActual: number;
  imagenUrl: string | null;
  unidadesVendidas: number;
  montoVendido: number;
};

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { start, end } = getRangoUltimos30Dias();

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
            codigo: true,
            nombre: true,
            categoria: true,
            unidad: true,
            precioVenta: true,
            stockActual: true,
            imagenUrl: true,
            activo: true,
          },
        },
        venta: { select: { tipoComprobante: true } },
      },
    });

    // Acumuladores por categoría y por producto
    const porCategoria = new Map<string, number>();
    const porProducto = new Map<string, ProductoRanking>();

    for (const item of ventaItems) {
      // Las notas de crédito restan unidades
      const mult = item.venta.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
      const unidad = Number(item.cantidad) * mult;
      if (unidad <= 0) continue;

      const categoria = item.producto.categoria || 'General';
      porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + unidad);

      const existing = porProducto.get(item.productoId);
      const monto = item.subtotal.toNumber() * mult;
      if (existing) {
        existing.unidadesVendidas += unidad;
        existing.montoVendido += monto;
      } else {
        porProducto.set(item.productoId, {
          productoId: item.producto.id,
          codigo: item.producto.codigo,
          nombre: item.producto.nombre,
          categoria,
          unidad: item.producto.unidad,
          precioVenta: item.producto.precioVenta.toNumber(),
          stockActual: item.producto.stockActual.toNumber(),
          imagenUrl: item.producto.imagenUrl,
          unidadesVendidas: unidad,
          montoVendido: monto,
        });
      }
    }

    // Categoría más vendida
    let categoriaTop: string | null = null;
    let categoriaTopUnidades = 0;
    for (const [categoria, unidades] of porCategoria.entries()) {
      if (unidades > categoriaTopUnidades) {
        categoriaTop = categoria;
        categoriaTopUnidades = unidades;
      }
    }

    // Productos más vendidos de la categoría top
    const productosTop: ProductoRanking[] = categoriaTop
      ? Array.from(porProducto.values())
          .filter((p) => p.categoria === categoriaTop)
          .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
      : [];

    // Ranking completo de categorías (para mostrar alternativas)
    const totalUnidades = Array.from(porCategoria.values()).reduce((acc, v) => acc + v, 0);
    const categoriasRanking = Array.from(porCategoria.entries())
      .map(([categoria, unidades]) => ({
        categoria,
        unidades,
        porcentaje: totalUnidades > 0 ? (unidades / totalUnidades) * 100 : 0,
      }))
      .sort((a, b) => b.unidades - a.unidades);

    return NextResponse.json({
      rango: { desde: start, hasta: end },
      totalUnidades,
      categoriaTop: categoriaTop
        ? { categoria: categoriaTop, unidades: categoriaTopUnidades }
        : null,
      productosTop,
      categoriasRanking,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
