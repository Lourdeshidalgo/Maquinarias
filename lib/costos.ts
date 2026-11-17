// Cálculos del módulo "Costos y listas de proveedores".
// Funciones puras (sin base de datos) para que la importación, el aumento
// masivo, la cotización y las pantallas usen exactamente la misma fórmula.
//
// Vocabulario:
//   costo de lista  → lo que dice la lista del proveedor (ARS o USD)
//   costo vigente   → Producto.precioCosto, en pesos: lista − bonificaciones
//                     (± IVA según configuración) × cotización si es USD
//   costo real      → costo vigente + envío + packaging (lo mismo que congela
//                     VentaItem.costoUnitario al vender)
//   margen (recargo)→ % sobre el costo real: precio = costo real × (1 + margen)

export type Moneda = 'ARS' | 'USD';
export type NivelMargen = 'PRODUCTO' | 'CATEGORIA' | 'PROVEEDOR' | 'GENERAL';

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** "10+5" | "10 + 5%" | "10,5" → [10, 5] | [10.5]. Ignora lo que no sea número. */
export function parseBonificaciones(texto: string | null | undefined): number[] {
  if (!texto) return [];
  return String(texto)
    .split('+')
    .map((p) => parseFloat(p.replace('%', '').replace(',', '.').trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
}

/**
 * Texto de bonificaciones listo para guardar: " 25 + 15% " → "25+15", "" → "".
 * Devuelve null si alguna parte no es un porcentaje válido (entre 0 y 100).
 */
export function normalizarBonificaciones(texto: string | null | undefined): string | null {
  const t = (texto || '').trim();
  if (!t) return '';
  const partes = t.split('+').map((p) => p.replace('%', '').replace(',', '.').trim());
  const nums = partes.map((p) => (/^\d+(\.\d+)?$/.test(p) ? parseFloat(p) : NaN));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0 || n >= 100)) return null;
  return nums.join('+');
}

/** Factor total de las bonificaciones en cascada: 10+5 → 0,9 × 0,95 = 0,855. */
export function factorBonificaciones(texto: string | null | undefined): number {
  return parseBonificaciones(texto).reduce((f, b) => f * (1 - b / 100), 1);
}

/** Bonificación total equivalente en %: 10+5 → 14,5. */
export function bonificacionEquivalente(texto: string | null | undefined): number {
  return redondear2((1 - factorBonificaciones(texto)) * 100);
}

/**
 * Bonificaciones que se aplican: las propias del producto (ProveedorProducto)
 * si tiene, y si no las del proveedor (Proveedor.bonificacionesBase).
 */
export function bonificacionesEfectivas(propias: string | null | undefined, base: string | null | undefined): string {
  const p = (propias || '').trim();
  return p || (base || '').trim();
}

/** Dólar vigente: el general (proveedorId null) y el propio de cada proveedor. */
export type CotizacionesVigentes = { general: number | null; porProveedor: Map<string, number> };

/** Dólar que usa un proveedor: el suyo si tiene, si no el general (o null si no hay ninguno). */
export function cotizacionPara(c: CotizacionesVigentes, proveedorId: string | null | undefined): number | null {
  if (proveedorId) {
    const propio = c.porProveedor.get(proveedorId);
    if (propio !== undefined) return propio;
  }
  return c.general;
}

export type DatosCostoLista = {
  costoLista: number;
  moneda: Moneda | string;
  bonificaciones?: string | null;
  bonificacionesBase?: string | null; // del proveedor: se usan si el producto no tiene propias
  incluyeIva: boolean; // la lista ya trae IVA
  ivaPorcentaje: number; // alícuota del producto (21, 10.5, 0)
  ivaEnCosto: boolean; // configuración: el costo vigente se guarda con IVA
  cotizacion?: number | null; // pesos por dólar (obligatoria si moneda = USD)
};

/**
 * Costo vigente en pesos a partir de la lista del proveedor.
 * Devuelve null si el costo está en USD y no hay cotización cargada.
 */
