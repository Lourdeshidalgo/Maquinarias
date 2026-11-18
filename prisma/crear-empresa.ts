// Crea una empresa real (cliente del sistema) con su usuario dueño, vacía:
// sin productos ni clientes de ejemplo. Los datos se cargan después desde la app
// (por ejemplo, Clientes → Importar desde Excel).
//
// Uso (las variables no se guardan en el repo):
//   EMPRESA_NOMBRE='Maquinarias del Atlántico S.A.' EMPRESA_CUIT=30000000010 \
//   DUENO_NOMBRE='Dueño' DUENO_EMAIL='usuario@dominio' DUENO_PASSWORD='...' \
//   [SERVICIO_NUMERO_DESDE=24781] [MODULO_COSTOS=1] npm run crear:empresa
//
// No borra ni pisa nada: si el CUIT o el email ya existen, se detiene.

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const DIA = 86_400_000;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function requerida(nombre: string): string {
  const v = process.env[nombre]?.trim();
  if (!v) throw new Error(`Falta la variable ${nombre}.`);
  return v;
}

async function main() {
  const nombre = requerida('EMPRESA_NOMBRE');
  const cuit = requerida('EMPRESA_CUIT').replace(/\D/g, '');
  const duenoNombre = requerida('DUENO_NOMBRE');
  const email = requerida('DUENO_EMAIL').toLowerCase();
  const password = requerida('DUENO_PASSWORD');
  const condicionIva = process.env.EMPRESA_CONDICION_IVA?.trim() || 'Responsable Inscripto';
  const numeroDesde = process.env.SERVICIO_NUMERO_DESDE ? parseInt(process.env.SERVICIO_NUMERO_DESDE, 10) : null;
  const moduloCostos = process.env.MODULO_COSTOS !== '0';

  if (cuit.length !== 11) throw new Error('El CUIT tiene que tener 11 dígitos.');
  if (password.length < 10) throw new Error('La contraseña tiene que tener al menos 10 caracteres.');
  if (await prisma.empresa.findUnique({ where: { cuit } })) throw new Error(`Ya existe una empresa con el CUIT ${cuit}.`);
  if (await prisma.usuario.findUnique({ where: { email } })) throw new Error(`Ya existe un usuario con el email ${email}.`);

  const plan = await prisma.plan.findFirst({ where: { nombre: 'Premium' } });
  if (!plan) throw new Error('No existe el plan "Premium" en la base.');

  const empresa = await prisma.$transaction(async (tx) => {
    const e = await tx.empresa.create({
      data: {
        nombre, cuit, condicionIva, estado: 'ACTIVO', moduloCostos,
        servicioNumeroDesde: Number.isFinite(numeroDesde) ? numeroDesde : null,
        configAfip: { create: { cuit, razonSocial: nombre, condicionIva, puntoVenta: 1, modo: 'demo' } },
        suscripcion: { create: { planId: plan.id, estado: 'authorized', fechaVencimiento: new Date(Date.now() + 3650 * DIA) } },
        ...(moduloCostos ? { configuracionCostos: { create: {} } } : {}),
      },
    });
    await tx.usuario.create({ data: { nombre: duenoNombre, email, passwordHash: hashPassword(password), rol: 'OWNER', empresaId: e.id } });
    await tx.cliente.create({
      data: { empresaId: e.id, tipoDoc: '99', nroDoc: '0', razonSocial: 'Consumidor Final Genérico', condicionIva: 'Consumidor Final', saldoCuentaCorriente: 0 },
    });
    return e;
  });

  console.log(`Empresa creada: ${empresa.nombre} (CUIT ${cuit})`);
  console.log(`Usuario dueño: ${email}`);
  if (numeroDesde) console.log(`Las órdenes de servicio siguen desde la N° ${numeroDesde}.`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
