import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { costoReal, margenResultante, precioDeVenta, resolverMargen, type NivelMargen } from '@/lib/costos';
import { cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
import { actualizarEnLote } from '@/lib/listas/sql';

// Recálculo de precios de venta según las reglas de recargo. Lo usan el
// cambio de reglas, la cotización del dólar y los ajustes masivos. Nunca
// cambia precios en silencio: en modo AUTOMATICO los actualiza y en modo
// APROBACION deja precios sugeridos en la bandeja.

export type PrecioCalculado = {
  productoId: string;
  codigo: string;
  nombre: string;
  categoria: string;
  costoReal: number;
  precioActual: number;
  precioNuevo: number;
  margen: number;
  nivel: NivelMargen;
  recargoActual: number | null;
  recargoNuevo: number | null;
  bajoMinimo: boolean;
};

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

/** Calcula el precio que corresponde a cada producto del filtro. Solo devuelve los que cambian. */
export async function calcularPrecios(
  empresaId: string,
  where: Prisma.ProductoWhereInput,
  // costos: costo vigente a usar en vez del guardado (para vistas previas de cambios de costo)
  opciones: { incluirSinCambio?: boolean; costos?: Map<string, number> } = {}
): Promise<{ filas: PrecioCalculado[]; margenMinimo: number; modoPrecio: string }> {
  const [config, reglas, productos] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    prisma.producto.findMany({
      where: { ...where, empresaId, activo: true },
      select: {
        id: true, codigo: true, nombre: true, categoria: true, proveedorId: true, margenPorcentaje: true,
        precioCosto: true, costoEnvio: true, costoPackaging: true, precioVenta: true,
      },
      orderBy: { nombre: 'asc' },
    }),
  ]);
  const margenMinimo = n(config.margenMinimo);

  const filas: PrecioCalculado[] = [];
  for (const p of productos) {
    const costo = opciones.costos?.get(p.id) ?? n(p.precioCosto);
    const real = costoReal({ precioCosto: costo, costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging) });
    if (real <= 0) continue; // sin costo cargado no hay precio que calcular
    const { margen, nivel } = resolverMargen(
      { margenPorcentaje: p.margenPorcentaje ? n(p.margenPorcentaje) : null, categoria: p.categoria, proveedorId: p.proveedorId },
      reglas
    );
    const precioNuevo = precioDeVenta(real, margen, config.redondeo);
    const precioActual = n(p.precioVenta);
    if (!opciones.incluirSinCambio && Math.abs(precioNuevo - precioActual) < 0.005) continue;
    const recargoNuevo = margenResultante(precioNuevo, real);
    filas.push({
      productoId: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, costoReal: real,
      precioActual, precioNuevo, margen, nivel,
      recargoActual: margenResultante(precioActual, real),
      recargoNuevo,
      bajoMinimo: recargoNuevo !== null && recargoNuevo < margenMinimo,
    });
  }
  return { filas, margenMinimo, modoPrecio: config.modoPrecio };
}

/**
 * Aplica precios calculados según el modo de la empresa (o el forzado):
 * AUTOMATICO → actualiza Producto.precioVenta; APROBACION → bandeja.
 */
export async function aplicarPrecios(
  empresaId: string,
  filas: PrecioCalculado[],
  origen: 'MANUAL' | 'MASIVO' | 'COTIZACION' | 'REGLAS',
  usuarioId: string | null,
  db: Prisma.TransactionClient | typeof prisma = prisma,
  modoForzado?: 'AUTOMATICO' | 'APROBACION'
): Promise<{ modo: string; actualizados: number; sugeridos: number }> {
  if (!filas.length) return { modo: modoForzado ?? 'APROBACION', actualizados: 0, sugeridos: 0 };
  const modo = modoForzado ?? (await obtenerConfigCostos(empresaId, db)).modoPrecio;
  const ids = filas.map((f) => f.productoId);

  // Cualquier sugerencia pendiente de estos productos queda vieja.
  await db.precioSugerido.updateMany({
    where: { empresaId, productoId: { in: ids }, estado: 'PENDIENTE' },
    data: { estado: 'REEMPLAZADO', resueltoAt: new Date() },
  });

  if (modo === 'AUTOMATICO') {
    await actualizarEnLote(
      db, 'Producto', { precioVenta: 'numeric' },
      filas.map((f) => ({ id: f.productoId, precioVenta: f.precioNuevo })),
      { extra: '"updatedAt" = NOW()', empresaId }
    );
    return { modo, actualizados: filas.length, sugeridos: 0 };
  }

  await db.precioSugerido.createMany({
    data: filas.map((f) => ({
      empresaId, productoId: f.productoId, precioActual: f.precioActual, precioSugerido: f.precioNuevo,
      costoReal: f.costoReal, margenAplicado: f.margen, nivelMargen: f.nivel,
      origen, usuarioId,
    })),
  });
  return { modo, actualizados: 0, sugeridos: filas.length };
}

/** Filtro de productos para un recálculo: toda la empresa, una categoría, un proveedor o ids. */
export function alcanceRecalculo(alcance: { tipo: string; valor?: string; ids?: string[] }): Prisma.ProductoWhereInput | null {
  switch (alcance.tipo) {
    case 'TODOS':
      return {};
    case 'CATEGORIA':
      return alcance.valor ? { categoria: { equals: alcance.valor.trim(), mode: 'insensitive' } } : null;
    case 'PROVEEDOR':
      return alcance.valor ? { proveedorId: alcance.valor } : null;
    case 'PRODUCTOS':
      return alcance.ids?.length ? { id: { in: alcance.ids.slice(0, 5000) } } : null;
    default:
      return null;
  }
}
