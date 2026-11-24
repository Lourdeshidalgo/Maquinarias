'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { seccionActiva, seccionesVisibles } from '@/lib/navegacion';

// Pestañas de la sección actual (ej. Productos: Catálogo · Stock · Repuestos · Edición rápida).
// Solo se muestran si la sección tiene más de una pantalla para este usuario.
export default function PestanasSeccion({ rol, moduloCostos }: { rol?: string | null; moduloCostos?: boolean | null }) {
  const pathname = usePathname();
  const activa = seccionActiva(pathname, seccionesVisibles({ rol, moduloCostos }));
  if (!activa || activa.seccion.pestanas.length < 2) return null;
  return (
    <nav aria-label={activa.seccion.nombre} style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
      {activa.seccion.pestanas.map((p) => {
        const actual = p.href === activa.pestana.href;
        return (
          <Link
            key={p.href} href={p.href} aria-current={actual ? 'page' : undefined}
            style={{
              padding: '0.55rem 0.9rem', fontSize: '0.92rem', fontWeight: actual ? 600 : 500, textDecoration: 'none',
              color: actual ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${actual ? 'var(--primary)' : 'transparent'}`, marginBottom: -1,
            }}
          >
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
