'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { formatMoney, todayArgentina } from '@/lib/format';

type Cotizacion = {
  id: string; valor: number; fecha: string; fuente: string; usuario: string | null; createdAt: string;
  proveedorId: string | null; proveedor: string | null;
};
type DolarProveedor = { id: string; nombre: string; propio: boolean; valor: number | null; fecha: string | null; productosUsd: number };
type Datos = {
  general: { valor: number; fecha: string } | null;
  productosUsd: number;
  proveedores: DolarProveedor[];
  historial: Cotizacion[];
};
/** A qué dólar se le carga el valor: el general (id null) o el de un proveedor. */
type Destino = { id: string | null; nombre: string };
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
  const [valores, setValores] = useState<Record<string, string>>({}); // clave: proveedorId o 'general'
  const [destino, setDestino] = useState<Destino | null>(null);
  const [filtro, setFiltro] = useState(''); // historial: '' = todos, 'general' o un proveedorId
  const [fecha, setFecha] = useState(todayArgentina());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/tenant/costos/cotizaciones${filtro ? `?proveedorId=${encodeURIComponent(filtro)}` : ''}`);
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudo cargar.', 'error');
  }, [showToast, filtro]);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar]);

  const clave = (id: string | null) => id ?? 'general';
  const valor = destino ? valores[clave(destino.id)] ?? '' : '';

  const verImpacto = async (d0: Destino) => {
    setTrabajando(true);
    try {
      const r = await fetch('/api/tenant/costos/cotizaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valores[clave(d0.id)], fecha, preview: true, proveedorId: d0.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDestino(d0);
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
        body: JSON.stringify({ valor, fecha, proveedorId: destino?.id ?? null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.vigente) showToast('Cotización guardada en el historial. No es la más reciente, así que no cambia los costos.', 'info');
      else {
        const partes = [`${d.costosActualizados} costos en pesos actualizados`];
        if (d.actualizados) partes.push(`${d.actualizados} precios de venta actualizados`);
        if (d.sugeridos) partes.push(`${d.sugeridos} precios enviados a la bandeja para aprobar`);
        showToast(`Dólar ${destino?.nombre ?? ''} guardado: ${partes.join(', ')}.`, 'success');
      }
      setPreview(null);
      if (destino) setValores((v) => ({ ...v, [clave(destino.id)]: '' }));
      setDestino(null);
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
          <span>Dólar por proveedor</span>
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Cada proveedor puede tener su propio dólar. Si no le cargás uno, usa el general. Al actualizar un dólar se recalculan
          los costos y precios solo de los productos en USD que toman ese dólar.
        </p>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end', justifyContent: 'space-between', padding: '1rem 1rem 0.5rem' }}>
          <h3 style={{ margin: 0 }}>Valores vigentes</h3>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fecha de los valores que cargues</label>
            <input type="date" className="form-input" value={fecha} max={todayArgentina()} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>Dólar de</th><th style={{ textAlign: 'right' }}>Vigente</th><th>Desde</th>
                <th style={{ textAlign: 'right' }}>Productos USD</th><th>Nuevo valor</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  id: null as string | null, nombre: 'General', valor: datos?.general?.valor ?? null, fecha: datos?.general?.fecha ?? null,
                  propio: true, productosUsd: null as number | null,
                },
                ...(datos?.proveedores ?? []),
              ].map((fila) => {
                const k = clave(fila.id);
                return (
                  <tr key={k}>
                    <td style={{ fontWeight: fila.id ? 400 : 600 }}>{fila.nombre}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fila.valor === null ? (
                        <span style={{ color: 'var(--text-muted)' }}>Sin cargar</span>
                      ) : fila.propio ? (
                        <strong>{formatMoney(fila.valor)}</strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }} title="No tiene dólar propio: usa el general">{formatMoney(fila.valor)} (general)</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{fila.propio && fila.fecha ? fechaCorta(fila.fecha) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fila.productosUsd ?? '—'}</td>
                    <td>
                      <form
                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                        onSubmit={(e) => { e.preventDefault(); verImpacto({ id: fila.id, nombre: fila.nombre }); }}
                      >
                        <input
                          type="number" step="0.01" min="0.01" className="form-input" style={{ width: 100 }}
                          aria-label={`Nuevo dólar ${fila.nombre}`} value={valores[k] ?? ''}
                          onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                          placeholder={fila.valor !== null ? String(fila.valor) : 'Ej: 1500'}
                        />
                        <button type="submit" className="btn btn-primary" disabled={trabajando || !valores[k]} title="Ver cómo impacta antes de guardar">
                          {trabajando && destino?.id === fila.id ? <Loader2 size={16} className="spin" /> : <Eye size={16} />} Actualizar
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Evolución e historial</h3>
          <select className="form-input" style={{ width: 'auto' }} aria-label="Filtrar historial" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos los dólares</option>
            <option value="general">General</option>
            {(datos?.proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        {!filtro ? (
          <p style={{ color: 'var(--text-muted)' }}>Elegí un dólar para ver su gráfico.</p>
        ) : historial.length < 2 ? (
          <p style={{ color: 'var(--text-muted)' }}>Con dos o más cotizaciones se muestra el gráfico.</p>
        ) : (
          <Grafico historial={historial} />
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Fecha</th><th>Dólar de</th><th style={{ textAlign: 'right' }}>Cotización</th><th style={{ textAlign: 'right' }}>Variación</th><th>Origen</th><th>Cargada por</th></tr></thead>
            <tbody>
              {historial.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Todavía no hay cotizaciones.</td></tr>}
              {historial.map((c, i) => {
                // Variación contra la cotización anterior del mismo dólar.
                const previa = historial.slice(i + 1).find((h) => h.proveedorId === c.proveedorId);
                const esVigente = !historial.slice(0, i).some((h) => h.proveedorId === c.proveedorId);
                const variacion = previa ? ((c.valor - previa.valor) / previa.valor) * 100 : null;
                return (
                  <tr key={c.id}>
                    <td>{fechaCorta(c.fecha)}{esVigente && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: '0.7rem' }}>Vigente</span>}</td>
                    <td>{c.proveedor ?? 'General'}</td>
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
        <div className="modal-overlay" onClick={() => { if (!trabajando) { setPreview(null); setDestino(null); } }}>
          <div className="modal-content" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Dólar {destino?.nombre} a {formatMoney(parseFloat(valor))}</h3></div>
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
              <button type="button" className="btn btn-secondary" onClick={() => { setPreview(null); setDestino(null); }} disabled={trabajando}>Cancelar</button>
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
