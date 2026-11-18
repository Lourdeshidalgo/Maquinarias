# Precio USD por producto y actualización directa — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar/editar a mano el precio en USD de cada producto (Stock y edición rápida) y que los cambios de dólar, descuento base o precio USD actualicen costo y precio de venta en el momento, sin bandeja.

**Architecture:** El precio USD vive en el `ProveedorProducto` preferido (`moneda='USD'`, `costoLista`). Una función de lib fija esos datos y recalcula el producto con `calcularFilas` + `aplicarFilas` (ya existentes en `lib/costos-dolar.ts`), forzando modo automático. Los cambios de dólar y de descuento base pasan a forzar modo automático también.

**Tech Stack:** Next.js 16, Prisma 6, React 19, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-precio-usd-por-producto-design.md`

## Global Constraints

- Directo (sin bandeja, sin importar `modoPrecio`): cambio de dólar (general o de proveedor), cambio de descuento base, cambio manual del precio USD de un producto.
- Respetan `modoPrecio` como hoy: importación de listas, aumento masivo, costo en pesos editado a mano.
- Precio USD manual: por defecto `incluyeIva = false`; descuento propio opcional, validado con `normalizarBonificaciones`.
- Todo filtrado por `empresaId`; solo el dueño edita costos (regla existente `empleadoCambiaCosto` / `rutaModuloCostos`).
- Textos en español rioplatense.

## Review Focus

1. Producto en USD cuyo proveedor no tiene dólar ni hay general → no se guarda costo $0: error claro "Cargá el dólar de <proveedor> o el general" → test en Task 1 (`datosListaManual` no aplica; la lib lanza) y verificación en Task 3.
2. Cambiar de USD a Pesos en Stock → el vínculo vuelve a `moneda='ARS'` con `costoLista = costo en pesos` y deja de moverse con el dólar → verificación en Task 3.
3. Precio USD con coma decimal ("12,5") → se acepta como 12.5 → test en Task 1.
4. Producto sin proveedor asignado → el modo Dólares no se ofrece → Task 3.
5. Empleado (rol EMPLOYEE) no puede cambiar el precio USD → Task 2 y 3 usan la misma regla que el costo.

---

### Task 1: Lib — actualización directa y precio USD manual

**Files:**
- Modify: `lib/costos.ts`, `tests/costos.test.ts`, `lib/costos-dolar.ts`, `app/dashboard/costos/dolar/page.tsx` (texto del modal)

**Interfaces:**
- Produces:
  - `datosListaManual(body: { costoLista: unknown; incluyeIva?: unknown; bonificaciones?: unknown }): { ok: true; costoLista: number; incluyeIva: boolean; bonificaciones: string } | { ok: false; error: string }` en `lib/costos.ts` (pura).
  - `aplicarFilas(..., modo: 'AUTOMATICO' | 'APROBACION', ...)` — `registrarCotizacion` y `recalcularPorDescuentoBase` pasan `'AUTOMATICO'`.
  - `fijarListaUsdProducto(empresaId: string, productoId: string, datos: { costoLista: number; incluyeIva: boolean; bonificaciones: string }, usuarioId: string | null): Promise<{ costoNuevo: number; precioNuevo: number }>` en `lib/costos-dolar.ts`: exige vínculo preferido; lo pasa a `moneda='USD'` con esos datos; recalcula con `calcularFilas({ productoId })` y aplica directo con origen `'MANUAL'`, detalle `Precio USD a mano: US$ X`. Lanza `Error` si no hay proveedor asignado o no hay dólar.
  - `simularListaUsd(empresaId, proveedorId: string, datos, producto: { ivaPorcentaje: number; costoEnvio: number; costoPackaging: number; categoria: string; margenPorcentaje: number | null }): Promise<{ cotizacion: number | null; costo: number | null; precio: number | null }>` (para la vista en vivo; sin escribir).

- [ ] **Step 1: tests** de `datosListaManual`: `{costoLista:'12,5'}` → ok 12.5, incluyeIva false, bonificaciones ''; `{costoLista:'-1'}` y `{costoLista:'abc'}` → error; `{costoLista:10, bonificaciones:'25+x'}` → error; `{costoLista:10, incluyeIva:true, bonificaciones:' 50 '}` → ok, '50'.
- [ ] **Step 2:** `npm test` → FAIL (no exportada).
- [ ] **Step 3:** implementar `datosListaManual`; `npm test` → PASS.
- [ ] **Step 4:** en `lib/costos-dolar.ts`: parámetro `modo` en `aplicarFilas`; dólar y descuento base → `'AUTOMATICO'`; `fijarListaUsdProducto` y `simularListaUsd`. El modal del dólar dice "Los precios de venta se actualizan al guardar." siempre.
- [ ] **Step 5:** `npx tsc --noEmit && npm test` → OK. Verificación con curl (base local): cargar un dólar de proveedor → respuesta con `actualizados > 0` y `sugeridos = 0`.
- [ ] **Step 6:** Commit `feat(costos): dólar y descuento base actualizan el precio directo; precio USD manual en lib`.

### Task 2: Edición rápida — editar el precio USD

**Files:**
- Modify: `app/api/tenant/costos/grilla/route.ts`, `app/dashboard/costos/grilla/page.tsx`

**Interfaces:**
- Consumes: `datosListaManual`, `fijarListaUsdProducto` (Task 1).
- Produces: filas de la grilla con `costoListaUsd: number | null` (preferido en USD); `PATCH { productoId, costoListaUsd }` → `fijarListaUsdProducto` (conserva `incluyeIva`/`bonificaciones` actuales del vínculo).

- [ ] **Step 1:** API: incluir `costoLista`, `incluyeIva`, `bonificaciones` del preferido; PATCH con `costoListaUsd`.
- [ ] **Step 2:** `CeldaCosto` con `enUsd`: editable, muestra "US$", acepta decimales (coma o punto), flechas ±1; debajo el costo en pesos en gris.
- [ ] **Step 3:** `npx tsc --noEmit && npm run lint` (sin errores nuevos en estos archivos) y verificación en navegador: editar US$ de un producto de Agromáquinas → costo y precio cambian en la fila, sin "sugerido".
- [ ] **Step 4:** Commit `feat(costos): editar el precio en USD desde la edición rápida`.

### Task 3: Stock — costo en Pesos / Dólares

**Files:**
- Create: `app/api/tenant/costos/simular-usd/route.ts`
- Modify: `app/api/tenant/productos/route.ts`, `app/dashboard/productos/page.tsx`

**Interfaces:**
- Consumes: `datosListaManual`, `fijarListaUsdProducto`, `simularListaUsd` (Task 1).
- Produces:
  - `POST /api/tenant/costos/simular-usd { proveedorId, costoLista, incluyeIva, bonificaciones, ivaPorcentaje, costoEnvio, costoPackaging, categoria, margenPorcentaje }` → `{ cotizacion, costo, precio }` o `{ error }`.
  - Productos `GET` (paginado) agrega por item `listaUsd: { costoLista, incluyeIva, bonificaciones } | null` (preferido en USD) cuando el módulo está activo.
  - Productos `POST`/`PUT` aceptan `listaUsd: { costoLista, incluyeIva, bonificaciones } | null`: objeto → tras guardar el producto, `fijarListaUsdProducto`; `null` en PUT con preferido en USD → vínculo a `moneda='ARS'`, `costoLista = precioCosto` enviado, `incluyeIva = true`.

- [ ] **Step 1:** endpoint de simulación y cambios de la API de productos (rechazar `listaUsd` si no hay proveedor: 400 "Elegí un proveedor para cargar el costo en dólares."; empleado → 403 con `MSG_COSTO_BLOQUEADO`).
- [ ] **Step 2:** formulario (alta y edición): con módulo activo y proveedor elegido, selector "Costo en: Pesos / Dólares". Dólares: inputs US$, "incluye IVA", "descuento propio (opcional)", y resumen en vivo (debounce 300 ms) "Dólar <proveedor>: $X · Costo $Y · Precio de venta $Z"; los campos de costo y precio en pesos quedan de solo lectura con esos valores.
- [ ] **Step 3:** `npx tsc --noEmit && npm test` → OK; verificación en navegador: alta de producto de TMC con US$ 17,4 → costo $21.582,46 y precio $32.373,69 (con margen 50% y dólar 1608); editar y pasar a Pesos → deja de seguir al dólar; proveedor sin dólar y sin general → mensaje de error.
- [ ] **Step 4:** Commit `feat(stock): cargar el costo de un producto en dólares`.
