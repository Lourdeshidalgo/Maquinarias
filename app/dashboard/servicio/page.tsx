'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench, Plus, Search, Loader2, Hash } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ESTADOS_SERVICIO, infoModalidad } from '@/lib/servicio/estados';
import { BadgeEstado } from '@/components/servicio/BadgeEstado';
import { formatMoney } from '@/lib/format';

type Orden = {
  id: string; numero: number; estado: string; clienteNombre: string; clienteTelefono: string | null; equipo: string;
  equipoSerie: string | null; tecnico: string | null; fallaReportada: string; createdAt: string; fechaPrometida: string | null; total: number;
  modalidad: string; senaMonto: number;
};
type Numeracion = { numeroDesde: number | null; ultimoNumero: number; proximoNumero: number; puedeEditar: boolean };
type Datos = { ordenes: Orden[]; total: number; page: number; totalPages: number; contadores: Record<string, number> };

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export default function ServicioTecnicoPage() {
  const router = useRouter();
  const { showToast, toastNode } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [filtro, setFiltro] = useState('ACTIVAS');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [numeracion, setNumeracion] = useState<Numeracion | null>(null);
  const [editandoNumero, setEditandoNumero] = useState(false);

  useEffect(() => {
    fetch('/api/tenant/servicio/configuracion').then((r) => (r.ok ? r.json() : null)).then((d) => d && setNumeracion(d)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (filtro !== 'TODAS') params.set('estado', filtro);
    if (search.trim()) params.set('search', search.trim());
    const r = await fetch(`/api/tenant/servicio/ordenes?${params}`);
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudieron cargar las órdenes.', 'error');
  }, [filtro, search, page, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, search]);

  const c = datos?.contadores ?? {};
  const activas = ['RECIBIDO', 'COTIZADO', 'ACEPTADO', 'EN_REPARACION', 'LISTO'].reduce((a, e) => a + (c[e] ?? 0), 0);
  const todas = Object.values(c).reduce((a, n) => a + n, 0);
  const pestañas = [
    { clave: 'ACTIVAS', etiqueta: 'En curso', n: activas },
    ...ESTADOS_SERVICIO.map((e) => ({ clave: e.estado, etiqueta: e.etiqueta, n: c[e.estado] ?? 0 })),
    { clave: 'TODAS', etiqueta: 'Todas', n: todas },
  ];

  return (
    <div>
      {toastNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={26} style={{ color: 'var(--primary)' }} />
            <span>Servicio técnico</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Órdenes de reparación. Cotizar no toca el stock: los repuestos se descuentan recién cuando el cliente acepta.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {numeracion?.puedeEditar && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditandoNumero(true)} title="Numeración de las órdenes">
              <Hash size={16} /> Próxima: N° {numeracion.proximoNumero}
            </button>
          )}
          <Link href="/dashboard/servicio/nueva" className="btn btn-primary"><Plus size={16} /> Nueva orden</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {pestañas.map((p) => (
          <button
            key={p.clave} type="button"
            className={`btn btn-sm ${filtro === p.clave ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFiltro(p.clave); setPage(1); }}
          >
            {p.etiqueta} <span style={{ opacity: 0.75 }}>({p.n})</span>
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', maxWidth: 380, marginBottom: '0.75rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar N°, cliente, teléfono, equipo o serie" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>N°</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th>Técnico</th>
                <th style={{ textAlign: 'right' }}>Presupuesto</th><th>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {!datos && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></td></tr>}
              {datos?.ordenes.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay órdenes en este estado.</td></tr>
              )}
              {datos?.ordenes.map((o) => (
                <tr key={o.id} onClick={() => router.push(`/dashboard/servicio/${o.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700 }}>#{o.numero}</td>
                  <td>{o.clienteNombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{o.clienteTelefono ?? ''}</div></td>
                  <td>
                    {o.equipo}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.equipoSerie ? `Serie ${o.equipoSerie} · ` : ''}{o.fallaReportada}
                    </div>
                  </td>
                  <td>
                    <BadgeEstado estado={o.estado} />
                    {o.modalidad !== 'PRESUPUESTAR' && <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>{infoModalidad(o.modalidad).etiqueta}</div>}
                  </td>
                  <td>{o.tecnico ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {o.total ? formatMoney(o.total) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>sin cotizar</span>}
                    {o.senaMonto > 0 && <div style={{ fontSize: '0.74rem', fontWeight: 400, color: '#047857' }}>seña {formatMoney(o.senaMonto)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {fecha(o.createdAt)}
                    {o.fechaPrometida && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>promete {fecha(o.fechaPrometida)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editandoNumero && numeracion && (
        <ModalNumeracion
          numeracion={numeracion}
          onCerrar={() => setEditandoNumero(false)}
          onGuardado={(n) => { setNumeracion(n); setEditandoNumero(false); showToast(`La próxima orden va a ser la N° ${n.proximoNumero}.`, 'success'); }}
        />
      )}

      {datos && datos.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {datos.page} de {datos.totalPages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= datos.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}

function ModalNumeracion({ numeracion, onCerrar, onGuardado }: { numeracion: Numeracion; onCerrar: () => void; onGuardado: (n: Numeracion) => void }) {
  const [valor, setValor] = useState(String(numeracion.proximoNumero));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const n = parseInt(valor, 10) || 0;
  const menorAlUltimo = n > 0 && n <= numeracion.ultimoNumero;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const r = await fetch('/api/tenant/servicio/configuracion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numeroDesde: valor }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onGuardado(d);
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>Numeración de órdenes</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>X</button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
              Para seguir la numeración del sistema anterior, poné el número que tiene que llevar la próxima orden.
              {numeracion.ultimoNumero > 0 && <> La última orden cargada acá es la N° {numeracion.ultimoNumero}.</>}
            </p>
            <div className="form-group">
              <label className="form-label">Próxima orden N°</label>
              <input className="form-input" inputMode="numeric" aria-label="Próxima orden número" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} autoFocus />
            </div>
            {menorAlUltimo && (
              <p style={{ color: '#b45309', fontSize: '0.82rem' }}>
                Ese número ya se usó: la próxima va a seguir desde la N° {numeracion.ultimoNumero + 1}.
              </p>
            )}
            {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando || n < 1}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
