'use client';

import { useMemo, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { MEDIOS_ARQUEO, armarArqueo, colorDiferencia, esperadoPorMedio, textoDiferencia, type Arqueo, type MedioArqueo } from '@/lib/arqueo';

type DatosCierre = { montoInicial: number; porFormaPago?: Record<string, number>; egresosPorFormaPago?: Record<string, number> };

/**
 * Paso de arqueo antes de emitir un cierre: por cada forma de pago, lo que dice
 * el sistema y lo que se contó, con la diferencia en vivo. Obligatorio en Z.
 */
export function ModalArqueo({
  tipo, datos, emitiendo, onCancelar, onEmitir,
}: {
  tipo: 'X' | 'Z';
  datos: DatosCierre;
  emitiendo: boolean;
  onCancelar: () => void;
  onEmitir: (arqueo: { declarado: Record<MedioArqueo, number>; observaciones: string } | null) => void;
}) {
  const [contado, setContado] = useState<Record<MedioArqueo, string>>({ Efectivo: '', Transferencia: '', Tarjeta: '' });
  const [observaciones, setObservaciones] = useState('');
  const esperado = esperadoPorMedio(datos);
  const arqueo = useMemo(() => armarArqueo(datos, contado, observaciones), [datos, contado, observaciones]);
  const algoCargado = Object.values(contado).some((v) => v !== '');
  const obligatorio = tipo === 'Z';

  const emitir = () => {
    if (!arqueo) return;
    const declarado = Object.fromEntries(arqueo.filas.map((f) => [f.medio, f.declarado])) as Record<MedioArqueo, number>;
    onEmitir({ declarado, observaciones });
  };

  return (
    <div className="modal-overlay" onClick={() => !emitiendo && onCancelar()}>
      <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calculator size={20} /> Arqueo de caja · Cierre {tipo}
          </h3>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Contá lo que hay y cargalo. El sistema te muestra si cuadra con lo registrado.
            {obligatorio ? ' Es obligatorio para cerrar el día; poné 0 si no hubo movimientos de ese medio.' : ' En el Cierre X es opcional.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {MEDIOS_ARQUEO.map(({ medio, etiqueta, ayuda }) => {
              const valor = contado[medio];
              const diferencia = valor === '' ? null : (parseInt(valor, 10) || 0) - esperado[medio];
              return (
                <div
                  key={medio}
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 0.9rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <strong>{etiqueta}</strong>
                    <div style={{ fontSize: '0.88rem' }}>Según el sistema: <strong>{formatMoney(esperado[medio])}</strong></div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{ayuda}</div>
                  </div>
                  <div style={{ flex: '0 1 170px', textAlign: 'right' }}>
                    <input
                      type="text" inputMode="numeric" className="form-input" placeholder="Lo que contaste"
                      aria-label={`${etiqueta} contado`}
                      style={{ textAlign: 'right', padding: '0.4rem 0.55rem' }}
                      value={valor}
                      onChange={(e) => setContado({ ...contado, [medio]: e.target.value.replace(/\D/g, '') })}
                    />
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: 4, color: diferencia === null ? 'var(--text-muted)' : colorDiferencia(diferencia) }}>
                      {diferencia === null ? 'Sin cargar' : textoDiferencia(diferencia, formatMoney)}
                    </div>
                  </div>
                </div>
              );
            })}
            {arqueo && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 0.9rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <span>Total sistema <strong>{formatMoney(arqueo.totalEsperado)}</strong> · contado <strong>{formatMoney(arqueo.totalDeclarado)}</strong></span>
                <strong style={{ color: colorDiferencia(arqueo.diferenciaTotal) }}>{textoDiferencia(arqueo.diferenciaTotal, formatMoney)}</strong>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Observaciones (opcional)</label>
            <textarea
              className="form-input" rows={2} maxLength={500} value={observaciones}
              placeholder='Ej: "Faltan $2.000: se pagó un flete en efectivo sin cargarlo como egreso"'
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          {tipo === 'Z' && (
            <p style={{ fontSize: '0.82rem', color: '#b91c1c' }}>
              Al emitir el Cierre Z se cierra la jornada: no se pueden registrar más ventas hoy.
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={emitiendo}>Cancelar</button>
          {!obligatorio && (
            <button type="button" className="btn btn-secondary" onClick={() => onEmitir(null)} disabled={emitiendo || algoCargado}>
              Emitir sin arqueo
            </button>
          )}
          <button
            type="button" className="btn btn-primary" onClick={emitir} disabled={emitiendo || !arqueo}
            style={tipo === 'Z' ? { backgroundColor: '#dc2626', borderColor: '#dc2626' } : undefined}
            title={!arqueo ? 'Completá los tres medios (0 si no hubo)' : undefined}
          >
            {emitiendo && <Loader2 size={16} className="spin" />} Emitir Cierre {tipo}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Resumen del arqueo guardado (pantalla de cierre e impresión A4). */
export function ResumenArqueo({ arqueo, compacto = false }: { arqueo: Arqueo; compacto?: boolean }) {
  const etiqueta = (m: string) => MEDIOS_ARQUEO.find((x) => x.medio === m)?.etiqueta ?? m;
  return (
    <div style={{ fontSize: compacto ? '0.8rem' : '0.9rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.25rem 1rem', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Medio</span>
        <span style={{ fontWeight: 700, textAlign: 'right' }}>Sistema</span>
        <span style={{ fontWeight: 700, textAlign: 'right' }}>Contado</span>
        <span style={{ fontWeight: 700, textAlign: 'right' }}>Diferencia</span>
        {arqueo.filas.map((f) => (
          <div key={f.medio} style={{ display: 'contents' }}>
            <span>{etiqueta(f.medio)}</span>
            <span style={{ textAlign: 'right' }}>{formatMoney(f.esperado)}</span>
            <span style={{ textAlign: 'right' }}>{formatMoney(f.declarado)}</span>
            <strong style={{ textAlign: 'right', color: colorDiferencia(f.diferencia) }}>{textoDiferencia(f.diferencia, formatMoney)}</strong>
          </div>
        ))}
        <strong style={{ borderTop: '1px solid currentColor', paddingTop: 4 }}>Total</strong>
        <strong style={{ textAlign: 'right', borderTop: '1px solid currentColor', paddingTop: 4 }}>{formatMoney(arqueo.totalEsperado)}</strong>
        <strong style={{ textAlign: 'right', borderTop: '1px solid currentColor', paddingTop: 4 }}>{formatMoney(arqueo.totalDeclarado)}</strong>
        <strong style={{ textAlign: 'right', borderTop: '1px solid currentColor', paddingTop: 4, color: colorDiferencia(arqueo.diferenciaTotal) }}>
          {textoDiferencia(arqueo.diferenciaTotal, formatMoney)}
        </strong>
      </div>
      {arqueo.observaciones && <p style={{ marginTop: '0.5rem' }}>Obs.: {arqueo.observaciones}</p>}
    </div>
  );
}
