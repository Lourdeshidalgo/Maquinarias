# Listas de proveedores en PDF (lectura con Claude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar la lista de un proveedor desde un PDF (leído con Claude) por el mismo flujo de vista previa / aplicar / deshacer, y cruzar renglones por N° de parte del fabricante (OEM) para que la comparativa junte proveedores.

**Architecture:** El navegador corta el PDF en tramos con `pdf-lib` y manda cada tramo a `POST /api/tenant/listas/pdf/leer`, que llama a Claude con salida estructurada y devuelve `FilaLista[]`. Esas filas entran al flujo existente (`/importaciones` → `/filas` → `/finalizar` → vista previa). En paralelo, `FilaLista`/`ImportacionItem` suman `codigoFabricante`, el mapeo de Excel gana la columna OEM y `matchearLote` cruza por `Producto.codigoFabricante`.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar rutas), React 19, Prisma 6 + Postgres, `@anthropic-ai/sdk` 1.x (nuevo), `pdf-lib` 1.17 (nuevo), tests con `node --test` (TS strip types, Node 24).

**Spec:** `docs/superpowers/specs/2026-11-23-lista-pdf-con-claude-design.md`

## Global Constraints

- Modelo `claude-opus-5-5`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, streaming con `.finalMessage()`, `max_tokens: 64000`.
- Fallback ante rechazo: `client.beta.messages.stream({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', ... })`.
- `stop_reason` `max_tokens` o `refusal` → error del tramo, nunca filas parciales.
- Tramos de 10 páginas; si un tramo pesa más de 3,5 MB se parte a la mitad (mínimo 1 página).
- Clave: `ANTHROPIC_API_KEY`. Sin clave: mensaje "La lectura de PDF no está configurada." (no error 500).
- Rutas nuevas detrás de `rutaModuloCostos` (dueño + módulo de costos), como el resto de la importación.
- Normalizado de OEM = `normalizarCodigo` de `lib/listas/parseo.ts` (mayúsculas, sin espacios/guiones/puntos/barras).
- Orden de cruce: código del proveedor ya vinculado → código interno/alternativo → OEM. `tipoMatch` nuevo: `'OEM'`.
- Nada leído del PDF se aplica sin pasar por la vista previa.
- Textos de UI en español rioplatense, como el resto de la app.
- Los tests no llaman a la API de Anthropic.

## Review Focus

1. **PDF sin productos en un tramo** (portada, índice, condiciones): Claude devuelve lista vacía → el tramo cuenta como leído, no como error. Test en Task 4.
2. **Precio en formato argentino o con símbolo** (`$ 6.196,07`, `U$S 17,4`) que el modelo devuelva como texto: se normaliza a número; si no se puede, el renglón queda con `precio: null` (error "Precio vacío o inválido" en la vista previa). Test en Task 4.
3. **OEM repetido en dos productos del catálogo**: el cruce por OEM no elige al azar; si hay más de un producto con ese OEM, no hay match firme (queda "Nuevo"). Test en Task 2.
4. **Renglón cuyo OEM es igual a su propio código** (DIBRA, FRAVIDA): no se duplica ni rompe; cruza por código primero. Test en Task 2.
5. **Tramo que falla a mitad de una lista larga**: las filas de los tramos buenos se conservan y solo se reintenta el que falló; "Continuar" queda deshabilitado mientras haya tramos con error. Verificación manual en Task 6.

---

### Task 1: Campo OEM en el parseo de listas

**Files:**
- Modify: `lib/listas/parseo.ts` (`CampoLista`, `CAMPOS_LISTA`, `PISTAS`, `FilaLista`, `extraerFilas`)
- Test: `tests/listas-parseo.test.ts` (nuevo)

**Interfaces:**
- Produces: `CampoLista` incluye `'codigoFabricante'`; `FilaLista.codigoFabricante: string | null`; `extraerFilas` lo completa desde la columna mapeada.

- [ ] **Step 1: Tests que fallan**

