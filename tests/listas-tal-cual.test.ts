import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoTalCual, costoVigenteDesdeLista, ventaTalCual } from '../lib/costos.ts';

// "Usar los precios del Excel tal cual": costo = precio de la lista, venta = efectivo.
test('tal cual en pesos: el costo es el precio del Excel, sin IVA ni bonificación', () => {
  assert.equal(costoTalCual(14000, 'ARS', 1600), 14000);
});

test('tal cual en dólares: se pasa a pesos con la cotización', () => {
  assert.equal(costoTalCual(17.4, 'USD', 1600), 27840);
  assert.equal(costoTalCual(17.4, 'USD', null), null);
});

test('la venta es el efectivo del Excel; si no viene, no hay precio tal cual', () => {
  assert.equal(ventaTalCual(18500), 18500);
  assert.equal(ventaTalCual(null), null);
  assert.equal(ventaTalCual(0), null);
});

test('sin tal cual sigue sumando el IVA (así 14.000 pasaba a 16.940 de costo)', () => {
  const c = costoVigenteDesdeLista({ costoLista: 14000, moneda: 'ARS', bonificaciones: '', incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true, cotizacion: null });
  assert.equal(c, 16940);
});
