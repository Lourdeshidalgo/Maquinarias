'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Wrench, Loader2, Save, Plus, Trash2, Printer, MessageCircle, ShoppingCart, Package, Hammer, AlertTriangle, History, ClipboardList, Banknote } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { BadgeEstado } from '@/components/servicio/BadgeEstado';
import { ACCESORIOS_FRECUENTES, FORMAS_PAGO_SENA, MODALIDADES, infoEstado, infoModalidad, totalesServicio, transicionesDe, type EstadoServicio } from '@/lib/servicio/estados';
import { formatMoney, todayArgentina } from '@/lib/format';

type Item = {
  key: string; tipo: 'REPUESTO' | 'MANO_OBRA' | 'OTRO'; productoId: string | null; descripcion: string; cantidad: string; precioUnitario: string;
  codigo?: string | null; stockDisponible?: number | null;
};
type Datos = {
  clienteId: string | null; clienteNombre: string; clienteTelefono: string; equipoTipo: string; equipoMarca: string; equipoModelo: string;
  equipoSerie: string; equipoHoras: string; fallaReportada: string; diagnostico: string; tecnico: string; observaciones: string;
  fechaPrometida: string; validezDias: string; modalidad: string; accesorios: string; notasInternas: string;
};
type Evento = { id: string; estadoAnterior: string | null; estadoNuevo: string; detalle: string | null; usuario: string | null; createdAt: string };
type Orden = {
  id: string; numero: number; estado: string; stockDescontado: boolean; createdAt: string; eventos: Evento[]; modalidad: string;
  senaMonto: number | string; senaFormaPago: string | null; senaFecha: string | null;
  venta: { id: string; tipoComprobante: string; puntoVenta: number; numeroComprobante: number; total: number; fecha: string } | null;
};
type ProductoBusqueda = { id: string; codigo: string; nombre: string; precioVenta: string; stockActual: string };
type ClienteLista = { id: string; razonSocial: string; telefono: string | null; tipoDoc: string; nroDoc: string };

const VACIO: Datos = {
  clienteId: null, clienteNombre: '', clienteTelefono: '', equipoTipo: '', equipoMarca: '', equipoModelo: '', equipoSerie: '',
  equipoHoras: '', fallaReportada: '', diagnostico: '', tecnico: '', observaciones: '', fechaPrometida: '', validezDias: '15',
  modalidad: 'PRESUPUESTAR', accesorios: '', notasInternas: '',
};

// Lo que se guarda de la orden (sin datos de pantalla como el stock o la clave de la fila)
const instantanea = (d: Datos, items: Item[]) =>
  JSON.stringify({
    d,
    items: items.map((i) => [i.tipo, i.productoId, i.descripcion, i.cantidad, i.precioUnitario]),
  });

let contador = 0;
const nuevaKey = () => `i${Date.now()}-${contador++}`;
const fechaHora = (s: string) => new Date(s).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
const soloEntero = (v: string) => v.replace(/\D/g, '');

const CONFIRMACIONES: Partial<Record<EstadoServicio, { titulo: string; mensaje: string; danger?: boolean }>> = {
  COTIZADO: { titulo: 'Marcar como cotizado', mensaje: 'El presupuesto queda enviado y la orden espera la respuesta del cliente. El stock no se toca.' },
  ACEPTADO: { titulo: 'El cliente aceptó', mensaje: 'Los repuestos del presupuesto se descuentan del stock ahora (quedan apartados para esta reparación).' },
  NO_ACEPTADO: { titulo: 'El cliente no aceptó', mensaje: 'La orden queda como no aceptada. Si había repuestos descontados, vuelven al stock.', danger: true },
  CANCELADO: { titulo: 'Cancelar la orden', mensaje: 'La orden se cancela. Si había repuestos descontados, vuelven al stock.', danger: true },
  EN_REPARACION: { titulo: 'Pasar a reparación', mensaje: 'La orden pasa a reparación. Si tiene repuestos cargados, se descuentan del stock ahora.' },
  ENTREGADO: { titulo: 'Entregar sin cargo (garantía)', mensaje: 'La orden queda entregada sin cobrar en el POS. No se emite comprobante.' },
};

