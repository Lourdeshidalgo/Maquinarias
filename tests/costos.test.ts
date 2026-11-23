import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bonificacionesEfectivas,
  costoVigenteDesdeLista,
  cotizacionPara,
  datosListaManual,
  normalizarBonificaciones,
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

test('normalizarBonificaciones: limpia el texto y rechaza lo que no se entiende', () => {
  assert.equal(normalizarBonificaciones(' 25 + 15% '), '25+15');
  assert.equal(normalizarBonificaciones('20+10+10'), '20+10+10');
  assert.equal(normalizarBonificaciones('12,5'), '12.5');
  assert.equal(normalizarBonificaciones(''), '');
  assert.equal(normalizarBonificaciones('  '), '');
  assert.equal(normalizarBonificaciones('abc'), null);
  assert.equal(normalizarBonificaciones('25+x'), null);
  assert.equal(normalizarBonificaciones('150'), null);
});

test('bonificacionesEfectivas: un texto sin números no anula la base; "0" sí (sin descuento explícito)', () => {
  assert.equal(bonificacionesEfectivas('-', '25'), '25');
  assert.equal(bonificacionesEfectivas('s/d', '25+15'), '25+15');
  assert.equal(bonificacionesEfectivas('0', '25'), '0');
  const sinDescuento = costoVigenteDesdeLista({
    costoLista: 100, moneda: 'ARS', bonificaciones: '0', bonificacionesBase: '25', incluyeIva: true, ivaPorcentaje: 21, ivaEnCosto: true,
  });
  assert.equal(sinDescuento, 100);
});

test('datosListaManual: precio USD cargado a mano', () => {
  assert.deepEqual(datosListaManual({ costoLista: '12,5' }), { ok: true, costoLista: 12.5, incluyeIva: false, bonificaciones: '' });
  assert.deepEqual(datosListaManual({ costoLista: 10, incluyeIva: true, bonificaciones: ' 50 ' }), { ok: true, costoLista: 10, incluyeIva: true, bonificaciones: '50' });
  assert.equal(datosListaManual({ costoLista: '-1' }).ok, false);
  assert.equal(datosListaManual({ costoLista: 'abc' }).ok, false);
  assert.equal(datosListaManual({ costoLista: 0 }).ok, false);
  assert.equal(datosListaManual({ costoLista: 10, bonificaciones: '25+x' }).ok, false);
});

test('datosListaManual: "0" es sin descuento a propósito y un texto sin números se ignora', () => {
  assert.deepEqual(datosListaManual({ costoLista: 10, bonificaciones: '0' }), { ok: true, costoLista: 10, incluyeIva: false, bonificaciones: '0' });
  assert.deepEqual(datosListaManual({ costoLista: 10, bonificaciones: 's/d' }), { ok: true, costoLista: 10, incluyeIva: false, bonificaciones: '' });
  assert.deepEqual(datosListaManual({ costoLista: 10, bonificaciones: '-' }), { ok: true, costoLista: 10, incluyeIva: false, bonificaciones: '' });
  assert.equal(datosListaManual({ costoLista: 10, bonificaciones: '25+x' }).ok, false);
});
