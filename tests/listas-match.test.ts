import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarProducto, indicePorOem, type IndicesMatch } from '../lib/listas/match.ts';

const idx = (p: Partial<IndicesMatch<{ productoId: string }>>): IndicesMatch<{ productoId: string }> => ({
  vinculoPorCodigo: new Map(), productoPorCodigo: new Map(), productoPorOem: new Map(), ...p,
});

test('buscarProducto: proveedor > código > OEM', () => {
  const i = idx({
    vinculoPorCodigo: new Map([['0211', { productoId: 'p1' }]]),
    productoPorCodigo: new Map([['ABC', 'p2']]),
    productoPorOem: new Map([['0072161', 'p3']]),
  });
  assert.equal(buscarProducto({ codigo: '02-11', codigoFabricante: '0072-1-61' }, i).productoId, 'p1');
  assert.equal(buscarProducto({ codigo: 'abc', codigoFabricante: '0072-1-61' }, i).tipoMatch, 'CODIGO');
  assert.deepEqual(buscarProducto({ codigo: 'X9', codigoFabricante: '0072 1 61' }, i), { tipoMatch: 'OEM', productoId: 'p3' });
  assert.equal(buscarProducto({ codigo: 'X9', codigoFabricante: null }, i).tipoMatch, 'NINGUNO');
});

test('indicePorOem: OEM repetido en dos productos queda ambiguo (sin match)', () => {
  const m = indicePorOem([
    { id: 'a', codigoFabricante: '754-0145' },
    { id: 'b', codigoFabricante: '7540145' },
    { id: 'c', codigoFabricante: null },
  ]);
  assert.equal(m.get('7540145'), null);
  assert.equal(buscarProducto({ codigo: null, codigoFabricante: '754-0145' }, idx({ productoPorOem: m })).tipoMatch, 'NINGUNO');
});

test('buscarProducto: OEM igual al código propio cruza por código', () => {
  const i = idx({ productoPorCodigo: new Map([['850972', 'p1']]), productoPorOem: new Map([['850972', 'p1']]) });
  assert.equal(buscarProducto({ codigo: '850972', codigoFabricante: '850972' }, i).tipoMatch, 'CODIGO');
});
