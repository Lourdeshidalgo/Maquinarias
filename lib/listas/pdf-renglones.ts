// Renglones que Gemini lee de una lista en PDF → filas de importación (FilaLista).
// Puro: sin SDK ni base de datos, para testear y para usar los tipos en el navegador.
import { parseNumero, type FilaLista } from './parseo.ts';

export type RenglonLeido = {
  codigo: string | null;
  descripcion: string | null;
  precio: number | string | null;
  moneda: 'ARS' | 'USD' | null;
  marca: string | null;
  rubro: string | null;
  codigoFabricante: string | null;
  pagina: number; // relativa al tramo: 1 = primera página del tramo
};

const textoNulo = { type: ['string', 'null'] };

/** JSON schema de la salida estructurada: { renglones: RenglonLeido[] }. */
export const ESQUEMA_RENGLONES: Record<string, unknown> = {
  type: 'object',
  properties: {
    renglones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: textoNulo,
          descripcion: textoNulo,
          precio: { type: ['number', 'string', 'null'] },
          moneda: { type: ['string', 'null'], description: '"ARS", "USD" o null' },
          marca: textoNulo,
          rubro: textoNulo,
          codigoFabricante: textoNulo,
          pagina: { type: 'integer' },
        },
        required: ['codigo', 'descripcion', 'precio', 'moneda', 'marca', 'rubro', 'codigoFabricante', 'pagina'],
        additionalProperties: false,
      },
    },
  },
  required: ['renglones'],
  additionalProperties: false,
};

const recortar = (v: string | null | undefined, max: number) => {
  const s = (v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Convierte lo leído de un tramo en filas. `desde` es el número de la primera página
 * del tramo en el PDF completo; fila = página × 1000 + orden dentro de la página.
 */
export function normalizarRenglones(renglones: RenglonLeido[], desde: number, monedaDefault: 'ARS' | 'USD'): FilaLista[] {
  const orden = new Map<number, number>();
  const salida: FilaLista[] = [];
  for (const r of renglones) {
    const codigo = recortar(r.codigo?.replace(/^\s*#/, ''), 120);
    const descripcion = recortar(r.descripcion, 500);
    if (!codigo && !descripcion) continue;
    const pagina = desde + Math.max(1, Math.trunc(r.pagina) || 1) - 1;
    const n = (orden.get(pagina) ?? 0) + 1;
    orden.set(pagina, n);
    const precio = parseNumero(r.precio);
    salida.push({
      fila: pagina * 1000 + n,
      codigo,
      codigoFabricante: recortar(r.codigoFabricante, 120),
      descripcion,
      precio: precio !== null && precio > 0 && precio < 1e12 ? precio : null,
      moneda: r.moneda === 'USD' || r.moneda === 'ARS' ? r.moneda : monedaDefault,
      marca: recortar(r.marca, 120),
      rubro: recortar(r.rubro, 120),
      bonificaciones: null,
    });
  }
  return salida;
}