```ts
test('adivinarMapeo: columnas OEM de las listas reales', () => {
  const dila = [['ARTICULO TMC', 'ARTICULO OEM', 'DESCRIPCION', 'RUBRO', 'PRECIO USD S/IVA']];
  assert.deepEqual(adivinarMapeo(dila).columnas, { codigo: 0, codigoFabricante: 1, descripcion: 2, rubro: 3, precio: 4 });
  const tallerSur = [['Logbelts', 'Fabricante', 'Ubicación', 'Descripcion', 'Largo', 'Precio Uni.U$S']];
  assert.equal(adivinarMapeo(tallerSur).columnas.codigoFabricante, 1);
  const villa = [['COD ARTICULO', 'DESCRIPCION', 'MARCA', 'OEM (CODIGO ORIGINAL)', 'PRECIO NETO COERCIO']];
  assert.equal(adivinarMapeo(villa).columnas.codigoFabricante, 3);
  assert.equal(adivinarMapeo(villa).columnas.marca, 2);
});

test('extraerFilas: lleva el OEM', () => {
  const filas = [['02-11-0057', '0072-1-61', 'ABRAZADERA', 17.4]];
  const [f] = extraerFilas(filas, { filaInicio: 1, columnas: { codigo: 0, codigoFabricante: 1, descripcion: 2, precio: 3 }, incluyeIva: false, monedaDefault: 'USD' });
  assert.equal(f.codigoFabricante, '0072-1-61');
});
```

- [ ] **Step 2:** `node --test tests/listas-parseo.test.ts` → FAIL (`codigoFabricante` undefined).
- [ ] **Step 3: Implementar.** `CAMPOS_LISTA` suma `{ campo: 'codigoFabricante', etiqueta: 'N° de parte / OEM', obligatorio: false }`. En `PISTAS` la clave `codigoFabricante` va **primera** (el loop toma la primera que coincide): `/(oem|original|fabricante|n[°º]?\s*de\s*parte|nro\.?\s*parte|part\s*n)/`; `marca` deja de matchear `fabricante` (`/(marca)/`). `extraerFilas` agrega `codigoFabricante: celdaTexto(get(fila, 'codigoFabricante'))`. Como `FilaLista` gana un campo obligatorio, la ruta `app/api/tenant/listas/importaciones/[id]/filas/route.ts` agrega `codigoFabricante: texto(x.codigoFabricante)` en este mismo task (si no, `tsc` falla). Si `parseo.ts` importa algo con alias `@/`, el test importa con ruta relativa `../lib/listas/parseo.ts` (como `tests/costos.test.ts`); si falla por imports del archivo, mover lo que haga falta sin cambiar comportamiento.
- [ ] **Step 4:** `npm test` → PASS (incluye los 9 de costos).
- [ ] **Step 5: Commit** `feat(listas): columna N° de parte / OEM en el mapeo de listas`

### Task 2: Cruce por OEM en la importación

**Files:**
- Create: `lib/listas/match.ts`
- Modify: `lib/listas/importacion.ts:82-160` (`matchearLote`), `prisma/schema.prisma` (`ImportacionItem.codigoFabricante String?`)
- Create: `prisma/migrations/20261123000100_importacion_oem/migration.sql`
- Modify: `app/dashboard/costos/importar/VistaPrevia.tsx:254` (etiqueta `' · encontrado por N° de parte'` cuando `tipoMatch === 'OEM'`)
- Test: `tests/listas-match.test.ts` (nuevo)

**Interfaces:**
- Consumes: `FilaLista.codigoFabricante`, `normalizarCodigo`.
- Produces:
  ```ts
  export type IndicesMatch<V> = {
    vinculoPorCodigo: Map<string, V>;          // código del proveedor normalizado → vínculo
    productoPorCodigo: Map<string, string>;    // código interno/alternativo normalizado → productoId
    productoPorOem: Map<string, string | null>;// OEM normalizado → productoId (null = ambiguo)
  };
  export function indicePorOem(productos: { id: string; codigoFabricante: string | null }[]): Map<string, string | null>;
  export function buscarProducto<V extends { productoId: string }>(
    fila: { codigo: string | null; codigoFabricante: string | null }, idx: IndicesMatch<V>
  ): { tipoMatch: 'PROVEEDOR' | 'CODIGO' | 'OEM' | 'NINGUNO'; productoId?: string; vinculo?: V };
  ```
  `buscarProducto` no busca el vínculo por producto (eso lo sigue haciendo `matchearLote` con `vinculoPorProducto` para CODIGO y OEM).

- [ ] **Step 1: Tests que fallan**

