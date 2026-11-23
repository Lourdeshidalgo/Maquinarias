# Listas en PDF con lector gratis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente suba la lista de un proveedor en PDF y se cargue sin costo, leyendo el texto del PDF en el navegador (modo catálogo o tabla).

**Architecture:** `pdfjs-dist` saca los textos con posición en el navegador; `lib/listas/pdf-texto.ts` (puro) los convierte en `FilaLista[]` (catálogo) o en filas/columnas crudas (tabla) que entran al mapeo de columnas existente. Reemplaza la lectura con Claude del plan `2026-11-23-lista-pdf-con-claude.md` (Tasks 4–6); el cruce por OEM (Tasks 1–3) queda.

**Tech Stack:** Next.js 16, React 19, `pdfjs-dist@6.4.299`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-lista-pdf-gratis-design.md`

## Global Constraints

- Nada sale del navegador salvo las filas ya leídas (mismo flujo `/importaciones` → `/filas` → `/finalizar`).
- Catálogo si hay ≥ 10 productos con código y precio; si no, tabla. Botón para cambiar.
- Códigos `#XXXX` cuentan solo si hay ≥ 5 en el documento; se guardan sin `#`.
- `U$S`/`US$`/`USD` → USD; `$` → moneda por defecto de pantalla.
- Fila = página × 1000 + orden en la página.
- PDF sin texto → "Este PDF no tiene texto (parece escaneado). Pedile al proveedor la lista en Excel o en PDF digital."

## Review Focus

1. Textos que se repiten en todas las tarjetas ("PRECIO OFERTA", "Cantidad:") no deben entrar en la descripción. Test en Task 1.
2. Producto sin precio antes del siguiente código queda con `precio: null`, no toma el precio del siguiente. Test en Task 1.
3. PDF escaneado (sin texto) → mensaje claro, no una tabla vacía. Task 2 (verificación manual con un PDF de solo imagen).
4. Tabla con celdas que no empiezan exactamente en la misma x → misma columna (tolerancia). Test en Task 1.
5. Cambiar de modo después de leer no vuelve a abrir el PDF ni pierde la moneda elegida. Task 2.

---

### Task 1: `lib/listas/pdf-texto.ts`

**Files:** Create `lib/listas/pdf-texto.ts`; Test `tests/listas-pdf-texto.test.ts`.

**Interfaces (Produces):**
```ts
export type TextoPdf = { str: string; x: number; y: number }; // y crece hacia arriba (coordenadas PDF)
export type PaginaPdf = TextoPdf[];                          // en el orden en que los da pdf.js
export function leerCatalogo(paginas: PaginaPdf[], monedaDefault: 'ARS' | 'USD'): FilaLista[];
export function tablaDesdePdf(paginas: PaginaPdf[]): string[][]; // filas × columnas, '' en celdas vacías
export function elegirModo(paginas: PaginaPdf[]): 'catalogo' | 'tabla';
export function tieneTexto(paginas: PaginaPdf[]): boolean;
```

- [ ] Tests (RED): catálogo con tarjetas tipo Morano (dos páginas, ruido repetido ≥ 5 veces, un producto sin precio, uno en U$S) → códigos sin `#`, descripciones sin ruido, precios, monedas y filas `3001, 3002, 4001`; `tablaDesdePdf` con tres filas cuyas celdas están corridas ±3 pt → columnas alineadas y `adivinarMapeo` detecta código/descripción/precio; `elegirModo` catálogo vs tabla; `tieneTexto` false para páginas vacías o solo espacios.
- [ ] Implementar (GREEN). Tabla: filas agrupando por `y` con tolerancia 3 pt (de arriba a abajo), columnas agrupando los `x` de inicio de todas las celdas con tolerancia 12 pt; cada texto va a la columna de inicio más cercana ≤ su x.
- [ ] `npm test` verde, commit `feat(listas): lector de texto de PDF (catálogo y tabla)`.

### Task 2: Pantalla

**Files:** Rewrite `app/dashboard/costos/importar/LecturaPdf.tsx` (abre con pdfjs, saca textos por página con progreso, devuelve `PaginaPdf[]`); Modify `Carga.tsx`; Modify `app/api/tenant/listas/importaciones/route.ts` (`mapeo.modoPdf === 'catalogo'` saltea validación y plantilla); `MapeoLista` suma `modoPdf?: 'catalogo' | 'tabla'`.

- [ ] Catálogo: tarjeta "Lectura del PDF" con ajustes, muestra (10), totales (productos, con N° de parte, sin precio) y "Ver cambios". Tabla: `setLibro({ PDF: tablaDesdePdf(...) })` + `adivinarMapeo` / plantilla guardada → paso `mapeo` existente. Botón "Leer como tabla" / "Leer como catálogo".
- [ ] Verificar en el navegador con el PDF de Morano (≈411 con precio → vista previa → aplicar → deshacer) y con un PDF de tabla generado de prueba; PDF sin texto → mensaje. Commit `feat(listas): importar listas en PDF leyendo el texto en el navegador`.

### Task 3: Sacar la lectura con Claude

- [ ] Borrar `app/api/tenant/listas/pdf/`, `lib/listas/pdf.ts`, `lib/listas/pdf-renglones.ts`, `tests/listas-pdf.test.ts`; `npm uninstall @anthropic-ai/sdk pdf-lib`; `npx tsc --noEmit`, `npm test`, lint de los archivos tocados. Commit `chore(listas): sacar la lectura de PDF con Claude`.
