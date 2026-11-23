'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PaginaPdf } from '@/lib/listas/pdf-texto';
import { origenesDeTexto, sinTextoRecortado } from '@/lib/listas/pdf-recorte';

// Saca el texto (con su posición) de cada página del PDF, en el navegador y sin costo.
// Se usa la versión legacy de pdf.js: la moderna usa funciones de JavaScript muy nuevas
// (Map.prototype.getOrInsertComputed) que muchos navegadores todavía no tienen.
// Descarta el texto recortado (oculto) que traen algunos PDF de su plantilla de diseño.
// Lo que se hace con ese texto (catálogo, fichas o tabla) lo decide Carga.tsx.

export async function textoDelPdf(archivo: File, onPagina: (n: number, total: number) => void): Promise<PaginaPdf[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const nombreOp: Record<number, string> = Object.fromEntries(Object.entries(pdfjs.OPS).map(([k, v]) => [v, k]));
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
  try {
    const doc = await tarea.promise;
    const paginas: PaginaPdf[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onPagina(i, doc.numPages);
      const pagina = await doc.getPage(i);
      const [contenido, operaciones] = await Promise.all([pagina.getTextContent(), pagina.getOperatorList()]);
      const textos = contenido.items.flatMap((it) =>
        'str' in it ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number }] : []
      );
      const origenes = origenesDeTexto(operaciones.fnArray.map((f, k) => ({ fn: nombreOp[f], args: operaciones.argsArray[k] })));
      paginas.push(sinTextoRecortado(textos, origenes));
      pagina.cleanup();
    }
    return paginas;
  } finally {
    await tarea.destroy();
  }
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
      .catch((e: unknown) => {
        if (!vigente) return;
        const err = e as { name?: string; message?: string };
        console.error('[lectura-pdf]', e);
        const motivo =
          err?.name === 'PasswordException'
            ? 'El PDF está protegido con contraseña.'
            : err?.name === 'InvalidPDFException'
              ? 'El archivo está dañado o no es un PDF.'
              : 'Revisá que no esté dañado o protegido con contraseña.';
        // El detalle técnico ayuda a encontrar problemas del navegador (ej. funciones que no tiene).
        const detalle = [err?.name, err?.message].filter(Boolean).join(': ').slice(0, 200);
        onError(`No se pudo abrir el PDF. ${motivo}${detalle ? ` (Detalle: ${detalle})` : ''}`);
      });
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
