import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';
import { tieneModuloCostos } from '@/lib/modulos';

const CAMPOS_COSTO = ['precioCosto', 'costoPackaging', 'costoEnvio'] as const;
type CampoCosto = (typeof CAMPOS_COSTO)[number];

const MSG_COSTO_BLOQUEADO = 'Solo el administrador del comercio puede modificar el costo de los productos.';

// Con el módulo de costos activo, el costo lo mantiene el dueño (listas de
// proveedores, ajustes con historial). Los empleados pueden seguir editando el
// resto del producto, pero no cambiar costo, packaging ni envío.
async function empleadoCambiaCosto(
  req: NextRequest,
  empresaId: string,
  body: Record<string, unknown>,
  actual?: Record<CampoCosto, { toString(): string }> | null
): Promise<boolean> {
  if (req.headers.get('x-user-rol') !== 'EMPLOYEE') return false;
  const cambia = CAMPOS_COSTO.some((c) => {
    if (body[c] === undefined || body[c] === null || body[c] === '') return false;
    const nuevo = parseFloat(String(body[c])) || 0;
    const previo = actual ? Number(actual[c]) : 0;
    return Math.abs(nuevo - previo) > 0.001;
  });
  if (!cambia) return false;
  return tieneModuloCostos(empresaId);
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);

    // Paginación opcional: si viene ?page= devolvemos una página con metadatos.
    // Si no, mantenemos el array completo (lo usan el POS, Egresos y Destacados).
    const pageParam = searchParams.get('page');
    if (pageParam === null) {
      const productos = await prisma.producto.findMany({
        where: { empresaId, activo: true },
        include: {
          codigos: {
            select: { id: true, codigo: true },
          },
          proveedor: {
            select: { id: true, nombre: true },
          },
        },
        orderBy: { nombre: 'asc' },
      });
      return NextResponse.json(productos);
    }

    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const search = (searchParams.get('search') || '').trim();

    const where: any = { empresaId, activo: true };
    if (search) {
      // Busca por nombre, código principal, código alternativo o categoría.
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
        { categoria: { contains: search, mode: 'insensitive' } },
        { codigos: { some: { codigo: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, productos] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        include: {
          codigos: {
            select: { id: true, codigo: true },
          },
          proveedor: {
            select: { id: true, nombre: true },
          },
        },
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      items: productos,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// Normaliza la lista de códigos alternativos venida del cliente (array o string
// separado por comas) quitando vacíos, duplicados y el código principal.
function normalizeAltCodes(codigos: any, principal: string): string[] {
  const list = Array.isArray(codigos)
    ? codigos
    : typeof codigos === 'string'
      ? codigos.split(',')
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const code = String(raw || '').trim();
    if (!code) continue;
    if (code === principal.trim()) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

// Normaliza la lista de talles venida del cliente (array o string separado por
// comas): recorta, quita vacíos y duplicados, y limita a un máximo razonable.
function normalizeTalles(talles: any): string[] {
  const list = Array.isArray(talles)
    ? talles
    : typeof talles === 'string'
      ? talles.split(',')
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    result.push(t);
  }
  return result.slice(0, 30);
}

// Devuelve true si algún código (principal o alternativo) ya existe en otro
// producto de la empresa (excluyendo un producto específico si se pasa).
async function codeExistsElsewhere(
  empresaId: string,
  codes: string[],
  excludeProductId?: string
): Promise<boolean> {
  if (!codes.length) return false;
  const [inAlt, inMain] = await Promise.all([
    prisma.productoCodigo.findMany({
      where: {
        codigo: { in: codes },
        producto: { empresaId, ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}) },
      },
      select: { codigo: true },
    }),
    prisma.producto.findMany({
      where: {
        empresaId,
        codigo: { in: codes },
        ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
      },
      select: { codigo: true },
    }),
  ]);
  return inAlt.length > 0 || inMain.length > 0;
}

// Persiste la lista de códigos alternativos en un prod (transaction).
async function replaceAltCodes(productoId: string, codes: string[]) {
  await prisma.$transaction([
    prisma.productoCodigo.deleteMany({ where: { productoId } }),
    ...codes.map((codigo) =>
      prisma.productoCodigo.create({ data: { productoId, codigo } })
    ),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const {
      codigo,
      nombre,
      categoria,
      navigator,
      unidad,
      precioCosto,
      costoPackaging,
      costoEnvio,
      precioVenta,
      ivaPorcentaje,
      stockActual,
      stockMinimo,
      imagenUrl,
      codigosAlternativos,
      proveedorId,
      talles,
    } = body;

    if (!codigo || !nombre || !unidad) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (código, nombre, unidad).' }, { status: 400 });
    }

    const altCodes = normalizeAltCodes(codigosAlternativos, codigo);

    // Check duplicate code *within this business only*
    const existing = await prisma.producto.findFirst({
      where: {
        empresaId,
        codigo,
      },
    });

    if (await empleadoCambiaCosto(req, empresaId, body, existing)) {
      return NextResponse.json({ error: MSG_COSTO_BLOQUEADO }, { status: 403 });
    }

    if (existing?.activo) {
      return NextResponse.json(
        { error: `Ya existe un producto con el código "${codigo}" en tu comercio.` },
        { status: 400 }
      );
    }

    if (await codeExistsElsewhere(empresaId, altCodes)) {
      return NextResponse.json(
        { error: 'Uno de los códigos alternativos ya pertenece a otro producto.' },
        { status: 400 }
      );
    }

    if (existing) {
      const producto = await prisma.$transaction(async (tx) => {
        const updated = await tx.producto.update({
          where: { id: existing.id },
          data: {
            nombre,
            categoria: categoria || 'General',
            unidad,
            precioCosto: parseFloat(precioCosto) || 0,
            costoPackaging: parseFloat(costoPackaging) || 0,
            costoEnvio: parseFloat(costoEnvio) || 0,
            precioVenta: parseFloat(precioVenta) || 0,
            ivaPorcentaje: parseFloat(ivaPorcentaje) || 21.0,
            stockActual: parseFloat(stockActual) || 0,
            stockMinimo: parseFloat(stockMinimo) || 0,
            imagenUrl: imagenUrl || null,
            talles: normalizeTalles(talles),
            activo: true,
          },
        });
        if (altCodes.length) {
          await replaceAltCodes(updated.id, altCodes);
        }
        return updated;
      });

      return NextResponse.json(producto);
    }

    const producto = await prisma.producto.create({
      data: {
        empresaId,
        proveedorId: proveedorId || null,
        codigo,
        nombre,
        categoria: categoria || 'General',
        unidad,
        precioCosto: parseFloat(precioCosto) || 0,
        costoPackaging: parseFloat(costoPackaging) || 0,
        costoEnvio: parseFloat(costoEnvio) || 0,
        precioVenta: parseFloat(precioVenta) || 0,
        ivaPorcentaje: parseFloat(ivaPorcentaje) || 21.0,
        stockActual: parseFloat(stockActual) || 0,
        stockMinimo: parseFloat(stockMinimo) || 0,
        imagenUrl: imagenUrl || null,
        talles: normalizeTalles(talles),
        codigos: altCodes.length ? { create: altCodes.map((codigo) => ({ codigo })) } : undefined,
      },
    });

    return NextResponse.json(producto);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const { id, tipoAjuste, cantidad, precioVenta, precioCosto } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de producto requerido.' }, { status: 400 });
    }

    // Find existing product to make sure it belongs to the tenant
    const prod = await prisma.producto.findFirst({
      where: { id, empresaId, activo: true }
    });

    if (!prod) {
      return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
    }

    if (await empleadoCambiaCosto(req, empresaId, body, prod)) {
      return NextResponse.json({ error: MSG_COSTO_BLOQUEADO }, { status: 403 });
    }

    const updateData: any = {};
    if (precioVenta !== undefined) updateData.precioVenta = parseFloat(precioVenta) || 0;
    if (precioCosto !== undefined) updateData.precioCosto = parseFloat(precioCosto) || 0;

    // Handle stock adjustments
    if (tipoAjuste && cantidad !== undefined) {
      const qty = parseFloat(cantidad) || 0;
      const currentStock = prod.stockActual.toNumber();
      
      if (tipoAjuste === 'compra') {
        updateData.stockActual = currentStock + qty;
      } else if (tipoAjuste === 'merma') {
        updateData.stockActual = Math.max(0, currentStock - qty);
      } else if (tipoAjuste === 'ajuste') {
        updateData.stockActual = qty;
      }
    }

    const updatedProduct = await prisma.producto.update({
      where: { id },
      data: updateData,
      include: {
        proveedor: {
          select: { id: true, nombre: true },
        },
      },
    });

    return NextResponse.json(updatedProduct);
  } catch (error: any) {
    console.error('Stock adjustment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const body = await req.json();
    const {
      id,
      codigo,
      nombre,
      categoria,
      unidad,
      precioCosto,
      costoPackaging,
      costoEnvio,
      precioVenta,
      ivaPorcentaje,
      stockActual,
      stockMinimo,
      imagenUrl,
      codigosAlternativos,
      proveedorId,
      talles,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de producto requerido.' }, { status: 400 });
    }

    const prod = await prisma.producto.findFirst({
      where: { id, empresaId },
    });

    if (!prod || !prod.activo) {
      return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
    }

    if (await empleadoCambiaCosto(req, empresaId, body, prod)) {
      return NextResponse.json({ error: MSG_COSTO_BLOQUEADO }, { status: 403 });
    }

    // If editing the main fields (not a pure image update), require the basics
    const editingMain = codigo !== undefined || nombre !== undefined || unidad !== undefined;
    if (editingMain && (!codigo || !nombre || !unidad)) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (código, nombre, unidad).' }, { status: 400 });
    }

    const nextCodigo = codigo !== undefined ? codigo : prod.codigo;
    if (codigo !== undefined && codigo !== prod.codigo) {
      const duplicate = await prisma.producto.findFirst({
        where: { empresaId, codigo, NOT: { id } },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `Ya existe un producto con el código "${codigo}" en tu comercio.` },
          { status: 400 }
        );
      }
    }

    // If alternative codes are being updated, validate and replace them
    let data: any = {};

    if (codigo !== undefined) data.codigo = codigo;
    if (nombre !== undefined) data.nombre = nombre;
    if (categoria !== undefined) data.categoria = categoria || 'General';
    if (unidad !== undefined) data.unidad = unidad;
    if (precioCosto !== undefined) data.precioCosto = parseFloat(precioCosto) || 0;
    if (costoPackaging !== undefined) data.costoPackaging = parseFloat(costoPackaging) || 0;
    if (costoEnvio !== undefined) data.costoEnvio = parseFloat(costoEnvio) || 0;
    if (precioVenta !== undefined) data.precioVenta = parseFloat(precioVenta) || 0;
    if (ivaPorcentaje !== undefined) data.ivaPorcentaje = parseFloat(ivaPorcentaje) || 21.0;
    if (stockActual !== undefined) data.stockActual = parseFloat(stockActual) || 0;
    if (stockMinimo !== undefined) data.stockMinimo = parseFloat(stockMinimo) || 0;
    if (talles !== undefined) data.talles = normalizeTalles(talles);
    if (imagenUrl !== undefined) {
      data.imagenUrl = imagenUrl === '' || imagenUrl === null ? null : imagenUrl;
    }
    if (proveedorId !== undefined) {
      data.proveedorId = proveedorId || null;
    }

    const producto = await prisma.$transaction(async (tx) => {
      const updated = await tx.producto.update({
        where: { id },
        data,
      });

      // Replace alternative codes only when explicitly provided
      if (codigosAlternativos !== undefined) {
        const altCodes = normalizeAltCodes(codigosAlternativos, nextCodigo);
        if (await codeExistsElsewhere(empresaId, altCodes, id)) {
          throw new Error('Uno de los códigos alternativos ya pertenece a otro producto.');
        }
        await replaceAltCodes(updated.id, altCodes);
      }

      return updated;
    });

    return NextResponse.json(producto);
  } catch (error: any) {
    console.error('Product edit error:', error);
    if (error.message === 'Uno de los códigos alternativos ya pertenece a otro producto.') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID de producto requerido.' }, { status: 400 });
    }

    const prod = await prisma.producto.findFirst({
      where: { id, empresaId, activo: true },
    });

    if (!prod) {
      return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
    }

    await prisma.producto.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Product delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
