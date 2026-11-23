import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/tenant';
import { rutaModuloCostos } from '@/lib/listas/api';
import type { MapeoLista } from '@/lib/listas/parseo';

const TIPOS = ['xlsx', 'xls', 'csv', 'pdf'];

// GET /api/tenant/listas/importaciones?proveedorId=  → historial de importaciones
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const proveedorId = req.nextUrl.searchParams.get('proveedorId');
    const importaciones = await prisma.importacionLista.findMany({
      where: { empresaId, ...(proveedorId ? { proveedorId } : {}), NOT: { estado: 'DESCARTADA' } },
      include: { proveedor: { select: { id: true, nombre: true } }, usuario: { select: { nombre: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Solo la última aplicada de cada proveedor se puede deshacer.
    const ultimaPorProveedor = new Map<string, string>();
    for (const i of [...importaciones].filter((x) => x.estado === 'APLICADA').sort((a, b) => +(b.aplicadaAt ?? 0) - +(a.aplicadaAt ?? 0))) {
      if (!ultimaPorProveedor.has(i.proveedorId)) ultimaPorProveedor.set(i.proveedorId, i.id);
    }

    return NextResponse.json(
      importaciones.map((i) => ({
        ...i,
        mapeo: undefined,
        tieneArchivo: !!i.archivoUrl,
        archivoUrl: undefined,
        sePuedeDeshacer: ultimaPorProveedor.get(i.proveedorId) === i.id,
      }))
    );
  });
}

// POST /api/tenant/listas/importaciones  → crea el borrador y guarda la plantilla del proveedor
export async function POST(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const body = await req.json();
    const { proveedorId, fechaVigencia, archivoNombre, archivoTipo, archivoUrl, mapeo } = body as {
      proveedorId?: string; fechaVigencia?: string; archivoNombre?: string; archivoTipo?: string; archivoUrl?: string; mapeo?: MapeoLista;
    };

    if (!proveedorId || !fechaVigencia || !archivoNombre || !archivoTipo || !mapeo) {
      return NextResponse.json({ error: 'Faltan datos de la importación (proveedor, fecha, archivo o mapeo).' }, { status: 400 });
    }
    if (!TIPOS.includes(archivoTipo)) {
      return NextResponse.json({ error: 'Tipo de archivo no soportado.' }, { status: 400 });
    }
    // Un PDF no tiene columnas: sus filas las lee Claude (ver lib/listas/pdf.ts).
    const esPdf = archivoTipo === 'pdf';
    if (!esPdf && (mapeo.columnas?.precio === undefined || (mapeo.columnas?.codigo === undefined && mapeo.columnas?.descripcion === undefined))) {
      return NextResponse.json({ error: 'Indicá al menos la columna de precio y la de código o descripción.' }, { status: 400 });
    }
    const proveedor = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId } });
    if (!proveedor) return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });

    const fecha = new Date(`${fechaVigencia}T12:00:00-03:00`);
    if (Number.isNaN(fecha.getTime())) return NextResponse.json({ error: 'Fecha de vigencia inválida.' }, { status: 400 });

    // Solo un borrador abierto por proveedor: el anterior se descarta.
    await prisma.importacionLista.updateMany({
      where: { empresaId, proveedorId, estado: 'BORRADOR' },
      data: { estado: 'DESCARTADA' },
    });

    const mapeoJson = mapeo as unknown as Prisma.InputJsonValue;
    const [importacion] = await prisma.$transaction([
      prisma.importacionLista.create({
        data: {
          empresaId, proveedorId, usuarioId: getUserId(req), fechaVigencia: fecha,
          archivoNombre: String(archivoNombre).slice(0, 250), archivoTipo,
          archivoUrl: archivoUrl && archivoUrl.startsWith('https://') ? archivoUrl : null,
          mapeo: mapeoJson,
        },
      }),
      // La plantilla (columnas del Excel) no se pisa con la configuración de un PDF.
      ...(esPdf
        ? []
        : [
            prisma.plantillaImportacion.upsert({
              where: { proveedorId },
              update: { mapeo: mapeoJson },
              create: { empresaId, proveedorId, mapeo: mapeoJson },
            }),
          ]),
    ]);

    return NextResponse.json({ id: importacion.id }, { status: 201 });
  });
}
