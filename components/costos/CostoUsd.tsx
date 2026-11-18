'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/format';

// Selector "Costo en: Pesos / Dólares" del formulario de Stock (módulo de costos).
// En Dólares se carga el precio de lista en USD del proveedor asignado y se muestra
// en vivo el dólar de ese proveedor, el costo en pesos y el precio de venta que quedan.

export type CostoUsdValor = { modo: 'ARS' | 'USD'; costoLista: string; incluyeIva: boolean; bonificaciones: string };

export const COSTO_USD_VACIO: CostoUsdValor = { modo: 'ARS', costoLista: '', incluyeIva: false, bonificaciones: '' };

/** Lo que se manda a la API de productos: objeto en USD, null para volver a pesos, undefined si no se toca. */
export function listaUsdParaApi(v: CostoUsdValor, eraUsd: boolean) {
  if (v.modo === 'USD') return { costoLista: v.costoLista, incluyeIva: v.incluyeIva, bonificaciones: v.bonificaciones };
  return eraUsd ? null : undefined;
}

type Simulacion = { cotizacion: number | null; costo: number | null; precio: number | null };

export default function CostoUsd({
  valor, onChange, proveedorId, producto, onSimulado,
}: {
  valor: CostoUsdValor;
  onChange: (v: CostoUsdValor) => void;
  proveedorId: string;
  producto: { ivaPorcentaje: string; categoria: string; margenPorcentaje?: string | null; costoEnvio?: string; costoPackaging?: string };
  onSimulado: (costo: number, precio: number) => void; // para llenar costo y precio en pesos del formulario
}) {
  const [sim, setSim] = useState<Simulacion | null>(null);
  const [error, setError] = useState('');
  const [calculando, setCalculando] = useState(false);

  const { modo, costoLista, incluyeIva, bonificaciones } = valor;
  const { ivaPorcentaje, categoria, margenPorcentaje, costoEnvio, costoPackaging } = producto;

  useEffect(() => {
    if (modo !== 'USD' || !costoLista) return;
    const t = setTimeout(async () => {
      setCalculando(true);
      try {
        const r = await fetch('/api/tenant/costos/simular-usd', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proveedorId, costoLista, incluyeIva, bonificaciones, ivaPorcentaje, categoria, margenPorcentaje, costoEnvio, costoPackaging,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setSim(d);
        setError('');
        if (d.costo !== null && d.precio !== null) onSimulado(d.costo, d.precio);
      } catch (e) {
        setSim(null);
        setError((e as Error).message || 'No se pudo calcular.');
      } finally {
        setCalculando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // onSimulado cambia en cada render del padre: no se incluye para no recalcular en loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, costoLista, incluyeIva, bonificaciones, proveedorId, ivaPorcentaje, categoria, margenPorcentaje, costoEnvio, costoPackaging]);

  return (
    <div className="form-group" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: modo === 'USD' ? '0.75rem' : 0 }}>
        <label className="form-label" style={{ margin: 0 }}>Costo en</label>
        <div role="radiogroup" aria-label="Moneda del costo" style={{ display: 'flex', gap: '0.25rem' }}>
          {(['ARS', 'USD'] as const).map((m) => (
            <button
              key={m} type="button" role="radio" aria-checked={modo === m}
              className={`btn btn-sm ${modo === m ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onChange({ ...valor, modo: m })}
            >
              {m === 'ARS' ? 'Pesos' : 'Dólares'}
            </button>
          ))}
        </div>
      </div>

      {modo === 'USD' && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Precio de lista (US$)</label>
              <input
                type="text" inputMode="decimal" className="form-input" placeholder="Ej: 17,4" required
                value={costoLista} onChange={(e) => onChange({ ...valor, costoLista: e.target.value.replace(/[^\d.,]/g, '') })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Descuento propio (opcional)</label>
              <input
                type="text" className="form-input" placeholder="Usa el del proveedor"
                value={bonificaciones} onChange={(e) => onChange({ ...valor, bonificaciones: e.target.value })}
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <input type="checkbox" checked={incluyeIva} onChange={(e) => onChange({ ...valor, incluyeIva: e.target.checked })} />
            El precio de lista ya incluye IVA
          </label>
          <div style={{ fontSize: '0.85rem', color: error ? '#b91c1c' : 'var(--text-muted)' }} aria-live="polite">
            {calculando ? (
              <Loader2 size={14} className="spin" />
            ) : error ? (
              error
            ) : !costoLista ? (
              'Ingresá el precio en dólares para ver el costo y el precio de venta.'
            ) : sim && sim.cotizacion === null ? (
              'Este proveedor no tiene dólar cargado y no hay dólar general. Cargalo en "Dólar por proveedor".'
            ) : sim && sim.costo !== null && sim.precio !== null ? (
              <>
                Dólar del proveedor: <strong>{formatMoney(sim.cotizacion ?? 0)}</strong> · Costo: <strong>{formatMoney(sim.costo)}</strong> ·
                Precio de venta: <strong>{formatMoney(sim.precio)}</strong>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
