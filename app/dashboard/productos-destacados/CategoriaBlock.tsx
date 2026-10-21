'use client';

import { useState } from 'react';
import { TrendingUp, Award, Star, Flame, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

export type RankingProducto = {
  productoId: string;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioVenta: number;
  stockActual: number;
  imagenUrl: string | null;
  unidadesVendidas: number;
  montoVendido: number;
};

export type VentaDetalleCategoria = {
  ventaId: string;
  fecha: string;
  tipoComprobante: string;
  numero: string;
  cliente: string;
  estadoVenta: string;
  unidadesCategoria: number;
  montoCategoria: number;
  productos: Array<{ nombre: string; cantidad: number; unidad: string }>;
};

export type CategoriaDestacada = {
  categoria: string;
  unidades: number;
  porcentaje: number;
  productosTop: RankingProducto[];
  ventasDetalle: VentaDetalleCategoria[];
  cantidadVentas: number;
};

function formatQty(value: number, unidad: string) {
  return `${value.toFixed(3).replace(/\.?0+$/, '')} ${unidad}`;
}

function formatFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-AR');
  } catch {
    return iso;
  }
}

const RANK_COLORS = ['var(--primary)', '#f59e0b', '#64748b'];

export default function CategoriaBlock({
  categoria,
  unidades,
  porcentaje,
  rank,
  productosTop,
  ventasDetalle,
  cantidadVentas,
}: {
  categoria: string;
  unidades: number;
  porcentaje: number;
  rank: number;
  productosTop: RankingProducto[];
  ventasDetalle: VentaDetalleCategoria[];
  cantidadVentas: number;
}) {
  const [showDetalle, setShowDetalle] = useState(false);
  const borderColor = RANK_COLORS[rank] || RANK_COLORS[2];
  const isTop = rank === 0;

  return (
    <div className="card" style={{ marginBottom: '1.5rem', borderLeft: `4px solid ${borderColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            flex: '0 0 auto',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isTop ? 'var(--primary-light)' : '#f8fafc',
            color: borderColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {isTop ? <Flame size={28} /> : <TrendingUp size={28} />}
          <span
            style={{
              position: 'absolute',
              bottom: '-6px',
              right: '-6px',
              backgroundColor: borderColor,
              color: 'white',
              borderRadius: '999px',
              padding: '0.1rem 0.45rem',
              fontSize: '0.7rem',
              fontWeight: 700,
            }}
          >
            #{rank + 1}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
            }}
          >
            Top {rank + 1} — Categoría más vendida (últimos 30 días)
          </span>
          <h3 style={{ fontSize: '1.5rem', margin: '0.15rem 0 0' }}>{categoria}</h3>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            {formatQty(unidades, 'unidades')} vendidas • {porcentaje.toFixed(0)}% del total • {cantidadVentas}{' '}
            {cantidadVentas === 1 ? 'venta' : 'ventas'}
          </span>
        </div>
        {ventasDetalle.length > 0 && (
          <button
            onClick={() => setShowDetalle(!showDetalle)}
            className="btn btn-secondary btn-sm"
            style={{ flex: '0 0 auto' }}
          >
            <FileText size={14} />
            <span>Ver detalle de ventas ({cantidadVentas})</span>
            {showDetalle ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            display: 'block',
            marginBottom: '0.75rem',
          }}
        >
          Lo más vendido en {categoria}
        </span>
        <div className="pos-products-grid">
          {productosTop.map((p, idx) => (
            <div key={p.productoId} className="card pos-product-card" style={{ cursor: 'default', margin: 0 }}>
              <div>
                {p.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagenUrl}
                    alt={p.nombre}
                    style={{
                      width: '100%',
                      height: '70px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '0.5rem',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '70px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.5rem',
                      position: 'relative',
                    }}
                  >
                    {idx === 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          backgroundColor: borderColor,
                          color: 'white',
                          borderRadius: '999px',
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                        }}
                      >
                        Nº1
                      </span>
                    )}
                    sin foto
                  </div>
                )}
                <strong
                  style={{
                    fontSize: '0.95rem',
                    display: 'block',
                    height: '40px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.nombre}
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{p.codigo}</span>
              </div>
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: borderColor, display: 'block' }}>
                  ${p.precioVenta.toLocaleString('es-AR')}
                </span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    marginTop: '0.35rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    backgroundColor: isTop ? 'var(--primary-light)' : '#f1f5f9',
                    color: borderColor,
                  }}
                >
                  <Star size={12} />
                  {p.unidad === 'unidad'
                    ? `${p.unidadesVendidas.toLocaleString('es-AR')} ${p.unidadesVendidas === 1 ? 'vendida' : 'vendidas'}`
                    : `${formatQty(p.unidadesVendidas, p.unidad)} vendidas`}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
                  Stock: {p.stockActual.toFixed(3).replace(/\.?0+$/, '')} {p.unidad}
                </span>
              </div>
            </div>
          ))}
          {productosTop.length === 0 && (
            <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No se encontraron productos vendidos en esta categoría.
            </p>
          )}
        </div>
      </div>

      {showDetalle && ventasDetalle.length > 0 && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>
            Ventas que incluyen {categoria}
          </span>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Cliente</th>
                  <th>Productos de esta categoría</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ventasDetalle.map((v) => (
                  <tr key={v.ventaId}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatFecha(v.fecha)}</td>
                    <td>
                      <span className="badge badge-secondary" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        {v.tipoComprobante} {v.numero}
                      </span>
                    </td>
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.cliente}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                        {v.productos.map((prod, i) => (
                          <span key={i} style={{ color: 'var(--text-muted)' }}>
                            • {prod.nombre} ({prod.cantidad.toFixed(3).replace(/\.?0+$/, '')} {prod.unidad})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {v.unidadesCategoria.toFixed(3).replace(/\.?0+$/, '')}
                    </td>
                    <td style={{ textAlign: 'right' }}>${v.montoCategoria.toLocaleString('es-AR')}</td>
                    <td style={{ textAlign: 'center' }}>
                      <a
                        href={`/dashboard/ventas/${v.ventaId}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.35rem 0.6rem' }}
                      >
                        <ExternalLink size={13} />
                        <span>Ver comprobante</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
