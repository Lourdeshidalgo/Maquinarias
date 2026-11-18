'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench, Plus, Search, Loader2, Settings, FileDown, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ESTADOS_EN_CURSO, ESTADOS_SERVICIO, infoEstado, infoModalidad, infoTipoOrden } from '@/lib/servicio/estados';
import { BadgeEstado } from '@/components/servicio/BadgeEstado';
import { formatMoney } from '@/lib/format';

type Orden = {
  id: string; numero: number; estado: string; clienteNombre: string; clienteTelefono: string | null; equipo: string;
  equipoTipo: string; equipoMarca: string | null; equipoModelo: string | null;
  equipoSerie: string | null; tecnico: string | null; fallaReportada: string; diagnostico: string | null; createdAt: string; fechaPrometida: string | null; total: number;
  modalidad: string; senaMonto: number; tipoOrden: string; ordenExterna: string | null;
};
type Config = { numeroDesde: number | null; ultimoNumero: number; proximoNumero: number; tecnicos: string[]; puedeEditar: boolean };
type Datos = { ordenes: Orden[]; total: number; page: number; totalPages: number; contadores: Record<string, number> };

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export default function ServicioTecnicoPage() {
  const router = useRouter();
  const { showToast, toastNode } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [filtro, setFiltro] = useState('ACTIVAS');
  const [search, setSearch] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<Config | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    fetch('/api/tenant/servicio/configuracion').then((r) => (r.ok ? r.json() : null)).then((d) => d && setConfig(d)).catch(() => {});
  }, []);

  const parametros = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro !== 'TODAS') params.set('estado', filtro);
    if (search.trim()) params.set('search', search.trim());
    if (tecnico) params.set('tecnico', tecnico);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    return params;
  }, [filtro, search, tecnico, desde, hasta]);

  const cargar = useCallback(async () => {
    const params = parametros();
    params.set('page', String(page));
    const r = await fetch(`/api/tenant/servicio/ordenes?${params}`);
    const d = await r.json();
    if (r.ok) setDatos(d);
    else showToast(d.error || 'No se pudieron cargar las órdenes.', 'error');
  }, [parametros, page, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, search]);

  const exportar = async () => {
    setExportando(true);
    try {
      const params = parametros();
      params.set('exportar', '1');
      const r = await fetch(`/api/tenant/servicio/ordenes?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const XLSX = await import('xlsx');
      const filas = (d.ordenes as Orden[]).map((o) => ({
        'N° orden': o.numero,
        Ingreso: fecha(o.createdAt),
        Cliente: o.clienteNombre,
        Teléfono: o.clienteTelefono ?? '',
        Equipo: o.equipoTipo,
        Marca: o.equipoMarca ?? '',
        Modelo: o.equipoModelo ?? '',
        Serie: o.equipoSerie ?? '',
        Falla: o.fallaReportada,
        Diagnóstico: o.diagnostico ?? '',
        Estado: infoEstado(o.estado).etiqueta,
        Atención: infoModalidad(o.modalidad).etiqueta,
        Tipo: infoTipoOrden(o.tipoOrden).etiqueta,
        Técnico: o.tecnico ?? '',
        Presupuesto: o.total,
        Seña: o.senaMonto,
        'Prometido para': o.fechaPrometida ? fecha(o.fechaPrometida) : '',
        'N° orden externo': o.ordenExterna ?? '',
      }));
      const hoja = XLSX.utils.json_to_sheet(filas);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Órdenes');
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      XLSX.writeFile(libro, `ordenes-servicio-${hoy}.xlsx`);
      showToast(`Se exportaron ${filas.length.toLocaleString('es-AR')} órdenes.`, 'success');
    } catch (e) {
      showToast((e as Error).message || 'No se pudo exportar.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const c = datos?.contadores ?? {};
  const activas = ESTADOS_EN_CURSO.reduce((a, e) => a + (c[e] ?? 0), 0);
  const todas = Object.values(c).reduce((a, n) => a + n, 0);
  const pestañas = [
    { clave: 'ACTIVAS', etiqueta: 'En curso', n: activas },
    ...ESTADOS_SERVICIO.map((e) => ({ clave: e.estado, etiqueta: e.etiqueta, n: c[e.estado] ?? 0 })),
    { clave: 'TODAS', etiqueta: 'Todas', n: todas },
  ];
  const hayFiltros = !!(tecnico || desde || hasta || search.trim());

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
          {config?.puedeEditar && (
            <button type="button" className="btn btn-secondary" onClick={() => setConfigurando(true)} title="Numeración y técnicos">
              <Settings size={16} /> Configurar
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={exportar} disabled={exportando} title="Bajar a Excel las órdenes del filtro actual">
            {exportando ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Excel
          </button>
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

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} aria-label="Buscar órdenes" placeholder="Buscar N°, cliente, teléfono, equipo o serie" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Técnico</label>
          <select className="form-select" aria-label="Filtrar por técnico" value={tecnico} onChange={(e) => { setTecnico(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(config?.tecnicos ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="__SIN__">Sin asignar</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Ingreso desde</label>
          <input type="date" className="form-input" aria-label="Ingreso desde" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>hasta</label>
          <input type="date" className="form-input" aria-label="Ingreso hasta" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} />
        </div>
        {hayFiltros && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setTecnico(''); setDesde(''); setHasta(''); setPage(1); }}>
            <X size={14} /> Limpiar filtros
          </button>
        )}
        {datos && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{datos.total.toLocaleString('es-AR')} órdenes</span>}
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
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay órdenes con estos filtros.</td></tr>
              )}
              {datos?.ordenes.map((o) => (
                <tr key={o.id} onClick={() => router.push(`/dashboard/servicio/${o.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700 }}>
                    #{o.numero}
                    {o.ordenExterna && <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>ext. {o.ordenExterna}</div>}
                  </td>
                  <td>{o.clienteNombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{o.clienteTelefono ?? ''}</div></td>
                  <td>
                    {o.equipo}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.equipoSerie ? `Serie ${o.equipoSerie} · ` : ''}{o.fallaReportada}
                    </div>
                  </td>
                  <td>
                    <BadgeEstado estado={o.estado} />
                    {(o.modalidad !== 'PRESUPUESTAR' || o.tipoOrden === 'DOMICILIO') && (
                      <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>
                        {[o.modalidad !== 'PRESUPUESTAR' ? infoModalidad(o.modalidad).etiqueta : null, o.tipoOrden === 'DOMICILIO' ? 'A domicilio' : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
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

      {configurando && config && (
        <ModalConfiguracion
          config={config}
          onCerrar={() => setConfigurando(false)}
          onGuardado={(n) => { setConfig(n); setConfigurando(false); showToast(`Guardado. La próxima orden va a ser la N° ${n.proximoNumero}.`, 'success'); }}
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

function ModalConfiguracion({ config, onCerrar, onGuardado }: { config: Config; onCerrar: () => void; onGuardado: (n: Config) => void }) {
  const [valor, setValor] = useState(String(config.proximoNumero));
  const [tecnicos, setTecnicos] = useState<string[]>(config.tecnicos);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const n = parseInt(valor, 10) || 0;
  const menorAlUltimo = n > 0 && n <= config.ultimoNumero;

  const agregar = () => {
    const t = nuevo.replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (!tecnicos.some((x) => x.toLowerCase() === t.toLowerCase())) setTecnicos((l) => [...l, t]);
    setNuevo('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const r = await fetch('/api/tenant/servicio/configuracion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroDesde: valor, tecnicos: nuevo.trim() ? [...tecnicos, nuevo.trim()] : tecnicos }),
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
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3>Configurar servicio técnico</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>X</button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            <h4 style={{ marginBottom: '0.35rem' }}>Técnicos</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '0.5rem' }}>Aparecen para elegir en cada orden y para filtrar el tablero.</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {tecnicos.length === 0 && <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Todavía no cargaste técnicos.</span>}
              {tecnicos.map((t) => (
                <span key={t} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-tertiary, #f1f5f9)', padding: '0.25rem 0.5rem' }}>
                  {t}
                  <button type="button" aria-label={`Quitar ${t}`} onClick={() => setTecnicos((l) => l.filter((x) => x !== t))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem' }}>
              <input className="form-input" aria-label="Nombre del técnico" placeholder="Nombre del técnico" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
              <button type="button" className="btn btn-secondary" onClick={agregar} disabled={!nuevo.trim()}>Agregar</button>
            </div>

            <h4 style={{ marginBottom: '0.35rem' }}>Numeración</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '0.5rem' }}>
              Número que va a llevar la próxima orden (para seguir la del sistema anterior).
              {config.ultimoNumero > 0 && <> La última cargada acá es la N° {config.ultimoNumero}.</>}
            </p>
            <div className="form-group">
              <label className="form-label">Próxima orden N°</label>
              <input className="form-input" inputMode="numeric" aria-label="Próxima orden número" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} />
            </div>
            {menorAlUltimo && <p style={{ color: '#b45309', fontSize: '0.82rem' }}>Ese número ya se usó: la próxima sigue desde la N° {config.ultimoNumero + 1}.</p>}
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
