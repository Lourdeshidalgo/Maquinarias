import { NextResponse, type NextRequest } from 'next/server';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { aplicarImportacion } from '@/lib/listas/importacion';

export const maxDuration = 120;

// POST /api/tenant/listas/importaciones/:id/aplicar
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    return NextResponse.json(await aplicarImportacion(empresaId, id, getUserId(req)));
  });
}