export function costoVigenteDesdeLista(d: DatosCostoLista): number | null {
  let costo = d.costoLista * factorBonificaciones(bonificacionesEfectivas(d.bonificaciones, d.bonificacionesBase));

  const iva = 1 + (d.ivaPorcentaje || 0) / 100;
  if (d.ivaEnCosto && !d.incluyeIva) costo = costo * iva;
  if (!d.ivaEnCosto && d.incluyeIva) costo = costo / iva;

  if (d.moneda === 'USD') {
    if (!d.cotizacion || d.cotizacion <= 0) return null;
    costo = costo * d.cotizacion;
  }
  return redondear2(costo);
}

/** Costo real = costo vigente + envío + packaging (igual que el POS al congelar el costo). */
export function costoReal(p: { precioCosto: number; costoEnvio?: number; costoPackaging?: number }): number {
  return redondear2(p.precioCosto + (p.costoEnvio || 0) + (p.costoPackaging || 0));
}

export type ReglasMargen = {
  margenGeneral: number;
  porCategoria: Map<string, number>; // clave: categoría normalizada (normalizarCategoria)
  porProveedor: Map<string, number>; // clave: proveedorId
};

export const normalizarCategoria = (c: string | null | undefined) => (c || '').trim().toLowerCase();

/** Recargo que corresponde al producto: gana el más específico. */
export function resolverMargen(
  p: { margenPorcentaje?: number | null; categoria?: string | null; proveedorId?: string | null },
  reglas: ReglasMargen
): { margen: number; nivel: NivelMargen } {
  if (p.margenPorcentaje !== null && p.margenPorcentaje !== undefined) {
    return { margen: p.margenPorcentaje, nivel: 'PRODUCTO' };
  }
  const cat = reglas.porCategoria.get(normalizarCategoria(p.categoria));
  if (cat !== undefined) return { margen: cat, nivel: 'CATEGORIA' };
  if (p.proveedorId) {
    const prov = reglas.porProveedor.get(p.proveedorId);
    if (prov !== undefined) return { margen: prov, nivel: 'PROVEEDOR' };
  }
  return { margen: reglas.margenGeneral, nivel: 'GENERAL' };
}

/** Redondea al múltiplo más cercano (0 = sin redondeo, solo centavos). */
export function redondearPrecio(precio: number, multiplo: number): number {
  if (!multiplo || multiplo <= 0 || precio <= 0) return redondear2(precio);
  // Un precio menor que el múltiplo (ej. $6 con redondeo a la centena) no se
  // lleva a cero: se baja el múltiplo hasta que entre (100 → 10 → 1 → centavos).
  let m = multiplo;
  while (m >= 1 && precio < m) m = m / 10;
  if (m < 1) return redondear2(precio);
  return Math.round(precio / m) * m;
}

/** precio de venta = costo real × (1 + margen), con redondeo. */
export function precioDeVenta(costoRealUnit: number, margenPct: number, redondeo: number): number {
  return redondearPrecio(costoRealUnit * (1 + margenPct / 100), redondeo);
}

/** Precio con tarjeta de crédito = precio de venta + recargo %, con el mismo redondeo. No se guarda. */
export function precioCredito(precioVenta: number, recargoPct: number, redondeo: number): number {
  return redondearPrecio(precioVenta * (1 + (recargoPct || 0) / 100), redondeo);
}

/** Recargo resultante sobre el costo real (lo que realmente queda tras redondear). */
export function margenResultante(precioVenta: number, costoRealUnit: number): number | null {
  if (costoRealUnit <= 0) return null;
  return redondear2(((precioVenta - costoRealUnit) / costoRealUnit) * 100);
}

/** Variación % entre dos valores (null si el anterior es 0). */
export function variacionPct(anterior: number, nuevo: number): number | null {
  if (!anterior) return null;
  return redondear2(((nuevo - anterior) / anterior) * 100);
}

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

/** Días transcurridos desde la última actualización del costo. */
export function diasDesde(fecha: Date | string, ahora: Date = new Date()): number {
  const ms = ahora.getTime() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function semaforoCosto(
  fecha: Date | string,
  umbrales: { umbralAmarillo: number; umbralRojo: number },
  ahora: Date = new Date()
): Semaforo {
  const dias = diasDesde(fecha, ahora);
  if (dias > umbrales.umbralRojo) return 'ROJO';
  if (dias >= umbrales.umbralAmarillo) return 'AMARILLO';
  return 'VERDE';
}
