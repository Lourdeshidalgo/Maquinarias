import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desgloseCalculo } from '../lib/costos.ts';

const tmc = {
  costoLista: 17.4, moneda: 'USD' as const, bonificaciones: '25+15', incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true,
  cotizacion: 1608, costoEnvio: 0, costoPackaging: 0, margen: 50, redondeo: 100, recargoCredito: 10,
};

test('desgloseCalculo: TMC del Excel (17,4 × 0,75 × 0,85 × 1,21 × 1608 × 1,5)', () => {
  const d = desgloseCalculo(tmc);
  assert.deepEqual(d.factoresCosto.map((f) => [f.tipo, f.valor]), [['descuento', 0.75], ['descuento', 0.85], ['iva', 1.21], ['dolar', 1608]]);
  assert.deepEqual(d.factorGanancia, 1.5);
  assert.equal(d.costo, 21582.46);
  assert.equal(d.costoReal, 21582.46);
  assert.equal(d.precioSinRedondeo, 32373.69);
  assert.equal(d.precio, 32400);
  assert.equal(d.precioCredito, 35600);
});

test('desgloseCalculo: lista en pesos con IVA incluido y envío; sin descuento', () => {
  const d = desgloseCalculo({ ...tmc, costoLista: 1210, moneda: 'ARS', bonificaciones: '', incluyeIva: true, cotizacion: null, costoEnvio: 100, margen: 30, redondeo: 0 });
  assert.deepEqual(d.factoresCosto, []); // con IVA incluido y costo con IVA, no se toca
  assert.equal(d.costo, 1210);
  assert.equal(d.costoReal, 1310); // + envío
  assert.equal(d.precio, 1703); // 1310 × 1,3
});

test('desgloseCalculo: costo sin IVA y lista con IVA divide por 1,21; sin dólar en USD no hay costo', () => {
  const d = desgloseCalculo({ ...tmc, costoLista: 121, moneda: 'ARS', bonificaciones: '', incluyeIva: true, ivaEnCosto: false, cotizacion: null, redondeo: 0 });
  assert.deepEqual(d.factoresCosto.map((f) => [f.tipo, f.valor]), [['iva', 1 / 1.21]]);
  assert.equal(d.costo, 100);
  assert.equal(desgloseCalculo({ ...tmc, cotizacion: null }).costo, null);
});
