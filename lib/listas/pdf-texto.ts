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
const MAX_TEXTOS_DESCRIPCION = 3;
const MIN_PRODUCTOS_CATALOGO = 10;
const MIN_REPETICIONES_RUIDO = 5;

const limpio = (s: string) => s.replace(/\s+/g, ' ').trim();
const esPrecio = (s: string) => RE_PRECIO.test(s);

export const tieneTexto = (paginas: PaginaPdf[]) => paginas.some((p) => p.some((t) => t.str.trim()));

/** Textos que se repiten en todo el documento ("PRECIO OFERTA", "Cantidad:"): no son descripción. */
function ruido(paginas: PaginaPdf[]): Set<string> {
  const cuenta = new Map<string, number>();
  for (const p of paginas) for (const t of p) {
    const s = limpio(t.str);
    if (s && !esPrecio(s)) cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
  }
  return new Set([...cuenta].filter(([, n]) => n >= MIN_REPETICIONES_RUIDO).map(([s]) => s));
}

export function leerCatalogo(paginas: PaginaPdf[], monedaDefault: 'ARS' | 'USD'): FilaLista[] {
  const repetidos = ruido(paginas);
  // Si el PDF marca los códigos con "#", solo esos cuentan (evita tomar "EC-08" o "CRV50" como código).
  const conNumeral = paginas.reduce((n, p) => n + p.filter((t) => RE_CODIGO_NUMERAL.test(limpio(t.str))).length, 0) >= 5;
  const salida: FilaLista[] = [];
  let abierto: { fila: FilaLista; desc: string[] } | null = null;

  const cerrar = () => {
    if (abierto) abierto.fila.descripcion = abierto.desc.join(' ').slice(0, 500) || null;
    abierto = null;
  };

  paginas.forEach((pagina, ip) => {
    let orden = 0;
    for (const t of pagina) {
      const s = limpio(t.str);
      if (!s || repetidos.has(s)) continue;
      const esCodigo = conNumeral ? RE_CODIGO_NUMERAL.test(s) : !abierto && RE_CODIGO.test(s) && /\d/.test(s) && !esPrecio(s);
      if (esCodigo) {
        cerrar();
        orden += 1;
        const fila: FilaLista = {
          fila: (ip + 1) * 1000 + orden, codigo: s.replace(/^#/, '').slice(0, 120), codigoFabricante: null, descripcion: null,
          precio: null, moneda: monedaDefault, marca: null, rubro: null, bonificaciones: null,
        };
        salida.push(fila);
        abierto = { fila, desc: [] };
        continue;
      }
      if (!abierto) continue;
      if (esPrecio(s)) {
        const precio = parseNumero(s);
        abierto.fila.precio = precio !== null && precio > 0 && precio < 1e12 ? precio : null;
        if (/^(U\$S|US\$|USD)/i.test(s)) abierto.fila.moneda = 'USD';
        cerrar();
        continue;
      }
      if (abierto.desc.length < MAX_TEXTOS_DESCRIPCION) abierto.desc.push(s);
    }
  });
  cerrar();
  return salida;
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
