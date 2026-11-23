import { NextResponse, type NextRequest } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';

// GET /api/tenant/listas/importaciones/:id/archivo  → descarga el original (blob privado)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const imp = await prisma.importacionLista.findFirst({ where: { id, empresaId }, select: { archivoUrl: true, archivoNombre: true } });
    if (!imp?.archivoUrl) return NextResponse.json({ error: 'Esta importación no tiene el archivo original guardado.' }, { status: 404 });

    const blob = await get(imp.archivoUrl, { access: 'private' });
    if (!blob || !blob.stream) return NextResponse.json({ error: 'No se encontró el archivo.' }, { status: 404 });

    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': blob.blob.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(imp.archivoNombre)}"`,
      },
    });
  });
}
