// Parseo de listas de precios de proveedores. Se usa en el navegador (lectura
// del archivo) y en el servidor (validación y matching), así que no importa
// nada de Node ni de la base de datos.

export type CampoLista = 'codigo' | 'codigoFabricante' | 'descripcion' | 'precio' | 'moneda' | 'marca' | 'rubro' | 'bonificacion';

export const CAMPOS_LISTA: { campo: CampoLista; etiqueta: string; obligatorio: boolean }[] = [
  { campo: 'codigo', etiqueta: 'Código del proveedor', obligatorio: false },
  { campo: 'codigoFabricante', etiqueta: 'N° de parte / OEM', obligatorio: false },
  { campo: 'descripcion', etiqueta: 'Descripción', obligatorio: true },
  { campo: 'precio', etiqueta: 'Precio', obligatorio: true },
  { campo: 'moneda', etiqueta: 'Moneda', obligatorio: false },
  { campo: 'marca', etiqueta: 'Marca', obligatorio: false },
  { campo: 'rubro', etiqueta: 'Rubro / categoría', obligatorio: false },
  { campo: 'bonificacion', etiqueta: 'Bonificación por fila', obligatorio: false },
];

/** Mapeo de columnas guardado como plantilla por proveedor. Columnas por índice (0 = A). */
export type MapeoLista = {
  hoja?: string; // nombre de la hoja (Excel)
  filaInicio: number; // primera fila con datos, 1 = primera fila del archivo
  columnas: Partial<Record<CampoLista, number>>;
  incluyeIva: boolean; // los precios de la lista ya traen IVA
  monedaDefault: 'ARS' | 'USD'; // si no hay columna de moneda (o viene vacía)
  bonificacionGeneral?: string; // ej "10+5", se aplica a toda la lista si no hay columna
  ivaProductosNuevos?: number; // alícuota para los productos que se creen desde la lista
  modoPdf?: 'catalogo' | 'fichas' | 'tabla'; // PDF: catálogo = código → descripción → precio; fichas = código y precio en la misma línea; tabla = columnas
};

/** Fila ya estructurada que el navegador manda al servidor. */
export type FilaLista = {
  fila: number; // nº de fila en el archivo (1 = primera)
  codigo: string | null;
  codigoFabricante: string | null; // N° de parte del fabricante (OEM), para cruzar entre proveedores
  descripcion: string | null;
  precio: number | null;
  moneda: 'ARS' | 'USD';
  marca: string | null;
  rubro: string | null;
  bonificaciones: string | null;
};

/** Letra de columna estilo Excel: 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Convierte un precio como venga en la lista a número:
 *   1234.5 | "1.234,50" | "$ 1.234,50" | "USD 1,234.50" | "1234,5" | "12.500"
 * Devuelve null si no hay un número reconocible.
 */
export function parseNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  let s = String(valor).trim();
  const negativo = /^-|\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const ultimoPunto = s.lastIndexOf('.');
  const ultimaComa = s.lastIndexOf(',');

  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // El separador que aparece último es el decimal.
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    // Solo comas: una sola es decimal ("1234,5"); varias son miles ("1,234,567").
    const partes = s.split(',');
    s = partes.length === 2 ? `${partes[0]}.${partes[1]}` : partes.join('');
  } else if (ultimoPunto >= 0) {
    // Solo puntos: "12.500" o "1.234.567" son miles (formato argentino); "1234.5" decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Detecta dólares en una celda de moneda o en el texto del precio. */
export function detectarMoneda(valor: unknown): 'ARS' | 'USD' | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).toUpperCase().replace(/\s/g, '');
  if (!s) return null;
  if (/U\$S|US\$|USD|U\$D|DOLAR|DÓLAR|DOL\b|^U\$|^DOL/.test(s)) return 'USD';
  if (/ARS|\$|PESO/.test(s)) return 'ARS';
  return null;
}

const quitarAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Texto normalizado para comparar: minúsculas, sin acentos ni símbolos. */
export function normalizarTexto(s: string | null | undefined): string {
  return quitarAcentos(String(s || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2') // "52cc" → "52 cc"
    .replace(/([a-z])(\d)/g, '$1 $2') // "ms250" → "ms 250"
    .trim();
}

/** Código normalizado para comparar: sin espacios ni guiones, en mayúsculas. */
export function normalizarCodigo(s: string | null | undefined): string {
  return String(s || '').replace(/[\s\-_.\/]/g, '').toUpperCase();
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'para', 'con', 'sin', 'y', 'x', 'en', 'por', 'los', 'las']);

export function tokens(s: string | null | undefined): string[] {
  return Array.from(
    new Set(normalizarTexto(s).split(' ').filter((t) => t.length >= 2 && !PALABRAS_VACIAS.has(t)))
  );
}

/** Similitud de Jaccard entre dos conjuntos de palabras (0 a 1). */
export function similitud(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const t of a) if (sb.has(t)) inter++;
  return inter / (a.length + b.length - inter);
}

