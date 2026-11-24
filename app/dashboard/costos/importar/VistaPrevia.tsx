'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Link2, Plus, EyeOff, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatMoney } from '@/lib/format';

type Item = {
  id: string; fila: number; codigo: string | null; descripcion: string | null; precio: number | null; moneda: string | null;
  bonificaciones: string | null; tipoMatch: string; estado: string; alerta: boolean; accion: string; seleccionado: boolean;
  error: string | null; costoListaAnterior: number | null; variacionPct: number | null;
  producto: { id: string; codigo: string; nombre: string; precioCosto: number; precioVenta: number } | null;
  sugerencia: { id: string; codigo: string; nombre: string; proveedor: string | null } | null;
  afectaVigente: boolean; costoNuevo: number | null; precioNuevo: number | null; recargo: number | null; bajoMinimo: boolean;
};
type Contadores = { subas: number; bajas: number; sinCambios: number; nuevos: number; faltantes: number; errores: number; alertas: number; seleccionados: number };
type Datos = {
  importacion: { id: string; estado: string; archivoNombre: string; fechaVigencia: string; totalFilas: number; proveedor: { nombre: string }; incluyeIva: boolean };
  contadores: Contadores;
  config: { modoPrecio: string; cotizacion: number | null; margenMinimo: number };
  items: Item[]; total: number; page: number; totalPages: number;
};

const FILTROS: { clave: string; etiqueta: string; contador: (c: Contadores) => number; masivo: boolean }[] = [
  { clave: 'TODOS', etiqueta: 'Todos', contador: (c) => c.subas + c.bajas + c.sinCambios + c.nuevos + c.faltantes + c.errores, masivo: true },
  { clave: 'SUBA', etiqueta: '🔺 Subieron', contador: (c) => c.subas, masivo: true },
  { clave: 'BAJA', etiqueta: '🔻 Bajaron', contador: (c) => c.bajas, masivo: true },
  { clave: 'IGUAL', etiqueta: '= Sin cambios', contador: (c) => c.sinCambios, masivo: true },
  { clave: 'NUEVO', etiqueta: '🆕 Nuevos', contador: (c) => c.nuevos, masivo: true },
  { clave: 'FALTANTE', etiqueta: '❓ No vinieron', contador: (c) => c.faltantes, masivo: false },
  { clave: 'ALERTA', etiqueta: '⚠️ Revisar', contador: (c) => c.alertas, masivo: true },
  { clave: 'ERROR', etiqueta: 'Con error', contador: (c) => c.errores, masivo: false },
];

