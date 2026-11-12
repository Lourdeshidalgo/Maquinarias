import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitirFactura } from '@/lib/afip';
import { requiereIdentificacion, mensajeIdentificacion } from '@/lib/identificacion';
import { getTenantId, getUserId } from '@/lib/tenant';

function getBusinessDay(date = new Date()) {
  const day = date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const start = new Date(`${day}T00:00:00-03:00`);
  const end = new Date(`${day}T23:59:59.999-03:00`);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { searchParams } = new URL(req.url);

    // Paginación opcional. Si el cliente manda ?page=, devolvemos una página con
    // metadatos. Si no, mantenemos el comportamiento viejo (array completo) para
    // no romper a los consumidores que ya lo usan (panel, cierre z).
    const pageParam = searchParams.get('page');
    const paginado = pageParam !== null;

    if (!paginado) {
      const ventas = await prisma.venta.findMany({
        where: { empresaId },
        include: {
          cliente: true,
          items: true,
        },
        orderBy: { fecha: 'desc' },
      });
      return NextResponse.json(ventas);
    }

    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const estado = searchParams.get('estado') || '';
    const search = (searchParams.get('search') || '').trim();
    const soloNotasCredito = searchParams.get('soloNotasCredito') === '1';
    const soloFacturasOrigen = searchParams.get('soloFacturasOrigen') === '1';

    const where: any = { empresaId };
    if (soloNotasCredito) {
      // Las notas de crédito se usan para calcular montos ya acreditados de cada
      // factura; se traen aparte para que la lista principal pueda paginarse.
      where.tipoComprobante = { startsWith: 'Nota de Crédito' };
    }
    if (soloFacturasOrigen) {
      // Facturas fiscales emitidas a demanda desde un Ticket X: se usan para
      // saber qué tickets ya fueron facturados, sin traer todo el historial.
      where.ventaOrigenId = { not: null };
    }
    if (estado && estado !== 'TODOS') where.estado = estado;
    // Búsqueda por cliente, documento, tipo de comprobante o nro. de comprobante.
    if (search) {
      const numero = parseInt(search, 10);
      where.OR = [
        { cliente: { razonSocial: { contains: search, mode: 'insensitive' } } },
        { cliente: { nroDoc: { contains: search } } },
        { tipoComprobante: { contains: search, mode: 'insensitive' } },
        ...(Number.isFinite(numero) ? [{ numeroComprobante: numero }] : []),
      ];
    }

    const [total, ventas] = await Promise.all([
      prisma.venta.count({ where }),
      prisma.venta.findMany({
        where,
        include: {
          cliente: true,
          items: true,
        },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Totales de TODO el conjunto filtrado (no solo de la página), para que las
    // tarjetas de resumen sigan mostrando el total real aunque la tabla pagine.
    const todos = await prisma.venta.findMany({
      where,
      select: { tipoComprobante: true, total: true, estado: true },
    });
    let totalFacturado = 0;
    for (const v of todos) {
      if (v.estado === 'RECHAZADO_AFIP') continue;
      const monto = Number(v.total) || 0;
      totalFacturado += v.tipoComprobante.startsWith('Nota de Crédito') ? -monto : monto;
    }

    return NextResponse.json({
      items: ventas,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totals: {
        count: total,
        total: Math.round(totalFacturado * 100) / 100,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const usuarioId = getUserId(req);

    if (usuarioId) {
      const { start } = getBusinessDay();
      const [cajaCerrada, cierreZEmitido] = await Promise.all([
        prisma.cajaDiaria.findUnique({
          where: {
            empresaId_usuarioId_fecha: {
              empresaId,
              usuarioId,
              fecha: start,
            },
          },
        }),
        prisma.cierreCaja.findFirst({
          where: {
            empresaId,
            fecha: start,
            tipo: 'Z',
          },
        }),
      ]);

      if (cajaCerrada?.cerradoAt || cierreZEmitido) {
        return NextResponse.json(
          { error: 'La caja de hoy ya tiene Cierre Z emitido. No se pueden registrar más ventas en esta jornada.' },
          { status: 403 }
        );
      }
    }

    // 1. Load company and subscription details to verify limits
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      include: {
        suscripcion: {
          include: {
            plan: true,
          },
        },
        configAfip: true,
      },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
    }

    if (empresa.estado !== 'ACTIVO') {
      return NextResponse.json(
        { error: 'Su comercio está suspendido o tiene pagos pendientes de suscripción.' },
        { status: 403 }
      );
    }

    const suscripcion = empresa.suscripcion;
    if (!suscripcion || new Date() > new Date(suscripcion.fechaVencimiento)) {
      return NextResponse.json(
        { error: 'Su suscripción ha vencido. Por favor, realice el pago para continuar operando.' },
        { status: 403 }
      );
    }

    // 2. Check Monthly Sales Limit
    const plan = suscripcion.plan;
    if (plan.limiteVentasMensuales > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const salesCount = await prisma.venta.count({
        where: {
          empresaId,
          fecha: { gte: startOfMonth },
          estado: { in: ['COMPLETADO', 'DEMO'] },
        },
      });

      if (salesCount >= plan.limiteVentasMensuales) {
        return NextResponse.json(
          {
            error: `Ha superado el límite de ventas mensuales de su plan (${plan.limiteVentasMensuales} ventas). Por favor, actualice su plan.`,
          },
          { status: 403 }
        );
      }
    }

    // Parse input
    const { clienteId, formaPago, items, tipoComprobante: manualTipoComprobante, datosFacturacion, descuentoTicket } = await req.json();

    if (!clienteId || !formaPago || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Faltan campos obligatorios para registrar la venta.' }, { status: 400 });
    }

    // 3. Load client info
    let cliente: any = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente || cliente.empresaId !== empresaId) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
    }

    const tiposFacturaManual = ['Factura A', 'Factura B', 'Factura C'];
    if (tiposFacturaManual.includes(manualTipoComprobante)) {
      if (!datosFacturacion?.tipoDoc || !datosFacturacion?.nroDoc || !datosFacturacion?.razonSocial || !datosFacturacion?.condicionIva) {
        return NextResponse.json(
          { error: 'Para Factura A/B/C tenés que completar tipo de documento, número, razón social y condición IVA.' },
          { status: 400 }
        );
      }

      if (manualTipoComprobante === 'Factura A' && (datosFacturacion.tipoDoc !== 'CUIT' || datosFacturacion.condicionIva !== 'Responsable Inscripto')) {
        return NextResponse.json(
          { error: 'Para Factura A el receptor debe tener CUIT y condición IVA Responsable Inscripto.' },
          { status: 400 }
        );
      }

      if (manualTipoComprobante === 'Factura C' && empresa.condicionIva !== 'Monotributista') {
        return NextResponse.json(
          { error: 'La Factura C corresponde a emisores Monotributistas.' },
          { status: 400 }
        );
      }

      const normalizedDoc = String(datosFacturacion.nroDoc).replace(/\D/g, '') || String(datosFacturacion.nroDoc).trim();
      // Si ya existe (incluido el "Consumidor Final Genérico", 99/0) se reutiliza:
      // crearlo de nuevo choca con el único (empresa, tipoDoc, nroDoc).
      const existingCliente = await prisma.cliente.findFirst({
        where: {
          empresaId,
          tipoDoc: datosFacturacion.tipoDoc,
          nroDoc: normalizedDoc,
        },
      });

      cliente = existingCliente || await prisma.cliente.create({
        data: {
          empresaId,
          tipoDoc: datosFacturacion.tipoDoc,
          nroDoc: normalizedDoc,
          razonSocial: datosFacturacion.razonSocial,
          condicionIva: datosFacturacion.condicionIva,
          direccion: datosFacturacion.direccion || '',
          email: datosFacturacion.email || '',
          telefono: '',
          saldoCuentaCorriente: 0,
        },
      });
    }

    // 4. Load products and check stock
    const productIds = items.map((i: any) => i.productoId);
    const dbProducts = await prisma.producto.findMany({
      where: {
        id: { in: productIds },
        empresaId,
      },
    });

    if (dbProducts.length !== items.length) {
      return NextResponse.json({ error: 'Algunos productos del carrito no existen en su stock.' }, { status: 400 });
    }

    // Validate quantities, apply per-item discounts, compute gross totals
    const dbProductsMap = new Map(dbProducts.map((p) => [p.id, p]));
    const rawItems: {
      productoId: string;
      nombre: string;
      cantidad: number;
      talle: string | null; // Talle vendido (opcional), para estadísticas
      ivaPorcentaje: number;
      costoUnitario: number; // Costo congelado (compra + packaging + envío) por unidad
      grossItemTotal: number; // Antes de cualquier descuento
      afterItemDiscount: number; // Después del descuento por ítem, antes del descuento de ticket
    }[] = [];

    for (const item of items) {
      const prod = dbProductsMap.get(item.productoId);
      if (!prod) continue;

      const qty = parseFloat(item.cantidad);
      if (isNaN(qty) || qty <= 0) {
        return NextResponse.json({ error: `Cantidad inválida para el producto ${prod.nombre}.` }, { status: 400 });
      }

      // Check stock limit
      const stock = prod.stockActual.toNumber();
      if (stock < qty) {
        return NextResponse.json(
          { error: `Stock insuficiente para ${prod.nombre}. Disponible: ${stock} ${prod.unidad}.` },
          { status: 400 }
        );
      }

      const catalogPrecioUnitario = prod.unidad === 'g' ? prod.precioVenta.toNumber() / 1000 : prod.precioVenta.toNumber();
      const grossItemTotal = qty * catalogPrecioUnitario;

      const itemDescuentoPct = Math.min(100, Math.max(0, parseFloat(item.descuentoPorcentaje) || 0));
      const afterItemDiscount = grossItemTotal * (1 - itemDescuentoPct / 100);

      rawItems.push({
        productoId: prod.id,
        nombre: prod.nombre,
        cantidad: qty,
        talle: item.talle ? String(item.talle).trim() : null,
        ivaPorcentaje: prod.ivaPorcentaje.toNumber(),
        costoUnitario:
          prod.precioCosto.toNumber() +
          prod.costoPackaging.toNumber() +
          prod.costoEnvio.toNumber(),
        grossItemTotal,
        afterItemDiscount,
      });
    }

    const grossTotal = rawItems.reduce((acc, i) => acc + i.grossItemTotal, 0);
    const subtotalPreTicket = rawItems.reduce((acc, i) => acc + i.afterItemDiscount, 0);

    // Descuento adicional sobre el total del ticket (% o monto fijo)
    let ticketDiscountAmount = 0;
    if (descuentoTicket?.tipo === 'PORCENTAJE') {
      const pct = Math.min(100, Math.max(0, parseFloat(descuentoTicket.valor) || 0));
      ticketDiscountAmount = subtotalPreTicket * (pct / 100);
    } else if (descuentoTicket?.tipo === 'MONTO') {
      const monto = Math.max(0, parseFloat(descuentoTicket.valor) || 0);
      ticketDiscountAmount = Math.min(monto, subtotalPreTicket);
    }

    // Distribuir el descuento de ticket proporcionalmente entre los ítems, para
    // que la suma de los ítems (que es lo que se manda a AFIP) cierre exacto
    // con el total final. El último ítem absorbe el resto del redondeo.
    let totalVenta = 0;
    const invoiceItems: any[] = [];
    rawItems.forEach((item, idx) => {
      const share = subtotalPreTicket > 0 ? item.afterItemDiscount / subtotalPreTicket : 0;
      let finalItemTotal = item.afterItemDiscount - ticketDiscountAmount * share;
      finalItemTotal = Math.round(finalItemTotal * 100) / 100;

      if (idx === rawItems.length - 1) {
        // Ajuste de redondeo: que la suma final cierre exacto con el total objetivo.
        const targetTotal = Math.round((subtotalPreTicket - ticketDiscountAmount) * 100) / 100;
        const sumSoFar = invoiceItems.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
        finalItemTotal = Math.round((targetTotal - sumSoFar) * 100) / 100;
      }

      const finalPrecioUnitario = finalItemTotal / item.cantidad;
      const descuentoPorcentaje = item.grossItemTotal > 0
        ? Math.round((1 - finalItemTotal / item.grossItemTotal) * 10000) / 100
        : 0;

      totalVenta += finalItemTotal;
      invoiceItems.push({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        talle: item.talle,
        precioUnitario: finalPrecioUnitario,
        costoUnitario: item.costoUnitario,
        ivaPorcentaje: item.ivaPorcentaje,
        descuentoPorcentaje,
      });
    });

    const descuentoTotalMonto = Math.max(0, Math.round((grossTotal - totalVenta) * 100) / 100);

    // 5. Check Credit Limit for Cuenta Corriente
    if (formaPago === 'Cuenta Corriente') {
      const currentDebt = cliente.saldoCuentaCorriente.toNumber();
      const maxCredit = cliente.limiteCredito ? cliente.limiteCredito.toNumber() : null;

      if (maxCredit !== null && currentDebt + totalVenta > maxCredit) {
        return NextResponse.json(
          {
            error: `Límite de crédito superado. Deuda actual: $${currentDebt.toFixed(
              2
            )}, Compra: $${totalVenta.toFixed(2)}, Límite: $${maxCredit.toFixed(2)}.`,
          },
          { status: 400 }
        );
      }
    }

    // 6. Determine Invoice Type (Fiscal A/B/C or Manual Non-Fiscal X)
    let tipoComprobante: 'Factura A' | 'Factura B' | 'Factura C' | 'Factura X' = 'Factura B';
    if (tiposFacturaManual.includes(manualTipoComprobante)) {
      tipoComprobante = manualTipoComprobante;
    } else if (manualTipoComprobante === 'Factura X') {
      tipoComprobante = 'Factura X';
    } else if (empresa.condicionIva === 'Monotributista') {
      tipoComprobante = 'Factura C';
    } else if (empresa.condicionIva === 'Responsable Inscripto') {
      if (cliente.condicionIva === 'Responsable Inscripto') {
        tipoComprobante = 'Factura A';
      } else {
        tipoComprobante = 'Factura B';
      }
    }

    // ARCA rechaza facturas grandes a consumidor final sin identificar.
    const umbralIdentificacion = empresa.configAfip ? empresa.configAfip.montoIdentificacion.toNumber() : 0;
    if (requiereIdentificacion({ tipoComprobante, tipoDoc: cliente.tipoDoc, total: totalVenta, umbral: umbralIdentificacion })) {
      return NextResponse.json({ error: mensajeIdentificacion(umbralIdentificacion) }, { status: 400 });
    }

    // Desglose de impuestos (neto + IVA) calculado a partir de los ítems reales.
    // Factura C (monotributo) no discrimina IVA: el total es el neto. Para el
    // resto se calcula hacia atrás según la alícuota de cada ítem (21 / 10,5 / 0).
    let taxSubtotal = 0;
    let taxIva = 0;
    if (tipoComprobante === 'Factura C') {
      taxSubtotal = totalVenta;
      taxIva = 0;
    } else {
      for (const item of invoiceItems) {
        const itemTotal = item.cantidad * item.precioUnitario;
        const rate = item.ivaPorcentaje === 10.5 ? 1.105 : item.ivaPorcentaje === 0 ? 1 : 1.21;
        const net = itemTotal / rate;
        taxSubtotal += net;
        taxIva += itemTotal - net;
      }
    }
    taxSubtotal = Math.round(taxSubtotal * 100) / 100;
    taxIva = Math.round(taxIva * 100) / 100;

    // 7. Initialize AFIP setup
    const configAfip = empresa.configAfip;
    if (!configAfip) {
      return NextResponse.json({ error: 'La configuración de AFIP del comercio no existe.' }, { status: 400 });
    }

    // Execute AFIP Web Service authorization
    const afipResult = await emitirFactura({
      empresaId,
      cuitEmisor: configAfip.cuit,
      razonSocialEmisor: configAfip.razonSocial,
      condicionIvaEmisor: configAfip.condicionIva as any,
      puntoVenta: configAfip.puntoVenta,
      tipoComprobante,
      clienteTipoDoc: cliente.tipoDoc,
      clienteNroDoc: cliente.nroDoc,
      clienteCondicionIva: cliente.condicionIva,
      items: invoiceItems.map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        ivaPorcentaje: i.ivaPorcentaje,
      })),
      modo: configAfip.modo as any,
      certificadoEncriptado: configAfip.certificadoEncriptado,
      claveEncriptada: configAfip.claveEncriptada,
      iv: configAfip.iv,
    });

    // 8. Handle Rejection from AFIP
    if (afipResult.estado === 'RECHAZADO_AFIP') {
      // Reemplazar el rechazo anterior del mismo comprobante para no violar la unicidad (N° 0)
      await prisma.venta.deleteMany({
        where: {
          empresaId,
          tipoComprobante,
          puntoVenta: configAfip.puntoVenta,
          numeroComprobante: 0,
          estado: 'RECHAZADO_AFIP',
        },
      });

      // Save rejected sale history for auditing
      await prisma.venta.create({
        data: {
          empresaId,
          usuarioId,
          clienteId: cliente.id,
          tipoComprobante,
          puntoVenta: configAfip.puntoVenta,
          numeroComprobante: 0,
          subtotal: taxSubtotal,
          iva: taxIva,
          total: totalVenta,
          descuentoTotal: descuentoTotalMonto,
          formaPago,
          estado: 'RECHAZADO_AFIP',
          mensajeAfip: afipResult.mensajeAfip,
        },
      });

      return NextResponse.json(
        {
          error: `AFIP rechazó el comprobante: ${afipResult.mensajeAfip}`,
          status: 'RECHAZADO_AFIP',
        },
        { status: 422 }
      );
    }

    // 9. Assign numbering if in internal demo mode
    let finalVoucherNumber = afipResult.numeroComprobante;
    if (afipResult.estado === 'DEMO') {
      // Find last number locally and increment
      const lastLocalSale = await prisma.venta.findFirst({
        where: {
          empresaId,
          tipoComprobante,
          puntoVenta: configAfip.puntoVenta,
        },
        orderBy: { numeroComprobante: 'desc' },
      });
      finalVoucherNumber = lastLocalSale ? lastLocalSale.numeroComprobante + 1 : 1;
    }

    // 10. Perform DB transaction (Save Sale, Deduct Stock, Update CC if needed)
    const result = await prisma.$transaction(async (tx) => {
      // 10.1 Deduct stock
      for (const item of invoiceItems) {
        await tx.producto.update({
          where: { id: item.productoId },
          data: {
            stockActual: { decrement: item.cantidad },
          },
        });
      }

      // 10.2 Create Sale record
      const sale = await tx.venta.create({
        data: {
          empresaId,
          usuarioId,
          clienteId: cliente.id,
          tipoComprobante,
          puntoVenta: configAfip.puntoVenta,
          numeroComprobante: finalVoucherNumber,
          subtotal: taxSubtotal,
          iva: taxIva,
          total: totalVenta,
          descuentoTotal: descuentoTotalMonto,
          formaPago,
          estado: afipResult.estado,
          cae: afipResult.cae,
          caeVencimiento: afipResult.caeVencimiento,
          mensajeAfip: afipResult.mensajeAfip,
          items: {
            create: invoiceItems.map((i) => ({
              productoId: i.productoId,
              productoName: i.nombre,
              cantidad: i.cantidad,
              talle: i.talle || null,
              precioUnitario: i.precioUnitario,
              costoUnitario: i.costoUnitario,
              subtotal: i.cantidad * i.precioUnitario,
              descuentoPorcentaje: i.descuentoPorcentaje > 0 ? i.descuentoPorcentaje : null,
            })),
          },
        },
        include: {
          items: true,
          cliente: true,
        },
      });

      // 10.3 Update current account if sold on credit
      if (formaPago === 'Cuenta Corriente') {
        const clientAfterUpdate = await tx.cliente.update({
          where: { id: cliente.id },
          data: {
            saldoCuentaCorriente: { increment: totalVenta },
          },
        });

        // Log cc movement
        await tx.movimientoCuentaCorriente.create({
          data: {
            empresaId,
            clienteId: cliente.id,
            tipo: 'DEBE',
            concepto: `${tipoComprobante} Nº ${configAfip.puntoVenta.toString().padStart(4, '0')}-${finalVoucherNumber
              .toString()
              .padStart(8, '0')}`,
            importe: totalVenta,
            ventaId: sale.id,
            saldoResultante: clientAfterUpdate.saldoCuentaCorriente,
          },
        });
      }

      return sale;
    });

    return NextResponse.json({
      success: true,
      venta: result,
    });
  } catch (error: any) {
    console.error('POS Checkout error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
