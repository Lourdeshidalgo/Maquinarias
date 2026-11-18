import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { costoReal, costoVigenteDesdeLista, cotizacionPara, margenResultante, precioDeVenta, resolverMargen } from '@/lib/costos';
import { cargarCotizaciones, cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
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
  moneda: string;
  costoAnterior: number;
  costoNuevo: number;
  proveedorProductoId: string;
  proveedorId: string;
};

/**
 * Productos en USD que cambian con esta cotización y cómo quedarían.
 * Con proveedorId: solo los de ese proveedor. Sin proveedorId (dólar general):
 * solo los de proveedores que no tienen dólar propio.
 */
export async function calcularCambioCotizacion(empresaId: string, cotizacion: number, proveedorId: string | null) {
  const cotizaciones = await cargarCotizaciones(empresaId);
  const filtroProveedor = proveedorId
    ? { proveedorId }
    : { proveedorId: { notIn: Array.from(cotizaciones.porProveedor.keys()) } };
  return calcularFilas(empresaId, { moneda: 'USD', ...filtroProveedor }, () => cotizacion);
}

/**
 * Costo y precio que les tocan a los productos (proveedor preferido) que cumplen
 * `filtro`, recalculados desde su lista con el dólar que devuelve `dolarDe`.
 */
async function calcularFilas(
  empresaId: string,
  filtro: Prisma.ProveedorProductoWhereInput,
  dolarDe: (proveedorId: string) => number | null
) {
  const [config, reglas, vinculos] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    prisma.proveedorProducto.findMany({
      where: { empresaId, preferido: true, activo: true, producto: { activo: true }, ...filtro },
      include: {
        proveedor: { select: { bonificacionesBase: true } },
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
      costoLista: n(v.costoLista), moneda: v.moneda, bonificaciones: v.bonificaciones,
      bonificacionesBase: v.proveedor.bonificacionesBase, incluyeIva: v.incluyeIva,
      ivaPorcentaje: n(p.ivaPorcentaje), ivaEnCosto: config.ivaEnCosto, cotizacion: dolarDe(v.proveedorId),
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
      costoLista: n(v.costoLista), moneda: v.moneda, costoAnterior: n(p.precioCosto), costoNuevo,
      proveedorProductoId: v.id, proveedorId: v.proveedorId,
    });
  }
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { filas, modoPrecio: config.modoPrecio, margenMinimo };
}

/**
 * Cotización vigente: la de fecha más reciente (a igual fecha, la última cargada).
 * proveedorId null = dólar general; si no, el dólar propio de ese proveedor (null si nunca se cargó).
 */
export async function cotizacionVigenteRegistro(
  empresaId: string,
  proveedorId: string | null,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  return db.cotizacion.findFirst({
    where: { empresaId, moneda: 'USD', proveedorId },
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
  proveedorId: string | null,
  fuente: 'MANUAL' | 'API' = 'MANUAL'
) {
  const [vigenteAntes, proveedor] = await Promise.all([
    cotizacionVigenteRegistro(empresaId, proveedorId),
    proveedorId ? prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { nombre: true } }) : null,
  ]);
  if (proveedorId && !proveedor) throw new Error('Proveedor no encontrado.');
  const esVigente = !vigenteAntes || fecha.getTime() >= vigenteAntes.fecha.getTime();
  const { filas, modoPrecio } = esVigente
    ? await calcularCambioCotizacion(empresaId, valor, proveedorId)
    : { filas: [] as CambioDolar[], modoPrecio: 'APROBACION' };
  const detalle = `Dólar ${proveedor ? proveedor.nombre : 'general'} ${vigenteAntes ? n(vigenteAntes.valor) : '—'} → ${valor}`;

  return prisma.$transaction(
    async (tx) => {
      const cotizacion = await tx.cotizacion.create({ data: { empresaId, moneda: 'USD', valor, fecha, fuente, usuarioId, proveedorId } });
      if (!esVigente) return { cotizacion, vigente: false, costosActualizados: 0, actualizados: 0, sugeridos: 0, modo: null };
      const r = await aplicarFilas(tx, empresaId, filas, modoPrecio, usuarioId, 'COTIZACION', detalle);
      return { cotizacion, vigente: true, ...r };
    },
    { timeout: 60_000 }
  );
}

/**
 * Cambió el descuento base de un proveedor: recalcula el costo de sus productos
 * (los que no tienen descuento propio cambian; el resto queda igual) con el dólar
 * que le toca, y sus precios de venta (automático o a la bandeja).
 */
export async function recalcularPorDescuentoBase(
  empresaId: string,
  proveedorId: string,
  usuarioId: string | null,
  detalle: string
) {
  const cotizaciones = await cargarCotizaciones(empresaId);
  const { filas, modoPrecio } = await calcularFilas(empresaId, { proveedorId }, () => cotizacionPara(cotizaciones, proveedorId));
  return prisma.$transaction((tx) => aplicarFilas(tx, empresaId, filas, modoPrecio, usuarioId, 'MANUAL', detalle), { timeout: 60_000 });
}

/** Guarda costo nuevo + historial y aplica o sugiere el precio de venta de las filas que cambian. */
async function aplicarFilas(
  tx: Prisma.TransactionClient,
  empresaId: string,
  filas: CambioDolar[],
  modoPrecio: string,
  usuarioId: string | null,
  origen: 'COTIZACION' | 'MANUAL',
  detalle: string
) {
  const automatico = modoPrecio === 'AUTOMATICO';
  const cambianCosto = filas.filter((f) => Math.abs(f.costoNuevo - f.costoAnterior) > 0.001);
  const cambianPrecio = cambianCosto.filter((f) => Math.abs(f.precioNuevo - f.precioActual) > 0.001);
  const loteId = randomUUID();

  await actualizarEnLote(
    tx, 'Producto', { precioCosto: 'numeric' },
    cambianCosto.map((f) => ({ id: f.productoId, precioCosto: f.costoNuevo })),
    { extra: '"updatedAt" = NOW()', empresaId }
  );
  if (cambianCosto.length) {
    await tx.historialCosto.createMany({
      data: cambianCosto.map((f) => ({
        empresaId, productoId: f.productoId, proveedorProductoId: f.proveedorProductoId, proveedorId: f.proveedorId,
        origen, afectaVigente: true, costoListaAnterior: f.costoLista, costoListaNuevo: f.costoLista, moneda: f.moneda,
        costoAnterior: f.costoAnterior, costoNuevo: f.costoNuevo, precioVentaAnterior: f.precioActual,
        // Automático: el precio nuevo. Con aprobación: null si quedó sugerido, el mismo si no cambia.
        precioVentaNuevo: Math.abs(f.precioNuevo - f.precioActual) > 0.001 ? (automatico ? f.precioNuevo : null) : f.precioActual,
        loteId, usuarioId, detalle,
      })),
    });
  }
  const precios = await aplicarPrecios(empresaId, cambianPrecio, origen, usuarioId, tx, automatico ? 'AUTOMATICO' : 'APROBACION');
  return { costosActualizados: cambianCosto.length, ...precios };
}
