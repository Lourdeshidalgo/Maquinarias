'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Search, Loader2, PackagePlus, ImageOff, X, LayoutGrid, Table2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatMoney } from '@/lib/format';
import { estadoCatalogo, type EstadoCatalogo } from '@/lib/catalogo';
import { DesgloseProducto } from '@/components/costos/DesgloseCosto';

// Catálogo: lo que hay en Stock + lo que venden los proveedores (productos "solo de
// catálogo", que entran desde las listas importadas). Desde acá se agregan a Stock.

type Item = {
  id: string; codigo: string; nombre: string; categoria: string; imagenUrl: string | null; marca: string | null;
  codigoFabricante: string | null; proveedor: string | null; cantidadProveedores: number;
  precioVenta: number; precioCredito: number; stockActual: number; soloCatalogo: boolean;
  lista: { costoLista: number; moneda: string; precioContado: number | null; precioTarjeta: number | null } | null;
};
type Vista = 'tabla' | 'tarjetas';
const CLAVE_VISTA = 'catalogo.vista';
type Datos = { total: number; page: number; pageSize: number; items: Item[]; proveedores: { id: string; nombre: string }[]; categorias: string[] };
type OpcionProveedor = { proveedorId: string; proveedor: string; costoReal: number | null; preferido: boolean; costoLista: number; moneda: string };

const ESTADO: Record<EstadoCatalogo, { texto: (n: number) => string; color: string; fondo: string }> = {
  stock: { texto: (n) => `● En stock: ${n.toLocaleString('es-AR')}`, color: '#15803d', fondo: '#dcfce7' },
  'sin-stock': { texto: () => '○ Sin stock', color: '#b45309', fondo: '#fef3c7' },
  lista: { texto: () => '◇ Solo en lista', color: '#4338ca', fondo: '#e0e7ff' },
};

