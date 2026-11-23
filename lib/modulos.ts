import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Módulos opcionales por empresa. Los activa el ROOT desde el panel de
// empresas; las empresas que no los tienen no ven las pantallas ni pueden
// llamar a sus APIs.

/** true si la empresa tiene activo el módulo "Costos y listas de proveedores". */
export async function tieneModuloCostos(empresaId: string): Promise<boolean> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { moduloCostos: true },
  });
  return !!empresa?.moduloCostos;
}

/**
 * Para usar al principio de cada endpoint del módulo de costos:
 *   const bloqueo = await bloquearSinModuloCostos(empresaId);
 *   if (bloqueo) return bloqueo;
 */
export async function bloquearSinModuloCostos(empresaId: string): Promise<NextResponse | null> {
  if (await tieneModuloCostos(empresaId)) return null;
  return NextResponse.json(
    { error: 'El módulo de costos y listas de proveedores no está habilitado para este comercio.' },
    { status: 403 }
  );
}
