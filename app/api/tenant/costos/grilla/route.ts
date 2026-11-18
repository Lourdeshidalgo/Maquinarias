import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { obtenerConfigCostos } from '@/lib/costos-db';
import { aplicarCambiosCosto } from '@/lib/costos-cambios';
import { costoReal, diasDesde, margenResultante, precioCredito, semaforoCosto } from '@/lib/costos';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

async function filasGrilla(empresaId: string, where: Prisma.ProductoWhereInput, page: number, pageSize: number) {
  const [config, total, productos] = await Promise.all([
    obtenerConfigCostos(empresaId),
    prisma.producto.count({ where }),
    prisma.producto.findMany({
      where,
      select: {
        id: true, codigo: true, nombre: true, categoria: true, precioCosto: true, costoEnvio: true, costoPackaging: true,
        precioVenta: true, costoActualizadoAt: true, margenPorcentaje: true,
        proveedor: { select: { id: true, nombre: true } },
        proveedorProductos: { where: { preferido: true }, select: { moneda: true }, take: 1 },
        preciosSugeridos: { where: { estado: 'PENDIENTE' }, select: { precioSugerido: true }, take: 1 },
      },
      orderBy: { nombre: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const umbrales = { umbralAmarillo: config.umbralAmarillo, umbralRojo: config.umbralRojo };
  const margenMinimo = n(config.margenMinimo);
  const recargoCredito = n(config.recargoCredito);
  return {
    total,
    margenMinimo,
    filas: productos.map((p) => {
      const real = costoReal({ precioCosto: n(p.precioCosto), costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging) });
      const recargo = margenResultante(n(p.precioVenta), real);
      return {
        id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, proveedor: p.proveedor,
        precioCosto: n(p.precioCosto), extras: n(p.costoEnvio) + n(p.costoPackaging), precioVenta: n(p.precioVenta),
        precioCredito: precioCredito(n(p.precioVenta), recargoCredito, config.redondeo),
        recargo, bajoMinimo: recargo !== null && recargo < margenMinimo,
        costoActualizadoAt: p.costoActualizadoAt, dias: diasDesde(p.costoActualizadoAt), semaforo: semaforoCosto(p.costoActualizadoAt, umbrales),
        monedaLista: p.proveedorProductos[0]?.moneda ?? 'ARS',
        precioSugerido: p.preciosSugeridos[0] ? n(p.preciosSugeridos[0].precioSugerido) : null,
      };
    }),
  };
}

// GET /api/tenant/costos/grilla?search=&proveedorId=&categoria=&semaforo=ROJO&page=1
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') || '50', 10) || 50));
    const search = (sp.get('search') || '').trim();
    const proveedorId = sp.get('proveedorId');
    const categoria = sp.get('categoria');
    const semaforo = sp.get('semaforo');

    const where: Prisma.ProductoWhereInput = { empresaId, activo: true };
    if (proveedorId === 'SIN') where.proveedorId = null;
    else if (proveedorId) where.proveedorId = proveedorId;
    if (categoria) where.categoria = categoria;
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
        { codigos: { some: { codigo: { contains: search, mode: 'insensitive' } } } },
        { proveedorProductos: { some: { codigoProveedor: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    if (semaforo === 'AMARILLO' || semaforo === 'ROJO') {
      const config = await obtenerConfigCostos(empresaId);
      const dia = 86_400_000;
      where.costoActualizadoAt = semaforo === 'ROJO'
        ? { lt: new Date(Date.now() - (config.umbralRojo + 1) * dia) }
        : { lte: new Date(Date.now() - config.umbralAmarillo * dia), gte: new Date(Date.now() - (config.umbralRojo + 1) * dia) };
    }

    const [datos, categorias, proveedores] = await Promise.all([
      filasGrilla(empresaId, where, page, pageSize),
      prisma.producto.groupBy({ by: ['categoria'], where: { empresaId, activo: true }, orderBy: { categoria: 'asc' } }),
      prisma.proveedor.findMany({ where: { empresaId, activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    ]);
    return NextResponse.json({
      ...datos,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(datos.total / pageSize)),
      categorias: categorias.map((c) => c.categoria),
      proveedores,
    });
  });
}

// PATCH /api/tenant/costos/grilla { productoId, precioCosto } → guarda un costo editado en la grilla
export async function PATCH(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { productoId, precioCosto } = await req.json();
    const costo = parseFloat(String(precioCosto).replace(',', '.'));
    if (!productoId || !Number.isFinite(costo) || costo < 0 || costo >= 1e12) {
      return NextResponse.json({ error: 'Costo inválido.' }, { status: 400 });
    }
    const existe = await prisma.producto.findFirst({ where: { id: productoId, empresaId, activo: true }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });

    const resultado = await aplicarCambiosCosto(empresaId, [{ productoId, nuevoCosto: costo }], 'MANUAL', getUserId(req), 'Edición rápida');
    const { filas } = await filasGrilla(empresaId, { id: productoId, empresaId }, 1, 1);
    return NextResponse.json({ ...resultado, fila: filas[0] ?? null });
  });
}
