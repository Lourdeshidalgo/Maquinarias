'use client';

import { useCallback, useEffect, useState } from 'react';
import { Percent, Loader2, Save, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';
import { formatMoney } from '@/lib/format';

type Config = {
  margenGeneral: number; margenMinimo: number; redondeo: number; modoPrecio: string; ivaEnCosto: boolean;
  umbralAmarillo: number; umbralRojo: number; alertaSubaPct: number; alertaBajaPct: number;
};
type Regla = { id: string; tipo: string; categoria: string | null; proveedorId: string | null; proveedorNombre: string | null; margen: number };
type Datos = { config: Config; reglas: Regla[]; categorias: { nombre: string; productos: number }[]; proveedores: { id: string; nombre: string; productos: number }[] };
type Alcance = { tipo: 'TODOS' | 'CATEGORIA' | 'PROVEEDOR'; valor?: string; etiqueta: string };
type Preview = {
  total: number; bajoMinimo: number; margenMinimo: number; modoPrecio: string;
  filas: { productoId: string; codigo: string; nombre: string; costoReal: number; precioActual: number; precioNuevo: number; margen: number; nivel: string; recargoNuevo: number | null; bajoMinimo: boolean }[];
};

const NIVEL: Record<string, string> = { PRODUCTO: 'del producto', CATEGORIA: 'de la categoría', PROVEEDOR: 'del proveedor', GENERAL: 'general' };

export default function MargenesPage() {
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(5000);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, string>>({}); // clave: 'CAT:<nombre>' | 'PROV:<id>'
  const [recalculo, setRecalculo] = useState<{ alcance: Alcance; preview: Preview | null; aplicando: boolean } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/tenant/costos/configuracion');
    const d = await r.json();
    if (!r.ok) {
      showToast(d.error || 'No se pudo cargar la configuración.', 'error');
      return;
    }
    setDatos(d);
    setConfig(d.config);
    setEdicion({});
  }, [showToast]);

  useEffect(() => {
    if (!modulo.activo) return;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [modulo.activo, cargar]);

  const guardarConfig = async () => {
    if (!config) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/tenant/costos/configuracion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      showToast('Configuración guardada.', 'success');
      await cargar();
      setRecalculo({ alcance: { tipo: 'TODOS', etiqueta: 'todos los productos' }, preview: null, aplicando: false });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const reglaDe = (tipo: 'CATEGORIA' | 'PROVEEDOR', clave: string) =>
    datos?.reglas.find((r) => r.tipo === tipo && (tipo === 'CATEGORIA' ? r.categoria?.toLowerCase() === clave.toLowerCase() : r.proveedorId === clave));

  const guardarRegla = async (tipo: 'CATEGORIA' | 'PROVEEDOR', clave: string, etiqueta: string) => {
    const k = `${tipo}:${clave}`;
    const valor = edicion[k];
    const existente = reglaDe(tipo, clave);
    try {
      if (valor === '' && existente) {
        const r = await fetch(`/api/tenant/costos/reglas?id=${existente.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error((await r.json()).error);
      } else if (valor !== undefined && valor !== '') {
        const r = await fetch('/api/tenant/costos/reglas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, margen: valor, ...(tipo === 'CATEGORIA' ? { categoria: clave } : { proveedorId: clave }) }),
        });
        if (!r.ok) throw new Error((await r.json()).error);
      } else {
        return;
      }
      await cargar();
      setRecalculo({ alcance: { tipo, valor: clave, etiqueta }, preview: null, aplicando: false });
    } catch (e) {
      showToast((e as Error).message || 'No se pudo guardar la regla.', 'error');
    }
  };

  // Vista previa del recálculo
  useEffect(() => {
    if (!recalculo || recalculo.preview) return;
    fetch('/api/tenant/costos/recalcular', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alcance: { tipo: recalculo.alcance.tipo, valor: recalculo.alcance.valor } }),
    })
      .then((r) => r.json())
      .then((d) => setRecalculo((rc) => (rc ? { ...rc, preview: d } : rc)))
      .catch(() => setRecalculo(null));
  }, [recalculo]);

  const aplicarRecalculo = async () => {
    if (!recalculo) return;
    setRecalculo({ ...recalculo, aplicando: true });
    try {
      const r = await fetch('/api/tenant/costos/recalcular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alcance: { tipo: recalculo.alcance.tipo, valor: recalculo.alcance.valor }, aplicar: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      showToast(d.actualizados ? `${d.actualizados} precios actualizados.` : `${d.sugeridos} precios enviados a la bandeja para aprobar.`, 'success');
      setRecalculo(null);
    } catch (e) {
      showToast((e as Error).message || 'No se pudo recalcular.', 'error');
      setRecalculo((rc) => (rc ? { ...rc, aplicando: false } : rc));
    }
  };

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;
  if (!datos || !config) return <div style={{ padding: '2rem', textAlign: 'center' }}>{toastNode}<Loader2 className="spin" /></div>;

  const campo = (k: keyof Config, etiqueta: string, ayuda?: string, sufijo = '%') => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{etiqueta}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input
          type="number" step="0.01" min={0} className="form-input" value={String(config[k])}
          onChange={(e) => setConfig({ ...config, [k]: e.target.value === '' ? '' : parseFloat(e.target.value) } as Config)}
        />
        <span style={{ color: 'var(--text-muted)' }}>{sufijo}</span>
      </div>
      {ayuda && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{ayuda}</p>}
    </div>
  );

  const filaRegla = (tipo: 'CATEGORIA' | 'PROVEEDOR', clave: string, nombre: string, productos: number) => {
    const k = `${tipo}:${clave}`;
    const regla = reglaDe(tipo, clave);
    const valor = edicion[k] ?? (regla ? String(regla.margen) : '');
    const cambiado = edicion[k] !== undefined && edicion[k] !== (regla ? String(regla.margen) : '');
    return (
      <tr key={k}>
        <td>{nombre}</td>
        <td style={{ color: 'var(--text-muted)' }}>{productos}</td>
        <td style={{ width: 170 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input
              type="number" step="0.01" min={0} className="form-input" style={{ padding: '0.35rem 0.5rem' }}
              placeholder={`${config.margenGeneral} (general)`} value={valor}
              onChange={(e) => setEdicion({ ...edicion, [k]: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarRegla(tipo, clave, nombre); }}
            />
            <span style={{ color: 'var(--text-muted)' }}>%</span>
          </div>
        </td>
        <td style={{ width: 120, textAlign: 'right' }}>
          {cambiado && <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarRegla(tipo, clave, nombre)}><Save size={14} /> Guardar</button>}
          {!cambiado && regla && (
            <button type="button" className="btn btn-secondary btn-sm" title="Quitar regla (usa el recargo general)" onClick={() => { setEdicion({ ...edicion, [k]: '' }); }}>
              <Trash2 size={14} />
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      {toastNode}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Percent size={26} style={{ color: 'var(--primary)' }} />
          <span>Márgenes y reglas de precios</span>
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Precio de venta = costo real × (1 + recargo). Gana el más específico: producto → categoría → proveedor → general.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>General</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem' }}>
          {campo('margenGeneral', 'Recargo general', 'Si no hay regla más específica.')}
          {campo('margenMinimo', 'Recargo mínimo', 'Se avisa cuando un producto queda por debajo.')}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Redondear el precio</label>
            <select className="form-select" value={config.redondeo} onChange={(e) => setConfig({ ...config, redondeo: Number(e.target.value) })}>
              <option value={0}>No redondear</option>
              <option value={10}>A la decena</option>
              <option value={100}>A la centena</option>
              <option value={1000}>Al millar</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cuando cambia un costo</label>
            <select className="form-select" value={config.modoPrecio} onChange={(e) => setConfig({ ...config, modoPrecio: e.target.value })}>
              <option value="APROBACION">Sugerir el precio (lo apruebo yo)</option>
              <option value="AUTOMATICO">Actualizar el precio automáticamente</option>
            </select>
          </div>
        </div>

        <h4 style={{ margin: '1.25rem 0 0.75rem' }}>Costos desactualizados y alertas de listas</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem' }}>
          {campo('umbralAmarillo', 'Amarillo desde', 'Días sin actualizar el costo.', 'días')}
          {campo('umbralRojo', 'Rojo con más de', undefined, 'días')}
          {campo('alertaSubaPct', 'Marcar subas mayores a', 'Para revisar posibles errores de la lista.')}
          {campo('alertaBajaPct', 'Marcar bajas mayores a')}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={guardarConfig} disabled={guardando}>
            {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Guardar
          </button>
        </div>
      </div>

      <div className="responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem 0.5rem' }}>
            <h3>Por categoría</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Vacío = usa el del proveedor o el general.</p>
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
            <table className="table" style={{ fontSize: '0.88rem' }}>
              <thead><tr><th>Categoría</th><th>Productos</th><th>Recargo</th><th></th></tr></thead>
              <tbody>{datos.categorias.map((c) => filaRegla('CATEGORIA', c.nombre, c.nombre, c.productos))}</tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem 0.5rem' }}>
            <h3>Por proveedor</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Se aplica según el proveedor preferido de cada producto.</p>
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
            <table className="table" style={{ fontSize: '0.88rem' }}>
              <thead><tr><th>Proveedor</th><th>Productos</th><th>Recargo</th><th></th></tr></thead>
              <tbody>{datos.proveedores.map((p) => filaRegla('PROVEEDOR', p.id, p.nombre, p.productos))}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setRecalculo({ alcance: { tipo: 'TODOS', etiqueta: 'todos los productos' }, preview: null, aplicando: false })}>
          <RefreshCw size={16} /> Recalcular precios de todos los productos
        </button>
      </div>

      {recalculo && (
        <div className="modal-overlay" onClick={() => !recalculo.aplicando && setRecalculo(null)}>
          <div className="modal-content" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Recalcular precios: {recalculo.alcance.etiqueta}</h3></div>
            <div className="modal-body">
              {!recalculo.preview ? (
                <div style={{ textAlign: 'center', padding: '1.5rem' }}><Loader2 className="spin" /></div>
              ) : recalculo.preview.total === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Con las reglas actuales ningún precio cambia.</p>
              ) : (
                <>
                  <p style={{ marginBottom: '0.75rem' }}>
                    <strong>{recalculo.preview.total}</strong> productos cambiarían de precio.
                    {recalculo.preview.bajoMinimo > 0 && <span style={{ color: '#b91c1c' }}> {recalculo.preview.bajoMinimo} quedarían por debajo del recargo mínimo.</span>}
                    {' '}{recalculo.preview.modoPrecio === 'AUTOMATICO' ? 'Se actualizan al confirmar.' : 'Van a la bandeja de precios sugeridos para que los apruebes.'}
                  </p>
                  <div className="table-container" style={{ maxHeight: 340, overflowY: 'auto', margin: 0 }}>
                    <table className="table" style={{ fontSize: '0.82rem' }}>
                      <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Costo real</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Nuevo</th><th style={{ textAlign: 'right' }}>Recargo</th></tr></thead>
                      <tbody>
                        {recalculo.preview.filas.map((f) => (
                          <tr key={f.productoId}>
                            <td>{f.nombre}<div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{f.codigo} · recargo {NIVEL[f.nivel]} {f.margen}%</div></td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(f.costoReal)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(f.precioActual)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(f.precioNuevo)}</td>
                            <td style={{ textAlign: 'right', color: f.bajoMinimo ? '#b91c1c' : undefined }}>{f.recargoNuevo?.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recalculo.preview.total > recalculo.preview.filas.length && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Se muestran los primeros {recalculo.preview.filas.length}.</p>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRecalculo(null)} disabled={recalculo.aplicando}>Ahora no</button>
              {!!recalculo.preview?.total && (
                <button type="button" className="btn btn-primary" onClick={aplicarRecalculo} disabled={recalculo.aplicando}>
                  {recalculo.aplicando ? <Loader2 size={16} className="spin" /> : null}
                  {recalculo.preview.modoPrecio === 'AUTOMATICO' ? 'Actualizar precios' : 'Enviar a la bandeja'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
