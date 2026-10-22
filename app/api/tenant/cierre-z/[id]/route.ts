import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = getTenantId(req);
    const { id } = await params;

    const cierre = await prisma.cierreCaja.findFirst({
      where: {
        id,
        empresaId,
      },
      include: {
        empresa: {
          include: {
            configAfip: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });

    if (!cierre) {
      return NextResponse.json({ error: 'Comprobante de cierre no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      id: cierre.id,
      tipo: cierre.tipo,
      fecha: cierre.fecha,
      emitidoAt: cierre.emitidoAt,
      cerradoAt: cierre.tipo === 'Z' ? cierre.emitidoAt : null,
      concepto: cierre.concepto,
      montoInicial: Number(cierre.montoInicial),
      facturadoTotal: Number(cierre.facturadoTotal),
      efectivoNeto: Number(cierre.efectivoNeto),
      totalCaja: Number(cierre.totalCaja),
      cantidadComprobantes: cierre.cantidadComprobantes,
      detalle: cierre.detalle,
      empresa: cierre.empresa,
      usuario: cierre.usuario,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
