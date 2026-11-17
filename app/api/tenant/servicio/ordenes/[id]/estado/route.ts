import { NextResponse, type NextRequest } from 'next/server';
import { getUserId } from '@/lib/tenant';
import { rutaServicio } from '@/lib/servicio/api';
import { cambiarEstado } from '@/lib/servicio/ordenes';

// POST /api/tenant/servicio/ordenes/:id/estado { estado, detalle? }
// Al pasar a Aceptado se descuentan los repuestos; si vuelve atrás o se cancela, vuelven al stock.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaServicio(req, async (empresaId) => {
    const { id } = await params;
    const { estado, detalle } = await req.json();
    if (!estado) return NextResponse.json({ error: 'Falta el estado.' }, { status: 400 });
    return NextResponse.json(await cambiarEstado(empresaId, id, getUserId(req), String(estado), detalle));
  });
}
