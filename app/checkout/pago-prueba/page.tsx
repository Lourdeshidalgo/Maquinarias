'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, ShieldCheck, CheckCircle2 } from 'lucide-react';
import LogoMark from '@/components/LogoMark';

const MONTO = 1000;

export default function PagoPruebaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [numero, setNumero] = useState('4509 9535 6623 3704');
  const [titular, setTitular] = useState('JUAN PEREZ');
  const [vencimiento, setVencimiento] = useState('11/30');
  const [cvv, setCvv] = useState('123');

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

  const handlePagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      const res = await fetch('/api/checkout/pago-prueba', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo procesar el pago de prueba.');
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2200);
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
        {success ? (
          <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
            <CheckCircle2 size={44} style={{ color: '#16a34a', margin: '0 auto 1.25rem' }} />
            <h2 style={{ marginBottom: '0.5rem' }}>¡Listo, tu cuenta está activa!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Registramos el pago de prueba por ${MONTO.toLocaleString('es-AR')}.
            </p>
            <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>Te llevamos al panel...</p>
          </div>
        ) : (
          <form onSubmit={handlePagar} className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} style={{ color: 'var(--primary)' }} /> Pago
              </h2>
              <span className="badge badge-warning">Modo prueba</span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.75rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total a pagar</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>${MONTO.toLocaleString('es-AR')}</p>
            </div>

            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Número de tarjeta</label>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="form-input"
                style={{ width: '100%', paddingRight: '2.5rem' }}
              />
              <CreditCard size={18} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>

            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Titular</label>
            <input
              value={titular}
              onChange={(e) => setTitular(e.target.value.toUpperCase())}
              className="form-input"
              style={{ width: '100%', marginBottom: '1rem' }}
            />

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Vencimiento</label>
                <input
                  value={vencimiento}
                  onChange={(e) => setVencimiento(e.target.value)}
                  placeholder="MM/AA"
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ width: '110px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CVV</label>
                <input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: '1.25rem', padding: '0.85rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '1.75rem', padding: '1rem' }}
              disabled={processing}
            >
              {processing ? 'Procesando...' : `Pagar $${MONTO.toLocaleString('es-AR')}`}
            </button>

            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Pago simulado: no se cobra dinero real.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
