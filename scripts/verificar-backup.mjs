// Baja una copia de seguridad del Blob privado y muestra qué tiene (tablas y filas).
// Uso: BLOB_READ_WRITE_TOKEN=... node scripts/verificar-backup.mjs [backups/AAAA-MM-DD.json.gz]
// Sin argumento usa la más reciente. Con --guardar <archivo.json> además la deja descomprimida en disco.
import { gunzipSync } from 'zlib';
import { writeFileSync } from 'fs';
import { get, list } from '@vercel/blob';

const args = process.argv.slice(2);
const iGuardar = args.indexOf('--guardar');
const destino = iGuardar >= 0 ? args[iGuardar + 1] : null;
let ruta = args.find((a, i) => !a.startsWith('--') && i !== iGuardar + 1);
if (!ruta) {
  const { blobs } = await list({ prefix: process.env.BACKUP_PREFIJO || 'backups/', limit: 1000 });
  if (!blobs.length) throw new Error('No hay copias de seguridad.');
  ruta = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0].pathname;
}
const r = await get(ruta, { access: 'private' });
const chunks = [];
for await (const c of r.stream) chunks.push(c);
const json = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString());
console.log(`${ruta} · creada ${json.creado}`);
for (const [tabla, filas] of Object.entries(json.tablas)) if (filas.length) console.log(`  ${tabla}: ${filas.length}`);
if (destino) {
  writeFileSync(destino, JSON.stringify(json));
  console.log(`Guardada en ${destino}`);
}
