import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

// Monto fijo del pago de prueba.
const TEST_AMOUNT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pago simulado para pruebas: activa la suscripción del comercio autenticado
 * por 30 días sin pasar por Mercado Pago. Pensado para testear el flujo de
 * activación mientras no hay una forma real de cobrar.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session || !session.empresaId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const empresaId = session.empresaId;
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
    }

    const existingSub = await prisma.suscripcion.findUnique({ where: { empresaId } });

    let planId = existingSub?.planId || '';
    if (!planId) {
      const plan =
        (await prisma.plan.findFirst({ where: { nombre: 'Mensual' } })) ||
        (await prisma.plan.findFirst({ where: { nombre: 'Básico' } })) ||
        (await prisma.plan.findFirst({ where: { precioMensual: { gt: 0 } } }));
      planId = plan?.id || '';
    }

    if (!planId) {
      return NextResponse.json({ error: 'No hay planes configurados.' }, { status: 400 });
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * DAY_MS);
    const preapprovalId = `test-pago-${Math.floor(100000 + Math.random() * 900000)}`;

    await prisma.suscripcion.upsert({
      where: { empresaId },
      update: { planId, mpPreapprovalId: preapprovalId, estado: 'authorized', fechaVencimiento: expiry },
      create: { empresaId, planId, mpPreapprovalId: preapprovalId, estado: 'authorized', fechaVencimiento: expiry },
    });

    await prisma.empresa.update({ where: { id: empresaId }, data: { estado: 'ACTIVO' } });

    await prisma.pago.create({
      data: {
        empresaId,
        monto: TEST_AMOUNT,
        medioPago: 'Mercado Pago',
        concepto: `Pago de prueba (simulado) · ${preapprovalId}`,
      },
    });

    return NextResponse.json({ success: true, preapprovalId });
  } catch (error: any) {
    console.error('Test payment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
