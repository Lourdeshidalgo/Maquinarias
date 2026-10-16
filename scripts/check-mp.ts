import * as fs from 'fs';
import * as path from 'path';

/**
 * Diagnostic: tells whether a Mercado Pago Access Token belongs to a real
 * production seller account or to a test/sandbox account.
 *
 * Usage:
 *   npx ts-node scripts/check-mp.ts
 *   MP_ACCESS_TOKEN="APP_USR-..." npx ts-node scripts/check-mp.ts
 *
 * If MP_ACCESS_TOKEN is not set in the shell, it falls back to the value
 * found in the local .env file.
 */

interface MpUser {
  id: number;
  nickname?: string;
  email?: string;
  test_data?: {
    test_user?: boolean;
    user_owner?: number;
  };
}

interface MpApplication {
  id: number;
  name?: string;
  description?: string;
  sandbox_mode?: boolean;
  notifications_topics?: string[];
  notifications_callback_url?: string;
  access_token?: string;
  test_access_token?: string;
}

function loadTokenFromEnvFile(): string | undefined {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return undefined;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*MP_ACCESS_TOKEN\s*=\s*(.*)\s*$/);
    if (match) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return undefined;
}

async function main() {
  const token = (process.env.MP_ACCESS_TOKEN || loadTokenFromEnvFile() || '').trim();
  if (!token) {
    console.error('No se encontró MP_ACCESS_TOKEN (ni en el entorno ni en .env).');
    process.exit(1);
  }

  console.log(`Token: ${token.slice(0, 22)}...${token.slice(-10)}\n`);

  // 1. Who owns the token?
  const meRes = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!meRes.ok) {
    console.error(`GET /users/me falló con HTTP ${meRes.status}. Token inválido o sin permisos.`);
    process.exit(1);
  }

  const me = (await meRes.json()) as MpUser;
  const isTestUser = me.test_data?.test_user === true;
  const nickname = me.nickname || '(sin nickname)';

  console.log('── Cuenta dueña del token ──');
  console.log(`  id:        ${me.id}`);
  console.log(`  nickname:  ${nickname}`);
  console.log(`  email:     ${me.email || '(oculto)'}`);
  console.log(`  test_user: ${isTestUser}`);
  if (me.test_data?.user_owner) {
    console.log(`  user_owner (cuenta real que lo creó): ${me.test_data.user_owner}`);
  }

  // 2. What kind of application issued the token? (app id = 2nd segment)
  const segments = token.split('-');
  const appId = segments.length >= 2 ? segments[1] : undefined;
  let credentialType: 'production' | 'test' | undefined;
  let webhookTopics: string[] | undefined;
  let webhookUrl: string | undefined;

  if (appId && /^\d+$/.test(appId)) {
    const appRes = await fetch(`https://api.mercadopago.com/applications/${appId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (appRes.ok) {
      const app = (await appRes.json()) as MpApplication;
      // `sandbox_mode` is a legacy flag MP keeps at `true` and no longer means
      // anything: there is no sandbox, only prod vs test credentials. The
      // reliable signal is whether the token matches the app's production or
      // test access token.
      if (app.test_access_token && token === app.test_access_token) {
        credentialType = 'test';
      } else if (app.access_token && token === app.access_token) {
        credentialType = 'production';
      }
      webhookTopics = app.notifications_topics ?? [];
      webhookUrl = app.notifications_callback_url;
      console.log('\n── Aplicación ──');
      console.log(`  id:           ${app.id}`);
      console.log(`  nombre:       ${app.name}`);
      console.log(`  descripción:  ${app.description}`);
      console.log(`  credencial:   ${credentialType ?? 'desconocida'}`);
      console.log(`  webhooks:     ${webhookTopics.length ? webhookTopics.join(', ') : '(ninguno configurado)'}`);
      console.log(`  webhook URL:  ${webhookUrl || '(sin configurar)'}`);
    } else {
      console.log(`\n── Aplicación ──\n  No se pudo consultar la app ${appId} (HTTP ${appRes.status}).`);
    }
  }

  // 3. Verdict
  const isProduction = !isTestUser && credentialType !== 'test';
  const noWebhooks = webhookTopics !== undefined && webhookTopics.length === 0;

  console.log('\n════════════════════════════');
  if (isProduction) {
    console.log('  ✅ PRODUCCIÓN REAL — este token cobra de verdad.');
  } else {
    console.log('  ❌ NO LISTO PARA COBRAR — este token NO procesa dinero real.');
    if (isTestUser) {
      console.log('     · El dueño del token es un test_user (cuenta de prueba).');
    } else if (credentialType === 'test') {
      console.log('     · El token es la credencial de prueba (TEST-...) de la app.');
      console.log('       Usá el Access Token de Producción del panel de MP.');
    } else {
      console.log('     · No se pudo determinar el tipo de credencial.');
    }
  }

  if (noWebhooks) {
    console.log('  ⚠️  OJO: la app no tiene topics de webhook suscritos.');
    console.log('     (ej. subscription_preapproval / preapproval)');
  }
  console.log('════════════════════════════');

  process.exit(isProduction ? 0 : 2);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
