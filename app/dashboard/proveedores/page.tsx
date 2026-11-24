'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Loader2, Search, Truck } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { formatMoney } from '@/lib/format';
import { parseNumero } from '@/lib/listas/parseo';
import { parseBonificaciones } from '@/lib/costos';
import { FormulaProveedor } from '@/components/costos/DesgloseCosto';

type FilaCambio = { productoId: string; codigo: string; nombre: string; costoAnterior: number; costoNuevo: number; precioActual: number; precioNuevo: number };
// Dólar de cada proveedor (módulo de costos): el propio o, si no tiene, el general.
type DolarProveedor = { valor: number | null; propio: boolean; productosUsd: number };
// Ganancia (margen %): la general y la propia de cada proveedor (regla por proveedor).
type Ganancias = { general: number; ivaEnCosto: boolean; porProveedor: Map<string, { id: string; margen: number }> };
type FilaPrecio = { productoId: string; codigo: string; nombre: string; precioActual: number; precioNuevo: number; margen: number; nivel: string };

export default function ProveedoresPage() {
  const { confirm, confirmNode } = useConfirm();
  const { showToast, toastNode } = useToast(6000);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');


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
  const [bonificacionesBase, setBonificacionesBase] = useState('');
  const [baseOriginal, setBaseOriginal] = useState('');
  // Vista previa al cambiar el descuento base: productos cuyo costo cambia.
  const [previewBase, setPreviewBase] = useState<{ total: number; filas: FilaCambio[] } | null>(null);
  // Dólar del proveedor: null si el módulo de costos no está activo.
  const [dolares, setDolares] = useState<{ general: number | null; porProveedor: Map<string, DolarProveedor> } | null>(null);
  const [dolar, setDolar] = useState('');
  const [dolarOriginal, setDolarOriginal] = useState('');
  const [previewDolar, setPreviewDolar] = useState<{ anterior: number | null; total: number; filas: FilaCambio[] } | null>(null);
  const [ganancias, setGanancias] = useState<Ganancias | null>(null);
  const [ganancia, setGanancia] = useState('');
  const [gananciaOriginal, setGananciaOriginal] = useState('');
  // Después de cambiar la ganancia: precios de sus productos que cambian (se aplican al confirmar).
  const [previewGanancia, setPreviewGanancia] = useState<{ proveedorId: string; nombre: string; total: number; filas: FilaPrecio[] } | null>(null);
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

  const loadDolares = async () => {
    try {
      const r = await fetch('/api/tenant/costos/cotizaciones');
      if (!r.ok) return setDolares(null); // sin módulo de costos: no se muestra el dólar
      const d = await r.json();
      setDolares({
        general: d.general?.valor ?? null,
        porProveedor: new Map((d.proveedores || []).map((p: DolarProveedor & { id: string }) => [p.id, p])),
      });
    } catch {
      setDolares(null);
    }
  };

  const loadGanancias = async () => {
    try {
      const r = await fetch('/api/tenant/costos/configuracion');
      if (!r.ok) return setGanancias(null);
      const d = await r.json();
      setGanancias({
        general: d.config.margenGeneral,
        ivaEnCosto: d.config.ivaEnCosto,
        porProveedor: new Map(
          (d.reglas || [])
            .filter((x: { tipo: string }) => x.tipo === 'PROVEEDOR')
            .map((x: { id: string; proveedorId: string; margen: number }) => [x.proveedorId, { id: x.id, margen: x.margen }])
        ),
      });
    } catch {
      setGanancias(null);
    }
  };

  useEffect(() => {
    loadProveedores();
    loadDolares();
    loadGanancias();
  }, []);

  /** Dólar escrito en el formulario como número ("1.608" o "1608,50"), null si está vacío o es inválido. */
  const dolarNumero = () => {
    const v = parseNumero(dolar.trim());
    return v !== null && v > 0 ? v : null;
  };
  const cambiaDolar = () => dolar.trim() !== '' && dolar.trim() !== dolarOriginal.trim();

  // --- Formulario proveedor ---
  const resetForm = () => {
    setNombre('');
    setCuit('');
    setTelefono('');
    setEmail('');
    setDireccion('');
    setContacto('');
    setBonificacionesBase('');
    setDolar('');
    setDolarOriginal('');
    setGanancia('');
    setGananciaOriginal('');
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
    setBonificacionesBase(prov.bonificacionesBase || '');
    setBaseOriginal(prov.bonificacionesBase || '');
    const propio = dolares?.porProveedor.get(prov.id);
    const valorPropio = propio?.propio && propio.valor ? String(propio.valor).replace('.', ',') : '';
    setDolar(valorPropio);
    setDolarOriginal(valorPropio);
    const propia = ganancias?.porProveedor.get(prov.id);
    const gananciaPropia = propia ? String(propia.margen).replace('.', ',') : '';
    setGanancia(gananciaPropia);
    setGananciaOriginal(gananciaPropia);
    setActivo(prov.activo ?? true);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent | null, confirmado = false) => {
    e?.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      if (cambiaDolar() && dolarNumero() === null) throw new Error('Ingresá un dólar válido, por ejemplo 1608 o 1.608,50.');
      if (cambiaGanancia() && ganancia.trim() !== '' && gananciaNumero() === null) {
        throw new Error('Ingresá la ganancia en %, por ejemplo 50 (equivale a × 1,5).');
      }
      if (isEdit && editingId) {
        // Si cambia el dólar, primero se muestra cómo quedan sus productos en dólares.
        if (!confirmado && cambiaDolar()) {
          const r = await fetch('/api/tenant/costos/cotizaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valor: dolarNumero(), preview: true, proveedorId: editingId }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'No se pudo calcular el cambio del dólar.');
          if (d.total > 0) {
            setPreviewDolar({ anterior: d.anterior, total: d.total, filas: d.filas });
            return;
          }
        }
        // Si cambia el descuento base, primero se muestra cómo quedan sus productos.
        if (!confirmado && bonificacionesBase.trim() !== baseOriginal.trim()) {
          const r = await fetch('/api/tenant/proveedores', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingId, bonificacionesBase, preview: true }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'No se pudo calcular el cambio.');
          if (d.preview && d.preview.total > 0) {
            setPreviewBase(d.preview);
            return;
          }
        }
        setPreviewBase(null);
        setPreviewDolar(null);
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
            bonificacionesBase,
            activo,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el proveedor.');
        const rc = data.recalculo;
        if (rc && rc.costosActualizados > 0) {
          const partes = [`${rc.costosActualizados} costos recalculados con el nuevo descuento`];
          if (rc.actualizados) partes.push(`${rc.actualizados} precios de venta actualizados`);
          showToast(`${partes.join(', ')}.`, 'success');
        }
        await guardarDolar(editingId);
        await guardarGanancia(editingId, nombre);
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
            bonificacionesBase,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo crear el proveedor.');
        await guardarDolar(data.id);
        await guardarGanancia(data.id, nombre);
      }

      setShowModal(false);
      resetForm();
      loadProveedores();
      loadDolares();
      loadGanancias();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /** Guarda el dólar del proveedor (si cambió): recalcula costo y precio de sus productos en dólares. */
  const guardarDolar = async (proveedorId: string) => {
    if (!cambiaDolar()) return;
    const r = await fetch('/api/tenant/costos/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: dolarNumero(), proveedorId }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'El proveedor se guardó, pero no se pudo guardar su dólar.');
    if (d.costosActualizados > 0) {
      const partes = [`Dólar guardado: ${d.costosActualizados} productos recalculados`];
      if (d.actualizados) partes.push(`${d.actualizados} precios de venta actualizados`);
      if (d.sugeridos) partes.push(`${d.sugeridos} precios a la bandeja`);
      showToast(`${partes.join(', ')}.`, 'success');
    }
  };

  /** Ganancia escrita en el formulario ("50" o "37,5"), null si está vacía o es inválida. */
  const gananciaNumero = () => {
    const v = parseNumero(ganancia.trim());
    return v !== null && v >= 0 && v <= 1000 ? v : null;
  };
  const cambiaGanancia = () => ganancia.trim() !== gananciaOriginal.trim();

  /** Guarda la ganancia del proveedor (o la borra para que use la general) y muestra qué precios cambian. */
  const guardarGanancia = async (proveedorId: string, nombreProv: string) => {
    if (!ganancias || !cambiaGanancia()) return;
    if (ganancia.trim() === '') {
      const regla = ganancias.porProveedor.get(proveedorId);
      if (regla) await fetch(`/api/tenant/costos/reglas?id=${encodeURIComponent(regla.id)}`, { method: 'DELETE' });
    } else {
      const r = await fetch('/api/tenant/costos/reglas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'PROVEEDOR', proveedorId, margen: gananciaNumero() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'No se pudo guardar la ganancia.');
    }
    // Vista previa de los precios que cambian con la ganancia nueva (se aplican al confirmar).
    const r = await fetch('/api/tenant/costos/recalcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alcance: { tipo: 'PROVEEDOR', valor: proveedorId } }),
    });
    const d = await r.json();
    if (r.ok && d.total > 0) setPreviewGanancia({ proveedorId, nombre: nombreProv, total: d.total, filas: d.filas });
  };

  const aplicarGanancia = async () => {
    if (!previewGanancia) return;
    setSaving(true);
    try {
      const r = await fetch('/api/tenant/costos/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alcance: { tipo: 'PROVEEDOR', valor: previewGanancia.proveedorId }, aplicar: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron actualizar los precios.');
      showToast(
        d.actualizados
          ? `Precios de venta actualizados: ${d.actualizados}.`
          : `Precios nuevos para aprobar en Precios sugeridos: ${d.sugeridos}.`,
        'success'
      );
      setPreviewGanancia(null);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Fórmula corta del proveedor para la tabla: × 0,75 × 0,85 × 1,21 × 1.608 × 1,5 */
  const formulaCorta = (prov: { id: string; bonificacionesBase?: string | null }) => {
    if (!ganancias) return '';
    const f = (v: number, dec = 4) => v.toLocaleString('es-AR', { maximumFractionDigits: dec });
    const partes = parseBonificaciones(prov.bonificacionesBase).map((b) => `× ${f(1 - b / 100)}`);
    if (ganancias.ivaEnCosto) partes.push('× 1,21');
    const d = dolares?.porProveedor.get(prov.id);
    if (d?.productosUsd || d?.propio) partes.push(d.valor ? `× ${f(d.valor, 2)}` : '× dólar');
    const g = ganancias.porProveedor.get(prov.id)?.margen ?? ganancias.general;
    partes.push(`× ${f(1 + g / 100, 2)}`);
    return partes.join(' ');
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

  return (
    <div>
      {confirmNode}
      {toastNode}
      {previewBase && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => !saving && setPreviewBase(null)}>
          <div className="modal-content" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Descuento base: {baseOriginal || 'sin descuento'} → {bonificacionesBase.trim() || 'sin descuento'}</h3></div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.75rem' }}>
                Cambia el costo de <strong>{previewBase.total}</strong> productos de {nombre}. Los costos y los precios de venta se actualizan al guardar.
              </p>
              <TablaCambios filas={previewBase.filas} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPreviewBase(null)} disabled={saving}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={() => handleSubmit(null, true)} disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Guardar y actualizar precios
              </button>
            </div>
          </div>
        </div>
      )}
      {previewDolar && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => !saving && setPreviewDolar(null)}>
          <div className="modal-content" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Dólar de {nombre}: {previewDolar.anterior !== null ? formatMoney(previewDolar.anterior) : 'sin dólar'} → {formatMoney(dolarNumero() ?? 0)}</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.75rem' }}>
                Cambia el costo en pesos de <strong>{previewDolar.total}</strong> productos en dólares de {nombre}. Los costos y los precios de venta se actualizan al guardar.
              </p>
              <TablaCambios filas={previewDolar.filas} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPreviewDolar(null)} disabled={saving}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={() => handleSubmit(null, true)} disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Guardar y actualizar precios
              </button>
            </div>
          </div>
        </div>
      )}
      {previewGanancia && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => !saving && setPreviewGanancia(null)}>
          <div className="modal-content" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Ganancia de {previewGanancia.nombre}: precios que cambian</h3></div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.75rem' }}>
                Con la ganancia nueva cambia el precio de venta de <strong>{previewGanancia.total}</strong> {previewGanancia.total === 1 ? 'producto' : 'productos'}.
                Los que tienen una ganancia propia o de su categoría no cambian.
              </p>
              <div className="table-container" style={{ maxHeight: 320, overflowY: 'auto', margin: 0 }}>
                <table className="table" style={{ fontSize: '0.82rem' }}>
                  <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Ganancia</th><th style={{ textAlign: 'right' }}>Precio de venta</th></tr></thead>
                  <tbody>
                    {previewGanancia.filas.map((f) => (
                      <tr key={f.productoId}>
                        <td>{f.nombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.codigo}</div></td>
                        <td style={{ textAlign: 'right' }}>{f.margen.toLocaleString('es-AR')}%</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatMoney(f.precioActual)}</div><strong>{formatMoney(f.precioNuevo)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPreviewGanancia(null)} disabled={saving}>Ahora no</button>
              <button type="button" className="btn btn-primary" onClick={aplicarGanancia} disabled={saving}>
                {saving && <Loader2 size={16} className="spin" />} Actualizar precios
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ================= GESTIÓN DE PROVEEDORES ================= */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Truck size={26} style={{ color: 'var(--primary)' }} />
              <span>Gestión de Proveedores</span>
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Gestioná los proveedores: datos de contacto y descuento base sobre su lista.
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
                {dolares && <th>Dólar</th>}
                {ganancias && <th title="Cómo se calcula el precio de venta desde su lista">Fórmula</th>}
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7 + (dolares ? 1 : 0) + (ganancias ? 1 : 0)} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7 + (dolares ? 1 : 0) + (ganancias ? 1 : 0)} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
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
                    {dolares && <CeldaDolar dato={dolares.porProveedor.get(prov.id)} general={dolares.general} />}
                    {ganancias && <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}><code>{formulaCorta(prov)}</code></td>}
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
                <div className="form-group">
                  <label className="form-label">Descuento base sobre su lista (%)</label>
                  <input
                    type="text" inputMode="decimal" className="form-input" placeholder="Ej: 25+15"
                    value={bonificacionesBase} onChange={(e) => setBonificacionesBase(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Se aplica a todos sus productos, salvo los que tengan un descuento propio. Varios descuentos en cascada con +.
                  </span>
                </div>
                {dolares && (
                  <div className="form-group">
                    <label className="form-label">Dólar que toma este proveedor ($ por US$)</label>
                    <input
                      type="text" inputMode="decimal" className="form-input"
                      placeholder={dolares.general ? `Si queda vacío usa el general: ${formatMoney(dolares.general)}` : 'Ej: 1608'}
                      value={dolar} onChange={(e) => setDolar(e.target.value.replace(/[^\d.,]/g, ''))}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Sus productos con costo en dólares se pasan a pesos con este valor. Al cambiarlo se recalculan su costo y su precio de venta.
                    </span>
                  </div>
                )}
                {ganancias && (
                  <div className="form-group">
                    <label className="form-label">Ganancia (%)</label>
                    <input
                      type="text" inputMode="decimal" className="form-input"
                      placeholder={`Si queda vacío usa la general: ${ganancias.general}%`}
                      value={ganancia} onChange={(e) => setGanancia(e.target.value.replace(/[^\d.,]/g, ''))}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Lo que se le suma al costo para vender: 50% = × 1,5. Un producto o una categoría con ganancia propia tiene prioridad.
                    </span>
                  </div>
                )}
                {ganancias && isEdit && editingId && (
                  <div className="form-group">
                    <FormulaProveedor proveedorId={editingId} ganancia={ganancia} bonificaciones={bonificacionesBase} dolar={dolar} />
                  </div>
                )}
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

function TablaCambios({ filas }: { filas: FilaCambio[] }) {
  return (
    <div className="table-container" style={{ maxHeight: 340, overflowY: 'auto', margin: 0 }}>
      <table className="table" style={{ fontSize: '0.82rem' }}>
        <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Costo $</th><th style={{ textAlign: 'right' }}>Precio de venta</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.productoId}>
              <td>{f.nombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.codigo}</div></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatMoney(f.costoAnterior)}</div>{formatMoney(f.costoNuevo)}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatMoney(f.precioActual)}</div><strong>{formatMoney(f.precioNuevo)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CeldaDolar({ dato, general }: { dato?: DolarProveedor; general: number | null }) {
  const valor = dato?.propio ? dato.valor : general;
  return (
    <td style={{ whiteSpace: 'nowrap' }}>
      {valor ? formatMoney(valor) : '—'}
      {!dato?.propio && valor ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> (general)</span> : null}
      {dato?.productosUsd ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{dato.productosUsd} productos en US$</div>
      ) : null}
    </td>
  );
}
