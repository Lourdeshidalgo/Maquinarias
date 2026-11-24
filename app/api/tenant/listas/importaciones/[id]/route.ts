import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { calcularFila, contextoPrecios, recontar } from '@/lib/listas/importacion';
import type { MapeoLista } from '@/lib/listas/parseo';

const FILTROS: Record<string, Prisma.ImportacionItemWhereInput> = {
  TODOS: {},
  SUBA: { estado: 'SUBA' },
  BAJA: { estado: 'BAJA' },
  IGUAL: { estado: 'IGUAL' },
  NUEVO: { estado: 'NUEVO' },
  FALTANTE: { estado: 'FALTANTE' },
  ERROR: { estado: 'ERROR' },
  ALERTA: { alerta: true },
  SELECCIONADOS: { seleccionado: true, accion: { not: 'IGNORAR' } },
};

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : null);

// GET /api/tenant/listas/importaciones/:id?filtro=SUBA&page=1&search=
// Vista previa: cabecera, contadores y una página de filas con el costo y el
// precio de venta que quedarían.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const imp = await prisma.importacionLista.findFirst({
      where: { id, empresaId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    if (!imp) return NextResponse.json({ error: 'Importación no encontrada.' }, { status: 404 });

    const filtro = FILTROS[sp.get('filtro') || 'TODOS'] ?? {};
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10) || 50));
    const search = (sp.get('search') || '').trim();
    const where: Prisma.ImportacionItemWhereInput = {
      importacionId: id,
      ...filtro,
      ...(search
        ? { OR: [{ codigo: { contains: search, mode: 'insensitive' } }, { descripcion: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };

    const [contadores, total, items, ctx] = await Promise.all([
      recontar(id),
      prisma.importacionItem.count({ where }),
      prisma.importacionItem.findMany({
        where,
        orderBy: [{ fila: 'asc' }, { descripcion: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      contextoPrecios(empresaId, imp.proveedorId),
    ]);

    const productoIds = Array.from(
      new Set(items.flatMap((i) => [i.productoId, i.sugerenciaProductoId]).filter(Boolean) as string[])
    );
    const [productos, preferidos] = await Promise.all([
      prisma.producto.findMany({
        where: { empresaId, id: { in: productoIds } },
        select: {
          id: true, codigo: true, nombre: true, categoria: true, precioCosto: true, precioVenta: true,
          costoEnvio: true, costoPackaging: true, ivaPorcentaje: true, margenPorcentaje: true, activo: true,
          proveedor: { select: { nombre: true } },
        },
      }),
      prisma.proveedorProducto.findMany({
        where: { empresaId, productoId: { in: productoIds }, preferido: true },
        select: { productoId: true, proveedorId: true },
      }),
    ]);
    const productoPorId = new Map(productos.map((p) => [p.id, p]));
    const preferidoPorProducto = new Map(preferidos.map((p) => [p.productoId, p.proveedorId]));
    const mapeo = (imp.mapeo || {}) as Partial<MapeoLista>;
    const incluyeIva = mapeo.incluyeIva ?? true;

    const filas = items.map((i) => {
      const p = i.productoId ? productoPorId.get(i.productoId) : undefined;
      const sugerido = i.sugerenciaProductoId ? productoPorId.get(i.sugerenciaProductoId) : undefined;
      const preferidoActual = p ? preferidoPorProducto.get(p.id) : undefined;
      // El costo vigente cambia si este proveedor es el preferido (o el producto no tiene preferido).
      const afectaVigente = i.accion === 'CREAR' || !p || !preferidoActual || preferidoActual === imp.proveedorId;

      let calculo = null;
      if (i.precio && (p || i.accion === 'CREAR')) {
        calculo = calcularFila(
          ctx,
          { precio: i.precio.toNumber(), moneda: i.moneda || 'ARS', bonificaciones: i.bonificaciones },
          incluyeIva,
          p
            ? {
                ivaPorcentaje: p.ivaPorcentaje.toNumber(), costoEnvio: p.costoEnvio.toNumber(), costoPackaging: p.costoPackaging.toNumber(),
                categoria: p.categoria, margenPorcentaje: n(p.margenPorcentaje), proveedorId: imp.proveedorId,
              }
            : {
                ivaPorcentaje: mapeo.ivaProductosNuevos ?? 21, costoEnvio: 0, costoPackaging: 0,
                categoria: i.rubro, margenPorcentaje: null, proveedorId: imp.proveedorId,
              },
          mapeo.talCual ? { precioContado: i.precioContado ? i.precioContado.toNumber() : null } : undefined
        );
      }

      return {
        id: i.id, fila: i.fila, codigo: i.codigo, descripcion: i.descripcion, precio: n(i.precio), moneda: i.moneda,
        marca: i.marca, rubro: i.rubro, bonificaciones: i.bonificaciones, tipoMatch: i.tipoMatch, estado: i.estado,
        alerta: i.alerta, accion: i.accion, seleccionado: i.seleccionado, error: i.error, aplicado: i.aplicado,
        costoListaAnterior: n(i.costoListaAnterior), variacionPct: n(i.variacionPct),
        producto: p
          ? { id: p.id, codigo: p.codigo, nombre: p.nombre, precioCosto: p.precioCosto.toNumber(), precioVenta: p.precioVenta.toNumber(), activo: p.activo }
          : null,
        sugerencia: sugerido ? { id: sugerido.id, codigo: sugerido.codigo, nombre: sugerido.nombre, proveedor: sugerido.proveedor?.nombre ?? null } : null,
        afectaVigente,
        costoNuevo: afectaVigente ? calculo?.costoNuevo ?? null : null,
        precioNuevo: afectaVigente ? calculo?.precioNuevo ?? null : null,
        recargo: afectaVigente ? calculo?.margen ?? null : null,
        nivelMargen: afectaVigente ? calculo?.nivel ?? null : null,
        bajoMinimo: afectaVigente ? !!calculo?.bajoMinimo : false,
      };
    });

    const cabecera: Partial<typeof imp> = { ...imp };
    delete cabecera.mapeo;
    delete cabecera.archivoUrl;
    return NextResponse.json({
      importacion: { ...cabecera, tieneArchivo: !!imp.archivoUrl, incluyeIva, talCual: !!mapeo.talCual },
      contadores,
      config: { modoPrecio: ctx.modoPrecio, cotizacion: ctx.cotizacion, margenMinimo: ctx.margenMinimo },
      items: filas,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  });
}

// DELETE /api/tenant/listas/importaciones/:id  → descarta un borrador (no toca costos)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const r = await prisma.importacionLista.updateMany({
      where: { id, empresaId, estado: 'BORRADOR' },
      data: { estado: 'DESCARTADA' },
    });
    if (r.count !== 1) return NextResponse.json({ error: 'Solo se pueden descartar importaciones sin aplicar.' }, { status: 400 });
    await prisma.importacionItem.deleteMany({ where: { importacionId: id, empresaId } });
    return NextResponse.json({ success: true });
  });
}
