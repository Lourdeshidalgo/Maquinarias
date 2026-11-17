'use client';

import { use, useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { infoModalidad } from '@/lib/servicio/estados';

type Orden = {
  numero: number; createdAt: string; clienteNombre: string; clienteTelefono: string | null;
  equipoTipo: string; equipoMarca: string | null; equipoModelo: string | null; equipoSerie: string | null; equipoHoras: string | null;
  fallaReportada: string; observaciones: string | null; notasInternas: string | null; accesorios: string | null; tecnico: string | null;
  fechaPrometida: string | null; modalidad: string; senaMonto: number | string; senaFormaPago: string | null;
};

const fecha = (s: string | Date) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const fechaHora = (s: string | Date) =>
  new Date(s).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

// Comprobante de ingreso del equipo: dos copias en una hoja A4 (cliente y taller).
export default function IngresoServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [empresa, setEmpresa] = useState<{ nombre: string; cuit: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/tenant/servicio/ordenes/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setOrden(d.orden);
        setEmpresa(d.empresa);
      })
      .catch((e) => setError((e as Error).message || 'No se pudo cargar la orden.'));
  }, [id]);

  if (error) return <div className="card">{error}</div>;
  if (!orden) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>;

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: '1.5rem 0' }}>
      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Dos copias en una hoja: una para el cliente y otra para el taller.</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.close()}><X size={14} /> Cerrar</button>
        </div>
      </div>

      <div className="hoja-ingreso" style={{ maxWidth: 800, margin: '0 auto', background: '#fff', color: '#111', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <Copia orden={orden} empresa={empresa} titulo="ORIGINAL · CLIENTE" />
        <div className="corte" style={{ borderTop: '1px dashed #999', margin: '0 1.5rem', position: 'relative' }}>
          <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 8px', fontSize: '0.7rem', color: '#999' }}>✂ cortar aquí</span>
        </div>
        <Copia orden={orden} empresa={empresa} titulo="DUPLICADO · TALLER" interna />
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          .no-print, .sidebar, .navbar { display: none !important; }
          html, body { background: #fff !important; }
          .main-layout, .content-area, .container { padding: 0 !important; margin: 0 !important; display: block !important; overflow: visible !important; }
          .hoja-ingreso { box-shadow: none !important; max-width: none !important; }
          .copia-ingreso { height: 136mm; overflow: hidden; }
        }
      `}</style>
    </div>
  );
}

function Copia({ orden, empresa, titulo, interna }: { orden: Orden; empresa: { nombre: string; cuit: string } | null; titulo: string; interna?: boolean }) {
  const equipo = [orden.equipoTipo, orden.equipoMarca, orden.equipoModelo].filter(Boolean).join(' ');
  const sena = Number(orden.senaMonto) || 0;
  const etiqueta = { fontWeight: 700, fontSize: '0.7rem', color: '#555', textTransform: 'uppercase' as const };

  return (
    <div className="copia-ingreso" style={{ padding: '1.2rem 1.5rem', fontSize: '0.86rem', lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '2px solid #111', paddingBottom: '0.5rem', marginBottom: '0.6rem' }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{empresa?.nombre}</div>
          <div style={{ color: '#555', fontSize: '0.78rem' }}>CUIT {empresa?.cuit} · Servicio técnico</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', color: '#555' }}>{titulo}</div>
          <div style={{ fontSize: '1rem', fontWeight: 800 }}>COMPROBANTE DE INGRESO</div>
          <div>Orden N° <strong style={{ fontSize: '1.15rem' }}>{orden.numero}</strong></div>
          <div style={{ color: '#555', fontSize: '0.78rem' }}>Ingreso {fechaHora(orden.createdAt)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', marginBottom: '0.5rem' }}>
        <div>
          <div style={etiqueta}>Cliente</div>
          <div>{orden.clienteNombre}{orden.clienteTelefono ? ` · Tel. ${orden.clienteTelefono}` : ''}</div>
        </div>
        <div>
          <div style={etiqueta}>Equipo</div>
          <div>{equipo}</div>
          {(orden.equipoSerie || orden.equipoHoras) && (
            <div style={{ color: '#555', fontSize: '0.8rem' }}>
              {orden.equipoSerie && <>Serie {orden.equipoSerie}</>}{orden.equipoSerie && orden.equipoHoras && ' · '}{orden.equipoHoras}
            </div>
          )}
        </div>
        <div>
          <div style={etiqueta}>Atención</div>
          <div>{infoModalidad(orden.modalidad).etiqueta}{orden.fechaPrometida ? ` · prometido para el ${fecha(orden.fechaPrometida)}` : ''}</div>
        </div>
        <div>
          <div style={etiqueta}>Accesorios que deja</div>
          <div>{orden.accesorios || 'Ninguno'}</div>
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <div style={etiqueta}>Falla reportada</div>
        <div>{orden.fallaReportada}</div>
      </div>
      {orden.observaciones && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={etiqueta}>Observaciones</div>
          <div>{orden.observaciones}</div>
        </div>
      )}
      {interna && (orden.notasInternas || orden.tecnico) && (
        <div style={{ marginBottom: '0.5rem', background: '#f1f5f9', padding: '0.35rem 0.5rem' }}>
          <div style={etiqueta}>Uso interno</div>
          {orden.tecnico && <div>Técnico: {orden.tecnico}</div>}
          {orden.notasInternas && <div>{orden.notasInternas}</div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', marginTop: '0.4rem' }}>
        <div style={{ fontSize: '0.74rem', color: '#444', flex: 1 }}>
          {sena > 0 && (
            <div style={{ fontSize: '0.86rem', color: '#111', marginBottom: 4 }}>
              Seña recibida: <strong>{formatMoney(sena)}</strong>{orden.senaFormaPago ? ` (${orden.senaFormaPago})` : ''}
            </div>
          )}
          <div>Presentar este comprobante para retirar el equipo.</div>
          {orden.modalidad === 'PRESUPUESTAR' && <div>El presupuesto se informa antes de reparar.</div>}
        </div>
        <div style={{ width: 220, borderTop: '1px solid #999', paddingTop: 4, textAlign: 'center', fontSize: '0.76rem' }}>
          {interna ? 'Firma del cliente' : 'Recibió (firma y sello)'}
        </div>
      </div>
    </div>
  );
}
