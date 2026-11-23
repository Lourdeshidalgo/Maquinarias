// ARCA exige identificar al comprador (DNI/CUIT) en las facturas a consumidor
// final que superan un monto. El monto lo define ARCA y cambia con el tiempo,
// por eso es configurable por empresa (Configuración AFIP). 0 = sin control.

export const UMBRAL_IDENTIFICACION_DEFAULT = 10_000_000;

const COMPROBANTES_FISCALES = ['Factura A', 'Factura B', 'Factura C'];

export function requiereIdentificacion(params: {
  tipoComprobante: string;
  tipoDoc: string;
  total: number;
  umbral: number;
}): boolean {
  const { tipoComprobante, tipoDoc, total, umbral } = params;
  if (!COMPROBANTES_FISCALES.includes(tipoComprobante)) return false;
  if (tipoDoc !== '99') return false;
  return umbral > 0 && total >= umbral;
}

export function mensajeIdentificacion(umbral: number): string {
  const monto = umbral.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });
  return `ARCA exige identificar al comprador en facturas de ${monto} o más. Cargá el DNI o CUIT del cliente antes de facturar.`;
}
