// Lectura del padrón de clientes desde las filas de un Excel (sin base de datos,
// para poder probarla). La usan la importación y los tests de ida y vuelta con
// la exportación.

export type ClienteImportado = {
  fila: number; // N° de fila en el Excel (para los avisos)
  codigo: number | null;
  razonSocial: string;
  tipoDoc: 'CUIT' | 'DNI' | '99';
  nroDoc: string;
  condicionIva: string;
  direccion: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  notas: string | null;
};

// Títulos de columna aceptados (sin tildes, en mayúsculas)
const COLUMNAS: Record<keyof Omit<ClienteImportado, 'fila' | 'tipoDoc' | 'nroDoc' | 'notas'> | 'nombre' | 'documento' | 'referencia' | 'apodo' | 'nextel' | 'observaciones', string[]> = {
  codigo: ['CODIGO', 'COD', 'N CLIENTE', 'NRO CLIENTE', 'NUMERO DE CLIENTE', 'ID'],
  nombre: ['NOMBRE', 'NOMBRE Y APELLIDO', 'CLIENTE'],
  razonSocial: ['RAZON SOCIAL'],
  direccion: ['DIRECCION', 'DOMICILIO'],
  telefono: ['TELEFONO', 'TEL'],
  celular: ['CELULAR', 'WHATSAPP', 'CEL', 'MOVIL'],
  nextel: ['NEXTEL'],
  localidad: ['LOCALIDAD', 'CIUDAD'],
  codigoPostal: ['CP', 'CODIGO POSTAL'],
  provincia: ['PROVINCIA'],
  documento: ['CUIT', 'CUIL', 'DNI', 'CUIT/DNI', 'DOCUMENTO', 'NRO DOC'],
  email: ['EMAIL', 'E-MAIL', 'MAIL', 'CORREO'],
  condicionIva: ['CONDICION IVA', 'IVA', 'COND IVA', 'CONDICION FRENTE AL IVA'],
  referencia: ['REFERENCIA'],
  apodo: ['APODO / NICK', 'APODO', 'NICK'],
  observaciones: ['OBSERVACIONES', 'NOTAS'],
};

export const normalizarTitulo = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[°º.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Valor de una celda, o null si está vacía o es un relleno tipo "------" o "--/--". */
function celda(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || /^[-_/.\s]+$/.test(s)) return null;
  return s;
}

function condicionIva(v: string | null): string {
  const t = normalizarTitulo(v);
  if (t.includes('INSCRIPTO')) return 'Responsable Inscripto';
  if (t.includes('MONOTRIBUT')) return 'Monotributista';
  if (t.includes('EXENTO') || t.includes('NO ALCANZADO')) return 'Exento';
  if (t.includes('CONSUMIDOR')) return 'Consumidor Final';
  // Sin dato: queda como consumidor final (se corrige en la ficha si hace falta factura A)
  return 'Consumidor Final';
}

/** Busca la fila de títulos (en las primeras 15) y arma el mapa columna → índice. */
function detectarColumnas(filas: unknown[][]) {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const titulos = (filas[i] ?? []).map(normalizarTitulo);
    const mapa: Partial<Record<keyof typeof COLUMNAS, number>> = {};
    for (const [campo, nombres] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string[]][]) {
      const idx = titulos.findIndex((t) => nombres.includes(t));
      if (idx >= 0) mapa[campo] = idx;
    }
    if (mapa.nombre !== undefined || mapa.razonSocial !== undefined) return { inicio: i + 1, mapa };
  }
  return null;
}

