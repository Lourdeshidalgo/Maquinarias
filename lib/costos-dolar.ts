import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  costoReal, costoVigenteDesdeLista, cotizacionPara, margenResultante, precioDeVenta, resolverMargen, type DatosListaManual,
} from '@/lib/costos';
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
  dolarDe: (proveedorId: string) => number | null,
  baseOverride?: string // descuento base a usar en vez del guardado (vista previa de un cambio)
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
      bonificacionesBase: baseOverride ?? v.proveedor.bonificacionesBase, incluyeIva: v.incluyeIva,
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
  const { filas } = esVigente ? await calcularCambioCotizacion(empresaId, valor, proveedorId) : { filas: [] as CambioDolar[] };
  const detalle = `Dólar ${proveedor ? proveedor.nombre : 'general'} ${vigenteAntes ? n(vigenteAntes.valor) : '—'} → ${valor}`;

  return prisma.$transaction(
    async (tx) => {
      const cotizacion = await tx.cotizacion.create({ data: { empresaId, moneda: 'USD', valor, fecha, fuente, usuarioId, proveedorId } });
      if (!esVigente) return { cotizacion, vigente: false, costosActualizados: 0, actualizados: 0, sugeridos: 0, modo: null };
      // Cambio de dólar: el precio de venta se actualiza directo (ya se vio la vista previa).
      const r = await aplicarFilas(tx, empresaId, filas, 'AUTOMATICO', usuarioId, 'COTIZACION', detalle);
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
  const { filas } = await calcularCambioDescuentoBase(empresaId, proveedorId);
  return prisma.$transaction((tx) => aplicarFilas(tx, empresaId, filas, 'AUTOMATICO', usuarioId, 'MANUAL', detalle), { timeout: 60_000 });
}

/** Cómo quedarían los productos del proveedor con este descuento base (sin nuevaBase: con el guardado). */
export async function calcularCambioDescuentoBase(empresaId: string, proveedorId: string, nuevaBase?: string) {
  const cotizaciones = await cargarCotizaciones(empresaId);
  return calcularFilas(empresaId, { proveedorId }, () => cotizacionPara(cotizaciones, proveedorId), nuevaBase);
}

/**
 * Precio de lista en USD cargado a mano (Stock o edición rápida): el vínculo con el
 * proveedor asignado pasa a USD con esos datos, y el costo y el precio de venta del
 * producto se recalculan y se aplican en el momento, con historial.
 */
export async function fijarListaUsdProducto(
  empresaId: string,
  productoId: string,
  datos: DatosListaManual,
  usuarioId: string | null
) {
  const vinculo = await prisma.proveedorProducto.findFirst({
    where: { empresaId, productoId, preferido: true },
    include: { proveedor: { select: { nombre: true } } },
  });
  if (!vinculo) throw new Error('Elegí un proveedor para cargar el costo en dólares.');
  const cotizaciones = await cargarCotizaciones(empresaId);
  if (cotizacionPara(cotizaciones, vinculo.proveedorId) === null) {
    throw new Error(`No hay dólar cargado para ${vinculo.proveedor.nombre} ni dólar general. Cargalo en "Dólar por proveedor".`);
  }
  await prisma.proveedorProducto.update({
    where: { id: vinculo.id },
    data: {
      moneda: 'USD', costoLista: datos.costoLista, incluyeIva: datos.incluyeIva, bonificaciones: datos.bonificaciones,
      costoActualizadoAt: new Date(), activo: true,
    },
  });
  const { filas } = await calcularFilas(empresaId, { productoId }, () => cotizacionPara(cotizaciones, vinculo.proveedorId));
  const detalle = `Precio USD a mano: US$ ${datos.costoLista}`;
  const r = await prisma.$transaction(
    async (tx) => {
      const res = await aplicarFilas(tx, empresaId, filas, 'AUTOMATICO', usuarioId, 'MANUAL', detalle);
      if (filas.length) await tx.producto.update({ where: { id: productoId }, data: { costoActualizadoAt: new Date() } });
      return res;
    },
    { timeout: 60_000 }
  );
  return { ...r, costoNuevo: filas[0]?.costoNuevo ?? null, precioNuevo: filas[0]?.precioNuevo ?? null };
}

/** Vista en vivo del formulario de Stock: costo y precio que quedarían con este precio USD (no guarda nada). */
export async function simularListaUsd(
  empresaId: string,
  proveedorId: string,
  datos: DatosListaManual,
  producto: { ivaPorcentaje: number; costoEnvio: number; costoPackaging: number; categoria: string; margenPorcentaje: number | null }
) {
  const [config, reglas, cotizaciones, proveedor] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    cargarCotizaciones(empresaId),
    prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { bonificacionesBase: true } }),
  ]);
  if (!proveedor) throw new Error('Proveedor no encontrado.');
  const cotizacion = cotizacionPara(cotizaciones, proveedorId);
  const costo = costoVigenteDesdeLista({
    costoLista: datos.costoLista, moneda: 'USD', bonificaciones: datos.bonificaciones, bonificacionesBase: proveedor.bonificacionesBase,
    incluyeIva: datos.incluyeIva, ivaPorcentaje: producto.ivaPorcentaje, ivaEnCosto: config.ivaEnCosto, cotizacion,
  });
  if (costo === null) return { cotizacion, costo: null, precio: null };
  const real = costoReal({ precioCosto: costo, costoEnvio: producto.costoEnvio, costoPackaging: producto.costoPackaging });
  const { margen } = resolverMargen({ ...producto, proveedorId }, reglas);
  return { cotizacion, costo, precio: precioDeVenta(real, margen, config.redondeo) };
}

/** Guarda costo nuevo + historial y aplica o sugiere el precio de venta de las filas que cambian. */
async function aplicarFilas(
  tx: Prisma.TransactionClient,
  empresaId: string,
  filas: CambioDolar[],
  modo: 'AUTOMATICO' | 'APROBACION',
  usuarioId: string | null,
  origen: 'COTIZACION' | 'MANUAL',
  detalle: string
) {
  const automatico = modo === 'AUTOMATICO';
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
