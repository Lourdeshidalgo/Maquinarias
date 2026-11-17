# Dólar y fórmula de precio por proveedor — diseño corto

Rama: `feature/listas-proveedores` · Fecha: 2026-11-17

## Por qué

El cliente (repuestos de maquinaria y jardín) trabaja con ~15 proveedores. La mayoría
lista en dólares y **cada uno toma una cotización distinta** (en su Excel van de
$1450 a $1608, cargadas a mano en una hoja "DOLARES"). Además cada proveedor tiene
su propio descuento. Hoy el sistema tiene un solo dólar para toda la empresa, así que
no puede reproducir sus precios.

## Qué dice el Excel (Repuestos.xlsx)

Todas las fórmulas tienen la misma forma:

    EFECTIVO = precio lista × descuentos × 1,21 (IVA) × 1,5 (margen) × dólar del proveedor
    CREDITO  = EFECTIVO × 1,1

| Proveedor | Moneda | Descuentos (factor) | Equivale a bonificación |
|---|---|---|---|
| ALLTRADE | USD | ×0,75 | 25 |
| CARRANZA | USD | — (web: ×0,5) | — (web: 50) |
| DIBRA | ARS | ×0,7 | 30 |
| DILA | ARS | ×0,6 | 40 |
| FIASA | USD | ×0,8 | 20 |
| LOGBELTS | USD | ×0,9 | 10 |
| MUNDITOL | USD | ×0,8 | 20 |
| RUMBO | USD | ×0,95 | 5 |
| SAGUES | USD | ×0,9 | 10 |
| TALLER SUR | ARS | ×0,75 | 25 |
| TMC | USD | ×0,75 ×0,85 | 25+15 |
| SHIMAHA | USD | ×0,85 | 15 |
| VILLA | USD | ×0,8 ×0,9 ×0,9 | 20+10+10 |
| FRAVIDA | USD | — | — |

## Enfoques considerados

1. **Ajustes por proveedor con fórmula fija (elegido).** Cada proveedor guarda su
   dólar y su descuento base; la fórmula es la del sistema
   (`lista × bonificaciones × IVA × dólar × (1 + margen)`). Reusa lo que ya existe en
   la rama (bonificaciones en cascada, margen por proveedor, bandeja de precios
   sugeridos). Todas las fórmulas del Excel entran.
2. Fórmula libre escrita por el usuario. Descartado: un error de tipeo cambia precios
   en silencio y duplica lo que ya resuelven bonificaciones y márgenes.
3. Lista de pasos por proveedor. Descartado: más trabajo que el 1 sin ningún caso del
   Excel que lo necesite.

## Diseño

- **Dólar por proveedor.** `Cotizacion` suma `proveedorId` opcional. `null` = dólar
  general de la empresa (lo de hoy). El dólar vigente de un proveedor es su última
  cotización; si nunca se le cargó una, usa el general. Se guarda historial igual que hoy.
- **Cargar el dólar.** La pantalla `/dashboard/costos/dolar` pasa a mostrar una tabla:
  dólar general + una fila por proveedor activo, con su valor vigente, fecha de
  actualización y un campo para cargar el nuevo valor. Al guardar el dólar de un
  proveedor se recalculan **solo** los productos cuyo proveedor preferido es ese y
  cotiza en USD, respetando el modo de precio actual (automático o bandeja de aprobación).
- **Descuento base por proveedor.** `Proveedor` suma `bonificacionesBase` (texto,
  formato "25+15", igual que hoy). Al calcular el costo: si el producto tiene sus
  propias bonificaciones en `ProveedorProducto`, se usan esas; si no, las del
  proveedor. Esto cubre la excepción de CARRANZA (los productos de la web se cargan
  con bonificación propia "50").
- **IVA y margen.** Se reusan: lista sin IVA (`incluyeIva = false`), costo con IVA
  (`ivaEnCosto = true`) y la regla de margen por proveedor existente (50%).
- **Precio crédito.** `ConfiguracionCostos` suma `recargoCredito` (%, por defecto 10).
  El precio crédito no se guarda: se calcula `precio venta × (1 + recargoCredito)` y
  se muestra junto al precio de venta en la grilla de costos y en el listado de productos.
- **Importación de listas.** Al importar la lista de un proveedor, la cotización usada
  es la de ese proveedor.

## Fuera de alcance (por ahora)

- Aplicar el recargo de crédito automáticamente en el POS al cobrar con tarjeta.
- Traer el dólar desde una API.
- Cargar los proveedores del Excel (se puede hacer después con un script de seed).

## Queda a criterio del implementador

- Migración: nombre y orden; los registros de `Cotizacion` existentes quedan como generales.
- Detalle visual de la tabla de dólares (mantener el estilo de las pantallas de costos).
