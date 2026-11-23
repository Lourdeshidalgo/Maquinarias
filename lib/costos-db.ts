import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { bonificacionesEfectivas, normalizarCategoria, type CotizacionesVigentes, type ReglasMargen } from '@/lib/costos';

// Helpers de base de datos del módulo de costos. Todos filtran por empresaId.
// Aceptan un cliente de transacción para poder usarse dentro de $transaction.

type Db = PrismaClient | Prisma.TransactionClient;

/** Configuración del módulo (la crea con valores por defecto si no existe). */
export async function obtenerConfigCostos(empresaId: string, db: Db = prisma) {
  return db.configuracionCostos.upsert({
    where: { empresaId },
    update: {},
    create: { empresaId },
  });
}

/** Reglas de recargo de la empresa, listas para resolverMargen(). */
export async function cargarReglasMargen(empresaId: string, db: Db = prisma): Promise<ReglasMargen> {
  const [config, reglas] = await Promise.all([
    obtenerConfigCostos(empresaId, db),
    db.reglaMargen.findMany({ where: { empresaId } }),
  ]);
  const porCategoria = new Map<string, number>();
  const porProveedor = new Map<string, number>();
  for (const r of reglas) {
    if (r.tipo === 'CATEGORIA' && r.categoria) porCategoria.set(normalizarCategoria(r.categoria), r.margen.toNumber());
    if (r.tipo === 'PROVEEDOR' && r.proveedorId) porProveedor.set(r.proveedorId, r.margen.toNumber());
  }
  return { margenGeneral: config.margenGeneral.toNumber(), porCategoria, porProveedor };
}

/** Cotización vigente (la más reciente) o null si nunca se cargó. */
export async function cotizacionVigente(empresaId: string, moneda = 'USD', db: Db = prisma) {
  const c = await db.cotizacion.findFirst({
    where: { empresaId, moneda },
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
  });
  return c ? c.valor.toNumber() : null;
}

/**
 * Dólar vigente general y el propio de cada proveedor que tenga uno cargado.
 * Usar con cotizacionPara(c, proveedorId) para saber qué dólar toma un proveedor.
 */
export async function cargarCotizaciones(empresaId: string, db: Db = prisma, moneda = 'USD'): Promise<CotizacionesVigentes> {
  const ultimas = await db.cotizacion.findMany({
    where: { empresaId, moneda },
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    distinct: ['proveedorId'],
    select: { proveedorId: true, valor: true },
  });
  const porProveedor = new Map<string, number>();
  let general: number | null = null;
  for (const c of ultimas) {
    if (c.proveedorId) porProveedor.set(c.proveedorId, c.valor.toNumber());
    else general = c.valor.toNumber();
  }
  return { general, porProveedor };
}

/**
 * Al activar el módulo en una empresa: crea su configuración y pasa el
 * proveedor actual de cada producto (Producto.proveedorId) a ProveedorProducto
 * como preferido, con el costo vigente como costo de lista en pesos.
 * Es idempotente: si ya existe el vínculo, no lo toca.
 */
export async function activarModuloCostos(empresaId: string) {
  await obtenerConfigCostos(empresaId);

  const productos = await prisma.producto.findMany({
    where: { empresaId, proveedorId: { not: null } },
    select: { id: true, proveedorId: true, precioCosto: true, costoActualizadoAt: true },
  });
  if (productos.length === 0) return { migrados: 0 };

  const { count } = await prisma.proveedorProducto.createMany({
    data: productos.map((p) => ({
      empresaId,
      proveedorId: p.proveedorId as string,
      productoId: p.id,
      costoLista: p.precioCosto,
      moneda: 'ARS',
      incluyeIva: true,
      preferido: true,
      costoActualizadoAt: p.costoActualizadoAt,
    })),
    skipDuplicates: true,
  });
  return { migrados: count };
}

/**
 * Deja a `proveedorId` como proveedor preferido del producto (o ninguno si es
 * null) y mantiene Producto.proveedorId sincronizado. Si el vínculo no existía,
 * lo crea con el costo vigente en pesos.
 */
export async function sincronizarProveedorPreferido(
  db: Db,
  empresaId: string,
  productoId: string,
  proveedorId: string | null
) {
  await db.proveedorProducto.updateMany({
    where: { empresaId, productoId, preferido: true, ...(proveedorId ? { NOT: { proveedorId } } : {}) },
    data: { preferido: false },
  });
  if (!proveedorId) return;

  const producto = await db.producto.findFirst({
    where: { id: productoId, empresaId },
    select: { precioCosto: true, costoActualizadoAt: true },
  });
  if (!producto) return;

  await db.proveedorProducto.upsert({
    where: { proveedorId_productoId: { proveedorId, productoId } },
    update: { preferido: true, activo: true },
    create: {
      empresaId,
      proveedorId,
      productoId,
      costoLista: producto.precioCosto,
      moneda: 'ARS',
      incluyeIva: true,
      preferido: true,
      costoActualizadoAt: producto.costoActualizadoAt,
    },
  });
}

/**
 * Registra un cambio manual del costo vigente (desde Stock): historial con
 * origen MANUAL y, si el proveedor preferido cotiza en pesos sin bonificación,
 * su costo de lista pasa a ser el nuevo costo (así la próxima lista compara
 * contra el valor real). Si el preferido está en USD no se toca: ese costo se
 * actualiza desde la lista o el comparador.
 */
export async function registrarCambioCostoManual(
  db: Db,
  params: {
    empresaId: string;
    productoId: string;
    costoAnterior: number;
    costoNuevo: number;
    precioVentaAnterior?: number | null;
    precioVentaNuevo?: number | null;
    usuarioId?: string | null;
    origen?: 'MANUAL' | 'MASIVO';
    loteId?: string | null;
  }
) {
  const preferido = await db.proveedorProducto.findFirst({
    where: { empresaId: params.empresaId, productoId: params.productoId, preferido: true },
    include: { proveedor: { select: { bonificacionesBase: true } } },
  });

  const actualizaLista =
    !!preferido && preferido.moneda === 'ARS' && !bonificacionesEfectivas(preferido.bonificaciones, preferido.proveedor.bonificacionesBase);
  if (preferido && actualizaLista) {
    await db.proveedorProducto.update({
      where: { id: preferido.id },
      data: { costoLista: params.costoNuevo, incluyeIva: true, costoActualizadoAt: new Date() },
    });
  }

  await db.historialCosto.create({
    data: {
      empresaId: params.empresaId,
      productoId: params.productoId,
      proveedorProductoId: preferido?.id ?? null,
      proveedorId: preferido?.proveedorId ?? null,
      origen: params.origen ?? 'MANUAL',
      afectaVigente: true,
      costoListaAnterior: actualizaLista ? preferido!.costoLista : null,
      costoListaNuevo: actualizaLista ? params.costoNuevo : null,
      moneda: actualizaLista ? 'ARS' : null,
      costoAnterior: params.costoAnterior,
      costoNuevo: params.costoNuevo,
      precioVentaAnterior: params.precioVentaAnterior ?? null,
      precioVentaNuevo: params.precioVentaNuevo ?? null,
      usuarioId: params.usuarioId ?? null,
      loteId: params.loteId ?? null,
    },
  });
}
