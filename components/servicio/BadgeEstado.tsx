import { infoEstado } from '@/lib/servicio/estados';

// Etiqueta de color con el estado de una orden de servicio técnico.
export function BadgeEstado({ estado }: { estado: string }) {
  const e = infoEstado(estado);
  return (
    <span style={{ background: e.fondo, color: e.color, fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {e.etiqueta}
    </span>
  );
}
