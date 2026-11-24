// Catálogo de productos: lo que hay en Stock + lo que venden los proveedores (productos
// "solo de catálogo", que entran desde las listas importadas y no están en Stock ni en el POS).

export type EstadoCatalogo = 'stock' | 'sin-stock' | 'lista';

/** ● En stock · ○ Sin stock (está en Stock con 0) · ◇ Solo en la lista del proveedor. */
export function estadoCatalogo(p: { soloCatalogo: boolean; stockActual: number }): EstadoCatalogo {
  if (p.soloCatalogo) return 'lista';
  return p.stockActual > 0 ? 'stock' : 'sin-stock';
}

/** Cantidad para pasar a Stock o cargar: 0 o más ("2,5" → 2.5, vacío → 0). null si no es válida. */
export function cantidadValida(v: unknown): number | null {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e6 ? n : null;
}
