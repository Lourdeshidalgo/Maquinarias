'use client';

import { useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

type Resumen = {
  filas: number; validos: number; nuevos: number; actualizados: number; omitidos: number;
  conCuit: number; conDni: number; sinDocumento: number; avisos: string[]; totalAvisos: number;
  ejemplos: { codigo: number | null; razonSocial: string; tipoDoc: string; nroDoc: string; celular: string | null; localidad: string | null }[];
};

// Importar el padrón de clientes desde el Excel del sistema anterior.
// Paso 1: se elige el archivo y se muestra qué va a pasar. Paso 2: se confirma.
export default function ImportarClientes({ onCerrar, onImportado }: { onCerrar: () => void; onImportado: (r: Resumen) => void }) {
  const [filas, setFilas] = useState<unknown[][] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState<'' | 'leyendo' | 'importando'>('');

  const enviar = async (datos: unknown[][], simular: boolean) => {
    const r = await fetch('/api/tenant/clientes/importar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filas: datos, simular }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo leer el archivo.');
    return d as Resumen;
  };

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setResumen(null);
    setTrabajando('leyendo');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = wb.SheetNames.find((n) => (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) as unknown[]).length > 0);
      if (!hoja) throw new Error('El archivo no tiene datos.');
      const datos = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: '' });
      setFilas(datos);
      setNombreArchivo(file.name);
      setResumen(await enviar(datos, true));
    } catch (e) {
      setError((e as Error).message || 'No se pudo leer el archivo.');
      setFilas(null);
    } finally {
      setTrabajando('');
    }
  };

  const importar = async () => {
    if (!filas) return;
    setTrabajando('importando');
    setError('');
    try {
      onImportado(await enviar(filas, false));
    } catch (e) {
      setError((e as Error).message || 'No se pudo importar.');
    } finally {
      setTrabajando('');
    }
  };

  const n = (x: number) => x.toLocaleString('es-AR');

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3>Importar clientes desde Excel</h3>
          <button type="button" onClick={onCerrar} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem' }} disabled={trabajando === 'importando'}>X</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
            Subí el listado de clientes del sistema anterior (.xlsx, .xls o .csv). Se reconocen las columnas por su título:
            Código, Nombre, Razón social, Dirección, Teléfono, Celular, Localidad, CP, Provincia, CUIT, Email, Condición IVA.
            También sirve el Excel que sale de &quot;Exportar a Excel&quot;.
            Si un cliente ya existe (mismo código, documento o, si no tiene ninguno, mismo nombre) se actualizan sus datos;
            el saldo de cuenta corriente no se toca.
          </p>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            {trabajando === 'leyendo' ? <Loader2 size={16} className="spin" /> : <FileUp size={16} />}
            {nombreArchivo ? ` Cambiar archivo (${nombreArchivo})` : ' Elegir archivo'}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} aria-label="Archivo de clientes" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
          </label>

          {error && <p style={{ color: '#b91c1c', marginTop: '0.75rem' }}>{error}</p>}

          {resumen && (
            <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Dato titulo="Clientes nuevos" valor={n(resumen.nuevos)} color="#15803d" />
                <Dato titulo="Ya existían (se actualizan)" valor={n(resumen.actualizados)} />
                <Dato titulo="Filas omitidas" valor={n(resumen.omitidos)} color={resumen.omitidos ? '#b45309' : undefined} />
              </div>
              <p style={{ color: 'var(--text-muted)' }}>
                {n(resumen.conCuit)} con CUIT · {n(resumen.conDni)} con DNI · {n(resumen.sinDocumento)} sin documento
                (se cargan como consumidor final; el DNI o CUIT se completa cuando haga falta facturar).
              </p>
              {resumen.ejemplos.length > 0 && (
                <div className="table-container" style={{ margin: '0.6rem 0' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead><tr><th>N°</th><th>Cliente</th><th>Documento</th><th>Celular</th><th>Localidad</th></tr></thead>
                    <tbody>
                      {resumen.ejemplos.map((e, i) => (
                        <tr key={i}>
                          <td>{e.codigo ?? '—'}</td><td>{e.razonSocial}</td>
                          <td>{e.tipoDoc === '99' ? 'Sin documento' : `${e.tipoDoc} ${e.nroDoc}`}</td>
                          <td>{e.celular ?? '—'}</td><td>{e.localidad ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {resumen.totalAvisos > 0 && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary style={{ cursor: 'pointer', color: '#b45309' }}>{n(resumen.totalAvisos)} avisos (ver detalle)</summary>
                  <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxHeight: 180, overflowY: 'auto', paddingLeft: '1.1rem', marginTop: 4 }}>
                    {resumen.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    {resumen.totalAvisos > resumen.avisos.length && <li>… y {n(resumen.totalAvisos - resumen.avisos.length)} más.</li>}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={trabajando === 'importando'}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={importar} disabled={!resumen || !!trabajando || resumen.validos === 0}>
            {trabajando === 'importando' ? <><Loader2 size={16} className="spin" /> Importando…</> : `Importar ${resumen ? n(resumen.validos) : ''} clientes`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.65rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{titulo}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{valor}</div>
    </div>
  );
}
