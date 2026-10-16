import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { createCheckoutPreference } from '@/lib/mercadopago';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session || !session.empresaId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const { planId } = await req.json();
    if (!planId) {
      return NextResponse.json({ error: 'ID de plan requerido.' }, { status: 400 });
    }

    // Find plan
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 });
    }

    const precio = plan.precioMensual.toNumber();

    // Plan de prueba (sin costo): no pasa por Mercado Pago, se activa directo.
    if (precio <= 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      await prisma.suscripcion.upsert({
        where: { empresaId: session.empresaId },
        update: { planId: plan.id, estado: 'authorized', fechaVencimiento: expiry },
        create: { empresaId: session.empresaId, planId: plan.id, estado: 'authorized', fechaVencimiento: expiry },
      });

      await prisma.empresa.update({
        where: { id: session.empresaId },
        data: { estado: 'ACTIVO' },
      });

      return NextResponse.json({ success: true, checkoutUrl: '/checkout/feedback' });
    }

    // Mercado Pago exige back_urls HTTPS públicas. Derivamos el dominio del
    // request para no depender de NEXT_PUBLIC_SITE_URL.
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'www.molux.com.ar';
    const baseUrl = `${proto}://${host}`;

    // Pago único con Checkout Pro: acepta tarjeta de débito y crédito, a
    // diferencia de las suscripciones (preapproval), que solo aceptan crédito.
    const checkoutUrl = await createCheckoutPreference({
      empresaId: session.empresaId,
      title: `Plan ${plan.nombre}`,
      precio,
      planId: plan.id,
      baseUrl,
    });

    return NextResponse.json({ success: true, checkoutUrl });
  } catch (error: any) {
    console.error('Checkout creation endpoint error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
