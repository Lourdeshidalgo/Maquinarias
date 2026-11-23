import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ESTADOS_COBRABLES, ESTADOS_CON_STOCK, FORMAS_PAGO_SENA, TIPOS_ORDEN, MODALIDADES, infoEstado, totalesServicio, transicionesDe, type EstadoServicio } from '@/lib/servicio/estados';

// Lógica de servidor de las órdenes de servicio técnico. Todo filtra por
// empresaId. Regla central: cotizar no toca el stock; los repuestos se
// descuentan al pasar a ACEPTADO (o a un estado posterior) y vuelven si la
// orden retrocede a cotizada, no se acepta o se cancela.

export class ErrorServicio extends Error {}

type Db = Prisma.TransactionClient;

export type ItemEntrada = {
  tipo: string;
  productoId?: string | null;
  descripcion?: string;
  cantidad: number | string;
  precioUnitario: number | string;
};

export type DatosOrden = {
  clienteId?: string | null;
  clienteNombre?: string;
  clienteTelefono?: string | null;
  equipoTipo?: string;
  equipoMarca?: string | null;
  equipoModelo?: string | null;
  equipoSerie?: string | null;
  equipoHoras?: string | null;
  fallaReportada?: string;
  diagnostico?: string | null;
  tecnico?: string | null;
  observaciones?: string | null;
  fechaPrometida?: string | null;
  validezDias?: number | string;
  modalidad?: string;
  tipoOrden?: string;
  ordenExterna?: string | null;
  accesorios?: string | null;
  notasInternas?: string | null;
  items?: ItemEntrada[];
};

const CODIGO_PRODUCTO_SERVICIO = 'SERVICIO-TECNICO';
const texto = (v: unknown, max = 500) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

/** Valida y normaliza los ítems del presupuesto (los repuestos se validan contra el catálogo). */
async function normalizarItems(db: Db, empresaId: string, items: ItemEntrada[]) {
  const ids = items.filter((i) => i.tipo === 'REPUESTO' && i.productoId).map((i) => i.productoId as string);
  const productos = ids.length
    ? await db.producto.findMany({ where: { empresaId, id: { in: ids } }, select: { id: true, nombre: true, ivaPorcentaje: true } })
    : [];
  const porId = new Map(productos.map((p) => [p.id, p]));

  return items.slice(0, 200).map((i, posicion) => {
    const tipo = ['REPUESTO', 'MANO_OBRA', 'OTRO'].includes(i.tipo) ? i.tipo : 'OTRO';
    const cantidad = parseFloat(String(i.cantidad).replace(',', '.'));
    const precio = parseFloat(String(i.precioUnitario).replace(',', '.'));
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ErrorServicio('Cada ítem necesita una cantidad mayor a 0.');
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorServicio('Revisá los precios del presupuesto.');
    let productoId: string | null = null;
    let descripcion = texto(i.descripcion, 250);
    let iva = 21;
    if (tipo === 'REPUESTO') {
      const p = i.productoId ? porId.get(i.productoId) : undefined;
      if (!p) throw new ErrorServicio('Un repuesto del presupuesto no existe en el stock.');
      productoId = p.id;
      descripcion = descripcion || p.nombre;
      iva = p.ivaPorcentaje.toNumber();
    }
    if (!descripcion) throw new ErrorServicio('Cada ítem necesita una descripción.');
    return { tipo, productoId, descripcion, cantidad, precioUnitario: Math.round(precio), ivaPorcentaje: iva, posicion };
  });
}

/** Cantidad de cada repuesto que usa la orden (productoId → cantidad). */
function consumo(items: { tipo: string; productoId: string | null; cantidad: { toNumber(): number } | number }[]) {
  const m = new Map<string, number>();
  for (const i of items) {
    if (i.tipo !== 'REPUESTO' || !i.productoId) continue;
    const q = typeof i.cantidad === 'number' ? i.cantidad : i.cantidad.toNumber();
    m.set(i.productoId, (m.get(i.productoId) ?? 0) + q);
  }
  return m;
}

