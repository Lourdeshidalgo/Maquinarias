import { Prisma } from '@prisma/client';

// UPDATE masivo en una sola sentencia (UPDATE ... FROM (VALUES ...)), para
// aplicar miles de filas de una lista sin miles de idas y vueltas a la base
// (las funciones de Vercel tienen límite de tiempo).

export type TipoColumna = 'numeric' | 'text' | 'boolean' | 'timestamp' | 'jsonb';

type Db = { $executeRaw: (query: Prisma.Sql) => Prisma.PrismaPromise<number> };

const LOTE = 500;

function valor(v: unknown, tipo: TipoColumna): Prisma.Sql {
  if (v === undefined || v === null) return Prisma.sql`NULL::${Prisma.raw(tipo === 'timestamp' ? 'timestamp(3)' : tipo)}`;
  switch (tipo) {
    case 'numeric':
      return Prisma.sql`${String(v)}::numeric`;
    case 'boolean':
      return Prisma.sql`${Boolean(v)}::boolean`;
    case 'timestamp':
      return Prisma.sql`${new Date(v as string | Date).toISOString()}::timestamp(3)`;
    case 'jsonb':
      return Prisma.sql`${JSON.stringify(v)}::jsonb`;
    default:
      return Prisma.sql`${String(v)}::text`;
  }
}

/**
 * Actualiza `tabla` por id con los valores de cada fila.
 *   columnas: { nombreColumna: tipo }
 *   filas: [{ id, nombreColumna: valor, ... }]
 * `extra` agrega asignaciones fijas, por ejemplo '"updatedAt" = NOW()'.
 * `filtro` agrega una condición (ej. el empresaId) por seguridad multi-tenant.
 */
export async function actualizarEnLote(
  db: Db,
  tabla: string,
  columnas: Record<string, TipoColumna>,
  filas: Array<Record<string, unknown> & { id: string }>,
  opciones: { extra?: string; empresaId?: string } = {}
): Promise<number> {
  if (!filas.length) return 0;
  const nombres = Object.keys(columnas);
  // Cada fila debe traer todas las columnas: una que falte quedaría en NULL.
  // (null explícito sí está permitido.)
  for (const f of filas) {
    const falta = nombres.find((n) => f[n] === undefined);
    if (falta) throw new Error(`actualizarEnLote(${tabla}): falta "${falta}" en la fila ${f.id}`);
  }
  let total = 0;

  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const values = Prisma.join(
      lote.map(
        (f) =>
          Prisma.sql`(${Prisma.join([Prisma.sql`${f.id}::text`, ...nombres.map((n) => valor(f[n], columnas[n]))])})`
      )
    );
    const sets = nombres.map((n) => `"${n}" = v."${n}"`);
    if (opciones.extra) sets.push(opciones.extra);
    const alias = ['id', ...nombres].map((n) => `"${n}"`).join(', ');
    const filtro = opciones.empresaId ? Prisma.sql` AND t."empresaId" = ${opciones.empresaId}` : Prisma.empty;

    total += await db.$executeRaw(
      Prisma.sql`UPDATE ${Prisma.raw(`"${tabla}"`)} AS t SET ${Prisma.raw(sets.join(', '))}
        FROM (VALUES ${values}) AS v(${Prisma.raw(alias)})
        WHERE t."id" = v."id"${filtro}`
    );
  }
  return total;
}
