import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unirTablas } from '../lib/listas/tablas-lado-a-lado.ts';
import { adivinarMapeo, extraerFilas } from '../lib/listas/parseo.ts';

const _ = '';
// Hoja armada como la de DIBRA: dos tablas (A-E y G-K), títulos de categoría,
// una sección con "Aplicación" y otra con una columna vacía en el medio.
const hoja: unknown[][] = [
  ['Lista de Precios Nº 113 ( 01-06-2026 )', _, _, _, _, _, _, _, _, _, _],
  ['Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA', _, 'Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA'],
  ['CU8010102', 'Cuchilla 21" Universal', '$20.500,00', '$ 26.045,25', '$ 29.952,04', _, 'FI8030125', 'Filtro de Aire B&S', '$ 12.500,00', '$ 15.881,25', '$ 18.263,44'],
  ['CAPACITORES', _, _, _, _, _, 'MOTORES NAFTEROS (***)', _, _, '$ -', '$ -'],
  ['Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA', _, 'Código', 'Aplicación', 'Precio', 'EFECTIVO', 'LISTA'],
  ['8034008', 'Capacitor de 25 MF', '$ 35.200,00', '$ 44.721,60', '$ 51.429,84', _, '8037004', 'Motor Naftero B&S Serie 450E', 320, '$ 371,28', '$ 426,97'],
  ['Código', 'Descripción', _, 'Precio', 'EFECTIVO', 'LISTA', 'Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA'],
  ['KIT CORTADORAS ELECTRICAS', _, _, _, _, _, 'T150R', 'Rollo tanza 1,50mm', '$ 2.500,00', '$ 3.176,25', '$ 3.652,69'],
  ['8015002', 'Kit Llave de encendido DIBRA.', _, '$ 28.400,00', '$ 36.082,20', '$ 41.494,53', _, _, _, _, _],
  ['Código', 'Descripción', 'Aplicación', 'Precio', 'EFECTIVO', 'LISTA', _, _, _, _, _],
  ['ACCESORIOS POWER STROKE', _, _, _, _, _, _, _, _, _, _],
  ['PS7557303454', 'BUJÍA', 'PSG-26', '$ 22.800,00', '$ 28.967,40', '$ 33.312,51', _, _, _, _, _],
];

test('unirTablas: dos tablas lado a lado, con categorías y columnas corridas', () => {
  const u = unirTablas(hoja);
  assert.ok(u);
  assert.equal(u.bloques, 2);
  assert.equal(u.productos, 7);
  assert.deepEqual(u.categorias, ['CAPACITORES', 'KIT CORTADORAS ELECTRICAS', 'ACCESORIOS POWER STROKE', 'MOTORES NAFTEROS (***)']);
  const por = (cod: string) => u.filas.find((f) => f[0] === cod)!;

  // El título de la hoja no es una categoría
  assert.deepEqual(por('CU8010102'), ['CU8010102', 'Cuchilla 21" Universal', '$20.500,00', 26045.25, 29952.04, '', '']);
  assert.equal(por('8034008')[5], 'CAPACITORES');
  // Columna vacía en el medio: el precio está corrido un lugar
  assert.deepEqual(por('8015002'), ['8015002', 'Kit Llave de encendido DIBRA.', '$ 28.400,00', 36082.2, 41494.53, 'KIT CORTADORAS ELECTRICAS', '']);
  // Aplicación (modelos) entre paréntesis en la descripción
  assert.equal(por('PS7557303454')[1], 'BUJÍA (PSG-26)');
  assert.equal(por('PS7557303454')[5], 'ACCESORIOS POWER STROKE');
  // Tabla derecha: "$ -" no impide reconocer el título; "Aplicación" hace de descripción.
  // El precio sin "$" en una lista en pesos es en dólares.
  assert.deepEqual(por('8037004'), ['8037004', 'Motor Naftero B&S Serie 450E', 320, 371.28, 426.97, 'MOTORES NAFTEROS (***)', 'USD']);
  assert.equal(u.enDolares, 1);
  // Un encabezado nuevo sin título arriba arranca una sección sin categoría
  assert.equal(por('T150R')[5], '');
  assert.equal(por('FI8030125')[5], '');
});

