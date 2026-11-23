# Importar listas de proveedores en PDF (lectura con Claude)

Fecha: 2026-11-23 · Rama: `feature/listas-proveedores`

## Por qué

El cliente (repuestos de maquinaria y jardín) compra a ~15 proveedores (ALLTRADE, CARRANZA, DIBRA,
DILA/TMC, FIASA, FRAVIDA, LOGBELTS, SHIMAHA, TALLER SUR, VILLA, SAGUES, …; ver `Repuestos.xlsx`).
Varios mandan la lista en PDF (ej. Morano, `MRN-OFF-SEPTIEMBRE-26.pdf`, 78 páginas, ~370 productos en
formato catálogo con tarjetas, código propio `#AD10001`, precios en pesos NETO + IVA). Hoy la
importación solo lee Excel/CSV: al subir un PDF muestra "todavía no está disponible".

El objetivo de fondo es la **comparativa entre proveedores**: para comparar, la app necesita tener
cargadas las listas de cada proveedor y reconocer cuándo dos renglones son el mismo repuesto.

## Qué se construye

1. **Lectura de PDF con Claude.** En *Importar lista* el usuario elige el proveedor, sube el PDF, la
   app lo lee con Claude y obtiene los renglones (código, descripción, precio, moneda, marca/rubro si
   hay, y N° de parte del fabricante si aparece). Muestra una muestra de lo leído y los mismos ajustes
   de hoy (IVA incluido, moneda por defecto, bonificación general), y sigue por el flujo existente:
   crear importación → enviar filas → vista previa (subas/bajas/nuevos/faltantes) → aplicar / deshacer.
   Los productos nuevos se crean con el código y la descripción del proveedor (comportamiento actual
   de los renglones "Nuevo") y quedan vinculados a ese proveedor.
2. **N° de parte del fabricante (OEM) en la importación** — para que la comparativa cruce sola:
   - `FilaLista` e `ImportacionItem` suman `codigoFabricante`.
   - En Excel/CSV se agrega el campo "N° de parte / OEM" al mapeo de columnas (y a `adivinarMapeo`:
     encabezados `OEM`, `ARTICULO OEM`, `FABRICANTE`, `CODIGO ORIGINAL`).
   - `matchearLote` agrega un tercer paso de cruce: si no hubo match por código del proveedor ni por
     código interno/alternativo, busca un producto con el mismo `Producto.codigoFabricante`
     (normalizado igual que los códigos: mayúsculas, sin espacios/guiones/puntos). `tipoMatch = 'OEM'`.
   - Al crear un producto desde la lista se guarda su `codigoFabricante`; al aplicar sobre uno
     existente sin OEM, se completa.

## Fuera de alcance (siguientes pasos)

- Vincular a mano en la vista previa ("este renglón es el mismo que…") y sugerencias por descripción.
- Cambios en la pantalla *Comparar proveedores* (ya compara cuando un producto tiene 2+ proveedores).
- Leer PDFs escaneados sin texto con otra herramienta (Claude los lee igual como imagen; no se agrega OCR propio).

## Anti-objetivos

- Que se aplique algo leído del PDF sin pasar por la vista previa.
- Que una lista mal leída deje productos a $0 o con precios inventados: renglones sin precio claro
  quedan como error ("Precio vacío o inválido"), igual que en Excel.
- Que el PDF se mande a Claude más de una vez por error (reintentos solo del tramo que falló).

## Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Lectura con Claude (elegido)** | Lee cualquier formato (tablas, catálogos con tarjetas, OEM dentro de la descripción); el usuario no arma nada | Costo por lista; requiere clave de Anthropic; el PDF sale a un servicio externo |
| B. Extraer texto del PDF en el navegador (pdf.js) + mapeo de columnas actual | Gratis, local | Solo sirve con tablas prolijas; no sirve con Morano ni celdas en varios renglones |
| C. Un lector a medida por proveedor | Preciso para ese formato | ~15 formatos distintos; se rompe cuando el proveedor cambia el PDF |

El usuario eligió **A**.

## Cómo (decisiones)

