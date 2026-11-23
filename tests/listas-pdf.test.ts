import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRenglones, type RenglonLeido } from '../lib/listas/pdf-renglones.ts';

const r = (x: Partial<RenglonLeido>): RenglonLeido => ({
  codigo: null, descripcion: null, precio: null, moneda: null, marca: null, rubro: null, codigoFabricante: null, pagina: 1, ...x,
});

test('normalizarRenglones: precios argentinos, # en el código y número de fila por página', () => {
  const f = normalizarRenglones([
    r({ codigo: '#AD10001', descripcion: 'Pinza universal 8"', precio: '$ 6.196,07', pagina: 1 }),
    r({ codigo: 'AD10002', descripcion: 'Pinza 7"', precio: 5580.3, pagina: 1 }),
    r({ codigo: 'X', descripcion: 'Otra', precio: 'U$S 17,4', moneda: 'USD', pagina: 2 }),
  ], 11, 'ARS');
  assert.deepEqual(f.map((x) => [x.fila, x.codigo, x.precio, x.moneda]), [
    [11001, 'AD10001', 6196.07, 'ARS'], [11002, 'AD10002', 5580.3, 'ARS'], [12001, 'X', 17.4, 'USD'],
  ]);
});

test('normalizarRenglones: precio ilegible queda null; renglón sin código ni descripción se descarta; lista vacía no es error', () => {
  const f = normalizarRenglones([r({ codigo: 'A1', descripcion: 'x', precio: 'consultar' }), r({ precio: 10 })], 1, 'USD');
  assert.equal(f.length, 1);
  assert.equal(f[0].precio, null);
  assert.equal(f[0].moneda, 'USD');
  assert.deepEqual(normalizarRenglones([], 1, 'ARS'), []);
});

test('normalizarRenglones: lleva el OEM y descarta precios negativos o cero', () => {
  const f = normalizarRenglones([
    r({ codigo: 'B', descripcion: 'Filtro', precio: '0', codigoFabricante: ' 157-32600-07 ' }),
    r({ codigo: 'C', descripcion: 'Filtro 2', precio: -5 }),
  ], 1, 'ARS');
  assert.equal(f[0].codigoFabricante, '157-32600-07');
  assert.equal(f[0].precio, null);
  assert.equal(f[1].precio, null);
});
