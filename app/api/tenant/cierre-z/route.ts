import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { armarArqueo } from '@/lib/arqueo';
import { getTenantId, requireUserId } from '@/lib/tenant';

const DEFAULT_MONTO_INICIAL = 10000;

function getBusinessDay(dateValue?: string) {
  const date = dateValue || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T23:59:59.999-03:00`);
  return { date, start, end };
}

function signedTotal(tipoComprobante: string, total: unknown) {
  const amount = Number(total);
  return tipoComprobante.startsWith('Nota de Crédito') ? -amount : amount;
}

function saleTotal(tipoComprobante: string, total: unknown) {
  return tipoComprobante.startsWith('Nota de Crédito') ? 0 : Number(total);
}

async function calculateCierre(empresaId: string, usuarioId: string | null, start: Date, end: Date, montoInicial: number) {
  const [ventas, egresos, senas] = await Promise.all([
    prisma.venta.findMany({
      where: {
        empresaId,
        ...(usuarioId ? { usuarioId } : {}),
        fecha: {
          gte: start,
          lte: end,
        },
        estado: {
          in: ['COMPLETADO', 'DEMO'],
        },
      },
      include: {
        cliente: true,
        ordenServicio: { select: { senaMonto: true } },
      },
      orderBy: { fecha: 'asc' },
    }),
    prisma.egresoCaja.findMany({
      where: {
        empresaId,
        ...(usuarioId ? { usuarioId } : {}),
        fecha: {
          gte: start,
          lte: end,
        },
      },
      include: {
        usuario: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: { fecha: 'asc' },
    }),
    // Señas de servicio técnico que entraron a la caja en el día
    prisma.ordenServicio.findMany({
      where: { empresaId, senaFecha: { gte: start, lte: end }, senaMonto: { gt: 0 } },
      select: { id: true, numero: true, clienteNombre: true, senaMonto: true, senaFormaPago: true, senaFecha: true },
      orderBy: { senaFecha: 'asc' },
    }),
  ]);

  // Una orden con seña se factura completa, pero en caja entra solo lo que faltaba
  // (la seña ya se contó el día que se cobró).
  const senaAplicada = (venta: (typeof ventas)[number]) =>
    venta.tipoComprobante.startsWith('Nota de Crédito') ? 0 : Math.min(Number(venta.ordenServicio?.senaMonto ?? 0), Number(venta.total));

  const porFormaPago = ventas.reduce<Record<string, number>>((acc, venta) => {
    acc[venta.formaPago] = (acc[venta.formaPago] || 0) + signedTotal(venta.tipoComprobante, venta.total) - senaAplicada(venta);
    return acc;
  }, {});
  for (const sena of senas) {
    const medio = sena.senaFormaPago || 'Efectivo';
    porFormaPago[medio] = (porFormaPago[medio] || 0) + Number(sena.senaMonto);
  }
  const senasTotal = senas.reduce((acc, sena) => acc + Number(sena.senaMonto), 0);

  const facturadoTotal = ventas.reduce((acc, venta) => acc + saleTotal(venta.tipoComprobante, venta.total), 0);
  const efectivoNeto = porFormaPago.Efectivo || 0;
  const egresosPorFormaPago = egresos.reduce<Record<string, number>>((acc, egreso) => {
    acc[egreso.formaPago] = (acc[egreso.formaPago] || 0) + Number(egreso.monto);
    return acc;
  }, {});
  const egresosTotal = egresos.reduce((acc, egreso) => acc + Number(egreso.monto), 0);
  const egresosEfectivo = egresosPorFormaPago.Efectivo || 0;

  return {
    montoInicial,
    facturadoTotal,
    efectivoNeto,
    egresosTotal,
    egresosEfectivo,
    totalCaja: montoInicial + efectivoNeto - egresosEfectivo,
    porFormaPago,
    egresosPorFormaPago,
    cantidadComprobantes: ventas.length,
    senasTotal,
    senas: senas.map((sena) => ({
      id: sena.id,
      numero: sena.numero,
      cliente: sena.clienteNombre,
      formaPago: sena.senaFormaPago || 'Efectivo',
      monto: Number(sena.senaMonto),
      fecha: sena.senaFecha,
    })),
    ventas: ventas.map((venta) => ({
      id: venta.id,
      fecha: venta.fecha,
      tipoComprobante: venta.tipoComprobante,
      puntoVenta: venta.puntoVenta,
      numeroComprobante: venta.numeroComprobante,
      formaPago: venta.formaPago,
      total: Number(venta.total),
      signedTotal: signedTotal(venta.tipoComprobante, venta.total),
      senaDescontada: senaAplicada(venta),
      cliente: venta.cliente.razonSocial,
    })),
    egresos: egresos.map((egreso) => ({
      id: egreso.id,
      fecha: egreso.fecha,
      proveedor: egreso.proveedor,
      categoria: egreso.categoria,
      concepto: egreso.concepto,
      formaPago: egreso.formaPago,
      monto: Number(egreso.monto),
      observacion: egreso.observacion,
      usuario: egreso.usuario.nombre,
    })),
  };
}

async function getOrCreateCaja(empresaId: string, usuarioId: string, fecha: Date) {
  return prisma.cajaDiaria.upsert({
    where: {
      empresaId_usuarioId_fecha: {
        empresaId,
        usuarioId,
        fecha,
      },
    },
    update: {},
    create: {
      empresaId,
      usuarioId,
      fecha,
      montoInicial: DEFAULT_MONTO_INICIAL,
    },
  });
}

function cierreConcepto(tipo: string) {
  if (tipo === 'X') {
    return 'Cierre X de control: corte parcial de caja para cambio o control de empleado, sin cerrar la jornada.';
  }

  return 'Cierre Z diario: total de comprobantes emitidos en el dia, discriminado por forma de pago y caja fisica esperada';
}

function toCierreResponse(cierre: any) {
  return {
    id: cierre.id,
    tipo: cierre.tipo,
    fecha: cierre.fecha,
    emitidoAt: cierre.emitidoAt,
    cerradoAt: cierre.tipo === 'Z' ? cierre.emitidoAt : null,
    concepto: cierre.concepto,
    montoInicial: Number(cierre.montoInicial),
    facturadoTotal: Number(cierre.facturadoTotal),
    efectivoNeto: Number(cierre.efectivoNeto),
    totalCaja: Number(cierre.totalCaja),
    cantidadComprobantes: cierre.cantidadComprobantes,
    detalle: cierre.detalle,
  };
}

async function ensureLegacyCierreZ(caja: any) {
  if (!caja.cerradoAt) return null;

  const existing = await prisma.cierreCaja.findFirst({
    where: {
      cajaDiariaId: caja.id,
      tipo: 'Z',
    },
  });

  if (existing) return existing;

  const detalle = (caja.detalle as any) || {
    montoInicial: Number(caja.montoInicial),
    facturadoTotal: Number(caja.facturadoTotal || 0),
    efectivoNeto: Number(caja.efectivoNeto || 0),
    egresosTotal: 0,
    egresosEfectivo: 0,
    totalCaja: Number(caja.totalCaja || 0),
    porFormaPago: {},
    egresosPorFormaPago: {},
    cantidadComprobantes: caja.cantidadComprobantes || 0,
    ventas: [],
    egresos: [],
  };

  return prisma.cierreCaja.create({
    data: {
      empresaId: caja.empresaId,
      usuarioId: caja.usuarioId,
      cajaDiariaId: caja.id,
      tipo: 'Z',
      fecha: caja.fecha,
      emitidoAt: caja.cerradoAt,
      concepto: caja.concepto || cierreConcepto('Z'),
      montoInicial: caja.montoInicial,
      facturadoTotal: caja.facturadoTotal || 0,
      efectivoNeto: caja.efectivoNeto || 0,
      totalCaja: caja.totalCaja || 0,
      cantidadComprobantes: caja.cantidadComprobantes || 0,
      detalle,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const usuarioId = requireUserId(req);
    const { searchParams } = new URL(req.url);
    const { date, start, end } = getBusinessDay(searchParams.get('fecha') || undefined);

    const caja = await getOrCreateCaja(empresaId, usuarioId, start);
    await ensureLegacyCierreZ(caja);
    const montoInicial = Number(caja.montoInicial);
    const calculated = await calculateCierre(empresaId, null, start, end, montoInicial);
    const cierres = await prisma.cierreCaja.findMany({
      where: {
        empresaId,
        fecha: start,
      },
      orderBy: { emitidoAt: 'desc' },
    });
    const cierreZ = cierres.find((cierre) => cierre.tipo === 'Z');
    const cierre = (cierreZ?.detalle as any) || calculated;

    return NextResponse.json({
      id: caja.id,
      fecha: date,
      cerrado: !!caja.cerradoAt,
      cerradoAt: caja.cerradoAt,
      concepto: caja.concepto,
      historial: cierres.map(toCierreResponse),
      ...cierre,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const usuarioId = requireUserId(req);
    const { fecha, montoInicial } = await req.json();
    const businessDay = getBusinessDay(fecha);
    const parsedMonto = Number(montoInicial);

    if (!Number.isFinite(parsedMonto) || parsedMonto < 0) {
      return NextResponse.json({ error: 'El monto inicial debe ser un número mayor o igual a cero.' }, { status: 400 });
    }

    const existing = await getOrCreateCaja(empresaId, usuarioId, businessDay.start);
    if (existing.cerradoAt) {
      return NextResponse.json({ error: 'El cierre Z de este día ya fue emitido y no puede modificarse.' }, { status: 400 });
    }

    const caja = await prisma.cajaDiaria.upsert({
      where: {
        empresaId_usuarioId_fecha: {
          empresaId,
          usuarioId,
          fecha: businessDay.start,
        },
      },
      update: {
        montoInicial: parsedMonto,
      },
      create: {
        empresaId,
        usuarioId,
        fecha: businessDay.start,
        montoInicial: parsedMonto,
      },
    });

    return NextResponse.json({ success: true, montoInicial: Number(caja.montoInicial) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const usuarioId = requireUserId(req);
    const { fecha, tipo = 'Z', arqueo: arqueoBody } = await req.json();
    const cierreTipo = String(tipo).toUpperCase();

    if (!['X', 'Z'].includes(cierreTipo)) {
      return NextResponse.json({ error: 'El tipo de cierre debe ser X o Z.' }, { status: 400 });
    }

    const businessDay = getBusinessDay(fecha);
    const caja = await getOrCreateCaja(empresaId, usuarioId, businessDay.start);
    const cierreZEmpresa = await prisma.cierreCaja.findFirst({
      where: {
        empresaId,
        fecha: businessDay.start,
        tipo: 'Z',
      },
    });

    if (cierreTipo === 'Z' && (caja.cerradoAt || cierreZEmpresa)) {
      return NextResponse.json({ error: 'El cierre Z de este día ya fue emitido.' }, { status: 400 });
    }

    if (cierreTipo === 'X' && (caja.cerradoAt || cierreZEmpresa)) {
      return NextResponse.json({ error: 'La caja ya tiene Cierre Z emitido. No se pueden emitir nuevos Cierres X para esta jornada.' }, { status: 400 });
    }

    const cierre = await calculateCierre(
      empresaId,
      null,
      businessDay.start,
      businessDay.end,
      Number(caja.montoInicial)
    );

    // Arqueo: lo contado por forma de pago contra lo esperado. Obligatorio en el
    // Cierre Z, opcional en el X. Se calcula acá con los montos del servidor.
    let arqueo = null;
    if (arqueoBody?.declarado) {
      arqueo = armarArqueo(cierre, arqueoBody.declarado, arqueoBody.observaciones);
      if (!arqueo) {
        return NextResponse.json({ error: 'Completá lo contado de efectivo, transferencias y tarjetas (0 si no hubo).' }, { status: 400 });
      }
    }
    if (cierreTipo === 'Z' && !arqueo) {
      return NextResponse.json({ error: 'Para emitir el Cierre Z tenés que cargar el arqueo de caja.' }, { status: 400 });
    }
    const detalleCierre = { ...cierre, arqueo };

    const concepto = cierreConcepto(cierreTipo);
    const emitidoAt = new Date();
    const comprobante = await prisma.$transaction(async (tx) => {
      const created = await tx.cierreCaja.create({
        data: {
          empresaId,
          usuarioId,
          cajaDiariaId: caja.id,
          tipo: cierreTipo,
          fecha: businessDay.start,
          emitidoAt,
          concepto,
          montoInicial: cierre.montoInicial,
          facturadoTotal: cierre.facturadoTotal,
          efectivoNeto: cierre.efectivoNeto,
          totalCaja: cierre.totalCaja,
          cantidadComprobantes: cierre.cantidadComprobantes,
          detalle: detalleCierre as any,
        },
      });

      if (cierreTipo === 'Z') {
        await tx.cajaDiaria.update({
          where: { id: caja.id },
          data: {
            cerradoAt: emitidoAt,
            concepto,
            facturadoTotal: cierre.facturadoTotal,
            efectivoNeto: cierre.efectivoNeto,
            totalCaja: cierre.totalCaja,
            cantidadComprobantes: cierre.cantidadComprobantes,
            detalle: detalleCierre as any,
          },
        });
      }

      return created;
    });

    return NextResponse.json({
      success: true,
      id: comprobante.id,
      tipo: comprobante.tipo,
      fecha: businessDay.date,
      cerrado: cierreTipo === 'Z',
      cerradoAt: cierreTipo === 'Z' ? comprobante.emitidoAt : null,
      emitidoAt: comprobante.emitidoAt,
      concepto: comprobante.concepto,
      ...cierre,
      arqueo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
