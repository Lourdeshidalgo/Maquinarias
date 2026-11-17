import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaServicio } from '@/lib/servicio/api';

async function datos(empresaId: string, rol: string | null) {
  const [empresa, ultima] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { servicioNumeroDesde: true } }),
    prisma.ordenServicio.findFirst({ where: { empresaId }, orderBy: { numero: 'desc' }, select: { numero: true } }),
  ]);
  const ultimoNumero = ultima?.numero ?? 0;
  return {
    numeroDesde: empresa?.servicioNumeroDesde ?? null,
    ultimoNumero,
    proximoNumero: Math.max(ultimoNumero + 1, empresa?.servicioNumeroDesde ?? 1),
    puedeEditar: rol === 'OWNER',
  };
}

// GET /api/tenant/servicio/configuracion → numeración de las órdenes
export async function GET(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => NextResponse.json(await datos(empresaId, req.headers.get('x-user-rol'))));
}

// PUT /api/tenant/servicio/configuracion { numeroDesde } → solo el dueño
export async function PUT(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => {
    const rol = req.headers.get('x-user-rol');
    if (rol !== 'OWNER') return NextResponse.json({ error: 'Solo el dueño puede cambiar la numeración.' }, { status: 403 });
    const { numeroDesde } = await req.json();
    const n = numeroDesde === null || numeroDesde === '' ? null : parseInt(String(numeroDesde).replace(/\D/g, ''), 10);
    if (n !== null && (!Number.isFinite(n) || n < 1 || n > 99_999_999)) {
      return NextResponse.json({ error: 'Ingresá un número válido.' }, { status: 400 });
    }
    await prisma.empresa.update({ where: { id: empresaId }, data: { servicioNumeroDesde: n } });
    return NextResponse.json(await datos(empresaId, rol));
  });
}
