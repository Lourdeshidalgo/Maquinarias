import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import { cargarCotizaciones, obtenerConfigCostos } from '@/lib/costos-db';
import { bonificacionesEfectivas, costoReal, costoVigenteDesdeLista, cotizacionPara, diasDesde, semaforoCosto } from '@/lib/costos';
import { cambiarProveedorPreferido } from '@/lib/costos-cambios';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

// GET /api/tenant/costos/comparador?search= → productos con más de un proveedor y el costo real de cada uno
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const search = (req.nextUrl.searchParams.get('search') || '').trim();
    const grupos = await prisma.proveedorProducto.groupBy({
      by: ['productoId'],
      where: { empresaId, activo: true, producto: { activo: true } },
      having: { productoId: { _count: { gt: 1 } } },
    });
    const ids = grupos.map((g) => g.productoId);
    if (!ids.length) return NextResponse.json({ items: [] });

    const [config, cotizaciones, productos] = await Promise.all([
      obtenerConfigCostos(empresaId),
      cargarCotizaciones(empresaId),
      prisma.producto.findMany({
        where: {
          empresaId, id: { in: ids },
          ...(search ? { OR: [{ nombre: { contains: search, mode: 'insensitive' } }, { codigo: { contains: search, mode: 'insensitive' } }] } : {}),
        },
        include: {
          proveedorProductos: { where: { activo: true }, include: { proveedor: { select: { id: true, nombre: true, bonificacionesBase: true } } } },
        },
        orderBy: { nombre: 'asc' },
        take: 300,
      }),
    ]);
    const umbrales = { umbralAmarillo: config.umbralAmarillo, umbralRojo: config.umbralRojo };

    const items = productos.map((p) => {
      const opciones = p.proveedorProductos.map((v) => {
        const vigente = costoVigenteDesdeLista({
          costoLista: n(v.costoLista), moneda: v.moneda, bonificaciones: v.bonificaciones,
          bonificacionesBase: v.proveedor.bonificacionesBase, incluyeIva: v.incluyeIva,
          ivaPorcentaje: n(p.ivaPorcentaje), ivaEnCosto: config.ivaEnCosto, cotizacion: cotizacionPara(cotizaciones, v.proveedorId),
        });
        return {
          proveedorId: v.proveedor.id,
          proveedor: v.proveedor.nombre,
          codigoProveedor: v.codigoProveedor,
          costoLista: n(v.costoLista),
          moneda: v.moneda,
          bonificaciones: bonificacionesEfectivas(v.bonificaciones, v.proveedor.bonificacionesBase),
          costoReal: vigente === null ? null : costoReal({ precioCosto: vigente, costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging) }),
          actualizado: v.costoActualizadoAt,
          dias: diasDesde(v.costoActualizadoAt),
          semaforo: semaforoCosto(v.costoActualizadoAt, umbrales),
          preferido: v.preferido,
        };
      });
      const conCosto = opciones.filter((o) => o.costoReal !== null);
      const mejor = conCosto.length ? conCosto.reduce((a, b) => (b.costoReal! < a.costoReal! ? b : a)) : null;
      const preferido = opciones.find((o) => o.preferido);
      return {
        id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, precioVenta: n(p.precioVenta),
        opciones: opciones.sort((a, b) => (a.costoReal ?? Infinity) - (b.costoReal ?? Infinity)),
        mejorProveedorId: mejor?.proveedorId ?? null,
        ahorro: mejor && preferido?.costoReal != null && mejor.proveedorId !== preferido.proveedorId ? preferido.costoReal - mejor.costoReal! : 0,
      };
    });
    return NextResponse.json({ items });
  });
}

// POST /api/tenant/costos/comparador { productoId, proveedorId } → cambia el proveedor preferido
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { productoId, proveedorId } = await req.json();
    if (!productoId || !proveedorId) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });
    try {
      return NextResponse.json(await cambiarProveedorPreferido(empresaId, productoId, proveedorId, getUserId(req)));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  });
}
