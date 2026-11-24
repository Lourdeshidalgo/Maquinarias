'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { Desglose, FactorCosto } from '@/lib/costos';

// Muestra la cuenta del precio de venta como en el Excel del cliente:
//   lista × descuentos × IVA × dólar = costo  →  × ganancia = precio de venta.

const num = (v: number, dec = 2) => v.toLocaleString('es-AR', { maximumFractionDigits: dec });

/** Un factor como se escribe en la fórmula: × 0,75 · × 1,21 · ÷ 1,21 · × 1.608 */
function textoFactor(f: FactorCosto) {
  if (f.tipo === 'iva' && f.valor < 1) return `÷ ${num(1 / f.valor)}`;
  return `× ${num(f.valor, f.tipo === 'dolar' ? 2 : 4)}`;
}

function Factor({ texto, etiqueta, destacado }: { texto: string; etiqueta: string; destacado?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: '0 0.15rem' }}>
      <strong style={{ fontSize: '1rem', color: destacado ? 'var(--primary)' : undefined }}>{texto}</strong>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{etiqueta}</span>
    </span>
  );
}

/** lista × 0,75 × 0,85 × 1,21 × 1.608 × 1,5 (con la etiqueta de cada número debajo). */
export function FormulaEnLinea({ lista, factores, ganancia }: { lista: string; factores: FactorCosto[]; ganancia: { factor: number; porcentaje: number } }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.2rem 0.1rem' }}>
      <Factor texto={lista} etiqueta="precio de lista" />
      {factores.map((f, i) => (
        <Factor key={i} texto={textoFactor(f)} etiqueta={f.detalle} />
      ))}
      <Factor texto={`× ${num(ganancia.factor)}`} etiqueta={`ganancia ${num(ganancia.porcentaje)}%`} destacado />
    </div>
  );
}

/** Los montos de cada etapa: costo → (+ envío) → precio → redondeo → crédito. */
export function MontosDesglose({ d, envio, factorGanancia }: { d: Desglose; envio: number; factorGanancia: number }) {
  if (d.costo === null) return <p style={{ color: '#b91c1c' }}>Falta cargar el dólar de este proveedor: sin dólar no se puede calcular el costo en pesos.</p>;
  const filas: [string, string][] = [['Costo', formatMoney(d.costo)]];
  if (envio) filas.push(['+ envío y packaging', `${formatMoney(envio)} = ${formatMoney(d.costoReal ?? 0)}`]);
  filas.push([`× ${num(factorGanancia)} (ganancia)`, formatMoney(d.precioSinRedondeo ?? 0)]);
  if (d.precio !== d.precioSinRedondeo) filas.push(['Redondeado', formatMoney(d.precio ?? 0)]);
  return (
    <table style={{ fontSize: '0.88rem', borderCollapse: 'collapse', marginTop: '0.4rem' }}>
      <tbody>
        {filas.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: '0.1rem 0.75rem 0.1rem 0', color: 'var(--text-muted)' }}>{k}</td>
            <td style={{ padding: '0.1rem 0', textAlign: 'right' }}>{v}</td>
          </tr>
        ))}
        <tr>
          <td style={{ padding: '0.25rem 0.75rem 0 0' }}><strong>Precio de venta</strong></td>
          <td style={{ padding: '0.25rem 0 0', textAlign: 'right' }}><strong>{formatMoney(d.precio ?? 0)}</strong></td>
        </tr>
        <tr>
          <td style={{ padding: '0.1rem 0.75rem 0 0', color: 'var(--text-muted)' }}>Con tarjeta de crédito</td>
          <td style={{ padding: '0.1rem 0', textAlign: 'right' }}>{formatMoney(d.precioCredito ?? 0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const listaTexto = (l: { costoLista: number; moneda: string }) => (l.moneda === 'USD' ? `US$ ${num(l.costoLista)}` : formatMoney(l.costoLista));
const caja: React.CSSProperties = { border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', background: 'var(--bg-tertiary)' };

type RespProveedor = {
  proveedor: { nombre: string };
  moneda: string;
  dolar: number | null;
  ganancia: { valor: number; origen: string };
  formula: { factoresCosto: FactorCosto[]; factorGanancia: number };
  ejemplo: null | {
    producto: { codigo: string; nombre: string };
    lista: { costoLista: number; moneda: string };
    ganancia: { valor: number; nivel: string; origen: string };
    desglose: Desglose;
  };
};

/** Fórmula de un proveedor con los valores que se están editando y un producto suyo de ejemplo. */
export function FormulaProveedor({ proveedorId, ganancia, bonificaciones, dolar }: { proveedorId: string; ganancia: string; bonificaciones: string; dolar: string }) {
  const [r, setR] = useState<RespProveedor | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ proveedorId, ganancia, bonificaciones, dolar });
      try {
        const res = await fetch(`/api/tenant/costos/desglose?${qs}`);
        const d = await res.json();
        if (!vigente) return;
        if (!res.ok) throw new Error(d.error);
        setR(d);
        setError('');
      } catch (e) {
        if (vigente) setError((e as Error).message || 'No se pudo calcular.');
      }
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [proveedorId, ganancia, bonificaciones, dolar]);

  if (error) return <div style={{ ...caja, color: '#b91c1c' }}>{error}</div>;
  if (!r) return <div style={caja}><Loader2 size={16} className="spin" /></div>;
  const ej = r.ejemplo;
  return (
    <div style={caja} aria-live="polite">
      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Así se calcula el precio de {r.proveedor.nombre}</div>
      <FormulaEnLinea
        lista={r.moneda === 'USD' ? 'lista US$' : 'lista $'}
        factores={r.formula.factoresCosto}
        ganancia={{ factor: r.formula.factorGanancia, porcentaje: r.ganancia.valor }}
      />
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
        Ganancia {num(r.ganancia.valor)}% ({r.ganancia.origen}).
        {r.moneda === 'USD' && !r.dolar && <span style={{ color: '#b91c1c' }}> Falta el dólar de este proveedor.</span>}
      </div>
      {ej && (
        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
          <div style={{ fontSize: '0.85rem' }}>
            Ejemplo: <strong>{ej.producto.nombre}</strong> <span style={{ color: 'var(--text-muted)' }}>({ej.producto.codigo})</span>, lista {listaTexto(ej.lista)}
          </div>
          {ej.ganancia.nivel !== 'PROVEEDOR' && ej.ganancia.valor !== r.ganancia.valor && (
            <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
              Este producto gana {num(ej.ganancia.valor)}% ({ej.ganancia.origen}), que tiene prioridad sobre la del proveedor.
            </div>
          )}
          <MontosDesglose d={ej.desglose} envio={(ej.desglose.costoReal ?? 0) - (ej.desglose.costo ?? 0)} factorGanancia={ej.desglose.factorGanancia} />
        </div>
      )}
    </div>
  );
}

