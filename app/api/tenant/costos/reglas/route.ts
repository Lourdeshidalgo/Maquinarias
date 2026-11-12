import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';

// POST /api/tenant/costos/reglas { tipo: 'CATEGORIA'|'PROVEEDOR', categoria?, proveedorId?, margen }
// Crea o actualiza el recargo de una categoría o de un proveedor.
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const { tipo, categoria, proveedorId, margen } = await req.json();
    const m = parseFloat(margen);
    if (!Number.isFinite(m) || m < 0 || m > 1000) return NextResponse.json({ error: 'El recargo tiene que estar entre 0% y 1000%.' }, { status: 400 });

    if (tipo === 'CATEGORIA') {
      const cat = String(categoria || '').trim();
      if (!cat) return NextResponse.json({ error: 'Elegí la categoría.' }, { status: 400 });
      const existente = await prisma.reglaMargen.findFirst({ where: { empresaId, tipo: 'CATEGORIA', categoria: { equals: cat, mode: 'insensitive' } } });
      const regla = existente
        ? await prisma.reglaMargen.update({ where: { id: existente.id }, data: { margen: m } })
        : await prisma.reglaMargen.create({ data: { empresaId, tipo: 'CATEGORIA', categoria: cat, margen: m } });
      return NextResponse.json(regla);
    }
    if (tipo === 'PROVEEDOR') {
      const prov = proveedorId ? await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId } }) : null;
      if (!prov) return NextResponse.json({ error: 'Elegí el proveedor.' }, { status: 400 });
      const regla = await prisma.reglaMargen.upsert({
        where: { empresaId_proveedorId: { empresaId, proveedorId: prov.id } },
        update: { margen: m },
        create: { empresaId, tipo: 'PROVEEDOR', proveedorId: prov.id, margen: m },
      });
      return NextResponse.json(regla);
    }
    return NextResponse.json({ error: 'Tipo de regla inválido.' }, { status: 400 });
  });
}

// DELETE /api/tenant/costos/reglas?id=
export async function DELETE(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const id = req.nextUrl.searchParams.get('id');
    const r = await prisma.reglaMargen.deleteMany({ where: { id: id || '', empresaId } });
    if (!r.count) return NextResponse.json({ error: 'Regla no encontrada.' }, { status: 404 });
    return NextResponse.json({ success: true });
  });
}
