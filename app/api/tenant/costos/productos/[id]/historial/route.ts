import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';

const ORIGEN: Record<string, string> = {
  IMPORTACION: 'Lista de precios', MANUAL: 'Ajuste manual', MASIVO: 'Aumento masivo', COTIZACION: 'Cotización del dólar', DESHACER: 'Importación deshecha',
};

// GET /api/tenant/costos/productos/:id/historial → cambios de costo del producto
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { id } = await params;
    const producto = await prisma.producto.findFirst({
      where: { id, empresaId },
      select: { id: true, codigo: true, nombre: true, precioCosto: true, precioVenta: true, costoActualizadoAt: true },
    });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });

    const historial = await prisma.historialCosto.findMany({
      where: { empresaId, productoId: id },
      include: {
        usuario: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        importacion: { select: { archivoNombre: true, fechaVigencia: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({
      producto: {
        ...producto,
        precioCosto: producto.precioCosto.toNumber(),
        precioVenta: producto.precioVenta.toNumber(),
      },
      historial: historial.map((h) => ({
        id: h.id,
        fecha: h.createdAt,
        origen: h.origen,
        origenTexto: ORIGEN[h.origen] ?? h.origen,
        afectaVigente: h.afectaVigente,
        proveedor: h.proveedor?.nombre ?? null,
        costoAnterior: h.costoAnterior.toNumber(),
        costoNuevo: h.costoNuevo.toNumber(),
        costoListaAnterior: h.costoListaAnterior?.toNumber() ?? null,
        costoListaNuevo: h.costoListaNuevo?.toNumber() ?? null,
        moneda: h.moneda,
        precioVentaAnterior: h.precioVentaAnterior?.toNumber() ?? null,
        precioVentaNuevo: h.precioVentaNuevo?.toNumber() ?? null,
        usuario: h.usuario?.nombre ?? null,
        detalle: h.detalle ?? (h.importacion ? h.importacion.archivoNombre : null),
      })),
    });
  });
}
