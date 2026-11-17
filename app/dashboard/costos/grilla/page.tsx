'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Table2, Loader2, Search, TrendingUp, History, Check } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import HistorialCostoModal from '@/components/costos/HistorialCostoModal';
import { PuntoSemaforo } from '@/components/costos/Semaforo';
import { formatMoney } from '@/lib/format';

type Fila = {
  id: string; codigo: string; nombre: string; categoria: string; proveedor: { id: string; nombre: string } | null;
  precioCosto: number; extras: number; precioVenta: number; precioCredito: number; recargo: number | null; bajoMinimo: boolean;
  costoActualizadoAt: string; dias: number; semaforo: 'VERDE' | 'AMARILLO' | 'ROJO'; monedaLista: string; precioSugerido: number | null;
};
type Datos = {
  filas: Fila[]; total: number; page: number; totalPages: number; margenMinimo: number;
  categorias: string[]; proveedores: { id: string; nombre: string }[];
};

function CeldaCosto({ fila, onGuardado, onError }: { fila: Fila; onGuardado: (f: Fila, msg: string) => void; onError: (m: string) => void }) {
  // Costos en pesos enteros: las flechas suman o restan de a $100 y a mano se
  // escribe cualquier monto sin decimales.
  const [valor, setValor] = useState(String(Math.round(fila.precioCosto)));
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok'>('idle');
  // Al guardarse, la fila trae el costo nuevo y la celda se vuelve a montar (key).
  const original = useRef(Math.round(fila.precioCosto));
  // Esc cancela: el blur que sigue no tiene que guardar (el estado todavía tiene lo tipeado).
  const cancelado = useRef(false);

  const guardar = async () => {
    if (cancelado.current) {
      cancelado.current = false;
      return;
    }
    const nuevo = parseInt(valor, 10);
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      setValor(String(original.current));
      onError('Costo inválido.');
      return;
    }
    if (nuevo === original.current) return;
    setEstado('guardando');
    try {
      const r = await fetch('/api/tenant/costos/grilla', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: fila.id, precioCosto: nuevo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEstado('ok');
      setTimeout(() => setEstado('idle'), 1500);
      const msg = d.actualizados ? 'Costo y precio de venta actualizados.' : d.sugeridos ? 'Costo guardado. El precio nuevo quedó en la bandeja para aprobar.' : 'Costo guardado.';
      if (d.fila) onGuardado(d.fila, msg);
    } catch (e) {
      setEstado('idle');
      setValor(String(original.current));
      onError((e as Error).message || 'No se pudo guardar.');
    }
  };

  const enUsd = fila.monedaLista === 'USD';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <input
        type="text" inputMode="numeric" className="form-input" value={valor}
        readOnly={enUsd} title={enUsd ? 'Costo en dólares: se actualiza desde la lista del proveedor o la cotización' : undefined}
        aria-label={`Costo de ${fila.nombre}`}
        placeholder="0"
        style={{ width: 130, padding: '0.3rem 0.45rem', textAlign: 'right', background: enUsd ? 'var(--bg-tertiary)' : undefined }}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault(); // sin decimales ni signos
          // Flechas: de a $100 exactos sobre el valor que haya (sin "saltar" a múltiplos)
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const actual = parseInt(valor, 10) || 0;
            setValor(String(Math.max(0, actual + (e.key === 'ArrowUp' ? 100 : -100))));
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelado.current = true;
            setValor(String(original.current));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span style={{ width: 16 }}>
        {estado === 'guardando' && <Loader2 size={14} className="spin" />}
        {estado === 'ok' && <Check size={14} style={{ color: '#16a34a' }} />}
      </span>
    </div>
  );
}

type ProductoMasivo = { id: string; codigo: string; nombre: string; categoria: string; precioCosto: number };

type PreviewMasivo = {
  etiqueta: string; tipoAjuste: 'PORCENTAJE' | 'MONTO'; porcentaje: number; monto: number; quedanEnCero: number; total: number; sinCosto: number; preciosQueCambian: number; bajoMinimo: number; modoPrecio: string;
  filas: { productoId: string; codigo: string; nombre: string; costoAnterior: number; costoNuevo: number; precioActual: number; precio: { precioNuevo: number; recargoNuevo: number | null; bajoMinimo: boolean } | null }[];
};

