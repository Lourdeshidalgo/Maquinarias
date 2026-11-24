import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';
import { filtroBusquedaProducto } from '@/lib/productos-busqueda';
import { obtenerConfigCostos } from '@/lib/costos-db';
import { precioCredito } from '@/lib/costos';
import { cantidadValida } from '@/lib/catalogo';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);
const TAMANO_PAGINA = 24;
const TAMANO_PAGINA_TABLA = 100;

// GET /api/tenant/catalogo?search=&proveedorId=&categoria=&tengo=1&page=&vista=tabla
// vista=tabla: como el Excel del proveedor (por categoría y código, 100 por página).
// Catálogo: lo que hay en Stock + lo que venden los proveedores (productos "solo de catálogo").
export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const q = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
    const tabla = q.get('vista') === 'tabla';
    const tamano = tabla ? TAMANO_PAGINA_TABLA : TAMANO_PAGINA;
    const search = (q.get('search') || '').trim();
    const where: Prisma.ProductoWhereInput = { empresaId, activo: true };
    if (q.get('tengo') === '1') {
      where.soloCatalogo = false;
      where.stockActual = { gt: 0 };
    }
    const proveedorId = q.get('proveedorId');
    if (proveedorId) where.OR = [{ proveedorId }, { proveedorProductos: { some: { proveedorId, activo: true } } }];
    const categoria = q.get('categoria');
    if (categoria) where.categoria = categoria;
    if (search) where.AND = filtroBusquedaProducto(search);

    const [total, productos, config, proveedores, categorias] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        select: {
          id: true, codigo: true, nombre: true, categoria: true, imagenUrl: true, precioVenta: true, stockActual: true,
          soloCatalogo: true, marca: true, codigoFabricante: true,
          proveedor: { select: { id: true, nombre: true } },
          // El vínculo del proveedor filtrado (o el preferido): su lista y los precios que trae (contado / tarjeta).
          proveedorProductos: {
            where: proveedorId ? { activo: true, proveedorId } : { activo: true, preferido: true }, take: 1,
            select: {
              costoLista: true, moneda: true, precioContadoLista: true, precioTarjetaLista: true,
              proveedor: { select: { nombre: true } },
            },
          },
          _count: { select: { proveedorProductos: { where: { activo: true } } } },
        },
        // Tarjetas: primero lo que se tiene, después lo de las listas, por nombre.
        // Tabla: como la lista del proveedor, por categoría y código.
        orderBy: tabla ? [{ categoria: 'asc' }, { codigo: 'asc' }] : [{ soloCatalogo: 'asc' }, { nombre: 'asc' }],
        skip: (page - 1) * tamano,
        take: tamano,
      }),
      obtenerConfigCostos(empresaId),
      prisma.proveedor.findMany({ where: { empresaId, activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      prisma.producto.groupBy({ by: ['categoria'], where: { empresaId, activo: true }, orderBy: { categoria: 'asc' } }),
    ]);

    return NextResponse.json({
      total, page, pageSize: tamano,
      items: productos.map((p) => {
        const v = p.proveedorProductos[0];
        const precio = n(p.precioVenta);
        return {
          id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, imagenUrl: p.imagenUrl,
          marca: p.marca, codigoFabricante: p.codigoFabricante,
          proveedor: v?.proveedor.nombre ?? p.proveedor?.nombre ?? null,
          cantidadProveedores: p._count.proveedorProductos,
          precioVenta: precio,
          precioCredito: precioCredito(precio, n(config.recargoCredito), config.redondeo),
          stockActual: n(p.stockActual),
          soloCatalogo: p.soloCatalogo,
          lista: v
            ? {
                costoLista: n(v.costoLista), moneda: v.moneda,
                precioContado: v.precioContadoLista ? n(v.precioContadoLista) : null,
                precioTarjeta: v.precioTarjetaLista ? n(v.precioTarjetaLista) : null,
              }
            : null,
        };
      }),
      proveedores,
      categorias: categorias.map((c) => c.categoria),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// POST /api/tenant/catalogo { productoId, cantidad }
// "Agregar a Stock" (si es solo de catálogo) o "Cargar stock": pasa el producto a Stock y le
// suma la cantidad (puede ser 0). Lo puede hacer quien carga stock (dueño o empleado).
export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { productoId, cantidad } = await req.json();
    const qty = cantidadValida(cantidad);
    if (qty === null) return NextResponse.json({ error: 'Ingresá una cantidad de 0 o más.' }, { status: 400 });
    const prod = await prisma.producto.findFirst({ where: { id: String(productoId || ''), empresaId, activo: true }, select: { id: true } });
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
    const actualizado = await prisma.producto.update({
      where: { id: prod.id },
      data: { soloCatalogo: false, stockActual: { increment: qty } },
      select: { id: true, nombre: true, stockActual: true, soloCatalogo: true },
    });
    return NextResponse.json({ ...actualizado, stockActual: n(actualizado.stockActual) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