```ts
const idx = (p: Partial<IndicesMatch<{ productoId: string }>>) => ({
  vinculoPorCodigo: new Map(), productoPorCodigo: new Map(), productoPorOem: new Map(), ...p,
});
test('buscarProducto: proveedor > código > OEM', () => {
  const i = idx({
    vinculoPorCodigo: new Map([['0211', { productoId: 'p1' }]]),
    productoPorCodigo: new Map([['ABC', 'p2']]),
    productoPorOem: new Map([['0072161', 'p3']]),
  });
  assert.equal(buscarProducto({ codigo: '02-11', codigoFabricante: '0072-1-61' }, i).productoId, 'p1');
  assert.equal(buscarProducto({ codigo: 'abc', codigoFabricante: '0072-1-61' }, i).tipoMatch, 'CODIGO');
  assert.deepEqual(buscarProducto({ codigo: 'X9', codigoFabricante: '0072 1 61' }, i), { tipoMatch: 'OEM', productoId: 'p3' });
  assert.equal(buscarProducto({ codigo: 'X9', codigoFabricante: null }, i).tipoMatch, 'NINGUNO');
});
test('indicePorOem: OEM repetido en dos productos queda ambiguo (sin match)', () => {
  const m = indicePorOem([{ id: 'a', codigoFabricante: '754-0145' }, { id: 'b', codigoFabricante: '7540145' }, { id: 'c', codigoFabricante: null }]);
  assert.equal(m.get('7540145'), null);
  assert.equal(buscarProducto({ codigo: null, codigoFabricante: '754-0145' }, idx({ productoPorOem: m })).tipoMatch, 'NINGUNO');
});
test('buscarProducto: OEM igual al código propio cruza por código', () => {
  const i = idx({ productoPorCodigo: new Map([['850972', 'p1']]), productoPorOem: new Map([['850972', 'p1']]) });
  assert.equal(buscarProducto({ codigo: '850972', codigoFabricante: '850972' }, i).tipoMatch, 'CODIGO');
});
```

