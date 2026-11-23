'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, RotateCw, FileText } from 'lucide-react';
import type { PDFDocument } from 'pdf-lib';
import type { FilaLista } from '@/lib/listas/parseo';

// Lectura de una lista en PDF: el navegador corta el PDF en tramos de pocas páginas y
// los manda de a uno a /api/tenant/listas/pdf/leer (Claude). Un tramo que falla se
// reintenta solo; los demás se conservan.

const PAGINAS_POR_TRAMO = 10;
const MAX_BYTES_TRAMO = 3.5 * 1024 * 1024;

type Tramo = { desde: number; hasta: number; estado: 'pendiente' | 'leyendo' | 'ok' | 'error'; filas: FilaLista[]; error?: string };

export type ResultadoPdf = { filas: FilaLista[]; completo: boolean; leyendo: boolean };

function armarTramos(paginas: number): Tramo[] {
  const t: Tramo[] = [];
  for (let d = 1; d <= paginas; d += PAGINAS_POR_TRAMO) {
    t.push({ desde: d, hasta: Math.min(paginas, d + PAGINAS_POR_TRAMO - 1), estado: 'pendiente', filas: [] });
  }
  return t;
}

async function recortar(doc: PDFDocument, desde: number, hasta: number): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const nuevo = await PDFDocument.create();
  const indices = Array.from({ length: hasta - desde + 1 }, (_, i) => desde - 1 + i);
  const paginas = await nuevo.copyPages(doc, indices);
  paginas.forEach((p) => nuevo.addPage(p));
  return nuevo.save();
}

export default function LecturaPdf({
  archivo, monedaDefault, onCambio,
}: {
  archivo: File;
  monedaDefault: 'ARS' | 'USD';
  onCambio: (r: ResultadoPdf) => void;
}) {
  const docRef = useRef<PDFDocument | null>(null);
  const [paginas, setPaginas] = useState<number | null>(null);
  const [errorApertura, setErrorApertura] = useState('');
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [leyendo, setLeyendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(await archivo.arrayBuffer(), { ignoreEncryption: true });
        if (!vigente) return;
        docRef.current = doc;
        setPaginas(doc.getPageCount());
        setTramos(armarTramos(doc.getPageCount()));
      } catch {
        if (vigente) setErrorApertura('No se pudo abrir el PDF. Revisá que no esté dañado o protegido.');
      }
    })();
    return () => {
      vigente = false;
    };
  }, [archivo]);

  useEffect(() => {
    const filas = tramos.flatMap((t) => t.filas);
    const completo = tramos.length > 0 && tramos.every((t) => t.estado === 'ok');
    onCambio({ filas, completo, leyendo });
    // onCambio cambia en cada render del padre: solo interesa avisar cuando cambian los tramos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramos, leyendo]);

  const leerTramo = async (lista: Tramo[], i: number): Promise<Tramo[]> => {
    const doc = docRef.current;
    if (!doc) return lista;
    const t = lista[i];
    const marcar = (cambio: Partial<Tramo>) => {
      lista = lista.map((x, j) => (j === i ? { ...x, ...cambio } : x));
      setTramos(lista);
    };
    let bytes: Uint8Array;
    try {
      bytes = await recortar(doc, t.desde, t.hasta);
    } catch {
      marcar({ estado: 'error', error: 'No se pudieron separar estas páginas del PDF.' });
      return lista;
    }
    if (bytes.byteLength > MAX_BYTES_TRAMO && t.hasta > t.desde) {
      // Tramo muy pesado: se parte a la mitad y se lee cada mitad.
      const medio = Math.floor((t.desde + t.hasta) / 2);
      const partida = [
        ...lista.slice(0, i),
        { ...t, hasta: medio, estado: 'pendiente' as const },
        { ...t, desde: medio + 1, estado: 'pendiente' as const },
        ...lista.slice(i + 1),
      ];
      setTramos(partida);
      return leerTramo(partida, i);
    }
    marcar({ estado: 'leyendo', error: undefined });
    try {
      const form = new FormData();
      form.append('archivo', new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'tramo.pdf');
      form.append('desde', String(t.desde));
      form.append('monedaDefault', monedaDefault);
      const r = await fetch('/api/tenant/listas/pdf/leer', { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudieron leer estas páginas.');
      marcar({ estado: 'ok', filas: d.filas as FilaLista[] });
    } catch (e) {
      marcar({ estado: 'error', error: (e as Error).message || 'No se pudieron leer estas páginas.' });
    }
    return lista;
  };

  /** Lee en orden los tramos pendientes. Reintentar = volver a dejar ese tramo pendiente. */
  const leerPendientes = async (reintentar?: number) => {
    setLeyendo(true);
    let lista = reintentar === undefined ? tramos : tramos.map((t, j) => (j === reintentar ? { ...t, estado: 'pendiente' as const } : t));
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].estado === 'pendiente') lista = await leerTramo(lista, i);
    }
    setLeyendo(false);
  };

  if (errorApertura) {
    return <p style={{ color: '#b91c1c' }}>{errorApertura}</p>;
  }
  if (paginas === null) {
    return (
      <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Loader2 size={16} className="spin" /> Abriendo el PDF…
      </p>
    );
  }

  const leidas = tramos.filter((t) => t.estado === 'ok').reduce((n, t) => n + (t.hasta - t.desde + 1), 0);
  const productos = tramos.reduce((n, t) => n + t.filas.length, 0);
  const actual = tramos.find((t) => t.estado === 'leyendo');
  const iniciado = tramos.some((t) => t.estado !== 'pendiente');
  const conError = tramos.map((t, i) => ({ t, i })).filter(({ t }) => t.estado === 'error');

  return (
    <div>
      {!iniciado ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <FileText size={18} />
            {paginas} {paginas === 1 ? 'página' : 'páginas'} · se lee con Claude y tarda unos minutos
          </span>
          <button type="button" className="btn btn-primary" onClick={() => leerPendientes()} disabled={leyendo}>
            Leer lista
          </button>
        </div>
      ) : (
        <>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }} aria-live="polite">
            {actual ? (
              <><Loader2 size={16} className="spin" /> Leyendo páginas {actual.desde} a {actual.hasta} de {paginas}…</>
            ) : conError.length ? (
              <><AlertTriangle size={16} style={{ color: '#b45309' }} /> Algunas páginas no se pudieron leer.</>
            ) : leidas === paginas ? (
              <><CheckCircle2 size={16} style={{ color: '#15803d' }} /> Lista leída completa.</>
            ) : null}
            <span style={{ color: 'var(--text-muted)' }}>
              · {productos.toLocaleString('es-AR')} productos leídos
            </span>
          </p>
          <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', maxWidth: 420 }}>
            <div style={{ width: `${Math.round((leidas / paginas) * 100)}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s' }} />
          </div>
          {conError.map(({ t, i }) => (
            <div key={`${t.desde}-${t.hasta}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.6rem', padding: '0.6rem 0.8rem', background: '#fef3c7', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem' }}>Páginas {t.desde} a {t.hasta}: {t.error}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => leerPendientes(i)} disabled={leyendo}>
                <RotateCw size={14} /> Reintentar
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
