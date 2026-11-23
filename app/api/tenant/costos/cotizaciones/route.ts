import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { calcularCambioCotizacion, cotizacionVigenteRegistro, registrarCotizacion } from '@/lib/costos-dolar';

export const maxDuration = 60;

// GET /api/tenant/costos/cotizaciones?proveedorId=
// → dólar general, dólar de cada proveedor activo, cuántos productos en USD tiene
//   cada uno, y el historial (todo, o solo el de un proveedor / "general").
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const filtro = req.nextUrl.searchParams.get('proveedorId');
    const filtroHistorial = filtro === 'general' ? { proveedorId: null } : filtro ? { proveedorId: filtro } : {};

    const [general, ultimas, proveedores, usdPorProveedor, historial] = await Promise.all([
      cotizacionVigenteRegistro(empresaId, null),
      prisma.cotizacion.findMany({
        where: { empresaId, moneda: 'USD', proveedorId: { not: null } },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        distinct: ['proveedorId'],
        select: { proveedorId: true, valor: true, fecha: true },
      }),
      prisma.proveedor.findMany({ where: { empresaId, activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      prisma.proveedorProducto.groupBy({
        by: ['proveedorId'],
        where: { empresaId, preferido: true, activo: true, moneda: 'USD', producto: { activo: true } },
        _count: { _all: true },
      }),
      prisma.cotizacion.findMany({
        where: { empresaId, moneda: 'USD', ...filtroHistorial },
        include: { usuario: { select: { nombre: true } }, proveedor: { select: { nombre: true } } },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        take: 120,
      }),
    ]);

    const propio = new Map(ultimas.map((c) => [c.proveedorId as string, c]));
    const usd = new Map(usdPorProveedor.map((g) => [g.proveedorId, g._count._all]));
    const valorGeneral = general ? general.valor.toNumber() : null;

    return NextResponse.json({
      general: general ? { valor: valorGeneral, fecha: general.fecha } : null,
      productosUsd: usdPorProveedor.reduce((t, g) => t + g._count._all, 0),
      proveedores: proveedores.map((p) => {
        const c = propio.get(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          propio: !!c,
          valor: c ? c.valor.toNumber() : valorGeneral,
          fecha: c ? c.fecha : null,
          productosUsd: usd.get(p.id) ?? 0,
        };
      }),
      historial: historial.map((c) => ({
        id: c.id, valor: c.valor.toNumber(), fecha: c.fecha, fuente: c.fuente, usuario: c.usuario?.nombre ?? null,
        proveedorId: c.proveedorId, proveedor: c.proveedor?.nombre ?? null, createdAt: c.createdAt,
      })),
    });
  });
}

// POST /api/tenant/costos/cotizaciones { valor, fecha (YYYY-MM-DD), preview?, proveedorId? }
// Sin proveedorId carga el dólar general.
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { valor, fecha, preview, proveedorId: pid } = await req.json();
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 1e8) return NextResponse.json({ error: 'Ingresá una cotización válida.' }, { status: 400 });
    const f = fecha ? new Date(`${fecha}T12:00:00-03:00`) : new Date();
    if (Number.isNaN(f.getTime())) return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
    if (f.getTime() > Date.now() + 36 * 3600_000) return NextResponse.json({ error: 'La fecha no puede ser futura.' }, { status: 400 });

    const proveedorId: string | null = typeof pid === 'string' && pid ? pid : null;
    if (proveedorId) {
      const existe = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { id: true } });
      if (!existe) return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    }

    if (preview) {
      const vigente = await cotizacionVigenteRegistro(empresaId, proveedorId);
      const esVigente = !vigente || f.getTime() >= vigente.fecha.getTime();
      const { filas, modoPrecio, margenMinimo } = await calcularCambioCotizacion(empresaId, v, proveedorId);
      const cambian = filas.filter((x) => Math.abs(x.costoNuevo - x.costoAnterior) > 0.001);
      return NextResponse.json({
        esVigente,
        anterior: vigente ? vigente.valor.toNumber() : null,
        modoPrecio,
        margenMinimo,
        total: cambian.length,
        filas: cambian.slice(0, 200),
      });
    }

    const r = await registrarCotizacion(empresaId, v, f, getUserId(req), proveedorId);
    return NextResponse.json({ ...r, cotizacion: { id: r.cotizacion.id, valor: v, fecha: r.cotizacion.fecha, proveedorId } });
  });
}