- [ ] **Step 2:** `node --test tests/listas-match.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar `lib/listas/match.ts`** con las firmas de arriba (sin Prisma, importable desde tests con ruta relativa).
- [ ] **Step 4: Usarlo en `matchearLote`**: el `findMany` de productos suma `codigoFabricante`; construir `productoPorOem = indicePorOem(productos)`; reemplazar el bloque "Orden de matching" por `buscarProducto`; para `CODIGO` y `OEM`, `vinculo = vinculoPorProducto.get(productoId)` como hoy. Guardar `codigoFabricante: f.codigoFabricante?.slice(0, 120) || null` en `base`.
- [ ] **Step 5: Esquema y migración.** `ImportacionItem.codigoFabricante String?` y comentario de `tipoMatch` con `'OEM'`. Migración a mano: `ALTER TABLE "ImportacionItem" ADD COLUMN "codigoFabricante" TEXT;`. Verificar con `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <local>` (vacío) y aplicar en la base local con `npx prisma db push` (no `migrate reset`). `npx prisma generate`.
- [ ] **Step 6:** `npm test` y `npx tsc --noEmit` → PASS.
- [ ] **Step 7: Commit** `feat(listas): cruzar renglones por N° de parte del fabricante`

### Task 3: Guardar el OEM al aplicar

**Files:**
- Modify: `lib/listas/importacion.ts` (`aplicarImportacion`, bloque `CREAR` ~línea 447 y productos existentes ~línea 490)

**Interfaces:**
- Consumes: `ImportacionItem.codigoFabricante`.

- [ ] **Step 1: Implementar.** Producto creado (`productosNuevos`) y reactivado (`productosReactivar.data`) llevan `codigoFabricante: item.codigoFabricante?.slice(0, 120) ?? null` (en reactivado solo si viene). Para productos existentes, si `!producto.codigoFabricante && item.codigoFabricante`, acumular `{ id, codigoFabricante }` y actualizarlos dentro de la misma transacción del aplicar (`prisma.producto.update` por cada uno o un `UPDATE … FROM (VALUES …)` siguiendo `lib/listas/sql.ts`). Deshacer no lo revierte (completar un dato faltante es inocuo); dejarlo comentado en el código.
- [ ] **Step 2: Verificar contra la base local** (`npm run db:local` + servidor `gestion-dev-local`): importar un Excel chico de DILA con columna "ARTICULO OEM" para TMC, aplicar creando 2 productos; después importar para otro proveedor un Excel con columna "OEM" y los mismos OEM con otro código → la vista previa los muestra como "encontrado por N° de parte" (no "Nuevo"); aplicar → el comparador (`/dashboard/costos/comparador`) lista esos productos con los dos proveedores.
- [ ] **Step 3:** `npx tsc --noEmit` y `npm run lint` → sin errores nuevos.
- [ ] **Step 4: Commit** `feat(listas): guardar el N° de parte al crear o completar productos desde una lista`

### Task 4: Lectura de un tramo de PDF con Claude

**Files:**
- Create: `lib/listas/pdf.ts`
- Modify: `package.json` (`@anthropic-ai/sdk`, `pdf-lib`)
- Test: `tests/listas-pdf.test.ts` (nuevo)

**Interfaces:**
- Consumes: `FilaLista`, `parseNumero` (de `parseo.ts`).
- Produces:
  ```ts
  export type RenglonLeido = { codigo: string | null; descripcion: string | null; precio: number | string | null;
    moneda: 'ARS' | 'USD' | null; marca: string | null; rubro: string | null; codigoFabricante: string | null; pagina: number };
  export const ESQUEMA_RENGLONES: Record<string, unknown>; // JSON schema: { renglones: RenglonLeido[] }, additionalProperties: false, todos required (nullable)
  export function normalizarRenglones(renglones: RenglonLeido[], desde: number, monedaDefault: 'ARS' | 'USD'): FilaLista[];
  export class ErrorLecturaPdf extends Error {}
  export function pdfConfigurado(): boolean; // !!process.env.ANTHROPIC_API_KEY
  export async function leerTramoPdf(pdf: Uint8Array, desde: number): Promise<{ renglones: RenglonLeido[]; uso: { entrada: number; salida: number } }>;
  ```
  `pagina` es relativa al tramo (1 = primera página del tramo). `normalizarRenglones` arma `fila = (desde + pagina - 1) * 1000 + orden en esa página` (orden desde 1).

- [ ] **Step 1: Tests que fallan** (solo `normalizarRenglones`; no hay red)

```ts
const r = (x: Partial<RenglonLeido>): RenglonLeido => ({ codigo: null, descripcion: null, precio: null, moneda: null, marca: null, rubro: null, codigoFabricante: null, pagina: 1, ...x });
test('normalizarRenglones: precios argentinos, # en el código y número de fila por página', () => {
  const f = normalizarRenglones([
    r({ codigo: '#AD10001', descripcion: 'Pinza universal 8"', precio: '$ 6.196,07', pagina: 1 }),
    r({ codigo: 'AD10002', descripcion: 'Pinza 7"', precio: 5580.3, pagina: 1 }),
    r({ codigo: 'X', descripcion: 'Otra', precio: 'U$S 17,4', moneda: 'USD', pagina: 2 }),
  ], 11, 'ARS');
  assert.deepEqual(f.map((x) => [x.fila, x.codigo, x.precio, x.moneda]), [
    [11001, 'AD10001', 6196.07, 'ARS'], [11002, 'AD10002', 5580.3, 'ARS'], [12001, 'X', 17.4, 'USD'],
  ]);
});
test('normalizarRenglones: precio ilegible queda null; renglón sin código ni descripción se descarta; lista vacía no es error', () => {
  const f = normalizarRenglones([r({ codigo: 'A1', descripcion: 'x', precio: 'consultar' }), r({ precio: 10 })], 1, 'USD');
  assert.equal(f.length, 1);
  assert.equal(f[0].precio, null);
  assert.equal(f[0].moneda, 'USD');
  assert.deepEqual(normalizarRenglones([], 1, 'ARS'), []);
});
```

- [ ] **Step 2:** `node --test tests/listas-pdf.test.ts` → FAIL.
- [ ] **Step 3: Implementar `normalizarRenglones`** (recortes como `matchearLote`: código 120, descripción 500, marca/rubro 120; quitar `#` inicial del código; `precio` vía `parseNumero` y descartar ≤ 0 o ≥ 1e12; `bonificaciones: null`). Si `parseNumero` no entiende `$`/`U$S`, limpiar símbolos antes de llamarlo.
- [ ] **Step 4: Implementar `leerTramoPdf`** con `new Anthropic()` y los parámetros de Global Constraints. Contenido: `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }` y después el texto con las instrucciones del spec (sección "Lectura (servidor)"): un renglón por producto con precio; ignorar portadas, índices, textos legales y especificaciones; código tal cual sin `#`; precio tal como figura; moneda USD si dice U$S/USD/dólares, si no ARS, null si no se sabe; OEM/N° de parte del fabricante si figura (también dentro de la descripción); si hay precio regular y oferta, el que la lista presenta como precio unitario a pagar; `pagina` relativa al tramo. Revisar `stop_reason`: `'refusal'` → `ErrorLecturaPdf('El servicio no pudo leer estas páginas.')`; `'max_tokens'` → `ErrorLecturaPdf('Las páginas tienen demasiados productos; probá con menos páginas.')`. Parsear el bloque `text` con `JSON.parse`; si falla → `ErrorLecturaPdf`. Errores de la API (`Anthropic.RateLimitError`, `Anthropic.APIError`) → `ErrorLecturaPdf` con mensaje en español; `AuthenticationError` → "La clave de Anthropic no es válida.". `console.info` con tokens de entrada/salida.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** `feat(listas): leer un tramo de lista en PDF con Claude`

