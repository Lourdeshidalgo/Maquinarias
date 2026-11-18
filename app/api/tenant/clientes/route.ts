import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';
import { ErrorCliente, prepararCliente } from '@/lib/clientes/datos';

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);

    // Paginación opcional: si viene ?page= devolvemos una página con metadatos.
    // Si no, mantenemos el array completo (lo usan el POS y Cuentas Corrientes).
    // ?generico=1 → solo el cliente "Consumidor Final" genérico (lo usa el POS)
    if (searchParams.get('generico')) {
      const generico = await prisma.cliente.findFirst({ where: { empresaId, tipoDoc: '99', nroDoc: '0' } });
      return NextResponse.json(generico);
    }

    const pageParam = searchParams.get('page');
    if (pageParam === null) {
      const clientes = await prisma.cliente.findMany({
        where: { empresaId },
        orderBy: { razonSocial: 'asc' },
      });
      return NextResponse.json(clientes);
    }

    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const search = (searchParams.get('search') || '').trim();

    const where: any = { empresaId };
    if (search) {
      const numero = /^\d{1,9}$/.test(search) ? parseInt(search, 10) : null;
      where.OR = [
        { razonSocial: { contains: search, mode: 'insensitive' } },
        { nroDoc: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search } },
        { celular: { contains: search } },
        { localidad: { contains: search, mode: 'insensitive' } },
        { notas: { contains: search, mode: 'insensitive' } },
        ...(numero !== null ? [{ codigo: numero }] : []),
      ];
    }

    const [total, clientes] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({
        where,
        orderBy: { razonSocial: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      items: clientes,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const data = await prepararCliente(empresaId, await req.json());
    const cliente = await prisma.cliente.create({ data: { ...data, empresaId, saldoCuentaCorriente: 0 } });
    return NextResponse.json(cliente);
  } catch (error: any) {
    if (error instanceof ErrorCliente) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
