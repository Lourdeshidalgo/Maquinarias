'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PaginaPdf } from '@/lib/listas/pdf-texto';

// Saca el texto (con su posición) de cada página del PDF, en el navegador y sin costo.
// Lo que se hace con ese texto (catálogo o tabla) lo decide Carga.tsx.

export async function textoDelPdf(archivo: File, onPagina: (n: number, total: number) => void): Promise<PaginaPdf[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
  const doc = await tarea.promise;
  const paginas: PaginaPdf[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPagina(i, doc.numPages);
    const contenido = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      contenido.items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number }] : []))
    );
  }
  await tarea.destroy();
  return paginas;
}

export default function LecturaPdf({
  archivo, onListo, onError,
}: {
  archivo: File;
  onListo: (paginas: PaginaPdf[]) => void;
  onError: (mensaje: string) => void;
}) {
  const [progreso, setProgreso] = useState<{ n: number; total: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    textoDelPdf(archivo, (n, total) => vigente && setProgreso({ n, total }))
      .then((paginas) => vigente && onListo(paginas))
      .catch(() => vigente && onError('No se pudo abrir el PDF. Revisá que no esté dañado o protegido con contraseña.'));
    return () => {
      vigente = false;
    };
    // Solo se lee de nuevo si cambia el archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  return (
    <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }} aria-live="polite">
      <Loader2 size={16} className="spin" />
      {progreso ? `Leyendo página ${progreso.n} de ${progreso.total}…` : 'Abriendo el PDF…'}
    </p>
  );
}