const PISTAS: Record<CampoLista, RegExp> = {
  // Va primero: el orden de las claves decide ("ARTICULO OEM" es OEM, no código; "Fabricante" es el N° de parte).
  codigoFabricante: /(oem|original|fabricante|n[°º]?\s*de\s*parte|nro\.?\s*parte|part\s*n)/,
  codigo: /^(cod|codigo|código|art|articulo|artículo|ref|referencia|sku|item|nro|n°|nº)\b/,
  descripcion: /(descrip|detalle|producto|articulo|artículo|nombre|denominacion|denominación)/,
  precio: /(precio|lista|importe|valor|p\.?\s?unit|costo|neto)/,
  moneda: /(moneda|mon\b|divisa)/,
  marca: /(marca)/,
  rubro: /(rubro|categoria|categoría|familia|linea|línea|grupo)/,
  bonificacion: /(bonif|dto|desc\.?|descuento)/,
};

/**
 * Busca la fila de encabezados en las primeras filas y adivina qué columna es
 * cada campo. Devuelve la fila de inicio de datos (1-based) y las columnas.
 */
export function adivinarMapeo(filas: unknown[][]): Pick<MapeoLista, 'filaInicio' | 'columnas'> {
  let mejor = { fila: -1, puntaje: 0, columnas: {} as Partial<Record<CampoLista, number>> };

  for (let f = 0; f < Math.min(filas.length, 30); f++) {
    const fila = filas[f] || [];
    const columnas: Partial<Record<CampoLista, number>> = {};
    fila.forEach((celda, c) => {
      const t = quitarAcentos(String(celda ?? '').toLowerCase().trim());
      if (!t || t.length > 40) return;
      for (const campo of Object.keys(PISTAS) as CampoLista[]) {
        if (columnas[campo] === undefined && PISTAS[campo].test(t)) {
          columnas[campo] = c;
          break;
        }
      }
    });
    const puntaje = Object.keys(columnas).length + (columnas.precio !== undefined ? 2 : 0) + (columnas.descripcion !== undefined ? 2 : 0);
    if (puntaje > mejor.puntaje) mejor = { fila: f, puntaje, columnas };
  }

  if (mejor.fila >= 0 && mejor.puntaje >= 4) {
    return { filaInicio: mejor.fila + 2, columnas: mejor.columnas };
  }
  return { filaInicio: 1, columnas: {} };
}

const celdaTexto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/** Aplica el mapeo a las filas crudas de la hoja y devuelve solo las filas con datos. */
export function extraerFilas(filas: unknown[][], mapeo: MapeoLista): FilaLista[] {
  const c = mapeo.columnas;
  const salida: FilaLista[] = [];
  const get = (fila: unknown[], campo: CampoLista) => (c[campo] === undefined ? undefined : fila[c[campo] as number]);

  for (let i = Math.max(0, mapeo.filaInicio - 1); i < filas.length; i++) {
    const fila = filas[i] || [];
    const codigo = celdaTexto(get(fila, 'codigo'));
    const descripcion = celdaTexto(get(fila, 'descripcion'));
    const precioCrudo = get(fila, 'precio');
    if (!codigo && !descripcion && (precioCrudo === undefined || precioCrudo === '')) continue; // fila vacía

    const precio = parseNumero(precioCrudo);
    // Filas de título/sección (un solo texto y sin precio) se saltean. Las que
    // tienen código y descripción pero no precio quedan, para marcarlas con error.
    if (precio === null && (!codigo || !descripcion)) continue;

    const moneda = detectarMoneda(get(fila, 'moneda')) || detectarMoneda(precioCrudo) || mapeo.monedaDefault;

    salida.push({
      fila: i + 1,
      codigo,
      codigoFabricante: celdaTexto(get(fila, 'codigoFabricante')),
      descripcion,
      precio,
      moneda,
      marca: celdaTexto(get(fila, 'marca')),
      rubro: celdaTexto(get(fila, 'rubro')),
      bonificaciones: celdaTexto(get(fila, 'bonificacion')) || mapeo.bonificacionGeneral || null,
    });
  }
  return salida;
}
