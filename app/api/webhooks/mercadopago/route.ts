import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPreapprovalDetails, getAuthorizedPaymentDetails, isDemoMode } from '@/lib/mercadopago';

const DAY_MS = 24 * 60 * 60 * 1000;

function isNotFound(error: any): boolean {
  return /not found|404/i.test(String(error?.message || error));
}

/**
 * Sincroniza la suscripción local con el estado real en Mercado Pago.
 * - authorized: activa el comercio y extiende el vencimiento al próximo cobro.
 * - pending: solo registra el ID (el cliente todavía no autorizó el pago), sin
 *   tocar el estado del comercio, para no bloquear a un cliente activo que
 *   simplemente abrió el checkout.
 * - paused/cancelled: suspende el comercio.
 */
async function syncPreapproval(preapprovalId: string) {
  const details = await getPreapprovalDetails(preapprovalId);
  const empresaId: string | undefined = details.external_reference;

  if (!empresaId) return { ok: false as const, reason: 'Sin external_reference (empresaId).' };

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) return { ok: false as const, reason: 'Empresa no encontrada para ese external_reference.' };

  const status: string = details.status; // authorized | paused | cancelled | pending
  const now = new Date();
  const existingSub = await prisma.suscripcion.findUnique({ where: { empresaId } });

  let planId = existingSub?.planId || '';
  if (!planId) {
    const fallbackPlan =
      (await prisma.plan.findFirst({ where: { nombre: 'Mensual' } })) ||
      (await prisma.plan.findFirst({ where: { nombre: 'Básico' } }));
    planId = fallbackPlan?.id || '';
  }

  if (status === 'pending') {
    if (existingSub) {
      await prisma.suscripcion.update({ where: { empresaId }, data: { mpPreapprovalId: preapprovalId } });
    } else if (planId) {
      await prisma.suscripcion.create({
        data: { empresaId, planId, mpPreapprovalId: preapprovalId, estado: 'pending', fechaVencimiento: now },
      });
    }
    return { ok: true as const, empresaId, status };
  }

  let vencimiento = existingSub?.fechaVencimiento || now;
  if (status === 'authorized') {
    vencimiento = details.next_payment_date
      ? new Date(details.next_payment_date)
      : new Date(now.getTime() + 30 * DAY_MS);
    // Margen mínimo mientras Mercado Pago termina de procesar el primer cobro.
    const floor = new Date(now.getTime() + DAY_MS);
    if (vencimiento < floor) vencimiento = floor;
  }

  if (existingSub) {
    await prisma.suscripcion.update({
      where: { empresaId },
      data: { mpPreapprovalId: preapprovalId, estado: status, fechaVencimiento: vencimiento },
    });
  } else if (planId) {
    await prisma.suscripcion.create({
      data: { empresaId, planId, mpPreapprovalId: preapprovalId, estado: status, fechaVencimiento: vencimiento },
    });
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { estado: status === 'authorized' ? 'ACTIVO' : 'INACTIVO' },
  });

  console.log(`MP sync: empresa ${empresaId} -> ${status}. Vencimiento: ${vencimiento.toISOString()}`);
  return { ok: true as const, empresaId, status };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    console.log('Received Mercado Pago Webhook:', JSON.stringify(body));

    // 1. DEMO MODE WEBHOOK SIMULATOR TRIGGER
    if (isDemoMode() && body.isDemoTrigger) {
      const { empresaId, planId, status, preapprovalId } = body;
      
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
      });
      
      if (!empresa) {
        return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
      }

      // Calculate expiration: 30 days from now
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);

      // Create or update subscription
      await prisma.suscripcion.upsert({
        where: { empresaId },
        update: {
          planId,
          mpPreapprovalId: preapprovalId || `demo-preapproval-${Math.floor(1000 + Math.random() * 9000)}`,
          estado: status || 'authorized',
          fechaVencimiento: expiry,
        },
        create: {
          empresaId,
          planId,
          mpPreapprovalId: preapprovalId || `demo-preapproval-${Math.floor(1000 + Math.random() * 9000)}`,
          estado: status || 'authorized',
          fechaVencimiento: expiry,
        },
      });

      // Update Empresa state
      await prisma.empresa.update({
        where: { id: empresaId },
        data: {
          estado: status === 'authorized' ? 'ACTIVO' : 'PENDIENTE_PAGO',
        },
      });

      console.log(`Demo Webhook Simulated: Empresa ${empresaId} activated under Plan ${planId}.`);
      return NextResponse.json({ success: true, message: 'Demo webhook trigger processed successfully.' });
    }

    // 2. REAL MERCADO PAGO WEBHOOK PROCESSING
    const { type, data } = body;

    // 2.1 Cambios en la suscripción (alta, autorización, pausa, cancelación)
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const preapprovalId = data?.id;
      if (!preapprovalId) {
        return NextResponse.json({ error: 'Missing preapproval ID in notification.' }, { status: 400 });
      }

      try {
        const result = await syncPreapproval(String(preapprovalId));
        if (!result.ok) {
          return NextResponse.json({ ignored: true, reason: result.reason }, { status: 200 });
        }
      } catch (error: any) {
        // ID inexistente (ej. notificación de prueba del panel de MP): no reintentar.
        if (isNotFound(error)) return NextResponse.json({ ignored: true }, { status: 200 });
        throw error;
      }
    }

    // 2.2 Cobro mensual recurrente: extiende el vencimiento y registra el pago
    if (type === 'subscription_authorized_payment') {
      const authorizedPaymentId = data?.id;
      if (!authorizedPaymentId) {
        return NextResponse.json({ error: 'Missing authorized payment ID in notification.' }, { status: 400 });
      }

      try {
        const ap = await getAuthorizedPaymentDetails(String(authorizedPaymentId));
        const preapprovalId: string | undefined = ap.preapproval_id;

        if (!preapprovalId) {
          return NextResponse.json({ ignored: true, reason: 'Sin preapproval_id.' }, { status: 200 });
        }

        const result = await syncPreapproval(String(preapprovalId));
        const approved = ap.status === 'processed' || ap.payment?.status === 'approved';

        if (result.ok && approved) {
          const monto = Number(ap.transaction_amount ?? ap.payment?.transaction_amount);
          const marker = `MP #${authorizedPaymentId}`;

          const yaRegistrado = await prisma.pago.findFirst({
            where: { empresaId: result.empresaId, concepto: { contains: marker } },
          });

          if (!yaRegistrado && Number.isFinite(monto) && monto > 0) {
            await prisma.pago.create({
              data: {
                empresaId: result.empresaId,
                monto,
                medioPago: 'Mercado Pago',
                concepto: `Cuota mensual (débito automático) · ${marker}`,
                fecha: ap.debit_date ? new Date(ap.debit_date) : new Date(),
              },
            });
          }
        }
      } catch (error: any) {
        if (isNotFound(error)) return NextResponse.json({ ignored: true }, { status: 200 });
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Webhook route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
