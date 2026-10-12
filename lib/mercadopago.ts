import crypto from 'node:crypto';

export interface SubscriptionRequest {
  empresaId: string;
  email: string;
  planNombre: string;
  precio: number;
  planId?: string;
}

const MP_API_URL = 'https://api.mercadopago.com';

export function isDemoMode(): boolean {
  const value = process.env.DEMO_MODE?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function getDemoCheckoutUrl({ empresaId, email, planNombre, precio }: SubscriptionRequest): string {
  const params = new URLSearchParams({
    empresaId,
    email,
    plan: planNombre,
    precio: precio.toString(),
    demo: 'true',
  });
  return `/checkout/demo?${params.toString()}`;
}

/**
 * Gets the base URL of the application.
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  return 'http://localhost:3000';
}

/**
 * Initiates a Mercado Pago subscription link (preapproval).
 * If DEMO_MODE=true, it redirects to a local simulated checkout.
 */
export async function createSubscriptionPreapproval({
  empresaId,
  email,
  planNombre,
  precio,
  planId,
}: SubscriptionRequest): Promise<string> {
  const isDemo = isDemoMode();

  if (isDemo) {
    return getDemoCheckoutUrl({ empresaId, email, planNombre, precio });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    console.warn('MP_ACCESS_TOKEN is missing. Falling back to demo checkout.');
    return getDemoCheckoutUrl({ empresaId, email, planNombre, precio });
  }

  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${MP_API_URL}/v1/preapproval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        back_url: `${baseUrl}/checkout/feedback`,
        reason: `Suscripción mensual - Plan ${planNombre}`,
        external_reference: planId ? `${empresaId}:${planId}` : empresaId,
        payer_email: email,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: precio,
          currency_id: 'ARS',
        },
        status: 'pending',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Mercado Pago preapproval error: ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    
    // Return the initiation link for checkout redirection
    if (!data.init_point) {
      throw new Error('Mercado Pago API failed to return init_point URL.');
    }
    
    return data.init_point;
  } catch (error: any) {
    console.error('Failed to create MP subscription preapproval:', error);
    throw new Error(`Mercado Pago Subscription creation failed: ${error.message}`);
  }
}

/**
 * Fetches a recurring charge ("authorized payment") of a subscription.
 * Mercado Pago notifies each monthly charge with topic
 * `subscription_authorized_payment`.
 */
export async function getAuthorizedPaymentDetails(authorizedPaymentId: string): Promise<any> {
  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    throw new Error('CRITICAL: MP_ACCESS_TOKEN environment variable is missing.');
  }

  const response = await fetch(`${MP_API_URL}/authorized_payments/${authorizedPaymentId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${mpToken}` },
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago API error fetching authorized payment: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetches subscription details from Mercado Pago using the preapproval ID.
 */
export async function getPreapprovalDetails(preapprovalId: string): Promise<any> {
  const isDemo = isDemoMode();
  if (isDemo) {
    // Dummy demo data
    return {
      id: preapprovalId,
      status: 'authorized',
      external_reference: 'demo-tenant-id',
      payer_email: 'demo@comerciopro.com',
      reason: 'Suscripción mensual - Plan Básico',
    };
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    throw new Error('CRITICAL: MP_ACCESS_TOKEN environment variable is missing.');
  }

  try {
    const response = await fetch(`${MP_API_URL}/v1/preapproval/${preapprovalId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${mpToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Mercado Pago API error fetching preapproval: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Failed to get MP subscription details:', error);
    throw new Error(`Failed to verify payment with Mercado Pago: ${error.message}`);
  }
}

/**
 * Verifies the authenticity of a Mercado Pago webhook notification.
 *
 * MP sends an `x-signature` header with the shape `ts=<timestamp>,v1=<hmac>` and
 * an `x-request-id` header. The HMAC is computed over the manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` using the webhook secret
 * (MP_WEBHOOK_SECRET) as the key.
 *
 * If MP_WEBHOOK_SECRET is not configured, validation is skipped (returns true)
 * to avoid breaking local/demo setups without a secret.
 */
export function verifyWebhookSignature(
  request: Request,
  dataId: string | number | undefined
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim().replace(/^['"]|['"]$/g, '');
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET not set; skipping webhook signature validation.');
    return true;
  }

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  if (!xSignature || !xRequestId || dataId === undefined) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [key, ...rest] = part.split('=');
      return [key.trim(), rest.join('=').trim()];
    })
  ) as Record<string, string>;

  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  // Mercado Pago requires lowercasing the id when building the manifest.
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(computed);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
