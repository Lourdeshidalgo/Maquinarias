'use client';

import { useState } from 'react';

// Selector de talles reutilizable: muestra primero los talles numéricos
// (36, 38, 40...) y debajo los alfabéticos (XS, S, M, L...). El usuario marca
// cuáles están disponibles y puede agregar talles personalizados.
//
// Selección por rango: al hacer clic en un talle, si ya hay OTRO talle elegido
// en la misma fila, se selecciona todo el rango intermedio (incluidos los
// extremos). Así, marcar "34" y luego "46" deja seleccionados 34,36,38,40,42,44,46.
// Si el clic cae sobre uno ya seleccionado, se lo deselecciona y pasa a ser el
// nuevo ancla del rango.

const TALLES_NUMERICOS = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52'];
const TALLES_ALFABETICOS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'U', 'TU'];

type Props = {
  value: string[];
  onChange: (talles: string[]) => void;
};

export default function SelectorTalles({ value, onChange }: Props) {
  // Ancla por fila: último talle clickeado en los numéricos y en los alfabéticos.
  const [anclaNum, setAnclaNum] = useState<string | null>(null);
  const [anclaAlf, setAnclaAlf] = useState<string | null>(null);

  // Aplica el clic sobre un talle: si el clic es sobre el ancla repetida o sobre
  // un talle ya seleccionado, lo quita; si hay un ancla distinta en la fila,
  // selecciona todo el rango entre ambas.
  const seleccionarTalle = (talle: string, fila: string[], ancla: string | null, setAncla: (v: string | null) => void) => {
    const idx = fila.indexOf(talle);

    // Clic sobre uno ya seleccionado => lo deselecciona y queda como nueva ancla.
    if (value.includes(talle)) {
      onChange(value.filter((t) => t !== talle));
      setAncla(talle);
      return;
    }

    // Sin ancla previa, o el ancla ya no está en esta fila: selecciona solo ese talle.
    if (!ancla || !fila.includes(ancla)) {
      onChange([...value, talle]);
      setAncla(talle);
      return;
    }

    // Con ancla previa: selecciona todo el rango entre el ancla y el nuevo talle.
    const idxAncla = fila.indexOf(ancla);
    const [a, b] = idxAncla <= idx ? [idxAncla, idx] : [idx, idxAncla];
    const rango = fila.slice(a, b + 1);
    const set = new Set(value);
    rango.forEach((t) => set.add(t));
    onChange(Array.from(set));
    setAncla(talle);
  };

  // Talles personalizados que no están en las listas predefinidas
  const personalizados = value.filter(
    (t) => !TALLES_NUMERICOS.includes(t) && !TALLES_ALFABETICOS.includes(t)
  );

  const chip = (talle: string, fila?: string[], ancla?: string | null, setAncla?: (v: string | null) => void) => {
    const activo = value.includes(talle);
    const onClick = fila && setAncla
      ? () => seleccionarTalle(talle, fila, ancla ?? null, setAncla)
      : () => (value.includes(talle) ? onChange(value.filter((t) => t !== talle)) : onChange([...value, talle]));
    return (
      <button
        key={talle}
        type="button"
        onClick={onClick}
        style={{
          padding: '0.35rem 0.7rem',
          borderRadius: '999px',
          border: `1px solid ${activo ? 'var(--primary)' : 'var(--border-color)'}`,
          backgroundColor: activo ? 'var(--primary)' : 'transparent',
          color: activo ? '#fff' : 'var(--text-main)',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          minWidth: '44px',
        }}
      >
        {talle}
      </button>
    );
  };

  return (
    <div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        Tip: marcá un talle y después otro más lejano para seleccionar todo el rango del medio de una sola vez.
      </p>
      <div style={{ marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
          Numéricos
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {TALLES_NUMERICOS.map((t) => chip(t, TALLES_NUMERICOS, anclaNum, setAnclaNum))}
        </div>
      </div>

      <div style={{ marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
          Alfabéticos
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {TALLES_ALFABETICOS.map((t) => chip(t, TALLES_ALFABETICOS, anclaAlf, setAnclaAlf))}
        </div>
      </div>

      {personalizados.length > 0 && (
        <div style={{ marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
            Otros (agregados)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>{personalizados.map((t) => chip(t))}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Otro talle (ej: 54) y Enter"
          style={{ maxWidth: '200px' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = (e.target as HTMLInputElement).value.trim();
              if (v && !value.includes(v)) onChange([...value, v]);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {value.length > 0 ? `${value.length} talle(s) seleccionado(s)` : 'Sin talles (no se pedirá talle al vender)'}
        </span>
      </div>
    </div>
  );
}
