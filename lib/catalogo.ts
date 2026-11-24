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

/** Producto como lo devuelve el catálogo, con lo justo para exportarlo. */
export type ProductoExportar = {
  codigo: string; nombre: string; categoria: string | null; marca: string | null;
  precioVenta: number; precioCredito: number;
  lista: { precioContado: number | null; precioTarjeta: number | null } | null;
};
export type FilaExportar = { codigo: string; nombre: string; efectivo: number; tarjeta: number };
export type GrupoExportar = { categoria: string; filas: FilaExportar[] };

/**
 * Catálogo para mandar a un cliente: por categoría, con el precio en efectivo y con tarjeta
 * (los mismos que muestra la pantalla "Como el Excel"). Sin costos ni proveedores.
 */
export function gruposParaExportar(items: ProductoExportar[]): GrupoExportar[] {
  const grupos = new Map<string, FilaExportar[]>();
  for (const it of items) {
    const categoria = (it.categoria || '').trim() || 'Otros';
    const efectivo = it.lista?.precioContado ?? it.precioVenta;
    const tarjeta = it.lista?.precioTarjeta ?? it.precioCredito;
    if (!(efectivo > 0)) continue; // sin precio no se manda
    const nombre = it.marca && !it.nombre.toLowerCase().includes(it.marca.toLowerCase()) ? `${it.nombre} (${it.marca})` : it.nombre;
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria)!.push({ codigo: it.codigo, nombre, efectivo, tarjeta });
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([categoria, filas]) => ({ categoria, filas: filas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })) }));
}

/** Nombre del archivo: "Catalogo Molux 24-11-2026.pdf" (sin caracteres raros). */
export function nombreArchivoCatalogo(empresa: string | null, fecha: Date, extension: 'pdf' | 'xlsx', filtro?: string): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
  const d = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
  return [ 'Catalogo', empresa ? limpio(empresa) : '', filtro ? limpio(filtro) : '', d ].filter(Boolean).join(' ') + `.${extension}`;
}
