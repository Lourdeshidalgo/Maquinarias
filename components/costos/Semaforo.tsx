// Indicador de antigüedad del costo: verde, amarillo o rojo según los días
// desde la última actualización (umbrales en Márgenes y reglas).
export const COLOR_SEMAFORO = { VERDE: '#16a34a', AMARILLO: '#d97706', ROJO: '#dc2626' } as const;
export type Semaforo = keyof typeof COLOR_SEMAFORO;

export function PuntoSemaforo({ semaforo, dias }: { semaforo: Semaforo; dias: number }) {
  return (
    <span title={`Costo actualizado hace ${dias} día${dias === 1 ? '' : 's'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_SEMAFORO[semaforo], display: 'inline-block' }} />
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{dias === 0 ? 'hoy' : `${dias} d`}</span>
    </span>
  );
}
