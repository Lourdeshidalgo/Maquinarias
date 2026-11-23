# Importar listas de proveedores en PDF — lector gratis en el navegador

Fecha: 2026-11-23 · Rama: `feature/listas-proveedores` · Reemplaza la lectura con Claude de
`2026-11-23-lista-pdf-con-claude-design.md` (el usuario no quiere pagar la API). El cruce por N° de
parte (OEM) de ese diseño se mantiene tal cual.

## Por qué

El cliente tiene que poder subir la lista de un proveedor en PDF (ej. Morano, catálogo de 78 páginas
con tarjetas `#AD10001` / descripción / `$ 6.196,07`) y que se cargue, sin costo por lista.
Prueba hecha: sacando el texto del PDF y siguiendo el patrón código → descripción → precio salen
411 de 416 productos de Morano con precio (los 5 restantes son exhibidores/kits sin precio unitario).

## Qué se construye

Un lector de PDF **en el navegador** con `pdfjs-dist` (gratis, nada sale de la app), con dos modos:

1. **Catálogo** — recorre el texto en el orden del PDF: un código abre un producto, los textos que
   siguen son la descripción y el primer precio cierra el producto. Ignora los textos que se repiten
   en todo el documento ("PRECIO OFERTA", "NETO+IVA", "Cantidad:", pies de página).
2. **Tabla** — arma filas (textos a la misma altura) y columnas (por posición horizontal) y las pasa
   al paso actual **"¿Qué es cada columna?"**, igual que un Excel. La configuración se guarda como
   plantilla del proveedor, como hoy.

La app elige el modo sola (catálogo si encuentra al menos 10 productos con código y precio; si no,
tabla) y el usuario puede cambiarlo con un botón. En los dos casos sigue el flujo existente: crear
importación → filas → vista previa → aplicar / deshacer.

## Fuera de alcance / límites

- PDF escaneados (imágenes sin texto): se avisa "Este PDF no tiene texto (parece escaneado). Pedile
  al proveedor la lista en Excel o en PDF digital." No hay OCR.
- Productos sin precio unitario (kits, exhibidores): quedan como "sin precio" en la vista previa.

## Anti-objetivos

- Que algo se aplique sin pasar por la vista previa.
- Que se cobre algo o que la lista salga a un servicio externo.

## Enfoques considerados

| Enfoque | Resultado |
|---|---|
| Lectura con Claude | Lee cualquier formato, pero cuesta ~US$1–2 por lista: el usuario no lo quiere. Se saca. |
| **Lector de texto en el navegador, catálogo + tabla (elegido)** | Gratis; Morano 411/416; tablas por el mapeo de columnas existente. No lee escaneados. |
| Solo tabla | No sirve para Morano (catálogo con tarjetas). |

## Decisiones

- `pdfjs-dist@6.4.299`, import dinámico en el cliente; worker con
  `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
- Lógica pura y testeable en `lib/listas/pdf-texto.ts` (entrada: textos con posición por página).
- Código de catálogo: si el documento tiene ≥ 5 textos `#XXXX`, solo esos cuentan como código (se
  guarda sin `#`); si no, un texto de una sola palabra con letras/números y al menos un dígito.
- Precio: `$`, `U$S`, `US$` o `USD` seguido de número en formato argentino; `U$S/US$/USD` → USD,
  `$` → moneda por defecto elegida en pantalla (pesos por defecto).
- Descripción: hasta 3 textos entre el código y el precio, unidos con espacio.
- Fila = página × 1000 + orden en la página (para ubicar el renglón en el PDF).
- El servidor: `mapeo.modoPdf = 'catalogo'` saltea la validación de columnas y no pisa la plantilla;
  en modo tabla se valida y guarda la plantilla como con Excel.
- Se sacan la ruta `/api/tenant/listas/pdf/leer`, `lib/listas/pdf.ts`, `lib/listas/pdf-renglones.ts`,
  `@anthropic-ai/sdk` y `pdf-lib`.
