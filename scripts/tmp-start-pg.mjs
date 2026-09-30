import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pg = new EmbeddedPostgres({
  databaseDir: path.join(__dirname, '..', '.tmp-pgdata'),
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase('gestion');
console.log('PG_READY');
process.stdin.resume();
