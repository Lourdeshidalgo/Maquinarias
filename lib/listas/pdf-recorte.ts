// Texto recortado (oculto) en un PDF.
//
// Algunos PDF de proveedores (ej. INGCO) traen texto de su plantilla de diseño que queda
// fuera del área recortada (clip) y por eso no se ve, pero pdf.js lo devuelve igual en
// getTextContent. Acá se recorre la lista de operaciones de la página (getOperatorList)
// llevando la matriz de transformación y el recorte vigentes, y se marca cada texto como
// visible u oculto según si empieza dentro del recorte. Puro: sin pdf.js, para testear.

/** Operación de pdf.js con el nombre de OPS (save, clip, showText…) y sus argumentos. */
export type Operacion = { fn: string; args: unknown };
export type OrigenTexto = { texto: string; x: number; y: number; visible: boolean };

type Matriz = [number, number, number, number, number, number];
type Caja = [number, number, number, number]; // x0, y0, x1, y1 en coordenadas de página
type Glifo = { unicode?: string; width?: number; isSpace?: boolean } | number | null;

const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];
const SIN_RECORTE: Caja = [-Infinity, -Infinity, Infinity, Infinity];
const TOLERANCIA = 1;

/** Aplica primero `a` y después `b` (como en PDF: a × b). */
const componer = (a: Matriz, b: Matriz): Matriz => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const punto = (m: Matriz, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function cajaEnPagina(m: Matriz, [x0, y0, x1, y1]: number[]): Caja {
  const esquinas = [punto(m, x0, y0), punto(m, x1, y0), punto(m, x0, y1), punto(m, x1, y1)];
  const xs = esquinas.map((p) => p[0]);
  const ys = esquinas.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const intersectar = (a: Caja, b: Caja): Caja => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
/** Matriz de 6 números; pdf.js las da como Array o Float32Array. */
const comoMatriz = (v: unknown): Matriz | null => {
  if (!v || typeof v !== 'object' || !('length' in v) || (v as ArrayLike<unknown>).length !== 6) return null;
  const arr = Array.from(v as ArrayLike<unknown>);
  return arr.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (arr as Matriz) : null;
};
const numeros = (v: unknown): number[] | null => {
  if (!v || typeof v !== 'object' || !('length' in v)) return null;
  const arr = Array.from(v as ArrayLike<unknown>);
  return arr.length >= 4 && arr.every((n) => typeof n === 'number') ? (arr as number[]) : null;
};

export function origenesDeTexto(ops: Operacion[]): OrigenTexto[] {
  const salida: OrigenTexto[] = [];
  const pila: { ctm: Matriz; recorte: Caja }[] = [];
  let ctm: Matriz = IDENTIDAD;
  let recorte: Caja = SIN_RECORTE;
  let recortarCon = false; // pdf.js pone "clip" antes del constructPath del área
  let tm: Matriz = IDENTIDAD;
  let tlm: Matriz = IDENTIDAD;
  let tamano = 0;
  let interlineado = 0;
  let espLetras = 0;
  let espPalabras = 0;

  const moverLinea = (tx: number, ty: number) => {
    tlm = componer([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };
  const mostrar = (glifos: Glifo[]) => {
    let texto = '';
    let avance = 0;
    let inicio: number | null = null; // avance hasta la primera letra (pdf.js no cuenta los espacios iniciales)
    for (const g of glifos) {
      if (typeof g === 'number') avance -= (g / 1000) * tamano;
      else if (g) {
        if (inicio === null && (g.unicode ?? '').trim()) inicio = avance;
        texto += g.unicode ?? '';
        avance += ((g.width ?? 0) / 1000) * tamano + espLetras + (g.isSpace ? espPalabras : 0);
      }
    }
    const [x, y] = punto(componer(componer([1, 0, 0, 1, inicio ?? 0, 0], tm), ctm), 0, 0);
    const visible = x >= recorte[0] - TOLERANCIA && x <= recorte[2] + TOLERANCIA && y >= recorte[1] - TOLERANCIA && y <= recorte[3] + TOLERANCIA;
    salida.push({ texto, x, y, visible });
    tm = componer([1, 0, 0, 1, avance, 0], tm);
  };

  for (const { fn, args } of ops) {
    const a = (Array.isArray(args) ? args : []) as unknown[];
    switch (fn) {
      case 'save':
        pila.push({ ctm, recorte });
        break;
      case 'restore': {
        const e = pila.pop();
        if (e) ({ ctm, recorte } = e);
        break;
      }
      case 'transform': {
        const m = comoMatriz(a);
        if (m) ctm = componer(m, ctm);
        break;
      }
      case 'paintFormXObjectBegin': {
        pila.push({ ctm, recorte });
        const m = comoMatriz(a[0]);
        if (m) ctm = componer(m, ctm);
        const caja = numeros(a[1]);
        if (caja) recorte = intersectar(recorte, cajaEnPagina(ctm, caja));
        break;
      }
      case 'paintFormXObjectEnd': {
        const e = pila.pop();
        if (e) ({ ctm, recorte } = e);
        break;
      }
      case 'clip':
      case 'eoClip':
        recortarCon = true;
        break;
      case 'constructPath': {
        if (recortarCon) {
          const caja = numeros(a[2]);
          if (caja) recorte = intersectar(recorte, cajaEnPagina(ctm, caja));
          recortarCon = false;
        }
        break;
      }
      case 'endPath':
        recortarCon = false;
        break;
      case 'beginText':
        tm = IDENTIDAD;
        tlm = IDENTIDAD;
        break;
      case 'setFont':
        tamano = typeof a[1] === 'number' ? a[1] : tamano;
        break;
      case 'setCharSpacing':
        espLetras = typeof a[0] === 'number' ? a[0] : 0;
        break;
      case 'setWordSpacing':
        espPalabras = typeof a[0] === 'number' ? a[0] : 0;
        break;
      case 'setLeading':
        interlineado = typeof a[0] === 'number' ? a[0] : interlineado;
        break;
      case 'setTextMatrix': {
        const m = comoMatriz(a[0]) ?? comoMatriz(a);
        if (m) {
          tm = m;
          tlm = m;
        }
        break;
      }
      case 'moveText':
        moverLinea(Number(a[0]) || 0, Number(a[1]) || 0);
        break;
      case 'setLeadingMoveText':
        interlineado = -(Number(a[1]) || 0);
        moverLinea(Number(a[0]) || 0, Number(a[1]) || 0);
        break;
      case 'nextLine':
        moverLinea(0, -interlineado);
        break;
      case 'showText':
      case 'showSpacedText':
        if (Array.isArray(a[0])) mostrar(a[0] as Glifo[]);
        break;
      case 'nextLineShowText':
        moverLinea(0, -interlineado);
        if (Array.isArray(a[0])) mostrar(a[0] as Glifo[]);
        break;
      case 'nextLineSetSpacingShowText':
        espPalabras = Number(a[0]) || 0;
        espLetras = Number(a[1]) || 0;
        moverLinea(0, -interlineado);
        if (Array.isArray(a[2])) mostrar(a[2] as Glifo[]);
        break;
    }
  }
  return salida;
}

/**
 * Saca de la página los textos que empiezan donde hay un texto recortado. Si en ese lugar
 * hay también uno visible (dos textos en el mismo punto), se deja.
 */
export function sinTextoRecortado<T extends { str: string; x: number; y: number }>(pagina: T[], origenes: OrigenTexto[]): T[] {
  const cerca = 1.5;
  const norm = (s: string) => s.replace(/\s+/g, '');
  return pagina.filter((t) => {
    const enLugar = origenes.filter((o) => Math.abs(o.x - t.x) <= cerca && Math.abs(o.y - t.y) <= cerca);
    // Si en el mismo lugar hay textos distintos (uno visible y otro oculto), decide el que coincide en texto.
    const s = norm(t.str);
    const mismos = enLugar.filter((o) => s && (norm(o.texto).includes(s) || s.includes(norm(o.texto))));
    const candidatos = mismos.length ? mismos : enLugar;
    return !candidatos.length || candidatos.some((o) => o.visible);
  });
}
