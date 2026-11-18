import { NextResponse, type NextRequest } from 'next/server';
import { rutaModuloCostos } from '@/lib/listas/api';
import { datosListaManual } from '@/lib/costos';
import { simularListaUsd } from '@/lib/costos-dolar';

const num = (v: unknown) => {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};

// POST /api/tenant/costos/simular-usd
// { proveedorId, costoLista, incluyeIva, bonificaciones, ivaPorcentaje, costoEnvio, costoPackaging, categoria, margenPorcentaje }
// → { cotizacion, costo, precio }: vista en vivo del formulario de Stock (no guarda nada).
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const b = await req.json();
    if (!b.proveedorId) return NextResponse.json({ error: 'Elegí un proveedor.' }, { status: 400 });
    const d = datosListaManual(b);
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
    const margen = b.margenPorcentaje === '' || b.margenPorcentaje === null || b.margenPorcentaje === undefined ? null : num(b.margenPorcentaje);
    const r = await simularListaUsd(empresaId, String(b.proveedorId), d, {
      ivaPorcentaje: b.ivaPorcentaje === undefined || b.ivaPorcentaje === '' ? 21 : num(b.ivaPorcentaje),
      costoEnvio: num(b.costoEnvio),
      costoPackaging: num(b.costoPackaging),
      categoria: String(b.categoria || 'General'),
      margenPorcentaje: margen,
    });
    return NextResponse.json(r);
  });
}
