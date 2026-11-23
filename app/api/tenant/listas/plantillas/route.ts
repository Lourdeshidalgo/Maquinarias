import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';

// GET /api/tenant/listas/plantillas?proveedorId=  → mapeo guardado del proveedor (o null)
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const proveedorId = req.nextUrl.searchParams.get('proveedorId');
    if (!proveedorId) return NextResponse.json({ error: 'Falta el proveedor.' }, { status: 400 });
    const plantilla = await prisma.plantillaImportacion.findFirst({ where: { empresaId, proveedorId } });
    return NextResponse.json(plantilla ? { mapeo: plantilla.mapeo, updatedAt: plantilla.updatedAt } : null);
  });
}
