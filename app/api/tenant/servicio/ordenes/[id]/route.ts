import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaServicio } from '@/lib/servicio/api';
import { actualizarOrden } from '@/lib/servicio/ordenes';
import { totalesServicio } from '@/lib/servicio/estados';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

// GET /api/tenant/servicio/ordenes/:id → orden completa, con stock disponible de cada repuesto
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaServicio(req, async (empresaId) => {
    const { id } = await params;
    const [orden, empresa] = await Promise.all([
      prisma.ordenServicio.findFirst({
        where: { id, empresaId },
        include: {
          items: { orderBy: { posicion: 'asc' }, include: { producto: { select: { codigo: true, stockActual: true, precioVenta: true, activo: true } }, proveedor: { select: { nombre: true } } } },
          eventos: { orderBy: { createdAt: 'desc' }, include: { usuario: { select: { nombre: true } } } },
          cliente: { select: { id: true, razonSocial: true, tipoDoc: true, nroDoc: true, telefono: true } },
          venta: { select: { id: true, tipoComprobante: true, puntoVenta: true, numeroComprobante: true, total: true, fecha: true } },
        },
      }),
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, cuit: true } }),
    ]);
    if (!orden) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    const items = orden.items.map((i) => ({
      id: i.id, tipo: i.tipo, productoId: i.productoId, proveedorId: i.proveedorId, proveedor: i.proveedor?.nombre ?? null, descripcion: i.descripcion, cantidad: n(i.cantidad),
      precioUnitario: n(i.precioUnitario), ivaPorcentaje: n(i.ivaPorcentaje),
      codigo: i.producto?.codigo ?? null,
      // Stock disponible para este repuesto (si ya está descontado por esta orden, se suma lo apartado)
      stockDisponible: i.producto ? n(i.producto.stockActual) + (orden.stockDescontado ? n(i.cantidad) : 0) : null,
      precioCatalogo: i.producto ? n(i.producto.precioVenta) : null,
    }));

    return NextResponse.json({
      empresa,
      orden: {
        ...orden,
        items,
        venta: orden.venta ? { ...orden.venta, total: n(orden.venta.total) } : null,
        eventos: orden.eventos.map((e) => ({ id: e.id, estadoAnterior: e.estadoAnterior, estadoNuevo: e.estadoNuevo, detalle: e.detalle, usuario: e.usuario?.nombre ?? null, createdAt: e.createdAt })),
        totales: totalesServicio(items),
      },
    });
  });
}

// PATCH /api/tenant/servicio/ordenes/:id → datos del equipo/cliente y presupuesto (ítems)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaServicio(req, async (empresaId) => {
    const { id } = await params;
    return NextResponse.json(await actualizarOrden(empresaId, id, getUserId(req), await req.json()));
  });
}
