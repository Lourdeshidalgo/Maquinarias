import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { obtenerConfigCostos } from '@/lib/costos-db';
import { diasDesde, semaforoCosto } from '@/lib/costos';

type Resumen = { productos: number; verde: number; amarillo: number; rojo: number; masAntiguo: Date | null };
const nuevo = (): Resumen => ({ productos: 0, verde: 0, amarillo: 0, rojo: 0, masAntiguo: null });

// GET /api/tenant/costos/estado → semáforo general y por proveedor (según el proveedor preferido)
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const [config, productos, proveedores, ultimas] = await Promise.all([
      obtenerConfigCostos(empresaId),
      prisma.producto.findMany({ where: { empresaId, activo: true }, select: { proveedorId: true, costoActualizadoAt: true } }),
      prisma.proveedor.findMany({ where: { empresaId, activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      prisma.importacionLista.findMany({
        where: { empresaId, estado: 'APLICADA' },
        orderBy: { aplicadaAt: 'desc' },
        distinct: ['proveedorId'],
        select: { proveedorId: true, fechaVigencia: true, aplicadaAt: true, archivoNombre: true },
      }),
    ]);
    const umbrales = { umbralAmarillo: config.umbralAmarillo, umbralRojo: config.umbralRojo };

    const general = nuevo();
    const porProveedor = new Map<string, Resumen>();
    for (const p of productos) {
      const s = semaforoCosto(p.costoActualizadoAt, umbrales);
      const clave = p.proveedorId ?? 'SIN';
      if (!porProveedor.has(clave)) porProveedor.set(clave, nuevo());
      for (const r of [general, porProveedor.get(clave)!]) {
        r.productos++;
        if (s === 'VERDE') r.verde++;
        else if (s === 'AMARILLO') r.amarillo++;
        else r.rojo++;
        if (!r.masAntiguo || p.costoActualizadoAt < r.masAntiguo) r.masAntiguo = p.costoActualizadoAt;
      }
    }
    const ultimaPorProveedor = new Map(ultimas.map((u) => [u.proveedorId, u]));

    const filas = [
      ...proveedores.map((p) => ({ id: p.id, nombre: p.nombre })),
      ...(porProveedor.has('SIN') ? [{ id: 'SIN', nombre: 'Sin proveedor' }] : []),
    ]
      .map((p) => {
        const r = porProveedor.get(p.id) ?? nuevo();
        const ultima = ultimaPorProveedor.get(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          ...r,
          diasMasAntiguo: r.masAntiguo ? diasDesde(r.masAntiguo) : null,
          pctDesactualizado: r.productos ? Math.round((r.rojo / r.productos) * 1000) / 10 : 0,
          pctAmarillo: r.productos ? Math.round((r.amarillo / r.productos) * 1000) / 10 : 0,
          ultimaLista: ultima ? { fechaVigencia: ultima.fechaVigencia, aplicadaAt: ultima.aplicadaAt, archivo: ultima.archivoNombre, dias: diasDesde(ultima.fechaVigencia) } : null,
        };
      })
      .filter((f) => f.productos > 0 || f.ultimaLista)
      .sort((a, b) => b.pctDesactualizado - a.pctDesactualizado || b.pctAmarillo - a.pctAmarillo || a.nombre.localeCompare(b.nombre));

    return NextResponse.json({ umbrales, general, proveedores: filas });
  });
}
