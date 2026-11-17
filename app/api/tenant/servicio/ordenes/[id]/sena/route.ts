import { NextResponse, type NextRequest } from 'next/server';
import { getUserId } from '@/lib/tenant';
import { rutaServicio } from '@/lib/servicio/api';
import { registrarSena } from '@/lib/servicio/ordenes';

// POST /api/tenant/servicio/ordenes/:id/sena { monto, formaPago }
// Registra o cambia la seña (monto 0 la anula). Entra a la caja del día.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaServicio(req, async (empresaId) => {
    const { id } = await params;
    const { monto, formaPago } = await req.json();
    return NextResponse.json(await registrarSena(empresaId, id, getUserId(req), monto, formaPago));
  });
}
