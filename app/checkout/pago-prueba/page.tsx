'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import LogoMark from '@/components/LogoMark';

const MONTO = 1000;

export default function PagoPruebaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!data.authenticated) {
          router.push('/login');
          return;
        }
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handlePagar = async () => {
    setError('');
    setProcessing(true);

    try {
      const res = await fetch('/api/checkout/pago-prueba', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar el pago.');
      }

      // Redirige al checkout de Mercado Pago.
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      <header className="navbar" style={{ padding: '0 3rem' }}>
        <div className="sidebar-logo" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LogoMark size={22} /> Molux
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} style={{ color: 'var(--primary)' }} /> Pago
            </h2>
            <span className="badge badge-warning">Prueba · Mercado Pago</span>
          </div>

          <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total a pagar</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>${MONTO.toLocaleString('es-AR')}</p>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Al continuar te vamos a redirigir a <strong>Mercado Pago</strong> para completar el pago de forma segura.
            Al acreditarse, tu cuenta se activa automáticamente.
          </p>

          {error && (
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            onClick={handlePagar}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            disabled={processing}
          >
            {processing ? 'Redirigiendo a Mercado Pago...' : <> Pagar $${MONTO.toLocaleString('es-AR')} con Mercado Pago <ExternalLink size={16} /></>}
          </button>
        </div>
      </main>
    </div>
  );
}
