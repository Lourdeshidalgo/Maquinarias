import { NextResponse, type NextRequest } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { importarClientes } from '@/lib/clientes/importacion';

// POST /api/tenant/clientes/importar { filas: unknown[][], simular?: boolean }
// Con simular=true solo analiza el archivo y devuelve el resumen; sin eso, carga los clientes.
export async function POST(req: NextRequest) {
  try {
    const empresaId = getTenantId(req);
    if (req.headers.get('x-user-rol') !== 'OWNER') {
      return NextResponse.json({ error: 'Solo el dueño puede importar clientes.' }, { status: 403 });
    }
    const { filas, simular } = await req.json();
    if (!Array.isArray(filas) || filas.length === 0) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
    if (filas.length > 50_000) return NextResponse.json({ error: 'El archivo tiene demasiadas filas (máximo 50.000).' }, { status: 400 });
    return NextResponse.json(await importarClientes(empresaId, filas, simular !== false));
  } catch (error) {
    console.error('Importar clientes:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo importar.' }, { status: 400 });
  }
}
