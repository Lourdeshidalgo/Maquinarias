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

test('gruposParaExportar: por categoría, con efectivo y tarjeta de la lista y sin productos sin precio', async () => {
  const { gruposParaExportar } = await import('../lib/catalogo.ts');
  const g = gruposParaExportar([
    { codigo: 'B2', nombre: 'Espada 16"', categoria: 'Motosierra', marca: 'Husqvarna', precioVenta: 70000, precioCredito: 77000, lista: { precioContado: 78952.5, precioTarjeta: 86847.75 } },
    { codigo: 'A1', nombre: 'Cadena 3/8', categoria: 'Motosierra', marca: null, precioVenta: 20000, precioCredito: 22000, lista: null },
    { codigo: 'C3', nombre: 'Filtro', categoria: '', marca: null, precioVenta: 0, precioCredito: 0, lista: null },
    { codigo: 'F1', nombre: 'Filtro aire', categoria: 'Filtros', marca: null, precioVenta: 5000, precioCredito: 5500, lista: null },
  ]);
  assert.deepEqual(g.map((x) => x.categoria), ['Filtros', 'Motosierra']);
  assert.deepEqual(g[1].filas, [
    { codigo: 'A1', nombre: 'Cadena 3/8', efectivo: 20000, tarjeta: 22000 },
    { codigo: 'B2', nombre: 'Espada 16" (Husqvarna)', efectivo: 78952.5, tarjeta: 86847.75 },
  ]);
});

test('nombreArchivoCatalogo: sin acentos ni símbolos', async () => {
  const { nombreArchivoCatalogo } = await import('../lib/catalogo.ts');
  assert.equal(nombreArchivoCatalogo('Molux Maquinarias', new Date(2026, 10, 24), 'pdf', 'Motosierra · "cadena"'), 'Catalogo Molux Maquinarias Motosierra cadena 24-11-2026.pdf');
});
