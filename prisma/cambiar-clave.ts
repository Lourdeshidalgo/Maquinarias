// Pone una contraseña nueva a un usuario (por ejemplo, si nadie se acuerda la
// del dueño de una empresa). Pregunta el email y la contraseña en la terminal:
// la contraseña no se ve al escribirla y no queda guardada en ningún archivo.
//
// Uso:  npm run cambiar:clave
//
// Trabaja sobre la base de DATABASE_URL (.env). Si no es la base local, pide
// confirmación antes de cambiar nada.

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import readline from 'readline';

// Mismo formato que lib/password.ts (salt:hash con scrypt)
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Una sola interfaz para todas las preguntas. Los renglones se encolan, así no
// se pierde ninguno mientras se consulta la base.
const esTerminal = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: esTerminal, prompt: "" });
let ocultar = false;
const rli = rl as unknown as { _writeToOutput: (s: string) => void };
const escribirOriginal = rli._writeToOutput.bind(rl);
rli._writeToOutput = (s: string) => {
  if (!ocultar) escribirOriginal(s); // con la contraseña no se muestra lo que se escribe
};
const renglones: string[] = [];
const esperando: ((r: string | null) => void)[] = [];
let cerrado = false;
rl.on('line', (l) => (esperando.length ? esperando.shift()!(l) : renglones.push(l)));
rl.on('close', () => {
  cerrado = true;
  while (esperando.length) esperando.shift()!(null);
});

async function preguntar(texto: string, oculta = false): Promise<string> {
  process.stdout.write(texto);
  ocultar = oculta && esTerminal;
  const r = renglones.length ? renglones.shift()! : cerrado ? null : await new Promise<string | null>((res) => esperando.push(res));
  ocultar = false;
  if (oculta || !esTerminal) process.stdout.write('\n');
  if (r === null) throw new Error('se cortó la entrada antes de terminar.');
  return r.trim();
}

async function main() {
  const prisma = new PrismaClient(); // carga el .env
  const url = process.env.DATABASE_URL ?? '';
  let host = '(sin DATABASE_URL)';
  try { host = new URL(url).host; } catch { /* queda el texto de arriba */ }
  const esLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  console.log(`Base de datos: ${host}${esLocal ? ' (local)' : ''}`);

  try {
    const email = (await preguntar('Email del usuario: ')).toLowerCase();
    const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: { select: { nombre: true } } } });
    if (!usuario) {
      console.log(`No hay ningún usuario con el email ${email}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Usuario: ${usuario.nombre} (${usuario.rol})${usuario.empresa ? ` · Empresa: ${usuario.empresa.nombre}` : ''}`);

    if (!esLocal) {
      const ok = await preguntar('Esta NO es la base local. ¿Cambiar la contraseña igual? (escribí si): ');
      if (ok.toLowerCase() !== 'si') {
        console.log('No se cambió nada.');
        return;
      }
    }

    const clave = await preguntar('Contraseña nueva (mínimo 8 caracteres, no se ve al escribir): ', true);
    if (clave.length < 8) {
      console.log('La contraseña tiene que tener al menos 8 caracteres. No se cambió nada.');
      process.exitCode = 1;
      return;
    }
    const repetida = await preguntar('Repetí la contraseña: ', true);
    if (repetida !== clave) {
      console.log('Las dos contraseñas no coinciden. No se cambió nada.');
      process.exitCode = 1;
      return;
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash: hashPassword(clave) } });
    if (!usuario.activo) console.log('Ojo: este usuario está desactivado; se reactiva desde el panel.');
    console.log(`Listo: ya podés entrar con ${email} y la contraseña nueva.`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('No se pudo cambiar la contraseña:', (e as Error).message);
  process.exit(1);
});
