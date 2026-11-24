import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  bonificacionesEfectivas,
  costoVigenteDesdeLista,
  cotizacionPara,
  costoReal,
  costoTalCual,
  precioDeVenta,
  resolverMargen,
  variacionPct,
  ventaTalCual,
  type ReglasMargen,
} from '@/lib/costos';
import { cargarCotizaciones, cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
import { buscarProducto, indicePorOem, requiereConfirmacion } from '@/lib/listas/match';
import { normalizarCodigo, similitud, tokens, type FilaLista, type MapeoLista } from '@/lib/listas/parseo';
import { actualizarEnLote } from '@/lib/listas/sql';

// Lógica de servidor de la importación de listas de precios:
//   1. matchearLote()        → recibe filas ya parseadas en el navegador, las cruza con el catálogo
//   2. finalizarImportacion() → faltantes, sugerencias por descripción y contadores
//   3. aplicarImportacion()   → aplica en una transacción, con historial y precios
//   4. deshacerImportacion()  → vuelve atrás la última importación aplicada del proveedor
// Todo filtra por empresaId.

export class ErrorImportacion extends Error {}

const num = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);
const UMBRAL_SUGERENCIA = 0.4;

async function importacionBorrador(empresaId: string, id: string) {
  const imp = await prisma.importacionLista.findFirst({ where: { id, empresaId } });
  if (!imp) throw new ErrorImportacion('Importación no encontrada.');
  if (imp.estado !== 'BORRADOR') throw new ErrorImportacion('Esta importación ya fue aplicada o descartada.');
  return imp;
}

function mapeoDe(imp: { mapeo: Prisma.JsonValue }): MapeoLista {
  const m = (imp.mapeo || {}) as Partial<MapeoLista>;
  return {
    filaInicio: m.filaInicio ?? 1,
    columnas: m.columnas ?? {},
    incluyeIva: m.incluyeIva ?? true,
    monedaDefault: m.monedaDefault ?? 'ARS',
    bonificacionGeneral: m.bonificacionGeneral,
    ivaProductosNuevos: m.ivaProductosNuevos ?? 21,
    marcarRepuestos: m.marcarRepuestos ?? false,
    talCual: m.talCual ?? false,
    hoja: m.hoja,
  };
}

/** Valor comparable de una lista: neto de bonificaciones e IVA, en su moneda o en pesos. */
function valorComparable(
  d: { precio: number; moneda: string; bonificaciones: string | null; incluyeIva: boolean; iva: number },
  enPesos: boolean,
  cotizacion: number | null,
  ivaEnCosto: boolean
) {
  return costoVigenteDesdeLista({
    costoLista: d.precio,
    moneda: enPesos ? d.moneda : 'ARS', // misma moneda: se compara sin convertir
    bonificaciones: d.bonificaciones,
    incluyeIva: d.incluyeIva,
    ivaPorcentaje: d.iva,
    ivaEnCosto,
    cotizacion,
  });
}

// ─── 1. Matching por lotes ───────────────────────────────────────────────────

