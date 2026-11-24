import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, getUserId } from '@/lib/tenant';
import type { Prisma } from '@prisma/client';
import { tieneModuloCostos } from '@/lib/modulos';
import { obtenerConfigCostos, registrarCambioCostoManual, sincronizarProveedorPreferido } from '@/lib/costos-db';
import { datosListaManual, precioCredito, type DatosListaManual } from '@/lib/costos';
import { fijarListaUsdProducto } from '@/lib/costos-dolar';
import { cargarCotizaciones } from '@/lib/costos-db';
import { cotizacionPara } from '@/lib/costos';
import { filtroBusquedaProducto } from '@/lib/productos-busqueda';

const CAMPOS_COSTO = ['precioCosto', 'costoPackaging', 'costoEnvio'] as const;
type CampoCosto = (typeof CAMPOS_COSTO)[number];

type ProductoCostos = {
  id: string;
  precioCosto: { toNumber(): number };
  precioVenta: { toNumber(): number };
  proveedorId: string | null;
};

// Efectos del módulo de costos al guardar un producto desde Stock:
// historial del cambio de costo (origen MANUAL) y proveedor preferido.
async function efectosModuloCostos(
  tx: Prisma.TransactionClient,
  req: NextRequest,
  empresaId: string,
  antes: ProductoCostos | null,
  despues: ProductoCostos
) {
  if (!(await tieneModuloCostos(empresaId))) return;

  if (despues.proveedorId !== (antes?.proveedorId ?? null)) {
    await sincronizarProveedorPreferido(tx, empresaId, despues.id, despues.proveedorId);
  }

  const costoAnterior = antes ? antes.precioCosto.toNumber() : 0;
  const costoNuevo = despues.precioCosto.toNumber();
  if (antes && Math.abs(costoNuevo - costoAnterior) > 0.001) {
    await registrarCambioCostoManual(tx, {
      empresaId,
      productoId: despues.id,
      costoAnterior,
      costoNuevo,
      precioVentaAnterior: antes.precioVenta.toNumber(),
      precioVentaNuevo: despues.precioVenta.toNumber(),
      usuarioId: getUserId(req),
    });
  }
}

/** Si el costo cambia, la fecha del costo pasa a hoy (semáforo). */
function marcarFechaCosto(data: Record<string, unknown>, costoAnterior: number) {
  if (typeof data.precioCosto === 'number' && Math.abs(data.precioCosto - costoAnterior) > 0.001) {
    data.costoActualizadoAt = new Date();
  }
}

/**
 * Costo en dólares cargado desde Stock (`listaUsd`). Devuelve los datos validados,
 * null si no vino, o una respuesta de error. Solo el dueño, con el módulo activo y
 * con proveedor asignado.
 */