test('unirTablas: la tabla unida se mapea sola con el importador de siempre', () => {
  const u = unirTablas(hoja)!;
  const mapeo = adivinarMapeo(u.filas);
  assert.deepEqual(mapeo, {
    filaInicio: 2,
    columnas: { codigo: 0, descripcion: 1, precio: 2, precioContado: 3, precioTarjeta: 4, rubro: 5, moneda: 6 },
  });
  const filas = extraerFilas(u.filas, { ...mapeo, incluyeIva: true, monedaDefault: 'ARS' });
  assert.equal(filas.length, 7);
  assert.ok(filas.every((f) => f.precio !== null));
  assert.equal(filas.find((f) => f.codigo === '8015002')!.precio, 28400);
  // Efectivo y tarjeta de la lista también se leen
  assert.equal(filas.find((f) => f.codigo === '8015002')!.precioContado, 36082.2);
  assert.equal(filas.find((f) => f.codigo === '8015002')!.precioTarjeta, 41494.53);
  assert.equal(filas.find((f) => f.codigo === '8015002')!.moneda, 'ARS');
  assert.equal(filas.find((f) => f.codigo === '8037004')!.moneda, 'USD');
});

test('unirTablas: una lista común (una sola tabla) se deja como está', () => {
  // Como TMC: dos títulos de "artículo" en la misma tabla, y encabezados repetidos más abajo
  const tmc = [
    ['DOLAR', 1608],
    ['ARTICULO TMC', 'ARTICULO OEM', 'DESCRIPCION', 'RUBRO', 'PRECIO USD S/IVA', 'EFECTIVO', 'CREDITO'],
    ['02-11-0057', '0072-1-61', 'ABRAZADERA FUELLE', '211 - CONSTRUCCION', 17.4, 32373.68, 35611.05],
    ['ARTICULO TMC', 'ARTICULO OEM', 'DESCRIPCION', 'RUBRO', 'PRECIO USD S/IVA', 'EFECTIVO', 'CREDITO'],
  ];
  assert.equal(unirTablas(tmc), null);
  assert.equal(unirTablas([['Código', 'Descripción', 'Precio'], ['A1', 'Algo', 10]]), null);
});

test('adivinarMapeo: dos columnas "Descripción" no se confunden con la bonificación', () => {
  const m = adivinarMapeo([
    ['Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA', '', 'Código', 'Descripción', 'Precio'],
    ['A1', 'Algo', '$ 10,00', '$ 12,00', '$ 13,80', '', 'B1', 'Otro', '$ 5,00'],
  ]);
  assert.equal(m.columnas.bonificacion, undefined);
  assert.equal(m.columnas.precioContado, 3);
  assert.equal(adivinarMapeo([['Código', 'Descripción', 'Precio', 'Desc.'], ['A', 'B', 1, '10']]).columnas.bonificacion, 3);
});

test('unirTablas: la tarjeta que falta se completa con el recargo parejo de la propia lista', () => {
  const filas: unknown[][] = [
    ['Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA', '', 'Código', 'Descripción', 'Aplicación', 'Precio', 'EFECTIVO'],
  ];
  for (let i = 0; i < 12; i++) {
    const ef = 1000 + i * 100;
    filas.push([`A${i}`, `Producto ${i}`, `$ ${ef / 1.2705}`, ef, Math.round(ef * 1.15 * 100) / 100, '', `PS${i}`, 'BUJÍA', 'PSG-26', `$ ${ef}`, ef * 1.2705]);
  }
  const u = unirTablas(filas)!;
  assert.deepEqual(u.tarjetaCalculada, { cantidad: 12, recargoPct: 15 });
  const ps0 = u.filas.find((f) => f[0] === 'PS0')!;
  assert.equal(ps0[4], Math.round(1000 * 1.2705 * 1.15 * 100) / 100);
});

test('unirTablas: si el recargo no es parejo, la tarjeta que falta queda vacía', () => {
  const filas: unknown[][] = [['Código', 'Descripción', 'Precio', 'EFECTIVO', 'LISTA', '', 'Código', 'Descripción', 'Precio', 'EFECTIVO']];
  for (let i = 0; i < 12; i++) filas.push([`A${i}`, 'x', '$ 10,00', 100, 100 + i * 7, '', `B${i}`, 'y', '$ 10,00', 50]);
  const u = unirTablas(filas)!;
  assert.equal(u.tarjetaCalculada, null);
  assert.equal(u.filas.find((f) => f[0] === 'B0')![4], '');
});
