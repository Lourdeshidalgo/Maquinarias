import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaServicio } from '@/lib/servicio/api';

async function datos(empresaId: string, rol: string | null) {
  const [empresa, ultima] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { servicioNumeroDesde: true, servicioTecnicos: true } }),
    prisma.ordenServicio.findFirst({ where: { empresaId }, orderBy: { numero: 'desc' }, select: { numero: true } }),
  ]);
  const ultimoNumero = ultima?.numero ?? 0;
  return {
    numeroDesde: empresa?.servicioNumeroDesde ?? null,
    ultimoNumero,
    proximoNumero: Math.max(ultimoNumero + 1, empresa?.servicioNumeroDesde ?? 1),
    tecnicos: empresa?.servicioTecnicos ?? [],
    puedeEditar: rol === 'OWNER',
  };
}

// GET /api/tenant/servicio/configuracion → numeración de las órdenes
export async function GET(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => NextResponse.json(await datos(empresaId, req.headers.get('x-user-rol'))));
}

// PUT /api/tenant/servicio/configuracion { numeroDesde?, tecnicos? } → solo el dueño
export async function PUT(req: NextRequest) {
  return rutaServicio(req, async (empresaId) => {
    const rol = req.headers.get('x-user-rol');
    if (rol !== 'OWNER') return NextResponse.json({ error: 'Solo el dueño puede cambiar la numeración.' }, { status: 403 });
    const body = await req.json();
    const data: { servicioNumeroDesde?: number | null; servicioTecnicos?: string[] } = {};
    if (body.numeroDesde !== undefined) {
      const n = body.numeroDesde === null || body.numeroDesde === '' ? null : parseInt(String(body.numeroDesde).replace(/\D/g, ''), 10);
      if (n !== null && (!Number.isFinite(n) || n < 1 || n > 99_999_999)) {
        return NextResponse.json({ error: 'Ingresá un número válido.' }, { status: 400 });
      }
      data.servicioNumeroDesde = n;
    }
    if (body.tecnicos !== undefined) {
      if (!Array.isArray(body.tecnicos)) return NextResponse.json({ error: 'Lista de técnicos inválida.' }, { status: 400 });
      const vistos = new Set<string>();
      data.servicioTecnicos = body.tecnicos
        .map((t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 60))
        .filter((t: string) => t && !vistos.has(t.toLowerCase()) && vistos.add(t.toLowerCase()))
        .slice(0, 50);
    }
    await prisma.empresa.update({ where: { id: empresaId }, data });
    return NextResponse.json(await datos(empresaId, rol));
  });
}
