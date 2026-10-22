'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Loader2, Search, Truck, Award, Filter } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatMoney } from '@/lib/format';

export default function ProveedoresPage() {
  const { confirm, confirmNode } = useConfirm();
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Ranking de proveedores
  const [rankingPeriodo, setRankingPeriodo] = useState('mes');
  const [rankingData, setRankingData] = useState<any>(null);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingDesde, setRankingDesde] = useState('');
  const [rankingHasta, setRankingHasta] = useState('');

  // Modal de agregar/editar proveedor
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contacto, setContacto] = useState('');
  const [activo, setActivo] = useState(true);
  const [formError, setFormError] = useState('');

  // --- Cargar lista de proveedores ---
  const loadProveedores = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/proveedores');
      if (!res.ok) throw new Error('No se pudieron cargar los proveedores.');
      const data = await res.json();
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Cargar ranking de proveedores ---
  const loadRanking = async () => {
    setRankingLoading(true);
    try {
      let url = `/api/tenant/estadisticas/proveedores?periodo=${rankingPeriodo}`;
      if (rankingPeriodo === 'personalizado' && rankingDesde && rankingHasta) {
        url = `/api/tenant/estadisticas/proveedores?periodo=personalizado&desde=${rankingDesde}&hasta=${rankingHasta}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo cargar el ranking.');
      const d = await res.json();
      setRankingData(d);
    } catch (err: any) {
      console.error('Error cargando ranking:', err);
    } finally {
      setRankingLoading(false);
    }
  };

  useEffect(() => {
    loadProveedores();
    loadRanking();
  }, []);

  // --- Formulario proveedor ---
  const resetForm = () => {
    setNombre('');
    setCuit('');
    setTelefono('');
    setEmail('');
    setDireccion('');
    setContacto('');
    setActivo(true);
    setFormError('');
    setIsEdit(false);
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (prov: any) => {
    setIsEdit(true);
    setEditingId(prov.id);
    setNombre(prov.nombre || '');
    setCuit(prov.cuit || '');
    setTelefono(prov.telefono || '');
    setEmail(prov.email || '');
    setDireccion(prov.direccion || '');
    setContacto(prov.contacto || '');
    setActivo(prov.activo ?? true);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      if (isEdit && editingId) {
        const res = await fetch('/api/tenant/proveedores', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            nombre,
            cuit,
            telefono,
            email,
            direccion,
            contacto,
            activo,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el proveedor.');
      } else {
        const res = await fetch('/api/tenant/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre,
            cuit,
            telefono,
            email,
            direccion,
            contacto,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo crear el proveedor.');
      }

      setShowModal(false);
      resetForm();
      loadProveedores();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (prov: any) => {
    const accion = prov.activo ? 'desactivar' : 'activar';
    const ok = await confirm({
      title: `${accion.charAt(0).toUpperCase() + accion.slice(1)} proveedor`,
      message: `¿Está seguro de ${accion} al proveedor "${prov.nombre}"?`,
      confirmText: accion.charAt(0).toUpperCase() + accion.slice(1),
      danger: prov.activo,
    });
    if (!ok) return;

    try {
      const res = await fetch('/api/tenant/proveedores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prov.id, activo: !prov.activo }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `No se pudo ${accion} el proveedor.`);
      }
      loadProveedores();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const eliminar = async (prov: any) => {
    const ok = await confirm({
      title: 'Eliminar proveedor',
      message: `¿Está seguro de eliminar a "${prov.nombre}"? Se desactivará lógicamente.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await toggleActivo({ ...prov, activo: true });
  };

  const filtered = proveedores.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(term) ||
      (p.cuit || '').toLowerCase().includes(term) ||
      (p.telefono || '').toLowerCase().includes(term)
    );
  });

  const formatDateRange = (rango?: any) => {
    if (!rango) return '';
    const desdeVal = new Date(rango.desde).toLocaleDateString('es-AR');
    const hastaVal = new Date(rango.hasta).toLocaleDateString('es-AR');
    if (desdeVal === hastaVal) return desdeVal;
    return `${desdeVal} — ${hastaVal}`;
  };

  return (
    <div>
      {confirmNode}
      {/* ================= RANKING DE PROVEEDORES ================= */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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
              value={rankingPeriodo}
              onChange={(e) => setRankingPeriodo(e.target.value)}
            >
              <option value="mes">Últimos 30 días</option>
              <option value="semana">Últimos 7 días</option>
              <option value="trimestre">Últimos 90 días</option>
              <option value="anio">Últimos 365 días</option>
              <option value="todos">Historial Completo</option>
              <option value="personalizado">Personalizado...</option>
            </select>
            {rankingPeriodo === 'personalizado' && (
              <>
                <input
                  className="form-input"
                  type="date"
                  style={{ width: '140px', padding: '0.5rem 0.75rem' }}
                  value={rankingDesde}
                  onChange={(e) => setRankingDesde(e.target.value)}
                  placeholder="Desde"
                />
                <input
                  className="form-input"
                  type="date"
                  style={{ width: '140px', padding: '0.5rem 0.75rem', marginLeft: '0.5rem' }}
                  value={rankingHasta}
                  onChange={(e) => setRankingHasta(e.target.value)}
                  placeholder="Hasta"
                />
                <button
                  className="btn btn-primary"
                  disabled={!rankingDesde || !rankingHasta}
                  onClick={loadRanking}
                >
                  Calcular
                </button>
              </>
            )}
            <button onClick={loadRanking} className="btn btn-secondary btn-sm" title="Actualizar">
              <Loader2 size={16} className="spin" />
            </button>
          </div>
        </div>

        {rankingLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando ranking de proveedores...<Loader2 size={18} className="spin" style={{ marginLeft: '0.5rem' }} /></p>
        ) : !rankingData ? null : (
          <div className="card">
            <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>#</th>
                    <th>Proveedor</th>
                    <th style={{ textAlign: 'right' }}>Unidades Vendidas</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                    <th style={{ textAlign: 'right' }}>Monto Facturado</th>
                    <th style={{ textAlign: 'center' }}>Productos Vendidos</th>
                  </tr>
                </thead>
                <tbody>
                  {(rankingData.ranking?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No hay ventas registradas en este período para generar el ranking.
                      </td>
                    </tr>
                  ) : (
                    rankingData.ranking.map((prov: any, idx: number) => (
                      <tr key={prov.id}>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}</td>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ================= GESTIÓN DE PROVEEDORES ================= */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Truck size={26} style={{ color: 'var(--primary)' }} />
              <span>Gestión de Proveedores</span>
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Gestioná los proveedores de tu local de ropa. Asocialos a productos para ver rankings de ventas.
            </p>
          </div>
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={16} />
            <span>Nuevo Proveedor</span>
          </button>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Buscar */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={18} style={{ color: 'var(--primary)', flex: '0 0 auto' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar proveedor por nombre, CUIT o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>CUIT</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Productos</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No se encontraron proveedores.
                  </td>
                </tr>
              ) : (
                filtered.map((prov) => (
                  <tr key={prov.id}>
                    <td style={{ fontWeight: 600 }}>{prov.nombre}</td>
                    <td><code>{prov.cuit || '-'}</code></td>
                    <td>{prov.telefono || '-'}</td>
                    <td>{prov.email || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{prov._count?.productos || 0}</td>
                    <td>
                      <span className={`badge ${prov.activo ? 'badge-success' : 'badge-danger'}`}>
                        {prov.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        {!prov.activo && (
                          <button
                            onClick={() => toggleActivo(prov)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.65rem', color: '#15803d' }}
                          >
                            <Pencil size={14} />
                            <span>Activar</span>
                          </button>
                        )}
                        {prov.activo && (
                          <>
                            <button
                              onClick={() => openEdit(prov)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.35rem 0.65rem' }}
                            >
                              <Pencil size={14} />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => eliminar(prov)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.35rem 0.65rem', color: '#b91c1c' }}
                            >
                              <Trash2 size={14} />
                              <span>Desactivar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>{isEdit ? '✏️ Editar Proveedor' : '🚚 Nuevo Proveedor'}</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {formError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Nombre del proveedor <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input type="text" className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">CUIT</label>
                    <input type="text" className="form-input" placeholder="20-12345678-9" value={cuit} onChange={(e) => setCuit(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input type="text" className="form-input" placeholder="351-1234567" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" placeholder="proveedor@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input type="text" className="form-input" placeholder="Calle y altura" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Contacto</label>
                    <input type="text" className="form-input" placeholder="Nombre de contacto" value={contacto} onChange={(e) => setContacto(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'end', gap: '0.5rem' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Activo</label>
                    <select className="form-select" value={activo ? 'true' : 'false'} onChange={(e) => setActivo(e.target.value === 'true')}>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Los proveedores inactivos no se podrán asignar a nuevos productos, pero los productos existentes mantienen su asociación.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  <span>{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Proveedor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