async function validarListaUsd(
  req: NextRequest,
  empresaId: string,
  listaUsd: unknown,
  proveedorId: string | null
): Promise<DatosListaManual | null | NextResponse> {
  if (listaUsd === undefined || listaUsd === null) return null;
  if (req.headers.get('x-user-rol') === 'EMPLOYEE' || !(await tieneModuloCostos(empresaId))) {
    return NextResponse.json({ error: MSG_COSTO_BLOQUEADO }, { status: 403 });
  }
  if (!proveedorId) return NextResponse.json({ error: 'Elegí un proveedor para cargar el costo en dólares.' }, { status: 400 });
  const d = datosListaManual(listaUsd as Record<string, unknown> as { costoLista: unknown });
  if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
  // Sin dólar no se puede costear: se corta antes de guardar nada (nunca un producto a $0).
  if (cotizacionPara(await cargarCotizaciones(empresaId), proveedorId) === null) {
    const prov = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { nombre: true } });
    return NextResponse.json(
      { error: `No hay dólar cargado para ${prov?.nombre ?? 'ese proveedor'} ni dólar general. Cargalo en "Dólar por proveedor".` },
      { status: 400 }
    );
  }
  return { costoLista: d.costoLista, incluyeIva: d.incluyeIva, bonificaciones: d.bonificaciones };
}

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
        // Los de catálogo (vienen de listas de proveedores) no están en Stock ni en el POS.
        where: { empresaId, activo: true, soloCatalogo: false },
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

    const where: any = { empresaId, activo: true, soloCatalogo: false };
    if (searchParams.get('repuestos') === '1') where.esRepuesto = true;
    if (search) where.AND = filtroBusquedaProducto(search);

    const [total, productos, empresa] = await Promise.all([
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
          proveedorProductos: {
            where: { preferido: true },
            select: { moneda: true, costoLista: true, incluyeIva: true, bonificaciones: true },
            take: 1,
          },
        },
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { moduloCostos: true } }),
    ]);

    // Con el módulo de costos: precio con tarjeta de crédito (venta + recargo configurado).
    const config = empresa?.moduloCostos ? await obtenerConfigCostos(empresaId) : null;
    const items = config
      ? productos.map(({ proveedorProductos, ...p }) => {
          const pp = proveedorProductos[0];
          return {
            ...p,
            precioCredito: precioCredito(p.precioVenta.toNumber(), config.recargoCredito.toNumber(), config.redondeo),
            // Costo en dólares (vínculo con el proveedor preferido en USD), para editarlo desde Stock.
            listaUsd: pp?.moneda === 'USD'
              ? { costoLista: pp.costoLista.toNumber(), incluyeIva: pp.incluyeIva, bonificaciones: pp.bonificaciones }
              : null,
          };
        })
      : productos.map((p) => {
          const resto: Record<string, unknown> = { ...p };
          delete resto.proveedorProductos;
          return resto;
        });

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// Datos propios de un repuesto (catálogo de Repuestos). Solo incluye los campos que vinieron.
function datosRepuesto(body: Record<string, unknown>) {
  const t = (v: unknown, max: number) => {
    const x = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    return x ? x.slice(0, max) : null;
  };
  const d: Record<string, unknown> = {};
  if (body.esRepuesto !== undefined) d.esRepuesto = !!body.esRepuesto;
  if (body.codigoFabricante !== undefined) d.codigoFabricante = t(body.codigoFabricante, 100);
  if (body.marca !== undefined) d.marca = t(body.marca, 100);
  if (body.compatibles !== undefined) d.compatibles = t(body.compatibles, 2000);
  if (body.ubicacion !== undefined) d.ubicacion = t(body.ubicacion, 100);
  return d;
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

    const listaUsdNueva = await validarListaUsd(req, empresaId, body.listaUsd, proveedorId || null);
    if (listaUsdNueva instanceof NextResponse) return listaUsdNueva;

    if (await codeExistsElsewhere(empresaId, altCodes)) {
      return NextResponse.json(
        { error: 'Uno de los códigos alternativos ya pertenece a otro producto.' },
        { status: 400 }
      );
    }

    if (existing) {
      const producto = await prisma.$transaction(async (tx) => {
        if (proveedorId !== undefined && (proveedorId || null) !== existing.proveedorId) {
          await tx.producto.update({ where: { id: existing.id }, data: { proveedorId: proveedorId || null } });
        }
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
            ...datosRepuesto(body),
            activo: true,
            costoActualizadoAt: new Date(),
          },
        });
        if (altCodes.length) {
          await replaceAltCodes(updated.id, altCodes);
        }
        await efectosModuloCostos(tx, req, empresaId, existing, updated);
        return updated;
      });

      if (listaUsdNueva) {
        try {
          await fijarListaUsdProducto(empresaId, producto.id, listaUsdNueva, getUserId(req));
        } catch (e) {
          return NextResponse.json({ error: `El producto se reactivó, pero no se pudo calcular el costo en dólares: ${(e as Error).message}` }, { status: 400 });
        }
        return NextResponse.json(await prisma.producto.findUnique({ where: { id: producto.id } }));
      }

      return NextResponse.json(producto);
    }

    const producto = await prisma.$transaction(async (tx) => {
      const creado = await tx.producto.create({
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
        ...datosRepuesto(body),
        codigos: altCodes.length ? { create: altCodes.map((codigo) => ({ codigo })) } : undefined,
      },
      });
      await efectosModuloCostos(tx, req, empresaId, null, creado);
      return creado;
    });

    // Costo en dólares: el vínculo con el proveedor pasa a USD y costo y precio salen del dólar del proveedor.
    if (listaUsdNueva) {
      try {
        await fijarListaUsdProducto(empresaId, producto.id, listaUsdNueva, getUserId(req));
      } catch (e) {
        return NextResponse.json({ error: `El producto se creó, pero no se pudo calcular el costo en dólares: ${(e as Error).message}` }, { status: 400 });
      }
      return NextResponse.json(await prisma.producto.findUnique({ where: { id: producto.id } }));
    }

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

    marcarFechaCosto(updateData, prod.precioCosto.toNumber());

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.producto.update({
        where: { id },
        data: updateData,
        include: {
          proveedor: {
            select: { id: true, nombre: true },
          },
        },
      });
      await efectosModuloCostos(tx, req, empresaId, prod, actualizado);
      return actualizado;
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
      margenPorcentaje,
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

    const proveedorFinal = proveedorId !== undefined ? proveedorId || null : prod.proveedorId;
    const listaUsdNueva = await validarListaUsd(req, empresaId, body.listaUsd, proveedorFinal);
    if (listaUsdNueva instanceof NextResponse) return listaUsdNueva;

    // Recargo propio del producto (módulo de costos): solo el dueño.
    let margenData: { margenPorcentaje: number | null } | null = null;
    if (margenPorcentaje !== undefined) {
      if (req.headers.get('x-user-rol') === 'EMPLOYEE' || !(await tieneModuloCostos(empresaId))) {
        return NextResponse.json({ error: MSG_COSTO_BLOQUEADO }, { status: 403 });
      }
      const m = margenPorcentaje === '' || margenPorcentaje === null ? null : parseFloat(margenPorcentaje);
      if (m !== null && (!Number.isFinite(m) || m < 0 || m > 1000)) {
        return NextResponse.json({ error: 'El recargo tiene que estar entre 0% y 1000%.' }, { status: 400 });
      }
      margenData = { margenPorcentaje: m };
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
    if (margenData) data.margenPorcentaje = margenData.margenPorcentaje;
    Object.assign(data, datosRepuesto(body));

    marcarFechaCosto(data, prod.precioCosto.toNumber());

    const producto = await prisma.$transaction(async (tx) => {
      const updated = await tx.producto.update({
        where: { id },
        data,
      });
      await efectosModuloCostos(tx, req, empresaId, prod, updated);

      // Replace alternative codes only when explicitly provided
      if (codigosAlternativos !== undefined) {
        const altCodes = normalizeAltCodes(codigosAlternativos, nextCodigo);
        if (await codeExistsElsewhere(empresaId, altCodes, id)) {
          throw new Error('Uno de los códigos alternativos ya pertenece a otro producto.');
        }
        await replaceAltCodes(updated.id, altCodes);
      }

      // Pasó de dólares a pesos: el vínculo vuelve a ARS con el costo en pesos y deja de seguir al dólar.
      if (body.listaUsd === null) {
        // costoLista = costo en pesos tal cual: "0" para que no se le vuelva a aplicar el descuento base
        // del proveedor, e IVA igual que el costo guardado para que no se sume ni se reste dos veces.
        const config = await obtenerConfigCostos(empresaId, tx);
        await tx.proveedorProducto.updateMany({
          where: { empresaId, productoId: id, preferido: true, moneda: 'USD' },
          data: { moneda: 'ARS', costoLista: updated.precioCosto, incluyeIva: config.ivaEnCosto, bonificaciones: '0', costoActualizadoAt: new Date() },
        });
      }

      return updated;
    });

    if (listaUsdNueva) {
      try {
        await fijarListaUsdProducto(empresaId, id, listaUsdNueva, getUserId(req));
      } catch (e) {
        return NextResponse.json({ error: `Se guardó el producto, pero no el costo en dólares: ${(e as Error).message}` }, { status: 400 });
      }
      return NextResponse.json(await prisma.producto.findUnique({ where: { id } }));
    }

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
