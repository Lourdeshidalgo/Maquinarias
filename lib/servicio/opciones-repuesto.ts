import {
  costoReal,
  costoVigenteDesdeLista,
  cotizacionPara,
  precioDeVenta,
  resolverMargen,
  type CotizacionesVigentes,
  type ReglasMargen,
} from '../costos.ts';

// Buscador de repuestos del presupuesto de servicio técnico: cuando un mismo
// producto lo venden varios proveedores, se ofrece una opción por proveedor con
// el precio de venta que saldría con el costo de ese proveedor. Funciones puras
// (sin base de datos) con la misma fórmula del módulo de costos.

export type ProductoParaOpciones = {
  precioVenta: number;
  costoEnvio?: number;
  costoPackaging?: number;
  ivaPorcentaje: number;
  margenPorcentaje?: number | null;
  categoria?: string | null;
};

export type VinculoProveedor = {
  proveedorId: string;
  proveedor: string;
  bonificacionesBase?: string | null;
  costoLista: number;
  moneda: string;
  bonificaciones?: string | null;
  incluyeIva: boolean;
  preferido: boolean;
};

export type ContextoPrecios = {
  ivaEnCosto: boolean;
  redondeo: number;
  reglas: ReglasMargen;
  cotizaciones: CotizacionesVigentes;
};

/**
 * De dónde sale el precio de la opción:
 *   CATALOGO       → precio de venta del stock (sin proveedor, o el proveedor preferido)
 *   PROVEEDOR      → calculado con el costo de ese proveedor y la regla de recargo
 *   SIN_COTIZACION → el proveedor cotiza en dólares y no hay dólar cargado: se usa el precio del stock
 */
export type OrigenPrecio = 'CATALOGO' | 'PROVEEDOR' | 'SIN_COTIZACION';

export type OpcionRepuesto = {
  proveedorId: string | null;
  proveedor: string | null;
  precio: number;
  origen: OrigenPrecio;
  preferido: boolean;
};

const entero = (n: number) => Math.round(n);

/** Precio de venta (con IVA) que saldría con el costo de un proveedor, o null si no se puede calcular. */
export function precioConProveedor(p: ProductoParaOpciones, v: VinculoProveedor, ctx: ContextoPrecios): number | null {
  const vigente = costoVigenteDesdeLista({
    costoLista: v.costoLista,
    moneda: v.moneda,
    bonificaciones: v.bonificaciones,
    bonificacionesBase: v.bonificacionesBase,
    incluyeIva: v.incluyeIva,
    ivaPorcentaje: p.ivaPorcentaje,
    ivaEnCosto: ctx.ivaEnCosto,
    cotizacion: cotizacionPara(ctx.cotizaciones, v.proveedorId),
  });
  if (vigente === null) return null;
  const real = costoReal({ precioCosto: vigente, costoEnvio: p.costoEnvio, costoPackaging: p.costoPackaging });
  if (real <= 0) return null;
  const { margen } = resolverMargen(
    { margenPorcentaje: p.margenPorcentaje ?? null, categoria: p.categoria, proveedorId: v.proveedorId },
    ctx.reglas
  );
  return precioDeVenta(real, margen, ctx.redondeo);
}

/**
 * Opciones para elegir en el presupuesto: una por proveedor (el preferido
 * primero y luego de más barato a más caro) o, si el producto no tiene
 * proveedores cargados, una sola con el precio del stock.
 * El proveedor preferido usa el precio de venta del stock tal cual está.
 */
export function opcionesRepuesto(p: ProductoParaOpciones, vinculos: VinculoProveedor[], ctx: ContextoPrecios | null): OpcionRepuesto[] {
  const catalogo = entero(p.precioVenta);
  if (!vinculos.length || !ctx) {
    return [{ proveedorId: null, proveedor: null, precio: catalogo, origen: 'CATALOGO', preferido: false }];
  }
  const opciones = vinculos.map((v): OpcionRepuesto => {
    if (v.preferido) return { proveedorId: v.proveedorId, proveedor: v.proveedor, precio: catalogo, origen: 'CATALOGO', preferido: true };
    const calculado = precioConProveedor(p, v, ctx);
    return calculado === null
      ? { proveedorId: v.proveedorId, proveedor: v.proveedor, precio: catalogo, origen: 'SIN_COTIZACION', preferido: false }
      : { proveedorId: v.proveedorId, proveedor: v.proveedor, precio: entero(calculado), origen: 'PROVEEDOR', preferido: false };
  });
  return opciones.sort((a, b) => Number(b.preferido) - Number(a.preferido) || a.precio - b.precio || (a.proveedor ?? '').localeCompare(b.proveedor ?? ''));
}
