import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { costoReal, costoVigenteDesdeLista, margenResultante, precioDeVenta, resolverMargen } from '@/lib/costos';
import { cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
import { aplicarPrecios, type PrecioCalculado } from '@/lib/costos-precios';
import { actualizarEnLote } from '@/lib/listas/sql';

// Cotización del dólar. Hoy se carga a mano; para traerla de una API alcanza
// con implementar un ProveedorCotizacion y guardar con fuente 'API' usando
// registrarCotizacion(): el recálculo es el mismo.
export type ProveedorCotizacion = {
  nombre: string;
  obtener: () => Promise<{ valor: number; fecha: Date }>;
};

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

export type CambioDolar = PrecioCalculado & {
  costoLista: number;
  costoAnterior: number;
  costoNuevo: number;
  proveedorProductoId: string;
  proveedorId: string;
};

/** Productos cuyo proveedor preferido cotiza en USD y cómo quedarían con la cotización dada. */
export async function calcularCambioCotizacion(empresaId: string, cotizacion: number) {
  const [config, reglas, vinculos] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    prisma.proveedorProducto.findMany({
      where: { empresaId, preferido: true, activo: true, moneda: 'USD', producto: { activo: true } },
      include: {
        producto: {
          select: {
            id: true, codigo: true, nombre: true, categoria: true, proveedorId: true, margenPorcentaje: true,
            precioCosto: true, costoEnvio: true, costoPackaging: true, precioVenta: true, ivaPorcentaje: true,
          },
        },
      },
    }),
  ]);
  const margenMinimo = n(config.margenMinimo);

  const filas: CambioDolar[] = [];
  for (const v of vinculos) {
    const p = v.producto;
    const costoNuevo = costoVigenteDesdeLista({
      costoLista: n(v.costoLista), moneda: 'USD', bonificaciones: v.bonificaciones, incluyeIva: v.incluyeIva,
      ivaPorcentaje: n(p.ivaPorcentaje), ivaEnCosto: config.ivaEnCosto, cotizacion,
    });
    if (costoNuevo === null) continue;
    const real = costoReal({ precioCosto: costoNuevo, costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging) });
    const { margen, nivel } = resolverMargen(
      { margenPorcentaje: p.margenPorcentaje ? n(p.margenPorcentaje) : null, categoria: p.categoria, proveedorId: p.proveedorId },
      reglas
    );
    const precioNuevo = precioDeVenta(real, margen, config.redondeo);
    const recargoNuevo = margenResultante(precioNuevo, real);
    filas.push({
      productoId: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, costoReal: real,
      precioActual: n(p.precioVenta), precioNuevo, margen, nivel,
      recargoActual: margenResultante(n(p.precioVenta), real), recargoNuevo,
      bajoMinimo: recargoNuevo !== null && recargoNuevo < margenMinimo,
      costoLista: n(v.costoLista), costoAnterior: n(p.precioCosto), costoNuevo,
      proveedorProductoId: v.id, proveedorId: v.proveedorId,
    });
  }
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { filas, modoPrecio: config.modoPrecio, margenMinimo };
}

/** Cotización vigente: la de fecha más reciente (a igual fecha, la última cargada). */
export async function cotizacionVigenteRegistro(empresaId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.cotizacion.findFirst({
    where: { empresaId, moneda: 'USD' },
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Guarda una cotización. Si queda como vigente, recalcula el costo en pesos de
 * los productos en USD (con historial) y sus precios de venta (o los sugiere).
 */
export async function registrarCotizacion(
  empresaId: string,
  valor: number,
  fecha: Date,
  usuarioId: string | null,
  fuente: 'MANUAL' | 'API' = 'MANUAL'
) {
  const vigenteAntes = await cotizacionVigenteRegistro(empresaId);
  const esVigente = !vigenteAntes || fecha.getTime() >= vigenteAntes.fecha.getTime();
  const { filas, modoPrecio } = esVigente
    ? await calcularCambioCotizacion(empresaId, valor)
    : { filas: [] as CambioDolar[], modoPrecio: 'APROBACION' };
  const automatico = modoPrecio === 'AUTOMATICO';
  const cambianCosto = filas.filter((f) => Math.abs(f.costoNuevo - f.costoAnterior) > 0.001);
  const cambianPrecio = cambianCosto.filter((f) => Math.abs(f.precioNuevo - f.precioActual) > 0.001);
  const loteId = randomUUID();

  return prisma.$transaction(
    async (tx) => {
      const cotizacion = await tx.cotizacion.create({ data: { empresaId, moneda: 'USD', valor, fecha, fuente, usuarioId } });
      if (!esVigente) return { cotizacion, vigente: false, costosActualizados: 0, actualizados: 0, sugeridos: 0, modo: null };

      await actualizarEnLote(
        tx, 'Producto', { precioCosto: 'numeric' },
        cambianCosto.map((f) => ({ id: f.productoId, precioCosto: f.costoNuevo })),
        { extra: '"updatedAt" = NOW()', empresaId }
      );
      if (cambianCosto.length) {
        await tx.historialCosto.createMany({
          data: cambianCosto.map((f) => ({
            empresaId, productoId: f.productoId, proveedorProductoId: f.proveedorProductoId, proveedorId: f.proveedorId,
            origen: 'COTIZACION', afectaVigente: true, costoListaAnterior: f.costoLista, costoListaNuevo: f.costoLista, moneda: 'USD',
            costoAnterior: f.costoAnterior, costoNuevo: f.costoNuevo, precioVentaAnterior: f.precioActual,
            // Automático: el precio nuevo. Con aprobación: null si quedó sugerido, el mismo si no cambia.
            precioVentaNuevo: Math.abs(f.precioNuevo - f.precioActual) > 0.001 ? (automatico ? f.precioNuevo : null) : f.precioActual,
            loteId, usuarioId,
            detalle: `Dólar ${vigenteAntes ? n(vigenteAntes.valor) : '—'} → ${valor}`,
          })),
        });
      }
      const precios = await aplicarPrecios(empresaId, cambianPrecio, 'COTIZACION', usuarioId, tx, automatico ? 'AUTOMATICO' : 'APROBACION');
      return { cotizacion, vigente: true, costosActualizados: cambianCosto.length, ...precios };
    },
    { timeout: 60_000 }
  );
}
