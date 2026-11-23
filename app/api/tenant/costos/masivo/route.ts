import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { aplicarCambiosCosto, calcularCambiosCosto } from '@/lib/costos-cambios';

export const maxDuration = 60;

// Filtro de productos del alcance (proveedor preferido o categoría). null si es inválido.
async function alcanceMasivo(empresaId: string, alcance: { tipo?: string; valor?: string } | null) {
  if (alcance?.tipo === 'PROVEEDOR' && alcance.valor) {
    const prov = await prisma.proveedor.findFirst({ where: { id: alcance.valor, empresaId }, select: { nombre: true } });
    if (!prov) return null;
    return { where: { proveedorId: alcance.valor } as Prisma.ProductoWhereInput, etiqueta: `proveedor ${prov.nombre}` };
  }
  if (alcance?.tipo === 'CATEGORIA' && alcance.valor) {
    return { where: { categoria: alcance.valor } as Prisma.ProductoWhereInput, etiqueta: `categoría ${alcance.valor}` };
  }
  return null;
}

// GET /api/tenant/costos/masivo?tipo=PROVEEDOR&valor=<id> → productos del alcance, para elegir cuáles ajustar
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const sp = req.nextUrl.searchParams;
    const a = await alcanceMasivo(empresaId, { tipo: sp.get('tipo') ?? undefined, valor: sp.get('valor') ?? undefined });
    if (!a) return NextResponse.json({ error: 'Elegí un proveedor o una categoría.' }, { status: 400 });
    const productos = await prisma.producto.findMany({
      where: { ...a.where, empresaId, activo: true },
      select: { id: true, codigo: true, nombre: true, categoria: true, precioCosto: true },
      orderBy: { nombre: 'asc' },
      take: 5000,
    });
    return NextResponse.json({
      productos: productos.map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, precioCosto: p.precioCosto.toNumber() })),
    });
  });
}

// POST /api/tenant/costos/masivo
//   { alcance: { tipo: 'PROVEEDOR' | 'CATEGORIA', valor }, porcentaje: 8, aplicar?: boolean }
//   { alcance, tipoAjuste: 'MONTO', monto: 5000, aplicar? }  → suma un monto fijo en pesos a cada producto
// Sube (o baja, con valor negativo) el costo de todo un proveedor o una categoría.
// Sin `aplicar` devuelve la vista previa. Los productos sin costo cargado no se tocan.
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    // productoIds (opcional): solo esos productos del alcance; si no viene, todos.
    const { alcance, porcentaje, monto, tipoAjuste = 'PORCENTAJE', aplicar, productoIds } = await req.json();
    const porMonto = tipoAjuste === 'MONTO';
    const pct = porMonto ? 0 : parseFloat(String(porcentaje).replace(',', '.'));
    const delta = porMonto ? parseInt(String(monto).replace(/[^\d-]/g, ''), 10) : 0;

    if (porMonto) {
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) >= 1e11) {
        return NextResponse.json({ error: 'Ingresá un monto en pesos, sin decimales (distinto de 0).' }, { status: 400 });
      }
    } else if (!Number.isFinite(pct) || pct <= -90 || pct > 500 || pct === 0) {
      return NextResponse.json({ error: 'Ingresá un porcentaje entre -90% y 500% (distinto de 0).' }, { status: 400 });
    }

    const a = await alcanceMasivo(empresaId, alcance);
    if (!a) return NextResponse.json({ error: 'Elegí un proveedor o una categoría.' }, { status: 400 });
    const { where } = a;
    let { etiqueta } = a;

    const seleccion = Array.isArray(productoIds) ? productoIds.filter((x: unknown) => typeof x === 'string').slice(0, 5000) : null;
    if (seleccion && !seleccion.length) {
      return NextResponse.json({ error: 'Marcá al menos un producto.' }, { status: 400 });
    }
    const productos = await prisma.producto.findMany({
      // La selección siempre se acota al alcance (no se pueden colar productos de otro proveedor).
      where: { ...where, empresaId, activo: true, ...(seleccion ? { id: { in: seleccion } } : {}) },
      select: { id: true, precioCosto: true },
    });
    if (!productos.length) return NextResponse.json({ error: 'No hay productos activos en esa selección.' }, { status: 400 });
    if (seleccion) etiqueta = `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} del ${etiqueta}`;

    const conCostoCargado = productos.filter((p) => p.precioCosto.toNumber() > 0);
    const sinCosto = productos.length - conCostoCargado.length;
    const factor = 1 + pct / 100;
    const cambios = conCostoCargado.map((p) => (porMonto ? { productoId: p.id, delta } : { productoId: p.id, factor }));

    if (!aplicar) {
      const { cambios: filas, margenMinimo, modoPrecio } = await calcularCambiosCosto(empresaId, cambios);
      return NextResponse.json({
        etiqueta,
        tipoAjuste: porMonto ? 'MONTO' : 'PORCENTAJE',
        porcentaje: pct,
        monto: delta,
        total: filas.length,
        sinCosto,
        quedanEnCero: filas.filter((f) => f.costoNuevo === 0).length,
        preciosQueCambian: filas.filter((f) => f.precio).length,
        bajoMinimo: filas.filter((f) => f.precio?.bajoMinimo).length,
        margenMinimo,
        modoPrecio,
        filas: filas.slice(0, 300),
      });
    }

    const detalle = porMonto
      ? `${delta > 0 ? '+' : '-'}$${Math.abs(delta).toLocaleString('es-AR')} a ${etiqueta}`
      : `${pct > 0 ? '+' : ''}${pct}% a ${etiqueta}`;
    return NextResponse.json(await aplicarCambiosCosto(empresaId, cambios, 'MASIVO', getUserId(req), detalle));
  });
}
