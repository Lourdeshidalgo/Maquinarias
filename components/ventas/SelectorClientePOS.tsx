'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, UserRound, X } from 'lucide-react';

export type ClientePOS = {
  id: string; razonSocial: string; tipoDoc: string; nroDoc: string;
  codigo?: number | null; celular?: string | null; telefono?: string | null; localidad?: string | null; condicionIva?: string;
};

const esGenerico = (c: ClientePOS | null) => !!c && c.tipoDoc === '99' && c.nroDoc === '0';

// Cliente de la venta: muestra el elegido y permite buscar entre miles de clientes
// (la búsqueda va al servidor). Sin elegir nada, la venta sale a Consumidor Final.
export default function SelectorClientePOS({
  cliente, generico, onElegir, disabled,
}: { cliente: ClientePOS | null; generico: ClientePOS | null; onElegir: (c: ClientePOS) => void; disabled?: boolean }) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ClientePOS[] | null>(null);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/tenant/clientes?page=1&pageSize=10&search=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setResultados((Array.isArray(d.items) ? (d.items as ClientePOS[]) : []).filter((c) => !esGenerico(c)));
        setActivo(0);
      } catch {
        setResultados([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const abrir = () => {
    if (disabled) return;
    setBuscando(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const cerrar = () => { setBuscando(false); setQ(''); setResultados(null); };
  const elegir = (c: ClientePOS) => { onElegir(c); cerrar(); };

  const detalle = (c: ClientePOS) =>
    [
      c.codigo != null ? `N° ${c.codigo}` : null,
      c.tipoDoc !== '99' ? `${c.tipoDoc} ${c.nroDoc}` : null,
      c.celular || c.telefono || null,
      c.localidad || null,
    ].filter(Boolean).join(' · ');

  if (!buscando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button" onClick={abrir} disabled={disabled} aria-label="Cambiar cliente"
          className="form-select" style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}
        >
          <UserRound size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente?.razonSocial ?? 'Consumidor Final'}</strong>
            {cliente && !esGenerico(cliente) && detalle(cliente) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{detalle(cliente)}</span>
            )}
          </span>
        </button>
        {cliente && generico && !esGenerico(cliente) && !disabled && (
          <button type="button" className="btn btn-secondary btn-sm" title="Volver a Consumidor Final" aria-label="Volver a Consumidor Final" onClick={() => onElegir(generico)}>
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          ref={inputRef} className="form-input" style={{ paddingLeft: 30 }} value={q} aria-label="Buscar cliente"
          placeholder="Nombre, N° de cliente, DNI/CUIT o teléfono"
          onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setResultados(null); }}
          onBlur={() => setTimeout(cerrar, 150)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cerrar();
            if (!resultados?.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); elegir(resultados[activo]); }
          }}
        />
      </div>
      <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 320, overflowY: 'auto' }}>
        {generico && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(generico)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary, #f8fafc)', cursor: 'pointer' }}>
            <strong>Consumidor Final</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>· sin identificar</span>
          </button>
        )}
        {!q.trim() && <div style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Escribí para buscar…</div>}
        {q.trim() && resultados?.length === 0 && <div style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin resultados. Podés cargarlo en Clientes.</div>}
        {resultados?.map((c, i) => (
          <button
            key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(c)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: i === activo ? 'var(--primary-light, #eef2ff)' : 'transparent', cursor: 'pointer' }}
          >
            <strong>{c.razonSocial}</strong>
            {detalle(c) && <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.76rem' }}>{detalle(c)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
