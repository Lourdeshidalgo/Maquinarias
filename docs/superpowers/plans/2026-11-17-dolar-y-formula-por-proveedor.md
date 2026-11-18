# Dólar y fórmula por proveedor — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada proveedor tiene su propio dólar (manual, con historial) y su descuento base, y el sistema muestra el precio crédito (venta + recargo %).

**Architecture:** Se extiende el módulo de costos existente. `Cotizacion` gana `proveedorId` opcional (null = dólar general). Un helper puro resuelve "qué dólar usa este proveedor" y `costoVigenteDesdeLista` aprende el descuento base del proveedor; todos los lugares que hoy leen `cotizacionVigente(empresaId)` pasan a resolver por proveedor.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar rutas/páginas), Prisma 6 + Postgres, React 19, `node --test` (Node 24, sin dependencias nuevas).

**Spec:** `docs/superpowers/specs/2026-11-17-dolar-y-formula-por-proveedor-design.md`

## Global Constraints

- Fórmula: `costo = lista × bonificaciones × IVA (si la lista viene sin IVA) × dólar`; `precio = costo real × (1 + margen)`; `crédito = precio venta × (1 + recargoCredito/100)`.
- Dólar de un proveedor = su última cotización (por `fecha` desc, `createdAt` desc); si no tiene ninguna, el dólar general (`proveedorId = null`).
- Bonificaciones del producto (`ProveedorProducto.bonificaciones`) no vacías **reemplazan** a `Proveedor.bonificacionesBase`; vacías → se usa la base.
- `recargoCredito` por defecto `10`. El precio crédito no se persiste.
- Los cambios de precio respetan `ConfiguracionCostos.modoPrecio` (AUTOMATICO / APROBACION), como hoy.
- Textos de UI en español rioplatense, igual que el resto de la app.
- Sin dependencias nuevas.

## Review Focus

1. Cargar el dólar **general** no debe tocar productos de proveedores que tienen dólar propio → test en Task 1 (`cotizacionPara`) y verificación en Task 3.
2. Proveedor sin dólar propio y sin dólar general, con productos en USD → el costo queda `null` y la UI avisa, no guarda $0 → test en Task 1.
3. Bonificaciones del producto vacías vs. `"0"` vs. con espacios → `"  "` cuenta como vacía → test en Task 1.
4. Importar la lista de un proveedor con dólar propio usa ese dólar y no el general → verificación en Task 2.
5. Precio crédito con redondeo: se redondea con la misma regla `redondearPrecio(…, config.redondeo)` → test en Task 1.

---

### Task 1: Funciones puras y runner de tests

**Files:**
- Modify: `lib/costos.ts`
- Create: `tests/costos.test.ts`
- Modify: `package.json` (script `"test": "node --test tests/"`), `tsconfig.json` (`"allowImportingTsExtensions": true`)

**Interfaces:**
- Produces:
  - `type CotizacionesVigentes = { general: number | null; porProveedor: Map<string, number> }`
  - `cotizacionPara(c: CotizacionesVigentes, proveedorId: string | null | undefined): number | null`
  - `bonificacionesEfectivas(propias: string | null | undefined, base: string | null | undefined): string`
  - `DatosCostoLista` gana `bonificacionesBase?: string | null`; `costoVigenteDesdeLista` usa `bonificacionesEfectivas(d.bonificaciones, d.bonificacionesBase)`.
  - `precioCredito(precioVenta: number, recargoPct: number, redondeo: number): number`

- [ ] **Step 1: Escribir los tests** (`import … from '../lib/costos.ts'`, `node:test` + `node:assert/strict`)

