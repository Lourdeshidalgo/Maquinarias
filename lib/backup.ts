import { gzipSync } from 'zlib';
import { del, list, put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';

// Copia de seguridad de toda la base: cada tabla del esquema "public" se baja
// como JSON, se comprime y se guarda en el Blob privado del proyecto
// (backups/AAAA-MM-DD.json.gz). Se conservan las últimas DIAS_A_GUARDAR.
//
// Para restaurar: bajar el archivo (vercel blob get backups/AAAA-MM-DD.json.gz),
// ver qué tiene con scripts/verificar-backup.mjs (--guardar la deja en disco).

const PREFIJO = process.env.BACKUP_PREFIJO || 'backups/'; // otro prefijo solo para pruebas
export const DIAS_A_GUARDAR = 30;

export type ResultadoBackup = { archivo: string; tablas: number; filas: number; bytes: number; borrados: number };

export async function hacerBackup(): Promise<ResultadoBackup> {
  const tablas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY table_name`;

  const datos: Record<string, unknown[]> = {};
  let filas = 0;
  for (const { table_name } of tablas) {
    // El nombre sale del catálogo de la base, no de un usuario
    const registros = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table_name.replace(/"/g, '""')}"`);
    datos[table_name] = registros;
    filas += registros.length;
  }

  const contenido = JSON.stringify(
    { creado: new Date().toISOString(), version: 1, tablas: datos },
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
  );
  const comprimido = gzipSync(Buffer.from(contenido));
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const archivo = `${PREFIJO}${dia}.json.gz`;
  await put(archivo, comprimido, { access: 'private', contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: true });

  // Retención: borrar las más viejas
  const { blobs } = await list({ prefix: PREFIJO, limit: 1000 });
  const viejos = blobs
    .sort((a, b) => b.pathname.localeCompare(a.pathname))
    .slice(DIAS_A_GUARDAR)
    .map((b) => b.url);
  if (viejos.length) await del(viejos);

  return { archivo, tablas: tablas.length, filas, bytes: comprimido.length, borrados: viejos.length };
}
