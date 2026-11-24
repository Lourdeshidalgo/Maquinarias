import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rutaModuloCostos } from '@/lib/listas/api';
import { cargarCotizaciones, cargarReglasMargen, obtenerConfigCostos } from '@/lib/costos-db';
import { bonificacionesEfectivas, cotizacionPara, desgloseCalculo, normalizarBonificaciones, resolverMargen, type NivelMargen } from '@/lib/costos';
import { parseNumero } from '@/lib/listas/parseo';

const n = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

const ORIGEN: Record<NivelMargen, string> = {
  PRODUCTO: 'propia del producto',
  CATEGORIA: 'de su categoría',
  PROVEEDOR: 'de su proveedor',
  GENERAL: 'general',
};

// GET /api/tenant/costos/desglose?productoId=
//   → cómo se calcula el precio de ese producto, paso por paso, y de dónde sale su ganancia.
// GET /api/tenant/costos/desglose?proveedorId=[&ganancia=&bonificaciones=&dolar=]
//   → la fórmula del proveedor (como en el Excel) con un producto suyo de ejemplo. Los
//     parámetros opcionales son los valores que se están editando, todavía sin guardar.
export async function GET(req: NextRequest) {
  return rutaModuloCostos(req, async (empresaId) => {
    const q = req.nextUrl.searchParams;
    const [config, cotizaciones, reglas] = await Promise.all([
      obtenerConfigCostos(empresaId), cargarCotizaciones(empresaId), cargarReglasMargen(empresaId),
    ]);
    const base = {
      ivaEnCosto: config.ivaEnCosto, redondeo: config.redondeo, recargoCredito: n(config.recargoCredito),
    };

    const productoId = q.get('productoId');
    if (productoId) {
      const p = await prisma.producto.findFirst({
        where: { id: productoId, empresaId },
        include: {
          proveedorProductos: {
            where: { activo: true, preferido: true },
            include: { proveedor: { select: { id: true, nombre: true, bonificacionesBase: true } } },
            take: 1,
          },
        },
      });
      if (!p) return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
      const v = p.proveedorProductos[0];
      const proveedorId = v?.proveedorId ?? p.proveedorId;
      const { margen, nivel } = resolverMargen(
        { margenPorcentaje: p.margenPorcentaje ? n(p.margenPorcentaje) : null, categoria: p.categoria, proveedorId },
        reglas
      );
      const entrada = v
        ? {
            costoLista: n(v.costoLista), moneda: v.moneda, bonificaciones: bonificacionesEfectivas(v.bonificaciones, v.proveedor.bonificacionesBase),
            incluyeIva: v.incluyeIva, cotizacion: cotizacionPara(cotizaciones, v.proveedorId),
          }
        : // Sin lista de proveedor: el costo se cargó a mano en pesos (ya es el costo vigente).
          { costoLista: n(p.precioCosto), moneda: 'ARS', bonificaciones: '', incluyeIva: config.ivaEnCosto, cotizacion: null };
      const desglose = desgloseCalculo({
        ...entrada, ...base, ivaPorcentaje: n(p.ivaPorcentaje), costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging), margen,
      });
      return NextResponse.json({
        tipo: 'producto',
        producto: { id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, precioVenta: n(p.precioVenta) },
        proveedor: v ? { id: v.proveedor.id, nombre: v.proveedor.nombre } : null,
        lista: v ? { costoLista: n(v.costoLista), moneda: v.moneda } : null,
        costoEnvio: n(p.costoEnvio), costoPackaging: n(p.costoPackaging),
        ganancia: { valor: margen, nivel, origen: ORIGEN[nivel] },
        desglose,
      });
    }

    const proveedorId = q.get('proveedorId');
    if (proveedorId) {
      const prov = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId }, select: { id: true, nombre: true, bonificacionesBase: true } });
      if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
      // Valores que se están editando (si vienen y son válidos), si no los guardados.
      const gananciaQ = q.has('ganancia') && q.get('ganancia')!.trim() !== '' ? parseNumero(q.get('ganancia')) : null;
      const reglaProveedor = reglas.porProveedor.get(prov.id);
      const ganancia = gananciaQ ?? reglaProveedor ?? reglas.margenGeneral;
      const origen = gananciaQ !== null || reglaProveedor !== undefined ? 'de este proveedor' : 'general (el proveedor no tiene una propia)';
      const bonifQ = q.has('bonificaciones') ? normalizarBonificaciones(q.get('bonificaciones')) : null;
      const bonificacionesBase = bonifQ ?? prov.bonificacionesBase;
      const dolarQ = q.has('dolar') && q.get('dolar')!.trim() !== '' ? parseNumero(q.get('dolar')) : null;
      const dolar = dolarQ ?? cotizacionPara(cotizaciones, prov.id);

      // Ejemplo: un producto real del proveedor (preferido), con prioridad a los de lista en dólares.
      const vinculos = await prisma.proveedorProducto.findMany({
        where: { empresaId, proveedorId: prov.id, activo: true, preferido: true, producto: { activo: true } },
        include: { producto: { select: { id: true, codigo: true, nombre: true, categoria: true, ivaPorcentaje: true, costoEnvio: true, costoPackaging: true, margenPorcentaje: true } } },
        orderBy: [{ moneda: 'desc' }, { costoActualizadoAt: 'desc' }],
        take: 1,
      });
      const v = vinculos[0];
      const conUsd = await prisma.proveedorProducto.count({ where: { empresaId, proveedorId: prov.id, activo: true, moneda: 'USD' } });
      const moneda = v?.moneda ?? (conUsd ? 'USD' : 'ARS');
      const formula = desgloseCalculo({
        costoLista: 1, moneda, bonificaciones: bonificacionesBase, incluyeIva: v?.incluyeIva ?? false, ivaPorcentaje: v ? n(v.producto.ivaPorcentaje) : 21,
        cotizacion: dolar, costoEnvio: 0, costoPackaging: 0, margen: ganancia, ...base,
      });
      let ejemplo = null;
      if (v) {
        // El ejemplo usa la ganancia que le toca al producto (puede ganar una regla más específica).
        const r = resolverMargen(
          { margenPorcentaje: v.producto.margenPorcentaje ? n(v.producto.margenPorcentaje) : null, categoria: v.producto.categoria, proveedorId: prov.id },
          { ...reglas, porProveedor: new Map(reglas.porProveedor).set(prov.id, ganancia) }
        );
        ejemplo = {
          producto: { id: v.producto.id, codigo: v.producto.codigo, nombre: v.producto.nombre },
          lista: { costoLista: n(v.costoLista), moneda: v.moneda },
          ganancia: { valor: r.margen, nivel: r.nivel, origen: ORIGEN[r.nivel] },
          desglose: desgloseCalculo({
            costoLista: n(v.costoLista), moneda: v.moneda, bonificaciones: bonificacionesEfectivas(v.bonificaciones, bonificacionesBase),
            incluyeIva: v.incluyeIva, ivaPorcentaje: n(v.producto.ivaPorcentaje), cotizacion: dolar,
            costoEnvio: n(v.producto.costoEnvio), costoPackaging: n(v.producto.costoPackaging), margen: r.margen, ...base,
          }),
        };
      }
      return NextResponse.json({
        tipo: 'proveedor',
        proveedor: { id: prov.id, nombre: prov.nombre },
        moneda, dolar,
        ganancia: { valor: ganancia, origen, general: reglas.margenGeneral },
        formula: { factoresCosto: formula.factoresCosto, factorGanancia: formula.factorGanancia },
        recargoCredito: base.recargoCredito,
        ejemplo,
      });
    }
    return NextResponse.json({ error: 'Falta productoId o proveedorId.' }, { status: 400 });
  });
}
