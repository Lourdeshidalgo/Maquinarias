// Lectura gratis de listas de precios en PDF a partir del texto que da pdf.js
// (en el navegador). Puro: sin pdf.js ni base de datos, para testear.
//
//   Catálogo → recorre los textos en el orden del PDF: un código abre un producto,
//              los textos que siguen son la descripción y el primer precio lo cierra.
//   Tabla    → arma filas (misma altura) y columnas (posición horizontal) para el
//              mapeo de columnas de siempre (como un Excel).
import { parseNumero, type FilaLista } from './parseo.ts';

export type TextoPdf = { str: string; x: number; y: number }; // y crece hacia arriba (coordenadas PDF)
export type PaginaPdf = TextoPdf[]; // en el orden en que los da pdf.js

const RE_PRECIO = /^(U\$S|US\$|USD|\$)\s*-?[\d.,]*\d$/i;
const RE_CODIGO_NUMERAL = /^#[A-Z0-9][\w\-./]+$/i;
const RE_CODIGO = /^[A-Z0-9][A-Z0-9\-./]{2,}$/i;
const MAX_TEXTOS_DESCRIPCION = 6;
const MIN_PRODUCTOS_CATALOGO = 10;
const MIN_REPETICIONES_RUIDO = 5;

const limpio = (s: string) => s.replace(/\s+/g, ' ').trim();
const esPrecio = (s: string) => RE_PRECIO.test(s);

export const tieneTexto = (paginas: PaginaPdf[]) => paginas.some((p) => p.some((t) => t.str.trim()));

type Item = { s: string; ip: number };

const esCandidatoCodigo = (s: string) => RE_CODIGO_NUMERAL.test(s) || (RE_CODIGO.test(s) && /\d/.test(s) && !esPrecio(s));

/**
 * Recorre los textos: un código abre un producto, lo que sigue es descripción y el primer
 * precio lo cierra. `dentro[i]` dice si el texto i cayó entre un código y su precio.
 */
