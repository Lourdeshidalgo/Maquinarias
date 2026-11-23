import { NextResponse, type NextRequest } from 'next/server';
import { rutaModuloCostos } from '@/lib/listas/api';
import { finalizarImportacion } from '@/lib/listas/importacion';

export const maxDuration = 60;

// POST /api/tenant/listas/importaciones/:id/finalizar  → faltantes, sugerencias y contadores
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    return NextResponse.json(await finalizarImportacion(empresaId, id));
  });
}
