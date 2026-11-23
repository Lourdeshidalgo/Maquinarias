import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant';
import { filasExportacion } from '@/lib/clientes/padron';

// GET /api/tenant/clientes/exportar → todos los clientes de la empresa, listos
// para armar el Excel. Es la base de clientes completa: solo la baja el dueño.
export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    if (req.headers.get('x-user-rol') !== 'OWNER') {
      return NextResponse.json({ error: 'Solo el dueño puede exportar los clientes.' }, { status: 403 });
    }
    const clientes = await prisma.cliente.findMany({
      where: { empresaId },
      orderBy: [{ codigo: { sort: 'asc', nulls: 'last' } }, { razonSocial: 'asc' }],
    });
    return NextResponse.json({ filas: filasExportacion(clientes) });
  } catch (error) {
    console.error('Exportar clientes:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo exportar.' }, { status: 400 });
  }
}
