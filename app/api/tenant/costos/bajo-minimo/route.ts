import { NextResponse, type NextRequest } from 'next/server';
import { rutaModuloCostos } from '@/lib/listas/api';
import { calcularPrecios } from '@/lib/costos-precios';

// GET /api/tenant/costos/bajo-minimo → productos cuyo precio actual deja un recargo menor al mínimo
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { filas, margenMinimo } = await calcularPrecios(empresaId, {}, { incluirSinCambio: true });
    const bajo = filas
      .filter((f) => f.recargoActual !== null && f.recargoActual < margenMinimo)
      .sort((a, b) => (a.recargoActual ?? 0) - (b.recargoActual ?? 0));
    return NextResponse.json({ margenMinimo, total: bajo.length, items: bajo.slice(0, 500) });
  });
}
