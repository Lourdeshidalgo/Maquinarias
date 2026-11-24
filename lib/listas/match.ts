// Cruce de un renglón de lista con el catálogo (sin base de datos, para testear).
// Orden: código del proveedor ya vinculado → código interno / alternativo → N° de parte del fabricante (OEM).
import { normalizarCodigo } from './parseo.ts';

export type IndicesMatch<V> = {
  vinculoPorCodigo: Map<string, V>; // código del proveedor normalizado → vínculo
  productoPorCodigo: Map<string, string>; // código interno/alternativo normalizado → productoId
  productoPorOem: Map<string, string | null>; // OEM normalizado → productoId (null = más de un producto: ambiguo)
};

/** OEM normalizado → producto. Si dos productos comparten OEM queda null: no se elige al azar. */
export function indicePorOem(productos: { id: string; codigoFabricante: string | null }[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const p of productos) {
    const k = normalizarCodigo(p.codigoFabricante);
    if (!k) continue;
    m.set(k, m.has(k) && m.get(k) !== p.id ? null : p.id);
  }
  return m;
}

export function buscarProducto<V extends { productoId: string }>(
  fila: { codigo: string | null; codigoFabricante: string | null },
  idx: IndicesMatch<V>
): { tipoMatch: 'PROVEEDOR' | 'CODIGO' | 'OEM' | 'NINGUNO'; productoId?: string; vinculo?: V } {
  const k = normalizarCodigo(fila.codigo);
  if (k) {
    const vinculo = idx.vinculoPorCodigo.get(k);
    if (vinculo) return { tipoMatch: 'PROVEEDOR', productoId: vinculo.productoId, vinculo };
    const productoId = idx.productoPorCodigo.get(k);
    if (productoId) return { tipoMatch: 'CODIGO', productoId };
  }
  const oem = normalizarCodigo(fila.codigoFabricante);
  const productoId = oem ? idx.productoPorOem.get(oem) : undefined;
  if (productoId) return { tipoMatch: 'OEM', productoId };
  return { tipoMatch: 'NINGUNO' };
}

/**
 * ¿Hay que preguntar si es el mismo producto? Sí cuando coincide por código interno o por
 * N° de parte con un producto que este proveedor todavía no tiene vinculado: dos proveedores
 * pueden usar el mismo código para artículos distintos. Al confirmarlo (Vincular) queda
 * vinculado y las listas siguientes lo reconocen solas por el código del proveedor.
 */
export function requiereConfirmacion(tipoMatch: string, tieneVinculoConProveedor: boolean): boolean {
  return (tipoMatch === 'CODIGO' || tipoMatch === 'OEM') && !tieneVinculoConProveedor;
}