export function interpretarFilas(filas: unknown[][]) {
  const det = detectarColumnas(filas);
  if (!det) throw new Error('No encontré la fila de títulos: el Excel tiene que tener una columna "Nombre" o "Razón social".');
  const { inicio, mapa } = det;
  const col = (fila: unknown[], campo: keyof typeof COLUMNAS) => (mapa[campo] === undefined ? null : celda(fila[mapa[campo]!]));

  const clientes: ClienteImportado[] = [];
  const avisos: string[] = [];
  let omitidos = 0;
  const codigosVistos = new Set<number>();
  const docsVistos = new Set<string>();

  for (let i = inicio; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const n = i + 1;
    if (!fila.some((v) => celda(v))) continue; // fila vacía

    const nombre = col(fila, 'nombre');
    const razon = col(fila, 'razonSocial');
    const razonSocial = (razon || nombre || '').slice(0, 150);
    if (!razonSocial) {
      omitidos++;
      avisos.push(`Fila ${n}: sin nombre, no se importa.`);
      continue;
    }

    let codigo: number | null = null;
    const codTexto = col(fila, 'codigo');
    if (codTexto && /^\d{1,9}$/.test(codTexto.replace(/\D/g, '')) && codTexto.replace(/\D/g, '')) {
      codigo = parseInt(codTexto.replace(/\D/g, ''), 10);
      if (codigosVistos.has(codigo)) {
        avisos.push(`Fila ${n} (${razonSocial}): el N° de cliente ${codigo} está repetido, se carga sin número.`);
        codigo = null;
      } else codigosVistos.add(codigo);
    }

    // Documento: 11 dígitos = CUIT, 7 u 8 = DNI. Si falta o está repetido, queda "sin identificar".
    const docDigitos = (col(fila, 'documento') ?? '').replace(/\D/g, '');
    let tipoDoc: ClienteImportado['tipoDoc'] = '99';
    let nroDoc = '';
    if (docDigitos.length === 11) tipoDoc = 'CUIT';
    else if (docDigitos.length === 7 || docDigitos.length === 8) tipoDoc = 'DNI';
    else if (docDigitos) avisos.push(`Fila ${n} (${razonSocial}): el documento "${col(fila, 'documento')}" no es un CUIT ni un DNI, se carga sin documento.`);
    if (tipoDoc !== '99') {
      const clave = `${tipoDoc}:${docDigitos}`;
      if (docsVistos.has(clave)) {
        avisos.push(`Fila ${n} (${razonSocial}): el ${tipoDoc} ${docDigitos} ya está en otro cliente del archivo, se carga sin documento.`);
        tipoDoc = '99';
      } else {
        docsVistos.add(clave);
        nroDoc = docDigitos;
      }
    }
    // Sin documento: AFIP recibe 0 igual; guardamos un identificador único interno.
    if (tipoDoc === '99') nroDoc = codigo !== null ? `C${codigo}` : `F${n}`;

    const telefono = col(fila, 'telefono');
    const celular = col(fila, 'celular') ?? col(fila, 'nextel');
    const email = col(fila, 'email');
    const notas = [
      nombre && razon && nombre.toLowerCase() !== razon.toLowerCase() ? `Nombre: ${nombre}` : null,
      col(fila, 'apodo') ? `Apodo: ${col(fila, 'apodo')}` : null,
      col(fila, 'referencia') ? `Referencia: ${col(fila, 'referencia')}` : null,
      col(fila, 'observaciones'),
    ].filter(Boolean).join(' · ');

    clientes.push({
      fila: n,
      codigo,
      razonSocial,
      tipoDoc,
      nroDoc,
      condicionIva: condicionIva(col(fila, 'condicionIva')),
      direccion: col(fila, 'direccion')?.slice(0, 200) ?? null,
      telefono: (telefono ?? celular)?.slice(0, 50) ?? null,
      celular: celular?.slice(0, 50) ?? null,
      email: email && /@/.test(email) ? email.slice(0, 150) : null,
      localidad: col(fila, 'localidad')?.slice(0, 100) ?? null,
      provincia: col(fila, 'provincia')?.slice(0, 100) ?? null,
      codigoPostal: col(fila, 'codigoPostal')?.slice(0, 20) ?? null,
      notas: notas ? notas.slice(0, 1000) : null,
    });
  }
  return { clientes, avisos, omitidos, filas: Math.max(0, filas.length - inicio) };
}

