'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, ArrowUpDown, AlertCircle, Trash2, Pencil, ScanBarcode, Loader2, Image as ImageIcon, Truck } from 'lucide-react';
import { playBeepSuccess, playBeepError } from '@/lib/sound';
import SelectorTalles from './SelectorTalles';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

export default function ProductosPage() {
  const { showToast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [productos, setProductos] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Form states for Add Product
  const [codigo, setCodigo] = useState('');
  const [addAltCodigos, setAddAltCodigos] = useState<string[]>([]);
  const [addAltInput, setAddAltInput] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidad, setUnidad] = useState('unidad');
  const [precioCosto, setPrecioCosto] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [talles, setTalles] = useState<string[]>([]);
  const [ivaPorcentaje, setIvaPorcentaje] = useState('21');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [addError, setAddError] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [proveedorIdAdd, setProveedorIdAdd] = useState('');

  // Modal de nuevo proveedor desde productos
  const [showAddProveedorModal, setShowAddProveedorModal] = useState(false);
  const [savingAddProveedor, setSavingAddProveedor] = useState(false);
  const [newProvNombre, setNewProvNombre] = useState('');
  const [newProvCuit, setNewProvCuit] = useState('');
  const [newProvTelefono, setNewProvTelefono] = useState('');
  const [newProvEmail, setNewProvEmail] = useState('');
  const [newProvError, setNewProvError] = useState('');

  // Form states for Adjust Stock
  const [tipoAjuste, setTipoAjuste] = useState('compra');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState('');
  const [nuevoPrecioCosto, setNuevoPrecioCosto] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // Form state for Edit Product
  const [editForm, setEditForm] = useState<any>(null);
  const [editAltInput, setEditAltInput] = useState('');
  const [editError, setEditError] = useState('');

  const [scanBeat, setScanBeat] = useState(0);

  // Image hover preview state
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; rect: DOMRect } | null>(null);

  // Product image upload state (blob URL the client uploaded + local preview)
  const [addImagenUrl, setAddImagenUrl] = useState('');
  const [addImagenPreview, setAddImagenPreview] = useState('');
  const [addImagenUploading, setAddImagenUploading] = useState(false);
  const addImagenInputRef = useRef<HTMLInputElement>(null);
  const [editImagenUploading, setEditImagenUploading] = useState(false);
  const editImagenInputRef = useRef<HTMLInputElement>(null);

  // Upload image file to Vercel Blob (direct from browser), returns public URL
  const uploadImageToBlob = async (file: File, productoId: string): Promise<string> => {
    const { upload } = await import('@vercel/blob/client');
    // get the original extension, falling back to the mime type
    const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'jpg';
    // Unique pathname per product + timestamp so files never collide in Blob
    const pathname = `productos/${productoId}/${Date.now()}.${ext}`;
    const newBlob = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/tenant/productos/imagen',
      clientPayload: JSON.stringify({ productoId }),
    });
    return newBlob.url;
  };

  // Keep the selected file for later (after product is created with an id)
  const pendingAddImageRef = useRef<File | null>(null);
  const pendingEditImageRef = useRef<File | null>(null);

  const handleAddImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingAddImageRef.current = file;
    setAddImagenPreview(URL.createObjectURL(file));
    setAddImagenUrl('');
    if (addImagenInputRef.current) addImagenInputRef.current.value = '';
  };

  const handleEditImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingEditImageRef.current = file;
    setEditForm((f: any) => ({ ...f, previewImagenUrl: URL.createObjectURL(file) }));
    if (editImagenInputRef.current) editImagenInputRef.current.value = '';
  };

  const loadProveedores = async () => {
    try {
      const res = await fetch('/api/tenant/proveedores?activos=true');
      const data = await res.json();
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load proveedores:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const [prodRes, provRes] = await Promise.all([
        fetch('/api/tenant/productos'),
        fetch('/api/tenant/proveedores?activos=true'),
      ]);
      const prodData = await prodRes.json();
      const provData = await provRes.json();
      setProductos(Array.isArray(prodData) ? prodData : []);
      setProveedores(Array.isArray(provData) ? provData : []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const addAltCode = (list: string[], setList: (v: string[]) => void, value: string) => {
    const code = value.trim();
    if (!code) return;
    setList([...list, code]);
  };

  const removeAltCode = (list: string[], setList: (v: string[]) => void, code: string) => {
    setList(list.filter((c) => c !== code));
  };

  const UNIT_LABELS: Record<string, string> = {
    unidad: 'Unidad',
    kg: 'Kilogramo',
    g: 'Gramo',
    par: 'Par',
    docena: 'Docena',
    pack: 'Pack',
    caja: 'Caja',
  };

  const getUnitLabel = (u: string) => UNIT_LABELS[u] || u;

  // Resumen de rentabilidad en vivo (costo y ganancia real por unidad).
  // El costo del producto ya incluye compra + packaging + envío (cargado desde Egresos).
  const renderMargenResumen = (costo: string, venta: string) => {
    const costoTotal = parseFloat(costo) || 0;
    const v = parseFloat(venta) || 0;
    const ganancia = v - costoTotal;
    const margen = v > 0 ? (ganancia / v) * 100 : 0;
    const positivo = ganancia >= 0;

    return (
      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem 1.5rem',
          fontSize: '0.85rem',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Costo por unidad</span>
          <strong>{costoTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Ganancia real por unidad</span>
          <strong style={{ color: positivo ? '#15803d' : '#b91c1c' }}>
            {ganancia.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
          </strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Margen</span>
          <strong style={{ color: positivo ? '#4338ca' : '#b91c1c' }}>
            {v > 0 ? `${margen.toFixed(1)}%` : '—'}
          </strong>
        </div>
      </div>
    );
  };

  const getPriceLabel = (product: any) => {
    const price = parseFloat(product.precioVenta).toLocaleString('es-AR');
    return `$${price} / ${getUnitLabel(product.unidad).toLowerCase()}`;
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Barcode scanner: capture HID-style input anywhere and search by code
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBufferRef.current += e.key;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => { scanBufferRef.current = ''; }, 80);
        return;
      }

      if (e.key === 'Enter' && scanBufferRef.current.length >= 4 && !inField) {
        e.preventDefault();
        const code = scanBufferRef.current.trim();
        scanBufferRef.current = '';
        setSearch(code);
        setScanBeat((b) => b + 1);
        const found = productos.find((p) =>
          (p.codigo || '').trim() === code ||
          (p.codigos || []).some((c: any) => (c.codigo || '').trim() === code)
        );
        if (found) playBeepSuccess(); else playBeepError();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setSavingAdd(true);

    try {
      const res = await fetch('/api/tenant/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          codigosAlternativos: addAltCodigos,
          nombre,
          categoria,
          unidad,
          precioCosto: parseFloat(precioCosto) || 0,
          precioVenta: parseFloat(precioVenta) || 0,
          talles,
          ivaPorcentaje: parseFloat(ivaPorcentaje) || 21,
          stockActual: parseFloat(stockActual) || 0,
          stockMinimo: parseFloat(stockMinimo) || 0,
          proveedorId: proveedorIdAdd || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear el producto.');
      }

      // If the user selected an image, upload it now (product already has an id)
      if (pendingAddImageRef.current) {
        setAddImagenUploading(true);
        try {
          const blobUrl = await uploadImageToBlob(pendingAddImageRef.current, data.id);
          pendingAddImageRef.current = null;
          await fetch('/api/tenant/productos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.id, imagenUrl: blobUrl }),
          });
        } finally {
          setAddImagenUploading(false);
        }
      }

      // Reset form
      setCodigo('');
      setAddAltCodigos([]);
      setAddAltInput('');
      setNombre('');
      setCategoria('');
      setUnidad('unidad');
      setPrecioCosto('');
      setPrecioVenta('');
      setTalles([]);
      setIvaPorcentaje('21');
      setStockActual('');
      setStockMinimo('');
      setProveedorIdAdd('');
      setAddImagenUrl('');
      setAddImagenPreview('');
      pendingAddImageRef.current = null;
      
      setShowAddModal(false);
      loadProducts();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setSavingAdd(false);
    }
  };

  // --- Nuevo proveedor desde productos ---

  const openAddProveedorModal = () => {
    setNewProvNombre('');
    setNewProvCuit('');
    setNewProvTelefono('');
    setNewProvEmail('');
    setNewProvError('');
    setShowAddProveedorModal(true);
  };

  const handleAddProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewProvError('');
    setSavingAddProveedor(true);

    if (!newProvNombre.trim()) {
      setNewProvError('El nombre es obligatorio.');
      setSavingAddProveedor(false);
      return;
    }

    try {
      const res = await fetch('/api/tenant/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newProvNombre.trim(),
          cuit: newProvCuit.trim() || null,
          telefono: newProvTelefono.trim() || null,
          email: newProvEmail.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear el proveedor.');
      }

      // Agregar a la lista y seleccionar automáticamente
      setProveedores((prev: any[]) => [...prev, data]);
      if (showEditModal) {
        setEditForm((prev: any) => ({ ...prev, proveedorId: data.id }));
      } else {
        setProveedorIdAdd(data.id);
      }
      setShowAddProveedorModal(false);
    } catch (err: any) {
      setNewProvError(err.message);
    } finally {
      setSavingAddProveedor(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');

    try {
      const res = await fetch('/api/tenant/productos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedProduct.id,
          tipoAjuste,
          cantidad: parseFloat(cantidadAjuste) || 0,
          precioVenta: nuevoPrecioVenta ? parseFloat(nuevoPrecioVenta) : undefined,
          precioCosto: nuevoPrecioCosto ? parseFloat(nuevoPrecioCosto) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo registrar el ajuste.');
      }

      setCantidadAjuste('');
      setNuevoPrecioCosto('');
      setNuevoPrecioVenta('');
      setSelectedProduct(null);
      setShowAdjustModal(false);
      loadProducts();
    } catch (err: any) {
      setAdjustError(err.message);
    }
  };

  const handleDeleteProduct = async (product: any) => {
    const confirmed = await confirm({
      title: 'Eliminar producto',
      message: `Vas a eliminar "${product.nombre}" del catálogo. No se verá más en productos ni en el POS. ¿Continuar?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/tenant/productos?id=${product.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo eliminar el producto.');
      }

      loadProducts();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openAdjustModal = (product: any) => {
    setSelectedProduct(product);
    setNuevoPrecioVenta(product.precioVenta.toString());
    setNuevoPrecioCosto(product.precioCosto.toString());
    setShowAdjustModal(true);
  };

  const openEditModal = (product: any) => {
    setSelectedProduct(product);
    pendingEditImageRef.current = null;
    setEditAltInput('');
    setEditForm({
      codigo: product.codigo,
      codigosAlternativos: (product.codigos || []).map((c: any) => c.codigo),
      nombre: product.nombre,
      categoria: product.categoria,
      unidad: product.unidad,
      proveedorId: product.proveedorId || '',
      precioCosto: product.precioCosto.toString(),
      precioVenta: product.precioVenta.toString(),
      talles: Array.isArray(product.talles) ? product.talles : [],
      ivaPorcentaje: parseFloat(product.ivaPorcentaje).toString(),
      stockActual: parseFloat(product.stockActual).toString(),
      stockMinimo: parseFloat(product.stockMinimo).toString(),
      imagenUrl: product.imagenUrl || '',
      previewImagenUrl: product.imagenUrl || '',
    });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');

    try {
      const res = await fetch('/api/tenant/productos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedProduct.id,
          codigo: editForm.codigo,
          codigosAlternativos: editForm.codigosAlternativos || [],
          nombre: editForm.nombre,
          categoria: editForm.categoria,
          unidad: editForm.unidad,
          proveedorId: editForm.proveedorId || undefined,
          precioCosto: parseFloat(editForm.precioCosto) || 0,
          precioVenta: parseFloat(editForm.precioVenta) || 0,
          talles: editForm.talles || [],
          ivaPorcentaje: parseFloat(editForm.ivaPorcentaje) || 21,
          stockActual: parseFloat(editForm.stockActual) || 0,
          stockMinimo: parseFloat(editForm.stockMinimo) || 0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el producto.');
      }

      // If the user selected a new image, upload it and update the URL
      if (pendingEditImageRef.current) {
        setEditImagenUploading(true);
        try {
          const blobUrl = await uploadImageToBlob(pendingEditImageRef.current, selectedProduct.id);
          pendingEditImageRef.current = null;
          await fetch('/api/tenant/productos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedProduct.id, imagenUrl: blobUrl }),
          });
        } finally {
          setEditImagenUploading(false);
        }
      }

      setSelectedProduct(null);
      setShowEditModal(false);
      loadProducts();
    } catch (err: any) {
      setEditError(err.message);
    }
  };

  const filtered = productos.filter((p) => {
    const term = search.toLowerCase();
    const altCodes = (p.codigos || []).map((c: any) => (c.codigo || '').toLowerCase());
    return (
      p.nombre.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      altCodes.some((c: string) => c.includes(term)) ||
      p.categoria.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      {toastNode}
      {confirmNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Stock</h2>
          <p style={{ color: 'var(--text-muted)' }}>Gestioná tus productos, precios y niveles de stock.</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <Plus size={16} />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ScanBarcode size={18} style={{ color: 'var(--primary)', flex: '0 0 auto' }} />
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar o escanear código de barras (nombre, código o categoría)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={() => { setScanBeat(0); }}
            style={scanBeat && search ? { borderColor: productos.find((p) =>
              (p.codigo || '').trim() === search.trim() ||
              (p.codigos || []).some((c: any) => (c.codigo || '').trim() === search.trim())
            ) ? '#22c55e' : '#ef4444' } : undefined}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando inventario...</p>
      ) : (
        <div className="table-container" style={{ width: '100%', overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '50px', width: '5%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Imagen</th>
                <th style={{ minWidth: '100px', width: '12%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Código</th>
                <th style={{ minWidth: '150px', width: '22%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Nombre</th>
                <th style={{ minWidth: '100px', width: '11%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Categoría</th>
                <th style={{ minWidth: '100px', width: '12%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Proveedor</th>
                <th style={{ minWidth: '60px', width: '6%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Unidad</th>
                <th style={{ minWidth: '80px', width: '8%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Costo</th>
                <th style={{ minWidth: '90px', width: '9%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Venta</th>
                <th style={{ minWidth: '50px', width: '4%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>% IVA</th>
                <th style={{ minWidth: '70px', width: '6%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Stock</th>
                <th style={{ minWidth: '90px', width: '9%', padding: '0.6rem 0.4rem', fontSize: '0.8rem' }}>Estado</th>
                <th style={{ minWidth: '100px', width: '7%', padding: '0.6rem 0.4rem', fontSize: '0.8rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prod) => {
                const stock = parseFloat(prod.stockActual);
                const min = parseFloat(prod.stockMinimo);
                const isUnderMin = stock <= min;

                return (
                  <tr key={prod.id} style={{ backgroundColor: isUnderMin ? '#fffefc' : undefined }}>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', overflow: 'hidden' }}>
                      {prod.imagenUrl ? (
                        <img
                          src={prod.imagenUrl}
                          alt={prod.nombre}
                          style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', display: 'block', cursor: 'pointer', border: '1px solid var(--border-color)', maxWidth: '100%' }}
                          onMouseEnter={(e) => setPreviewImage({ url: prod.imagenUrl, name: prod.nombre, rect: e.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setPreviewImage(null)}
                        />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', flexDirection: 'column', gap: '0.1rem' }}>
                          <ImageIcon size={11} />
                          sin foto
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <code style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.codigo}</code>
                      {(prod.codigos && prod.codigos.length > 0) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.15rem' }}>
                          {prod.codigos.map((c: any) => (
                            <span key={c.id} className="badge badge-secondary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }} title={`Código alternativo: ${c.codigo}`}>
                              {c.codigo}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.nombre}</td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem' }}><span className="badge badge-secondary" style={{ backgroundColor: 'var(--bg-tertiary)', fontSize: '0.75rem' }}>{prod.categoria}</span></td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem' }}>
                      {prod.proveedor ? (
                        <span className="badge badge-secondary" style={{ backgroundColor: 'var(--bg-tertiary)', fontSize: '0.75rem' }}>
                          {prod.proveedor.nombre}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem' }}>{getUnitLabel(prod.unidad)}</td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>${parseFloat(prod.precioCosto).toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>{getPriceLabel(prod)}</td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem' }}>{parseFloat(prod.ivaPorcentaje)}%</td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.85rem', fontWeight: 600, color: isUnderMin ? '#ef4444' : 'inherit' }}>
                      {stock.toFixed(3).replace(/\.?0+$/, '')}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem' }}>
                      {isUnderMin ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                          Bajo Mín
                        </span>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>Ok</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.3rem' }}>
                        <button
                          onClick={() => openEditModal(prod)}
                          className="btn btn-secondary btn-sm"
                          title="Editar producto"
                          style={{ padding: '0.3rem 0.5rem', height: 'auto' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => openAdjustModal(prod)}
                          className="btn btn-secondary btn-sm"
                          title="Ajustar stock y precios"
                          style={{ padding: '0.3rem 0.5rem', height: 'auto' }}
                        >
                          <ArrowUpDown size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod)}
                          className="btn btn-secondary btn-sm"
                          title="Eliminar producto"
                          style={{ padding: '0.3rem 0.5rem', height: 'auto', color: '#b91c1c' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No se encontraron productos en el catálogo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: ADD PRODUCT */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>📦 Crear Nuevo Producto</h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAddProduct}>
              <div className="modal-body">
                {addError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {addError}
                  </div>
                )}

                {/* Image */}
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {addImagenPreview ? (
                    <img src={addImagenPreview} alt="Vista previa" style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '0.25rem' }}>
                      Sin imagen
                    </div>
                  )}
                  <div>
                    <label className="form-label" style={{ marginBottom: '0.3rem' }}>Imagen del producto</label>
                    <input
                      ref={addImagenInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAddImageSelection}
                      className="form-input"
                      style={{ padding: '0.4rem' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Subí una foto de referencia para los empleados (opcional).</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Código Único (Barcode / Interno)</label>
                    <input type="text" className="form-input" placeholder="Ej: 77912345" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unidad de Venta</label>
                    <select className="form-select" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                      <option value="unidad">Por Unidad</option>
                      <option value="kg">Por Kilogramo (kg)</option>
                      <option value="g">Por Gramo (g)</option>
                      <option value="par">Par</option>
                      <option value="docena">Docena</option>
                      <option value="pack">Pack</option>
                      <option value="caja">Caja</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proveedor (opcional)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="form-select" value={proveedorIdAdd || ''} onChange={(e) => setProveedorIdAdd(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Sin proveedor</option>
                        {proveedores.map((prov) => (
                          <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                        ))}
                      </select>
                      <button type="button" onClick={openAddProveedorModal} className="btn btn-secondary btn-sm" disabled={savingAddProveedor} style={{ padding: '0.75rem 1rem', height: 'auto' }}>
                        <Plus size={14} />
                        <span style={{ fontSize: '0.85rem' }}>Nuevo</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Códigos de barra alternativos</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Escanéalo o escribilo acá (mismo producto, otro proveedor)"
                      value={addAltInput}
                      onChange={(e) => setAddAltInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAltCode(addAltCodigos, setAddAltCodigos, addAltInput);
                          setAddAltInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        addAltCode(addAltCodigos, setAddAltCodigos, addAltInput);
                        setAddAltInput('');
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {addAltCodigos.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                      {addAltCodigos.map((c) => (
                        <span key={c} className="badge badge-secondary" style={{ padding: '0.3rem 0.6rem' }}>
                          {c}
                          <button type="button" onClick={() => removeAltCode(addAltCodigos, setAddAltCodigos, c)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.3rem', color: '#b91c1c', fontSize: '0.8rem' }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Opcional. Si el mismo artículo viene de otro proveedor con otro código de barra, agregalo así al escanear cualquiera se identifica este producto.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre del Producto</label>
                  <input type="text" className="form-input" placeholder="Ej: Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <input type="text" className="form-input" placeholder="Ej: Categoría del producto" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alícuota IVA (%)</label>
                    <select className="form-select" value={ivaPorcentaje} onChange={(e) => setIvaPorcentaje(e.target.value)}>
                      <option value="21">21.0% (Tasa Estándar)</option>
                      <option value="10.5">10.5% (Tasa Reducida)</option>
                      <option value="0">0.0% (Exento)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Precio de Costo ($)</label>
                    <input type="number" step="0.01" className="form-input" placeholder="0.00" value={precioCosto} onChange={(e) => setPrecioCosto(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio de Venta (Con IVA) ($)</label>
                    <input type="number" step="0.01" className="form-input" placeholder="0.00" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} required />
                  </div>
                </div>

                {renderMargenResumen(precioCosto, precioVenta)}

                <div className="form-group">
                  <label className="form-label">Talles disponibles (para las estadísticas)</label>
                  <SelectorTalles value={talles} onChange={setTalles} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Stock Inicial ({getUnitLabel(unidad)})</label>
                    <input type="number" step="0.001" className="form-input" placeholder="0" value={stockActual} onChange={(e) => setStockActual(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock Mínimo ({getUnitLabel(unidad)})</label>
                    <input type="number" step="0.001" className="form-input" placeholder="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" disabled={savingAdd}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingAdd}>
                  {savingAdd ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  <span>{savingAdd ? 'Creando...' : 'Crear Producto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADJUST STOCK / PRICES */}
      {showAdjustModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>🔄 Ajustar Stock y Precios</h3>
              <button onClick={() => setShowAdjustModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAdjustStock}>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>
                  Ajustando: <strong>{selectedProduct.nombre}</strong> (Stock actual: {parseFloat(selectedProduct.stockActual).toFixed(3).replace(/\.?0+$/, '')} {getUnitLabel(selectedProduct.unidad)})
                </p>

                {adjustError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {adjustError}
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo de Movimiento</label>
                    <select className="form-select" value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}>
                      <option value="compra">Ingreso por Compra (+)</option>
                      <option value="merma">Merma / Desperdicio (-)</option>
                      <option value="ajuste">Re-calibración (Setear Stock Fijo)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cantidad ({getUnitLabel(selectedProduct.unidad)})</label>
                    <input type="number" step="0.001" className="form-input" placeholder="0" value={cantidadAjuste} onChange={(e) => setCantidadAjuste(e.target.value)} required />
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Actualizar Costo ($)</label>
                    <input type="number" step="0.01" className="form-input" value={nuevoPrecioCosto} onChange={(e) => setNuevoPrecioCosto(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{selectedProduct.unidad === 'g' ? 'Actualizar Venta por kg (IVA Incl) ($)' : 'Actualizar Venta (IVA Incl) ($)'}</label>
                    <input type="number" step="0.01" className="form-input" value={nuevoPrecioVenta} onChange={(e) => setNuevoPrecioVenta(e.target.value)} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Ajuste</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL 3: EDIT PRODUCT */}
      {showEditModal && selectedProduct && editForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>✏️ Editar Producto</h3>
              <button onClick={() => setShowEditModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleEditProduct}>
              <div className="modal-body">
                {editError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {editError}
                  </div>
                )}

                {/* Image */}
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {editForm.previewImagenUrl ? (
                    <img src={editForm.previewImagenUrl} alt="Vista previa" style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '0.25rem' }}>
                      Sin imagen
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ marginBottom: '0.3rem' }}>Imagen del producto</label>
                    <input
                      ref={editImagenInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleEditImageSelection}
                      className="form-input"
                      style={{ padding: '0.4rem' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Seleccioná una imagen nueva para reemplazar la actual (opcional).</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Código Único (Barcode / Interno)</label>
                    <input type="text" className="form-input" value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unidad de Venta</label>
                    <select className="form-select" value={editForm.unidad} onChange={(e) => setEditForm({ ...editForm, unidad: e.target.value })}>
                      <option value="unidad">Por Unidad</option>
                      <option value="kg">Por Kilogramo (kg)</option>
                      <option value="g">Por Gramo (g)</option>
                      <option value="par">Par</option>
                      <option value="docena">Docena</option>
                      <option value="pack">Pack</option>
                      <option value="caja">Caja</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proveedor (opcional)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select className="form-select" value={editForm.proveedorId || ''} onChange={(e) => setEditForm({ ...editForm, proveedorId: e.target.value || undefined })} style={{ flex: 1 }}>
                        <option value="">Sin proveedor</option>
                        {proveedores.map((prov) => (
                          <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                        ))}
                      </select>
                      <button type="button" onClick={openAddProveedorModal} className="btn btn-secondary btn-sm" disabled={savingAddProveedor} style={{ padding: '0.75rem 1rem', height: 'auto' }}>
                        <Plus size={14} />
                        <span style={{ fontSize: '0.85rem' }}>Nuevo</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Códigos de barra alternativos</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Escanéalo o escribilo acá (mismo producto, otro proveedor)"
                      value={editAltInput}
                      onChange={(e) => setEditAltInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const current = editForm.codigosAlternativos || [];
                          const code = editAltInput.trim();
                          if (code) setEditForm({ ...editForm, codigosAlternativos: [...current, code] });
                          setEditAltInput('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const current = editForm.codigosAlternativos || [];
                        const code = editAltInput.trim();
                        if (code) setEditForm({ ...editForm, codigosAlternativos: [...current, code] });
                        setEditAltInput('');
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {((editForm.codigosAlternativos || []).length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                      {(editForm.codigosAlternativos || []).map((c: string) => (
                        <span key={c} className="badge badge-secondary" style={{ padding: '0.3rem 0.6rem' }}>
                          {c}
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, codigosAlternativos: (editForm.codigosAlternativos || []).filter((x: string) => x !== c) })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.3rem', color: '#b91c1c', fontSize: '0.8rem' }}
                          >✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Si el mismo artículo viene de otro proveedor con otro código de barra, agregalo así al escanear cualquiera se identifica este producto.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre del Producto</label>
                  <input type="text" className="form-input" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <input type="text" className="form-input" value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alícuota IVA (%)</label>
                    <select className="form-select" value={editForm.ivaPorcentaje} onChange={(e) => setEditForm({ ...editForm, ivaPorcentaje: e.target.value })}>
                      <option value="21">21.0% (Tasa Estándar)</option>
                      <option value="10.5">10.5% (Tasa Reducida)</option>
                      <option value="0">0.0% (Exento)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Precio de Costo ($)</label>
                    <input type="number" step="0.01" className="form-input" value={editForm.precioCosto} onChange={(e) => setEditForm({ ...editForm, precioCosto: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio de Venta (Con IVA) ($)</label>
                    <input type="number" step="0.01" className="form-input" value={editForm.precioVenta} onChange={(e) => setEditForm({ ...editForm, precioVenta: e.target.value })} required />
                  </div>
                </div>

                {renderMargenResumen(editForm.precioCosto, editForm.precioVenta)}

                <div className="form-group">
                  <label className="form-label">Talles disponibles (para las estadísticas)</label>
                  <SelectorTalles
                    value={editForm.talles || []}
                    onChange={(t) => setEditForm({ ...editForm, talles: t })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Stock Actual ({getUnitLabel(editForm.unidad)})</label>
                    <input type="number" step="0.001" className="form-input" value={editForm.stockActual} onChange={(e) => setEditForm({ ...editForm, stockActual: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock Mínimo ({getUnitLabel(editForm.unidad)})</label>
                    <input type="number" step="0.001" className="form-input" value={editForm.stockMinimo} onChange={(e) => setEditForm({ ...editForm, stockMinimo: e.target.value })} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NUEVO PROVEEDOR DESDE PRODUCTOS */}
      {showAddProveedorModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>🚚 Nuevo Proveedor</h3>
              <button onClick={() => setShowAddProveedorModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }}>✕</button>
            </div>
            <form onSubmit={handleAddProveedor}>
              <div className="modal-body">
                {newProvError && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    ⚠️ {newProvError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Nombre del proveedor <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input type="text" className="form-input" value={newProvNombre} onChange={(e) => setNewProvNombre(e.target.value)} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">CUIT</label>
                    <input type="text" className="form-input" placeholder="20-12345678-9" value={newProvCuit} onChange={(e) => setNewProvCuit(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input type="text" className="form-input" placeholder="351-1234567" value={newProvTelefono} onChange={(e) => setNewProvTelefono(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" placeholder="proveedor@ejemplo.com" value={newProvEmail} onChange={(e) => setNewProvEmail(e.target.value)} />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  El proveedor se creará y se seleccionará automáticamente en este producto.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddProveedorModal(false)} className="btn btn-secondary" disabled={savingAddProveedor}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingAddProveedor || !newProvNombre.trim()}>
                  {savingAddProveedor ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  <span>{savingAddProveedor ? 'Creando...' : 'Crear Proveedor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating image preview on hover */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            top: Math.max(previewImage.rect.top - 10, 10),
            left: previewImage.rect.right + 12,
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease-in',
          }}
        >
          <div style={{
            backgroundColor: 'var(--bg-primary, #fff)',
            border: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            padding: '0.5rem',
            maxWidth: '280px',
          }}>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              style={{
                width: '100%',
                maxHeight: '220px',
                objectFit: 'contain',
                borderRadius: 'var(--radius-sm, 4px)',
                display: 'block',
              }}
            />
            <p style={{
              margin: '0.4rem 0 0',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-primary, #111)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {previewImage.name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