/** Mueve el stock: positivo descuenta, negativo devuelve. Devuelve los que quedan en negativo. */
async function moverStock(db: Db, empresaId: string, delta: Map<string, number>) {
  const enNegativo: { nombre: string; stock: number }[] = [];
  for (const [productoId, cantidad] of delta) {
    if (Math.abs(cantidad) < 0.0005) continue;
    const p = await db.producto.update({
      where: { id: productoId },
      data: { stockActual: { decrement: cantidad } },
      select: { nombre: true, stockActual: true, empresaId: true },
    });
    if (p.empresaId !== empresaId) throw new ErrorServicio('Producto inválido.');
    if (cantidad > 0 && p.stockActual.toNumber() < 0) enNegativo.push({ nombre: p.nombre, stock: p.stockActual.toNumber() });
  }
  return enNegativo;
}

async function ordenDeEmpresa(db: Db, empresaId: string, id: string) {
  const orden = await db.ordenServicio.findFirst({ where: { id, empresaId }, include: { items: true } });
  if (!orden) throw new ErrorServicio('Orden no encontrada.');
  return orden;
}

function datosCabecera(d: DatosOrden) {
  const data: Prisma.OrdenServicioUncheckedUpdateInput = {};
  if (d.clienteNombre !== undefined) data.clienteNombre = texto(d.clienteNombre, 150) ?? '';
  if (d.clienteTelefono !== undefined) data.clienteTelefono = texto(d.clienteTelefono, 50);
  if (d.equipoTipo !== undefined) data.equipoTipo = texto(d.equipoTipo, 100) ?? '';
  if (d.equipoMarca !== undefined) data.equipoMarca = texto(d.equipoMarca, 100);
  if (d.equipoModelo !== undefined) data.equipoModelo = texto(d.equipoModelo, 100);
  if (d.equipoSerie !== undefined) data.equipoSerie = texto(d.equipoSerie, 100);
  if (d.equipoHoras !== undefined) data.equipoHoras = texto(d.equipoHoras, 50);
  if (d.fallaReportada !== undefined) data.fallaReportada = texto(d.fallaReportada, 4000) ?? '';
  if (d.diagnostico !== undefined) data.diagnostico = texto(d.diagnostico, 4000);
  if (d.tecnico !== undefined) data.tecnico = texto(d.tecnico, 100);
  if (d.observaciones !== undefined) data.observaciones = texto(d.observaciones, 4000);
  if (d.fechaPrometida !== undefined) data.fechaPrometida = d.fechaPrometida ? new Date(`${d.fechaPrometida}T12:00:00-03:00`) : null;
  if (d.modalidad !== undefined) data.modalidad = MODALIDADES.some((m) => m.modalidad === d.modalidad) ? d.modalidad : 'PRESUPUESTAR';
  if (d.tipoOrden !== undefined) data.tipoOrden = TIPOS_ORDEN.some((t) => t.tipo === d.tipoOrden) ? d.tipoOrden : 'TALLER';
  if (d.ordenExterna !== undefined) data.ordenExterna = texto(d.ordenExterna, 50);
  if (d.accesorios !== undefined) data.accesorios = texto(d.accesorios, 1000);
  if (d.notasInternas !== undefined) data.notasInternas = texto(d.notasInternas, 4000);
  if (d.validezDias !== undefined) data.validezDias = Math.min(365, Math.max(1, parseInt(String(d.validezDias), 10) || 15));
  return data;
}

async function validarCliente(db: Db, empresaId: string, clienteId: string | null | undefined) {
  if (!clienteId) return null;
  const c = await db.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { id: true } });
  if (!c) throw new ErrorServicio('Cliente no encontrado.');
  return c.id;
}

