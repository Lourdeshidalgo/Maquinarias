import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { recontar } from '@/lib/listas/importacion';

const FILTROS: Record<string, Prisma.ImportacionItemWhereInput> = {
  TODOS: {},
  SUBA: { estado: 'SUBA' },
  BAJA: { estado: 'BAJA' },
  IGUAL: { estado: 'IGUAL' },
  NUEVO: { estado: 'NUEVO' },
  ALERTA: { alerta: true },
};

// PATCH /api/tenant/listas/importaciones/:id/items
//   { ids: [...], seleccionado?: boolean }            → marcar/desmarcar filas
//   { filtro: 'SUBA', seleccionado: boolean }          → marcar/desmarcar todo un filtro
//   { ids: [id], accion: 'CREAR' | 'IGNORAR' }         → qué hacer con un producto nuevo
//   { ids: [id], accion: 'VINCULAR', productoId }      → vincular a un producto existente
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const body = (await req.json()) as {
      ids?: string[]; filtro?: string; seleccionado?: boolean; accion?: string; productoId?: string;
    };

    const imp = await prisma.importacionLista.findFirst({ where: { id, empresaId }, select: { estado: true } });
    if (!imp) return NextResponse.json({ error: 'Importación no encontrada.' }, { status: 404 });
    if (imp.estado !== 'BORRADOR') return NextResponse.json({ error: 'La importación ya fue aplicada.' }, { status: 400 });

    // Faltantes y errores no se pueden aplicar.
    const base: Prisma.ImportacionItemWhereInput = { importacionId: id, empresaId, estado: { notIn: ['FALTANTE', 'ERROR'] } };
    let where: Prisma.ImportacionItemWhereInput;
    if (Array.isArray(body.ids) && body.ids.length) where = { ...base, id: { in: body.ids.slice(0, 5000) } };
    else if (body.filtro && FILTROS[body.filtro]) where = { ...base, ...FILTROS[body.filtro] };
    else return NextResponse.json({ error: 'Indicá qué filas modificar.' }, { status: 400 });

    if (body.accion) {
      if (!Array.isArray(body.ids) || body.ids.length !== 1) {
        return NextResponse.json({ error: 'La acción se cambia de a una fila.' }, { status: 400 });
      }
      const item = await prisma.importacionItem.findFirst({ where });
      if (!item) return NextResponse.json({ error: 'Fila no encontrada.' }, { status: 404 });
      if (item.estado !== 'NUEVO') {
        return NextResponse.json({ error: 'Solo los productos nuevos se pueden crear, vincular o ignorar.' }, { status: 400 });
      }

      if (body.accion === 'VINCULAR') {
        const producto = body.productoId
          ? await prisma.producto.findFirst({ where: { id: body.productoId, empresaId, activo: true }, select: { id: true } })
          : null;
        if (!producto) return NextResponse.json({ error: 'Elegí un producto existente para vincular.' }, { status: 400 });
        await prisma.importacionItem.update({
          where: { id: item.id },
          data: { accion: 'VINCULAR', productoId: producto.id, seleccionado: true },
        });
      } else if (body.accion === 'CREAR' || body.accion === 'IGNORAR') {
        await prisma.importacionItem.update({
          where: { id: item.id },
          data: { accion: body.accion, productoId: null, seleccionado: body.accion === 'CREAR' },
        });
      } else {
        return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
      }
    } else if (typeof body.seleccionado === 'boolean') {
      // Un nuevo marcado como "ignorar" que se selecciona pasa a "crear".
      if (body.seleccionado) {
        await prisma.importacionItem.updateMany({ where: { ...where, estado: 'NUEVO', accion: 'IGNORAR' }, data: { accion: 'CREAR' } });
      }
      await prisma.importacionItem.updateMany({ where, data: { seleccionado: body.seleccionado } });
    } else {
      return NextResponse.json({ error: 'Nada para actualizar.' }, { status: 400 });
    }

    return NextResponse.json({ contadores: await recontar(id) });
  });
}
