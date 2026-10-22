import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, requireUserId } from '@/lib/tenant';

function getBusinessDay(dateValue?: string) {
  const date = dateValue || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T23:59:59.999-03:00`);
  return { date, start, end };
}

function getRange(periodo: string, desde?: string | null, hasta?: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

  if (periodo === 'personalizado' && desde && hasta) {
    return {
      start: new Date(`${desde}T00:00:00-03:00`),
      end: new Date(`${hasta}T23:59:59.999-03:00`),
    };
  }

  // Por defecto: período desde/hoy (histórico)
  let start: Date;
  const end = new Date(`${today}T23:59:59.999-03:00`);

  if (periodo === 'hoy') {
    start = new Date(`${today}T00:00:00-03:00`);
  } else if (periodo === 'semana') {
    start = new Date(`${today}T00:00:00-03:00`);
    start.setDate(start.getDate() - 7);
  } else if (periodo === 'mes') {
    start = new Date(`${today}T00:00:00-03:00`);
    start.setDate(start.getDate() - 30);
  } else if (periodo === 'todos') {
    start = new Date(`${today}T00:00:00-03:00`);
    start.setFullYear(start.getFullYear() - 50);
  } else {
    // Default 'hoy'
    start = new Date(`${today}T00:00:00-03:00`);
  }

  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);
    const periodo = searchParams.get('periodo') || 'hoy';

    const { start, end } = getRange(periodo, searchParams.get('desde'), searchParams.get('hasta'));

    const egresos = await prisma.egresoCaja.findMany({
      where: {
        empresaId,
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
      orderBy: { fecha: 'desc' },
    });

    return NextResponse.json(egresos.map((egreso) => ({
      ...egreso,
      monto: Number(egreso.monto),
    })));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const usuarioId = requireUserId(req);
    const { fecha, proveedor, categoria, concepto, formaPago, monto, observacion, costosAsignados } = await req.json();
    const parsedMonto = Number(monto);

    if (!proveedor || !categoria || !concepto || !formaPago) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: proveedor, categoría, concepto y forma de pago.' }, { status: 400 });
    }

    if (!Number.isFinite(parsedMonto) || parsedMonto <= 0) {
      return NextResponse.json({ error: 'El monto del egreso debe ser mayor a cero.' }, { status: 400 });
    }

    // Asignaciones manuales de costo por producto (solo para mercadería)
    const asignaciones: { productoId: string; cantidad: number }[] = Array.isArray(costosAsignados)
      ? costosAsignados
          .map((a: any) => ({ productoId: String(a.productoId || ''), cantidad: Number(a.cantidad) }))
          .filter((a) => a.productoId && Number.isFinite(a.cantidad) && a.cantidad > 0)
      : [];

    if (asignaciones.length) {
      const totalCantidad = asignaciones.reduce((acc, a) => acc + a.cantidad, 0);
      // Validar que los productos existan en el comercio
      const ids = asignaciones.map((a) => a.productoId);
      const prodExistentes = await prisma.producto.findMany({ where: { id: { in: ids }, empresaId }, select: { id: true } });
      if (prodExistentes.length !== new Set(ids).size) {
        return NextResponse.json({ error: 'Algún producto asignado no pertenece a tu comercio.' }, { status: 400 });
      }
      if (totalCantidad <= 0) {
        return NextResponse.json({ error: 'La cantidad total asignada debe ser mayor a cero.' }, { status: 400 });
      }
    }

    const businessDay = getBusinessDay(fecha);
    const cierreZ = await prisma.cierreCaja.findFirst({
      where: {
        empresaId,
        fecha: businessDay.start,
        tipo: 'Z',
      },
    });

    if (cierreZ) {
      return NextResponse.json({ error: 'La caja ya tiene Cierre Z emitido. No se pueden registrar egresos en esta jornada.' }, { status: 403 });
    }

    const egreso = await prisma.$transaction(async (tx) => {
      const creado = await tx.egresoCaja.create({
        data: {
          empresaId,
          usuarioId,
          fecha: fecha ? new Date(`${fecha}T12:00:00-03:00`) : new Date(),
          proveedor,
          categoria,
          concepto,
          formaPago,
          monto: parsedMonto,
          observacion: observacion || '',
        },
        include: {
          usuario: {
            select: {
              nombre: true,
              email: true,
            },
          },
        },
      });

      if (asignaciones.length) {
        // Costo unitario = monto total del egreso dividido por la cantidad total comprada.
        // Se asigna a cada producto y se actualiza su precio de costo en el catálogo.
        const totalCantidad = asignaciones.reduce((acc, a) => acc + a.cantidad, 0);
        const costoUnitario = parsedMonto / totalCantidad;

        for (const a of asignaciones) {
          const montoAsignado = costoUnitario * a.cantidad;
          await tx.egresoCostoAsignacion.create({
            data: {
              empresaId,
              egresoId: creado.id,
              productoId: a.productoId,
              cantidad: a.cantidad,
              costoUnitario,
              montoTotal: montoAsignado,
            },
          });
          await tx.producto.update({
            where: { id: a.productoId },
            data: { precioCosto: costoUnitario },
          });
        }
      }

      return creado;
    });

    return NextResponse.json({ ...egreso, monto: Number(egreso.monto) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
