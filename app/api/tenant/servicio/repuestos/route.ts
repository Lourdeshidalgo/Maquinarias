import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaServicio } from '@/lib/servicio/api';
import { tieneModuloCostos } from '@/lib/modulos';
import { cargarCotizaciones, cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
import { filtroBusquedaProducto } from '@/lib/productos-busqueda';
import { opcionesRepuesto, type ContextoPrecios } from '@/lib/servicio/opciones-repuesto';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

// GET /api/tenant/servicio/repuestos?search= → productos del stock y repuestos para
// el presupuesto, con una opción por proveedor (y su precio) cuando hay varios.
// Solo muestra precios de venta, nunca costos: lo pueden usar los empleados.
export async function GET(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => {
    const search = (req.nextUrl.searchParams.get('search') || '').trim();
    if (!search) return NextResponse.json({ items: [] });

    const conCostos = await tieneModuloCostos(empresaId);
    const [productos, ctx] = await Promise.all([
      prisma.producto.findMany({
        where: { empresaId, activo: true, AND: filtroBusquedaProducto(search) },
        select: {
          id: true, codigo: true, nombre: true, categoria: true, stockActual: true, precioVenta: true, ivaPorcentaje: true,
          margenPorcentaje: true, costoEnvio: true, costoPackaging: true,
          esRepuesto: true, codigoFabricante: true, marca: true, compatibles: true, ubicacion: true,
          proveedor: { select: { id: true, nombre: true } },
          // Sin módulo de costos no se abre por proveedor (take: 0 → lista vacía)
          proveedorProductos: {
            where: { activo: true },
            take: conCostos ? undefined : 0,
            select: {
              proveedorId: true, costoLista: true, moneda: true, bonificaciones: true, incluyeIva: true, preferido: true,
              proveedor: { select: { nombre: true, bonificacionesBase: true, activo: true } },
            },
          },
        },
        orderBy: { nombre: 'asc' },
        take: 10,
      }),
      conCostos ? contextoPrecios(empresaId) : Promise.resolve(null),
    ]);

    const items = productos.map(({ proveedorProductos, proveedor, precioVenta, ivaPorcentaje, margenPorcentaje, costoEnvio, costoPackaging, stockActual, ...p }) => {
      const vinculos = proveedorProductos
        .filter((v) => v.proveedor.activo)
        .map((v) => ({
          proveedorId: v.proveedorId, proveedor: v.proveedor.nombre, bonificacionesBase: v.proveedor.bonificacionesBase,
          costoLista: n(v.costoLista), moneda: v.moneda, bonificaciones: v.bonificaciones, incluyeIva: v.incluyeIva, preferido: v.preferido,
        }));
      let opciones = opcionesRepuesto(
        {
          precioVenta: n(precioVenta), ivaPorcentaje: n(ivaPorcentaje), margenPorcentaje: margenPorcentaje ? n(margenPorcentaje) : null,
          costoEnvio: n(costoEnvio), costoPackaging: n(costoPackaging), categoria: p.categoria,
        },
        vinculos,
        ctx
      );
      // Sin módulo de costos: si el producto tiene un proveedor asignado en Stock, se muestra igual.
      if (opciones.length === 1 && !opciones[0].proveedorId && proveedor) {
        opciones = [{ ...opciones[0], proveedorId: proveedor.id, proveedor: proveedor.nombre }];
      }
      return { ...p, precioVenta: n(precioVenta), stockActual: n(stockActual), opciones };
    });
    return NextResponse.json({ items });
  });
}

async function contextoPrecios(empresaId: string): Promise<ContextoPrecios> {
  const [config, reglas, cotizaciones] = await Promise.all([
    obtenerConfigCostos(empresaId),
    cargarReglasMargen(empresaId),
    cargarCotizaciones(empresaId),
  ]);
  return { ivaEnCosto: config.ivaEnCosto, redondeo: config.redondeo, reglas, cotizaciones };
}
