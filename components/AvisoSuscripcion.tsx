'use client';

import { useState } from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';

const DIAS_ANTES_DE_AVISAR = 7;

function diasParaVencer(vencimiento?: string | null): number | null {
  if (!vencimiento) return null;
  return Math.ceil((new Date(vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function mensajeAutomatico(vencimiento?: string | null): string | null {
  const dias = diasParaVencer(vencimiento);
  if (dias === null || dias > DIAS_ANTES_DE_AVISAR) return null;

  const fecha = new Date(vencimiento as string).toLocaleDateString('es-AR');
  if (dias < 0) {
    return `Tu suscripción venció el ${fecha}. Comunicate con tu asesor para abonar y evitar la suspensión del servicio.`;
  }
  if (dias === 0) {
    return `Tu suscripción vence hoy (${fecha}). Comunicate con tu asesor para abonar y evitar la suspensión del servicio.`;
  }
  return `Tu suscripción vence el ${fecha} (en ${dias} día${dias === 1 ? '' : 's'}). Comunicate con tu asesor para abonar y evitar la suspensión del servicio.`;
}

export default function AvisoSuscripcion({ empresa }: { empresa: any }) {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  if (!empresa) return null;

  const mensaje = (empresa.mensajeAviso && empresa.mensajeAviso.trim())
    ? empresa.mensajeAviso.trim()
    : mensajeAutomatico(empresa.suscripcion?.vencimiento);

  if (!mensaje) return null;

  const dias = diasParaVencer(empresa.suscripcion?.vencimiento);
  const porVencer = dias !== null && dias <= DIAS_ANTES_DE_AVISAR;
  const puedePagarOnline = porVencer && !!empresa.suscripcion?.planId && !empresa.suscripcion?.mpActivo;

  const handlePagar = async () => {
    setPaying(true);
    setPayError('');
    try {
      const res = await fetch('/api/checkout/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: empresa.suscripcion.planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el pago.');
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setPayError(err.message);
      setPaying(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.85rem 1rem',
        backgroundColor: '#fef3c7',
        color: '#92400e',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '1.5rem',
        fontSize: '0.9rem',
        flexWrap: 'wrap',
      }}
    >
      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <div style={{ flex: '1 1 260px' }}>
        <span>{mensaje}</span>
        {payError && <div style={{ color: '#b91c1c', marginTop: '0.35rem' }}>{payError}</div>}
      </div>
      {puedePagarOnline && (
        <button
          onClick={handlePagar}
          disabled={paying}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <CreditCard size={14} />
          {paying ? 'Redirigiendo...' : 'Pagar con Mercado Pago'}
        </button>
      )}
    </div>
  );
}
