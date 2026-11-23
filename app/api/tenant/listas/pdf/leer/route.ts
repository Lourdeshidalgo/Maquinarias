import { NextResponse, type NextRequest } from 'next/server';
import { rutaModuloCostos } from '@/lib/listas/api';
import { ErrorLecturaPdf, leerTramoPdf, pdfConfigurado } from '@/lib/listas/pdf';
import { normalizarRenglones } from '@/lib/listas/pdf-renglones';

export const maxDuration = 120;
const MAX_BYTES = 4 * 1024 * 1024;

// GET /api/tenant/listas/pdf/leer → { configurado }: si hay clave de Anthropic para leer PDFs.
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async () => NextResponse.json({ configurado: pdfConfigurado() }));
}

// POST /api/tenant/listas/pdf/leer (multipart: archivo = tramo del PDF, desde = nº de su primera página, monedaDefault)
// → { filas: FilaLista[] }. No guarda nada: las filas siguen por el flujo normal de la importación.
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async () => {
    if (!pdfConfigurado()) {
      return NextResponse.json({ error: 'La lectura de PDF no está configurada.' }, { status: 503 });
    }
    const form = await req.formData().catch(() => null);
    const archivo = form?.get('archivo');
    if (!(archivo instanceof Blob) || archivo.size === 0) {
      return NextResponse.json({ error: 'No llegó el archivo.' }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Estas páginas pesan demasiado. Probá con menos páginas.' }, { status: 400 });
    }
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      return NextResponse.json({ error: 'El archivo no es un PDF.' }, { status: 400 });
    }
    const desde = Math.max(1, parseInt(String(form?.get('desde') ?? '1'), 10) || 1);
    const monedaDefault = form?.get('monedaDefault') === 'USD' ? 'USD' : 'ARS';

    try {
      const { renglones } = await leerTramoPdf(bytes);
      return NextResponse.json({ filas: normalizarRenglones(renglones, desde, monedaDefault) });
    } catch (e) {
      if (e instanceof ErrorLecturaPdf) return NextResponse.json({ error: e.message }, { status: 502 });
      throw e;
    }
  });
}
