import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';
import { ErrorCliente, prepararCliente } from '@/lib/clientes/datos';

// GET /api/tenant/clientes/:id → ficha del cliente con sus últimas órdenes de servicio
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresaId = getTenantId(req);
    const { id } = await params;
    const cliente = await prisma.cliente.findFirst({
      where: { id, empresaId },
      include: {
        ordenesServicio: {
          orderBy: { numero: 'desc' }, take: 20,
          select: { id: true, numero: true, estado: true, equipoTipo: true, equipoMarca: true, equipoModelo: true, createdAt: true },
        },
      },
    });
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
    return NextResponse.json(cliente);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// PUT /api/tenant/clientes/:id → editar la ficha (no toca el saldo de cuenta corriente)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresaId = getTenantId(req);
    const { id } = await params;
    const actual = await prisma.cliente.findFirst({ where: { id, empresaId }, select: { id: true, tipoDoc: true, nroDoc: true, codigo: true } });
    if (!actual) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
    const data = await prepararCliente(empresaId, await req.json(), actual);
    const cliente = await prisma.cliente.update({ where: { id }, data });
    return NextResponse.json(cliente);
  } catch (error) {
    if (error instanceof ErrorCliente) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
