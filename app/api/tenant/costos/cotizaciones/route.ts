import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { calcularCambioCotizacion, cotizacionVigenteRegistro, registrarCotizacion } from '@/lib/costos-dolar';

export const maxDuration = 60;

// GET /api/tenant/costos/cotizaciones → vigente, historial y cuántos productos cotizan en USD
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const [vigente, historial, productosUsd] = await Promise.all([
      cotizacionVigenteRegistro(empresaId),
      prisma.cotizacion.findMany({
        where: { empresaId, moneda: 'USD' },
        include: { usuario: { select: { nombre: true } } },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        take: 120,
      }),
      prisma.proveedorProducto.count({ where: { empresaId, preferido: true, activo: true, moneda: 'USD', producto: { activo: true } } }),
    ]);
    return NextResponse.json({
      vigente: vigente ? { valor: vigente.valor.toNumber(), fecha: vigente.fecha, fuente: vigente.fuente } : null,
      productosUsd,
      historial: historial.map((c) => ({
        id: c.id, valor: c.valor.toNumber(), fecha: c.fecha, fuente: c.fuente, usuario: c.usuario?.nombre ?? null, createdAt: c.createdAt,
      })),
    });
  });
}

// POST /api/tenant/costos/cotizaciones { valor, fecha (YYYY-MM-DD), preview? }
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { valor, fecha, preview } = await req.json();
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 1e8) return NextResponse.json({ error: 'Ingresá una cotización válida.' }, { status: 400 });
    const f = fecha ? new Date(`${fecha}T12:00:00-03:00`) : new Date();
    if (Number.isNaN(f.getTime())) return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
    if (f.getTime() > Date.now() + 36 * 3600_000) return NextResponse.json({ error: 'La fecha no puede ser futura.' }, { status: 400 });

    if (preview) {
      const vigente = await cotizacionVigenteRegistro(empresaId);
      const esVigente = !vigente || f.getTime() >= vigente.fecha.getTime();
      const { filas, modoPrecio, margenMinimo } = await calcularCambioCotizacion(empresaId, v);
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

    const r = await registrarCotizacion(empresaId, v, f, getUserId(req));
    return NextResponse.json({ ...r, cotizacion: { id: r.cotizacion.id, valor: v, fecha: r.cotizacion.fecha } });
  });
}
