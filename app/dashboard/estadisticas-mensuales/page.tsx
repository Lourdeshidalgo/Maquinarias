'use client';

import { useState, useEffect } from 'react';
import { formatMoney } from '@/lib/format';

import { TrendingUp, Wallet, HandCoins, Percent, Banknote, Loader2 } from 'lucide-react';

export default function EstadisticasMensualesPage() {
  const [meses, setMeses] = useState<number>(12);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tenant/estadisticas/mensuales?meses=${meses}`);
      if (!res.ok) throw new Error('Error al cargar estadísticas mensuales.');
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
  }, [meses]);

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Calculando estadísticas mensuales...<Loader2 size={18} className="spin" style={{ marginLeft: '0.5rem' }} /></p>;
  }

  if (!data) return null;

  // Valores máximos para escalar barras
  const maxFacturacion = Math.max(...data.meses.map((m: any) => m.facturacion), 1);
  const maxGananciaBruta = Math.max(...data.meses.map((m: any) => m.gananciaBruta), 1);
  const maxGananciaNeta = Math.max(...data.meses.map((m: any) => m.gananciaNeta), 1);
  const maxEgresos = Math.max(...data.meses.map((m: any) => m.egresos), 1);

  const barWidth = (valor: number, maximo: number) => `${Math.max(2, (valor / maximo) * 100)}%`;

  const isPositive = (v: number) => v >= 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={26} style={{ color: 'var(--primary)' }} />
            <span>Estadísticas Mensuales</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Evolución mes a mes: facturación, costo de productos vendidos y ganancias. Datos calculados a partir de ventas y egresos reales.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            className="form-select"
            style={{ width: '150px', padding: '0.5rem 0.75rem' }}
            value={meses}
            onChange={(e) => setMeses(parseInt(e.target.value, 10))}
          >
            <option value="6">Últimos 6 meses</option>
            <option value="12">Últimos 12 meses</option>
            <option value="18">Últimos 18 meses</option>
            <option value="24">Últimos 24 meses</option>
          </select>
          <button onClick={loadData} className="btn btn-secondary btn-sm" title="Actualizar">
            <Loader2 size={16} className="spin" />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs globales */}
      <div className="grid-stats" style={{ marginBottom: '2rem' }}>
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Wallet size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Facturación total (período)</span>
            <span className="stat-value">{formatMoney(data.totales.facturacion)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Últimos {data.meses.length} meses</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
            <HandCoins size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Costo de productos vendidos</span>
            <span className="stat-value">{formatMoney(data.totales.costoProductos)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>COGS acumulado</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: isPositive(data.totales.gananciaBruta) ? '#dcfce7' : '#fee2e2', color: isPositive(data.totales.gananciaBruta) ? '#15803d' : '#b91c1c' }}>
            <Percent size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Ganancia bruta total</span>
            <span className="stat-value" style={{ color: isPositive(data.totales.gananciaBruta) ? '#15803d' : '#b91c1c' }}>
              {formatMoney(data.totales.gananciaBruta)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{data.totales.facturacion > 0 ? ((data.totales.gananciaBruta / data.totales.facturacion) * 100).toFixed(1) + '% margen' : 'sin facturación'}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: isPositive(data.totales.gananciaNeta) ? '#dcfce7' : '#fee2e2', color: isPositive(data.totales.gananciaNeta) ? '#15803d' : '#b91c1c' }}>
            <Banknote size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Ganancia neta total</span>
            <span className="stat-value" style={{ color: isPositive(data.totales.gananciaNeta) ? '#15803d' : '#b91c1c' }}>
              {formatMoney(data.totales.gananciaNeta)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{isPositive(data.totales.gananciaNeta) ? 'rentable' : 'pérdida acumulada'}</span>
          </div>
        </div>
      </div>

      {/* Tabla + Gráficos por mes */}
      <div className="responsive-2col" style={{ display: 'grid', ['--cols' as any]: '1fr 1.4fr', gap: '1.5rem' }}>
        {/* Tabla detallada */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Detalle por mes</h3>
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: 'right' }}>Facturación</th>
                  <th style={{ textAlign: 'right' }}>Costo Productos</th>
                  <th style={{ textAlign: 'right' }}>Ganancia Bruta</th>
                  <th style={{ textAlign: 'right' }}>Egresos</th>
                  <th style={{ textAlign: 'right' }}>Ganancia Neta</th>
                </tr>
              </thead>
              <tbody>
                {data.meses.map((m: any) => (
                  <tr key={m.clave}>
                    <td style={{ fontWeight: 600 }}>{m.etiqueta}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(m.facturacion)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(m.costoProductos)}</td>
                    <td style={{ textAlign: 'right', color: isPositive(m.gananciaBruta) ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                      {formatMoney(m.gananciaBruta)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(m.egresos)}</td>
                    <td style={{ textAlign: 'right', color: isPositive(m.gananciaNeta) ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                      {formatMoney(m.gananciaNeta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gráficos de barras simples con CSS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Comparativa mensual</h3>
          </div>
          <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {data.meses.map((m: any) => (
              <div key={m.clave} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600 }}>{m.etiqueta}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatMoney(m.facturacion)}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end', height: '120px' }}>
                  {/* Facturación */}
                  <div
                    title={`Facturación: ${formatMoney(m.facturacion)}`}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--primary-light)',
                      borderRadius: '4px 4px 0 0',
                      height: barWidth(m.facturacion, maxFacturacion),
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatMoney(m.facturacion)}
                    </span>
                  </div>
                  {/* Ganancia bruta */}
                  <div
                    title={`Ganancia Bruta: ${formatMoney(m.gananciaBruta)}`}
                    style={{
                      flex: 1,
                      backgroundColor: isPositive(m.gananciaBruta) ? '#dcfce7' : '#fee2e2',
                      borderRadius: '4px 4px 0 0',
                      height: barWidth(Math.abs(m.gananciaBruta), maxGananciaBruta || 1),
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      position: 'relative',
                      opacity: 0.8,
                    }}
                  >
                    <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', color: isPositive(m.gananciaBruta) ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                      {formatMoney(m.gananciaBruta)}
                    </span>
                  </div>
                  {/* Ganancia neta */}
                  <div
                    title={`Ganancia Neta: ${formatMoney(m.gananciaNeta)}`}
                    style={{
                      flex: 1,
                      backgroundColor: isPositive(m.gananciaNeta) ? '#15803d' : '#b91c1c',
                      borderRadius: '4px 4px 0 0',
                      height: barWidth(Math.abs(m.gananciaNeta), maxGananciaNeta || 1),
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', color: '#ffffff', whiteSpace: 'nowrap' }}>
                      {formatMoney(m.gananciaNeta)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  <span>Facturación</span>
                  <span>Ganancia Bruta</span>
                  <span>Ganancia Neta</span>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              <span style={{ color: 'var(--primary)' }}><strong>■</strong> Facturación</span>
              <span style={{ color: isPositive(data.totales.gananciaBruta) ? '#15803d' : '#b91c1c' }}><strong>■</strong> Ganancia Bruta</span>
              <span style={{ color: isPositive(data.totales.gananciaNeta) ? '#15803d' : '#b91c1c' }}><strong>■</strong> Ganancia Neta</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nota explicativa */}
      <div className="card" style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '4px solid var(--primary)' }}>
        <Wallet size={20} style={{ color: 'var(--primary)', flex: '0 0 auto' }} />
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-main)' }}>¿Cómo se calcula?</strong> Facturación = total de ventas (excluye notas de crédito y rechazadas). Costo de productos = suma de precioCosto × cantidad de cada ítem vendido. Ganancia Bruta = Facturación − Costo de Productos. Egresos = gastos registrados en la sección <strong>Egresos</strong>. Ganancia Neta = Ganancia Bruta − Egresos. Los descuentos se muestran a título informativo.
        </p>
      </div>
    </div>
  );
}
