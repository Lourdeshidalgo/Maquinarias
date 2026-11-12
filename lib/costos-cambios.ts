import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { aplicarPrecios, calcularPrecios, type PrecioCalculado } from '@/lib/costos-precios';
import { actualizarEnLote } from '@/lib/listas/sql';

// Cambios de costo hechos a mano (grilla de edición rápida) o en bloque
// (aumento masivo). Ambos dejan historial y recalculan el precio de venta
// con las reglas (automático o a la bandeja), igual que una lista.

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export type CambioCosto = { productoId: string; nuevoCosto?: number; factor?: number };

export type CambioCalculado = {
  productoId: string;
  codigo: string;
  nombre: string;
  categoria: string;
  costoAnterior: number;
  costoNuevo: number;
  precio: PrecioCalculado | null; // null si el precio no cambia
  precioActual: number;
};

/** Calcula el costo nuevo de cada producto y el precio que le correspondería (sin guardar). */
export async function calcularCambiosCosto(empresaId: string, cambios: CambioCosto[]) {
  const ids = cambios.map((c) => c.productoId);
  const productos = await prisma.producto.findMany({
    where: { empresaId, id: { in: ids }, activo: true },
    select: { id: true, codigo: true, nombre: true, categoria: true, precioCosto: true, precioVenta: true },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const costos = new Map<string, number>();
  for (const c of cambios) {
    const p = porId.get(c.productoId);
    if (!p) continue;
    const anterior = n(p.precioCosto);
    const nuevo = c.nuevoCosto !== undefined ? c.nuevoCosto : anterior * (c.factor ?? 1);
    costos.set(p.id, r2(Math.max(0, nuevo)));
  }

  const { filas, margenMinimo, modoPrecio } = await calcularPrecios(empresaId, { id: { in: Array.from(costos.keys()) } }, { costos });
  const precioPorId = new Map(filas.map((f) => [f.productoId, f]));

  const resultado: CambioCalculado[] = [];
  for (const [id, costoNuevo] of costos) {
    const p = porId.get(id)!;
    resultado.push({
      productoId: id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria,
      costoAnterior: n(p.precioCosto), costoNuevo, precio: precioPorId.get(id) ?? null, precioActual: n(p.precioVenta),
    });
  }
  resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { cambios: resultado, margenMinimo, modoPrecio };
}

/**
 * Guarda los cambios de costo: costo vigente + fecha, costo de lista del
 * proveedor preferido (escalado en la misma proporción, así la próxima lista
 * compara contra el valor real), historial y precios de venta.
 */
export async function aplicarCambiosCosto(
  empresaId: string,
  cambios: CambioCosto[],
  origen: 'MANUAL' | 'MASIVO',
  usuarioId: string | null,
  detalle?: string
) {
  const { cambios: calculados, modoPrecio } = await calcularCambiosCosto(empresaId, cambios);
  const efectivos = calculados.filter((c) => Math.abs(c.costoNuevo - c.costoAnterior) > 0.001);
  if (!efectivos.length) return { costosActualizados: 0, modo: modoPrecio, actualizados: 0, sugeridos: 0, loteId: null };

  const preferidos = await prisma.proveedorProducto.findMany({
    where: { empresaId, preferido: true, productoId: { in: efectivos.map((e) => e.productoId) } },
  });
  const prefPorProducto = new Map(preferidos.map((p) => [p.productoId, p]));
  const automatico = modoPrecio === 'AUTOMATICO';
  const loteId = randomUUID();
  const ahora = new Date();

  const ppActualizar: { id: string; costoLista: number; costoActualizadoAt: Date }[] = [];
  const historial = efectivos.map((e) => {
    const pp = prefPorProducto.get(e.productoId);
    let listaNueva: number | null = null;
    if (pp) {
      const lista = n(pp.costoLista);
      // El vigente es proporcional a la lista (bonificaciones, IVA y dólar son factores).
      listaNueva = e.costoAnterior > 0 ? r2(lista * (e.costoNuevo / e.costoAnterior)) : pp.moneda === 'ARS' && !pp.bonificaciones ? e.costoNuevo : null;
      if (listaNueva !== null) ppActualizar.push({ id: pp.id, costoLista: listaNueva, costoActualizadoAt: ahora });
    }
    const cambiaPrecio = !!e.precio;
    return {
      empresaId, productoId: e.productoId, proveedorProductoId: pp?.id ?? null, proveedorId: pp?.proveedorId ?? null,
      origen, afectaVigente: true, costoListaAnterior: pp && listaNueva !== null ? pp.costoLista : null,
      costoListaNuevo: listaNueva, moneda: pp && listaNueva !== null ? pp.moneda : null,
      costoAnterior: e.costoAnterior, costoNuevo: e.costoNuevo, precioVentaAnterior: e.precioActual,
      precioVentaNuevo: cambiaPrecio ? (automatico ? e.precio!.precioNuevo : null) : e.precioActual,
      loteId, usuarioId, detalle: detalle ?? null,
    };
  });

  return prisma.$transaction(
    async (tx) => {
      await actualizarEnLote(
        tx, 'Producto', { precioCosto: 'numeric', costoActualizadoAt: 'timestamp' },
        efectivos.map((e) => ({ id: e.productoId, precioCosto: e.costoNuevo, costoActualizadoAt: ahora })),
        { extra: '"updatedAt" = NOW()', empresaId }
      );
      await actualizarEnLote(
        tx, 'ProveedorProducto', { costoLista: 'numeric', costoActualizadoAt: 'timestamp' },
        ppActualizar, { extra: '"updatedAt" = NOW()', empresaId }
      );
      await tx.historialCosto.createMany({ data: historial });
      const precios = await aplicarPrecios(
        empresaId, efectivos.filter((e) => e.precio).map((e) => e.precio!), origen, usuarioId, tx,
        automatico ? 'AUTOMATICO' : 'APROBACION'
      );
      return { costosActualizados: efectivos.length, loteId, ...precios };
    },
    { timeout: 60_000 }
  );
}