export async function matchearLote(empresaId: string, importacionId: string, filas: FilaLista[]) {
  const imp = await importacionBorrador(empresaId, importacionId);
  const mapeo = mapeoDe(imp);
  const [config, cotizacion, bonificacionesBase] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cotizacionDelProveedor(empresaId, imp.proveedorId),
    bonificacionesBaseDe(empresaId, imp.proveedorId),
  ]);
  const ivaEnCosto = config.ivaEnCosto;
  const alertaSuba = num(config.alertaSubaPct);
  const alertaBaja = num(config.alertaBajaPct);

  const [yaCargados, vinculos, productos, alternativos] = await Promise.all([
    prisma.importacionItem.findMany({
      where: { importacionId, OR: [{ codigo: { not: null } }, { productoId: { not: null } }] },
      select: { codigo: true, productoId: true, fila: true },
    }),
    prisma.proveedorProducto.findMany({
      where: { empresaId, proveedorId: imp.proveedorId, activo: true, producto: { activo: true } },
      select: {
        id: true, productoId: true, codigoProveedor: true, costoLista: true, moneda: true,
        bonificaciones: true, incluyeIva: true,
        producto: { select: { ivaPorcentaje: true } },
      },
    }),
    prisma.producto.findMany({
      where: { empresaId, activo: true },
      select: { id: true, codigo: true, codigoFabricante: true, precioCosto: true, ivaPorcentaje: true },
    }),
    prisma.productoCodigo.findMany({
      where: { producto: { empresaId, activo: true } },
      select: { codigo: true, productoId: true },
    }),
  ]);

  const codigosUsados = new Set(yaCargados.filter((i) => i.codigo).map((i) => normalizarCodigo(i.codigo)));
  // Un producto lo puede tomar un solo renglón de la lista (con el cruce por N° de parte, dos
  // artículos del proveedor pueden tener el mismo OEM): el segundo queda como error.
  const filaPorProducto = new Map<string, number>();
  for (const i of yaCargados) if (i.productoId && !filaPorProducto.has(i.productoId)) filaPorProducto.set(i.productoId, i.fila);
  const vinculoPorCodigo = new Map<string, (typeof vinculos)[number]>();
  const vinculoPorProducto = new Map<string, (typeof vinculos)[number]>();
  for (const v of vinculos) {
    if (v.codigoProveedor) vinculoPorCodigo.set(normalizarCodigo(v.codigoProveedor), v);
    vinculoPorProducto.set(v.productoId, v);
  }
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const productoPorCodigo = new Map<string, string>();
  for (const p of productos) productoPorCodigo.set(normalizarCodigo(p.codigo), p.id);
  for (const a of alternativos) {
    const k = normalizarCodigo(a.codigo);
    if (!productoPorCodigo.has(k)) productoPorCodigo.set(k, a.productoId);
  }
  const indices = { vinculoPorCodigo, productoPorCodigo, productoPorOem: indicePorOem(productos) };

  const datos: Prisma.ImportacionItemCreateManyInput[] = [];

  for (const f of filas) {
    const base = {
      importacionId,
      empresaId,
      fila: f.fila,
      codigo: f.codigo?.slice(0, 120) || null,
      codigoFabricante: f.codigoFabricante?.slice(0, 120) || null,
      descripcion: f.descripcion?.slice(0, 500) || null,
      precio: f.precio,
      precioContado: f.precioContado ?? null,
      precioTarjeta: f.precioTarjeta ?? null,
      moneda: f.moneda,
      marca: f.marca?.slice(0, 120) || null,
      rubro: f.rubro?.slice(0, 120) || null,
      bonificaciones: f.bonificaciones?.slice(0, 40) || null,
    };
    const k = f.codigo ? normalizarCodigo(f.codigo) : '';

    if (f.precio === null || !(f.precio > 0)) {
      datos.push({ ...base, tipoMatch: 'NINGUNO', estado: 'ERROR', accion: 'IGNORAR', seleccionado: false, error: 'Precio vacío o inválido' });
      continue;
    }
    if (k && codigosUsados.has(k)) {
      datos.push({ ...base, tipoMatch: 'NINGUNO', estado: 'ERROR', accion: 'IGNORAR', seleccionado: false, error: 'Código repetido en la lista' });
      continue;
    }
    if (k) codigosUsados.add(k);

    // Orden de matching: código del proveedor ya vinculado → código interno / alternativo → N° de parte (OEM).
    const match = buscarProducto(f, indices);
    const { tipoMatch, productoId } = match;
    const vinculo = match.vinculo ?? (productoId ? vinculoPorProducto.get(productoId) : undefined);

    if (!productoId) {
      // Los nuevos entran al catálogo por defecto (si hay una sugerencia por descripción se destildan al finalizar).
      datos.push({ ...base, tipoMatch, estado: 'NUEVO', accion: 'CREAR', seleccionado: true });
      continue;
    }
    if (requiereConfirmacion(tipoMatch, !!vinculo)) {
      // Mismo código o N° de parte que un producto que este proveedor no tiene: se pregunta
      // "¿es el mismo producto o es otro?" (Vincular / Al catálogo). No se aplica solo.
      datos.push({ ...base, tipoMatch, estado: 'NUEVO', accion: 'CREAR', seleccionado: false, sugerenciaProductoId: productoId });
      continue;
    }
    const filaPrevia = filaPorProducto.get(productoId);
    if (filaPrevia !== undefined) {
      datos.push({
        ...base, tipoMatch: 'NINGUNO', estado: 'ERROR', accion: 'IGNORAR', seleccionado: false,
        error: `Otro renglón de la lista (fila ${filaPrevia}) ya corresponde a este producto`,
      });
      continue;
    }
    filaPorProducto.set(productoId, f.fila);

    const producto = productoPorId.get(productoId);
    const iva = num(producto?.ivaPorcentaje) || 21;
    const nuevo = {
      precio: f.precio, moneda: f.moneda, bonificaciones: bonificacionesEfectivas(base.bonificaciones, bonificacionesBase),
      incluyeIva: mapeo.incluyeIva, iva,
    };

    let variacion: number | null;
    if (vinculo) {
      const anterior = {
        precio: num(vinculo.costoLista), moneda: vinculo.moneda,
        bonificaciones: bonificacionesEfectivas(vinculo.bonificaciones, bonificacionesBase), incluyeIva: vinculo.incluyeIva, iva,
      };
      const mismaMoneda = anterior.moneda === nuevo.moneda;
      const a = valorComparable(anterior, !mismaMoneda, cotizacion, ivaEnCosto);
      const n = valorComparable(nuevo, !mismaMoneda, cotizacion, ivaEnCosto);
      variacion = a !== null && n !== null ? variacionPct(a, n) : null;
    } else {
      // Producto encontrado por código interno, sin vínculo con este proveedor:
      // se compara contra el costo vigente del producto.
      const n = valorComparable(nuevo, true, cotizacion, ivaEnCosto);
      variacion = n !== null ? variacionPct(num(producto?.precioCosto), n) : null;
    }

    const estado = variacion === null ? 'SUBA' : Math.abs(variacion) < 0.005 ? 'IGUAL' : variacion > 0 ? 'SUBA' : 'BAJA';
    const alerta = variacion !== null && (variacion > alertaSuba || variacion < -alertaBaja);

    datos.push({
      ...base,
      tipoMatch,
      productoId,
      proveedorProductoId: vinculo?.id ?? null,
      costoListaAnterior: vinculo ? vinculo.costoLista : null,
      variacionPct: variacion,
      estado,
      alerta,
      accion: 'APLICAR',
      seleccionado: true,
    });
  }

  if (datos.length) await prisma.importacionItem.createMany({ data: datos });
  await prisma.importacionLista.update({
    where: { id: importacionId },
    data: { totalFilas: { increment: filas.length } },
  });
  return { recibidas: filas.length };
}

// ─── 2. Faltantes, sugerencias y contadores ─────────────────────────────────

