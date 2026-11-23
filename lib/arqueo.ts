// Arqueo de caja: lo que el sistema dice que tiene que haber contra lo que se
// contó, por forma de pago. Se usa en la pantalla de cierre y en la API, así
// que no importa nada de servidor.

export const MEDIOS_ARQUEO = [
  { medio: 'Efectivo', etiqueta: 'Efectivo', ayuda: 'Monto inicial + ventas en efectivo − egresos en efectivo' },
  { medio: 'Transferencia', etiqueta: 'Transferencias', ayuda: 'Ventas por transferencia − egresos por transferencia' },
  { medio: 'Tarjeta', etiqueta: 'Tarjetas', ayuda: 'Ventas con tarjeta − egresos con tarjeta' },
] as const;

export type MedioArqueo = (typeof MEDIOS_ARQUEO)[number]['medio'];

export type FilaArqueo = { medio: MedioArqueo; esperado: number; declarado: number; diferencia: number };
export type Arqueo = {
  filas: FilaArqueo[];
  totalEsperado: number;
  totalDeclarado: number;
  diferenciaTotal: number; // positivo = sobra, negativo = falta
  observaciones: string | null;
};

type DatosCierre = {
  montoInicial: number;
  porFormaPago?: Record<string, number>;
  egresosPorFormaPago?: Record<string, number>;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Lo que debería haber de cada medio según las ventas y egresos del día. */
export function esperadoPorMedio(c: DatosCierre): Record<MedioArqueo, number> {
  const ventas = c.porFormaPago || {};
  const egresos = c.egresosPorFormaPago || {};
  return {
    Efectivo: r2((c.montoInicial || 0) + (ventas.Efectivo || 0) - (egresos.Efectivo || 0)),
    Transferencia: r2((ventas.Transferencia || 0) - (egresos.Transferencia || 0)),
    Tarjeta: r2((ventas.Tarjeta || 0) - (egresos.Tarjeta || 0)),
  };
}

/** Arma el arqueo a partir de lo contado. Devuelve null si falta algún medio. */
export function armarArqueo(
  c: DatosCierre,
  declarado: Partial<Record<MedioArqueo, number | string | null>>,
  observaciones?: string | null
): Arqueo | null {
  const esperado = esperadoPorMedio(c);
  const filas: FilaArqueo[] = [];
  for (const { medio } of MEDIOS_ARQUEO) {
    const crudo = declarado[medio];
    if (crudo === undefined || crudo === null || crudo === '') return null;
    const texto = String(crudo).trim();
    // "1.234,50" (formato argentino) o "1234.5"
    const valor = typeof crudo === 'number' ? crudo : parseFloat(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto);
    if (!Number.isFinite(valor) || valor < 0) return null;
    filas.push({ medio, esperado: esperado[medio], declarado: r2(valor), diferencia: r2(valor - esperado[medio]) });
  }
  const totalEsperado = r2(filas.reduce((a, f) => a + f.esperado, 0));
  const totalDeclarado = r2(filas.reduce((a, f) => a + f.declarado, 0));
  return {
    filas,
    totalEsperado,
    totalDeclarado,
    diferenciaTotal: r2(totalDeclarado - totalEsperado),
    observaciones: observaciones?.trim() ? observaciones.trim().slice(0, 500) : null,
  };
}

/** Texto corto de una diferencia: "Cuadra", "Sobran $X" o "Faltan $X". */
export function textoDiferencia(diferencia: number, formato: (n: number) => string): string {
  if (Math.abs(diferencia) < 0.005) return 'Cuadra';
  return diferencia > 0 ? `Sobran ${formato(diferencia)}` : `Faltan ${formato(-diferencia)}`;
}

export function colorDiferencia(diferencia: number): string {
  if (Math.abs(diferencia) < 0.005) return '#15803d';
  return diferencia > 0 ? '#b45309' : '#b91c1c';
}
