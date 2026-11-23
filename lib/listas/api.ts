import { NextResponse, type NextRequest } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { bloquearSinModuloCostos } from '@/lib/modulos';
import { ErrorImportacion } from '@/lib/listas/importacion';

// Envoltorio común de las rutas del módulo de listas: resuelve la empresa,
// corta con 403 si el módulo no está activo y traduce los errores.
export async function rutaModuloCostos(
  req: NextRequest,
  handler: (empresaId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const empresaId = getTenantId(req);
    const bloqueo = await bloquearSinModuloCostos(empresaId);
    if (bloqueo) return bloqueo;
    return await handler(empresaId);
  } catch (error) {
    if (error instanceof ErrorImportacion) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Módulo de costos:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error inesperado.' }, { status: 500 });
  }
}
