# Catálogo de productos — Implementation Plan

> Ejecución: superpowers:executing-plans (Native), como los planes anteriores.

**Goal:** Catálogo único (lo que tengo + lo que venden mis proveedores) con tarjetas; los artículos nuevos de las listas entran como productos "solo de catálogo" que no aparecen en Stock ni en el POS hasta "Agregar a Stock".

**Spec:** `docs/superpowers/specs/2026-11-24-catalogo-de-productos-design.md`

## Global Constraints
- `Producto.soloCatalogo Boolean @default(false)`; índice `(empresaId, soloCatalogo, activo)`; migración `20261124000100_producto_solo_catalogo`.
- Los de catálogo no se venden: la API de ventas devuelve 400 "… es de catálogo: agregalo a Stock para venderlo."
- Los de catálogo se siguen recalculando (dólar, ganancia, descuentos, masivo, listas) y aparecen en el comparador.

## Review Focus
1. Importar sobre un producto de catálogo que ya existe lo actualiza (no lo duplica) y sigue siendo de catálogo.
2. Deshacer una importación que creó productos de catálogo los da de baja.
3. "Agregar a Stock" con cantidad 0 lo pasa a Stock igual; con cantidad inválida o negativa → error.
4. Un producto de catálogo no aparece en el POS ni en la búsqueda de Stock, pero sí en Catálogo.
5. Búsqueda en Catálogo por N° de parte y modelo compatible.

### Task 1: Esquema, estado y importación
- `lib/catalogo.ts` (puro): `estadoCatalogo(p: { soloCatalogo: boolean; stockActual: number }): 'stock' | 'sin-stock' | 'lista'` y `cantidadValida(v: unknown): number | null` (≥ 0, < 1e6). Tests en `tests/catalogo.test.ts`.
- Schema + migración. `aplicarImportacion`: productos nuevos con `soloCatalogo: true` (y reactivados también). `matchearLote`: NUEVO con `seleccionado: true`.

### Task 2: Excluir de Stock, POS y reportes
- `productos` GET (paginado y no paginado), `reportes`, `resumen-dia`, `egresos`, `costos/estado`, `costos/grilla`: `soloCatalogo: false`.
- `ventas` POST: rechazar productos `soloCatalogo`.

### Task 3: API del catálogo
- `GET /api/tenant/catalogo?search=&proveedorId=&categoria=&tengo=1&page=` → `{ total, page, pageSize, items: [{ id, codigo, nombre, imagenUrl, categoria, proveedor, precioVenta, precioCredito, stockActual, soloCatalogo, lista: { costoLista, moneda } | null }], proveedores, categorias }`.
- `POST /api/tenant/catalogo` `{ productoId, cantidad }` → pasa a Stock (`soloCatalogo=false`) y suma la cantidad al stock; devuelve el producto.

### Task 4: Pantalla `/dashboard/catalogo` + menú
- Tarjetas, buscador, filtros, "Solo lo que tengo", paginado; "Agregar a Stock" / "Cargar stock" con modal de cantidad; detalle con `DesgloseProducto` y precios por proveedor (comparador). Menú: "Catálogo" en Catálogo y clientes.

### Task 5: Verificación
- `npm test`, `tsc`, lint de lo tocado; navegador: importar INGCO → 66 en Catálogo ("Solo en lista"), 0 nuevos en Stock/POS; agregar uno a Stock con 3 → aparece en Stock y se puede vender; deshacer importación.
