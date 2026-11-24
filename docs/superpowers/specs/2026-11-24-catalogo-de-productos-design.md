# Catálogo de productos (lo que tengo + lo que venden mis proveedores)

Fecha: 2026-11-24 · Rama: `main`

## Por qué

El cliente (repuestos de maquinaria y jardín) trabaja con ~15 proveedores. En su Excel tenía una
solapa por proveedor y buscaba ahí cuando alguien pedía un repuesto. En la app, al importar una lista
los artículos nuevos solo existen si se tocan "Crear" + "Aplicar", y entonces llenan **Stock** de
productos con stock 0 que nunca se vendieron (y el POS no deja venderlos). Además no hay un lugar
donde "ver la lista" del proveedor.

Quiere **un catálogo**: un solo lugar, con tarjetas, donde aparece lo que tiene en Stock **y** lo que
venden sus proveedores aunque no lo tenga, con precio de venta siempre al día, y desde donde lo pasa a
Stock cuando lo va a vender.

## Qué se construye

1. **Productos "solo de catálogo".** `Producto` suma `soloCatalogo Boolean @default(false)`.
   - Al importar una lista, los artículos **nuevos** se crean como productos con `soloCatalogo = true`,
     stock 0, vinculados al proveedor, con costo y precio calculados como siempre.
   - En la vista previa, los nuevos vienen **tildados** para entrar al catálogo (antes venían sin
     tildar y era fácil no crearlos). "Vincular" e "Ignorar" siguen igual.
   - Los existentes se actualizan como hoy. Deshacer la importación los da de baja como hoy.
2. **Pantalla Catálogo** (`/dashboard/catalogo`, en el menú como "Catálogo").
   - Tarjetas: foto (si tiene), nombre, código, proveedor, precio de venta, precio con crédito y estado:
     **● En stock: N**, **○ Sin stock** (en Stock con 0) o **◇ Solo en lista** (`soloCatalogo`).
   - Buscador por código, nombre, N° de parte (OEM) y modelos compatibles; filtros por proveedor y
     categoría; interruptor **"Solo lo que tengo"**. Paginado (las listas pueden traer miles).
   - **"Agregar a Stock"** en los de lista: pide la **cantidad** (puede ser 0) y pasa el producto a
     Stock (`soloCatalogo = false`, stock = cantidad). **"Cargar stock"** en los sin stock: suma la
     cantidad (ingreso por compra).
   - Al tocar una tarjeta: detalle con "Cómo se calcula" (el desglose que ya existe) y, si lo venden
     varios proveedores, el precio de cada uno (los datos del comparador).
3. **Dónde aparecen los de catálogo**
   - **No aparecen** en Stock, Punto de venta, Repuestos, productos destacados, egresos, reportes,
     resumen del día (stock bajo), estado de costos ni edición rápida de costos. La API de ventas
     rechaza vender un producto `soloCatalogo`.
   - **Sí** se recalculan con el dólar, la ganancia, los descuentos, el aumento masivo y las listas
     (así el precio del catálogo siempre está al día) y aparecen en el comparador.
   - Presupuestos de servicio técnico: pueden incluirlos, marcados "a pedir al proveedor" (no descuentan stock).

## Fuera de alcance

- Reorganizar el menú en 8 entradas (se propuso; va aparte). Acá solo se suma "Catálogo".
- Fotos automáticas desde el PDF del proveedor.
- Cargar cantidades de stock desde la vista previa de la importación (pendiente aparte).

## Anti-objetivos

- Que un producto de catálogo se pueda vender por error en el POS.
- Que Stock vuelva a llenarse de productos que no se tienen.
- Precios del catálogo desactualizados respecto del dólar/ganancia.

## Enfoques considerados

| Enfoque | Resultado |
|---|---|
| **Productos marcados "solo de catálogo" (elegido)** | Reusa el cálculo de precios, dólar, ganancia, comparador y cruce por OEM; precios siempre al día |
| Tabla aparte para el catálogo | Separación total, pero hay que duplicar el cálculo de precios y se desfasa |

## Migración

Columna nueva `soloCatalogo` con default `false`: los productos existentes siguen en Stock como hoy.
Índice `(empresaId, soloCatalogo, activo)` para filtrar rápido.
