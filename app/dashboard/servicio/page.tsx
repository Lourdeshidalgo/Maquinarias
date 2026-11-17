'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench, Plus, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ESTADOS_SERVICIO } from '@/lib/servicio/estados';
import { BadgeEstado } from '@/components/servicio/BadgeEstado';
import { formatMoney } from '@/lib/format';

type Orden = {
  id: string; numero: number; estado: string; clienteNombre: string; clienteTelefono: string | null; equipo: string;
  equipoSerie: string | null; tecnico: string | null; fallaReportada: string; createdAt: string; fechaPrometida: string | null; total: number;
};
type Datos = { ordenes: Orden[]; total: number; page: number; totalPages: number; contadores: Record<string, number> };

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export default function ServicioTecnicoPage() {
  const router = useRouter();
  const { showToast, toastNode } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [filtro, setFiltro] = useState('ACTIVAS');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

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
        <Link href="/dashboard/servicio/nueva" className="btn btn-primary"><Plus size={16} /> Nueva orden</Link>
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
                  <td><BadgeEstado estado={o.estado} /></td>
                  <td>{o.tecnico ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{o.total ? formatMoney(o.total) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>sin cotizar</span>}</td>
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
