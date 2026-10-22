'use client';

// Selector de talles reutilizable: muestra primero los talles numéricos
// (36, 38, 40...) y debajo los alfabéticos (XS, S, M, L...). El usuario marca
// cuáles están disponibles y puede agregar talles personalizados.

const TALLES_NUMERICOS = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52'];
const TALLES_ALFABETICOS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'U', 'TU'];

type Props = {
  value: string[];
  onChange: (talles: string[]) => void;
};

export default function SelectorTalles({ value, onChange }: Props) {
  const toggle = (talle: string) => {
    if (value.includes(talle)) {
      onChange(value.filter((t) => t !== talle));
    } else {
      onChange([...value, talle]);
    }
  };

  // Talles personalizados que no están en las listas predefinidas
  const personalizados = value.filter(
    (t) => !TALLES_NUMERICOS.includes(t) && !TALLES_ALFABETICOS.includes(t)
  );

  const chip = (talle: string) => {
    const activo = value.includes(talle);
    return (
      <button
        key={talle}
        type="button"
        onClick={() => toggle(talle)}
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
      <div style={{ marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
          Numéricos
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {TALLES_NUMERICOS.map(chip)}
        </div>
      </div>

      <div style={{ marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
          Alfabéticos
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {TALLES_ALFABETICOS.map(chip)}
        </div>
      </div>

      {personalizados.length > 0 && (
        <div style={{ marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
            Otros (agregados)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>{personalizados.map(chip)}</div>
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