### Task 5: Ruta `POST /api/tenant/listas/pdf/leer`

**Files:**
- Create: `app/api/tenant/listas/pdf/leer/route.ts`

**Interfaces:**
- Consumes: `leerTramoPdf`, `normalizarRenglones`, `pdfConfigurado`, `ErrorLecturaPdf`, `rutaModuloCostos`.
- Produces: `GET` → `{ configurado: boolean }`. `POST` multipart (`archivo`: PDF del tramo, `desde`: número de la primera página, `monedaDefault`: `'ARS' | 'USD'`) → `200 { filas: FilaLista[] }` | `400 { error }` (sin archivo, no es PDF, > 4 MB) | `503 { error: 'La lectura de PDF no está configurada.' }` | `502 { error }` (`ErrorLecturaPdf`).

- [ ] **Step 1: Implementar** (`export const maxDuration = 120`; leer la guía de route handlers en `node_modules/next/dist/docs/01-app` para `req.formData()` en esta versión).
- [ ] **Step 2: Verificar** con el servidor local: `curl` `GET` devuelve `configurado` según haya clave; `POST` sin archivo → 400; sin clave → 503. La llamada real se prueba en Task 6.
- [ ] **Step 3: Commit** `feat(listas): ruta para leer tramos de PDF`

### Task 6: Importar PDF desde la pantalla

**Files:**
- Modify: `app/dashboard/costos/importar/Carga.tsx` (rama `tipo === 'pdf'` en `leerArchivo`, nuevo paso de resumen, `procesar`)
- Create: `app/dashboard/costos/importar/LecturaPdf.tsx` (progreso por tramos, reintento, resumen)

**Interfaces:**
- Consumes: `GET/POST /api/tenant/listas/pdf/leer`, `FilaLista`, el `procesar` existente.
- Produces: el `Paso` de `Carga` suma `'pdf'`; al terminar la lectura, `procesar` usa las filas leídas (con `bonificaciones` = `mapeo.bonificacionGeneral || null` y `moneda` ya resuelta) en lugar de `filasExtraidas`, y crea la importación con `archivoTipo: 'pdf'` y `mapeo` sin columnas.

- [ ] **Step 1: Implementar.**
  - Al elegir PDF: si `GET …/pdf/leer` dice `configurado: false`, mostrar "La lectura de PDF no está configurada." y no seguir. Abrir con `PDFDocument.load` (`pdf-lib`, import dinámico), mostrar "78 páginas · se lee con Claude, tarda unos minutos" y botón "Leer lista".
  - Tramos de 10 páginas (`PDFDocument.create` + `copyPages`), partiendo a la mitad los que superen 3,5 MB; enviarlos de a uno, mostrando "Leyendo páginas 11 a 20 de 78…" y la cantidad de productos leídos hasta el momento.
  - Un tramo que falla queda listado con su error y botón "Reintentar"; los demás se conservan. "Continuar" deshabilitado mientras haya tramos pendientes o con error.
  - Resumen: total de productos, cantidad con OEM, cantidad sin precio, muestra de 10 renglones (reusar `TablaMuestra` si encaja), y los ajustes de hoy (IVA incluido, moneda por defecto, bonificación general, IVA de productos nuevos). "Continuar" → `procesar` (respaldo en Blob como hoy → crear importación → `/filas` → `/finalizar` → vista previa).
  - Quitar el mensaje "La importación desde PDF todavía no está disponible" y actualizar el texto de ayuda del selector de archivo ("Excel (.xlsx, .xls), CSV o PDF").
- [ ] **Step 2: Verificar en el navegador** (servidor `gestion-dev-local`, usuario demo, con `ANTHROPIC_API_KEY` en `.env.local`). **Pedir OK al usuario antes de correrlo: la lectura del PDF de Morano cuesta ~US$1–2.** Crear el proveedor "Morano", importar `MRN-OFF-SEPTIEMBRE-26.pdf`: ~370 productos, códigos sin `#`, precios en pesos; vista previa con todos "Nuevo"; aplicar → productos creados con la descripción del proveedor; deshacer funciona. Probar el reintento cortando la red a mitad (DevTools offline) y el caso sin clave.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm test` → sin errores nuevos.
- [ ] **Step 4: Commit** `feat(listas): importar la lista de un proveedor desde PDF`