export async function recontar(importacionId: string) {
  const [porEstado, alertas, seleccionados] = await Promise.all([
    prisma.importacionItem.groupBy({ by: ['estado'], where: { importacionId }, _count: { _all: true } }),
    prisma.importacionItem.count({ where: { importacionId, alerta: true } }),
    prisma.importacionItem.count({ where: { importacionId, seleccionado: true, accion: { not: 'IGNORAR' } } }),
  ]);
  const c = (e: string) => porEstado.find((x) => x.estado === e)?._count._all ?? 0;
  await prisma.importacionLista.update({
    where: { id: importacionId },
    data: { subas: c('SUBA'), bajas: c('BAJA'), sinCambios: c('IGUAL'), nuevos: c('NUEVO'), faltantes: c('FALTANTE'), alertas },
  });
  return { subas: c('SUBA'), bajas: c('BAJA'), sinCambios: c('IGUAL'), nuevos: c('NUEVO'), faltantes: c('FALTANTE'), errores: c('ERROR'), alertas, seleccionados };
}

export async function finalizarImportacion(empresaId: string, importacionId: string) {
  const imp = await importacionBorrador(empresaId, importacionId);

  // Faltantes: productos vinculados a este proveedor que no vinieron en la lista.
  await prisma.importacionItem.deleteMany({ where: { importacionId, estado: 'FALTANTE' } });
  const presentes = await prisma.importacionItem.findMany({
    where: { importacionId, productoId: { not: null } },
    select: { productoId: true },
  });
  const productosPresentes = new Set(presentes.map((p) => p.productoId));
  const vinculos = await prisma.proveedorProducto.findMany({
    where: { empresaId, proveedorId: imp.proveedorId, activo: true, producto: { activo: true } },
    select: { id: true, productoId: true, codigoProveedor: true, costoLista: true, moneda: true, producto: { select: { nombre: true } } },
  });
  const faltantes = vinculos.filter((v) => !productosPresentes.has(v.productoId));
  if (faltantes.length) {
    await prisma.importacionItem.createMany({
      data: faltantes.map((v) => ({
        importacionId, empresaId, fila: 0, codigo: v.codigoProveedor, descripcion: v.producto.nombre,
        precio: null, moneda: v.moneda, tipoMatch: 'FALTANTE', productoId: v.productoId,
        proveedorProductoId: v.id, costoListaAnterior: v.costoLista, estado: 'FALTANTE',
        accion: 'IGNORAR', seleccionado: false,
      })),
    });
  }

  // Sugerencias por descripción para los nuevos (nunca se aplican solas).
  const nuevos = await prisma.importacionItem.findMany({
    // Los que ya tienen sugerencia (por código o N° de parte) no se pisan con una por descripción.
    where: { importacionId, estado: 'NUEVO', descripcion: { not: null }, sugerenciaProductoId: null },
    select: { id: true, descripcion: true },
  });
  if (nuevos.length) {
    const productos = await prisma.producto.findMany({
      where: { empresaId, activo: true },
      select: { id: true, nombre: true },
    });
    const tokensProducto = new Map(productos.map((p) => [p.id, tokens(p.nombre)]));
    const indice = new Map<string, string[]>();
    for (const [id, ts] of tokensProducto) for (const t of ts) indice.set(t, [...(indice.get(t) || []), id]);

    const sugerencias: { id: string; sugerenciaProductoId: string }[] = [];
    for (const item of nuevos) {
      const ti = tokens(item.descripcion);
      const candidatos = new Set<string>();
      for (const t of ti) {
        const ids = indice.get(t);
        if (ids && ids.length < 200) ids.forEach((id) => candidatos.add(id)); // palabras muy comunes no aportan
      }
      let mejor: { id: string; s: number } | null = null;
      for (const id of candidatos) {
        const s = similitud(ti, tokensProducto.get(id) || []);
        if (s >= UMBRAL_SUGERENCIA && (!mejor || s > mejor.s)) mejor = { id, s };
      }
      if (mejor) sugerencias.push({ id: item.id, sugerenciaProductoId: mejor.id });
    }
    // Con un producto parecido sugerido, no se crea solo: el usuario elige Vincular o Crear.
    await actualizarEnLote(
      prisma, 'ImportacionItem', { sugerenciaProductoId: 'text', seleccionado: 'boolean' },
      sugerencias.map((x) => ({ ...x, seleccionado: false })), { empresaId }
    );
  }

  return recontar(importacionId);
}

// ─── Vista previa: costo y precio resultantes de cada fila ──────────────────

type ContextoPrecios = {
  reglas: ReglasMargen;
  redondeo: number;
  margenMinimo: number;
  ivaEnCosto: boolean;
  cotizacion: number | null; // dólar del proveedor de la lista (el propio o, si no tiene, el general)
  bonificacionesBase: string; // descuento base del proveedor de la lista
  modoPrecio: string;
};

/** Dólar que toma un proveedor: el suyo si tiene, si no el general. */
async function cotizacionDelProveedor(empresaId: string, proveedorId: string | null) {
  return cotizacionPara(await cargarCotizaciones(empresaId), proveedorId);
}

async function bonificacionesBaseDe(empresaId: string, proveedorId: string | null) {
  if (!proveedorId) return '';
  const p = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { bonificacionesBase: true } });
  return p?.bonificacionesBase ?? '';
}

