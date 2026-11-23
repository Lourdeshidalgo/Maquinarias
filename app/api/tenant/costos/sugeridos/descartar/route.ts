import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';

// POST /api/tenant/costos/sugeridos/descartar { ids: [...] } | { todos: true } → el precio de venta queda como está
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { ids, todos } = (await req.json()) as { ids?: string[]; todos?: boolean };
    if (!todos && (!Array.isArray(ids) || !ids.length)) return NextResponse.json({ error: 'Elegí qué precios descartar.' }, { status: 400 });
    const r = await prisma.precioSugerido.updateMany({
      where: { empresaId, estado: 'PENDIENTE', ...(todos ? {} : { id: { in: ids!.slice(0, 5000) } }) },
      data: { estado: 'DESCARTADO', resueltoAt: new Date(), usuarioId: getUserId(req) },
    });
    return NextResponse.json({ descartados: r.count });
  });
}
