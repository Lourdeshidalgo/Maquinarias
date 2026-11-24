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
import { elegirModo, leerCatalogo, leerFichas, tablaDesdePdf, tieneTexto, type PaginaPdf } from '@/lib/listas/pdf-texto';
import { unirTablas, type TablaUnida } from '@/lib/listas/tablas-lado-a-lado';
import LecturaPdf from './LecturaPdf';

type Proveedor = { id: string; nombre: string };
type Paso = 'archivo' | 'mapeo' | 'pdf' | 'procesando';

const LOTE_ENVIO = 500;
const MAX_FILAS = 50000;
// Tiempo máximo para guardar la copia del archivo original (es solo un respaldo).
const LIMITE_RESPALDO_MS = 20_000;
const CLAVE_GUARDAR_COPIA = 'importar-lista:guardar-copia';

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

// modo "repuestos": se carga desde la pantalla Repuestos; los productos quedan como repuestos
// y se usan los precios del Excel tal cual (precio de lista, efectivo y tarjeta).
export default function Carga({ empresaId, modo }: { empresaId: string | null; modo?: 'repuestos' }) {
  const esRepuestos = modo === 'repuestos';
  const forzar = (m: MapeoLista): MapeoLista => (esRepuestos ? { ...m, marcarRepuestos: true, talCual: true } : m);
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
  // Hojas con varias tablas lado a lado que se unieron en una sola (ej. DIBRA)
  const [unidas, setUnidas] = useState<Record<string, Omit<TablaUnida, 'filas'>>>({});

  const [mapeo, setMapeo] = useState<MapeoLista>(() => (modo === 'repuestos' ? { ...mapeoVacio(), marcarRepuestos: true, talCual: true } : mapeoVacio()));
  const [usaPlantilla, setUsaPlantilla] = useState(false);
  const [paso, setPaso] = useState<Paso>('archivo');
  const [progreso, setProgreso] = useState({ enviadas: 0, total: 0, etapa: '' });
  // Guardar una copia del archivo original en Vercel Blob: opcional y apagado por defecto
  // (es solo un respaldo). La elección se recuerda en este navegador.
  const [guardarCopia, setGuardarCopia] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este navegador
      setGuardarCopia(localStorage.getItem(CLAVE_GUARDAR_COPIA) === '1');
    } catch {
      /* sin almacenamiento local: queda apagado */
    }
  }, []);
  const cambiarGuardarCopia = (v: boolean) => {
    setGuardarCopia(v);
    try {
      localStorage.setItem(CLAVE_GUARDAR_COPIA, v ? '1' : '0');
    } catch {
      /* sin almacenamiento local */
    }
  };
  // PDF: texto de cada página (null mientras se lee) y cómo se interpreta.
  const [paginasPdf, setPaginasPdf] = useState<PaginaPdf[] | null>(null);
  // Forma de leer el PDF que eligió la app (se marca como recomendada).
  const [modoRecomendado, setModoRecomendado] = useState<ModoPdf | null>(null);
  const esPdf = !!archivo && tipoArchivo(archivo.name) === 'pdf';
  // Catálogo (código → descripción → precio) y fichas (código y precio en la misma línea) no usan columnas.
  const esCatalogo = esPdf && (mapeo.modoPdf === 'catalogo' || mapeo.modoPdf === 'fichas');
  const filasCatalogo = useMemo(
    () =>
      esCatalogo && paginasPdf
        ? (mapeo.modoPdf === 'fichas' ? leerFichas : leerCatalogo)(paginasPdf, mapeo.monedaDefault)
        : [],
    [esCatalogo, paginasPdf, mapeo.modoPdf, mapeo.monedaDefault]
  );

  useEffect(() => {
    fetch('/api/tenant/proveedores?activos=true')
      .then((r) => r.json())
      .then((d) => setProveedores(Array.isArray(d) ? d : []))
      .catch(() => setProveedores([]));
  }, []);

  const filasExtraidas = useMemo(() => (crudas.length ? extraerFilas(crudas, mapeo) : []), [crudas, mapeo]);
  // Lo que se envía al servidor: del PDF leído como catálogo o del Excel/CSV/PDF por columnas.
  const filasAProcesar = useMemo<FilaLista[]>(
    () => (esCatalogo ? filasCatalogo.map((f) => ({ ...f, bonificaciones: mapeo.bonificacionGeneral || null })) : filasExtraidas),
    [esCatalogo, filasCatalogo, mapeo.bonificacionGeneral, filasExtraidas]
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
      // El texto se lee en LecturaPdf; al terminar, pdfLeido decide catálogo o tabla.
      setPaginasPdf(null);
      setMapeo(forzar({ ...mapeoVacio(), modoPdf: 'catalogo' }));
      setArchivo(file);
      setPaso('pdf');
      return;
    }

    setLeyendo(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hojas: Record<string, unknown[][]> = {};
      const resumenUnidas: Record<string, Omit<TablaUnida, 'filas'>> = {};
      for (const nombre of wb.SheetNames) {
        const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: '' });
        // Tablas lado a lado con categorías → una sola tabla (Código, Descripción, Precio, …, Rubro)
        const unida = unirTablas(filas);
        if (unida) {
          const { filas: filasUnidas, ...resumen } = unida;
          resumenUnidas[nombre] = resumen;
          hojas[nombre] = filasUnidas.slice(0, MAX_FILAS);
        } else {
          hojas[nombre] = filas.slice(0, MAX_FILAS);
        }
      }
      setUnidas(resumenUnidas);
      // Primera hoja con datos
      const primera = wb.SheetNames.find((n) => hojas[n].length > 0) || wb.SheetNames[0];
      if (!primera || !hojas[primera]?.length) throw new Error('El archivo no tiene datos.');

      // ¿Hay plantilla guardada para este proveedor?
      const plantilla = await fetch(`/api/tenant/listas/plantillas?proveedorId=${proveedorId}`).then((r) => r.json());
      const guardado = plantilla?.mapeo as MapeoLista | undefined;
      // La hoja con el nombre del proveedor (ej. "DIBRA"), si el libro tiene una hoja por proveedor.
      const nombreProv = (proveedores.find((p) => p.id === proveedorId)?.nombre || '').trim().toLowerCase();
      const hojaDelProveedor = nombreProv ? wb.SheetNames.find((n) => n.trim().toLowerCase() === nombreProv && hojas[n]?.length) : undefined;
      const hojaElegida = guardado?.hoja && hojas[guardado.hoja] ? guardado.hoja : hojaDelProveedor || primera;

      setArchivo(file);
      setLibro(hojas);
      setHoja(hojaElegida);
      if (guardado) {
        setMapeo(forzar({ ...mapeoVacio(), ...guardado, hoja: hojaElegida }));
        setUsaPlantilla(true);
      } else {
        setMapeo(forzar({ ...mapeoVacio(), ...adivinarMapeo(hojas[hojaElegida]), hoja: hojaElegida }));
        setUsaPlantilla(false);
        setPaso('mapeo');
      }
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  };

  /** Pasa el PDF a modo tabla: filas/columnas por posición → mapeo de columnas (con la plantilla del proveedor si es de PDF). */
  const leerComoTabla = async (paginas: PaginaPdf[]) => {
    const tabla = tablaDesdePdf(paginas);
    const plantilla = await fetch(`/api/tenant/listas/plantillas?proveedorId=${proveedorId}`).then((r) => r.json()).catch(() => null);
    const guardado = plantilla?.mapeo as MapeoLista | undefined;
    setLibro({ PDF: tabla });
    setHoja('PDF');
    setMapeo((m) =>
      guardado?.modoPdf === 'tabla'
        ? forzar({ ...mapeoVacio(), ...guardado, hoja: 'PDF', monedaDefault: m.monedaDefault })
        : { ...m, ...adivinarMapeo(tabla), hoja: 'PDF', modoPdf: 'tabla' }
    );
    setPaso('mapeo');
  };

  const leerComo = (modo: 'catalogo' | 'fichas') => {
    setMapeo((m) => ({ ...m, modoPdf: modo, columnas: {}, filaInicio: 1 }));
    setPaso('pdf');
  };

  const pdfLeido = (paginas: PaginaPdf[]) => {
    if (!tieneTexto(paginas)) {
      setError('Este PDF no tiene texto (parece escaneado). Pedile al proveedor la lista en Excel o en PDF digital.');
      setArchivo(null);
      setPaso('archivo');
      return;
    }
    setPaginasPdf(paginas);
    const modo = elegirModo(paginas);
    setModoRecomendado(modo);
    if (modo === 'tabla') leerComoTabla(paginas);
    else setMapeo((m) => ({ ...m, modoPdf: modo }));
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
    if (esCatalogo) {
      if (!filasCatalogo.length) return 'No se encontraron productos con código y precio. Probá leerlo como tabla.';
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
    setProgreso({ enviadas: 0, total: filas.length, etapa: guardarCopia ? 'Guardando el archivo original…' : 'Creando la importación…' });

    try {
      // 1. Respaldo del original en Vercel Blob, solo si se pidió (si falla, se sigue sin respaldo).
      //    Con tiempo límite: si falla, la librería reintenta hasta 10 veces y la
      //    importación quedaba "colgada" varios minutos en este paso.
      let archivoUrl: string | undefined;
      const corte = new AbortController();
      const limite = setTimeout(() => corte.abort(), LIMITE_RESPALDO_MS);
      if (guardarCopia) try {
        const { upload } = await import('@vercel/blob/client');
        const nombre = archivo.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const subida = upload(`listas/${empresaId}/${Date.now()}-${nombre}`, archivo, {
          access: 'private',
          handleUploadUrl: '/api/tenant/listas/archivo',
          abortSignal: corte.signal,
        });
        // El límite corta aunque algún paso de la librería no respete la cancelación.
        const vencido = new Promise<never>((_, rechazar) =>
          corte.signal.addEventListener('abort', () => rechazar(new Error('Tiempo agotado'))),
        );
        archivoUrl = (await Promise.race([subida, vencido])).url;
        subida.catch(() => {}); // si termina después del límite, se ignora
      } catch {
        showToast('No se pudo guardar una copia del archivo. La importación sigue igual.', 'info');
      } finally {
        clearTimeout(limite);
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
          mapeo: forzar({ ...mapeo, hoja }),
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

      router.replace(`${esRepuestos ? '/dashboard/repuestos/importar' : '/dashboard/costos/importar'}?id=${creada.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPaso(esCatalogo ? 'pdf' : 'mapeo');
    }
  };

  const reiniciar = () => {
    setArchivo(null);
    setLibro({});
    setUnidas({});
    setHoja('');
    setMapeo(forzar(mapeoVacio()));
    setUsaPlantilla(false);
    setPaginasPdf(null);
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
          <span className="badge badge-info">1</span> {esRepuestos ? 'Lista de repuestos (Excel)' : 'Lista del proveedor'}
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
            <span style={{ fontSize: '0.85rem' }}>Excel (.xlsx, .xls), CSV o PDF. Se lee en tu navegador: la lista no sale de tu computadora.</span>
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
                · {filasAProcesar.length.toLocaleString('es-AR')} {esCatalogo ? 'productos leídos' : 'filas con datos'}
              </span>
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reiniciar} disabled={esPdf && !paginasPdf}>Cambiar archivo</button>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.88rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={guardarCopia} onChange={(e) => cambiarGuardarCopia(e.target.checked)} />
          <span>Guardar una copia del archivo original</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(opcional: queda como respaldo en el historial de importaciones)</span>
        </label>
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

      {/* Paso 2 (PDF, modo catálogo): código → descripción → precio */}
      {archivo && paso === 'pdf' && (
        <div className="card">
          <h3 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-info">2</span> Lectura del PDF
          </h3>
          {!paginasPdf ? (
            <LecturaPdf
              archivo={archivo}
              onListo={pdfLeido}
              onError={(m) => {
                reiniciar(); // limpia el error: el mensaje va después
                setError(m);
              }}
            />
          ) : (
            <>
              <ElegirModoPdf
                actual={mapeo.modoPdf === 'fichas' ? 'fichas' : 'catalogo'}
                recomendado={modoRecomendado}
                onElegir={(m) => (m === 'tabla' ? leerComoTabla(paginasPdf) : leerComo(m))}
              />
              <AjustesLista mapeo={mapeo} setMapeo={setMapeo} />
              <h4 style={{ margin: '0.5rem 0' }}>Así se leyó la lista</h4>
              <TablaMuestra filas={filasAProcesar.slice(0, 10)} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                {filasAProcesar.length.toLocaleString('es-AR')} productos
                {' · '}{filasAProcesar.filter((f) => f.codigoFabricante).length.toLocaleString('es-AR')} con N° de parte
                {' · '}{filasAProcesar.filter((f) => f.precio === null).length.toLocaleString('es-AR')} sin precio.
                Revisá la vista previa antes de aplicar.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={procesar} disabled={!filasAProcesar.length}>
                  Ver cambios <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
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

          {esPdf && paginasPdf && (
            <ElegirModoPdf actual="tabla" recomendado={modoRecomendado} onElegir={(m) => m !== 'tabla' && leerComo(m)} />
          )}
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

          {unidas[hoja] && (
            <div style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Esta hoja tiene {unidas[hoja].bloques} tablas una al lado de la otra: las unimos en una sola
              con {unidas[hoja].productos.toLocaleString('es-AR')} productos
              {unidas[hoja].categorias.length > 0 && <> y {unidas[hoja].categorias.length} categorías (columna &quot;Rubro&quot;)</>}.
              {unidas[hoja].enDolares > 0 && <> {unidas[hoja].enDolares} vienen sin &quot;$&quot; y se toman en dólares (columna &quot;Moneda&quot;).</>}
              {unidas[hoja].tarjetaCalculada && (
                <> {unidas[hoja].tarjetaCalculada!.cantidad} no traen precio con tarjeta: se calculó con el mismo recargo de la lista
                  (+{unidas[hoja].tarjetaCalculada!.recargoPct.toLocaleString('es-AR')}% sobre efectivo).</>
              )}
              Las columnas Efectivo y Tarjeta son las de la lista, solo para comparar: el precio de venta lo calcula el sistema.
            </div>
          )}

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
  mapeo, setMapeo,
}: {
  mapeo: MapeoLista;
  setMapeo: React.Dispatch<React.SetStateAction<MapeoLista>>;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Moneda si no se indica</label>
        <select className="form-select" value={mapeo.monedaDefault} onChange={(e) => setMapeo((m) => ({ ...m, monedaDefault: e.target.value as 'ARS' | 'USD' }))}>
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
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.6rem' }}>
        <input type="checkbox" checked={!!mapeo.talCual} onChange={(e) => setMapeo((m) => ({ ...m, talCual: e.target.checked }))} />
        <span>Usar los precios del Excel tal cual (costo = precio de la lista, venta = efectivo)</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', alignSelf: 'end', paddingBottom: '0.6rem' }}>
        <input type="checkbox" checked={!!mapeo.marcarRepuestos} onChange={(e) => setMapeo((m) => ({ ...m, marcarRepuestos: e.target.checked }))} />
        <span>Marcar como repuestos (aparecen en la pantalla Repuestos)</span>
      </label>
    </div>
  );
}

function TablaMuestra({ filas }: { filas: FilaLista[] }) {
  if (!filas.length) {
    return <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>No se leyó ninguna fila con este mapeo.</p>;
  }
  const conContado = filas.some((f) => f.precioContado != null);
  const conTarjeta = filas.some((f) => f.precioTarjeta != null);
  const importe = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2 }));
  return (
    <div className="table-container" style={{ margin: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Fila</th><th>Código</th><th>N° de parte</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Precio</th>
            {conContado && <th style={{ textAlign: 'right' }}>Contado (lista)</th>}
            {conTarjeta && <th style={{ textAlign: 'right' }}>Tarjeta (lista)</th>}
            <th>Moneda</th><th>Bonif.</th>
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
              {conContado && <td style={{ textAlign: 'right' }}>{importe(f.precioContado)}</td>}
              {conTarjeta && <td style={{ textAlign: 'right' }}>{importe(f.precioTarjeta)}</td>}
              <td>{f.moneda}</td>
              <td>{f.bonificaciones || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ModoPdf = 'catalogo' | 'fichas' | 'tabla';

const MODOS_PDF: { modo: ModoPdf; nombre: string; ayuda: string }[] = [
  { modo: 'fichas', nombre: 'Fichas', ayuda: 'Cada producto en un recuadro, con el código y el precio en la misma línea (ej. INGCO).' },
  { modo: 'catalogo', nombre: 'Catálogo', ayuda: 'Código, descripción y precio uno después del otro (ej. Morano).' },
  { modo: 'tabla', nombre: 'Tabla', ayuda: 'Columnas como un Excel: elegís qué es cada columna.' },
];

/** Cómo leer el PDF: las tres formas, con la que eligió la app marcada como recomendada. */
function ElegirModoPdf({ actual, recomendado, onElegir }: { actual: ModoPdf; recomendado: ModoPdf | null; onElegir: (m: ModoPdf) => void }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div className="form-label" style={{ marginBottom: '0.4rem' }}>Cómo leer este PDF</div>
      <div role="radiogroup" aria-label="Cómo leer este PDF" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {MODOS_PDF.map(({ modo, nombre, ayuda }) => {
          const elegido = modo === actual;
          return (
            <button
              key={modo} type="button" role="radio" aria-checked={elegido} onClick={() => !elegido && onElegir(modo)}
              style={{
                textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: elegido ? 'default' : 'pointer',
                border: `2px solid ${elegido ? 'var(--primary)' : 'var(--border-color)'}`, background: elegido ? 'var(--bg-tertiary)' : 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              <strong>{nombre}</strong>
              {modo === recomendado && <span className="badge badge-success" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>recomendado para este PDF</span>}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{ayuda}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
