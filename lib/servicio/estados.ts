// Estados de una orden de servicio técnico y reglas que comparten la pantalla
// y el servidor. Sin dependencias de servidor.

export const ESTADOS_SERVICIO = [
  { estado: 'RECIBIDO', etiqueta: 'Recibido', color: '#64748b', fondo: '#f1f5f9', ayuda: 'Ingresó el equipo, falta cotizar' },
  { estado: 'COTIZADO', etiqueta: 'Cotizado', color: '#b45309', fondo: '#fef3c7', ayuda: 'Presupuesto enviado, esperando respuesta' },
  { estado: 'ACEPTADO', etiqueta: 'Aceptado', color: '#1d4ed8', fondo: '#dbeafe', ayuda: 'El cliente aceptó: los repuestos se descontaron del stock' },
  { estado: 'EN_REPARACION', etiqueta: 'En reparación', color: '#7c3aed', fondo: '#ede9fe', ayuda: 'Trabajando en el equipo' },
  { estado: 'LISTO', etiqueta: 'Listo para retirar', color: '#047857', fondo: '#d1fae5', ayuda: 'Terminado, avisarle al cliente' },
  { estado: 'ENTREGADO', etiqueta: 'Entregado', color: '#15803d', fondo: '#dcfce7', ayuda: 'Cobrado y entregado' },
  { estado: 'NO_ACEPTADO', etiqueta: 'No aceptado', color: '#b91c1c', fondo: '#fee2e2', ayuda: 'El cliente no aceptó el presupuesto' },
  { estado: 'CANCELADO', etiqueta: 'Cancelado', color: '#475569', fondo: '#e2e8f0', ayuda: 'Orden cancelada' },
] as const;

export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number]['estado'];

export const infoEstado = (e: string) => ESTADOS_SERVICIO.find((x) => x.estado === e) ?? ESTADOS_SERVICIO[0];

/** Estados en los que los repuestos tienen que estar descontados del stock. */
export const ESTADOS_CON_STOCK: EstadoServicio[] = ['ACEPTADO', 'EN_REPARACION', 'LISTO', 'ENTREGADO'];

/** Estados terminados: la orden ya no se edita. */
export const ESTADOS_CERRADOS: EstadoServicio[] = ['ENTREGADO'];

/** A qué estados se puede pasar desde cada uno (botones de la orden). */
export const TRANSICIONES: Record<EstadoServicio, EstadoServicio[]> = {
  RECIBIDO: ['COTIZADO', 'CANCELADO'],
  COTIZADO: ['ACEPTADO', 'NO_ACEPTADO', 'RECIBIDO', 'CANCELADO'],
  ACEPTADO: ['EN_REPARACION', 'LISTO', 'COTIZADO', 'CANCELADO'],
  EN_REPARACION: ['LISTO', 'ACEPTADO', 'CANCELADO'],
  LISTO: ['EN_REPARACION', 'CANCELADO'], // ENTREGADO se pasa cobrando en el POS
  ENTREGADO: [],
  NO_ACEPTADO: ['COTIZADO', 'CANCELADO'],
  CANCELADO: ['RECIBIDO'],
};

/** Cómo se atiende la orden (lo eligen al recibir el equipo). */
export const MODALIDADES = [
  { modalidad: 'PRESUPUESTAR', etiqueta: 'A presupuestar', ayuda: 'Se cotiza y se espera que el cliente acepte' },
  { modalidad: 'REPARACION_DIRECTA', etiqueta: 'Reparación directa', ayuda: 'El cliente ya autorizó: se repara sin esperar el presupuesto' },
  { modalidad: 'GARANTIA', etiqueta: 'Garantía', ayuda: 'Sin cargo para el cliente: se puede entregar sin cobrar' },
] as const;

export type Modalidad = (typeof MODALIDADES)[number]['modalidad'];

export const infoModalidad = (m: string | null | undefined) => MODALIDADES.find((x) => x.modalidad === m) ?? MODALIDADES[0];

/** Estados a los que se puede pasar, según cómo se atiende la orden. */
export function transicionesDe(estado: string, modalidad?: string | null): EstadoServicio[] {
  const base = [...(TRANSICIONES[estado as EstadoServicio] ?? [])];
  const sinPresupuesto = modalidad === 'REPARACION_DIRECTA' || modalidad === 'GARANTIA';
  // Reparación directa y garantía no esperan la aceptación del presupuesto
  if (estado === 'RECIBIDO' && sinPresupuesto) base.unshift('EN_REPARACION');
  // En garantía se entrega sin pasar por el POS
  if (estado === 'LISTO' && modalidad === 'GARANTIA') base.push('ENTREGADO');
  return base;
}

/** Accesorios frecuentes para cargar con un clic. */
export const ACCESORIOS_FRECUENTES = ['Espada', 'Cadena', 'Funda / protector', 'Cabezal', 'Tanza', 'Batería', 'Cargador', 'Bolsa recolectora', 'Manual'];

export const FORMAS_PAGO_SENA = ['Efectivo', 'Transferencia', 'Tarjeta'] as const;

export const TIPOS_ITEM = [
  { tipo: 'REPUESTO', etiqueta: 'Repuesto del stock' },
  { tipo: 'MANO_OBRA', etiqueta: 'Mano de obra' },
  { tipo: 'OTRO', etiqueta: 'Otro cargo' },
] as const;

export type ItemServicio = { tipo: string; cantidad: number; precioUnitario: number; ivaPorcentaje?: number };

/** Totales del presupuesto. Los precios ya incluyen IVA (como en el resto del sistema). */
export function totalesServicio(items: ItemServicio[]) {
  let repuestos = 0;
  let manoObra = 0;
  let otros = 0;
  for (const i of items) {
    const sub = (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0);
    if (i.tipo === 'REPUESTO') repuestos += sub;
    else if (i.tipo === 'MANO_OBRA') manoObra += sub;
    else otros += sub;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return { repuestos: r(repuestos), manoObra: r(manoObra), otros: r(otros), total: r(repuestos + manoObra + otros) };
}