function ModalMasivo({ datos, onCerrar, onAplicado }: { datos: Datos; onCerrar: () => void; onAplicado: (msg: string) => void }) {
  const [tipo, setTipo] = useState<'PROVEEDOR' | 'CATEGORIA'>('PROVEEDOR');
  const [valor, setValor] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [porcentaje, setPorcentaje] = useState('');
  const [monto, setMonto] = useState(''); // pesos enteros; puede empezar con "-" para una baja
  const [preview, setPreview] = useState<PreviewMasivo | null>(null);
  const cantidad = tipoAjuste === 'PORCENTAJE' ? porcentaje : monto;
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  // Productos del proveedor/categoría elegidos: todos marcados de entrada, se pueden destildar.
  const [productos, setProductos] = useState<ProductoMasivo[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtroLista, setFiltroLista] = useState('');
  const seleccionables = (productos ?? []).filter((p) => p.precioCosto > 0);
  const todosMarcados = seleccionables.length > 0 && seleccionables.every((p) => marcados.has(p.id));

  const elegirAlcance = async (nuevoTipo: 'PROVEEDOR' | 'CATEGORIA', nuevoValor: string) => {
    setTipo(nuevoTipo);
    setValor(nuevoValor);
    setPreview(null);
    setProductos(null);
    setMarcados(new Set());
    setFiltroLista('');
    if (!nuevoValor) return;
    try {
      const r = await fetch(`/api/tenant/costos/masivo?tipo=${nuevoTipo}&valor=${encodeURIComponent(nuevoValor)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const lista: ProductoMasivo[] = d.productos;
      setProductos(lista);
      setMarcados(new Set(lista.filter((p) => p.precioCosto > 0).map((p) => p.id)));
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar los productos.');
    }
  };

  const alternar = (id: string) => {
    setPreview(null);
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const enviar = async (aplicar: boolean) => {
    setError('');
    setTrabajando(true);
    try {
      const r = await fetch('/api/tenant/costos/masivo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alcance: { tipo, valor }, tipoAjuste, porcentaje, monto, aplicar,
          // Si están todos marcados no hace falta mandar la lista
          ...(todosMarcados ? {} : { productoIds: Array.from(marcados) }),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!aplicar) setPreview(d);
      else {
        const partes = [`${d.costosActualizados} costos actualizados`];
        if (d.actualizados) partes.push(`${d.actualizados} precios de venta actualizados`);
        if (d.sugeridos) partes.push(`${d.sugeridos} precios enviados a la bandeja`);
        onAplicado(partes.join(', ') + '.');
      }
    } catch (e) {
      setError((e as Error).message || 'No se pudo calcular.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !trabajando && onCerrar()}>
      <div className="modal-content" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><TrendingUp size={20} /> Aumento masivo de costos</h3></div>
        <div className="modal-body">
          {error && <div style={{ padding: '0.7rem 0.9rem', background: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem' }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Aplicar a</label>
              <select className="form-select" value={tipo} onChange={(e) => elegirAlcance(e.target.value as 'PROVEEDOR' | 'CATEGORIA', '')}>
                <option value="PROVEEDOR">Un proveedor</option>
                <option value="CATEGORIA">Una categoría</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{tipo === 'PROVEEDOR' ? 'Proveedor' : 'Categoría'}</label>
              <select className="form-select" value={valor} onChange={(e) => elegirAlcance(tipo, e.target.value)}>
                <option value="">Elegí…</option>
                {tipo === 'PROVEEDOR'
                  ? datos.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)
                  : datos.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cómo</label>
              <select className="form-select" value={tipoAjuste} onChange={(e) => { setTipoAjuste(e.target.value as 'PORCENTAJE' | 'MONTO'); setPreview(null); }}>
                <option value="PORCENTAJE">Porcentaje (%)</option>
                <option value="MONTO">Monto fijo en pesos ($)</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{tipoAjuste === 'PORCENTAJE' ? 'Porcentaje' : 'Pesos ($) a sumar a cada producto'}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {tipoAjuste === 'PORCENTAJE' ? (
                  <input type="number" step="0.01" className="form-input" placeholder="8" value={porcentaje} onChange={(e) => { setPorcentaje(e.target.value); setPreview(null); }} />
                ) : (
                  <input
                    type="text" inputMode="numeric" className="form-input" placeholder="5000" value={monto}
                    onChange={(e) => {
                      // Pesos enteros: solo dígitos y, al principio, un "-" para una baja
                      const v = e.target.value;
                      setMonto((v.trim().startsWith('-') ? '-' : '') + v.replace(/\D/g, ''));
                      setPreview(null);
                    }}
                  />
                )}
                {tipoAjuste === 'PORCENTAJE' && <span>%</span>}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {tipoAjuste === 'PORCENTAJE'
              ? 'Para una baja usá un número negativo (ej: -5).'
              : 'Se suma el mismo monto al costo de cada producto, sin decimales. Para una baja usá un número negativo (ej: -2000).'}
          </p>

          {valor && (
            <div style={{ marginTop: '0.9rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border-color)' }}>
                <strong style={{ fontSize: '0.9rem' }}>
                  {productos === null ? 'Cargando productos…' : `Productos: ${marcados.size} de ${seleccionables.length} marcados`}
                </strong>
                {productos && seleccionables.length > 0 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPreview(null); setMarcados(new Set(seleccionables.map((p) => p.id))); }}>Todos</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPreview(null); setMarcados(new Set()); }}>Ninguno</button>
                  </div>
                )}
              </div>
              {productos && productos.length > 8 && (
                <div style={{ padding: '0.5rem 0.8rem 0' }}>
                  <input className="form-input" style={{ padding: '0.35rem 0.55rem' }} placeholder="Buscar en la lista" value={filtroLista} onChange={(e) => setFiltroLista(e.target.value)} />
                </div>
              )}
              <div style={{ maxHeight: 260, overflowY: 'auto', padding: '0.35rem 0.4rem' }}>
                {productos?.length === 0 && <p style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>No hay productos activos.</p>}
                {productos
                  ?.filter((p) => !filtroLista.trim() || `${p.nombre} ${p.codigo}`.toLowerCase().includes(filtroLista.trim().toLowerCase()))
                  .map((p) => {
                    const sinCosto = p.precioCosto <= 0;
                    return (
                      <label
                        key={p.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.4rem', borderRadius: 6, cursor: sinCosto ? 'not-allowed' : 'pointer', opacity: sinCosto ? 0.55 : 1 }}
                      >
                        <input type="checkbox" checked={marcados.has(p.id)} disabled={sinCosto} onChange={() => alternar(p.id)} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {p.nombre}
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> · {p.codigo}{tipo === 'PROVEEDOR' ? ` · ${p.categoria}` : ''}</span>
                        </span>
                        <span style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: sinCosto ? 'var(--text-muted)' : undefined }}>
                          {sinCosto ? 'sin costo' : formatMoney(p.precioCosto)}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}

          {preview && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ marginBottom: '0.6rem' }}>
                {preview.tipoAjuste === 'MONTO' ? (
                  <>{preview.monto > 0 ? 'Suba' : 'Baja'} de <strong>{formatMoney(Math.abs(preview.monto))}</strong> por producto</>
                ) : (
                  <>{preview.porcentaje > 0 ? 'Suba' : 'Baja'} de <strong>{Math.abs(preview.porcentaje)}%</strong></>
                )}{' '}en <strong>{preview.total}</strong> {preview.total === 1 ? 'producto' : 'productos'}.
                {preview.quedanEnCero > 0 && <span style={{ color: '#b91c1c' }}> {preview.quedanEnCero} quedarían con costo $0 (la baja es mayor que su costo).</span>}
                {' '}{preview.preciosQueCambian} precios de venta {preview.modoPrecio === 'AUTOMATICO' ? 'se actualizan' : 'van a la bandeja para aprobar'}.
                {preview.bajoMinimo > 0 && <span style={{ color: '#b91c1c' }}> {preview.bajoMinimo} quedarían debajo del recargo mínimo.</span>}
                {preview.sinCosto > 0 && <span style={{ color: 'var(--text-muted)' }}> ({preview.sinCosto} sin costo cargado no se tocan.)</span>}
              </p>
              <div className="table-container" style={{ maxHeight: 300, overflowY: 'auto', margin: 0 }}>
                <table className="table" style={{ fontSize: '0.82rem' }}>
                  <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Precio de venta</th><th style={{ textAlign: 'right' }}>Recargo</th></tr></thead>
                  <tbody>
                    {preview.filas.map((f) => (
                      <tr key={f.productoId}>
                        <td>{f.nombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.codigo}</div></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><span style={{ color: 'var(--text-muted)' }}>{formatMoney(f.costoAnterior)} → </span>{formatMoney(f.costoNuevo)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {f.precio ? <><span style={{ color: 'var(--text-muted)' }}>{formatMoney(f.precioActual)} → </span><strong>{formatMoney(f.precio.precioNuevo)}</strong></> : formatMoney(f.precioActual)}
                        </td>
                        <td style={{ textAlign: 'right', color: f.precio?.bajoMinimo ? '#b91c1c' : undefined }}>{f.precio?.recargoNuevo != null ? `${f.precio.recargoNuevo.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
          {!preview ? (
            <button type="button" className="btn btn-primary" onClick={() => enviar(false)} disabled={trabajando || !valor || !cantidad || cantidad === '-' || marcados.size === 0}>
              {trabajando && <Loader2 size={16} className="spin" />} Ver vista previa
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => enviar(true)} disabled={trabajando || preview.total === 0}>
              {trabajando && <Loader2 size={16} className="spin" />} Aplicar a {preview.total} productos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GrillaCostosPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>}>
      <Grilla />
    </Suspense>
  );
}

function Grilla() {
  const sp = useSearchParams();
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(4500);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [search, setSearch] = useState('');
  const [proveedorId, setProveedorId] = useState(sp.get('proveedorId') ?? '');
  const [categoria, setCategoria] = useState(sp.get('categoria') ?? '');
  const [semaforo, setSemaforo] = useState(sp.get('semaforo') ?? '');
  const [page, setPage] = useState(1);
  const [masivo, setMasivo] = useState(false);
  const [historialDe, setHistorialDe] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (proveedorId) params.set('proveedorId', proveedorId);
    if (categoria) params.set('categoria', categoria);
    if (semaforo) params.set('semaforo', semaforo);
    const r = await fetch(`/api/tenant/costos/grilla?${params}`);
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudo cargar.', 'error');
  }, [page, search, proveedorId, categoria, semaforo, showToast]);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar, search]);

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  const reemplazarFila = (f: Fila, msg: string) => {
    setDatos((d) => (d ? { ...d, filas: d.filas.map((x) => (x.id === f.id ? f : x)) } : d));
    showToast(msg, 'success');
  };

  return (
    <div>
      {toastNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Table2 size={26} style={{ color: 'var(--primary)' }} />
            <span>Edición rápida de costos</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Para los aumentos sueltos: cambiá el costo y se guarda al salir de la celda, con historial y recálculo del precio.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setMasivo(true)} disabled={!datos}>
          <TrendingUp size={16} /> Aumento masivo
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar nombre o código" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="form-select" style={{ width: 200 }} value={proveedorId} onChange={(e) => { setProveedorId(e.target.value); setPage(1); }}>
          <option value="">Todos los proveedores</option>
          <option value="SIN">Sin proveedor</option>
          {datos?.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="form-select" style={{ width: 200 }} value={categoria} onChange={(e) => { setCategoria(e.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>
          {datos?.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-select" style={{ width: 180 }} value={semaforo} onChange={(e) => { setSemaforo(e.target.value); setPage(1); }}>
          <option value="">Cualquier antigüedad</option>
          <option value="AMARILLO">🟡 Por vencer</option>
          <option value="ROJO">🔴 Desactualizados</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.86rem' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Proveedor</th>
                <th>Actualizado</th>
                <th style={{ textAlign: 'right' }}>Costo</th>
                <th style={{ textAlign: 'right' }}>Precio de venta</th>
                <th style={{ textAlign: 'right' }}>Crédito</th>
                <th style={{ textAlign: 'right' }}>Recargo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!datos && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></td></tr>}
              {datos?.filas.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay productos con esos filtros.</td></tr>}
              {datos?.filas.map((f) => (
                <tr key={f.id}>
                  <td><strong>{f.nombre}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{f.codigo} · {f.categoria}</div></td>
                  <td>{f.proveedor?.nombre ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td><PuntoSemaforo semaforo={f.semaforo} dias={f.dias} /></td>
                  <td>
                    <CeldaCosto key={`${f.id}-${f.precioCosto}`} fila={f} onGuardado={reemplazarFila} onError={(m) => showToast(m, 'error')} />
                    {f.extras > 0 && <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)', paddingRight: 20 }}>+ {formatMoney(f.extras)} envío/packaging</div>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatMoney(f.precioVenta)}
                    {f.precioSugerido !== null && <div style={{ fontSize: '0.74rem', color: '#d97706' }}>sugerido {formatMoney(f.precioSugerido)}</div>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{formatMoney(f.precioCredito)}</td>
                  <td style={{ textAlign: 'right', color: f.bajoMinimo ? '#b91c1c' : undefined, fontWeight: f.bajoMinimo ? 700 : undefined }}>
                    {f.recargo === null ? '—' : `${f.recargo.toFixed(1)}%`}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHistorialDe(f.id)} aria-label={`Historial de costos de ${f.nombre}`}>
                      <History size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {datos && datos.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {datos.page} de {datos.totalPages} · {datos.total} productos</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= datos.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}

      {masivo && datos && (
        <ModalMasivo datos={datos} onCerrar={() => setMasivo(false)} onAplicado={(msg) => { setMasivo(false); showToast(msg, 'success'); cargar(); }} />
      )}
      {historialDe && <HistorialCostoModal productoId={historialDe} onCerrar={() => setHistorialDe(null)} />}
    </div>
  );
}
