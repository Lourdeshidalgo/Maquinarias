'use client';

import { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Search, Loader2, TrendingUp, Award, Star, Flame } from 'lucide-react';

type RankingProducto = {
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

type RankingData = {
  rango: { desde: string; hasta: string };
  totalUnidades: number;
  categoriaTop: { categoria: string; unidades: number } | null;
  productosTop: RankingProducto[];
  categoriasRanking: Array<{ categoria: string; unidades: number; porcentaje: number }>;
};

function formatQty(value: number, unidad: string) {
  return `${value.toFixed(3).replace(/\.?0+$/, '')} ${unidad}`;
}

export default function ProductosDestacadosPage() {
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [loadingRanking, setLoadingRanking] = useState(true);

  const [destacados, setDestacados] = useState<any[]>([]);
  const [todosProductos, setTodosProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Modal de agregar destacado
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState<string>('');
  const [orden, setOrden] = useState('');

  const loadRanking = async () => {
    setLoadingRanking(true);
    try {
      const res = await fetch('/api/tenant/productos-destacados/ranking');
      if (!res.ok) throw new Error('No se pudo calcular el ranking de ventas.');
      const data = await res.json();
      setRanking(data);
    } catch (err: any) {
      // No es crítico: la sección manual sigue funcionando
      console.error('Error cargando ranking:', err);
    } finally {
      setLoadingRanking(false);
    }
  };

  const loadDestacados = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/productos-destacados');
      if (!res.ok) throw new Error('No se pudieron cargar los productos destacados.');
      const data = await res.json();
      setDestacados(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProductos = async () => {
    try {
      const res = await fetch('/api/tenant/productos');
      if (!res.ok) throw new Error('No se pudieron cargar los productos.');
      const data = await res.json();
      setTodosProductos(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error cargando productos para destacados:', err);
    }
  };

  useEffect(() => {
    loadRanking();
    loadDestacados();
    loadProductos();
  }, []);

  const destacadosIds = new Set(destacados.map((d) => d.productoId));

  const productosDisponibles = todosProductos.filter(
    (p) => !destacadosIds.has(p.id)
  );

  const filteredDisponibles = productosDisponibles.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term)
    );
  });

  const openAdd = () => {
    setProductoSeleccionado('');
    setOrden('');
    setFormError('');
    setShowModal(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const res = await fetch('/api/tenant/productos-destacados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productoId: productoSeleccionado,
          orden: orden || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo agregar el producto.');
      setShowModal(false);
      setProductoSeleccionado('');
      setOrden('');
      loadDestacados();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const quitarDestacado = async (id: string) => {
    if (!window.confirm('¿Está seguro de quitar este producto de la sección de destacados?')) return;
    try {
      const res = await fetch(`/api/tenant/productos-destacados?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo quitar el producto.');
      }
      loadDestacados();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={26} style={{ color: 'var(--primary)' }} />
          <span>Productos Destacados</span>
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Calculado automáticamente según lo que más se vendió en los últimos 30 días.
        </p>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          ⚠️ {error}
        </div>
      )}

      {loadingRanking ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={22} className="spin" style={{ marginBottom: '0.5rem' }} />
          <p>Calculando lo que más se vende...</p>
        </div>
      ) : !ranking || !ranking.categoriaTop ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Award size={36} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Todavía no hay ventas para calcular destacados</p>
          <p style={{ fontSize: '0.9rem' }}>
            Cuando registres ventas en el Punto de Venta, acá vas a ver automáticamente la categoría que más vendés y sus productos top.
          </p>
        </div>
      ) : (
        <>
          {/* Categoría más vendida */}
          <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{
                width: '56px', height: '56px', flex: '0 0 auto',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Flame size={28} />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  Categoría más vendida (últimos 30 días)
                </span>
                <h3 style={{ fontSize: '1.5rem', margin: '0.15rem 0 0' }}>
                  {ranking.categoriaTop.categoria}
                </h3>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {formatQty(ranking.categoriaTop.unidades, 'unidades')} vendidas en total
                </span>
              </div>
            </div>

            {ranking.categoriasRanking.length > 1 && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.65rem' }}>
                  Otras categorías que se venden
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {ranking.categoriasRanking.slice(1, 6).map((c) => (
                    <div key={c.categoria} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem' }}>
                      <span style={{ width: '140px', flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.categoria}
                      </span>
                      <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${c.porcentaje}%`, height: '100%', backgroundColor: 'var(--primary)' }} />
                      </div>
                      <span style={{ width: '60px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {c.porcentaje.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Productos top de la categoría */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="card-header">
              <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
                Lo más vendido en {ranking.categoriaTop.categoria}
              </h3>
            </div>

            <div className="pos-products-grid" style={{ padding: '1rem' }}>
              {ranking.productosTop.map((p, idx) => (
                <div key={p.productoId} className="card pos-product-card" style={{ cursor: 'default' }}>
                  <div>
                    {p.imagenUrl ? (
                      <img
                        src={p.imagenUrl}
                        alt={p.nombre}
                        style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '70px', borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-tertiary)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem',
                        position: 'relative',
                      }}>
                        {idx === 0 && (
                          <span style={{ position: 'absolute', top: '6px', left: '6px', backgroundColor: 'var(--primary)', color: 'white', borderRadius: '999px', padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 700 }}>
                            Nº1
                          </span>
                        )}
                        sin foto
                      </div>
                    )}
                    <strong style={{ fontSize: '0.95rem', display: 'block', height: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nombre}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                      {p.codigo}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)', display: 'block' }}>
                      ${p.precioVenta.toLocaleString('es-AR')}
                    </span>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      marginTop: '0.35rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
                    }}>
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
              {ranking.productosTop.length === 0 && (
                <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No se encontraron productos vendidos en esta categoría.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== Gestión manual (opcional) ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}>Selección manual</h3>
        <span style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
        <button onClick={() => setShowManual(!showManual)} className="btn btn-secondary btn-sm">
          {showManual ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {showManual && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Si querés destacar productos puntuales a mano, además del cálculo automático.
              </p>
              <button onClick={openAdd} className="btn btn-primary btn-sm" disabled={productosDisponibles.length === 0}>
                <Plus size={14} />
                <span>Agregar destacado</span>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={18} style={{ color: 'var(--primary)', flex: '0 0 auto' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Buscar producto disponible para destacar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Package size={18} style={{ color: 'var(--primary)' }} />
                Productos fijados manualmente
              </h3>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Cargando...</p>
            ) : destacados.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
                No hay productos fijados a mano. El bloque automático de arriba ya muestra lo más vendido.
              </p>
            ) : (
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Categoría</th>
                      <th>Precio</th>
                      <th>Stock</th>
                      <th style={{ textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destacados.map((d) => {
                      const p = d.producto;
                      return (
                        <tr key={d.id}>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{d.orden}</td>
                          <td><code>{p.codigo}</code></td>
                          <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                          <td><span className="badge badge-secondary" style={{ backgroundColor: 'var(--bg-tertiary)' }}>{p.categoria}</span></td>
                          <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            ${parseFloat(p.precioVenta).toLocaleString('es-AR')}
                          </td>
                          <td style={{ color: Number(p.stockActual) <= 0 ? '#ef4444' : 'inherit' }}>
                            {parseFloat(p.stockActual).toFixed(3).replace(/\.?0+$/, '')} {p.unidad}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => quitarDestacado(d.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.35rem 0.65rem', color: '#b91c1c' }}
                            >
                              <Trash2 size={14} />
                              <span>Quitar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {(productosDisponibles.length > 0 || !loading) && (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Productos disponibles</h3>
              </div>
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Categoría</th>
                      <th style={{ textAlign: 'right' }}>Precio</th>
                      <th style={{ textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDisponibles.slice(0, 10).map((p) => (
                      <tr key={p.id}>
                        <td><code>{p.codigo}</code></td>
                        <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                        <td>{p.categoria}</td>
                        <td style={{ textAlign: 'right' }}>${parseFloat(p.precioVenta).toLocaleString('es-AR')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              setProductoSeleccionado(p.id);
                              openAdd();
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.65rem' }}
                          >
                            <Plus size={14} />
                            <span>Destacar</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredDisponibles.length > 10 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          Mostrando los primeros 10. Usá el buscador para encontrar un producto específico.
                        </td>
                      </tr>
                    )}
                    {filteredDisponibles.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                          No hay productos disponibles para destacar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal agregar destacado */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>⭐ Agregar Producto Destacado</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                {formError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {formError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Producto <span style={{ color: '#b91c1c' }}>*</span></label>
                  <select
                    className="form-select"
                    value={productoSeleccionado}
                    onChange={(e) => setProductoSeleccionado(e.target.value)}
                    required
                  >
                    <option value="">Seleccioná un producto...</option>
                    {filteredDisponibles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} — {p.nombre} ({p.categoria})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Orden de aparición</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={orden}
                    onChange={(e) => setOrden(e.target.value)}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Número menor = aparece primero. Si lo dejás vacío se asigna automáticamente al final.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !productoSeleccionado}>
                  {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  <span>{saving ? 'Guardando...' : 'Agregar a Destacados'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
