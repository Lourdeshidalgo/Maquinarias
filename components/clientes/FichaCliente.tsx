'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Wrench } from 'lucide-react';

type Cliente = {
  id: string; tipoDoc: string; nroDoc: string; razonSocial: string; condicionIva: string; codigo: number | null;
  direccion: string | null; localidad: string | null; provincia: string | null; codigoPostal: string | null;
  telefono: string | null; celular: string | null; email: string | null; notas: string | null; limiteCredito: string | number | null;
};
type Orden = { id: string; numero: number; estado: string; equipoTipo: string; equipoMarca: string | null; equipoModelo: string | null; createdAt: string };

type Form = Record<'tipoDoc' | 'nroDoc' | 'razonSocial' | 'condicionIva' | 'codigo' | 'direccion' | 'localidad' | 'provincia' | 'codigoPostal' | 'telefono' | 'celular' | 'email' | 'notas' | 'limiteCredito', string>;

const VACIO: Form = {
  tipoDoc: 'DNI', nroDoc: '', razonSocial: '', condicionIva: 'Consumidor Final', codigo: '', direccion: '', localidad: '',
  provincia: '', codigoPostal: '', telefono: '', celular: '', email: '', notas: '', limiteCredito: '',
};

const aForm = (c: Cliente): Form => ({
  tipoDoc: c.tipoDoc, nroDoc: c.tipoDoc === '99' ? '' : c.nroDoc, razonSocial: c.razonSocial, condicionIva: c.condicionIva,
  codigo: c.codigo != null ? String(c.codigo) : '', direccion: c.direccion ?? '', localidad: c.localidad ?? '', provincia: c.provincia ?? '',
  codigoPostal: c.codigoPostal ?? '', telefono: c.telefono ?? '', celular: c.celular ?? '', email: c.email ?? '', notas: c.notas ?? '',
  limiteCredito: c.limiteCredito != null && c.limiteCredito !== '' ? String(Math.round(Number(c.limiteCredito))) : '',
});

const fecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

// Alta o edición de la ficha completa de un cliente (clienteId = null → alta).
export default function FichaCliente({ clienteId, onCerrar, onGuardado }: { clienteId: string | null; onCerrar: () => void; onGuardado: (msg: string) => void }) {
  const [form, setForm] = useState<Form>(VACIO);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [generico, setGenerico] = useState(false);
  const [cargando, setCargando] = useState(!!clienteId);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clienteId) return;
    fetch(`/api/tenant/clientes/${clienteId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setForm(aForm(d));
        setOrdenes(d.ordenesServicio ?? []);
        setGenerico(d.tipoDoc === '99' && d.nroDoc === '0');
      })
      .catch((e) => setError((e as Error).message || 'No se pudo cargar el cliente.'))
      .finally(() => setCargando(false));
  }, [clienteId]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const r = await fetch(clienteId ? `/api/tenant/clientes/${clienteId}` : '/api/tenant/clientes', {
        method: clienteId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onGuardado(clienteId ? `Se guardaron los cambios de ${d.razonSocial}.` : `Cliente N° ${d.codigo ?? ''} ${d.razonSocial} creado.`);
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: keyof Form, etiqueta: string, props: Record<string, unknown> = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{etiqueta}</label>
      <input className="form-input" aria-label={etiqueta} value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );
  const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>{clienteId ? `👤 Ficha del cliente${form.codigo ? ` N° ${form.codigo}` : ''}` : '👤 Nuevo cliente'}</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        {cargando ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></div>
        ) : (
          <form onSubmit={guardar}>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>⚠️ {error}</div>}

              <div style={grilla}>
                {campo('codigo', 'N° de cliente', { inputMode: 'numeric', placeholder: clienteId ? '' : 'Automático' })}
                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">Nombre o razón social *</label>
                  <input className="form-input" aria-label="Nombre o razón social" value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} required />
                </div>
              </div>

              <div style={grilla}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Documento</label>
                  <select className="form-select" aria-label="Tipo de documento" value={form.tipoDoc} disabled={generico} onChange={(e) => set('tipoDoc', e.target.value)}>
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="99">Sin documento</option>
                  </select>
                </div>
                {form.tipoDoc !== '99' && campo('nroDoc', form.tipoDoc === 'CUIT' ? 'N° de CUIT' : 'N° de DNI', { inputMode: 'numeric', required: true, placeholder: form.tipoDoc === 'CUIT' ? '20-12345678-9' : '12345678' })}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Condición IVA</label>
                  <select className="form-select" aria-label="Condición IVA" value={form.condicionIva} onChange={(e) => set('condicionIva', e.target.value)}>
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Monotributista">Monotributista</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
              </div>

              <div style={grilla}>
                {campo('celular', 'Celular / WhatsApp', { inputMode: 'tel', placeholder: '2235551234' })}
                {campo('telefono', 'Teléfono', { inputMode: 'tel' })}
                {campo('email', 'Email', { type: 'email' })}
              </div>

              <div style={grilla}>
                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">Dirección</label>
                  <input className="form-input" aria-label="Dirección" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} />
                </div>
                {campo('localidad', 'Localidad')}
                {campo('codigoPostal', 'CP')}
                {campo('provincia', 'Provincia')}
                {campo('limiteCredito', 'Límite de crédito ($)', { inputMode: 'numeric', placeholder: 'Sin límite' })}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={2} aria-label="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Apodo, referencia, datos técnicos…" />
              </div>

              {generico && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Es el cliente genérico de las ventas al paso: el documento no se cambia.</p>}

              {clienteId && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={15} /> Órdenes de servicio</h4>
                  {ordenes.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Todavía no tiene órdenes en este sistema.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.86rem' }}>
                      {ordenes.map((o) => (
                        <li key={o.id} style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border-color)' }}>
                          <Link href={`/dashboard/servicio/${o.id}`}>N° {o.numero}</Link> · {fecha(o.createdAt)} · {[o.equipoTipo, o.equipoMarca, o.equipoModelo].filter(Boolean).join(' ')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={onCerrar} className="btn btn-secondary" disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {guardando ? <Loader2 size={16} className="spin" /> : null} {clienteId ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
