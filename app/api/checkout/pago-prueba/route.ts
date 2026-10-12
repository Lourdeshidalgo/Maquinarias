import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { createCheckoutPreference } from '@/lib/mercadopago';

// Monto fijo del pago de prueba.
const TEST_AMOUNT = 1000;

/**
 * Inicia un pago REAL de $1000 con Checkout Pro de Mercado Pago.
 * Devuelve el `init_point` para redirigir al checkout hospedado de MP.
 * Checkout Pro permite pagar como invitado; al aprobarse, el webhook
 * (`payment`) activa la suscripción del comercio.
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

    const checkoutUrl = await createCheckoutPreference({
      empresaId,
      title: 'Pago de prueba',
      precio: TEST_AMOUNT,
      planId: planId || undefined,
    });

    return NextResponse.json({ success: true, checkoutUrl });
  } catch (error: any) {
    console.error('Test payment (Mercado Pago) error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