// ---------------------------------------------------------------------------
// Exportación: el Excel sale con los mismos títulos que reconoce la
// importación, así el archivo se puede volver a subir (en esta u otra empresa).

export type ClienteExportable = {
  codigo: number | null;
  razonSocial: string;
  tipoDoc: string;
  nroDoc: string;
  condicionIva: string;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  notas: string | null;
  limiteCredito: number | string | { toString(): string } | null;
  saldoCuentaCorriente: number | string | { toString(): string };
  createdAt: Date | string;
};

/** El cliente genérico "Consumidor Final" del POS: no se exporta. */
export const esConsumidorFinalGenerico = (c: { tipoDoc: string; nroDoc: string }) => c.tipoDoc === '99' && c.nroDoc === '0';

const numero = (v: ClienteExportable['limiteCredito']) => (v === null || v === undefined ? null : Number(v.toString()));

/** Una fila del Excel por cliente. Las tres últimas columnas son informativas: al importar no se leen. */
export function filasExportacion(clientes: ClienteExportable[]) {
  return clientes
    .filter((c) => !esConsumidorFinalGenerico(c))
    .map((c) => ({
      'N° cliente': c.codigo ?? '',
      'Razón social': c.razonSocial,
      'CUIT/DNI': c.tipoDoc === '99' ? '' : c.nroDoc, // sin documento: el identificador interno no sirve afuera
      'Condición IVA': c.condicionIva,
      Dirección: c.direccion ?? '',
      Localidad: c.localidad ?? '',
      Provincia: c.provincia ?? '',
      'Código postal': c.codigoPostal ?? '',
      Teléfono: c.telefono ?? '',
      Celular: c.celular ?? '',
      Email: c.email ?? '',
      Notas: c.notas ?? '',
      'Límite de crédito': numero(c.limiteCredito) ?? '',
      'Saldo cuenta corriente': numero(c.saldoCuentaCorriente) ?? 0,
      Alta: new Date(c.createdAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    }));
}

// ---------------------------------------------------------------------------
// Cruce con los clientes que ya están cargados.

export type ClienteExistente = { id: string; codigo: number | null; tipoDoc: string; nroDoc: string; razonSocial: string };

const claveNombre = (s: string) => normalizarTitulo(s);

/**
 * Arma el buscador: primero por N° de cliente, después por documento y, para
 * los que no tienen ninguno de los dos, por nombre (solo si hay un único
 * cliente sin documento con ese nombre). Así volver a subir un Excel exportado
 * actualiza los clientes en lugar de duplicarlos.
 */
export function indiceExistentes(existentes: ClienteExistente[]) {
  const porCodigo = new Map(existentes.filter((e) => e.codigo !== null).map((e) => [e.codigo as number, e.id]));
  const porDoc = new Map(existentes.map((e) => [`${e.tipoDoc}:${e.nroDoc}`, e.id]));
  const porNombre = new Map<string, string | null>(); // null = nombre repetido, no se usa
  for (const e of existentes) {
    if (e.tipoDoc !== '99' || esConsumidorFinalGenerico(e)) continue;
    const k = claveNombre(e.razonSocial);
    porNombre.set(k, porNombre.has(k) ? null : e.id);
  }
  return {
    porCodigo,
    buscar(c: Pick<ClienteImportado, 'codigo' | 'tipoDoc' | 'nroDoc' | 'razonSocial'>): string | undefined {
      if (c.codigo !== null && porCodigo.has(c.codigo)) return porCodigo.get(c.codigo);
      const porDocumento = porDoc.get(`${c.tipoDoc}:${c.nroDoc}`);
      if (porDocumento) return porDocumento;
      if (c.tipoDoc === '99' && c.codigo === null) return porNombre.get(claveNombre(c.razonSocial)) ?? undefined;
      return undefined;
    },
  };
}
