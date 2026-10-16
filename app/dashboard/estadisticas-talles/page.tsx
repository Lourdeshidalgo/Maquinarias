'use client';

import { useState, useEffect } from 'react';
import { Star, Search, Filter, Loader2, ShieldAlert } from 'lucide-react';

function formatMoney(value: number) {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

const TIPO_LABEL: Record<string, string> = {
  alfabetico: 'Alfabéticos (XS, S, M, L, XL...)',
  numerico: 'Numéricos (36, 38, 40...)',
  otro: 'Otros',
};

const TIPO_COLOR: Record<string, string> = {
  alfabetico: 'var(--primary)',
  numerico: '#0891b2',
  otro: '#64748b',
};

export default function EstadisticasTallesPage() {
  const [periodo, setPeriodo] = useState('mes');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [productoId, setProductoId] = useState('');
  const [proveedorId, setProveedorId] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ periodo });
      if (periodo === 'personalizado' && desde && hasta) {
        params.set('desde', desde);
        params.set('hasta', hasta);
      }
      if (productoId) params.set('productoId', productoId);
      if (proveedorId) params.set('proveedorId', proveedorId);

      const res = await fetch(`/api/tenant/estadisticas/talles?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar estadísticas de talles.');
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
  }, [periodo, desde, hasta, productoId, proveedorId]);

  const formatDateRange = (rango?: any) => {
    if (!rango) return '';
    const desdeVal = new Date(rango.desde).toLocaleDateString('es-AR');
    const hastaVal = new Date(rango.hasta).toLocaleDateString('es-AR');
    if (desdeVal === hastaVal) return desdeVal;
    return `${desdeVal} — ${hastaVal}`;
  };

  const renderTalleList = (talles: any[], tipo: string) => {
    if (talles.length === 0) {
      return (
        <p style={{ color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>
          No hay ventas de talles {TIPO_LABEL[tipo].toLowerCase()} en este período.
        </p>
      );
    }
    return (
      <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Talle</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th style={{ textAlign: 'right' }}>%</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th style={{ textAlign: 'center' }}>Ventas</th>
            </tr>
          </thead>
          <tbody>
            {talles.map((t) => (
              <tr key={`${tipo}-${t.talle}`}>
                <td style={{ fontWeight: 600, color: TIPO_COLOR[tipo] }}>{t.talle}</td>
                <td style={{ textAlign: 'right' }}>{t.cantidad.toLocaleString('es-AR')}</td>
                <td style={{ textAlign: 'right' }}>{t.porcentaje?.toFixed(1) || 0}%</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(t.monto || 0)}</td>
                <td style={{ textAlign: 'center' }}>{t.ventas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Calculando estadísticas de talles...<Loader2 size={18} className="spin" style={{ marginLeft: '0.5rem' }} /></p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={26} style={{ color: 'var(--primary)' }} />
            <span>Estadísticas de Talles</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Talles más vendidos, diferenciando talles alfabéticos de numéricos, con filtros por período, producto y proveedor.
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

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="form-label">Filtrar por producto</label>
          <input
            className="form-input"
            type="text"
            placeholder="ID del producto (opcional)"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="form-label">Filtrar por proveedor</label>
          <input
            className="form-input"
            type="text"
            placeholder="ID del proveedor (opcional)"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={loadData}>
          Aplicar Filtros
        </button>
        {(productoId || proveedorId) && (
          <button
            onClick={() => {
              setProductoId('');
              setProveedorId('');
              loadData();
            }}
            className="btn btn-secondary btn-sm"
          >
            Limpiar
          </button>
        )}
      </div>

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
                <Star size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Total unidades vendidas con talle</span>
                <span className="stat-value">{data.totalUnidades?.toLocaleString('es-AR') || 0}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatDateRange(data.rango)}</span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
                <ShieldAlert size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Talles alfabéticos</span>
                <span className="stat-value">{data.totalAlfabeticos?.toLocaleString('es-AR') || 0}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{data.resumen?.[0]?.porcentaje?.toFixed(1) || 0}%</span>
              </            </div>
            <div className="card stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                <ShieldAlert size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Talles numéricos</span>
                <span className="stat-value">{data.totalNumericos?.toLocaleString('es-AR') || 0}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{data.resumen?.[1]?.porcentaje?.toFixed(1) || 0}%</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
            <div className="card">
              <div className="card-header">
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: TIPO_COLOR.alfabetico }}>
                  <Star size={18} style={{ color: TIPO_COLOR.alfabetico }} />
                  {TIPO_LABEL.alfabetico}
                </h3>
              </div>
              {renderTalleList(data.alfabeticos || [], 'alfabetico')}
            </div>
            <div className="card">
              <div className="card-header">
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: TIPO_COLOR.numerico }}>
                  <Star size={18} style={{ color: TIPO_COLOR.numerico }} />
                  {TIPO_LABEL.numerico}
                </h3>
              </div>
              {renderTalleList(data.numericos || [], 'numerico')}
            </div>
          </div>

          {(data.otros?.length ?? 0) > 0 && (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: TIPO_COLOR.otro }}>
                  <ShieldAlert size={18} style={{ color: TIPO_COLOR.otro }} />
                  Otros talles
                </h3>
              </div>
              {renderTalleList(data.otros, 'otro')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