export default function OrdenServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const esNueva = id === 'nueva';
  const router = useRouter();
  const { showToast, toastNode } = useToast(5000);
  const { confirm, confirmNode } = useConfirm();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(!esNueva);
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [senaInput, setSenaInput] = useState('');
  const [senaForma, setSenaForma] = useState<string>('Efectivo');
  const [guardandoSena, setGuardandoSena] = useState(false);
  // Foto de lo guardado, para saber si hay cambios sin guardar
  const [original, setOriginal] = useState<string>(() => instantanea(VACIO, []));

  const cargar = useCallback(async () => {
    if (esNueva) return;
    const r = await fetch(`/api/tenant/servicio/ordenes/${id}`);
    const d = await r.json();
    if (!r.ok) {
      showToast(d.error || 'No se encontró la orden.', 'error');
      setCargando(false);
      return;
    }
    const o = d.orden;
    const nuevosDatos: Datos = {
      clienteId: o.clienteId, clienteNombre: o.clienteNombre ?? '', clienteTelefono: o.clienteTelefono ?? '', equipoTipo: o.equipoTipo ?? '',
      equipoMarca: o.equipoMarca ?? '', equipoModelo: o.equipoModelo ?? '', equipoSerie: o.equipoSerie ?? '', equipoHoras: o.equipoHoras ?? '',
      fallaReportada: o.fallaReportada ?? '', diagnostico: o.diagnostico ?? '', tecnico: o.tecnico ?? '', observaciones: o.observaciones ?? '',
      fechaPrometida: o.fechaPrometida ? String(o.fechaPrometida).slice(0, 10) : '', validezDias: String(o.validezDias ?? 15),
      modalidad: o.modalidad ?? 'PRESUPUESTAR', accesorios: o.accesorios ?? '', notasInternas: o.notasInternas ?? '',
    };
    const nuevosItems: Item[] = o.items.map((i: { tipo: Item['tipo']; productoId: string | null; descripcion: string; cantidad: number; precioUnitario: number; codigo: string | null; stockDisponible: number | null }) => ({
      key: nuevaKey(), tipo: i.tipo, productoId: i.productoId, descripcion: i.descripcion, cantidad: String(i.cantidad),
      precioUnitario: String(Math.round(i.precioUnitario)), codigo: i.codigo, stockDisponible: i.stockDisponible,
    }));
    setOrden(o);
    setSenaInput(Number(o.senaMonto) > 0 ? String(Math.round(Number(o.senaMonto))) : '');
    setSenaForma(o.senaFormaPago ?? 'Efectivo');
    setDatos(nuevosDatos);
    setItems(nuevosItems);
    setOriginal(instantanea(nuevosDatos, nuevosItems));
    setCargando(false);
  }, [esNueva, id, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const hayCambios = esNueva || instantanea(datos, items) !== original;
  const sena = Number(orden?.senaMonto) || 0;
  const cerrada = orden?.estado === 'ENTREGADO';
  const totales = useMemo(
    () => totalesServicio(items.map((i) => ({ tipo: i.tipo, cantidad: Number(i.cantidad) || 0, precioUnitario: Number(i.precioUnitario) || 0 }))),
    [items]
  );

  const set = (campo: keyof Datos, valor: string | null) => setDatos((d) => ({ ...d, [campo]: valor }));
  const setItem = (key: string, cambios: Partial<Item>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...cambios } : i)));

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = {
        ...datos,
        fechaPrometida: datos.fechaPrometida || null,
        items: items.map((i) => ({ tipo: i.tipo, productoId: i.productoId, descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario || '0' })),
      };
      const r = await fetch(esNueva ? '/api/tenant/servicio/ordenes' : `/api/tenant/servicio/ordenes/${id}`, {
        method: esNueva ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (esNueva) {
        let aviso = '';
        if (Number(senaInput) > 0) {
          const rs = await fetch(`/api/tenant/servicio/ordenes/${d.id}/sena`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto: senaInput, formaPago: senaForma }),
          });
          if (!rs.ok) aviso = ` La seña no se registró: ${(await rs.json()).error ?? 'error'}.`;
        }
        showToast(`Orden N° ${d.numero} creada. Imprimí el comprobante de ingreso para el cliente.${aviso}`, aviso ? 'info' : 'success');
        router.replace(`/dashboard/servicio/${d.id}`);
        return;
      }
      if (d.enNegativo?.length) showToast(`Guardado. Ojo: sin stock suficiente de ${d.enNegativo.map((x: { nombre: string }) => x.nombre).join(', ')}.`, 'info');
      else showToast('Cambios guardados.', 'success');
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (destino: EstadoServicio) => {
    if (!orden) return;
    const vuelveAtras = destino === 'COTIZADO' && orden.stockDescontado;
    const conf = vuelveAtras
      ? { titulo: 'Volver a cotizado', mensaje: 'La orden vuelve a esperar respuesta del cliente y los repuestos vuelven al stock.' }
      : CONFIRMACIONES[destino] ?? { titulo: `Pasar a "${infoEstado(destino).etiqueta}"`, mensaje: infoEstado(destino).ayuda };
    const ok = await confirm({ title: conf.titulo, message: conf.mensaje, confirmText: 'Confirmar', danger: 'danger' in conf ? conf.danger : false });
    if (!ok) return;
    setCambiando(true);
    try {
      const r = await fetch(`/api/tenant/servicio/ordenes/${id}/estado`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: destino }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const extra = d.enNegativo?.length ? ` Ojo: no alcanza el stock de ${d.enNegativo.map((x: { nombre: string }) => x.nombre).join(', ')} (hay que pedirlo).` : '';
      showToast(`La orden pasó a "${infoEstado(destino).etiqueta}".${d.notaStock ? ` ${d.notaStock}.` : ''}${extra}`, extra ? 'info' : 'success');
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo cambiar el estado.', 'error');
    } finally {
      setCambiando(false);
    }
  };

  const guardarSena = async (monto: string) => {
    if (!orden) return;
    const anterior = Number(orden.senaMonto) || 0;
    if (Number(monto) === 0 && anterior > 0) {
      const ok = await confirm({ title: 'Anular la seña', message: `Se anula la seña de ${formatMoney(anterior)} y sale de la caja de ese día. Usalo si la cargaste mal o la devolviste hoy.`, confirmText: 'Anular seña', danger: true });
      if (!ok) return;
    }
    setGuardandoSena(true);
    try {
      const r = await fetch(`/api/tenant/servicio/ordenes/${id}/sena`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto, formaPago: senaForma }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(Number(monto) > 0 ? `Seña de ${formatMoney(Number(monto))} registrada: entra en la caja de hoy.` : 'Seña anulada.', 'success');
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo guardar la seña.', 'error');
    } finally {
      setGuardandoSena(false);
    }
  };

  const linkWhatsapp = () => {
    const tel = (datos.clienteTelefono || '').replace(/\D/g, '').replace(/^0/, '');
    const numero = tel ? (tel.startsWith('54') ? tel : `549${tel.replace(/^15/, '')}`) : '';
    const equipo = [datos.equipoTipo, datos.equipoMarca, datos.equipoModelo].filter(Boolean).join(' ');
    const lineas = items.map((i) => `• ${i.descripcion}${Number(i.cantidad) !== 1 ? ` (x${i.cantidad})` : ''}: ${formatMoney((Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0))}`);
    const texto = [
      `Hola ${datos.clienteNombre.split(' ')[0] || ''}! Te pasamos el presupuesto de la reparación de tu ${equipo} (Orden N° ${orden?.numero ?? ''}):`,
      '', ...lineas, '', `*Total: ${formatMoney(totales.total)}* (IVA incluido)`,
      ...(sena > 0 && totales.total > 0 ? [`Seña recibida: ${formatMoney(sena)}. Resta: ${formatMoney(Math.max(0, totales.total - sena))}.`] : []),
      `Validez: ${datos.validezDias || 15} días.`, '', '¿Nos confirmás si avanzamos con la reparación?',
    ].join('\n');
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  };

  if (cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!esNueva && !orden) return <div className="card">{toastNode}No se encontró la orden. <Link href="/dashboard/servicio">Volver</Link></div>;

  const estado = (orden?.estado ?? 'RECIBIDO') as EstadoServicio;
  const destinos = transicionesDe(estado, orden?.modalidad);
  const cobrable = !!orden && ['ACEPTADO', 'EN_REPARACION', 'LISTO'].includes(estado) && !orden.venta;
  const campo = (k: keyof Datos, etiqueta: string, props: Record<string, unknown> = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{etiqueta}</label>
      <input className="form-input" aria-label={etiqueta.replace(' *', '')} value={(datos[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} disabled={cerrada} {...props} />
    </div>
  );

  return (
    <div style={{ paddingBottom: '4rem' }}>
      {toastNode}
      {confirmNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <Link href="/dashboard/servicio" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Servicio técnico
          </Link>
          <h2 style={{ fontSize: '1.6rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Wrench size={24} style={{ color: 'var(--primary)' }} />
            {esNueva ? 'Nueva orden de servicio' : `Orden N° ${orden!.numero}`}
            {!esNueva && <BadgeEstado estado={estado} />}
          </h2>
          {!esNueva && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{infoEstado(estado).ayuda}</p>}
        </div>
        {!esNueva && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a href={`/dashboard/servicio/${id}/ingreso`} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <ClipboardList size={16} /> Comprobante de ingreso
            </a>
            <a href={`/dashboard/servicio/${id}/presupuesto`} target="_blank" rel="noreferrer" className="btn btn-secondary" aria-disabled={!items.length}>
              <Printer size={16} /> Presupuesto
            </a>
            <a href={linkWhatsapp()} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ color: '#15803d' }}>
              <MessageCircle size={16} /> WhatsApp
            </a>
            {cobrable && (
              <button
                type="button" className="btn btn-primary" disabled={hayCambios}
                title={hayCambios ? 'Guardá los cambios antes de cobrar' : undefined}
                onClick={() => router.push(`/dashboard/ventas?orden=${id}`)}
              >
                <ShoppingCart size={16} /> Cobrar en el POS
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cambios de estado */}
      {!esNueva && destinos.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginRight: '0.25rem' }}>Pasar a:</span>
          {destinos.map((d) => {
            const info = infoEstado(d);
            return (
              <button
                key={d} type="button" className="btn btn-sm btn-secondary" disabled={cambiando || hayCambios}
                title={hayCambios ? 'Guardá los cambios primero' : info.ayuda}
                style={{ borderColor: info.color, color: info.color }}
                onClick={() => cambiarEstado(d)}
              >
                {info.etiqueta}
              </button>
            );
          })}
          {estado === 'LISTO' && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{orden?.modalidad === 'GARANTIA' ? 'Si hay algo para cobrar, usá el POS; si no, entregala sin cargo.' : 'Para entregar, cobrala en el POS.'}</span>}
          {hayCambios && <span style={{ fontSize: '0.8rem', color: '#b45309' }}>Guardá los cambios para poder cambiar el estado.</span>}
        </div>
      )}

      {orden?.venta && (
        <div className="card" style={{ marginBottom: '1rem', background: '#f0fdf4' }}>
          Cobrada con {orden.venta.tipoComprobante} {String(orden.venta.puntoVenta).padStart(4, '0')}-{String(orden.venta.numeroComprobante).padStart(8, '0')} por{' '}
          <strong>{formatMoney(orden.venta.total)}</strong> el {fechaHora(orden.venta.fecha)}
        </div>
      )}

      <div className="responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '0.75rem' }}>Cliente</h3>
          {!cerrada && <SelectorCliente onElegir={(c) => setDatos((d) => ({ ...d, clienteId: c.id, clienteNombre: c.razonSocial, clienteTelefono: c.telefono ?? d.clienteTelefono }))} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            {campo('clienteNombre', 'Nombre *', { placeholder: 'Nombre y apellido' })}
            {campo('clienteTelefono', 'Teléfono / WhatsApp', { placeholder: 'Ej: 2914556677', inputMode: 'tel' })}
          </div>
          {datos.clienteId && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Vinculado a un cliente cargado: al cobrar, la factura sale a su nombre.{' '}
              {!cerrada && <button type="button" className="btn btn-sm btn-secondary" style={{ padding: '0 0.4rem' }} onClick={() => set('clienteId', null)}>Desvincular</button>}
            </p>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '0.75rem' }}>Equipo</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {campo('equipoTipo', 'Tipo *', { placeholder: 'Tractor, motosierra…' })}
            {campo('equipoMarca', 'Marca')}
            {campo('equipoModelo', 'Modelo')}
            {campo('equipoSerie', 'N° de serie / chasis')}
            {campo('equipoHoras', 'Horas de uso')}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Recepción</h3>
        <div role="radiogroup" aria-label="Tipo de atención" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {MODALIDADES.map((m) => {
            const activa = datos.modalidad === m.modalidad;
            return (
              <button
                key={m.modalidad} type="button" role="radio" aria-checked={activa} disabled={cerrada} title={m.ayuda}
                className={`btn btn-sm ${activa ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => set('modalidad', m.modalidad)}
              >
                {m.etiqueta}
              </button>
            );
          })}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{infoModalidad(datos.modalidad).ayuda}</span>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Accesorios que deja el cliente</label>
          <textarea className="form-input" rows={2} aria-label="Accesorios que deja el cliente" placeholder="Ej: espada, cadena, funda. Si no deja nada, dejalo vacío."
            value={datos.accesorios} onChange={(e) => set('accesorios', e.target.value)} disabled={cerrada} />
          {!cerrada && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {ACCESORIOS_FRECUENTES.map((a) => (
                <button key={a} type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.5rem', fontSize: '0.78rem' }}
                  onClick={() => setDatos((d) => {
                    const actuales = d.accesorios.split(',').map((x) => x.trim()).filter(Boolean);
                    return actuales.some((x) => x.toLowerCase() === a.toLowerCase()) ? d : { ...d, accesorios: [...actuales, a].join(', ') };
                  })}>
                  + {a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Falla que reporta el cliente *</label>
            <textarea className="form-input" rows={3} aria-label="Falla que reporta el cliente" value={datos.fallaReportada} onChange={(e) => set('fallaReportada', e.target.value)} disabled={cerrada} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Diagnóstico del técnico</label>
            <textarea className="form-input" rows={3} aria-label="Diagnóstico del técnico" value={datos.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} disabled={cerrada} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
          {campo('tecnico', 'Técnico')}
          {campo('fechaPrometida', 'Fecha prometida', { type: 'date', min: todayArgentina() })}
          {campo('validezDias', 'Validez del presupuesto (días)', { inputMode: 'numeric' })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Observaciones para el cliente <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(salen impresas)</span></label>
            <textarea className="form-input" rows={2} aria-label="Observaciones para el cliente" value={datos.observaciones} onChange={(e) => set('observaciones', e.target.value)} disabled={cerrada} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas internas <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(solo el taller, no se imprimen)</span></label>
            <textarea className="form-input" rows={2} aria-label="Notas internas" style={{ background: '#ecfeff' }} value={datos.notasInternas} onChange={(e) => set('notasInternas', e.target.value)} disabled={cerrada} />
          </div>
        </div>
      </div>

      {/* Seña */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}><Banknote size={18} /> Seña / pago a cuenta</h3>
        {orden && sena > 0 && (
          <p style={{ fontSize: '0.88rem', marginBottom: '0.6rem' }}>
            Recibida: <strong>{formatMoney(sena)}</strong> en {orden.senaFormaPago ?? 'Efectivo'}{orden.senaFecha ? ` el ${fechaHora(orden.senaFecha)}` : ''} ·
            {' '}Al cobrar en el POS se descuenta: el cliente paga la diferencia.
          </p>
        )}
        {cerrada ? null : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, width: 160 }}>
              <label className="form-label">Monto</label>
              <input className="form-input" inputMode="numeric" aria-label="Monto de la seña" placeholder="0" value={senaInput} onChange={(e) => setSenaInput(soloEntero(e.target.value))} />
            </div>
            <div className="form-group" style={{ margin: 0, width: 170 }}>
              <label className="form-label">Forma de pago</label>
              <select className="form-select" aria-label="Forma de pago de la seña" value={senaForma} onChange={(e) => setSenaForma(e.target.value)}>
                {FORMAS_PAGO_SENA.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {!esNueva && (
              <button type="button" className="btn btn-secondary" disabled={guardandoSena || !senaInput || (Number(senaInput) === sena && senaForma === (orden?.senaFormaPago ?? 'Efectivo'))} onClick={() => guardarSena(senaInput)}>
                {guardandoSena ? <Loader2 size={16} className="spin" /> : <Banknote size={16} />} {sena > 0 ? 'Modificar seña' : 'Registrar seña'}
              </button>
            )}
            {!esNueva && sena > 0 && (
              <button type="button" className="btn btn-secondary" style={{ color: '#b91c1c' }} disabled={guardandoSena} onClick={() => guardarSena('0')}>Anular</button>
            )}
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexBasis: '100%' }}>
              {esNueva ? 'Si deja seña, se registra al crear la orden y entra en la caja de hoy.' : 'La seña entra en la caja del día (Cierre Z) con su forma de pago.'}
            </span>
          </div>
        )}
      </div>

      {/* Presupuesto */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3>Presupuesto</h3>
          {orden?.stockDescontado && <span style={{ fontSize: '0.8rem', color: '#1d4ed8' }}>Los repuestos ya están descontados del stock (apartados para esta orden).</span>}
          {!orden?.stockDescontado && !esNueva && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cotizar no descuenta stock: se descuenta cuando el cliente acepta.</span>}
        </div>

        {items.length === 0 && <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Todavía no hay ítems. Agregá repuestos del stock, mano de obra u otros cargos.</p>}
        {items.length > 0 && (
          <div className="table-container" style={{ margin: 0 }}>
            <table className="table" style={{ fontSize: '0.86rem' }}>
              <thead>
                <tr><th>Tipo</th><th>Descripción</th><th style={{ width: 90 }}>Cant.</th><th style={{ width: 150 }}>Precio unit. (IVA incl.)</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const cant = Number(i.cantidad) || 0;
                  const sinStock = i.tipo === 'REPUESTO' && i.stockDisponible != null && cant > i.stockDisponible;
                  return (
                    <tr key={i.key}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {i.tipo === 'REPUESTO' ? <><Package size={13} /> Repuesto</> : i.tipo === 'MANO_OBRA' ? <><Hammer size={13} /> Mano de obra</> : 'Otro'}
                      </td>
                      <td>
                        <input className="form-input" aria-label="Descripción del ítem" style={{ padding: '0.3rem 0.45rem' }} value={i.descripcion} disabled={cerrada} onChange={(e) => setItem(i.key, { descripcion: e.target.value })} />
                        {i.tipo === 'REPUESTO' && (
                          <div style={{ fontSize: '0.74rem', color: sinStock ? '#b91c1c' : 'var(--text-muted)', marginTop: 2 }}>
                            {i.codigo} · stock disponible {i.stockDisponible ?? '—'}
                            {sinStock && <> <AlertTriangle size={11} /> no alcanza: se puede cotizar igual</>}
                          </div>
                        )}
                      </td>
                      <td>
                        <input className="form-input" inputMode="numeric" aria-label={`Cantidad de ${i.descripcion}`} style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }} value={i.cantidad} disabled={cerrada}
                          onChange={(e) => setItem(i.key, { cantidad: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })} />
                      </td>
                      <td>
                        <input className="form-input" inputMode="numeric" aria-label={`Precio de ${i.descripcion}`} style={{ padding: '0.3rem 0.45rem', textAlign: 'right' }} value={i.precioUnitario} disabled={cerrada}
                          onChange={(e) => setItem(i.key, { precioUnitario: soloEntero(e.target.value) })} />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(cant * (Number(i.precioUnitario) || 0))}</td>
                      <td>
                        {!cerrada && (
                          <button type="button" className="btn btn-secondary btn-sm" aria-label={`Quitar ${i.descripcion}`} onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!cerrada && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '0.75rem' }}>
            <BuscadorRepuesto onElegir={(p) => setItems((l) => [...l, {
              key: nuevaKey(), tipo: 'REPUESTO', productoId: p.id, descripcion: p.nombre, cantidad: '1',
              precioUnitario: String(Math.round(Number(p.precioVenta) || 0)), codigo: p.codigo, stockDisponible: Number(p.stockActual),
            }])} />
            <button type="button" className="btn btn-secondary" onClick={() => setItems((l) => [...l, { key: nuevaKey(), tipo: 'MANO_OBRA', productoId: null, descripcion: 'Mano de obra', cantidad: '1', precioUnitario: '' }])}>
              <Hammer size={16} /> Mano de obra
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setItems((l) => [...l, { key: nuevaKey(), tipo: 'OTRO', productoId: null, descripcion: '', cantidad: '1', precioUnitario: '' }])}>
              <Plus size={16} /> Otro cargo
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <div style={{ minWidth: 260, fontSize: '0.92rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Repuestos</span><span>{formatMoney(totales.repuestos)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mano de obra</span><span>{formatMoney(totales.manoObra)}</span></div>
            {totales.otros > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Otros</span><span>{formatMoney(totales.otros)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', marginTop: 6, paddingTop: 6, fontSize: '1.1rem' }}>
              <strong>Total (IVA incl.)</strong><strong>{formatMoney(totales.total)}</strong>
            </div>
            {sena > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Seña recibida</span><span>−{formatMoney(sena)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Resta pagar</span><span>{formatMoney(Math.max(0, totales.total - sena))}</span></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historial */}
      {orden && (
        <div className="card">
          <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><History size={18} /> Historial</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {orden.eventos.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.86rem' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{fechaHora(e.createdAt)}</span>
                <BadgeEstado estado={e.estadoNuevo} />
                <span>{e.detalle ?? ''}</span>
                {e.usuario && <span style={{ color: 'var(--text-muted)' }}>· {e.usuario}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!cerrada && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: '1rem', background: 'var(--bg-secondary, #fff)', borderTop: '1px solid var(--border-color)',
          padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderRadius: 'var(--radius-md)',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.04)', flexWrap: 'wrap',
        }}>
          <span style={{ color: hayCambios ? '#b45309' : 'var(--text-muted)', fontSize: '0.88rem' }}>
            {esNueva ? 'Completá los datos y guardá para crear la orden.' : hayCambios ? 'Hay cambios sin guardar.' : 'Todo guardado.'}
          </span>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
            {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {esNueva ? 'Crear orden' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

function BuscadorRepuesto({ onElegir }: { onElegir: (p: ProductoBusqueda) => void }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/tenant/productos?page=1&pageSize=8&search=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      setResultados(Array.isArray(d.items) ? d.items : []);
      setAbierto(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
      <input
        className="form-input" placeholder="+ Repuesto del stock (buscar nombre o código)" value={q}
        onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) { setResultados([]); setAbierto(false); } }}
        onFocus={() => resultados.length && setAbierto(true)}
      />
      {abierto && q.trim() && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)', maxHeight: 280, overflowY: 'auto' }}>
          {resultados.length === 0 && <div style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>Sin resultados.</div>}
          {resultados.map((p) => (
            <button
              key={p.id} type="button"
              onClick={() => { onElegir(p); setQ(''); setResultados([]); setAbierto(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
            >
              <strong>{p.nombre}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {p.codigo} · stock {Number(p.stockActual)} · {formatMoney(Number(p.precioVenta))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectorCliente({ onElegir }: { onElegir: (c: ClienteLista) => void }) {
  const [clientes, setClientes] = useState<ClienteLista[] | null>(null);
  const [q, setQ] = useState('');

  const cargar = async () => {
    if (clientes) return;
    const r = await fetch('/api/tenant/clientes');
    const d = await r.json();
    const lista: ClienteLista[] = Array.isArray(d) ? d : Array.isArray(d.items) ? d.items : [];
    setClientes(lista.filter((c) => c.tipoDoc !== '99'));
  };

  const filtrados = (clientes ?? []).filter((c) => !q.trim() || `${c.razonSocial} ${c.nroDoc} ${c.telefono ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);

  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" placeholder="Buscar un cliente ya cargado (opcional)" value={q} onFocus={cargar} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && clientes && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto' }}>
          {filtrados.length === 0 && <div style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>No está cargado: escribí el nombre abajo.</div>}
          {filtrados.map((c) => (
            <button key={c.id} type="button" onClick={() => { onElegir(c); setQ(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>
              <strong>{c.razonSocial}</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {c.tipoDoc} {c.nroDoc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