export async function crearOrden(empresaId: string, usuarioId: string | null, d: DatosOrden) {
  const cabecera = datosCabecera(d);
  if (!cabecera.clienteNombre) throw new ErrorServicio('Indicá el nombre del cliente.');
  if (!cabecera.equipoTipo) throw new ErrorServicio('Indicá qué equipo es (ej: tractor, motosierra).');
  if (!cabecera.fallaReportada) throw new ErrorServicio('Contá la falla que reporta el cliente.');

  for (let intento = 0; intento < 3; intento++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const clienteId = await validarCliente(tx, empresaId, d.clienteId);
        const items = d.items?.length ? await normalizarItems(tx, empresaId, d.items) : [];
        const [ultima, empresa] = await Promise.all([
          tx.ordenServicio.findFirst({ where: { empresaId }, orderBy: { numero: 'desc' }, select: { numero: true } }),
          tx.empresa.findUnique({ where: { id: empresaId }, select: { servicioNumeroDesde: true } }),
        ]);
        // Sigue la numeración del sistema anterior si se configuró un número inicial
        const numero = Math.max((ultima?.numero ?? 0) + 1, empresa?.servicioNumeroDesde ?? 1);
        const orden = await tx.ordenServicio.create({
          data: {
            ...(cabecera as Prisma.OrdenServicioUncheckedCreateInput),
            empresaId,
            numero,
            clienteId,
            estado: 'RECIBIDO',
            items: { create: items },
            eventos: { create: { estadoNuevo: 'RECIBIDO', detalle: 'Ingresó el equipo', usuarioId } },
          },
        });
        return orden;
      });
    } catch (e) {
      // Dos órdenes creadas a la vez pueden tomar el mismo número: se reintenta.
      if ((e as { code?: string }).code === 'P2002' && intento < 2) continue;
      throw e;
    }
  }
  throw new ErrorServicio('No se pudo numerar la orden. Probá de nuevo.');
}

export async function actualizarOrden(empresaId: string, id: string, usuarioId: string | null, d: DatosOrden) {
  return prisma.$transaction(async (tx) => {
    const orden = await ordenDeEmpresa(tx, empresaId, id);
    if (orden.estado === 'ENTREGADO') throw new ErrorServicio('La orden ya fue entregada y cobrada: no se puede modificar.');

    const data = datosCabecera(d);
    if (d.clienteId !== undefined) data.clienteId = await validarCliente(tx, empresaId, d.clienteId);
    if (data.clienteNombre === '') throw new ErrorServicio('Indicá el nombre del cliente.');
    if (data.equipoTipo === '') throw new ErrorServicio('Indicá qué equipo es.');
    if (data.fallaReportada === '') throw new ErrorServicio('Contá la falla que reporta el cliente.');

    let enNegativo: { nombre: string; stock: number }[] = [];
    if (d.items !== undefined) {
      const nuevos = await normalizarItems(tx, empresaId, d.items);
      // Si los repuestos ya estaban descontados, se descuenta o devuelve solo la diferencia.
      if (orden.stockDescontado) {
        const antes = consumo(orden.items);
        const despues = consumo(nuevos);
        const delta = new Map<string, number>();
        for (const k of new Set([...antes.keys(), ...despues.keys()])) delta.set(k, (despues.get(k) ?? 0) - (antes.get(k) ?? 0));
        enNegativo = await moverStock(tx, empresaId, delta);
        if ([...delta.values()].some((v) => Math.abs(v) > 0.0005)) {
          await tx.ordenServicioEvento.create({
            data: { ordenId: id, estadoAnterior: orden.estado, estadoNuevo: orden.estado, detalle: 'Cambiaron los repuestos: se ajustó el stock', usuarioId },
          });
        }
      }
      await tx.ordenServicioItem.deleteMany({ where: { ordenId: id } });
      if (nuevos.length) await tx.ordenServicioItem.createMany({ data: nuevos.map((n) => ({ ...n, ordenId: id })) });
    }
    await tx.ordenServicio.update({ where: { id }, data });
    return { enNegativo };
  });
}

