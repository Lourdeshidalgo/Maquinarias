import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { actualizarEnLote } from '@/lib/listas/sql';

// POST /api/tenant/costos/sugeridos/aprobar
//   { ids: [...] } | { todos: true }, opcional { precios: { [id]: valor } } para corregir antes de aprobar
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { ids, todos, precios } = (await req.json()) as { ids?: string[]; todos?: boolean; precios?: Record<string, unknown> };
    if (!todos && (!Array.isArray(ids) || !ids.length)) return NextResponse.json({ error: 'Elegí qué precios aprobar.' }, { status: 400 });

    const pendientes = await prisma.precioSugerido.findMany({
      where: { empresaId, estado: 'PENDIENTE', producto: { activo: true }, ...(todos ? {} : { id: { in: ids!.slice(0, 5000) } }) },
      select: { id: true, productoId: true, precioSugerido: true },
    });
    if (!pendientes.length) return NextResponse.json({ error: 'No hay precios pendientes para aprobar.' }, { status: 400 });

    const filas = pendientes.map((s) => {
      const corregido = precios?.[s.id] !== undefined ? parseFloat(String(precios[s.id])) : NaN;
      const valor = Number.isFinite(corregido) && corregido > 0 ? corregido : s.precioSugerido.toNumber();
      return { sugerido: s, valor };
    });

    await prisma.$transaction(async (tx) => {
      await actualizarEnLote(
        tx, 'Producto', { precioVenta: 'numeric' },
        filas.map((f) => ({ id: f.sugerido.productoId, precioVenta: f.valor })),
        { extra: '"updatedAt" = NOW()', empresaId }
      );
      await actualizarEnLote(
        tx, 'PrecioSugerido', { precioSugerido: 'numeric', estado: 'text', resueltoAt: 'timestamp', usuarioId: 'text' },
        filas.map((f) => ({ id: f.sugerido.id, precioSugerido: f.valor, estado: 'APROBADO', resueltoAt: new Date(), usuarioId: getUserId(req) })),
        { empresaId }
      );
    }, { timeout: 60_000 });

    return NextResponse.json({ aprobados: filas.length });
  });
}
