import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cantidadValida, estadoCatalogo } from '../lib/catalogo.ts';

test('estadoCatalogo: en stock, sin stock o solo en la lista del proveedor', () => {
  assert.equal(estadoCatalogo({ soloCatalogo: false, stockActual: 6 }), 'stock');
  assert.equal(estadoCatalogo({ soloCatalogo: false, stockActual: 0 }), 'sin-stock');
  assert.equal(estadoCatalogo({ soloCatalogo: false, stockActual: -1 }), 'sin-stock');
  assert.equal(estadoCatalogo({ soloCatalogo: true, stockActual: 0 }), 'lista');
});

test('cantidadValida: 0 o más (acepta coma decimal); lo demás es inválido', () => {
  assert.equal(cantidadValida(3), 3);
  assert.equal(cantidadValida('0'), 0);
  assert.equal(cantidadValida('2,5'), 2.5);
  assert.equal(cantidadValida(''), 0);
  assert.equal(cantidadValida(-1), null);
  assert.equal(cantidadValida('abc'), null);
  assert.equal(cantidadValida(1e7), null);
});
