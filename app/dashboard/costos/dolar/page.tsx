'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { formatMoney, todayArgentina } from '@/lib/format';

type Cotizacion = { id: string; valor: number; fecha: string; fuente: string; usuario: string | null; createdAt: string };
type Datos = { vigente: { valor: number; fecha: string; fuente: string } | null; productosUsd: number; historial: Cotizacion[] };
type Preview = {
  esVigente: boolean; anterior: number | null; modoPrecio: string; margenMinimo: number; total: number;
  filas: { productoId: string; codigo: string; nombre: string; costoLista: number; costoAnterior: number; costoNuevo: number; precioActual: number; precioNuevo: number; recargoNuevo: number | null; bajoMinimo: boolean }[];
};

const fechaCorta = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

function Grafico({ historial }: { historial: Cotizacion[] }) {
  const puntos = [...historial].reverse().slice(-60);
  if (puntos.length < 2) return null;
  const W = 600, H = 120, P = 8;
  const valores = puntos.map((p) => p.valor);
  const min = Math.min(...valores), max = Math.max(...valores);
  const rango = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / rango;
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Evolución de la cotización del dólar" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} />
      {puntos.map((p, i) => (
        <circle key={p.id} cx={x(i)} cy={y(p.valor)} r={2.5} fill="var(--primary)">
          <title>{`${fechaCorta(p.fecha)}: ${formatMoney(p.valor)}`}</title>
        </circle>
      ))}
      <text x={P} y={12} fontSize={11} fill="var(--text-muted)">{formatMoney(max)}</text>
      <text x={P} y={H - 2} fontSize={11} fill="var(--text-muted)">{formatMoney(min)}</text>
    </svg>
  );
}

export default function DolarPage() {
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(6000);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(todayArgentina());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/tenant/costos/cotizaciones');
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudo cargar.', 'error');
  }, [showToast]);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar]);

  const verImpacto = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrabajando(true);
    try {
      const r = await fetch('/api/tenant/costos/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, fecha, preview: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPreview(d);
    } catch (err) {
      showToast((err as Error).message || 'No se pudo calcular.', 'error');
    } finally {
      setTrabajando(false);
    }
  };

  const guardar = async () => {
    setTrabajando(true);
    try {
      const r = await fetch('/api/tenant/costos/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, fecha }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.vigente) showToast('Cotización guardada en el historial. No es la más reciente, así que no cambia los costos.', 'info');
      else {
        const partes = [`${d.costosActualizados} costos en pesos actualizados`];
        if (d.actualizados) partes.push(`${d.actualizados} precios de venta actualizados`);
        if (d.sugeridos) partes.push(`${d.sugeridos} precios enviados a la bandeja para aprobar`);
        showToast(`Cotización guardada: ${partes.join(', ')}.`, 'success');
      }
      setPreview(null);
      setValor('');
      await cargar();
    } catch (err) {
      showToast((err as Error).message || 'No se pudo guardar.', 'error');
    } finally {
      setTrabajando(false);
    }
  };

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  const historial = datos?.historial ?? [];

  return (
    <div>
      {toastNode}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <DollarSign size={26} style={{ color: 'var(--primary)' }} />
          <span>Cotización del dólar</span>
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Se usa para pasar a pesos los costos en dólares. Al cargar una nueva, se recalculan los costos y los precios de esos productos.
        </p>
      </div>

      <div className="responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}><DollarSign size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Cotización vigente</span>
            <span className="stat-value">{datos?.vigente ? formatMoney(datos.vigente.valor) : 'Sin cargar'}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {datos?.vigente ? `desde el ${fechaCorta(datos.vigente.fecha)}` : 'Cargá la primera cotización'} · {datos?.productosUsd ?? 0} productos con costo en USD
            </span>
          </div>
        </div>

        <form className="card" onSubmit={verImpacto}>
          <h3 style={{ marginBottom: '0.75rem' }}>Cargar cotización</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Pesos por dólar</label>
              <input type="number" step="0.01" min="0.01" className="form-input" required value={valor} onChange={(e) => setValor(e.target.value)} placeholder={datos?.vigente ? String(datos.vigente.valor) : 'Ej: 1250'} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input type="date" className="form-input" value={fecha} max={todayArgentina()} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={trabajando || !valor}>
            {trabajando ? <Loader2 size={16} className="spin" /> : <Eye size={16} />} Ver cómo impacta
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Evolución</h3>
        {historial.length < 2 ? <p style={{ color: 'var(--text-muted)' }}>Con dos o más cotizaciones se muestra el gráfico.</p> : <Grafico historial={historial} />}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Cotización</th><th style={{ textAlign: 'right' }}>Variación</th><th>Origen</th><th>Cargada por</th></tr></thead>
            <tbody>
              {historial.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Todavía no hay cotizaciones.</td></tr>}
              {historial.map((c, i) => {
                const previa = historial[i + 1];
                const variacion = previa ? ((c.valor - previa.valor) / previa.valor) * 100 : null;
                return (
                  <tr key={c.id}>
                    <td>{fechaCorta(c.fecha)}{i === 0 && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: '0.7rem' }}>Vigente</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(c.valor)}</td>
                    <td style={{ textAlign: 'right', color: variacion === null ? 'var(--text-muted)' : variacion > 0 ? '#b91c1c' : '#15803d' }}>
                      {variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${variacion.toFixed(2)}%`}
                    </td>
                    <td>{c.fuente === 'API' ? 'Automática' : 'Manual'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.usuario ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => !trabajando && setPreview(null)}>
          <div className="modal-content" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Dólar a {formatMoney(parseFloat(valor))}</h3></div>
            <div className="modal-body">
              {!preview.esVigente ? (
                <p>Hay una cotización con fecha más reciente. Esta se guarda en el historial pero no cambia ningún costo.</p>
              ) : preview.total === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Ningún costo cambia con esta cotización.</p>
              ) : (
                <>
                  <p style={{ marginBottom: '0.75rem' }}>
                    {preview.anterior !== null && <>Antes: {formatMoney(preview.anterior)}. </>}
                    Cambia el costo en pesos de <strong>{preview.total}</strong> productos.{' '}
                    {preview.modoPrecio === 'AUTOMATICO' ? 'Los precios de venta se actualizan al guardar.' : 'Los precios de venta nuevos van a la bandeja para que los apruebes.'}
                  </p>
                  <div className="table-container" style={{ maxHeight: 340, overflowY: 'auto', margin: 0 }}>
                    <table className="table" style={{ fontSize: '0.82rem' }}>
                      <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Lista USD</th><th style={{ textAlign: 'right' }}>Costo $</th><th style={{ textAlign: 'right' }}>Precio de venta</th><th style={{ textAlign: 'right' }}>Recargo</th></tr></thead>
                      <tbody>
                        {preview.filas.map((f) => (
                          <tr key={f.productoId}>
                            <td>{f.nombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.codigo}</div></td>
                            <td style={{ textAlign: 'right' }}>US$ {f.costoLista.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatMoney(f.costoAnterior)}</div>{formatMoney(f.costoNuevo)}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatMoney(f.precioActual)}</div><strong>{formatMoney(f.precioNuevo)}</strong>
                            </td>
                            <td style={{ textAlign: 'right', color: f.bajoMinimo ? '#b91c1c' : undefined }}>{f.recargoNuevo?.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)} disabled={trabajando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={guardar} disabled={trabajando}>
                {trabajando && <Loader2 size={16} className="spin" />} Guardar cotización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
