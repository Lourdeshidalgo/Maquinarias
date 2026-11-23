'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Loader2, Undo2, Eye, Download, FileUp } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useModuloCostos, ModuloCostosInactivo } from '@/components/costos/useModuloCostos';

type Importacion = {
  id: string; estado: string; fechaVigencia: string; createdAt: string; aplicadaAt: string | null; deshechaAt: string | null;
  archivoNombre: string; tieneArchivo: boolean; totalFilas: number; subas: number; bajas: number; sinCambios: number;
  nuevos: number; faltantes: number; alertas: number; aplicados: number; sePuedeDeshacer: boolean;
  proveedor: { id: string; nombre: string }; usuario: { nombre: string } | null;
};

const ESTADOS: Record<string, { clase: string; texto: string }> = {
  BORRADOR: { clase: 'badge-warning', texto: 'Sin aplicar' },
  APLICADA: { clase: 'badge-success', texto: 'Aplicada' },
  DESHECHA: { clase: 'badge-danger', texto: 'Deshecha' },
};

const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-AR') : '—');

export default function ImportacionesPage() {
  const modulo = useModuloCostos();
  const { showToast, toastNode } = useToast(5000);
  const { confirm, confirmNode } = useConfirm();
  const [lista, setLista] = useState<Importacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/tenant/listas/importaciones');
      const d = await r.json();
      setLista(Array.isArray(d) ? d : []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (modulo.activo) cargar();
  }, [modulo.activo, cargar]);

  const deshacer = async (imp: Importacion) => {
    const ok = await confirm({
      title: 'Deshacer importación',
      message: `Se vuelven los costos y precios de ${imp.proveedor.nombre} a como estaban antes de la lista del ${fecha(imp.fechaVigencia)}. Los productos que se crearon desde la lista y no tienen ventas se dan de baja. Si un costo se cambió a mano después, se deja como está.`,
      confirmText: 'Deshacer',
      danger: true,
    });
    if (!ok) return;
    setDeshaciendo(imp.id);
    try {
      const r = await fetch(`/api/tenant/listas/importaciones/${imp.id}/deshacer`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo deshacer.');
      const partes = [`${d.restaurados} costos restaurados`];
      if (d.productosDadosDeBaja) partes.push(`${d.productosDadosDeBaja} productos dados de baja`);
      if (d.omitidos) partes.push(`${d.omitidos} sin tocar porque se modificaron después`);
      if (d.creadosConVentas) partes.push(`${d.creadosConVentas} productos nuevos se mantienen porque ya tienen ventas`);
      showToast(`Importación deshecha: ${partes.join(', ')}.`, 'success');
      cargar();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setDeshaciendo(null);
    }
  };

  if (modulo.cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (!modulo.activo || !modulo.esDueno) return <ModuloCostosInactivo />;

  return (
    <div>
      {toastNode}
      {confirmNode}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={26} style={{ color: 'var(--primary)' }} />
            <span>Historial de importaciones</span>
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Cada lista de precios que se cargó. Podés deshacer la última de cada proveedor.</p>
        </div>
        <Link href="/dashboard/costos/importar" className="btn btn-primary"><FileUp size={16} /> Importar lista</Link>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Vigencia</th>
                <th>Archivo</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>🔺</th>
                <th style={{ textAlign: 'center' }}>🔻</th>
                <th style={{ textAlign: 'center' }}>🆕</th>
                <th style={{ textAlign: 'center' }}>❓</th>
                <th style={{ textAlign: 'center' }}>Aplicadas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="spin" /></td></tr>}
              {!cargando && lista.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>Todavía no se importó ninguna lista.</td></tr>
              )}
              {lista.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.proveedor.nombre}</td>
                  <td>
                    {fecha(i.fechaVigencia)}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>cargada {fecha(i.createdAt)}{i.usuario ? ` por ${i.usuario.nombre}` : ''}</div>
                  </td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.archivoNombre}>{i.archivoNombre}</td>
                  <td>
                    <span className={`badge ${ESTADOS[i.estado]?.clase || 'badge-info'}`}>{ESTADOS[i.estado]?.texto || i.estado}</span>
                    {i.estado === 'DESHECHA' && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{fecha(i.deshechaAt)}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{i.subas}</td>
                  <td style={{ textAlign: 'center' }}>{i.bajas}</td>
                  <td style={{ textAlign: 'center' }}>{i.nuevos}</td>
                  <td style={{ textAlign: 'center' }}>{i.faltantes}</td>
                  <td style={{ textAlign: 'center' }}>{i.estado === 'BORRADOR' ? '—' : i.aplicados}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <Link href={`/dashboard/costos/importar?id=${i.id}`} className="btn btn-secondary btn-sm" title={i.estado === 'BORRADOR' ? 'Continuar' : 'Ver detalle'}>
                        <Eye size={14} /> {i.estado === 'BORRADOR' ? 'Continuar' : 'Ver'}
                      </Link>
                      {i.tieneArchivo && (
                        <a href={`/api/tenant/listas/importaciones/${i.id}/archivo`} className="btn btn-secondary btn-sm" title="Descargar el archivo original">
                          <Download size={14} />
                        </a>
                      )}
                      {i.sePuedeDeshacer && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => deshacer(i)} disabled={deshaciendo === i.id} title="Deshacer esta importación">
                          {deshaciendo === i.id ? <Loader2 size={14} className="spin" /> : <Undo2 size={14} />} Deshacer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
