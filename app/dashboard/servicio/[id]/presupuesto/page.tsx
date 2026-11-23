'use client';

import { use, useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { formatMoney } from '@/lib/format';

type Item = { id: string; tipo: string; descripcion: string; cantidad: number; precioUnitario: number; codigo: string | null };
type Orden = {
  numero: number; estado: string; createdAt: string; clienteNombre: string; clienteTelefono: string | null;
  equipoTipo: string; equipoMarca: string | null; equipoModelo: string | null; equipoSerie: string | null; equipoHoras: string | null;
  fallaReportada: string; diagnostico: string | null; observaciones: string | null; tecnico: string | null; validezDias: number; fechaPrometida: string | null;
  items: Item[]; totales: { repuestos: number; manoObra: number; otros: number; total: number };
  modalidad: string; senaMonto: number | string;
};

const fecha = (s: string | Date) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const TIPO: Record<string, string> = { REPUESTO: 'Repuesto', MANO_OBRA: 'Mano de obra', OTRO: 'Otro' };

// Presupuesto de una orden de servicio técnico, listo para imprimir o guardar en PDF.
export default function PresupuestoServicioPage({ params }: { params: Promise<{ id: string }> }) {
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
      .catch((e) => setError((e as Error).message || 'No se pudo cargar el presupuesto.'));
  }, [id]);

  if (error) return <div className="card">{error}</div>;
  if (!orden) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>;

  const emitido = new Date();
  const vence = new Date(emitido.getTime() + (orden.validezDias || 15) * 86_400_000);
  const equipo = [orden.equipoTipo, orden.equipoMarca, orden.equipoModelo].filter(Boolean).join(' ');

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: '1.5rem 0' }}>
      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0 1rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Vista de impresión · para PDF elegí &quot;Guardar como PDF&quot; al imprimir</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.close()}><X size={14} /> Cerrar</button>
        </div>
      </div>

      <div className="hoja-presupuesto" style={{ maxWidth: 800, margin: '0 auto', background: '#fff', color: '#111', padding: '2.2rem 2.4rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '0.92rem', lineHeight: 1.45 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '2px solid #111', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{empresa?.nombre}</div>
            <div style={{ color: '#555' }}>CUIT {empresa?.cuit}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>PRESUPUESTO DE REPARACIÓN</div>
            {orden.modalidad === 'GARANTIA' && <div style={{ fontWeight: 800 }}>EN GARANTÍA</div>}
            <div>Orden de servicio N° <strong>{orden.numero}</strong></div>
            <div style={{ color: '#555' }}>Fecha {fecha(emitido)} · válido hasta {fecha(vence)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#555', textTransform: 'uppercase' }}>Cliente</div>
            <div>{orden.clienteNombre}</div>
            {orden.clienteTelefono && <div style={{ color: '#555' }}>Tel. {orden.clienteTelefono}</div>}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#555', textTransform: 'uppercase' }}>Equipo</div>
            <div>{equipo}</div>
            <div style={{ color: '#555' }}>
              {orden.equipoSerie && <>Serie/chasis {orden.equipoSerie}</>}
              {orden.equipoSerie && orden.equipoHoras && ' · '}
              {orden.equipoHoras && <>{orden.equipoHoras}</>}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#555', textTransform: 'uppercase' }}>Falla reportada</div>
          <div>{orden.fallaReportada}</div>
          {orden.diagnostico && (
            <>
              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#555', textTransform: 'uppercase', marginTop: '0.5rem' }}>Diagnóstico</div>
              <div>{orden.diagnostico}</div>
            </>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #111', textAlign: 'left' }}>
              <th style={{ padding: '0.35rem 0' }}>Detalle</th>
              <th style={{ padding: '0.35rem 0', textAlign: 'right', width: 70 }}>Cant.</th>
              <th style={{ padding: '0.35rem 0', textAlign: 'right', width: 130 }}>Precio unit.</th>
              <th style={{ padding: '0.35rem 0', textAlign: 'right', width: 130 }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {orden.items.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.35rem 0' }}>
                  {i.descripcion}
                  <span style={{ color: '#777', fontSize: '0.78rem' }}> · {TIPO[i.tipo] ?? i.tipo}{i.codigo ? ` ${i.codigo}` : ''}</span>
                </td>
                <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>{i.cantidad}</td>
                <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>{formatMoney(i.precioUnitario)}</td>
                <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>{formatMoney(i.cantidad * i.precioUnitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.2rem' }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Repuestos</span><span>{formatMoney(orden.totales.repuestos)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mano de obra</span><span>{formatMoney(orden.totales.manoObra)}</span></div>
            {orden.totales.otros > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Otros</span><span>{formatMoney(orden.totales.otros)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', marginTop: 6, paddingTop: 6, fontSize: '1.15rem', fontWeight: 800 }}>
              <span>TOTAL</span><span>{formatMoney(orden.totales.total)}</span>
            </div>
            <div style={{ textAlign: 'right', color: '#555', fontSize: '0.8rem' }}>IVA incluido</div>
            {Number(orden.senaMonto) > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span>Seña recibida</span><span>−{formatMoney(Number(orden.senaMonto))}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Resta pagar</span><span>{formatMoney(Math.max(0, orden.totales.total - Number(orden.senaMonto)))}</span></div>
              </>
            )}
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: '#444', borderTop: '1px solid #ddd', paddingTop: '0.75rem' }}>
          {orden.fechaPrometida && <div>Entrega estimada: {fecha(orden.fechaPrometida)} (una vez aceptado el presupuesto).</div>}
          {orden.observaciones && <div>Observaciones: {orden.observaciones}</div>}
          <div>Presupuesto válido por {orden.validezDias} días. Los precios pueden variar si cambia el costo de los repuestos.</div>
          {orden.tecnico && <div>Técnico: {orden.tecnico}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', gap: '2rem' }}>
            <div style={{ flex: 1, borderTop: '1px solid #999', paddingTop: 4, textAlign: 'center' }}>Firma y aclaración del cliente</div>
            <div style={{ flex: 1, borderTop: '1px solid #999', paddingTop: 4, textAlign: 'center' }}>Conformidad del presupuesto</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print, .sidebar, .navbar { display: none !important; }
          html, body { background: #fff !important; }
          .main-layout, .content-area, .container { padding: 0 !important; margin: 0 !important; display: block !important; overflow: visible !important; }
          .hoja-presupuesto { box-shadow: none !important; max-width: none !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