export async function contextoPrecios(empresaId: string, proveedorId: string | null): Promise<ContextoPrecios> {
  const [config, reglas, cotizacion, bonificacionesBase] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    cotizacionDelProveedor(empresaId, proveedorId),
    bonificacionesBaseDe(empresaId, proveedorId),
  ]);
  return {
    reglas,
    redondeo: config.redondeo,
    margenMinimo: num(config.margenMinimo),
    ivaEnCosto: config.ivaEnCosto,
    cotizacion,
    bonificacionesBase,
    modoPrecio: config.modoPrecio,
  };
}

/** Calcula costo vigente nuevo, precio nuevo y recargo para una fila de la lista. */
export function calcularFila(
  ctx: ContextoPrecios,
  fila: { precio: number; moneda: string; bonificaciones: string | null },
  incluyeIva: boolean,
  producto: {
    ivaPorcentaje: number;
    costoEnvio: number;
    costoPackaging: number;
    categoria: string | null;
    margenPorcentaje: number | null;
    proveedorId: string | null;
  },
  // Precios del Excel tal cual (ver MapeoLista.talCual): precioContado = el "Efectivo" de la fila.
  talCual?: { precioContado: number | null }
) {
  if (talCual) {
    // Costo = precio de la lista como viene (en dólares se pasa a pesos con la cotización).
    const costo = costoTalCual(fila.precio, fila.moneda, ctx.cotizacion);
    if (costo === null) return { costoNuevo: null, precioNuevo: null, margen: null, nivel: null, bajoMinimo: false };
    const real = costoReal({ precioCosto: costo, costoEnvio: producto.costoEnvio, costoPackaging: producto.costoPackaging });
    const { margen, nivel } = resolverMargen(producto, ctx.reglas);
    const venta = ventaTalCual(talCual.precioContado);
    const precioNuevo = venta ?? precioDeVenta(real, margen, ctx.redondeo);
    const recargo = real > 0 ? ((precioNuevo - real) / real) * 100 : null;
    return {
      costoNuevo: costo,
      precioNuevo,
      margen: recargo === null ? null : Math.round(recargo * 100) / 100,
      nivel: venta !== null ? null : nivel,
      bajoMinimo: false,
    };
  }
  const costoNuevo = costoVigenteDesdeLista({
    costoLista: fila.precio,
    moneda: fila.moneda,
    bonificaciones: fila.bonificaciones,
    bonificacionesBase: ctx.bonificacionesBase,
    incluyeIva,
    ivaPorcentaje: producto.ivaPorcentaje,
    ivaEnCosto: ctx.ivaEnCosto,
    cotizacion: ctx.cotizacion,
  });
  if (costoNuevo === null) return { costoNuevo: null, precioNuevo: null, margen: null, nivel: null, bajoMinimo: false };
  const real = costoReal({ precioCosto: costoNuevo, costoEnvio: producto.costoEnvio, costoPackaging: producto.costoPackaging });
  const { margen, nivel } = resolverMargen(producto, ctx.reglas);
  const precioNuevo = precioDeVenta(real, margen, ctx.redondeo);
  const recargo = real > 0 ? ((precioNuevo - real) / real) * 100 : null;
  return {
    costoNuevo,
    precioNuevo,
    margen: recargo === null ? null : Math.round(recargo * 100) / 100,
    nivel,
    bajoMinimo: recargo !== null && recargo < ctx.margenMinimo,
  };
}

// ─── 3. Aplicar ──────────────────────────────────────────────────────────────

const ESTADOS_APLICABLES = ['SUBA', 'BAJA', 'IGUAL', 'NUEVO'];

