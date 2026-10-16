import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getTenantId(req: NextRequest): string {
  const empresaId = req.headers.get('x-empresa-id');
  if (!empresaId) {
    throw new Error('Tenant context is missing.');
  }
  return empresaId;
}

// GET: listar productos destacados de la empresa (con datos del producto base)
export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const soloActivos = searchParams.get('activos') !== 'false'; // por defecto true

    const destacados = await prisma.productoDestacado.findMany({
      where: {
        empresaId,
        ...(soloActivos ? { activo: true } : {}),
      },
      orderBy: { orden: 'asc' },
      include: {
        producto: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            categoria: true,
            precioVenta: true,
            stockActual: true,
            imagenUrl: true,
            activo: true,
            proveedor: {
              select: { id: true, nombre: true },
            },
          },
        },
      },
    });

    return NextResponse.json(destacados);
  } catch (error: any) {
    console.error('Productos destacados GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: agregar un producto a la sección de destacados
export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const { productoId, orden } = body;

    if (!productoId) {
      return NextResponse.json({ error: 'ID de producto requerido.' }, { status: 400 });
    }

    // Verificar que el producto exista y pertenezca a la empresa
    const producto = await prisma.producto.findFirst({
      where: { id: productoId, empresaId, activo: true },
    });

    if (!producto) {
      return NextResponse.json({ error: 'Producto no encontrado o inactivo.' }, { status: 404 });
    }

    // Verificar que no esté ya destacado
    const existente = await prisma.productoDestacado.findFirst({
      where: { empresaId, productoId },
    });

    if (existente) {
      return NextResponse.json({ error: 'Este producto ya está en la sección de destacados.' }, { status: 400 });
    }

    // Calcular orden si no se proporciona (al final)
    const maxOrden = await prisma.productoDestacado.aggregate({
      where: { empresaId },
      _max: { orden: true },
    });
    const nextOrden = orden !== undefined ? parseInt(orden, 10) : (maxOrden._max.orden || 0) + 1;

    const destacado = await prisma.productoDestacado.create({
      data: {
        empresaId,
        productoId,
        orden: nextOrden,
        activo: true,
      },
      include: {
        producto: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            categoria: true,
            precioVenta: true,
            stockActual: true,
            imagenUrl: true,
          },
        },
      },
    });

    return NextResponse.json(destacado, { status: 201 });
  } catch (error: any) {
    console.error('Productos destacados POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: quitar un producto de destacados (baja lógica)
export async function DELETE(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID de destacado requerido.' }, { status: 400 });
    }

    const destacado = await prisma.productoDestacado.findFirst({
      where: { id, empresaId },
    });

    if (!destacado) {
      return NextResponse.json({ error: 'Producto destacado no encontrado.' }, { status: 404 });
    }

    await prisma.productoDestacado.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Productos destacados DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
