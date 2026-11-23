'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, Settings2, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { todayArgentina } from '@/lib/format';
import {
  CAMPOS_LISTA,
  adivinarMapeo,
  extraerFilas,
  letraColumna,
  type CampoLista,
  type FilaLista,
  type MapeoLista,
} from '@/lib/listas/parseo';
import LecturaPdf, { type ResultadoPdf } from './LecturaPdf';

type Proveedor = { id: string; nombre: string };
type Paso = 'archivo' | 'mapeo' | 'pdf' | 'procesando';

const LOTE_ENVIO = 500;
const MAX_FILAS = 50000;

const mapeoVacio = (): MapeoLista => ({
  filaInicio: 1,
  columnas: {},
  incluyeIva: true,
  monedaDefault: 'ARS',
  bonificacionGeneral: '',
  ivaProductosNuevos: 21,
});

function tipoArchivo(nombre: string): 'xlsx' | 'xls' | 'csv' | 'pdf' | null {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'pdf') return ext;
  return null;
}

export default function Carga({ empresaId }: { empresaId: string | null }) {
  const router = useRouter();
  const { showToast, toastNode } = useToast(5000);

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(todayArgentina());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');

  // Contenido del archivo
  const [libro, setLibro] = useState<Record<string, unknown[][]>>({});
  const [hoja, setHoja] = useState('');
  const crudas = useMemo(() => libro[hoja] || [], [libro, hoja]);

  const [mapeo, setMapeo] = useState<MapeoLista>(mapeoVacio());
  const [usaPlantilla, setUsaPlantilla] = useState(false);
  const [paso, setPaso] = useState<Paso>('archivo');
  const [progreso, setProgreso] = useState({ enviadas: 0, total: 0, etapa: '' });
  const [pdf, setPdf] = useState<ResultadoPdf>({ filas: [], completo: false, leyendo: false });
  const esPdf = !!archivo && tipoArchivo(archivo.name) === 'pdf';

  useEffect(() => {
    fetch('/api/tenant/proveedores?activos=true')
      .then((r) => r.json())
      .then((d) => setProveedores(Array.isArray(d) ? d : []))
      .catch(() => setProveedores([]));
  }, []);

  const filasExtraidas = useMemo(() => (crudas.length ? extraerFilas(crudas, mapeo) : []), [crudas, mapeo]);
  // Lo que se envía al servidor: del PDF (leído por Gemini) o del Excel/CSV (por columnas).
  const filasAProcesar = useMemo<FilaLista[]>(
    () => (esPdf ? pdf.filas.map((f) => ({ ...f, bonificaciones: mapeo.bonificacionGeneral || null })) : filasExtraidas),
    [esPdf, pdf.filas, mapeo.bonificacionGeneral, filasExtraidas]
  );
  const cantColumnas = useMemo(
    () => crudas.slice(0, 60).reduce((max, f) => Math.max(max, (f || []).length), 0),
    [crudas]
  );

  const leerArchivo = async (file: File) => {
    setError('');
    const tipo = tipoArchivo(file.name);
    if (!tipo) {
      setError('Formato no soportado. Subí un Excel (.xlsx, .xls), un CSV o un PDF.');
      return;
    }
    if (!proveedorId) {
      setError('Elegí primero el proveedor.');
      return;
    }
    if (tipo === 'pdf') {
      setLeyendo(true);
      const cfg = await fetch('/api/tenant/listas/pdf/leer').then((r) => r.json()).catch(() => null);
      setLeyendo(false);
      if (!cfg?.configurado) {
        setError(cfg?.error || 'La lectura de PDF no está configurada: falta la clave de Gemini (GEMINI_API_KEY).');
        return;
      }
      setPdf({ filas: [], completo: false, leyendo: false });
      setMapeo(mapeoVacio());
      setArchivo(file);
      setPaso('pdf');
      return;
    }

    setLeyendo(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hojas: Record<string, unknown[][]> = {};
      for (const nombre of wb.SheetNames) {
        const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: '' });
        hojas[nombre] = filas.slice(0, MAX_FILAS);
      }
      // Primera hoja con datos
      const primera = wb.SheetNames.find((n) => hojas[n].length > 0) || wb.SheetNames[0];
      if (!primera || !hojas[primera]?.length) throw new Error('El archivo no tiene datos.');

      // ¿Hay plantilla guardada para este proveedor?
      const plantilla = await fetch(`/api/tenant/listas/plantillas?proveedorId=${proveedorId}`).then((r) => r.json());
      const guardado = plantilla?.mapeo as MapeoLista | undefined;
      const hojaElegida = guardado?.hoja && hojas[guardado.hoja] ? guardado.hoja : primera;

      setArchivo(file);
      setLibro(hojas);
      setHoja(hojaElegida);
      if (guardado) {
        setMapeo({ ...mapeoVacio(), ...guardado, hoja: hojaElegida });
        setUsaPlantilla(true);
      } else {
        setMapeo({ ...mapeoVacio(), ...adivinarMapeo(hojas[hojaElegida]), hoja: hojaElegida });
        setUsaPlantilla(false);
        setPaso('mapeo');
      }
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  };

  const cambiarHoja = (nombre: string) => {
    setHoja(nombre);
    setMapeo((m) => ({ ...m, ...adivinarMapeo(libro[nombre] || []), hoja: nombre }));
  };

  const setColumna = (campo: CampoLista, valor: string) => {
    setMapeo((m) => {
      const columnas = { ...m.columnas };
      if (valor === '') delete columnas[campo];
      else columnas[campo] = parseInt(valor, 10);
      return { ...m, columnas };
    });
  };

  const encabezado = (col: number) => {
    const filaEnc = crudas[mapeo.filaInicio - 2] || crudas[mapeo.filaInicio - 1] || [];
    const v = String(filaEnc[col] ?? '').trim();
    return v ? ` — ${v.slice(0, 28)}` : '';
  };

  const validarMapeo = () => {
    if (esPdf) {
      if (!pdf.completo) return 'Esperá a que se lean todas las páginas (o reintentá las que fallaron).';
      if (!pdf.filas.length) return 'No se leyó ningún producto del PDF.';
      return '';
    }
    if (mapeo.columnas.precio === undefined) return 'Indicá la columna del precio.';
    if (mapeo.columnas.codigo === undefined && mapeo.columnas.descripcion === undefined) {
      return 'Indicá la columna del código o la de la descripción.';
    }
    if (!filasExtraidas.length) return 'Con este mapeo no se leyó ninguna fila. Revisá la fila de inicio y las columnas.';
    return '';
  };

  const procesar = async () => {
    const problema = validarMapeo();
    if (problema) {
      setError(problema);
      return;
    }
    if (!archivo) return;
    setError('');
    setPaso('procesando');
    const filas = filasAProcesar;
    setProgreso({ enviadas: 0, total: filas.length, etapa: 'Guardando el archivo original…' });

    try {
      // 1. Respaldo del original en Vercel Blob (si falla, se sigue sin respaldo).
      let archivoUrl: string | undefined;
      try {
        const { upload } = await import('@vercel/blob/client');
        const nombre = archivo.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const blob = await upload(`listas/${empresaId}/${Date.now()}-${nombre}`, archivo, {
          access: 'private',
          handleUploadUrl: '/api/tenant/listas/archivo',
        });
        archivoUrl = blob.url;
      } catch {
        showToast('No se pudo guardar una copia del archivo. La importación sigue igual.', 'info');
      }

      // 2. Cabecera de la importación (guarda también la plantilla del proveedor)
      setProgreso((p) => ({ ...p, etapa: 'Creando la importación…' }));
      const res = await fetch('/api/tenant/listas/importaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedorId,
          fechaVigencia: fecha,
          archivoNombre: archivo.name,
          archivoTipo: tipoArchivo(archivo.name),
          archivoUrl,
          mapeo: { ...mapeo, hoja },
        }),
      });
      const creada = await res.json();
      if (!res.ok) throw new Error(creada.error || 'No se pudo crear la importación.');

      // 3. Filas por lotes (cada lote es una llamada corta al servidor)
      for (let i = 0; i < filas.length; i += LOTE_ENVIO) {
        setProgreso({ enviadas: i, total: filas.length, etapa: 'Comparando con tu catálogo…' });
        const r = await fetch(`/api/tenant/listas/importaciones/${creada.id}/filas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filas: filas.slice(i, i + LOTE_ENVIO) }),
        });
        if (!r.ok) throw new Error((await r.json()).error || 'Error al enviar las filas.');
      }

      // 4. Faltantes, sugerencias y contadores
      setProgreso({ enviadas: filas.length, total: filas.length, etapa: 'Buscando faltantes y sugerencias…' });
      const fin = await fetch(`/api/tenant/listas/importaciones/${creada.id}/finalizar`, { method: 'POST' });
      if (!fin.ok) throw new Error((await fin.json()).error || 'Error al finalizar.');

      router.replace(`/dashboard/costos/importar?id=${creada.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPaso(esPdf ? 'pdf' : 'mapeo');
    }
  };

  const reiniciar = () => {
    setArchivo(null);
    setLibro({});
    setHoja('');
    setMapeo(mapeoVacio());
    setUsaPlantilla(false);
    setPdf({ filas: [], completo: false, leyendo: false });
    setPaso('archivo');
    setError('');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (paso === 'procesando') {
    const pct = progreso.total ? Math.round((progreso.enviadas / progreso.total) * 100) : 0;
    return (
      <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
        {toastNode}
        <Loader2 size={32} className="spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <h3 style={{ marginBottom: '0.5rem' }}>{progreso.etapa}</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          {progreso.enviadas.toLocaleString('es-AR')} de {progreso.total.toLocaleString('es-AR')} filas
        </p>
        <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', maxWidth: 420, margin: '0 auto' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {toastNode}
      {error && (
        <div style={{ padding: '0.85rem 1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Paso 1: proveedor, fecha y archivo */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-info">1</span> Lista del proveedor
        </h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Proveedor</label>
            <select
              className="form-select"
              value={proveedorId}
              onChange={(e) => {
                setProveedorId(e.target.value);
                if (archivo) reiniciar();
              }}
              disabled={!!archivo}
            >
              <option value="">Elegí un proveedor…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de vigencia de la lista</label>
            <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        {!archivo ? (
          <label
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '2rem',
              border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', cursor: proveedorId ? 'pointer' : 'not-allowed',
              opacity: proveedorId ? 1 : 0.6, color: 'var(--text-muted)',
            }}
          >
            {leyendo ? <Loader2 size={28} className="spin" /> : <Upload size={28} />}
            <strong style={{ color: 'var(--text-primary)' }}>{leyendo ? 'Leyendo archivo…' : 'Elegí el archivo de la lista'}</strong>
            <span style={{ fontSize: '0.85rem' }}>Excel (.xlsx, .xls), CSV o PDF. El Excel se lee en tu navegador; el PDF se lee con Gemini.</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              style={{ display: 'none' }}
              disabled={!proveedorId || leyendo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) leerArchivo(f);
                e.target.value = '';
              }}
            />
          </label>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.85rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={20} style={{ color: '#15803d' }} />
              <strong>{archivo.name}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                · {filasAProcesar.length.toLocaleString('es-AR')} {esPdf ? 'productos leídos' : 'filas con datos'}
              </span>
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reiniciar} disabled={pdf.leyendo}>Cambiar archivo</button>
          </div>
        )}
      </div>

      {/* Plantilla guardada: se importa sin volver a mapear */}
      {archivo && usaPlantilla && paso === 'archivo' && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} style={{ color: '#15803d' }} /> Se usa la configuración guardada de este proveedor
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {filasExtraidas.length.toLocaleString('es-AR')} filas leídas desde la fila {mapeo.filaInicio}. Precios {mapeo.incluyeIva ? 'con' : 'sin'} IVA
            {mapeo.bonificacionGeneral ? `, bonificación ${mapeo.bonificacionGeneral}` : ''}.
          </p>
          <TablaMuestra filas={filasExtraidas.slice(0, 5)} />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPaso('mapeo')}>
              <Settings2 size={16} /> Revisar columnas
            </button>
            <button type="button" className="btn btn-primary" onClick={procesar}>
              Ver cambios <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Paso 2 (PDF): lectura con Gemini, ajustes y muestra */}
      {archivo && paso === 'pdf' && (
        <div className="card">
          <h3 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-info">2</span> Lectura del PDF
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Elegí la moneda antes de leer: se usa para los precios que no dicen si son en pesos o en dólares.
          </p>
          <AjustesLista mapeo={mapeo} setMapeo={setMapeo} monedaBloqueada={pdf.leyendo || pdf.filas.length > 0} />
          <LecturaPdf archivo={archivo} monedaDefault={mapeo.monedaDefault} onCambio={setPdf} />

          {pdf.filas.length > 0 && (
            <>
              <h4 style={{ margin: '1.25rem 0 0.5rem' }}>Así se leyó la lista</h4>
              <TablaMuestra filas={filasAProcesar.slice(0, 10)} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                {filasAProcesar.length.toLocaleString('es-AR')} productos
                {' · '}{filasAProcesar.filter((f) => f.codigoFabricante).length.toLocaleString('es-AR')} con N° de parte
                {' · '}{filasAProcesar.filter((f) => f.precio === null).length.toLocaleString('es-AR')} sin precio.
                Revisá la vista previa antes de aplicar.
              </p>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={procesar} disabled={!pdf.completo || !pdf.filas.length}>
              Ver cambios <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: mapeo de columnas */}
      {archivo && paso === 'mapeo' && (
        <div className="card">
          <h3 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-info">2</span> ¿Qué es cada columna?
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Se guarda para este proveedor: la próxima lista se importa sin volver a configurar.
          </p>

          <div className="form-row">
            {Object.keys(libro).length > 1 && (
              <div className="form-group">
                <label className="form-label">Hoja</label>
                <select className="form-select" value={hoja} onChange={(e) => cambiarHoja(e.target.value)}>
                  {Object.keys(libro).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Los datos empiezan en la fila</label>
              <input
                type="number" min={1} className="form-input" value={mapeo.filaInicio}
                onChange={(e) => setMapeo((m) => ({ ...m, filaInicio: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {CAMPOS_LISTA.map(({ campo, etiqueta, obligatorio }) => (
              <div key={campo} className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{etiqueta}{obligatorio && campo === 'precio' ? ' *' : ''}</label>
                <select className="form-select" value={mapeo.columnas[campo] ?? ''} onChange={(e) => setColumna(campo, e.target.value)}>
                  <option value="">— No está en la lista —</option>
                  {Array.from({ length: cantColumnas }, (_, i) => (
                    <option key={i} value={i}>{letraColumna(i)}{encabezado(i)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <AjustesLista mapeo={mapeo} setMapeo={setMapeo} />

          <h4 style={{ margin: '0.5rem 0' }}>Así se va a leer la lista</h4>
          <TablaMuestra filas={filasExtraidas.slice(0, 8)} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
            {filasExtraidas.length.toLocaleString('es-AR')} filas en total. Los títulos de sección y las filas vacías se saltean.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={procesar} disabled={!filasExtraidas.length}>
              Ver cambios <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AjustesLista({
  mapeo, setMapeo, monedaBloqueada = false,
}: {
  mapeo: MapeoLista;
  setMapeo: React.Dispatch<React.SetStateAction<MapeoLista>>;
  monedaBloqueada?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Moneda si no se indica</label>
        <select className="form-select" value={mapeo.monedaDefault} disabled={monedaBloqueada} onChange={(e) => setMapeo((m) => ({ ...m, monedaDefault: e.target.value as 'ARS' | 'USD' }))}>
          <option value="ARS">Pesos (ARS)</option>
          <option value="USD">Dólares (USD)</option>
        </select>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Bonificación de toda la lista</label>
        <input
          className="form-input" placeholder='Ej: 10+5' value={mapeo.bonificacionGeneral || ''}
          onChange={(e) => setMapeo((m) => ({ ...m, bonificacionGeneral: e.target.value }))}
        />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">IVA de los productos nuevos</label>
        <select className="form-select" value={mapeo.ivaProductosNuevos ?? 21} onChange={(e) => setMapeo((m) => ({ ...m, ivaProductosNuevos: parseFloat(e.target.value) }))}>
          <option value={21}>21%</option>
          <option value={10.5}>10,5%</option>
          <option value={0}>Exento</option>
        </select>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.6rem' }}>
        <input type="checkbox" checked={mapeo.incluyeIva} onChange={(e) => setMapeo((m) => ({ ...m, incluyeIva: e.target.checked }))} />
        <span>Los precios de la lista incluyen IVA</span>
      </label>
    </div>
  );
}

function TablaMuestra({ filas }: { filas: FilaLista[] }) {
  if (!filas.length) {
    return <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>No se leyó ninguna fila con este mapeo.</p>;
  }
  return (
    <div className="table-container" style={{ margin: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Fila</th><th>Código</th><th>N° de parte</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Precio</th><th>Moneda</th><th>Bonif.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.fila}>
              <td style={{ color: 'var(--text-muted)' }}>{f.fila}</td>
              <td>{f.codigo || '—'}</td>
              <td>{f.codigoFabricante || '—'}</td>
              <td>{f.descripcion || '—'}</td>
              <td style={{ textAlign: 'right', color: f.precio === null ? '#b91c1c' : undefined }}>
                {f.precio === null ? 'sin precio' : f.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </td>
              <td>{f.moneda}</td>
              <td>{f.bonificaciones || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
