'use client';

import { useCallback, useEffect, useState } from 'react';
import { Scale, Loader2, Search, Star } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { PuntoSemaforo, type Semaforo } from '@/components/costos/Semaforo';
import { formatMoney } from '@/lib/format';

type Opcion = {
  proveedorId: string; proveedor: string; codigoProveedor: string | null; costoLista: number; moneda: string; bonificaciones: string;
  costoReal: number | null; actualizado: string; dias: number; semaforo: Semaforo; preferido: boolean;
};
type Item = { id: string; codigo: string; nombre: string; categoria: string; precioVenta: number; opciones: Opcion[]; mejorProveedorId: string | null; ahorro: number };

export default function ComparadorPage() {
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(5000);
  const { confirm, confirmNode } = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [search, setSearch] = useState('');
  const [soloConviene, setSoloConviene] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/tenant/costos/comparador?search=${encodeURIComponent(search.trim())}`);
    const d = await r.json();
    if (r.ok) setItems(d.items);
    else showToast(d.error || 'No se pudo cargar.', 'error');
  }, [search, showToast]);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar, search]);

  const hacerPreferido = async (item: Item, o: Opcion) => {
    const ok = await confirm({
      title: 'Cambiar proveedor preferido',
      message: `${o.proveedor} pasa a ser el proveedor de "${item.nombre}". El costo vigente pasa a ${o.costoReal !== null ? formatMoney(o.costoReal) : 'el de ese proveedor'} y el precio de venta se recalcula según tus reglas.`,
      confirmText: 'Cambiar',
    });
    if (!ok) return;
    setCambiando(`${item.id}:${o.proveedorId}`);
    try {
      const r = await fetch('/api/tenant/costos/comparador', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: item.id, proveedorId: o.proveedorId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(
        d.actualizados ? 'Proveedor cambiado y precio de venta actualizado.' : d.sugeridos ? 'Proveedor cambiado. El precio nuevo quedó en la bandeja.' : 'Proveedor cambiado.',
        'success'
      );
      await cargar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo cambiar.', 'error');
    } finally {
      setCambiando(null);
    }
  };

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  const visibles = (items ?? []).filter((i) => !soloConviene || i.ahorro > 0);

  return (
    <div>
      {toastNode}
      {confirmNode}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scale size={26} style={{ color: 'var(--primary)' }} />
          <span>Comparador de proveedores</span>
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Productos que te venden varios proveedores: costo real de cada uno (con bonificaciones, IVA, envío y packaging) y cuál conviene.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloConviene} onChange={(e) => setSoloConviene(e.target.checked)} />
          Solo donde otro proveedor es más barato
        </label>
      </div>

      {!items ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></div>
      ) : visibles.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
          {items.length === 0
            ? 'Todavía no hay productos con más de un proveedor. Se vinculan solos cuando importás listas de distintos proveedores con el mismo código.'
            : 'En todos los productos ya tenés el proveedor más barato.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {visibles.map((item) => (
            <div key={item.id} className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1.1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong>{item.nombre}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {item.codigo} · {item.categoria} · venta {formatMoney(item.precioVenta)}</span>
                </div>
                {item.ahorro > 0 && <span className="badge badge-warning">Podés ahorrar {formatMoney(item.ahorro)} por unidad</span>}
              </div>
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
                <table className="table" style={{ fontSize: '0.86rem' }}>
                  <thead>
                    <tr><th>Proveedor</th><th style={{ textAlign: 'right' }}>Lista</th><th style={{ textAlign: 'right' }}>Costo real</th><th>Actualizado</th><th></th></tr>
                  </thead>
                  <tbody>
                    {item.opciones.map((o) => {
                      const esMejor = o.proveedorId === item.mejorProveedorId;
                      return (
                        <tr key={o.proveedorId} style={{ background: esMejor ? '#f0fdf4' : undefined }}>
                          <td>
                            <strong>{o.proveedor}</strong>
                            {o.preferido && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: '0.7rem' }}><Star size={10} /> Preferido</span>}
                            {esMejor && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: '0.7rem' }}>Más barato</span>}
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{o.codigoProveedor ?? 'sin código'}{o.bonificaciones ? ` · bonif. ${o.bonificaciones}` : ''}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{o.moneda === 'USD' ? `US$ ${o.costoLista.toLocaleString('es-AR')}` : formatMoney(o.costoLista)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{o.costoReal === null ? <span style={{ color: '#b91c1c', fontWeight: 400 }}>falta cotización</span> : formatMoney(o.costoReal)}</td>
                          <td><PuntoSemaforo semaforo={o.semaforo} dias={o.dias} /></td>
                          <td style={{ textAlign: 'right' }}>
                            {!o.preferido && (
                              <button type="button" className="btn btn-secondary btn-sm" disabled={!!cambiando || o.costoReal === null} onClick={() => hacerPreferido(item, o)}>
                                {cambiando === `${item.id}:${o.proveedorId}` ? <Loader2 size={14} className="spin" /> : <Star size={14} />} Hacer preferido
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
