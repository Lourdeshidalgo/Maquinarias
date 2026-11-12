import { NextResponse, type NextRequest } from 'next/server';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { alcanceRecalculo, aplicarPrecios, calcularPrecios } from '@/lib/costos-precios';

export const maxDuration = 60;

// POST /api/tenant/costos/recalcular
//   { alcance: { tipo: 'TODOS'|'CATEGORIA'|'PROVEEDOR'|'PRODUCTOS', valor?, ids? }, aplicar?: boolean }
// Sin `aplicar`: vista previa de los precios que cambian. Con `aplicar`: los
// actualiza (modo automático) o los manda a la bandeja (modo con aprobación).
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { alcance, aplicar } = await req.json();
    const where = alcanceRecalculo(alcance || {});
    if (!where) return NextResponse.json({ error: 'Alcance del recálculo inválido.' }, { status: 400 });

    const { filas, margenMinimo, modoPrecio } = await calcularPrecios(empresaId, where);
    if (!aplicar) {
      return NextResponse.json({
        total: filas.length,
        bajoMinimo: filas.filter((f) => f.bajoMinimo).length,
        margenMinimo,
        modoPrecio,
        filas: filas.slice(0, 200),
      });
    }
    return NextResponse.json(await aplicarPrecios(empresaId, filas, 'REGLAS', getUserId(req)));
  });
}
