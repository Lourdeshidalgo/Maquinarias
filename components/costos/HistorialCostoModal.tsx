'use client';

import { useEffect, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { formatMoney } from '@/lib/format';

type Movimiento = {
  id: string; fecha: string; origen: string; origenTexto: string; afectaVigente: boolean; proveedor: string | null;
  costoAnterior: number; costoNuevo: number; costoListaAnterior: number | null; costoListaNuevo: number | null; moneda: string | null;
  precioVentaAnterior: number | null; precioVentaNuevo: number | null; usuario: string | null; detalle: string | null;
};
type Datos = {
  producto: { id: string; codigo: string; nombre: string; precioCosto: number; precioVenta: number; costoActualizadoAt: string };
  historial: Movimiento[];
};

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

/** Mini gráfico de evolución del costo vigente (solo cambios que afectan el costo vigente). */
function MiniGrafico({ puntos }: { puntos: { fecha: string; valor: number }[] }) {
  if (puntos.length < 2) return null;
  const W = 520, H = 90, P = 6;
  const vals = puntos.map((p) => p.valor);
  const min = Math.min(...vals), max = Math.max(...vals);
  const rango = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / rango;
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const subio = puntos[puntos.length - 1].valor >= puntos[0].valor;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Evolución del costo" style={{ display: 'block', marginBottom: '0.75rem' }}>
      <path d={d} fill="none" stroke={subio ? '#dc2626' : '#16a34a'} strokeWidth={2} />
      {puntos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.valor)} r={3} fill={subio ? '#dc2626' : '#16a34a'}>
          <title>{`${fecha(p.fecha)}: ${formatMoney(p.valor)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function HistorialCostoModal({ productoId, onCerrar }: { productoId: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/tenant/costos/productos/${productoId}/historial`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDatos(d);
      })
      .catch((e) => setError((e as Error).message || 'No se pudo cargar el historial.'));
  }, [productoId]);

  // Serie del costo vigente: el primer valor anterior y cada valor nuevo, en orden.
  const vigentes = (datos?.historial ?? []).filter((h) => h.afectaVigente).slice().reverse();
  const puntos = vigentes.length
    ? [{ fecha: vigentes[0].fecha, valor: vigentes[0].costoAnterior }, ...vigentes.map((h) => ({ fecha: h.fecha, valor: h.costoNuevo }))].filter((p) => p.valor > 0)
    : [];

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-content" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={20} /> Historial de costos{datos ? `: ${datos.producto.nombre}` : ''}
          </h3>
        </div>
        <div className="modal-body">
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          {!datos && !error && <div style={{ textAlign: 'center', padding: '1.5rem' }}><Loader2 className="spin" /></div>}
          {datos && (
            <>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                {datos.producto.codigo} · costo vigente <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(datos.producto.precioCosto)}</strong>
                {' '}· actualizado el {fecha(datos.producto.costoActualizadoAt)} · precio de venta {formatMoney(datos.producto.precioVenta)}
              </p>
              <MiniGrafico puntos={puntos} />
              {datos.historial.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Todavía no hay cambios de costo registrados para este producto.</p>
              ) : (
                <div className="table-container" style={{ maxHeight: 360, overflowY: 'auto', margin: 0 }}>
                  <table className="table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Origen</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Var.</th>
                        <th style={{ textAlign: 'right' }}>Precio de venta</th><th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.historial.map((h) => {
                        const varPct = h.costoAnterior > 0 ? ((h.costoNuevo - h.costoAnterior) / h.costoAnterior) * 100 : null;
                        return (
                          <tr key={h.id} style={{ opacity: h.afectaVigente ? 1 : 0.7 }}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fecha(h.fecha)}</td>
                            <td>
                              {h.origenTexto}
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {[h.proveedor, h.detalle, !h.afectaVigente ? 'proveedor alternativo (no cambia el vigente)' : null].filter(Boolean).join(' · ')}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {h.afectaVigente ? (
                                <><span style={{ color: 'var(--text-muted)' }}>{formatMoney(h.costoAnterior)} → </span>{formatMoney(h.costoNuevo)}</>
                              ) : (
                                <>lista {h.costoListaAnterior !== null ? `${formatMoney(h.costoListaAnterior)} → ` : ''}{h.costoListaNuevo !== null ? formatMoney(h.costoListaNuevo) : '—'}</>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', color: varPct === null ? 'var(--text-muted)' : varPct > 0 ? '#b91c1c' : '#15803d' }}>
                              {h.afectaVigente && varPct !== null ? `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {h.precioVentaAnterior === null ? '—'
                                : h.precioVentaNuevo === null ? <><span style={{ color: 'var(--text-muted)' }}>{formatMoney(h.precioVentaAnterior)}</span> · sugerido</>
                                : h.precioVentaNuevo !== h.precioVentaAnterior ? <><span style={{ color: 'var(--text-muted)' }}>{formatMoney(h.precioVentaAnterior)} → </span>{formatMoney(h.precioVentaNuevo)}</>
                                : formatMoney(h.precioVentaNuevo)}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>{h.usuario ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
