import { NextResponse, type NextRequest } from 'next/server';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { deshacerImportacion } from '@/lib/listas/importacion';

export const maxDuration = 120;

// POST /api/tenant/listas/importaciones/:id/deshacer  → solo la última aplicada del proveedor
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    return NextResponse.json(await deshacerImportacion(empresaId, id, getUserId(req)));
  });
}
