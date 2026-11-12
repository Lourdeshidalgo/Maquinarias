import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { obtenerConfigCostos } from '@/lib/costos-db';

const num = (v: { toNumber(): number }) => v.toNumber();

// GET  /api/tenant/costos/configuracion → configuración, reglas, categorías y proveedores
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const [config, reglas, categorias, proveedores] = await Promise.all([
      obtenerConfigCostos(empresaId),
      prisma.reglaMargen.findMany({ where: { empresaId }, include: { proveedor: { select: { nombre: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.producto.groupBy({ by: ['categoria'], where: { empresaId, activo: true }, _count: { _all: true }, orderBy: { categoria: 'asc' } }),
      prisma.proveedor.findMany({
        where: { empresaId, activo: true },
        select: { id: true, nombre: true, _count: { select: { productos: { where: { activo: true } } } } },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return NextResponse.json({
      config: {
        margenGeneral: num(config.margenGeneral), margenMinimo: num(config.margenMinimo), redondeo: config.redondeo,
        modoPrecio: config.modoPrecio, ivaEnCosto: config.ivaEnCosto, umbralAmarillo: config.umbralAmarillo,
        umbralRojo: config.umbralRojo, alertaSubaPct: num(config.alertaSubaPct), alertaBajaPct: num(config.alertaBajaPct),
      },
      reglas: reglas.map((r) => ({
        id: r.id, tipo: r.tipo, categoria: r.categoria, proveedorId: r.proveedorId,
        proveedorNombre: r.proveedor?.nombre ?? null, margen: num(r.margen),
      })),
      categorias: categorias.map((c) => ({ nombre: c.categoria, productos: c._count._all })),
      proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre, productos: p._count.productos })),
    });
  });
}

const enRango = (v: unknown, min: number, max: number) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(x) && x >= min && x <= max ? x : null;
};

// PUT /api/tenant/costos/configuracion → guarda la configuración general
export async function PUT(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const b = await req.json();
    const margenGeneral = enRango(b.margenGeneral, 0, 1000);
    const margenMinimo = enRango(b.margenMinimo, 0, 1000);
    const redondeo = [0, 10, 100, 1000].includes(Number(b.redondeo)) ? Number(b.redondeo) : null;
    const umbralAmarillo = enRango(b.umbralAmarillo, 1, 365);
    const umbralRojo = enRango(b.umbralRojo, 1, 730);
    const alertaSubaPct = enRango(b.alertaSubaPct, 1, 1000);
    const alertaBajaPct = enRango(b.alertaBajaPct, 1, 100);

    if (margenGeneral === null || margenMinimo === null) return NextResponse.json({ error: 'Revisá los recargos (entre 0% y 1000%).' }, { status: 400 });
    if (redondeo === null) return NextResponse.json({ error: 'Redondeo inválido.' }, { status: 400 });
    if (!['AUTOMATICO', 'APROBACION'].includes(b.modoPrecio)) return NextResponse.json({ error: 'Modo de precios inválido.' }, { status: 400 });
    if (umbralAmarillo === null || umbralRojo === null || umbralRojo < umbralAmarillo) {
      return NextResponse.json({ error: 'Los días para rojo tienen que ser mayores o iguales que los de amarillo.' }, { status: 400 });
    }
    if (alertaSubaPct === null || alertaBajaPct === null) return NextResponse.json({ error: 'Revisá los porcentajes de alerta.' }, { status: 400 });

    await obtenerConfigCostos(empresaId);
    await prisma.configuracionCostos.update({
      where: { empresaId },
      data: {
        margenGeneral, margenMinimo, redondeo, modoPrecio: b.modoPrecio, umbralAmarillo: Math.round(umbralAmarillo),
        umbralRojo: Math.round(umbralRojo), alertaSubaPct, alertaBajaPct,
        ...(typeof b.ivaEnCosto === 'boolean' ? { ivaEnCosto: b.ivaEnCosto } : {}),
      },
    });
    return NextResponse.json({ success: true });
  });
}
