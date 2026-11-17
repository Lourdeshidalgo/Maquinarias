import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bonificacionesEfectivas,
  costoVigenteDesdeLista,
  cotizacionPara,
  precioCredito,
  precioDeVenta,
} from '../lib/costos.ts';

test('cotizacionPara: propio > general > null', () => {
  const c = { general: 1500, porProveedor: new Map([['tmc', 1608]]) };
  assert.equal(cotizacionPara(c, 'tmc'), 1608);
  assert.equal(cotizacionPara(c, 'otro'), 1500);
  assert.equal(cotizacionPara(c, null), 1500);
  assert.equal(cotizacionPara({ general: null, porProveedor: new Map() }, 'x'), null);
});

test('bonificacionesEfectivas: las del producto reemplazan a la base', () => {
  assert.equal(bonificacionesEfectivas('50', '25'), '50');
  assert.equal(bonificacionesEfectivas('', '25+15'), '25+15');
  assert.equal(bonificacionesEfectivas('  ', '25+15'), '25+15');
  assert.equal(bonificacionesEfectivas(null, null), '');
});

test('TMC del Excel: 17,4 USD con dólar 1608 → 32373,69 (Excel: 32373,68 sin redondear el costo)', () => {
  const costo = costoVigenteDesdeLista({
    costoLista: 17.4, moneda: 'USD', bonificaciones: '', bonificacionesBase: '25+15',
    incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true, cotizacion: 1608,
  });
  assert.equal(costo, 21582.46);
  assert.equal(precioDeVenta(costo!, 50, 0), 32373.69);
});

test('costo en USD sin dólar cargado → null', () => {
  assert.equal(
    costoVigenteDesdeLista({ costoLista: 10, moneda: 'USD', incluyeIva: false, ivaPorcentaje: 21, ivaEnCosto: true, cotizacion: null }),
    null
  );
});

test('precioCredito: venta + recargo, con la misma regla de redondeo', () => {
  assert.equal(precioCredito(32373.69, 10, 0), 35611.06);
  assert.equal(precioCredito(32373.69, 10, 100), 35600);
});