function recorrer(items: Item[], ruido: Set<string>, conNumeral: boolean, monedaDefault: 'ARS' | 'USD') {
  const salida: FilaLista[] = [];
  const dentro: boolean[] = items.map(() => false);
  const ordenPorPagina = new Map<number, number>();
  let abierto: { fila: FilaLista; desc: string[] } | null = null;
  const cerrar = () => {
    if (abierto) abierto.fila.descripcion = abierto.desc.join(' ').slice(0, 500) || null;
    abierto = null;
  };
  // Sin "#": con un producto abierto, una palabra tipo código abre otro solo si después
  // viene una descripción antes del precio (así "EC-08" justo antes del precio es descripción).
  const abreOtro = (i: number) => {
    for (let j = i + 1; j < items.length && j <= i + 6; j++) {
      const s = items[j].s;
      if (ruido.has(s)) continue;
      if (esPrecio(s)) return false;
      if (!esCandidatoCodigo(s)) return true;
    }
    return false;
  };

  items.forEach(({ s, ip }, i) => {
    if (ruido.has(s)) return;
    const esCodigo = conNumeral ? RE_CODIGO_NUMERAL.test(s) : esCandidatoCodigo(s) && (!abierto || abreOtro(i));
    if (esCodigo) {
      cerrar();
      const orden = (ordenPorPagina.get(ip) ?? 0) + 1;
      ordenPorPagina.set(ip, orden);
      const fila: FilaLista = {
        fila: (ip + 1) * 1000 + orden, codigo: s.replace(/^#/, '').slice(0, 120), codigoFabricante: null, descripcion: null,
        precio: null, moneda: monedaDefault, marca: null, rubro: null, bonificaciones: null,
      };
      salida.push(fila);
      abierto = { fila, desc: [] };
      return;
    }
    if (!abierto) return;
    const actual = abierto as { fila: FilaLista; desc: string[] };
    dentro[i] = true;
    if (esPrecio(s)) {
      const precio = parseNumero(s);
      actual.fila.precio = precio !== null && precio > 0 && precio < 1e12 ? precio : null;
      if (/^(U\$S|US\$|USD)/i.test(s)) actual.fila.moneda = 'USD';
      cerrar();
      return;
    }
    if (actual.desc.length < MAX_TEXTOS_DESCRIPCION) actual.desc.push(s);
  });
  cerrar();
  return { salida, dentro };
}

export function leerCatalogo(paginas: PaginaPdf[], monedaDefault: 'ARS' | 'USD'): FilaLista[] {
  const items: Item[] = paginas.flatMap((p, ip) => p.map((t) => ({ s: limpio(t.str), ip }))).filter((it) => it.s);
  // Si el PDF marca los códigos con "#", solo esos cuentan (evita tomar "EC-08" o "CRV50" como código).
  const conNumeral = items.filter((it) => RE_CODIGO_NUMERAL.test(it.s)).length >= 5;

  // Ruido: textos repetidos que casi siempre quedan fuera de un código → precio
  // ("PRECIO OFERTA", "Cantidad:", pies de página). Una descripción repetida queda adentro: no es ruido.
  const { dentro } = recorrer(items, new Set(), conNumeral, monedaDefault);
  const cuenta = new Map<string, { dentro: number; fuera: number }>();
  items.forEach((it, i) => {
    if (esPrecio(it.s)) return;
    const c = cuenta.get(it.s) ?? { dentro: 0, fuera: 0 };
    if (dentro[i]) c.dentro++;
    else c.fuera++;
    cuenta.set(it.s, c);
  });
  const ruido = new Set(
    [...cuenta].filter(([, c]) => c.dentro + c.fuera >= MIN_REPETICIONES_RUIDO && c.fuera >= c.dentro).map(([s]) => s)
  );
  return recorrer(items, ruido, conNumeral, monedaDefault).salida;
}

export function elegirModo(paginas: PaginaPdf[]): 'catalogo' | 'tabla' {
  const conPrecio = leerCatalogo(paginas, 'ARS').filter((f) => f.precio !== null).length;
  return conPrecio >= MIN_PRODUCTOS_CATALOGO ? 'catalogo' : 'tabla';
}

const TOLERANCIA_FILA = 3;
const TOLERANCIA_COLUMNA = 12;

/** Filas × columnas ('' en celdas vacías), para el mapeo de columnas como si fuera un Excel. */
export function tablaDesdePdf(paginas: PaginaPdf[]): string[][] {
  // 1. Filas: textos a la misma altura (de arriba hacia abajo), cada fila ordenada por x.
  const filas: TextoPdf[][] = [];
  for (const p of paginas) {
    const textos = p.filter((t) => t.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    let actual: TextoPdf[] = [];
    let yFila = Infinity;
    for (const t of textos) {
      if (actual.length && Math.abs(t.y - yFila) > TOLERANCIA_FILA) {
        filas.push(actual.sort((a, b) => a.x - b.x));
        actual = [];
      }
      if (!actual.length) yFila = t.y;
      actual.push(t);
    }
    if (actual.length) filas.push(actual.sort((a, b) => a.x - b.x));
  }

  // 2. Columnas: se agrupan los x de inicio cercanos.
  const xs = [...new Set(filas.flat().map((t) => t.x))].sort((a, b) => a - b);
  let grupos: number[][] = [];
  for (const x of xs) {
    const g = grupos[grupos.length - 1];
    if (g && x - g[g.length - 1] <= TOLERANCIA_COLUMNA) g.push(x);
    else grupos.push([x]);
  }
  const columnaDe = (x: number, gs: number[][]) => gs.findIndex((g) => x >= g[0] && x <= g[g.length - 1]);

  // 3. Dos grupos vecinos que nunca aparecen en la misma fila son la misma columna
  //    (ej. números alineados a la derecha que empiezan en x distintas).
  let unidos = true;
  while (unidos) {
    unidos = false;
    for (let i = 0; i + 1 < grupos.length; i++) {
      const juntos = filas.some((f) => f.some((t) => columnaDe(t.x, grupos) === i) && f.some((t) => columnaDe(t.x, grupos) === i + 1));
      if (!juntos) {
        grupos = [...grupos.slice(0, i), [...grupos[i], ...grupos[i + 1]], ...grupos.slice(i + 2)];
        unidos = true;
        break;
      }
    }
  }

  return filas.map((f) => {
    const celdas = Array.from({ length: grupos.length }, () => [] as string[]);
    for (const t of f) celdas[columnaDe(t.x, grupos)].push(limpio(t.str));
    return celdas.map((c) => c.join(' '));
  });
}