const listaTexto = (l: { costoLista: number; moneda: string }) =>
  l.moneda === 'USD' ? `US$ ${l.costoLista.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : formatMoney(l.costoLista);

export default function CatalogoPage() {
  const { showToast, toastNode } = useToast(5000);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [search, setSearch] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tengo, setTengo] = useState(false);
  const [page, setPage] = useState(1);
  const [cargarStock, setCargarStock] = useState<Item | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState<Item | null>(null);
  const [opciones, setOpciones] = useState<OpcionProveedor[] | null>(null);
  // "Como el Excel" (tabla por categoría) o tarjetas; se recuerda en este navegador.
  const [vista, setVista] = useState<Vista>(() => {
    try {
      return (typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_VISTA) === 'tarjetas') ? 'tarjetas' : 'tabla';
    } catch {
      return 'tabla';
    }
  });
  const cambiarVista = (v: Vista) => {
    setVista(v);
    setPage(1);
    try { window.localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento: no pasa nada */ }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (vista === 'tabla') qs.set('vista', 'tabla');
    if (search.trim()) qs.set('search', search.trim());
    if (proveedorId) qs.set('proveedorId', proveedorId);
    if (categoria) qs.set('categoria', categoria);
    if (tengo) qs.set('tengo', '1');
    try {
      const r = await fetch(`/api/tenant/catalogo?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDatos(d);
    } catch (e) {
      showToast((e as Error).message || 'No se pudo cargar el catálogo.', 'error');
    } finally {
      setCargando(false);
    }
  }, [page, search, proveedorId, categoria, tengo, vista, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, search]);

  // Al abrir el detalle: precio de cada proveedor que lo vende (si son varios).
  useEffect(() => {
    if (!detalle || detalle.cantidadProveedores < 2) return;
    let vigente = true;
    fetch(`/api/tenant/costos/comparador?search=${encodeURIComponent(detalle.codigo)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (!vigente) return;
        const item = (d.items || []).find((x: { id: string }) => x.id === detalle.id);
        setOpciones(item ? item.opciones : []);
      })
      .catch(() => vigente && setOpciones([]));
    return () => {
      vigente = false;
    };
  }, [detalle]);

  const filtrar = (cambio: () => void) => {
    cambio();
    setPage(1);
  };

  const confirmarStock = async () => {
    if (!cargarStock) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/tenant/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: cargarStock.id, cantidad }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(
        cargarStock.soloCatalogo
          ? `${cargarStock.nombre} se agregó a Stock (${d.stockActual.toLocaleString('es-AR')} unidades). Ya se puede vender.`
          : `Stock de ${cargarStock.nombre}: ${d.stockActual.toLocaleString('es-AR')} unidades.`,
        'success'
      );
      setCargarStock(null);
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.pageSize)) : 1;

  return (
    <div>
      {toastNode}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={26} style={{ color: 'var(--primary)' }} /> Catálogo
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Lo que tenés en Stock y lo que venden tus proveedores (de las listas que importaste), con el precio de venta al día.
        </p>
      </div>

      {/* Buscador y filtros */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar por código, nombre, N° de parte o modelo…"
            value={search} onChange={(e) => filtrar(() => setSearch(e.target.value))} aria-label="Buscar en el catálogo"
          />
        </div>
        <select className="form-select" style={{ flex: '0 1 200px' }} value={proveedorId} onChange={(e) => filtrar(() => setProveedorId(e.target.value))} aria-label="Proveedor">
          <option value="">Todos los proveedores</option>
          {datos?.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="form-select" style={{ flex: '0 1 200px' }} value={categoria} onChange={(e) => filtrar(() => setCategoria(e.target.value))} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {datos?.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={tengo} onChange={(e) => filtrar(() => setTengo(e.target.checked))} /> Solo lo que tengo
        </label>
        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }} role="group" aria-label="Vista">
          <button type="button" className={`btn btn-sm ${vista === 'tabla' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => cambiarVista('tabla')} aria-pressed={vista === 'tabla'}>
            <Table2 size={14} /> Como el Excel
          </button>
          <button type="button" className={`btn btn-sm ${vista === 'tarjetas' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => cambiarVista('tarjetas')} aria-pressed={vista === 'tarjetas'}>
            <LayoutGrid size={14} /> Tarjetas
          </button>
        </div>
      </div>

      {/* Tarjetas */}
      {cargando && !datos ? (
        <p style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="spin" /> Cargando…</p>
      ) : datos && datos.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
          No hay productos con ese filtro. Para sumar productos de un proveedor, importá su lista en <strong>Importar lista</strong>.
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {datos?.total.toLocaleString('es-AR')} productos {cargando && <Loader2 size={14} className="spin" />}
          </p>
          {vista === 'tabla' && datos && (
            <TablaExcel
              items={datos.items}
              conProveedor={!proveedorId}
              onDetalle={(it) => { setOpciones(null); setDetalle(it); }}
              onStock={(it) => { setCantidad(''); setCargarStock(it); }}
            />
          )}
          <div style={{ display: vista === 'tabla' ? 'none' : 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {vista === 'tarjetas' && datos?.items.map((it) => {
              const est = estadoCatalogo(it);
              return (
                <div key={it.id} className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: 0 }}>
                  <button
                    type="button" onClick={() => { setOpciones(null); setDetalle(it); }}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                    aria-label={`Ver detalle de ${it.nombre}`}
                  >
                    <div style={{ height: 120, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {it.imagenUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={it.imagenUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        : <ImageOff size={28} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                    <strong style={{ fontSize: '0.92rem', lineHeight: 1.25 }}>{it.nombre}</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {it.codigo}{it.proveedor ? ` · ${it.proveedor}` : ''}{it.cantidadProveedores > 1 ? ` (+${it.cantidadProveedores - 1})` : ''}
                    </span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>{formatMoney(it.precioVenta)}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Crédito {formatMoney(it.precioCredito)}</span>
                  </button>
                  <span style={{ alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 999, color: ESTADO[est].color, background: ESTADO[est].fondo }}>
                    {ESTADO[est].texto(it.stockActual)}
                  </span>
                  {est !== 'stock' && (
                    <button
                      type="button" className={`btn btn-sm ${est === 'lista' ? 'btn-primary' : 'btn-secondary'}`} style={{ marginTop: 'auto' }}
                      onClick={() => { setCantidad(''); setCargarStock(it); }}
                    >
                      <PackagePlus size={14} /> {est === 'lista' ? 'Agregar a Stock' : 'Cargar stock'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {page} de {totalPaginas}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* Agregar a Stock / Cargar stock */}
      {cargarStock && (
        <div className="modal-overlay" onClick={() => !guardando && setCargarStock(null)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{cargarStock.soloCatalogo ? 'Agregar a Stock' : 'Cargar stock'}</h3></div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.75rem' }}><strong>{cargarStock.nombre}</strong> <span style={{ color: 'var(--text-muted)' }}>({cargarStock.codigo})</span></p>
              <label className="form-label" htmlFor="cantidad-stock">¿Cuántas unidades tenés?</label>
              <input
                id="cantidad-stock" className="form-input" inputMode="decimal" placeholder="0" autoFocus
                value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && confirmarStock()}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {cargarStock.soloCatalogo
                  ? 'Pasa a Stock y ya se puede vender. Si todavía no lo tenés, dejalo en 0 y cargá el stock cuando llegue.'
                  : 'Se suma al stock actual (ingreso por compra).'}
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCargarStock(null)} disabled={guardando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={confirmarStock} disabled={guardando}>
                {guardando && <Loader2 size={16} className="spin" />} {cargarStock.soloCatalogo ? 'Agregar a Stock' : 'Cargar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{detalle.nombre}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetalle(null)} aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                {detalle.codigo}
                {detalle.codigoFabricante ? ` · N° de parte ${detalle.codigoFabricante}` : ''}
                {detalle.marca ? ` · ${detalle.marca}` : ''} · {detalle.categoria}
                {detalle.lista ? ` · lista ${listaTexto(detalle.lista)}` : ''}
              </div>
              <DesgloseProducto productoId={detalle.id} />
              {detalle.cantidadProveedores > 1 && (
                <div>
                  <h4 style={{ marginBottom: '0.4rem' }}>Lo venden {detalle.cantidadProveedores} proveedores</h4>
                  {!opciones ? <Loader2 size={16} className="spin" /> : (
                    <table className="table" style={{ fontSize: '0.85rem' }}>
                      <thead><tr><th>Proveedor</th><th>Lista</th><th style={{ textAlign: 'right' }}>Costo</th></tr></thead>
                      <tbody>
                        {opciones.map((o) => (
                          <tr key={o.proveedorId}>
                            <td>{o.proveedor}{o.preferido ? ' ★' : ''}</td>
                            <td>{listaTexto({ costoLista: o.costoLista, moneda: o.moneda })}</td>
                            <td style={{ textAlign: 'right' }}>{o.costoReal === null ? 'falta el dólar' : formatMoney(o.costoReal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>★ el que se usa para el precio. Se cambia en Comparar proveedores.</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {estadoCatalogo(detalle) !== 'stock' && (
                <button type="button" className="btn btn-primary" onClick={() => { setCantidad(''); setCargarStock(detalle); setDetalle(null); }}>
                  <PackagePlus size={16} /> {detalle.soloCatalogo ? 'Agregar a Stock' : 'Cargar stock'}
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const plata = (n: number | null | undefined, moneda = 'ARS') =>
  n == null ? '—' : moneda === 'USD' ? `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatMoney(n);

/**
 * Vista "como el Excel": por categoría, con el precio de lista del proveedor y los
 * precios al contado y con tarjeta que trae su lista. Si la lista no los trae, se
 * muestran los que calcula el sistema (en gris). Si el sistema vende a otro precio
 * que el de la lista, se avisa.
 */
function TablaExcel({ items, conProveedor, onDetalle, onStock }: {
  items: Item[]; conProveedor: boolean; onDetalle: (it: Item) => void; onStock: (it: Item) => void;
}) {
  const columnas = conProveedor ? 7 : 6;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
        <table className="table" style={{ fontSize: '0.86rem' }}>
          <thead>
            <tr>
              <th>Código</th><th>Descripción</th>{conProveedor && <th>Proveedor</th>}
              <th style={{ textAlign: 'right' }}>Precio lista</th>
              <th style={{ textAlign: 'right' }}>Efectivo</th>
              <th style={{ textAlign: 'right' }}>Tarjeta</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const titulo = i === 0 || items[i - 1].categoria !== it.categoria ? it.categoria : null;
              const est = estadoCatalogo(it);
              const contadoLista = it.lista?.precioContado ?? null;
              const tarjetaLista = it.lista?.precioTarjeta ?? null;
              const moneda = 'ARS'; // efectivo y tarjeta de la lista vienen en pesos (aunque el precio de lista sea en dólares)
              const difiere = contadoLista != null && Math.abs(it.precioVenta - contadoLista) > Math.max(1, contadoLista * 0.01);
              return (
                <Fila key={it.id} titulo={titulo} columnas={columnas}>
                  <td style={{ whiteSpace: 'nowrap' }}>{it.codigo}</td>
                  <td>
                    <button type="button" onClick={() => onDetalle(it)} style={{ all: 'unset', cursor: 'pointer' }} aria-label={`Ver detalle de ${it.nombre}`}>
                      {it.nombre}
                    </button>
                  </td>
                  {conProveedor && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{it.proveedor ?? '—'}</td>}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{it.lista ? plata(it.lista.costoLista, it.lista.moneda) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {contadoLista != null ? plata(contadoLista, moneda) : <span style={{ color: 'var(--text-muted)' }} title="Precio que calcula el sistema">{plata(it.precioVenta)}</span>}
                    {difiere && (
                      <div style={{ fontSize: '0.7rem', fontWeight: 400, color: '#b45309' }} title="El precio de venta del sistema no coincide con el de la lista">
                        el sistema vende a {plata(it.precioVenta)}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {tarjetaLista != null
                      ? plata(tarjetaLista, moneda)
                      : contadoLista != null
                        ? '—'
                        : <span style={{ color: 'var(--text-muted)' }} title="Precio con tarjeta que calcula el sistema">{plata(it.precioCredito)}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {est === 'stock' ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: ESTADO.stock.color }}>{ESTADO.stock.texto(it.stockActual)}</span>
                    ) : (
                      <button type="button" className={`btn btn-sm ${est === 'lista' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onStock(it)}>
                        <PackagePlus size={13} /> {est === 'lista' ? 'Agregar' : 'Cargar'}
                      </button>
                    )}
                  </td>
                </Fila>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fila({ titulo, columnas, children }: { titulo: string | null; columnas: number; children: React.ReactNode }) {
  return (
    <>
      {titulo !== null && (
        <tr>
          <td colSpan={columnas} style={{ background: 'var(--bg-tertiary)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            {titulo || 'Sin categoría'}
          </td>
        </tr>
      )}
      <tr>{children}</tr>
    </>
  );
}
