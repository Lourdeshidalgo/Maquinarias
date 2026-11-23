'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tags, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { formatMoney } from '@/lib/format';

type Sugerido = {
  id: string;
  producto: { id: string; codigo: string; nombre: string; categoria: string; proveedor: string | null };
  precioActual: number; precioSugerido: number; costoReal: number; variacionPct: number | null;
  recargoActual: number | null; recargoSugerido: number | null; bajoMinimo: boolean;
  margenAplicado: number; nivelMargen: string; origen: string;
  importacion: { id: string; archivo: string; proveedor: string } | null; createdAt: string;
};
type BajoMinimo = { productoId: string; codigo: string; nombre: string; categoria: string; costoReal: number; precioActual: number; precioNuevo: number; recargoActual: number | null; margen: number; nivel: string };

const ORIGEN: Record<string, string> = {
  IMPORTACION: 'Lista de precios', MANUAL: 'Cambio de costo', MASIVO: 'Aumento masivo', COTIZACION: 'Cotización del dólar', REGLAS: 'Cambio de reglas',
};
const NIVEL: Record<string, string> = { PRODUCTO: 'producto', CATEGORIA: 'categoría', PROVEEDOR: 'proveedor', GENERAL: 'general' };

export default function PreciosPage() {
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(5000);
  const { confirm, confirmNode } = useConfirm();
  const [tab, setTab] = useState<'BANDEJA' | 'MINIMO'>('BANDEJA');
  const [items, setItems] = useState<Sugerido[]>([]);
  const [margenMinimo, setMargenMinimo] = useState(0);
  const [bajo, setBajo] = useState<{ total: number; items: BajoMinimo[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState(false);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [r1, r2] = await Promise.all([fetch('/api/tenant/costos/sugeridos'), fetch('/api/tenant/costos/bajo-minimo')]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      setItems(Array.isArray(d1.items) ? d1.items : []);
      setMargenMinimo(d1.margenMinimo ?? 0);
      setBajo(r2.ok ? d2 : null);
      setSeleccion(new Set());
      setCorrecciones({});
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.producto.nombre} ${i.producto.codigo} ${i.producto.categoria} ${i.producto.proveedor ?? ''}`.toLowerCase().includes(q));
  }, [items, buscar]);

  const toggle = (id: string) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const accion = async (tipo: 'aprobar' | 'descartar', todos: boolean) => {
    const ids = todos ? undefined : Array.from(seleccion);
    const cantidad = todos ? items.length : seleccion.size;
    if (!cantidad) return;
    const ok = await confirm({
      title: tipo === 'aprobar' ? 'Aprobar precios' : 'Descartar sugerencias',
      message: tipo === 'aprobar'
        ? `Se actualiza el precio de venta de ${cantidad} productos. El POS empieza a usar el precio nuevo enseguida.`
        : `Se descartan ${cantidad} sugerencias. Los precios de venta quedan como están.`,
      confirmText: tipo === 'aprobar' ? 'Aprobar' : 'Descartar',
      danger: tipo === 'descartar',
    });
    if (!ok) return;
    setTrabajando(true);
    try {
      const precios: Record<string, string> = {};
      for (const [id, v] of Object.entries(correcciones)) if (v !== '' && (todos || seleccion.has(id))) precios[id] = v;
      const r = await fetch(`/api/tenant/costos/sugeridos/${tipo}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todos ? { todos: true, precios } : { ids, precios }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(tipo === 'aprobar' ? `${d.aprobados} precios actualizados.` : `${d.descartados} sugerencias descartadas.`, 'success');
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo completar.', 'error');
    } finally {
      setTrabajando(false);
    }
  };

  const corregirBajoMinimo = async () => {
    if (!bajo?.items.length) return;
    const ok = await confirm({
      title: 'Llevar al precio según reglas',
      message: `Se recalcula el precio de ${bajo.items.length} productos con su recargo configurado. Según el modo de precios, se actualizan o quedan en la bandeja para aprobar.`,
      confirmText: 'Recalcular',
    });
    if (!ok) return;
    setTrabajando(true);
    try {
      const r = await fetch('/api/tenant/costos/recalcular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alcance: { tipo: 'PRODUCTOS', ids: bajo.items.map((i) => i.productoId) }, aplicar: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(d.actualizados ? `${d.actualizados} precios actualizados.` : `${d.sugeridos} precios enviados a la bandeja.`, 'success');
      await cargar();
      if (d.sugeridos) setTab('BANDEJA');
    } catch (e) {
      showToast((e as Error).message || 'No se pudo recalcular.', 'error');
    } finally {
      setTrabajando(false);
    }
  };

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((i) => seleccion.has(i.id));

  return (
    <div>
      {toastNode}
      {confirmNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tags size={26} style={{ color: 'var(--primary)' }} />
            <span>Precios sugeridos</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Cuando cambia un costo, el precio de venta nuevo espera acá tu aprobación. Podés corregirlo antes de aprobar.
          </p>
        </div>
        <Link href="/dashboard/costos/margenes" className="btn btn-secondary">Márgenes y reglas</Link>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <button type="button" className={`btn btn-sm ${tab === 'BANDEJA' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('BANDEJA')}>
          Para aprobar ({items.length})
        </button>
        <button type="button" className={`btn btn-sm ${tab === 'MINIMO' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('MINIMO')}>
          <AlertTriangle size={14} /> Bajo el recargo mínimo ({bajo?.total ?? 0})
        </button>
      </div>

      {cargando ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></div>
      ) : tab === 'BANDEJA' ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
            <input className="form-input" style={{ maxWidth: 320 }} placeholder="Buscar producto, categoría o proveedor" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!seleccion.size || trabajando} onClick={() => accion('descartar', false)}>
              <X size={14} /> Descartar ({seleccion.size})
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!seleccion.size || trabajando} onClick={() => accion('aprobar', false)}>
              <Check size={14} /> Aprobar seleccionados ({seleccion.size})
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!items.length || trabajando} onClick={() => accion('aprobar', true)}>
              <Check size={14} /> Aprobar todos ({items.length})
            </button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
              <table className="table" style={{ fontSize: '0.86rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox" aria-label="Seleccionar todos" checked={todosVisiblesMarcados}
                        onChange={() => setSeleccion(todosVisiblesMarcados ? new Set() : new Set(visibles.map((i) => i.id)))}
                      />
                    </th>
                    <th>Producto</th>
                    <th>Motivo</th>
                    <th style={{ textAlign: 'right' }}>Costo real</th>
                    <th style={{ textAlign: 'right' }}>Precio actual</th>
                    <th style={{ textAlign: 'right' }}>Precio sugerido</th>
                    <th style={{ textAlign: 'right' }}>Var.</th>
                    <th style={{ textAlign: 'right' }}>Recargo</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay precios esperando aprobación.</td></tr>
                  )}
                  {visibles.map((i) => {
                    const corregido = correcciones[i.id];
                    const precio = corregido !== undefined && corregido !== '' ? parseFloat(corregido) : i.precioSugerido;
                    const recargo = i.costoReal > 0 && Number.isFinite(precio) ? ((precio - i.costoReal) / i.costoReal) * 100 : null;
                    const bajoMin = recargo !== null && recargo < margenMinimo;
                    return (
                      <tr key={i.id}>
                        <td><input type="checkbox" checked={seleccion.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Seleccionar ${i.producto.nombre}`} /></td>
                        <td>
                          <strong>{i.producto.nombre}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{i.producto.codigo} · {i.producto.categoria}{i.producto.proveedor ? ` · ${i.producto.proveedor}` : ''}</div>
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {ORIGEN[i.origen] || i.origen}
                          {i.importacion && <div style={{ color: 'var(--text-muted)' }}>{i.importacion.proveedor}</div>}
                          <div style={{ color: 'var(--text-muted)' }}>recargo {NIVEL[i.nivelMargen] || i.nivelMargen} {i.margenAplicado}%</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(i.costoReal)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(i.precioActual)}</td>
                        <td style={{ textAlign: 'right', width: 150 }}>
                          <input
                            type="number" step="0.01" min={0} className="form-input"
                            style={{ padding: '0.3rem 0.45rem', textAlign: 'right', fontWeight: 600 }}
                            value={corregido ?? String(i.precioSugerido)}
                            onChange={(e) => setCorrecciones({ ...correcciones, [i.id]: e.target.value })}
                            aria-label={`Precio sugerido de ${i.producto.nombre}`}
                          />
                        </td>
                        <td style={{ textAlign: 'right', color: i.variacionPct && i.variacionPct > 0 ? '#b91c1c' : '#15803d' }}>
                          {i.variacionPct === null ? '—' : `${i.variacionPct > 0 ? '+' : ''}${i.variacionPct.toFixed(1)}%`}
                        </td>
                        <td style={{ textAlign: 'right', color: bajoMin ? '#b91c1c' : undefined, fontWeight: bajoMin ? 700 : undefined }} title={bajoMin ? `Debajo del mínimo (${margenMinimo}%)` : undefined}>
                          {recargo === null ? '—' : `${recargo.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem 0.25rem', display: 'flex', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem', flex: '1 1 320px' }}>
              Productos cuyo precio de venta actual deja menos de {margenMinimo}% sobre el costo real. El precio según las reglas es el que corresponde con el recargo configurado.
            </span>
            {!!bajo?.items.length && (
              <button type="button" className="btn btn-primary btn-sm" onClick={corregirBajoMinimo} disabled={trabajando}>Llevar al precio según reglas</button>
            )}
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
            <table className="table" style={{ fontSize: '0.86rem' }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Costo real</th>
                  <th style={{ textAlign: 'right' }}>Precio actual</th>
                  <th style={{ textAlign: 'right' }}>Recargo actual</th>
                  <th style={{ textAlign: 'right' }}>Precio según reglas</th>
                </tr>
              </thead>
              <tbody>
                {(bajo?.items.length ?? 0) === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>Ningún producto está por debajo del mínimo.</td></tr>
                )}
                {bajo?.items.map((p) => (
                  <tr key={p.productoId}>
                    <td><strong>{p.nombre}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{p.codigo} · {p.categoria}</div></td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(p.costoReal)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(p.precioActual)}</td>
                    <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>{p.recargoActual === null ? '—' : `${p.recargoActual.toFixed(1)}%`}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(p.precioNuevo)} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({p.margen}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