```ts
test('cotizacionPara: propio > general > null', () => {
  const c = { general: 1500, porProveedor: new Map([['tmc', 1608]]) };
  assert.equal(cotizacionPara(c, 'tmc'), 1608);
  assert.equal(cotizacionPara(c, 'otro'), 1500);
  assert.equal(cotizacionPara(c, null), 1500);
  assert.equal(cotizacionPara({ general: null, porProveedor: new Map() }, 'x'), null);
});
test('bonificacionesEfectivas: propias reemplazan a la base', () => {
  assert.equal(bonificacionesEfectivas('50', '25'), '50');
  assert.equal(bonificacionesEfectivas('', '25+15'), '25+15');
  assert.equal(bonificacionesEfectivas('  ', '25+15'), '25+15');
  assert.equal(bonificacionesEfectivas(null, null), '');
});
test('TMC del Excel: 17,4 USD → 32373,69 (Excel: 32373,68 sin redondear el costo)', () => {
  const costo = costoVigenteDesdeLista({ costoLista: 17.4, moneda: 'USD', bonificaciones: '', bonificacionesBase: '25+15',
    incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true, cotizacion: 1608 });
  assert.equal(costo, 21582.46);
  assert.equal(precioDeVenta(costo!, 50, 0), 32373.69);
});
test('USD sin dólar → null', () => {
  assert.equal(costoVigenteDesdeLista({ costoLista: 10, moneda: 'USD', incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true, cotizacion: null }), null);
});
test('precioCredito', () => {
  assert.equal(precioCredito(32373.69, 10, 0), 35611.06);
  assert.equal(precioCredito(32373.69, 10, 100), 35600);
});
```

- [ ] **Step 2:** `npm test` → FAIL (funciones no exportadas).
- [ ] **Step 3:** Implementar las cuatro funciones/cambios en `lib/costos.ts`. `precioCredito` = `redondearPrecio(precioVenta × (1 + recargoPct/100), redondeo)`.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` sin errores nuevos.
- [ ] **Step 5:** Commit `feat(costos): dólar por proveedor y descuento base en el cálculo puro`.

### Task 2: Esquema, migración y lectura del dólar por proveedor

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261117000100_dolar_por_proveedor/migration.sql`
- Modify: `lib/costos-db.ts`, `lib/costos-cambios.ts`, `lib/listas/importacion.ts`, `app/api/tenant/listas/importaciones/[id]/route.ts`, `app/api/tenant/costos/comparador/route.ts`

**Interfaces:**
- Consumes: `CotizacionesVigentes`, `cotizacionPara`, `bonificacionesEfectivas` (Task 1).
- Produces:
  - Schema: `Cotizacion.proveedorId String?` (+ relación a `Proveedor` `onDelete: Cascade`, índice `[empresaId, proveedorId, moneda, fecha]`); `Proveedor.bonificacionesBase String @default("")`; `ConfiguracionCostos.recargoCredito Decimal @default(10) @db.Decimal(7,2)`.
  - `cargarCotizaciones(empresaId: string, db?: Db): Promise<CotizacionesVigentes>` en `lib/costos-db.ts` (una sola query: últimas por proveedor + general, con `DISTINCT ON` o agrupando en memoria).
  - `contextoPrecios(empresaId: string, proveedorId: string | null)` — `ctx.cotizacion` pasa a ser la del proveedor de la importación; `ctx` gana `bonificacionesBase: string`.

- [ ] **Step 1:** Editar schema y escribir la migración SQL (ALTER TABLE … ADD COLUMN, FK, índice). Los registros existentes quedan con `proveedorId` null (= general).
- [ ] **Step 2:** `npm run db:local` en otra terminal y `npx prisma migrate deploy && npx prisma generate` → OK.
- [ ] **Step 3:** Reemplazar cada `cotizacionVigente(empresaId)` usado para costos por `cargarCotizaciones` + `cotizacionPara(…, proveedorId del vínculo)`, y pasar `bonificacionesBase: proveedor.bonificacionesBase` a cada `costoVigenteDesdeLista` (incluye `valorComparable` y `calcularFila` en importación). En `costos-cambios.ts:95` y `costos-db.ts:138` la condición `!pp.bonificaciones` pasa a `!bonificacionesEfectivas(pp.bonificaciones, base)`.
- [ ] **Step 4:** `npx tsc --noEmit && npm run lint && npm test` → OK. `grep -rn "cotizacionVigente(" lib app` solo debe quedar en lugares que muestran el dólar general.
- [ ] **Step 5:** Commit `feat(costos): dólar y descuento base por proveedor en importación, comparador y cambios`.

