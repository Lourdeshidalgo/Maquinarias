'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cog, Plus, Search, Loader2, Pencil, PackagePlus, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatMoney } from '@/lib/format';

type Repuesto = {
  id: string; codigo: string; nombre: string; codigoFabricante: string | null; marca: string | null; compatibles: string | null;
  ubicacion: string | null; stockActual: string; stockMinimo: string; precioVenta: string; precioCosto: string; ivaPorcentaje: string; esRepuesto: boolean;
};
type Datos = { items: Repuesto[]; total: number; page: number; totalPages: number };

const n = (v: string | number | null | undefined) => Number(v) || 0;

// Catálogo de repuestos: productos marcados como repuesto, con N° de parte,
// marca, modelos compatibles y ubicación. Se buscan por modelo (ej: "MS 180").
export default function RepuestosPage() {
  const { showToast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [esDueno, setEsDueno] = useState(false);
  const [editando, setEditando] = useState<Repuesto | null | undefined>(undefined); // undefined = cerrado, null = nuevo
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then((r) => r.json()).then((d) => setEsDueno(d?.user?.rol === 'OWNER')).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '30', repuestos: '1' });
    if (search.trim()) params.set('search', search.trim());
    const r = await fetch(`/api/tenant/productos?${params}`);
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudieron cargar los repuestos.', 'error');
  }, [page, search, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, search]);

  const quitar = async (r: Repuesto) => {
    const ok = await confirm({
      title: 'Quitar del catálogo de repuestos',
      message: `"${r.nombre}" deja de aparecer en Repuestos. El producto y su stock siguen en Stock.`,
      confirmText: 'Quitar', danger: true,
    });
    if (!ok) return;
    const res = await fetch('/api/tenant/productos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, esRepuesto: false }) });
    if (res.ok) { showToast('Quitado del catálogo de repuestos.', 'success'); cargar(); }
    else showToast((await res.json()).error || 'No se pudo quitar.', 'error');
  };

  return (
    <div>
      {toastNode}
      {confirmNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Cog size={26} style={{ color: 'var(--primary)' }} />
            <span>Repuestos</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Catálogo de repuestos con N° de parte, modelos compatibles y ubicación. Buscá por modelo, por ejemplo &quot;MS 180&quot; o &quot;cadena 3/8&quot;.
          </p>
        </div>
        {esDueno && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAgregando(true)}><PackagePlus size={16} /> Agregar desde Stock</button>
            <button type="button" className="btn btn-primary" onClick={() => setEditando(null)}><Plus size={16} /> Nuevo repuesto</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 480 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} aria-label="Buscar repuestos" autoFocus
            placeholder="Nombre, código, N° de parte, marca, modelo compatible o ubicación"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {datos && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{datos.total.toLocaleString('es-AR')} repuestos</span>}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>Repuesto</th><th>N° de parte</th><th>Sirve para</th><th>Ubicación</th>
                <th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Precio</th>{esDueno && <th></th>}
              </tr>
            </thead>
            <tbody>
              {!datos && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></td></tr>}
              {datos?.items.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  {search.trim() ? 'No hay repuestos que coincidan.' : 'Todavía no hay repuestos. Cargalos con "Nuevo repuesto" o marcá productos que ya están en Stock con "Agregar desde Stock".'}
                </td></tr>
              )}
              {datos?.items.map((r) => {
                const bajo = n(r.stockActual) <= n(r.stockMinimo);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.nombre}</strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{r.codigo}{r.marca ? ` · ${r.marca}` : ''}</div>
                    </td>
                    <td>{r.codigoFabricante ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ maxWidth: 280, fontSize: '0.82rem' }}>{r.compatibles ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>{r.ubicacion ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: bajo ? '#b91c1c' : undefined }} title={bajo ? `Mínimo ${n(r.stockMinimo)}` : undefined}>
                      {n(r.stockActual)}{bajo && <div style={{ fontSize: '0.7rem', fontWeight: 400 }}>bajo mínimo</div>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(n(r.precioVenta))}</td>
                    {esDueno && (
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Editar ${r.nombre}`} onClick={() => setEditando(r)}><Pencil size={14} /></button>{' '}
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Quitar ${r.nombre} de repuestos`} title="Quitar del catálogo" onClick={() => quitar(r)}><X size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {datos && datos.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {datos.page} de {datos.totalPages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= datos.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}

      {editando !== undefined && (
        <FichaRepuesto repuesto={editando} onCerrar={() => setEditando(undefined)} onGuardado={(msg) => { setEditando(undefined); showToast(msg, 'success'); cargar(); }} />
      )}
      {agregando && (
        <AgregarDesdeStock onCerrar={() => setAgregando(false)} onAgregado={(nombre) => { showToast(`${nombre} agregado a Repuestos.`, 'success'); cargar(); }} />
      )}
    </div>
  );
}

type Form = Record<'nombre' | 'codigo' | 'codigoFabricante' | 'marca' | 'compatibles' | 'ubicacion' | 'stockActual' | 'stockMinimo' | 'precioCosto' | 'precioVenta', string>;

function FichaRepuesto({ repuesto, onCerrar, onGuardado }: { repuesto: Repuesto | null; onCerrar: () => void; onGuardado: (msg: string) => void }) {
  const [form, setForm] = useState<Form>(() => ({
    nombre: repuesto?.nombre ?? '', codigo: repuesto?.codigo ?? '', codigoFabricante: repuesto?.codigoFabricante ?? '', marca: repuesto?.marca ?? '',
    compatibles: repuesto?.compatibles ?? '', ubicacion: repuesto?.ubicacion ?? '',
    stockActual: repuesto ? String(n(repuesto.stockActual)) : '0', stockMinimo: repuesto ? String(n(repuesto.stockMinimo)) : '1',
    precioCosto: repuesto ? String(Math.round(n(repuesto.precioCosto))) : '', precioVenta: repuesto ? String(Math.round(n(repuesto.precioVenta))) : '',
  }));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const entero = (v: string) => v.replace(/[^\d]/g, '');

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const codigo = form.codigo.trim() || form.codigoFabricante.trim() || `REP-${Date.now().toString().slice(-7)}`;
      const comun = {
        nombre: form.nombre.trim(), codigo, unidad: 'unidad', esRepuesto: true,
        codigoFabricante: form.codigoFabricante, marca: form.marca, compatibles: form.compatibles, ubicacion: form.ubicacion,
        stockActual: form.stockActual || '0', stockMinimo: form.stockMinimo || '0', precioCosto: form.precioCosto || '0', precioVenta: form.precioVenta || '0',
      };
      const r = await fetch('/api/tenant/productos', {
        method: repuesto ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repuesto ? { ...comun, id: repuesto.id } : { ...comun, categoria: 'Repuestos', ivaPorcentaje: 21 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onGuardado(repuesto ? 'Repuesto actualizado.' : `Repuesto ${d.codigo} creado.`);
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: keyof Form, etiqueta: string, props: Record<string, unknown> = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{etiqueta}</label>
      <input className="form-input" aria-label={etiqueta.replace(' *', '')} value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );
  const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3>{repuesto ? 'Editar repuesto' : 'Nuevo repuesto'}</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {error && <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>⚠️ {error}</div>}
            <div style={grilla}>
              <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Nombre *</label>
                <input className="form-input" aria-label="Nombre" required value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Cadena 3/8 50 eslabones" />
              </div>
              {campo('codigo', 'Código interno', { placeholder: 'Automático' })}
            </div>
            <div style={grilla}>
              {campo('codigoFabricante', 'N° de parte (fabricante)', { placeholder: 'Ej: 3636 000 0050' })}
              {campo('marca', 'Marca', { placeholder: 'Ej: Stihl' })}
              {campo('ubicacion', 'Ubicación', { placeholder: 'Ej: Estante 3, cajón B' })}
            </div>
            <div className="form-group" style={{ margin: '0 0 0.75rem' }}>
              <label className="form-label">Sirve para (equipos o modelos)</label>
              <textarea className="form-input" rows={2} aria-label="Sirve para" value={form.compatibles} onChange={(e) => set('compatibles', e.target.value)} placeholder="Ej: Stihl MS 180, MS 210, MS 250" />
            </div>
            <div style={grilla}>
              {campo('stockActual', 'Stock', { inputMode: 'numeric', onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('stockActual', entero(e.target.value)) })}
              {campo('stockMinimo', 'Stock mínimo', { inputMode: 'numeric', onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('stockMinimo', entero(e.target.value)) })}
              {campo('precioCosto', 'Costo (con IVA)', { inputMode: 'numeric', onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('precioCosto', entero(e.target.value)) })}
              {campo('precioVenta', 'Precio de venta *', { inputMode: 'numeric', required: true, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('precioVenta', entero(e.target.value)) })}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>El repuesto también aparece en Stock, en el POS y en el buscador de repuestos de las órdenes de servicio.</p>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onCerrar} className="btn btn-secondary" disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : repuesto ? 'Guardar cambios' : 'Crear repuesto'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgregarDesdeStock({ onCerrar, onAgregado }: { onCerrar: () => void; onAgregado: (nombre: string) => void }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Repuesto[]>([]);
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/tenant/productos?page=1&pageSize=15&search=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      setResultados(Array.isArray(d.items) ? d.items : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const agregar = async (p: Repuesto) => {
    const r = await fetch('/api/tenant/productos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, esRepuesto: true }) });
    if (r.ok) { setAgregados((s) => new Set(s).add(p.id)); onAgregado(p.nombre); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>Agregar productos del Stock a Repuestos</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        <div className="modal-body">
          <input className="form-input" autoFocus aria-label="Buscar en Stock" placeholder="Buscar en Stock por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ marginTop: '0.6rem', maxHeight: 340, overflowY: 'auto' }}>
            {q.trim() && resultados.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin resultados.</p>}
            {q.trim() && resultados.map((p) => {
              const ya = p.esRepuesto || agregados.has(p.id);
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span><strong>{p.nombre}</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {p.codigo} · stock {n(p.stockActual)}</span></span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={ya} onClick={() => agregar(p)}>{ya ? 'Ya está' : 'Agregar'}</button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onCerrar}>Listo</button>
        </div>
      </div>
    </div>
  );
}
