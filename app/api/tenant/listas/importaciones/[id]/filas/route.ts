import { NextResponse, type NextRequest } from 'next/server';
import { rutaModuloCostos } from '@/lib/listas/api';
import { matchearLote } from '@/lib/listas/importacion';
import type { FilaLista } from '@/lib/listas/parseo';

export const maxDuration = 60;
const MAX_FILAS_POR_LOTE = 1000;

const texto = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

// POST /api/tenant/listas/importaciones/:id/filas  → un lote de filas ya parseadas en el navegador
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const { filas } = (await req.json()) as { filas?: unknown[] };
    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'No llegaron filas.' }, { status: 400 });
    }
    if (filas.length > MAX_FILAS_POR_LOTE) {
      return NextResponse.json({ error: `Máximo ${MAX_FILAS_POR_LOTE} filas por envío.` }, { status: 400 });
    }

    const limpias: FilaLista[] = filas.map((f) => {
      const x = (f || {}) as Record<string, unknown>;
      const precio = typeof x.precio === 'number' && Number.isFinite(x.precio) ? x.precio : null;
      const importe = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e12 ? v : null);
      return {
        fila: Number(x.fila) || 0,
        codigo: texto(x.codigo),
        codigoFabricante: texto(x.codigoFabricante),
        descripcion: texto(x.descripcion),
        precio: precio !== null && precio < 1e12 ? precio : null,
        precioContado: importe(x.precioContado),
        precioTarjeta: importe(x.precioTarjeta),
        moneda: x.moneda === 'USD' ? 'USD' : 'ARS',
        marca: texto(x.marca),
        rubro: texto(x.rubro),
        bonificaciones: texto(x.bonificaciones),
      };
    });

    return NextResponse.json(await matchearLote(empresaId, id, limpias));
  });
}
