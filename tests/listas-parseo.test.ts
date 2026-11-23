import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adivinarMapeo, extraerFilas } from '../lib/listas/parseo.ts';

test('adivinarMapeo: columnas OEM de las listas reales', () => {
  const dila = [['ARTICULO TMC', 'ARTICULO OEM', 'DESCRIPCION', 'RUBRO', 'PRECIO USD S/IVA']];
  assert.deepEqual(adivinarMapeo(dila).columnas, { codigo: 0, codigoFabricante: 1, descripcion: 2, rubro: 3, precio: 4 });
  const tallerSur = [['Logbelts', 'Fabricante', 'Ubicación', 'Descripcion', 'Largo', 'Precio Uni.U$S']];
  assert.equal(adivinarMapeo(tallerSur).columnas.codigoFabricante, 1);
  const villa = [['COD ARTICULO', 'DESCRIPCION', 'MARCA', 'OEM (CODIGO ORIGINAL)', 'PRECIO NETO COERCIO']];
  assert.equal(adivinarMapeo(villa).columnas.codigoFabricante, 3);
  assert.equal(adivinarMapeo(villa).columnas.marca, 2);
});

test('extraerFilas: lleva el OEM', () => {
  const filas = [['02-11-0057', '0072-1-61', 'ABRAZADERA', 17.4]];
  const [f] = extraerFilas(filas, {
    filaInicio: 1, columnas: { codigo: 0, codigoFabricante: 1, descripcion: 2, precio: 3 }, incluyeIva: false, monedaDefault: 'USD',
  });
  assert.equal(f.codigoFabricante, '0072-1-61');
});
