// Helpers de formato y fechas compartidos por toda la app.
// Antes cada pantalla tenía su propia copia de estas funciones; tenerlas acá
// evita inconsistencias (por ejemplo, un precio mostrado con distinta cantidad
// de decimales según la pantalla).

/** Formatea un número como moneda argentina: 1234.5 -> "$1.234,50" */
export function formatMoney(value: number) {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

/** Igual que formatMoney pero para valores que llegan como string (Decimal de Prisma). */
export function formatMoneyString(value: string) {
  return Number(value).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Argentina, para inputs y filtros. */
export function todayArgentina() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