const fmtMoneda = (v: number | null, moneda?: string | null) =>
  v === null ? '—' : moneda === 'USD' ? `US$ ${v.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatMoney(v);

const ESTADO_BADGE: Record<string, { clase: string; texto: string }> = {
  SUBA: { clase: 'badge-danger', texto: 'Subió' },
  BAJA: { clase: 'badge-success', texto: 'Bajó' },
  IGUAL: { clase: 'badge-info', texto: 'Igual' },
  NUEVO: { clase: 'badge-warning', texto: 'Nuevo' },
  FALTANTE: { clase: 'badge-warning', texto: 'No vino' },
  ERROR: { clase: 'badge-danger', texto: 'Error' },
};

export default function VistaPrevia({ id }: { id: string }) {
  const router = useRouter();
  const { showToast, toastNode } = useToast(5000);
  const { confirm, confirmNode } = useConfirm();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('TODOS');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [vinculando, setVinculando] = useState<Item | null>(null);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ filtro, page: String(page), pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    try {
      const r = await fetch(`/api/tenant/listas/importaciones/${id}?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar la vista previa.');
      setDatos(d);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setCargando(false);
    }
  }, [id, filtro, page, search, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [cargar, search]);

  const editable = datos?.importacion.estado === 'BORRADOR';

  const patch = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/tenant/listas/importaciones/${id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      showToast(d.error || 'No se pudo actualizar.', 'error');
      return false;
    }
    await cargar();
    return true;
  };

  const aplicar = async () => {
    if (!datos) return;
    const c = datos.contadores;
    const modo = datos.config.modoPrecio === 'AUTOMATICO'
      ? 'Los precios de venta se actualizan automáticamente.'
      : 'Los precios de venta nuevos quedan en la bandeja de precios sugeridos para que los apruebes.';
    const ok = await confirm({
      title: 'Aplicar cambios',
      message: `Se van a aplicar ${c.seleccionados} filas de la lista de ${datos.importacion.proveedor.nombre}. ${modo} Si algo sale mal, podés deshacer esta importación.`,
      confirmText: 'Aplicar',
    });
    if (!ok) return;
    setAplicando(true);
    try {
      const r = await fetch(`/api/tenant/listas/importaciones/${id}/aplicar`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo aplicar.');
      const partes = [`${d.costosActualizados} costos actualizados`];
      if (d.creados) partes.push(`${d.creados} productos nuevos en el Catálogo`);
      if (d.preciosActualizados) partes.push(`${d.preciosActualizados} precios de venta actualizados`);
      if (d.preciosSugeridos) partes.push(`${d.preciosSugeridos} precios sugeridos para revisar`);
      showToast(`Listo: ${partes.join(', ')}.`, 'success');
      // Si entraron productos nuevos se va al Catálogo para verlos; si no, al historial.
      setTimeout(() => router.push(d.creados ? '/dashboard/catalogo' : '/dashboard/costos/importaciones'), 1200);
    } catch (e) {
      showToast((e as Error).message, 'error');
      setAplicando(false);
    }
  };

  const descartar = async () => {
    const ok = await confirm({
      title: 'Descartar importación',
      message: 'Se descarta esta vista previa. No se modifica ningún costo.',
      confirmText: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/tenant/listas/importaciones/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/dashboard/costos/importar');
    else showToast((await r.json()).error || 'No se pudo descartar.', 'error');
  };

  if (cargando && !datos) {
    return <div className="card" style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  }
  if (!datos) return <div className="card">{toastNode}No se encontró la importación.</div>;

  const { importacion, contadores, config, items } = datos;
  const filtroActual = FILTROS.find((f) => f.clave === filtro);

  return (
    <div style={{ paddingBottom: editable ? '5rem' : 0 }}>
      {toastNode}
      {confirmNode}

      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: '1.05rem' }}>{importacion.proveedor.nombre}</strong>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {importacion.archivoNombre} · vigencia {new Date(importacion.fechaVigencia).toLocaleDateString('es-AR')} · precios {importacion.incluyeIva ? 'con' : 'sin'} IVA
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          <div>Precios de venta: <strong>{config.modoPrecio === 'AUTOMATICO' ? 'se actualizan solos' : 'van a la bandeja para aprobar'}</strong></div>
          <div>Dólar: <strong>{config.cotizacion ? formatMoney(config.cotizacion) : 'sin cotización cargada'}</strong></div>
        </div>
      </div>

      {!editable && (
        <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <CheckCircle2 size={18} /> Esta importación está {importacion.estado.toLowerCase()}. Se muestra solo para consulta.
        </div>
      )}

      {/* Filtros con contadores */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            className={`btn btn-sm ${filtro === f.clave ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFiltro(f.clave); setPage(1); }}
          >
            {f.etiqueta} <span style={{ opacity: 0.8 }}>({f.contador(contadores)})</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar código o descripción" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {editable && filtroActual?.masivo && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ filtro, seleccionado: true })}>Seleccionar todos</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ filtro, seleccionado: false })}>Quitar selección</button>
          </>
        )}
        {filtro === 'NUEVO' && editable && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Los nuevos no se crean salvo que los selecciones.</span>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Fila</th>
                <th>En la lista</th>
                <th>En tu sistema</th>
                <th style={{ textAlign: 'right' }}>Costo de lista</th>
                <th style={{ textAlign: 'right' }}>Var.</th>
                <th style={{ textAlign: 'right' }}>Costo vigente</th>
                <th style={{ textAlign: 'right' }}>Precio de venta</th>
                <th style={{ textAlign: 'right' }}>Recargo</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No hay filas en este filtro.</td></tr>
              )}
              {items.map((i) => {
                const seleccionable = editable && !['FALTANTE', 'ERROR'].includes(i.estado);
                const badge = ESTADO_BADGE[i.estado];
                return (
                  <tr key={i.id} style={{ background: i.alerta ? '#fff7ed' : undefined, opacity: i.estado === 'ERROR' ? 0.7 : 1 }}>
                    <td>
                      {seleccionable && (
                        <input
                          type="checkbox"
                          checked={i.seleccionado && i.accion !== 'IGNORAR'}
                          onChange={(e) => patch({ ids: [i.id], seleccionado: e.target.checked })}
                          aria-label="Aplicar esta fila"
                        />
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{i.fila || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {badge && <span className={`badge ${badge.clase}`} style={{ fontSize: '0.7rem' }}>{badge.texto}</span>}
                        {i.alerta && <span title="Variación fuera de lo normal: revisá que no sea un error de la lista"><AlertTriangle size={14} style={{ color: '#c2410c' }} /></span>}
                        <strong>{i.codigo || 's/código'}</strong>
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>{i.descripcion}</div>
                      {i.error && <div style={{ color: '#b91c1c' }}>{i.error}</div>}
                    </td>
                    <td>
                      {i.producto ? (
                        <>
                          <div>{i.producto.nombre}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {i.producto.codigo}
                            {i.tipoMatch === 'CODIGO' && ' · encontrado por código interno'}
                            {i.tipoMatch === 'OEM' && ' · encontrado por N° de parte'}
                            {i.accion === 'VINCULAR' && ' · vinculado a mano'}
                            {!i.afectaVigente && ' · no es el proveedor preferido'}
                          </div>
                        </>
                      ) : i.estado === 'NUEVO' ? (
                        <AccionesNuevo item={i} editable={!!editable} onPatch={patch} onVincular={() => setVinculando(i)} />
                      ) : '—'}
                      {i.estado === 'NUEVO' && i.producto && editable && (
                        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => patch({ ids: [i.id], accion: 'CREAR' })}>
                          Deshacer vínculo
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {i.costoListaAnterior !== null && i.estado !== 'FALTANTE' && (
                        <div style={{ color: 'var(--text-muted)', textDecoration: 'line-through', fontSize: '0.78rem' }}>{fmtMoneda(i.costoListaAnterior, i.moneda)}</div>
                      )}
                      {i.estado === 'FALTANTE' ? fmtMoneda(i.costoListaAnterior, i.moneda) : fmtMoneda(i.precio, i.moneda)}
                      {i.bonificaciones && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>bonif. {i.bonificaciones}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: i.variacionPct === null ? 'var(--text-muted)' : i.variacionPct > 0 ? '#b91c1c' : i.variacionPct < 0 ? '#15803d' : undefined }}>
                      {i.variacionPct === null ? '—' : `${i.variacionPct > 0 ? '+' : ''}${i.variacionPct.toFixed(1)}%`}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {i.producto && i.afectaVigente && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatMoney(i.producto.precioCosto)}</div>
                      )}
                      {i.costoNuevo !== null ? formatMoney(i.costoNuevo) : i.moneda === 'USD' && !config.cotizacion ? <span style={{ color: '#b91c1c' }}>falta cotización</span> : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {i.producto && i.afectaVigente && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatMoney(i.producto.precioVenta)}</div>
                      )}
                      {i.precioNuevo !== null ? <strong>{formatMoney(i.precioNuevo)}</strong> : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: i.bajoMinimo ? '#b91c1c' : undefined, fontWeight: i.bajoMinimo ? 700 : undefined }} title={i.bajoMinimo ? `Por debajo del mínimo (${config.margenMinimo}%)` : undefined}>
                      {i.recargo === null ? '—' : `${i.recargo.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {datos.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {datos.page} de {datos.totalPages} · {datos.total.toLocaleString('es-AR')} filas</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= datos.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}

      {editable && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: '1rem', background: 'var(--bg-secondary, #fff)', borderTop: '1px solid var(--border-color)',
          padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.04)', borderRadius: 'var(--radius-md)',
        }}>
          <span><strong>{contadores.seleccionados.toLocaleString('es-AR')}</strong> filas seleccionadas para aplicar</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={descartar} disabled={aplicando}><Trash2 size={16} /> Descartar</button>
            <button type="button" className="btn btn-primary" onClick={aplicar} disabled={aplicando || contadores.seleccionados === 0}>
              {aplicando ? <><Loader2 size={16} className="spin" /> Aplicando…</> : 'Aplicar cambios'}
            </button>
          </div>
        </div>
      )}

      {vinculando && (
        <ModalVincular
          item={vinculando}
          onCerrar={() => setVinculando(null)}
          onElegir={async (productoId) => {
            const ok = await patch({ ids: [vinculando.id], accion: 'VINCULAR', productoId });
            if (ok) setVinculando(null);
          }}
        />
      )}
    </div>
  );
}

