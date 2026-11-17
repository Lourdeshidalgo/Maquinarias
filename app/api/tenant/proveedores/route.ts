import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, getUserId } from '@/lib/tenant';
import { recalcularPorDescuentoBase } from '@/lib/costos-dolar';
import { normalizarBonificaciones } from '@/lib/costos';

const ERROR_BONIF = 'El descuento base no es válido. Usá porcentajes separados por +, por ejemplo 25+15.';

// GET: listar proveedores de la empresa (con opción de filtrar solo activos)
export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const soloActivos = searchParams.get('activos') === 'true';

    const proveedores = await prisma.proveedor.findMany({
      where: {
        empresaId,
        ...(soloActivos ? { activo: true } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: {
        _count: {
          select: { productos: true },
        },
      },
    });

    return NextResponse.json(proveedores);
  } catch (error: any) {
    console.error('Proveedores GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: crear un nuevo proveedor
export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const { nombre, cuit, telefono, email, direccion, contacto, bonificacionesBase } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 });
    }
    const bonif = normalizarBonificaciones(bonificacionesBase);
    if (bonif === null) return NextResponse.json({ error: ERROR_BONIF }, { status: 400 });

    // Validar CUIT único dentro de la empresa si se proporciona
    if (cuit && cuit.trim()) {
      const existing = await prisma.proveedor.findFirst({
        where: { empresaId, cuit: cuit.trim() },
      });
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese CUIT.' }, { status: 400 });
      }
    }

    const proveedor = await prisma.proveedor.create({
      data: {
        empresaId,
        nombre: nombre.trim(),
        cuit: cuit?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
        contacto: contacto?.trim() || null,
        bonificacionesBase: bonif,
      },
    });

    return NextResponse.json(proveedor, { status: 201 });
  } catch (error: any) {
    console.error('Proveedores POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: actualizar un proveedor existente (campos principales)
export async function PUT(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const { id, nombre, cuit, telefono, email, direccion, contacto, activo, bonificacionesBase } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de proveedor requerido.' }, { status: 400 });
    }
    const bonif = bonificacionesBase === undefined ? undefined : normalizarBonificaciones(bonificacionesBase);
    if (bonif === null) return NextResponse.json({ error: ERROR_BONIF }, { status: 400 });

    const proveedor = await prisma.proveedor.findFirst({
      where: { id, empresaId },
    });

    if (!proveedor) {
      return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    }

    // Validar CUIT único si se cambia
    if (cuit && cuit.trim() && cuit.trim() !== (proveedor.cuit || '')) {
      const existing = await prisma.proveedor.findFirst({
        where: { empresaId, cuit: cuit.trim(), NOT: { id } },
      });
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese CUIT.' }, { status: 400 });
      }
    }

    const updated = await prisma.proveedor.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(cuit !== undefined && { cuit: cuit.trim() || null }),
        ...(telefono !== undefined && { telefono: telefono.trim() || null }),
        ...(email !== undefined && { email: email.trim() || null }),
        ...(direccion !== undefined && { direccion: direccion.trim() || null }),
        ...(contacto !== undefined && { contacto: contacto.trim() || null }),
        ...(activo !== undefined && { activo }),
        ...(bonif !== undefined && { bonificacionesBase: bonif }),
      },
    });

    // Con el módulo de costos, un descuento base nuevo cambia el costo de sus productos (los que no tienen descuento propio).
    let recalculo = null;
    if (bonif !== undefined && bonif !== proveedor.bonificacionesBase) {
      const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { moduloCostos: true } });
      if (empresa?.moduloCostos) {
        recalculo = await recalcularPorDescuentoBase(
          empresaId, id, getUserId(req),
          `Descuento base ${proveedor.nombre}: ${proveedor.bonificacionesBase || 'sin descuento'} → ${bonif || 'sin descuento'}`
        );
      }
    }

    return NextResponse.json({ ...updated, recalculo });
  } catch (error: any) {
    console.error('Proveedores PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: actualización parcial (ej. activar/desactivar)
export async function PATCH(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const { id, activo } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de proveedor requerido.' }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findFirst({
      where: { id, empresaId },
    });

    if (!proveedor) {
      return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    }

    const updated = await prisma.proveedor.update({
      where: { id },
      data: { activo: activo !== undefined ? activo : proveedor.activo },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Proveedores PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: baja lógica (marca como inactivo en lugar de eliminar físicamente)
export async function DELETE(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID de proveedor requerido.' }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findFirst({
      where: { id, empresaId },
      include: {
        _count: { select: { productos: { where: { activo: true } } } },
      },
    });

    if (!proveedor) {
      return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    }

    // Si tiene productos activos, no se permite desactivar (evita huérfanos en productos)
    if (proveedor._count.productos > 0) {
      return NextResponse.json(
        {
          error:
            'No se puede desactivar este proveedor porque tiene productos activos asociados. Desasigne o elimine esos productos primero.',
        },
        { status: 400 }
      );
    }

    await prisma.proveedor.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Proveedores DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
