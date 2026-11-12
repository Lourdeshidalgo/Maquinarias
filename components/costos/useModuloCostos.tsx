'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

// Estado del módulo "Costos y listas de proveedores" para la empresa activa.
// Las APIs igual lo validan; esto es para mostrar un aviso en vez de errores.
export function useModuloCostos() {
  const [estado, setEstado] = useState<{ cargando: boolean; activo: boolean; esDueno: boolean; empresaId: string | null }>({
    cargando: true,
    activo: false,
    esDueno: false,
    empresaId: null,
  });

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) =>
        setEstado({
          cargando: false,
          activo: !!d?.user?.empresa?.moduloCostos,
          esDueno: d?.user?.rol === 'OWNER',
          empresaId: d?.user?.empresa?.id ?? null,
        })
      )
      .catch(() => setEstado({ cargando: false, activo: false, esDueno: false, empresaId: null }));
  }, []);

  return estado;
}

export function ModuloCostosInactivo() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
      <Lock size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
      <h3 style={{ marginBottom: '0.5rem' }}>Módulo no habilitado</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        El módulo de costos y listas de proveedores no está activo para tu comercio.
      </p>
      <Link href="/dashboard" className="btn btn-secondary">
        Volver al panel
      </Link>
    </div>
  );
}