function AccionesNuevo({ item, editable, onPatch, onVincular }: {
  item: Item; editable: boolean; onPatch: (b: Record<string, unknown>) => Promise<boolean>; onVincular: () => void;
}) {
  if (!editable) return <span style={{ color: 'var(--text-muted)' }}>{item.accion === 'CREAR' && item.seleccionado ? 'Entra al catálogo' : 'No existe'}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {item.sugerencia && (
        <div style={{ padding: '0.45rem 0.55rem', borderRadius: 'var(--radius-md)', background: '#fef3c7', fontSize: '0.78rem', lineHeight: 1.35 }}>
          {item.tipoMatch === 'CODIGO' ? 'Mismo código que ' : item.tipoMatch === 'OEM' ? 'Mismo N° de parte que ' : 'Se parece a '}
          <strong>«{item.sugerencia.nombre}»</strong> ({item.sugerencia.codigo}{item.sugerencia.proveedor ? `, de ${item.sugerencia.proveedor}` : ''}).
          {' '}<strong>¿Es el mismo producto?</strong>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="button" className={`btn btn-sm ${item.accion === 'VINCULAR' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onPatch({ ids: [item.id], accion: 'VINCULAR', productoId: item.sugerencia!.id })}
            >
              <Link2 size={14} /> Sí, es el mismo
            </button>
            <button
              type="button" className={`btn btn-sm ${item.accion === 'CREAR' && item.seleccionado ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onPatch({ ids: [item.id], accion: 'CREAR' })}
            >
              <Plus size={14} /> No, es otro producto
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className={`btn btn-sm ${item.accion === 'CREAR' && item.seleccionado ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onPatch({ ids: [item.id], accion: 'CREAR' })}>
          <Plus size={14} /> Al catálogo
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onVincular}><Link2 size={14} /> Vincular</button>
        <button type="button" className={`btn btn-sm ${item.accion === 'IGNORAR' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onPatch({ ids: [item.id], accion: 'IGNORAR' })}>
          <EyeOff size={14} /> Ignorar
        </button>
      </div>
    </div>
  );
}

function ModalVincular({ item, onCerrar, onElegir }: { item: Item; onCerrar: () => void; onElegir: (id: string) => void }) {
  const [q, setQ] = useState(item.descripcion?.split(' ').slice(0, 2).join(' ') || '');
  const [resultados, setResultados] = useState<{ id: string; codigo: string; nombre: string; categoria: string }[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/tenant/productos?page=1&pageSize=15&search=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setResultados(Array.isArray(d.items) ? d.items : []);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Vincular a un producto existente</h3>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            En la lista: <strong>{item.codigo}</strong> {item.descripcion}
          </p>
          <input className="form-input" autoFocus placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: '0.5rem' }}>
            {buscando && <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Buscando…</div>}
            {!buscando && resultados.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Sin resultados.</div>}
            {resultados.map((p) => (
              <button
                key={p.id} type="button" onClick={() => onElegir(p.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
              >
                <strong>{p.nombre}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {p.codigo} · {p.categoria}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
