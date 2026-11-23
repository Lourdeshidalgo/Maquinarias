import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { obtenerConfigCostos } from '@/lib/costos-db';
import { margenResultante } from '@/lib/costos';

// GET /api/tenant/costos/sugeridos → bandeja de precios sugeridos pendientes
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const [config, pendientes] = await Promise.all([
      obtenerConfigCostos(empresaId),
      prisma.precioSugerido.findMany({
        where: { empresaId, estado: 'PENDIENTE', producto: { activo: true } },
        include: {
          producto: {
            select: { id: true, codigo: true, nombre: true, categoria: true, precioVenta: true, proveedor: { select: { nombre: true } } },
          },
          importacion: { select: { id: true, archivoNombre: true, proveedor: { select: { nombre: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);
    const margenMinimo = config.margenMinimo.toNumber();

    return NextResponse.json({
      margenMinimo,
      modoPrecio: config.modoPrecio,
      items: pendientes.map((s) => {
        const sugerido = s.precioSugerido.toNumber();
        const actual = s.producto.precioVenta.toNumber();
        const real = s.costoReal.toNumber();
        const recargo = margenResultante(sugerido, real);
        return {
          id: s.id,
          producto: { id: s.producto.id, codigo: s.producto.codigo, nombre: s.producto.nombre, categoria: s.producto.categoria, proveedor: s.producto.proveedor?.nombre ?? null },
          precioActual: actual,
          precioSugerido: sugerido,
          costoReal: real,
          variacionPct: actual > 0 ? Math.round(((sugerido - actual) / actual) * 10000) / 100 : null,
          recargoActual: margenResultante(actual, real),
          recargoSugerido: recargo,
          bajoMinimo: recargo !== null && recargo < margenMinimo,
          margenAplicado: s.margenAplicado.toNumber(),
          nivelMargen: s.nivelMargen,
          origen: s.origen,
          importacion: s.importacion ? { id: s.importacion.id, archivo: s.importacion.archivoNombre, proveedor: s.importacion.proveedor.nombre } : null,
          createdAt: s.createdAt,
        };
      }),
    });
  });
}