type RespProducto = {
  proveedor: { nombre: string } | null;
  lista: { costoLista: number; moneda: string } | null;
  costoEnvio: number;
  costoPackaging: number;
  ganancia: { valor: number; nivel: string; origen: string };
  desglose: Desglose;
};

/** "Cómo se calcula" el precio de un producto, con la ganancia que le toca y de dónde sale. */
export function DesgloseProducto({ productoId, recargar }: { productoId: string; recargar?: unknown }) {
  const [r, setR] = useState<RespProducto | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vigente = true;
    fetch(`/api/tenant/costos/desglose?productoId=${encodeURIComponent(productoId)}`)
      .then(async (res) => {
        const d = await res.json();
        if (!vigente) return;
        if (!res.ok) throw new Error(d.error);
        setR(d);
      })
      .catch((e) => vigente && setError((e as Error).message || 'No se pudo calcular.'));
    return () => {
      vigente = false;
    };
  }, [productoId, recargar]);

  if (error) return null; // sin módulo de costos o sin datos: no se muestra
  if (!r) return <div style={caja}><Loader2 size={16} className="spin" /></div>;
  return (
    <div style={caja}>
      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
        Cómo se calcula{r.proveedor ? ` (lista de ${r.proveedor.nombre})` : ' (costo cargado a mano)'}
      </div>
      <FormulaEnLinea
        lista={r.lista ? listaTexto(r.lista) : formatMoney(r.desglose.costo ?? 0)}
        factores={r.desglose.factoresCosto}
        ganancia={{ factor: r.desglose.factorGanancia, porcentaje: r.ganancia.valor }}
      />
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
        Ganancia {num(r.ganancia.valor)}% ({r.ganancia.origen}). Se cambia en Proveedores, en "Ganancia y precios" o acá en la ganancia propia del producto.
      </div>
      <MontosDesglose d={r.desglose} envio={r.costoEnvio + r.costoPackaging} factorGanancia={r.desglose.factorGanancia} />
    </div>
  );
}
