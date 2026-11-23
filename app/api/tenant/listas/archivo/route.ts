import { NextResponse, type NextRequest } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getTenantId } from '@/lib/tenant';
import { tieneModuloCostos } from '@/lib/modulos';

// POST /api/tenant/listas/archivo
// Token de subida directa (navegador → Vercel Blob) del archivo original de la
// lista, como respaldo. Privado: solo se descarga a través de la API.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const empresaId = getTenantId(request);
    if (!(await tieneModuloCostos(empresaId))) {
      return NextResponse.json({ error: 'Módulo no habilitado.' }, { status: 403 });
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`listas/${empresaId}/`)) {
          throw new Error('Ruta de archivo inválida.');
        }
        return {
          access: 'private',
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
          allowedContentTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'text/plain',
            'application/pdf',
            'application/octet-stream',
          ],
          tokenPayload: JSON.stringify({ empresaId }),
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
