'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';
import LogoMark from '@/components/LogoMark';

const MAX_ATTEMPTS = 20;
const INTERVAL_MS = 2000;

export default function CheckoutFeedbackPage() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'active' | 'timeout'>('checking');

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      attempts += 1;
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();

        if (!data.authenticated) {
          router.push('/login');
          return;
        }

        if (data.user?.empresa?.estado === 'ACTIVO') {
          if (cancelled) return;
          setState('active');
          timer = setTimeout(() => router.push('/dashboard'), 1800);
          return;
        }
      } catch {
        // Reintenta en el próximo ciclo.
      }

      if (attempts >= MAX_ATTEMPTS) {
        if (!cancelled) setState('timeout');
        return;
      }
      timer = setTimeout(() => {
        if (!cancelled) check();
      }, INTERVAL_MS);
    }

    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      <header className="navbar" style={{ padding: '0 3rem' }}>
        <div className="sidebar-logo" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LogoMark size={22} /> Molux
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem 2rem', textAlign: 'center' }}>
          {state === 'checking' && (
            <>
              <Loader2 size={44} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 1.25rem' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>Confirmando tu pago</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Estamos esperando la confirmación de Mercado Pago. Esto suele tardar unos segundos, no cierres esta página.
              </p>
            </>
          )}

          {state === 'active' && (
            <>
              <CheckCircle2 size={44} style={{ color: '#16a34a', margin: '0 auto 1.25rem' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>¡Listo, tu cuenta está activa!</h2>
              <p style={{ color: 'var(--text-muted)' }}>Te llevamos al panel en un instante.</p>
            </>
          )}

          {state === 'timeout' && (
            <>
              <Clock size={44} style={{ color: '#d97706', margin: '0 auto 1.25rem' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>Todavía no vemos la confirmación</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                A veces Mercado Pago tarda unos minutos en avisarnos. Si ya pagaste, tu cuenta se activa sola apenas llegue la confirmación.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  Volver a verificar
                </button>
                <Link href="/dashboard" className="btn btn-secondary">
                  Ir al panel
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