export async function cambiarEstado(empresaId: string, id: string, usuarioId: string | null, nuevo: string, detalle?: string | null) {
  return prisma.$transaction(async (tx) => {
    const orden = await ordenDeEmpresa(tx, empresaId, id);
    const actual = orden.estado as EstadoServicio;
    const destino = nuevo as EstadoServicio;
    if (!transicionesDe(actual, orden.modalidad).includes(destino)) {
      throw new ErrorServicio(`No se puede pasar de "${infoEstado(actual).etiqueta}" a "${infoEstado(destino).etiqueta}".`);
    }
    if (destino === 'ENTREGADO' && orden.ventaId) throw new ErrorServicio('La orden ya fue cobrada.');
    if (destino === 'ENTREGADO' && orden.senaMonto.toNumber() > 0) {
      throw new ErrorServicio('La orden tiene una seña: cobrala en el POS (se descuenta la seña) o anulá la seña antes de entregarla sin cobrar.');
    }
    if (destino === 'COTIZADO' && orden.items.length === 0) {
      throw new ErrorServicio('Cargá el presupuesto (repuestos o mano de obra) antes de marcarla como cotizada.');
    }

    const necesitaStock = ESTADOS_CON_STOCK.includes(destino);
    const uso = consumo(orden.items);
    let enNegativo: { nombre: string; stock: number }[] = [];
    let notaStock = '';
    if (necesitaStock && !orden.stockDescontado && uso.size) {
      enNegativo = await moverStock(tx, empresaId, uso);
      notaStock = 'Se descontaron los repuestos del stock';
    } else if (!necesitaStock && orden.stockDescontado && uso.size) {
      await moverStock(tx, empresaId, new Map([...uso].map(([k, v]) => [k, -v])));
      notaStock = 'Los repuestos volvieron al stock';
    }

    // Evita que dos cambios simultáneos pisen el estado
    const r = await tx.ordenServicio.updateMany({
      where: { id, empresaId, estado: actual },
      data: { estado: destino, stockDescontado: necesitaStock ? true : false },
    });
    if (r.count !== 1) throw new ErrorServicio('La orden cambió mientras tanto. Recargá e intentá de nuevo.');

    await tx.ordenServicioEvento.create({
      data: {
        ordenId: id,
        estadoAnterior: actual,
        estadoNuevo: destino,
        detalle: [texto(detalle, 500), destino === 'ENTREGADO' ? (actual === 'SIN_REPARACION' ? 'Entregada sin reparar' : 'Entregada sin cargo (garantía)') : '', notaStock].filter(Boolean).join(' · ') || null,
        usuarioId,
      },
    });
    return { estado: destino, enNegativo, notaStock };
  });
}

/** Producto interno (oculto) que se usa para facturar mano de obra y otros cargos en el POS. */
export async function productoServicio(db: Db | typeof prisma, empresaId: string) {
  const existente = await db.producto.findFirst({ where: { empresaId, codigo: CODIGO_PRODUCTO_SERVICIO }, select: { id: true } });
  if (existente) return existente.id;
  const creado = await db.producto.create({
    data: {
      empresaId, codigo: CODIGO_PRODUCTO_SERVICIO, nombre: 'Servicio técnico', categoria: 'Servicio técnico', unidad: 'unidad',
      precioCosto: 0, precioVenta: 0, ivaPorcentaje: 21, stockActual: 0, stockMinimo: 0,
      activo: false, // no aparece en Stock, POS ni costos
    },
    select: { id: true },
  });
  return creado.id;
}

export type LineaCobro = {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  descontarStock: boolean;
};

/** Líneas para cobrar la orden en el POS, con los precios del presupuesto. */
export async function lineasParaCobro(empresaId: string, ordenId: string) {
  const orden = await prisma.ordenServicio.findFirst({ where: { id: ordenId, empresaId }, include: { items: { orderBy: { posicion: 'asc' } } } });
  if (!orden) throw new ErrorServicio('Orden de servicio no encontrada.');
  if (orden.ventaId) throw new ErrorServicio(`La orden N° ${orden.numero} ya fue cobrada.`);
  if (!(ESTADOS_COBRABLES as string[]).includes(orden.estado)) {
    throw new ErrorServicio(`La orden N° ${orden.numero} está "${infoEstado(orden.estado).etiqueta}": solo se cobran órdenes aceptadas.`);
  }
  if (!orden.items.length) throw new ErrorServicio('La orden no tiene ítems para cobrar.');
  const sena = orden.senaMonto.toNumber();
  const total = totalesServicio(orden.items.map((i) => ({ tipo: i.tipo, cantidad: i.cantidad.toNumber(), precioUnitario: i.precioUnitario.toNumber() }))).total;
  if (sena > total + 0.005) {
    throw new ErrorServicio(`La seña ($${sena.toLocaleString('es-AR')}) supera el total de la orden ($${total.toLocaleString('es-AR')}). Revisá el presupuesto o la seña.`);
  }

  const servicioId = orden.items.some((i) => i.tipo !== 'REPUESTO') ? await productoServicio(prisma, empresaId) : null;
  const lineas: LineaCobro[] = orden.items.map((i) => ({
    productoId: i.tipo === 'REPUESTO' && i.productoId ? i.productoId : (servicioId as string),
    nombre: i.descripcion,
    cantidad: i.cantidad.toNumber(),
    precioUnitario: i.precioUnitario.toNumber(),
    // Los repuestos se descontaron al aceptar; la mano de obra no tiene stock.
    descontarStock: i.tipo === 'REPUESTO' && !orden.stockDescontado,
  }));
  return { orden, lineas, sena };
}