export async function aplicarImportacion(empresaId: string, importacionId: string, usuarioId: string | null) {
  const imp = await importacionBorrador(empresaId, importacionId);
  const mapeo = mapeoDe(imp);
  const ctx = await contextoPrecios(empresaId, imp.proveedorId);
  const fecha = imp.fechaVigencia;
  // Precios del Excel tal cual: el precio de venta se pone directo (no queda para aprobar).
  const automatico = ctx.modoPrecio === 'AUTOMATICO' || !!mapeo.talCual;
  const talCualDe = (i: { precioContado: { toNumber(): number } | null }) =>
    mapeo.talCual ? { precioContado: i.precioContado ? i.precioContado.toNumber() : null } : undefined;

  const items = await prisma.importacionItem.findMany({
    where: {
      importacionId,
      seleccionado: true,
      accion: { not: 'IGNORAR' },
      estado: { in: ESTADOS_APLICABLES },
    },
    orderBy: { fila: 'asc' },
  });
  const aAplicar = items.filter((i) => i.accion === 'CREAR' || i.productoId);
  if (!aAplicar.length) throw new ErrorImportacion('No hay filas seleccionadas para aplicar.');
  if (!ctx.cotizacion && aAplicar.some((i) => i.moneda === 'USD')) {
    throw new ErrorImportacion('La lista tiene precios en dólares y no hay cotización cargada para este proveedor. Cargá su dólar (o el general) antes de aplicar.');
  }

  const productoIds = Array.from(new Set(aAplicar.filter((i) => i.accion !== 'CREAR').map((i) => i.productoId as string)));
  const [productos, vinculosProveedor, preferidos, codigosEmpresa] = await Promise.all([
    prisma.producto.findMany({ where: { empresaId, id: { in: productoIds }, activo: true } }),
    prisma.proveedorProducto.findMany({ where: { empresaId, proveedorId: imp.proveedorId, productoId: { in: productoIds } } }),
    prisma.proveedorProducto.findMany({ where: { empresaId, productoId: { in: productoIds }, preferido: true }, select: { productoId: true } }),
    prisma.producto.findMany({ where: { empresaId }, select: { id: true, codigo: true, activo: true } }),
  ]);
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const vinculoPorProducto = new Map(vinculosProveedor.map((v) => [v.productoId, v]));
  const tienePreferido = new Set(preferidos.map((p) => p.productoId));
  const codigosOcupados = new Set(codigosEmpresa.map((c) => c.codigo.toUpperCase()));
  // Productos dados de baja con el mismo código (por ejemplo, al deshacer una
  // importación): se reactivan en vez de crear un duplicado.
  const inactivoPorCodigo = new Map(codigosEmpresa.filter((c) => !c.activo).map((c) => [c.codigo.toUpperCase(), c.id]));
  const reactivados = new Set<string>();
  const productosReactivar: Array<{ id: string; data: Prisma.ProductoUpdateManyMutationInput & { proveedorId: string } }> = [];

  const ppNuevos: Prisma.ProveedorProductoCreateManyInput[] = [];
  const ppActualizar: Array<Record<string, unknown> & { id: string }> = [];
  const productosNuevos: Prisma.ProductoCreateManyInput[] = [];
  const productosActualizar: Array<Record<string, unknown> & { id: string }> = [];
  // Productos existentes sin N° de parte: se completa con el de la lista. Deshacer no lo borra
  // (es completar un dato que faltaba, no cambia costos ni precios).
  const oemCompletar: Array<{ id: string; codigoFabricante: string }> = [];
  const historial: Prisma.HistorialCostoCreateManyInput[] = [];
  const sugeridos: Prisma.PrecioSugeridoCreateManyInput[] = [];
  const itemsActualizar: Array<Record<string, unknown> & { id: string }> = [];
  let preciosActualizados = 0;
  let creados = 0;

  const codigoLibre = (codigo: string | null) => {
    const base = (codigo || `PRV-${randomUUID().slice(0, 6)}`).toUpperCase().slice(0, 60);
    let c = base;
    for (let n = 2; codigosOcupados.has(c); n++) c = `${base}-${n}`;
    codigosOcupados.add(c);
    return c;
  };

  for (const item of aAplicar) {
    const precio = num(item.precio);
    const datosLista = {
      codigoProveedor: item.codigo,
      descripcionProveedor: item.descripcion,
      costoLista: precio,
      // Precios de venta de la lista (contado / tarjeta), para mostrarlos como en el Excel del proveedor
      precioContadoLista: item.precioContado ? item.precioContado.toNumber() : null,
      precioTarjetaLista: item.precioTarjeta ? item.precioTarjeta.toNumber() : null,
      moneda: item.moneda || 'ARS',
      bonificaciones: item.bonificaciones || '',
      incluyeIva: mapeo.incluyeIva,
      costoActualizadoAt: fecha,
      importacionId,
      activo: true,
    };

    // Producto nuevo desde la lista.
    if (item.accion === 'CREAR') {
      const codigoItem = item.codigo?.toUpperCase().slice(0, 60);
      const inactivo = codigoItem ? inactivoPorCodigo.get(codigoItem) : undefined;
      const reactivar = !!inactivo && !reactivados.has(inactivo);
      const id = reactivar ? (inactivo as string) : randomUUID();
      if (reactivar) reactivados.add(id);
      const prod = {
        ivaPorcentaje: mapeo.ivaProductosNuevos ?? 21, costoEnvio: 0, costoPackaging: 0,
        categoria: item.rubro, margenPorcentaje: null, proveedorId: imp.proveedorId,
      };
      const calc = calcularFila(ctx, { precio, moneda: datosLista.moneda, bonificaciones: item.bonificaciones }, mapeo.incluyeIva, prod, talCualDe(item));
      const nombre = (item.descripcion || item.codigo || 'Producto sin nombre').slice(0, 250);
      const oemItem = item.codigoFabricante?.slice(0, 120) || null;
      if (reactivar) {
        productosReactivar.push({
          id,
          data: {
            activo: true, soloCatalogo: true, nombre, precioCosto: calc.costoNuevo ?? 0, precioVenta: calc.precioNuevo ?? 0,
            costoActualizadoAt: fecha, proveedorId: imp.proveedorId,
            ...(oemItem ? { codigoFabricante: oemItem } : {}),
          },
        });
      } else {
        productosNuevos.push({
          // Entra al catálogo: no aparece en Stock ni se vende hasta "Agregar a Stock".
          id, empresaId, proveedorId: imp.proveedorId, codigo: codigoLibre(item.codigo), nombre, soloCatalogo: true,
          categoria: item.rubro || 'General', unidad: 'unidad',
          precioCosto: calc.costoNuevo ?? 0, precioVenta: calc.precioNuevo ?? 0,
          ivaPorcentaje: prod.ivaPorcentaje, stockActual: 0, stockMinimo: 0, costoActualizadoAt: fecha,
          codigoFabricante: oemItem,
        });
      }
      const ppId = randomUUID();
      ppNuevos.push({ id: ppId, empresaId, proveedorId: imp.proveedorId, productoId: id, preferido: true, ...datosLista });
      historial.push({
        empresaId, productoId: id, proveedorProductoId: ppId, proveedorId: imp.proveedorId, origen: 'IMPORTACION',
        costoListaNuevo: precio, moneda: datosLista.moneda, costoAnterior: 0, costoNuevo: calc.costoNuevo ?? 0,
        precioVentaNuevo: calc.precioNuevo ?? 0, importacionId, usuarioId, detalle: 'Producto creado desde la lista',
      });
      itemsActualizar.push({
        id: item.id, aplicado: true, productoCreadoId: id, productoId: id, proveedorProductoId: ppId,
        ppAnterior: null, productoAnterior: null,
      });
      creados++;
      continue;
    }

    const producto = productoPorId.get(item.productoId as string);
    if (!producto) continue; // dado de baja mientras tanto
    if (!producto.codigoFabricante && item.codigoFabricante) {
      oemCompletar.push({ id: producto.id, codigoFabricante: item.codigoFabricante.slice(0, 120) });
    }
    const vinculo = vinculoPorProducto.get(producto.id);
    const esPreferido = vinculo ? vinculo.preferido : !tienePreferido.has(producto.id);

    let ppId = vinculo?.id;
    if (vinculo) {
      ppActualizar.push({ id: vinculo.id, ...datosLista, preferido: vinculo.preferido });
    } else {
      ppId = randomUUID();
      ppNuevos.push({ id: ppId, empresaId, proveedorId: imp.proveedorId, productoId: producto.id, preferido: esPreferido, ...datosLista });
    }

    const ppAnterior = vinculo
      ? {
          costoLista: num(vinculo.costoLista), moneda: vinculo.moneda, bonificaciones: vinculo.bonificaciones,
          incluyeIva: vinculo.incluyeIva, costoActualizadoAt: vinculo.costoActualizadoAt, importacionId: vinculo.importacionId,
          codigoProveedor: vinculo.codigoProveedor, descripcionProveedor: vinculo.descripcionProveedor, preferido: vinculo.preferido,
        }
      : null;

    const costoAnterior = num(producto.precioCosto);
    const precioAnterior = num(producto.precioVenta);
    let costoNuevo = costoAnterior;
    let precioNuevo: number | null = precioAnterior;

    if (esPreferido) {
      const calc = calcularFila(ctx, { precio, moneda: datosLista.moneda, bonificaciones: item.bonificaciones }, mapeo.incluyeIva, {
        ivaPorcentaje: num(producto.ivaPorcentaje), costoEnvio: num(producto.costoEnvio), costoPackaging: num(producto.costoPackaging),
        categoria: producto.categoria, margenPorcentaje: producto.margenPorcentaje ? num(producto.margenPorcentaje) : null,
        proveedorId: imp.proveedorId,
      }, talCualDe(item));
      costoNuevo = calc.costoNuevo ?? costoAnterior;
      const cambiaCosto = Math.abs(costoNuevo - costoAnterior) > 0.001;
      const precioCalculado = calc.precioNuevo;
      // Tal cual: el precio de venta pasa a ser el de la lista aunque el costo no haya cambiado.
      const cambiaPrecio = (cambiaCosto || !!mapeo.talCual) && precioCalculado !== null && Math.abs(precioCalculado - precioAnterior) > 0.001;

      if (cambiaPrecio && automatico) {
        precioNuevo = precioCalculado;
        preciosActualizados++;
      } else if (cambiaPrecio) {
        precioNuevo = null; // queda como sugerido
        sugeridos.push({
          empresaId, productoId: producto.id, precioActual: precioAnterior, precioSugerido: precioCalculado as number,
          costoReal: costoReal({ precioCosto: costoNuevo, costoEnvio: num(producto.costoEnvio), costoPackaging: num(producto.costoPackaging) }),
          margenAplicado: resolverMargen(
            { margenPorcentaje: producto.margenPorcentaje ? num(producto.margenPorcentaje) : null, categoria: producto.categoria, proveedorId: imp.proveedorId },
            ctx.reglas
          ).margen,
          nivelMargen: calc.nivel || 'GENERAL', origen: 'IMPORTACION', importacionId, usuarioId,
        });
      }

      // La lista confirma el costo: la fecha se actualiza aunque el valor no cambie.
      productosActualizar.push({
        id: producto.id,
        precioCosto: costoNuevo,
        precioVenta: precioNuevo ?? precioAnterior,
        costoActualizadoAt: fecha,
        proveedorId: imp.proveedorId,
      });

      if (cambiaCosto || !vinculo || Math.abs((precioNuevo ?? precioAnterior) - precioAnterior) > 0.001) {
        historial.push({
          empresaId, productoId: producto.id, proveedorProductoId: ppId, proveedorId: imp.proveedorId, origen: 'IMPORTACION',
          afectaVigente: true, costoListaAnterior: ppAnterior?.costoLista ?? null, costoListaNuevo: precio, moneda: datosLista.moneda,
          costoAnterior, costoNuevo, precioVentaAnterior: precioAnterior, precioVentaNuevo: precioNuevo, importacionId, usuarioId,
        });
      }
    } else if (!ppAnterior || Math.abs(ppAnterior.costoLista - precio) > 0.001) {
      // Proveedor alternativo: cambia su costo de lista, el vigente no.
      historial.push({
        empresaId, productoId: producto.id, proveedorProductoId: ppId, proveedorId: imp.proveedorId, origen: 'IMPORTACION',
        afectaVigente: false, costoListaAnterior: ppAnterior?.costoLista ?? null, costoListaNuevo: precio, moneda: datosLista.moneda,
        costoAnterior, costoNuevo: costoAnterior, importacionId, usuarioId, detalle: 'Proveedor no preferido',
      });
    }

    itemsActualizar.push({
      id: item.id,
      aplicado: true,
      productoId: producto.id,
      productoCreadoId: null,
      proveedorProductoId: ppId,
      ppAnterior,
      productoAnterior: esPreferido
        ? {
            precioCosto: costoAnterior, precioVenta: precioAnterior, costoActualizadoAt: producto.costoActualizadoAt,
            proveedorId: producto.proveedorId, costoAplicado: costoNuevo, precioAplicado: precioNuevo ?? precioAnterior,
          }
        : null,
    });
  }

  // Un vínculo viejo (inactivo o de un producto dado de baja) puede tener el
  // mismo código del proveedor: se libera para no chocar con el único.
  const idsActualizados = new Set(ppActualizar.map((p) => p.id));
  const codigosAsignados = [...ppNuevos.map((p) => p.codigoProveedor), ...ppActualizar.map((p) => p.codigoProveedor)]
    .filter((c): c is string => typeof c === 'string' && !!c);
  const ocupados = codigosAsignados.length
    ? await prisma.proveedorProducto.findMany({
        where: { empresaId, proveedorId: imp.proveedorId, codigoProveedor: { in: codigosAsignados } },
        select: { id: true },
      })
    : [];
  const liberar = ocupados.map((o) => o.id).filter((id) => !idsActualizados.has(id));

  const resultado = await prisma.$transaction(
    async (tx) => {
      if (liberar.length) {
        await tx.proveedorProducto.updateMany({ where: { empresaId, id: { in: liberar } }, data: { codigoProveedor: null } });
      }
      if (productosNuevos.length) await tx.producto.createMany({ data: productosNuevos });
      for (const r of productosReactivar) {
        await tx.producto.updateMany({ where: { id: r.id, empresaId }, data: r.data });
        // El vínculo viejo con este proveedor (si quedó) se reemplaza por el nuevo.
        await tx.proveedorProducto.deleteMany({ where: { empresaId, proveedorId: imp.proveedorId, productoId: r.id } });
      }
      if (ppNuevos.length) await tx.proveedorProducto.createMany({ data: ppNuevos });

      await actualizarEnLote(
        tx, 'ProveedorProducto',
        {
          codigoProveedor: 'text', descripcionProveedor: 'text', costoLista: 'numeric', moneda: 'text', bonificaciones: 'text',
          precioContadoLista: 'numeric', precioTarjetaLista: 'numeric',
          incluyeIva: 'boolean', costoActualizadoAt: 'timestamp', importacionId: 'text', activo: 'boolean', preferido: 'boolean',
        },
        ppActualizar, { extra: '"updatedAt" = NOW()', empresaId }
      );
      await actualizarEnLote(
        tx, 'Producto',
        { precioCosto: 'numeric', precioVenta: 'numeric', costoActualizadoAt: 'timestamp', proveedorId: 'text' },
        productosActualizar, { extra: '"updatedAt" = NOW()', empresaId }
      );
      await actualizarEnLote(tx, 'Producto', { codigoFabricante: 'text' }, oemCompletar, { empresaId });

      if (historial.length) await tx.historialCosto.createMany({ data: historial });
      if (sugeridos.length) {
        await tx.precioSugerido.updateMany({
          where: { empresaId, productoId: { in: sugeridos.map((s) => s.productoId) }, estado: 'PENDIENTE' },
          data: { estado: 'REEMPLAZADO', resueltoAt: new Date() },
        });
        await tx.precioSugerido.createMany({ data: sugeridos });
      }

      await actualizarEnLote(
        tx, 'ImportacionItem',
        { aplicado: 'boolean', proveedorProductoId: 'text', productoId: 'text', productoCreadoId: 'text', ppAnterior: 'jsonb', productoAnterior: 'jsonb' },
        itemsActualizar, { empresaId }
      );

      // "Marcar como repuestos": los productos de la lista (nuevos y ya existentes) aparecen en Repuestos.
      if (mapeo.marcarRepuestos) {
        const ids = [...new Set(itemsActualizar.map((i) => i.productoId).filter((x): x is string => typeof x === 'string'))];
        for (let i = 0; i < ids.length; i += 5000) {
          await tx.producto.updateMany({ where: { empresaId, id: { in: ids.slice(i, i + 5000) } }, data: { esRepuesto: true } });
        }
      }

      // Evitar que dos aplicaciones simultáneas pasen las dos.
      const marcada = await tx.importacionLista.updateMany({
        where: { id: importacionId, empresaId, estado: 'BORRADOR' },
        data: { estado: 'APLICADA', aplicadaAt: new Date(), aplicados: itemsActualizar.length },
      });
      if (marcada.count !== 1) throw new ErrorImportacion('Esta importación ya fue aplicada.');

      return {
        aplicados: itemsActualizar.length,
        creados,
        costosActualizados: historial.filter((h) => h.afectaVigente !== false).length - creados,
        preciosActualizados,
        preciosSugeridos: sugeridos.length,
        modoPrecio: ctx.modoPrecio,
      };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  return resultado;
}

// ─── 4. Deshacer ─────────────────────────────────────────────────────────────

type ProductoAnterior = {
  precioCosto: number;
  precioVenta: number;
  costoActualizadoAt: string;
  proveedorId: string | null;
  costoAplicado: number;
  precioAplicado: number;
};

export async function deshacerImportacion(empresaId: string, importacionId: string, usuarioId: string | null) {
  const imp = await prisma.importacionLista.findFirst({ where: { id: importacionId, empresaId } });
  if (!imp) throw new ErrorImportacion('Importación no encontrada.');
  if (imp.estado !== 'APLICADA') throw new ErrorImportacion('Solo se pueden deshacer importaciones aplicadas.');
  const ultima = await prisma.importacionLista.findFirst({
    where: { empresaId, proveedorId: imp.proveedorId, estado: 'APLICADA' },
    orderBy: { aplicadaAt: 'desc' },
    select: { id: true },
  });
  if (ultima?.id !== importacionId) {
    throw new ErrorImportacion('Solo se puede deshacer la última importación aplicada de este proveedor.');
  }

  const items = await prisma.importacionItem.findMany({ where: { importacionId, aplicado: true } });
  const productoIds = Array.from(new Set(items.map((i) => i.productoId).filter(Boolean) as string[]));
  const ppIds = Array.from(new Set(items.map((i) => i.proveedorProductoId).filter(Boolean) as string[]));
  const [productos, vinculos, conVentas] = await Promise.all([
    prisma.producto.findMany({ where: { empresaId, id: { in: productoIds } } }),
    prisma.proveedorProducto.findMany({ where: { empresaId, id: { in: ppIds } } }),
    prisma.ventaItem.groupBy({
      by: ['productoId'],
      where: { productoId: { in: items.map((i) => i.productoCreadoId).filter(Boolean) as string[] } },
    }),
  ]);
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));
  const vendidos = new Set(conVentas.map((v) => v.productoId));

  const productosRestaurar: Array<Record<string, unknown> & { id: string }> = [];
  const productosBaja: string[] = [];
  const ppRestaurar: Array<Record<string, unknown> & { id: string }> = [];
  const ppBorrar: string[] = [];
  const historial: Prisma.HistorialCostoCreateManyInput[] = [];
  let restaurados = 0;
  let omitidos = 0;
  let creadosConVentas = 0;

  for (const item of items) {
    // Productos creados por esta importación: se dan de baja si nunca se vendieron.
    if (item.productoCreadoId) {
      if (vendidos.has(item.productoCreadoId)) {
        creadosConVentas++;
      } else {
        productosBaja.push(item.productoCreadoId);
        if (item.proveedorProductoId) ppBorrar.push(item.proveedorProductoId);
      }
      continue;
    }

    const vinculo = item.proveedorProductoId ? vinculoPorId.get(item.proveedorProductoId) : undefined;
    // El vínculo solo se toca si sigue con lo que dejó esta importación.
    if (vinculo && vinculo.importacionId === importacionId) {
      const anterior = item.ppAnterior as Record<string, unknown> | null;
      if (!anterior) ppBorrar.push(vinculo.id);
      else ppRestaurar.push({ id: vinculo.id, ...anterior });
    }

    const prevProd = item.productoAnterior as ProductoAnterior | null;
    const producto = item.productoId ? productoPorId.get(item.productoId) : undefined;
    if (!prevProd || !producto) continue;

    const costoActual = num(producto.precioCosto);
    if (Math.abs(costoActual - prevProd.costoAplicado) > 0.001) {
      omitidos++; // el costo cambió después de la importación: no se pisa
      continue;
    }
    const precioActual = num(producto.precioVenta);
    const restaurarPrecio = Math.abs(precioActual - prevProd.precioAplicado) <= 0.001;
    productosRestaurar.push({
      id: producto.id,
      precioCosto: prevProd.precioCosto,
      precioVenta: restaurarPrecio ? prevProd.precioVenta : precioActual,
      costoActualizadoAt: prevProd.costoActualizadoAt,
      proveedorId: prevProd.proveedorId,
    });
    if (Math.abs(prevProd.costoAplicado - prevProd.precioCosto) > 0.001) {
      historial.push({
        empresaId, productoId: producto.id, proveedorId: imp.proveedorId, origen: 'DESHACER', costoAnterior: costoActual,
        costoNuevo: prevProd.precioCosto, precioVentaAnterior: precioActual,
        precioVentaNuevo: restaurarPrecio ? prevProd.precioVenta : precioActual, importacionId, usuarioId,
        detalle: 'Se deshizo la importación',
      });
    }
    restaurados++;
  }

  await prisma.$transaction(
    async (tx) => {
      await actualizarEnLote(
        tx, 'Producto',
        { precioCosto: 'numeric', precioVenta: 'numeric', costoActualizadoAt: 'timestamp', proveedorId: 'text' },
        productosRestaurar, { extra: '"updatedAt" = NOW()', empresaId }
      );
      await actualizarEnLote(
        tx, 'ProveedorProducto',
        {
          costoLista: 'numeric', moneda: 'text', bonificaciones: 'text', incluyeIva: 'boolean', costoActualizadoAt: 'timestamp',
          importacionId: 'text', codigoProveedor: 'text', descripcionProveedor: 'text', preferido: 'boolean',
        },
        ppRestaurar, { extra: '"updatedAt" = NOW()', empresaId }
      );
      if (ppBorrar.length) await tx.proveedorProducto.deleteMany({ where: { empresaId, id: { in: ppBorrar } } });
      if (productosBaja.length) {
        await tx.producto.updateMany({ where: { empresaId, id: { in: productosBaja } }, data: { activo: false } });
      }
      await tx.precioSugerido.updateMany({
        where: { empresaId, importacionId, estado: 'PENDIENTE' },
        data: { estado: 'DESCARTADO', resueltoAt: new Date() },
      });
      if (historial.length) await tx.historialCosto.createMany({ data: historial });

      const marcada = await tx.importacionLista.updateMany({
        where: { id: importacionId, empresaId, estado: 'APLICADA' },
        data: { estado: 'DESHECHA', deshechaAt: new Date() },
      });
      if (marcada.count !== 1) throw new ErrorImportacion('Esta importación ya fue deshecha.');
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  return { restaurados, omitidos, productosDadosDeBaja: productosBaja.length, creadosConVentas };
}
