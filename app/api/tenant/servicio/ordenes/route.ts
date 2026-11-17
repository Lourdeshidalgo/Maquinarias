import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaServicio } from '@/lib/servicio/api';
import { crearOrden } from '@/lib/servicio/ordenes';
import { ESTADOS_SERVICIO, totalesServicio } from '@/lib/servicio/estados';

// GET /api/tenant/servicio/ordenes?estado=COTIZADO&search=&page=1
export async function GET(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => {
    const sp = req.nextUrl.searchParams;
    const estado = sp.get('estado');
    const search = (sp.get('search') || '').trim();
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = 30;

    const where: Prisma.OrdenServicioWhereInput = { empresaId };
    if (estado === 'ACTIVAS') where.estado = { notIn: ['ENTREGADO', 'CANCELADO', 'NO_ACEPTADO'] };
    else if (estado && ESTADOS_SERVICIO.some((e) => e.estado === estado)) where.estado = estado;
    if (search) {
      const n = parseInt(search.replace(/\D/g, ''), 10);
      where.OR = [
        { clienteNombre: { contains: search, mode: 'insensitive' } },
        { clienteTelefono: { contains: search, mode: 'insensitive' } },
        { equipoTipo: { contains: search, mode: 'insensitive' } },
        { equipoMarca: { contains: search, mode: 'insensitive' } },
        { equipoModelo: { contains: search, mode: 'insensitive' } },
        { equipoSerie: { contains: search, mode: 'insensitive' } },
        ...(Number.isFinite(n) ? [{ numero: n }] : []),
      ];
    }

    const [total, ordenes, porEstado] = await Promise.all([
      prisma.ordenServicio.count({ where }),
      prisma.ordenServicio.findMany({
        where,
        include: { items: { select: { tipo: true, cantidad: true, precioUnitario: true } } },
        orderBy: { numero: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ordenServicio.groupBy({ by: ['estado'], where: { empresaId }, _count: { _all: true } }),
    ]);

    return NextResponse.json({
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      contadores: Object.fromEntries(porEstado.map((p) => [p.estado, p._count._all])),
      ordenes: ordenes.map((o) => ({
        id: o.id, numero: o.numero, estado: o.estado, clienteNombre: o.clienteNombre, clienteTelefono: o.clienteTelefono,
        equipo: [o.equipoTipo, o.equipoMarca, o.equipoModelo].filter(Boolean).join(' '), equipoSerie: o.equipoSerie,
        tecnico: o.tecnico, fallaReportada: o.fallaReportada, modalidad: o.modalidad, senaMonto: o.senaMonto.toNumber(), createdAt: o.createdAt, updatedAt: o.updatedAt, fechaPrometida: o.fechaPrometida,
        total: totalesServicio(o.items.map((i) => ({ tipo: i.tipo, cantidad: i.cantidad.toNumber(), precioUnitario: i.precioUnitario.toNumber() }))).total,
      })),
    });
  });
}

// POST /api/tenant/servicio/ordenes → nueva orden (estado Recibido)
export async function POST(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => {
    const orden = await crearOrden(empresaId, getUserId(req), await req.json());
    return NextResponse.json({ id: orden.id, numero: orden.numero }, { status: 201 });
  });
}
