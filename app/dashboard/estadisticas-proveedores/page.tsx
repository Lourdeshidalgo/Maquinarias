'use client';

import { useState, useEffect } from 'react';
import { Award, Search, Filter, Loader2 } from 'lucide-react';

function formatMoney(value: number) {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

export default function EstadisticasProveedoresPage() {
  const [periodo, setPeriodo] = useState('mes');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/tenant/estadisticas/proveedores?periodo=${periodo}`;
      if (periodo === 'personalizado' && desde && hasta) {
        url = `/api/tenant/estadisticas/proveedores?periodo=personalizado&desde=${desde}&hasta=${hasta}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar estadísticas de proveedores.');
      const d = await res.json();
      setData(d);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [periodo, desde, hasta]);

  const formatDateRange = (rango?: any) => {
    if (!rango) return '';
    const desdeVal = new Date(rango.desde).toLocaleDateString('es-AR');
    const hastaVal = new Date(rango.hasta).toLocaleDateString('es-AR');
    if (desdeVal === hastaVal) return desdeVal;
    return `${desdeVal} — ${hastaVal}`;
  };

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Calculando ranking de proveedores...<Loader2 size={18} className="spin" style={{ marginLeft: '0.5rem' }} /></p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={26} style={{ color: 'var(--primary)' }} />
            <span>Ranking de Proveedores</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Proveedores rankeados por unidades vendidas en el período seleccionado.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: '200px', padding: '0.5rem 0.75rem' }}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="mes">Últimos 30 días</option>
            <option value="semana">Últimos 7 días</option>
            <option value="trimestre">Últimos 90 días</option>
            <option value="anio">Últimos 365 días</option>
            <option value="todos">Historial Completo</option>
            <option value="personalizado">Personalizado...</option>
          </select>
          <button onClick={loadData} className="btn btn-secondary btn-sm" title="Actualizar">
            <Loader2 size={16} className="spin" />
          </button>
        </div>
      </div>

      {periodo === 'personalizado' && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={!desde || !hasta} onClick={loadData}>
            Calcular
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {!data ? null : (
        <>
          <div className="grid-stats">
            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                <Award size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Total unidades vendidas</span>
                <span className="stat-value">{data.totalUnidades?.toLocaleString('es-AR') || 0}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatDateRange(data.rango)}</span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
                <Search size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Proveedores con ventas</span>
                <span className="stat-value">{data.ranking?.length || 0}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{data.totalUnidades > 0 ? 'con movimiento' : 'sin movimiento'}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Filter size={18} style={{ color: 'var(--primary)' }} />
                Ranking por unidades vendidas
              </h3>
            </div>

            {(data.ranking?.length ?? 0) === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
                No hay ventas registradas en este período para generar el ranking.
              </p>
            ) : (
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Proveedor</th>
                      <th style={{ textAlign: 'right' }}>Unidades Vendidas</th>
                      <th style={{ textAlign: 'right' }}>%</th>
                      <th style={{ textAlign: 'right' }}>Monto Facturado</th>
                      <th style={{ textAlign: 'center' }}>Productos Destacados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ranking.map((prov: any, idx: number) => (
                      <tr key={prov.id}>
                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{prov.nombre}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{prov.unidadesVendidas.toLocaleString('es-AR')}</td>
                        <td style={{ textAlign: 'right' }}>{prov.porcentaje?.toFixed(1) || 0}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                          {formatMoney(prov.montoTotal || 0)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {prov.productos?.length > 0 ? (
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              {prov.productos.length} producto{prov.productos.length !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detalle por proveedor con sus productos */}
          <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {(data.ranking || []).slice(0, 5).map((prov: any) => (
              <div key={prov.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header">
                  <h4 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    #{prov.id.slice(-4)} {prov.nombre}
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {prov.porcentaje?.toFixed(1) || 0}%
                    </span>
                  </h4>
                </div>
                <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span>Unidades vendidas</span>
                    <strong>{prov.unidadesVendidas}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', padding: '0.5rem 0' }}>
                    <span>Monto facturado</span>
                    <strong style={{ color: 'var(--primary)' }}>{formatMoney(prov.montoTotal || 0)}</strong>
                  </div>
                  {(prov.productos?.length ?? 0) > 0 ? (
                    <>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', marginTop: '0.5rem' }}>Productos más vendidos de este proveedor:</p>
                      {prov.productos.slice(0, 3).map((p: any) => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', gap: '1rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{p.nombre}</span>
                          <span>{p.cantidad.toLocaleString('es-AR')} u.</span>
                        </div>
                      ))}
                      {prov.productos.length > 3 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                          ...y {prov.productos.length - 3} producto{prov.productos.length - 3 !== 1 ? 's' : ''} más
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
                      Sin productos detallados
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
