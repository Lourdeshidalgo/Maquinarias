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

export type DatosListaManual = { costoLista: number; incluyeIva: boolean; bonificaciones: string };

/** Valida el precio de lista (USD) cargado a mano para un producto: "12,5" → 12.5; por defecto sin IVA. */
export function datosListaManual(body: {
  costoLista: unknown;
  incluyeIva?: unknown;
  bonificaciones?: unknown;
}): ({ ok: true } & DatosListaManual) | { ok: false; error: string } {
  const costoLista = parseFloat(String(body.costoLista ?? '').replace(',', '.'));
  if (!Number.isFinite(costoLista) || costoLista <= 0 || costoLista >= 1e9) {
    return { ok: false, error: 'Ingresá un precio en dólares mayor a cero.' };
  }
  const texto = typeof body.bonificaciones === 'string' ? body.bonificaciones.trim() : '';
  // "0" = sin descuento a propósito (ignora el del proveedor). Un texto sin números
  // (ej. "s/d" que vino de una lista) no dice nada: se trata como vacío.
  const bonificaciones = /^0+([.,]0+)?%?$/.test(texto) ? '0' : !/\d/.test(texto) ? '' : normalizarBonificaciones(texto);
  if (bonificaciones === null) {
    return { ok: false, error: 'El descuento no es válido. Usá porcentajes separados por +, por ejemplo 50 o 25+15.' };
  }
  return { ok: true, costoLista, incluyeIva: body.incluyeIva === true, bonificaciones };
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
  // Cuentan como propias solo si dicen algo: al menos un porcentaje, o "0"
  // (sin descuento a propósito). Un "-", "s/d" o "N/A" de la lista no anula la base.
  const p = (propias || '').trim();
  const dicenAlgo = parseBonificaciones(p).length > 0 || /^0+([.,]0+)?%?$/.test(p);
  return dicenAlgo ? p : (base || '').trim();
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

/**
 * Costo "tal cual" del Excel: el precio de la lista como viene, sin sumar IVA ni descontar
 * bonificaciones. En dólares se pasa a pesos con la cotización (null si no hay cotización).
 */
export function costoTalCual(precio: number, moneda: string, cotizacion: number | null): number | null {
  if (moneda !== 'USD') return redondear2(precio);
  if (!cotizacion || cotizacion <= 0) return null;
  return redondear2(precio * cotizacion);
}

/** Precio de venta "tal cual": el efectivo que trae la lista; si la fila no lo trae, null. */
export function ventaTalCual(precioContado: number | null | undefined): number | null {
  return precioContado != null && precioContado > 0 ? redondear2(precioContado) : null;
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

export type FactorCosto = { tipo: 'descuento' | 'iva' | 'dolar'; valor: number; detalle: string };

export type EntradaDesglose = {
  costoLista: number;
  moneda: Moneda | string;
  bonificaciones: string; // las efectivas (propias del producto o la base del proveedor)
  incluyeIva: boolean;
  ivaPorcentaje: number;
  ivaEnCosto: boolean;
  cotizacion: number | null;
  costoEnvio: number;
  costoPackaging: number;
  margen: number; // ganancia en %
  redondeo: number;
  recargoCredito: number;
};

export type Desglose = {
  factoresCosto: FactorCosto[]; // lista × factores = costo (como la fórmula del Excel)
  factorGanancia: number; // 50% → 1,5
  costo: number | null; // costo vigente en pesos
  costoReal: number | null; // + envío y packaging
  precioSinRedondeo: number | null;
  precio: number | null;
  precioCredito: number | null;
};

/**
 * La cuenta del precio de venta paso por paso, como la escribe el cliente en su Excel:
 * lista × descuentos × IVA × dólar = costo; (+ envío/packaging) × ganancia = precio.
 * Usa las mismas funciones que el cálculo real, así que los números coinciden.
 */
export function desgloseCalculo(d: EntradaDesglose): Desglose {
  const factoresCosto: FactorCosto[] = parseBonificaciones(d.bonificaciones).map((b) => ({
    tipo: 'descuento', valor: redondear2(1 - b / 100), detalle: `descuento ${b}%`,
  }));
  const iva = 1 + (d.ivaPorcentaje || 0) / 100;
  if (d.ivaEnCosto && !d.incluyeIva) factoresCosto.push({ tipo: 'iva', valor: iva, detalle: `IVA ${d.ivaPorcentaje}%` });
  if (!d.ivaEnCosto && d.incluyeIva) factoresCosto.push({ tipo: 'iva', valor: 1 / iva, detalle: `sin IVA ${d.ivaPorcentaje}%` });
  if (d.moneda === 'USD' && d.cotizacion) factoresCosto.push({ tipo: 'dolar', valor: d.cotizacion, detalle: 'dólar del proveedor' });

  const costo = costoVigenteDesdeLista({
    costoLista: d.costoLista, moneda: d.moneda, bonificaciones: d.bonificaciones, incluyeIva: d.incluyeIva,
    ivaPorcentaje: d.ivaPorcentaje, ivaEnCosto: d.ivaEnCosto, cotizacion: d.cotizacion,
  });
  const factorGanancia = redondear2(1 + d.margen / 100);
  if (costo === null) {
    return { factoresCosto, factorGanancia, costo: null, costoReal: null, precioSinRedondeo: null, precio: null, precioCredito: null };
  }
  const real = costoReal({ precioCosto: costo, costoEnvio: d.costoEnvio, costoPackaging: d.costoPackaging });
  const precio = precioDeVenta(real, d.margen, d.redondeo);
  return {
    factoresCosto, factorGanancia, costo, costoReal: real,
    precioSinRedondeo: redondear2(real * (1 + d.margen / 100)),
    precio,
    precioCredito: precioCredito(precio, d.recargoCredito, d.redondeo),
  };
}
