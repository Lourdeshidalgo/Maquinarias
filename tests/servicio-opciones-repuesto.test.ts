import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opcionesRepuesto, precioConProveedor, type ContextoPrecios, type VinculoProveedor } from '../lib/servicio/opciones-repuesto.ts';

const ctx = (extra: Partial<ContextoPrecios> = {}): ContextoPrecios => ({
  ivaEnCosto: true,
  redondeo: 0,
  reglas: { margenGeneral: 50, porCategoria: new Map(), porProveedor: new Map() },
  cotizaciones: { general: 1000, porProveedor: new Map() },
  ...extra,
});

const producto = { precioVenta: 15000, ivaPorcentaje: 21, categoria: 'Repuestos' };

const vinculo = (v: Partial<VinculoProveedor> & { proveedorId: string }): VinculoProveedor => ({
  proveedor: v.proveedorId.toUpperCase(),
  costoLista: 10000,
  moneda: 'ARS',
  bonificaciones: '',
  incluyeIva: true,
  preferido: false,
  ...v,
});

test('sin proveedores: una sola opción con el precio del stock', () => {
  assert.deepEqual(opcionesRepuesto(producto, [], ctx()), [
    { proveedorId: null, proveedor: null, precio: 15000, origen: 'CATALOGO', preferido: false },
  ]);
});

test('sin módulo de costos (ctx null): no se abre por proveedor', () => {
  const o = opcionesRepuesto(producto, [vinculo({ proveedorId: 'a' }), vinculo({ proveedorId: 'b' })], null);
  assert.equal(o.length, 1);
  assert.equal(o[0].proveedorId, null);
});

test('varios proveedores: una opción por proveedor, preferido primero con el precio del stock', () => {
  const o = opcionesRepuesto(
    producto,
    [
      vinculo({ proveedorId: 'caro', costoLista: 12000 }),
      vinculo({ proveedorId: 'pref', costoLista: 10000, preferido: true }),
      vinculo({ proveedorId: 'barato', costoLista: 8000 }),
    ],
    ctx()
  );
  assert.deepEqual(o.map((x) => [x.proveedorId, x.precio, x.origen]), [
    ['pref', 15000, 'CATALOGO'],
    ['barato', 12000, 'PROVEEDOR'], // 8000 × 1,5
    ['caro', 18000, 'PROVEEDOR'], // 12000 × 1,5
  ]);
  assert.equal(o[1].proveedor, 'BARATO');
});

test('precio por proveedor: bonificación base, dólar propio y regla de recargo del proveedor', () => {
  const c = ctx({
    reglas: { margenGeneral: 50, porCategoria: new Map(), porProveedor: new Map([['tmc', 40]]) },
    cotizaciones: { general: 1000, porProveedor: new Map([['tmc', 1200]]) },
  });
  // 10 USD − 50% = 5 USD sin IVA → +21% = 6,05 → × 1200 = 7260 → × 1,40 = 10164
  const p = precioConProveedor(producto, vinculo({ proveedorId: 'tmc', costoLista: 10, moneda: 'USD', incluyeIva: false, bonificacionesBase: '50' }), c);
  assert.equal(p, 10164);
});

test('el recargo propio del producto gana a la regla del proveedor; envío y packaging suman al costo', () => {
  const c = ctx({ reglas: { margenGeneral: 50, porCategoria: new Map(), porProveedor: new Map([['x', 10]]) } });
  const p = precioConProveedor({ ...producto, margenPorcentaje: 100, costoEnvio: 500, costoPackaging: 500 }, vinculo({ proveedorId: 'x' }), c);
  assert.equal(p, 22000); // (10000 + 1000) × 2
});

test('proveedor en dólares sin cotización: usa el precio del stock y lo avisa', () => {
  const o = opcionesRepuesto(
    producto,
    [vinculo({ proveedorId: 'usd', moneda: 'USD', costoLista: 10 })],
    ctx({ cotizaciones: { general: null, porProveedor: new Map() } })
  );
  assert.deepEqual(o, [{ proveedorId: 'usd', proveedor: 'USD', precio: 15000, origen: 'SIN_COTIZACION', preferido: false }]);
});

test('redondeo de la empresa y precio entero', () => {
  const p = opcionesRepuesto(producto, [vinculo({ proveedorId: 'r', costoLista: 1234 })], ctx({ redondeo: 100 }));
  assert.equal(p[0].precio, 1900); // 1234 × 1,5 = 1851 → 1900
});

test('opcionesRepuesto: si la lista trae el efectivo (Repuestos), se usa ese precio tal cual', () => {
  const o = opcionesRepuesto(
    producto,
    [vinculo({ proveedorId: 'dibra', preferido: true, precioContadoLista: 26045.25 }), vinculo({ proveedorId: 'otro', precioContadoLista: null })],
    ctx()
  );
  assert.deepEqual(o[0], { proveedorId: 'dibra', proveedor: o[0].proveedor, precio: 26045, origen: 'LISTA', preferido: true });
  assert.notEqual(o[1].origen, 'LISTA');
});
