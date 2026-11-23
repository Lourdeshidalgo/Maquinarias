'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Loader2, FileUp, Scale } from 'lucide-react';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { COLOR_SEMAFORO } from '@/components/costos/Semaforo';

type Resumen = { productos: number; verde: number; amarillo: number; rojo: number };
type FilaProveedor = Resumen & {
  id: string; nombre: string; diasMasAntiguo: number | null; pctDesactualizado: number; pctAmarillo: number;
  ultimaLista: { fechaVigencia: string; aplicadaAt: string; archivo: string; dias: number } | null;
};
type Datos = { umbrales: { umbralAmarillo: number; umbralRojo: number }; general: Resumen; proveedores: FilaProveedor[] };

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

function Barra({ r }: { r: Resumen }) {
  if (!r.productos) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pct = (x: number) => `${(x / r.productos) * 100}%`;
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', minWidth: 140, background: 'var(--bg-tertiary)' }} aria-label={`${r.verde} al día, ${r.amarillo} por vencer, ${r.rojo} desactualizados`}>
      <div style={{ width: pct(r.verde), background: COLOR_SEMAFORO.VERDE }} />
      <div style={{ width: pct(r.amarillo), background: COLOR_SEMAFORO.AMARILLO }} />
      <div style={{ width: pct(r.rojo), background: COLOR_SEMAFORO.ROJO }} />
    </div>
  );
}

export default function EstadoCostosPage() {
  const modulo = useModuloCostos();
  const [datos, setDatos] = useState<Datos | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/tenant/costos/estado');
    if (r.ok) setDatos(await r.json());
  }, []);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar]);

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;
  if (!datos) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;

  const { general, umbrales } = datos;
  const tarjeta = (titulo: string, valor: number, color: string, ayuda: string, href?: string) => (
    <div className="card stat-card">
      <div className="stat-icon" style={{ backgroundColor: `${color}1a`, color }}><Activity size={24} /></div>
      <div className="stat-info">
        <span className="stat-label">{titulo}</span>
        <span className="stat-value">{valor}</span>
        {href ? <Link href={href} style={{ fontSize: '0.75rem', color }}>{ayuda}</Link> : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ayuda}</span>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={26} style={{ color: 'var(--primary)' }} />
            <span>Estado de costos</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Verde: actualizado hace menos de {umbrales.umbralAmarillo} días · amarillo: hasta {umbrales.umbralRojo} · rojo: más de {umbrales.umbralRojo}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/costos/comparador" className="btn btn-secondary"><Scale size={16} /> Comparar proveedores</Link>
          <Link href="/dashboard/costos/importar" className="btn btn-primary"><FileUp size={16} /> Importar lista</Link>
        </div>
      </div>

      <div className="grid-stats" style={{ marginBottom: '1.25rem' }}>
        {tarjeta('Productos', general.productos, '#4338ca', 'activos en el catálogo')}
        {tarjeta('Al día', general.verde, COLOR_SEMAFORO.VERDE, `${general.productos ? Math.round((general.verde / general.productos) * 100) : 0}% del catálogo`)}
        {tarjeta('Por vencer', general.amarillo, COLOR_SEMAFORO.AMARILLO, 'Ver productos', '/dashboard/costos/grilla?semaforo=AMARILLO')}
        {tarjeta('Desactualizados', general.rojo, COLOR_SEMAFORO.ROJO, 'Ver productos', '/dashboard/costos/grilla?semaforo=ROJO')}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Última lista</th>
                <th style={{ textAlign: 'right' }}>Productos</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Desactualizados</th>
                <th style={{ textAlign: 'right' }}>Costo más viejo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.proveedores.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay proveedores con productos.</td></tr>
              )}
              {datos.proveedores.map((p) => {
                const atrasado = p.pctDesactualizado > 0;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td>
                      {p.ultimaLista ? (
                        <>
                          {fecha(p.ultimaLista.fechaVigencia)}
                          <div style={{ color: p.ultimaLista.dias > umbrales.umbralRojo ? COLOR_SEMAFORO.ROJO : 'var(--text-muted)', fontSize: '0.75rem' }}>hace {p.ultimaLista.dias} días</div>
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>{p.id === 'SIN' ? '—' : 'Nunca se importó'}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{p.productos}</td>
                    <td><Barra r={p} /></td>
                    <td style={{ textAlign: 'right', fontWeight: atrasado ? 700 : undefined, color: atrasado ? COLOR_SEMAFORO.ROJO : undefined }}>
                      {p.pctDesactualizado}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({p.rojo})</span>
                      {p.amarillo > 0 && <div style={{ fontSize: '0.75rem', color: COLOR_SEMAFORO.AMARILLO, fontWeight: 400 }}>{p.amarillo} por vencer</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{p.diasMasAntiguo === null ? '—' : `${p.diasMasAntiguo} días`}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/dashboard/costos/grilla?proveedorId=${p.id}${p.rojo ? '&semaforo=ROJO' : ''}`} className="btn btn-secondary btn-sm">
                        {p.rojo ? 'Ver atrasados' : 'Ver productos'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
