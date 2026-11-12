import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { aplicarCambiosCosto, calcularCambiosCosto } from '@/lib/costos-cambios';

export const maxDuration = 60;

// POST /api/tenant/costos/masivo
//   { alcance: { tipo: 'PROVEEDOR' | 'CATEGORIA', valor }, porcentaje: 8, aplicar?: boolean }
// Sube (o baja, con porcentaje negativo) el costo de todo un proveedor o una categoría.
// Sin `aplicar` devuelve la vista previa.
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { alcance, porcentaje, aplicar } = await req.json();
    const pct = parseFloat(String(porcentaje).replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= -90 || pct > 500 || pct === 0) {
      return NextResponse.json({ error: 'Ingresá un porcentaje entre -90% y 500% (distinto de 0).' }, { status: 400 });
    }

    let where: Prisma.ProductoWhereInput;
    let etiqueta: string;
    if (alcance?.tipo === 'PROVEEDOR' && alcance.valor) {
      const prov = await prisma.proveedor.findFirst({ where: { id: alcance.valor, empresaId }, select: { nombre: true } });
      if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
      where = { proveedorId: alcance.valor };
      etiqueta = `proveedor ${prov.nombre}`;
    } else if (alcance?.tipo === 'CATEGORIA' && alcance.valor) {
      where = { categoria: alcance.valor };
      etiqueta = `categoría ${alcance.valor}`;
    } else {
      return NextResponse.json({ error: 'Elegí un proveedor o una categoría.' }, { status: 400 });
    }

    const productos = await prisma.producto.findMany({ where: { ...where, empresaId, activo: true }, select: { id: true } });
    if (!productos.length) return NextResponse.json({ error: 'No hay productos activos en esa selección.' }, { status: 400 });
    const factor = 1 + pct / 100;
    const cambios = productos.map((p) => ({ productoId: p.id, factor }));

    if (!aplicar) {
      const { cambios: filas, margenMinimo, modoPrecio } = await calcularCambiosCosto(empresaId, cambios);
      const conCosto = filas.filter((f) => f.costoAnterior > 0);
      return NextResponse.json({
        etiqueta,
        porcentaje: pct,
        total: conCosto.length,
        sinCosto: filas.length - conCosto.length,
        preciosQueCambian: conCosto.filter((f) => f.precio).length,
        bajoMinimo: conCosto.filter((f) => f.precio?.bajoMinimo).length,
        margenMinimo,
        modoPrecio,
        filas: conCosto.slice(0, 300),
      });
    }

    const signo = pct > 0 ? '+' : '';
    return NextResponse.json(await aplicarCambiosCosto(empresaId, cambios, 'MASIVO', getUserId(req), `${signo}${pct}% a ${etiqueta}`));
  });
}