### Task 3: Registrar el dólar de un proveedor y recalcular solo sus productos

**Files:**
- Modify: `lib/costos-dolar.ts`, `app/api/tenant/costos/cotizaciones/route.ts`

**Interfaces:**
- Consumes: `cargarCotizaciones`, `cotizacionPara` (Tasks 1–2).
- Produces:
  - `cotizacionVigenteRegistro(empresaId, proveedorId: string | null, db?)` — `proveedorId` null = general.
  - `calcularCambioCotizacion(empresaId, cotizacion: number, proveedorId: string | null)` — con proveedor: solo vínculos preferidos USD de ese proveedor. General: solo vínculos cuyo proveedor **no** tiene dólar propio.
  - `registrarCotizacion(empresaId, valor, fecha, usuarioId, proveedorId: string | null, fuente?)`; el `detalle` del historial dice `Dólar <proveedor|general> X → Y`.
  - API `GET` → `{ general: {valor, fecha} | null, proveedores: Array<{ id, nombre, valor: number | null, fecha: string | null, propio: boolean, productosUsd: number }>, historial }` (historial filtrable con `?proveedorId=`).
  - API `POST { valor, fecha, preview?, proveedorId? }` — valida que el proveedor sea de la empresa.

- [ ] **Step 1:** Implementar los cambios de firma y filtros.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → OK.
- [ ] **Step 3:** Verificación manual con la empresa demo (`npm run seed:maquinaria`): cargar dólar 1608 a un proveedor con productos USD → con `preview` solo aparecen productos de ese proveedor; cargar dólar general → no aparecen productos de ese proveedor.
- [ ] **Step 4:** Commit `feat(costos): cargar el dólar por proveedor y recalcular solo sus productos`.

### Task 4: Pantallas — dólar por proveedor, descuento base y precio crédito

**Files:**
- Modify: `app/dashboard/costos/dolar/page.tsx`
- Modify: `app/api/tenant/proveedores/route.ts`, `app/dashboard/proveedores/page.tsx`
- Modify: `app/api/tenant/costos/configuracion/route.ts`, `app/dashboard/costos/margenes/page.tsx`
- Modify: `app/api/tenant/costos/grilla/route.ts`, `app/dashboard/costos/grilla/page.tsx`, `app/api/tenant/productos/route.ts`, `app/dashboard/productos/page.tsx`

**Interfaces:**
- Consumes: API de Task 3; `precioCredito` (Task 1); `recargoCredito`, `bonificacionesBase` (Task 2).

- [ ] **Step 1: Dólar.** La página muestra una tabla: fila "General" + una fila por proveedor activo con dólar vigente (o "usa el general" en gris), fecha, cantidad de productos en USD y un input + botón "Actualizar" que abre la vista previa existente filtrada por ese proveedor antes de confirmar. Historial debajo, filtrable por proveedor.
- [ ] **Step 2: Proveedores.** Campo "Descuento base" (placeholder `25+15`) en alta/edición; la API valida con `parseBonificaciones` y guarda el texto normalizado.
- [ ] **Step 3: Configuración.** Campo "Recargo crédito %" en márgenes (0–100); la API lo guarda.
- [ ] **Step 4: Crédito.** Las APIs de grilla y productos devuelven `precioCredito` (con `precioCredito(precioVenta, recargoCredito, redondeo)`) solo si la empresa tiene el módulo de costos; las tablas muestran la columna "Crédito" al lado de "Precio".
- [ ] **Step 5:** `npx tsc --noEmit && npm run lint && npm test` → OK; verificación en el navegador de las cuatro pantallas (preview del dev server), incluyendo ancho de celular.
- [ ] **Step 6:** Commit `feat(costos): pantallas de dólar por proveedor, descuento base y precio crédito`.
