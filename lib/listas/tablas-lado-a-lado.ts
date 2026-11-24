// Listas armadas "para imprimir": varias tablas una al lado de la otra en la
// misma hoja (ej. DIBRA: columnas A-E y G-K), con títulos de categoría entre
// medio y secciones donde las columnas se corren (aparece "Aplicación" o una
// columna vacía). El mapeo por columnas no sirve para eso, así que acá se
// desarma la hoja y se arma una sola tabla:
//
//   Código | Descripción | Precio | Efectivo | Tarjeta | Rubro | Moneda
//
// Moneda: si casi todos los precios vienen con "$" (pesos) y algunos son un
// número pelado (en DIBRA, los motores nafteros), esos se toman en dólares.
//
// Sin nada de Node ni de la base: se usa en el navegador y en los tests.

import { detectarMoneda, parseNumero } from './parseo.ts';

export const ENCABEZADO_UNIDO = ['Código', 'Descripción', 'Precio', 'Efectivo', 'Tarjeta', 'Rubro', 'Moneda'] as const;

export type TablaUnida = {
  filas: unknown[][]; // primera fila = ENCABEZADO_UNIDO
  productos: number;
  bloques: number; // tablas lado a lado
  categorias: string[];
  enDolares: number; // productos que quedaron en USD
};

type Campo = 'codigo' | 'descripcion' | 'aplicacion' | 'precio' | 'efectivo' | 'tarjeta';
type Diseno = Partial<Record<Campo, number>>; // columna absoluta de cada campo

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const clave = (v: unknown) =>
  texto(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const esTituloCodigo = (v: unknown) => /^(cod|codigo|cod\.? articulo|articulo)\b/.test(clave(v)) && clave(v).length <= 20;

function campoDeTitulo(v: unknown): Campo | null {
  const t = clave(v);
  if (!t) return null;
  if (esTituloCodigo(t)) return 'codigo';
  if (/^(descrip|detalle|producto|nombre)/.test(t)) return 'descripcion';
  if (/^aplicacion/.test(t)) return 'aplicacion';
  if (/^(precio|p\.? ?unit)/.test(t)) return 'precio';
  if (/^(efectivo|contado)/.test(t)) return 'efectivo';
  if (/^(lista|credito|tarjeta)/.test(t)) return 'tarjeta';
  return null;
}

/** Fila de títulos de una tabla que empieza en la columna `desde`. */
function disenoDesde(fila: unknown[], desde: number, hasta: number): Diseno | null {
  if (!esTituloCodigo(fila[desde])) return null;
  const d: Diseno = {};
  for (let c = desde; c < hasta; c++) {
    const campo = campoDeTitulo(fila[c]);
    if (campo && d[campo] === undefined) d[campo] = c;
  }
  return d.precio !== undefined ? d : null;
}

/**
 * Si la hoja tiene tablas lado a lado, devuelve una sola tabla con todos los
 * productos (con la categoría de cada uno).
 * Si es una lista común (una sola tabla), devuelve null y se usa tal cual.
 */
export function unirTablas(filas: unknown[][]): TablaUnida | null {
  // 1. Dónde empieza cada tabla: un título "Código" con "Descripción" (o "Aplicación") y
  //    "Precio" a la derecha. En una misma fila, un título que cae dentro de la tabla
  //    anterior es otra columna de esa tabla (ej. "ARTICULO TMC | ARTICULO OEM"), no otra tabla.
  const inicios = new Set<number>();
  filas.forEach((fila) => {
    fila = fila || [];
    let libreDesde = 0;
    for (let c = 0; c < fila.length; c++) {
      if (c < libreDesde || !esTituloCodigo(fila[c])) continue;
      const d = disenoDesde(fila, c, c + 7);
      if (!d || (d.descripcion === undefined && d.aplicacion === undefined)) continue;
      inicios.add(c);
      libreDesde = Math.max(...Object.values(d)) + 1;
    }
  });
  const columnas = [...inicios].sort((a, b) => a - b);
  // Una sola tabla por fila (aunque repita encabezados): se usa la lista tal cual.
  if (columnas.length < 2) return null;

  const salida: unknown[][] = [[...ENCABEZADO_UNIDO]];
  const categorias: string[] = [];
  const vistos = new Set<string>();

  // 2. Cada tabla se recorre de arriba hacia abajo, con su último encabezado y su categoría.
  columnas.forEach((desde, i) => {
    const hasta = columnas[i + 1] ?? desde + 8;
    let diseno: Diseno | null = null;
    let categoria = '';
    let ultimoFueTitulo = false;
    filas.forEach((fila) => {
      fila = fila || [];
      const nuevo = disenoDesde(fila, desde, hasta);
      if (nuevo) {
        // Un encabezado que no viene justo después de un título arranca una sección sin categoría.
        if (!ultimoFueTitulo) categoria = '';
        diseno = nuevo;
        ultimoFueTitulo = false;
        return;
      }
      const primera = texto(fila[desde]);
      if (!primera) return;
      const d = diseno as Diseno | null;
      const precio = d?.precio !== undefined ? parseNumero(fila[d.precio]) : null;

      if (precio === null) {
        // Texto sin precio en la primera columna: título de categoría (el resto de la fila
        // vacío o con títulos tipo "EFECTIVO | LISTA").
        // Las filas de texto antes del primer encabezado son el título de la hoja, no una categoría.
        if (!d) return;
        const resto = (fila.slice(desde + 1, hasta) as unknown[]).map(texto).filter((t) => /[a-z0-9]/i.test(t)); // "$ -" no cuenta
        if (resto.every((t) => campoDeTitulo(t))) {
          categoria = primera;
          ultimoFueTitulo = true;
          if (!vistos.has(primera)) {
            vistos.add(primera);
            categorias.push(primera);
          }
        }
        return;
      }
      if (!d) return;
      const descripcion = d.descripcion !== undefined ? texto(fila[d.descripcion]) : '';
      const aplicacion = d.aplicacion !== undefined ? texto(fila[d.aplicacion]) : '';
      // Si hay descripción y aplicación, la aplicación (modelos) va entre paréntesis.
      const desc = descripcion && aplicacion ? `${descripcion} (${aplicacion})` : descripcion || aplicacion;
      const efectivo = d.efectivo !== undefined ? parseNumero(fila[d.efectivo]) : null;
      const tarjeta = d.tarjeta !== undefined ? parseNumero(fila[d.tarjeta]) : null;
      ultimoFueTitulo = false;
      salida.push([primera, desc, fila[d.precio as number], efectivo ?? '', tarjeta ?? '', categoria, '']);
    });
  });

  // 3. Moneda de cada precio
  const productos = salida.slice(1);
  const conPesos = productos.filter((f) => /\$/.test(String(f[2])) && detectarMoneda(f[2]) === 'ARS').length;
  const listaEnPesos = productos.length > 0 && conPesos / productos.length >= 0.8;
  let enDolares = 0;
  for (const f of productos) {
    const marcada = detectarMoneda(f[2]);
    const usd = marcada === 'USD' || (marcada === null && listaEnPesos);
    if (usd) {
      f[6] = 'USD';
      enDolares++;
    }
  }

  return { filas: salida, productos: productos.length, bloques: columnas.length, categorias, enDolares };
}
