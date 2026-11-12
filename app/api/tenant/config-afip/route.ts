import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const config = await prisma.configuracionAfip.findUnique({
      where: { empresaId },
    });

    if (!config) {
      return NextResponse.json({
        exists: false,
        modo: 'demo',
        puntoVenta: 1,
        cuit: '',
        razonSocial: '',
        condicionIva: 'Responsable Inscripto',
        hasCert: false,
        montoIdentificacion: 10000000,
      });
    }

    return NextResponse.json({
      exists: true,
      id: config.id,
      cuit: config.cuit,
      razonSocial: config.razonSocial,
      condicionIva: config.condicionIva,
      puntoVenta: config.puntoVenta,
      modo: config.modo,
      hasCert: !!config.certificadoEncriptado,
      montoIdentificacion: config.montoIdentificacion.toNumber(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    const { cuit, razonSocial, condicionIva, puntoVenta, modo, certificado, clavePrivada, montoIdentificacion } = await req.json();
    const umbral = montoIdentificacion === undefined || montoIdentificacion === ''
      ? undefined
      : Math.max(0, parseFloat(montoIdentificacion) || 0);

    if (!cuit || !razonSocial || !condicionIva || !puntoVenta || !modo) {
      return NextResponse.json({ error: 'Faltan campos obligatorios para configurar AFIP.' }, { status: 400 });
    }

    // Load existing config
    const existing = await prisma.configuracionAfip.findUnique({
      where: { empresaId },
    });

    let certificadoEncriptado = existing?.certificadoEncriptado || null;
    let claveEncriptada = existing?.claveEncriptada || null;
    let iv = existing?.iv || null;

    if (certificado && clavePrivada) {
      const encCert = encrypt(certificado);
      const encKey = encrypt(clavePrivada);
      certificadoEncriptado = encCert.encrypted;
      claveEncriptada = encKey.encrypted;
      iv = `${encCert.iv}:${encKey.iv}`;
    }

    await prisma.configuracionAfip.upsert({
      where: { empresaId },
      update: {
        cuit,
        razonSocial,
        condicionIva,
        puntoVenta: parseInt(puntoVenta, 10) || 1,
        modo,
        certificadoEncriptado,
        claveEncriptada,
        iv,
        ...(umbral !== undefined && { montoIdentificacion: umbral }),
      },
      create: {
        empresaId,
        cuit,
        razonSocial,
        condicionIva,
        puntoVenta: parseInt(puntoVenta, 10) || 1,
        modo,
        certificadoEncriptado,
        claveEncriptada,
        iv,
        ...(umbral !== undefined && { montoIdentificacion: umbral }),
      },
    });

    // Also update the company's CUIT and name to match AFIP config for consistency
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        cuit,
        nombre: razonSocial,
        condicionIva,
      },
    });

    return NextResponse.json({ success: true, message: 'Configuración de AFIP guardada correctamente.' });
  } catch (error: any) {
    console.error('AFIP config error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
