import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

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

type VentaDetalleCategoria = {
  ventaId: string;
  fecha: string;
  tipoComprobante: string;
  numero: string;
  cliente: string;
  estadoVenta: string;
  unidadesCategoria: number;
  montoCategoria: number;
  productos: Array<{ nombre: string; cantidad: number; unidad: string }>;
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
        venta: {
          select: {
            id: true,
            fecha: true,
            tipoComprobante: true,
            numeroComprobante: true,
            puntoVenta: true,
            total: true,
            estado: true,
            cliente: { select: { razonSocial: true } },
          },
        },
      },
    });

    // Acumuladores por categoría y por producto
    const porCategoria = new Map<string, number>();
    const porProducto = new Map<string, ProductoRanking>();

    // Filas crudas para reconstruir el detalle por venta de la categoría top
    const filas: Array<{
      ventaId: string;
      fecha: Date;
      tipoComprobante: string;
      puntoVenta: number;
      numeroComprobante: number;
      cliente: string;
      estadoVenta: string;
      categoria: string;
      productoNombre: string;
      unidad: string;
      cantidad: number;
      monto: number;
    }> = [];

    for (const item of ventaItems) {
      // Las notas de crédito restan unidades
      const mult = item.venta.tipoComprobante.startsWith('Nota de Crédito') ? -1 : 1;
      const unidad = Number(item.cantidad) * mult;
      if (unidad <= 0) continue;

      const categoria = item.producto.categoria || 'General';
      porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + unidad);

      filas.push({
        ventaId: item.venta.id,
        fecha: item.venta.fecha,
        tipoComprobante: item.venta.tipoComprobante,
        puntoVenta: item.venta.puntoVenta,
        numeroComprobante: item.venta.numeroComprobante,
        cliente: item.venta.cliente?.razonSocial || 'Consumidor Final',
        estadoVenta: item.venta.estado,
        categoria,
        productoNombre: item.producto.nombre,
        unidad: item.producto.unidad,
        cantidad: unidad,
        monto: item.subtotal.toNumber() * mult,
      });

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

    // Ranking completo de categorías
    const totalUnidades = Array.from(porCategoria.values()).reduce((acc, v) => acc + v, 0);
    const categoriasRankingFull = Array.from(porCategoria.entries())
      .map(([categoria, unidades]) => ({
        categoria,
        unidades,
        porcentaje: totalUnidades > 0 ? (unidades / totalUnidades) * 100 : 0,
      }))
      .sort((a, b) => b.unidades - a.unidades);

    // Top 3 categorías con su detalle completo
    const top3Categorias = categoriasRankingFull.slice(0, 3);
    const categoriasDestacadas = top3Categorias.map((catInfo) => {
      const cat = catInfo.categoria;
      const productosTopCat = Array.from(porProducto.values())
        .filter((p) => p.categoria === cat)
        .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);

      // Ventas que incluyen esta categoría
      const detMap = new Map<string, VentaDetalleCategoria>();
      for (const f of filas) {
        if (f.categoria !== cat) continue;
        const existing = detMap.get(f.ventaId);
        if (existing) {
          existing.unidadesCategoria += f.cantidad;
          existing.montoCategoria += f.monto;
          existing.productos.push({ nombre: f.productoNombre, cantidad: f.cantidad, unidad: f.unidad });
        } else {
          detMap.set(f.ventaId, {
            ventaId: f.ventaId,
            fecha: f.fecha.toISOString(),
            tipoComprobante: f.tipoComprobante,
            numero: `${String(f.puntoVenta).padStart(4, '0')}-${String(f.numeroComprobante).padStart(8, '0')}`,
            cliente: f.cliente,
            estadoVenta: f.estadoVenta,
            unidadesCategoria: f.cantidad,
            montoCategoria: f.monto,
            productos: [{ nombre: f.productoNombre, cantidad: f.cantidad, unidad: f.unidad }],
          });
        }
      }

      const ventasDetalleCat = Array.from(detMap.values()).sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );

      return {
        categoria: cat,
        unidades: catInfo.unidades,
        porcentaje: catInfo.porcentaje,
        productosTop: productosTopCat,
        ventasDetalle: ventasDetalleCat,
        cantidadVentas: ventasDetalleCat.length,
      };
    });

    return NextResponse.json({
      rango: { desde: start, hasta: end },
      totalUnidades,
      categoriaTop: categoriasDestacadas[0]
        ? { categoria: categoriasDestacadas[0].categoria, unidades: categoriasDestacadas[0].unidades, cantidadVentas: categoriasDestacadas[0].cantidadVentas }
        : null,
      productosTop: categoriasDestacadas[0]?.productosTop || [],
      categoriasRanking: categoriasRankingFull,
      ventasDetalle: categoriasDestacadas[0]?.ventasDetalle || [],
      categoriasDestacadas,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