/** Marca la orden como entregada y cobrada (se llama dentro de la transacción de la venta). */
export async function marcarEntregadaPorVenta(tx: Db, empresaId: string, ordenId: string, ventaId: string, usuarioId: string | null, comprobante: string) {
  const r = await tx.ordenServicio.updateMany({
    where: { id: ordenId, empresaId, ventaId: null },
    data: { estado: 'ENTREGADO', ventaId, stockDescontado: true },
  });
  if (r.count !== 1) throw new ErrorServicio('La orden ya fue cobrada.');
  await tx.ordenServicioEvento.create({
    data: { ordenId, estadoNuevo: 'ENTREGADO', detalle: `Cobrada en el POS · ${comprobante}`, usuarioId },
  });
}

function inicioDelDia(fecha = new Date()) {
  const dia = fecha.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  return new Date(`${dia}T00:00:00-03:00`);
}

async function diaCerrado(db: Db, empresaId: string, fecha: Date) {
  const z = await db.cierreCaja.findFirst({ where: { empresaId, tipo: 'Z', fecha: inicioDelDia(fecha) }, select: { id: true } });
  return !!z;
}

/**
 * Registra, cambia o anula (monto 0) la seña de una orden. La seña entra a la
 * caja del día (Cierre Z) y al cobrar en el POS se descuenta de lo que paga el
 * cliente. No se puede tocar si el Cierre Z de ese día ya se hizo.
 */
export async function registrarSena(empresaId: string, id: string, usuarioId: string | null, montoCrudo: unknown, formaPagoCruda: unknown) {
  const monto = Math.round(Number(String(montoCrudo ?? '').replace(/\D/g, '')) || 0);
  const formaPago = String(formaPagoCruda || 'Efectivo');
  if (monto > 0 && !(FORMAS_PAGO_SENA as readonly string[]).includes(formaPago)) throw new ErrorServicio('Elegí cómo pagó la seña.');

  return prisma.$transaction(async (tx) => {
    const orden = await ordenDeEmpresa(tx, empresaId, id);
    if (orden.ventaId || orden.estado === 'ENTREGADO') throw new ErrorServicio('La orden ya fue entregada: la seña no se puede cambiar.');
    if (['CANCELADO', 'NO_ACEPTADO'].includes(orden.estado) && monto > 0) throw new ErrorServicio('La orden no está activa.');
    const anterior = orden.senaMonto.toNumber();
    if (anterior === monto && (monto === 0 || orden.senaFormaPago === formaPago)) return { senaMonto: monto };
    if (anterior > 0 && orden.senaFecha && (await diaCerrado(tx, empresaId, orden.senaFecha))) {
      throw new ErrorServicio('La seña ya entró en un Cierre Z: no se puede cambiar. Si la devolvés, cargala como egreso.');
    }
    if (monto > 0 && (await diaCerrado(tx, empresaId, new Date()))) {
      throw new ErrorServicio('El Cierre Z de hoy ya se hizo: no se pueden registrar más cobros en esta jornada.');
    }
    await tx.ordenServicio.update({
      where: { id },
      data: monto > 0
        ? { senaMonto: monto, senaFormaPago: formaPago, senaFecha: new Date() }
        : { senaMonto: 0, senaFormaPago: null, senaFecha: null },
    });
    const pesos = (n: number) => `$${n.toLocaleString('es-AR')}`;
    await tx.ordenServicioEvento.create({
      data: {
        ordenId: id, estadoAnterior: orden.estado, estadoNuevo: orden.estado, usuarioId,
        detalle: monto > 0
          ? `${anterior > 0 ? 'Seña modificada' : 'Seña recibida'}: ${pesos(monto)} (${formaPago})`
          : `Seña anulada (era ${pesos(anterior)})`,
      },
    });
    return { senaMonto: monto };
  });
}