**Flujo**
1. `Carga.tsx`: si el archivo es PDF (y hay proveedor elegido), lo abre en el navegador con `pdf-lib`
   y obtiene la cantidad de páginas. El original se sigue respaldando en Vercel Blob al procesar, como hoy.
2. El navegador corta el PDF **en tramos de páginas** (10 páginas por tramo; si un tramo pesa más de
   3,5 MB se corta a la mitad) y manda cada tramo a una ruta nueva
   `POST /api/tenant/listas/pdf/leer` (multipart: `archivo`, `desde`) → `{ filas: FilaLista[] }`.
   Así la lectura no depende de Blob (que en desarrollo local puede no estar configurado).
   Cada llamada es corta (`maxDuration = 120`), muestra progreso ("Leyendo páginas 11 a 20 de 78…") y,
   si un tramo falla, se reintenta solo ese tramo (botón "Reintentar").
3. Con todas las filas, en vez del paso de mapeo de columnas se muestra un resumen: cantidad de
   productos leídos, muestra de 10 renglones, moneda detectada y los ajustes (IVA incluido,
   moneda por defecto, bonificación general, IVA de productos nuevos). "Continuar" sigue por el
   mismo `procesar` de hoy (crear importación con `archivoTipo: 'pdf'` → `/filas` por lotes → `/finalizar`).

**Lectura (servidor)**
- `lib/listas/pdf.ts`: recibe el tramo (ya recortado en el navegador con `pdf-lib`, dependencia
  nueva) y llama a Claude con el tramo como documento base64.
- SDK `@anthropic-ai/sdk` (dependencia nueva), modelo `claude-opus-5-5`, `thinking: adaptive`,
  `output_config.effort: 'low'` (extracción mecánica; subir si la calidad no alcanza),
  salida estructurada con `output_config.format` (JSON schema de la lista de renglones), streaming
  con `finalMessage()` y `max_tokens: 64000`. Fallback ante rechazo con el parámetro server-side
  `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`).
- El prompt explica: un renglón por producto con precio; ignorar encabezados, índices, textos legales
  y especificaciones; código tal cual figura (sin `#`); precio como número (formato argentino
  `$ 6.196,07` → 6196.07); moneda `USD` si dice U$S/USD/dólares, si no `ARS`; si un producto muestra
  precio regular y precio oferta, tomar el que la lista presenta como precio unitario a pagar
  (en Morano, el precio oferta) — decisión del builder, ver abajo.
- Validación del resultado con el mismo criterio que `extraerFilas` (precio > 0, recortes de largo).
  `stop_reason` `max_tokens` o `refusal` → error del tramo (reintentable), nunca filas parciales en silencio.
- `fila` = número de página × 1000 + orden en la página (para ubicar el renglón en el PDF).

**Configuración**
- `ANTHROPIC_API_KEY` en el entorno (Vercel y `.env.local`). Sin clave, la app muestra
  "La lectura de PDF no está configurada" en vez de fallar.
- Solo dueños con el módulo de costos activo (`rutaModuloCostos`), igual que el resto de la importación.
- Se registra el uso (tokens de entrada/salida por importación) en el log del servidor para poder estimar costos.

**Costo aproximado** (precios de `claude-opus-5-5`: US$4 / 1M tokens de entrada, US$20 / 1M de salida):
una lista como la de Morano (78 páginas, ~370 productos) ronda **US$1–2**. Una lista de miles de
renglones en PDF (ej. VILLA, ~17.000) costaría bastante más (decenas de dólares) y tardaría: para esas,
seguir pidiendo el Excel. La pantalla avisa la cantidad de páginas antes de empezar.

## Queda a criterio del builder

- Tamaño exacto del tramo (10 páginas es el punto de partida) y lotes de envío.
- Cómo obtener la cantidad de páginas en el navegador (pdf-lib en el cliente o devolverla el servidor).
- Textos exactos de la pantalla y del prompt.
- Tests: `node --test` para el normalizado/validación de filas leídas y para el cruce por OEM
  (`matchearLote` con producto que tiene `codigoFabricante`). La llamada a Claude no se testea con red.
