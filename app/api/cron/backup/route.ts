import { NextResponse, type NextRequest } from 'next/server';
import { hacerBackup } from '@/lib/backup';

// Copia de seguridad diaria. La llama el cron de Vercel (vercel.json) con
// "Authorization: Bearer <CRON_SECRET>"; sin ese secreto no responde.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  try {
    const r = await hacerBackup();
    console.log('Backup OK', r);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    console.error('Backup falló:', error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
