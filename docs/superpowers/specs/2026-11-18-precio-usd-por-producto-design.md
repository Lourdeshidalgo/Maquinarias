# Precio en USD por producto y actualización directa por dólar — diseño corto

Rama: `feature/listas-proveedores` · Fecha: 2026-11-18 · Sigue a `2026-11-17-dolar-y-formula-por-proveedor-design.md`

## Por qué

Los proveedores del cliente cobran en USD, cada uno con su dólar. El cliente necesita
cargar y corregir **a mano** el precio en USD de cada producto, y que al cambiar el
dólar de un proveedor **se actualicen solos** el costo y el precio de venta de todos
sus productos. Hoy el precio en USD solo entra por importación de listas, Stock y la
edición rápida editan el costo en pesos, y con modo "aprobación" los precios nuevos
quedan en la bandeja.

## Enfoques

1. **Reusar `ProveedorProducto` (elegido).** El precio USD de un producto es el
   `costoLista` (moneda `USD`) de su vínculo con el proveedor preferido, el mismo que
   llena la importación. Se agrega edición manual sobre ese dato.
2. Campo "precio USD" nuevo en `Producto`. Descartado: dos fuentes de verdad que se
   contradicen con la importación.

## Diseño

1. **Stock (alta/edición de producto), con módulo de costos y proveedor asignado:**
   selector "Costo en: Pesos / Dólares". Con Dólares: precio de lista USD, casilla
   "incluye IVA" (por defecto sin IVA) y descuento propio opcional. Vista en vivo del
   costo en pesos (dólar de ese proveedor) y del precio de venta resultante. Se guarda
   en el `ProveedorProducto` preferido (`moneda = 'USD'`, `costoLista`,
   `incluyeIva`, `bonificaciones`); `Producto.precioCosto` y `precioVenta` se
   recalculan con la fórmula de siempre.
2. **Edición rápida de costos:** para productos cuyo vínculo preferido está en USD, la
   celda edita el precio de lista USD (muestra "US$").
3. **Cambio manual del precio USD de un producto:** costo y precio de venta se
   actualizan en el momento (sin bandeja), con historial.
4. **Cambio del dólar de un proveedor (o del general):** vista previa → confirmar →
   costo y precio de venta se aplican directo, sin bandeja, sin importar
   `modoPrecio`.
5. **Cambio del descuento base de un proveedor:** igual que el punto 4, directo.
6. La importación de listas y el aumento masivo siguen respetando `modoPrecio`.

## Fuera de alcance

- Editar desde Stock varios proveedores en USD de un mismo producto (se edita el
  preferido; el comparador sigue igual).
