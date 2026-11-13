// Postgres LOCAL para desarrollo (puerto 5433). Los datos quedan en .tmp-pgdata
// y sobreviven entre reinicios. Uso: `npm run db:local` (dejarlo corriendo).
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '..', '.tmp-pgdata');
const yaExiste = fs.existsSync(path.join(databaseDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

if (!yaExiste) await pg.initialise();
await pg.start();
if (!yaExiste) await pg.createDatabase('gestion');
console.log('PG_READY en postgresql://localhost:5433/gestion');

const parar = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
process.stdin.resume();
