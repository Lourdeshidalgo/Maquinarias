import { NextResponse, type NextRequest } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { ErrorServicio } from '@/lib/servicio/ordenes';

// Envoltorio de las rutas de servicio técnico: empresa activa y errores claros.
export async function rutaServicio(req: NextRequest, handler: (empresaId: string) => Promise<NextResponse>) {
  try {
    return await handler(getTenantId(req));
  } catch (error) {
    if (error instanceof ErrorServicio) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Servicio técnico:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error inesperado.' }, { status: 500 });
  }
}
