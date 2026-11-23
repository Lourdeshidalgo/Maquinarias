import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirModo, leerCatalogo, leerFichas, tablaDesdePdf, tieneTexto, type PaginaPdf } from '../lib/listas/pdf-texto.ts';
import { adivinarMapeo } from '../lib/listas/parseo.ts';

const t = (str: string, x = 0, y = 0) => ({ str, x, y });
// Tarjeta tipo Morano, en el orden en que pdf.js da los textos.
const tarjeta = (codigo: string, desc: string, precio: string | null) => [
  t('Cantidad:'), t(codigo), t(desc), ...(precio ? [t(precio)] : []), t('PRECIO OFERTA'), t('NETO+IVA'),
];
const pie = [t('(*) Todos los Precios son NETO+IVA'), t('www.moranomyh.com.ar')];

// Páginas 1 y 2 sin productos (portada e índice); productos desde la página 3.
const morano: PaginaPdf[] = [
  [t('OFERTAS > 2026'), ...pie],
  [t('Índice'), ...pie],
  [
    ...tarjeta('#AD10001', 'Pinza universal 8” (CRV50)', '$ 6.196,07'),
    ...tarjeta('#EXHDEWALT', 'Exhibidor DeWalt', null),
    ...tarjeta('#AD10003', 'Pinza universal 6” (CRV50)', '$ 4.884,00'),
    ...pie,
  ],
  [...tarjeta('#KT500', 'Kit importado', 'U$S 17,40'), ...tarjeta('#AD10005', 'Pinza punta 6”', '$ 4.460,98'), ...pie],
];

test('leerCatalogo: tarjetas tipo Morano', () => {
  const f = leerCatalogo(morano, 'ARS');
  assert.deepEqual(
    f.map((x) => [x.fila, x.codigo, x.descripcion, x.precio, x.moneda]),
    [
      [3001, 'AD10001', 'Pinza universal 8” (CRV50)', 6196.07, 'ARS'],
      [3002, 'EXHDEWALT', 'Exhibidor DeWalt', null, 'ARS'],
      [3003, 'AD10003', 'Pinza universal 6” (CRV50)', 4884, 'ARS'],
      [4001, 'KT500', 'Kit importado', 17.4, 'USD'],
      [4002, 'AD10005', 'Pinza punta 6”', 4460.98, 'ARS'],
    ]
  );
});

test('leerCatalogo: sin "#", un código es una sola palabra con algún dígito; el resto es descripción', () => {
  const f = leerCatalogo([[t('FAR0008'), t('ROBIN SUBARU Filtro de Aire'), t('EC-08'), t('$ 12.716,67'), t('FAR0009'), t('Filtro EH-09'), t('$ 12.833,33')]], 'ARS');
  assert.deepEqual(f.map((x) => [x.codigo, x.descripcion, x.precio]), [
    ['FAR0008', 'ROBIN SUBARU Filtro de Aire EC-08', 12716.67],
    ['FAR0009', 'Filtro EH-09', 12833.33],
  ]);
});

const tabla: PaginaPdf[] = [
  [
    t('CODIGO', 40, 700), t('DESCRIPCION', 120, 700), t('PRECIO', 400, 700),
    t('02-11-0057', 41, 680), t('ABRAZADERA FUELLE', 122, 680), t('17,40', 398, 680),
    t('02-01-0516', 39, 660), t('ABRAZADERA GARGANTA STIHL 361', 119, 661), t('2,14', 403, 660),
  ],
];

test('tablaDesdePdf: filas por altura y columnas por posición con tolerancia', () => {
  assert.deepEqual(tablaDesdePdf(tabla), [
    ['CODIGO', 'DESCRIPCION', 'PRECIO'],
    ['02-11-0057', 'ABRAZADERA FUELLE', '17,40'],
    ['02-01-0516', 'ABRAZADERA GARGANTA STIHL 361', '2,14'],
  ]);
  assert.deepEqual(adivinarMapeo(tablaDesdePdf(tabla)).columnas, { codigo: 0, descripcion: 1, precio: 2 });
});

test('elegirModo y tieneTexto', () => {
  const muchas: PaginaPdf[] = [Array.from({ length: 12 }, (_, i) => tarjeta(`#AB${100 + i}`, `Producto ${i}`, '$ 1.000,00')).flat()];
  assert.equal(elegirModo(muchas), 'catalogo');
  assert.equal(elegirModo(tabla), 'tabla');
  assert.equal(tieneTexto([[t('  ')], []]), false);
  assert.equal(tieneTexto(tabla), true);
});

test('leerCatalogo sin "#": un producto sin precio no se lleva el precio del siguiente', () => {
  const f = leerCatalogo([[t('AB100'), t('Exhibidor'), t('AB101'), t('Filtro'), t('$ 500,00'), t('AB102'), t('Bujia'), t('$ 100,00')]], 'ARS');
  assert.deepEqual(f.map((x) => [x.codigo, x.descripcion, x.precio]), [
    ['AB100', 'Exhibidor', null],
    ['AB101', 'Filtro', 500],
    ['AB102', 'Bujia', 100],
  ]);
});

test('leerCatalogo: descripciones repetidas en muchos productos no se toman como ruido', () => {
  const paginas: PaginaPdf[] = [
    Array.from({ length: 6 }, (_, i) => [t(`#FA${100 + i}`), t('FILTRO DE ACEITE'), t(`$ ${i + 1}.000,00`), t('PRECIO OFERTA')]).flat(),
  ];
  const f = leerCatalogo(paginas, 'ARS');
  assert.equal(f.length, 6);
  assert.ok(f.every((x) => x.descripcion === 'FILTRO DE ACEITE'), JSON.stringify(f.map((x) => x.descripcion)));
});

test('leerCatalogo: descripción partida en varios textos se une completa', () => {
  const f = leerCatalogo([[t('#JM1'), t('JUEGO'), t('DE JUNTAS'), t('COMPLETO'), t('MOTOR 5'), t('$ 9.000,00')]], 'ARS');
  assert.equal(f[0].descripcion, 'JUEGO DE JUNTAS COMPLETO MOTOR 5');
});

// Página 2 de INGCO (posiciones reales de pdf.js): grilla de fichas con título arriba y
// una mini tabla CÓDIGO | MEDIDA | precio abajo; el orden del texto viene mezclado.
const p = (str: string, x: number, y: number) => ({ str, x, y });
const ingco: PaginaPdf[] = [[
  p('NUEVOS INGRESOS', 34, 808), p('INGCO · CONTENEDOR 15/11/2026', 34, 789),
  p('HRUH8816', 69, 317), p('450gr', 160, 318), p('CÓDIGO', 83, 332), p('MEDIDA', 159, 332), p('UE: 6 - BT: 24', 227, 332), p('USD 5,73', 224, 316),
  p('■ Cabeza de martillo de goma', 56, 490), p('■ Sin chispas', 56, 480), p('MAZA DE GOMA NEGRO MANGO FIBRA', 56, 512),
  p('HRUH8908', 319, 317), p('220g', 413, 317), p('CÓDIGO', 334, 332), p('PESO', 414, 332),
  p('■ Cabeza de martillo de goma', 307, 490), p('MAZA DE GOMA BLANCO MANGO FIBRA', 307, 512), p('UE: 10 - BT: 40', 476, 332), p('USD 5,78', 474, 316),
  p('HERRAMIENTAS MANUALES / MARTILLOS Y HACHAS', 27, 116),
  p('HACHA DE MANO', 56, 280), p('■ Mango de fi bra de vidrio', 56, 227),
  p('HAX0811000', 65, 105), p('HAX0811250', 65, 85), p('430mm', 155, 106), p('700mm', 155, 86), p('HAX081600', 67, 126), p('390mm', 156, 127),
  p('CÓDIGO', 83, 141), p('MEDIDA', 159, 141),
  p('USD 12,20', 472, 125), p('USD 16,77', 472, 106), p('USD 25,49', 470, 86),
]];

test('leerFichas: código y precio en la misma línea, título de la ficha como descripción', () => {
  const f = leerFichas(ingco, 'ARS');
  assert.deepEqual(f.map((x) => [x.codigo, x.descripcion, x.precio, x.moneda]), [
    ['HRUH8816', 'MAZA DE GOMA NEGRO MANGO FIBRA 450gr', 5.73, 'USD'],
    ['HRUH8908', 'MAZA DE GOMA BLANCO MANGO FIBRA 220g', 5.78, 'USD'],
    ['HAX081600', 'HACHA DE MANO 390mm', 12.2, 'USD'],
    ['HAX0811000', 'HACHA DE MANO 430mm', 16.77, 'USD'],
    ['HAX0811250', 'HACHA DE MANO 700mm', 25.49, 'USD'],
  ]);
  assert.deepEqual(f.map((x) => x.fila), [1001, 1002, 1003, 1004, 1005]);
});

test('elegirModo: fichas cuando el orden del texto no sirve pero las líneas sí', () => {
  const muchas: PaginaPdf[] = Array.from({ length: 3 }, () => ingco[0]);
  assert.equal(elegirModo(muchas), 'fichas');
});

test('leerFichas: fichas con la tabla arriba y el título abajo (página 3 de INGCO); el encabezado de página no es título', () => {
  const pag3 = [
    p('NUEVOS INGRESOS', 34, 808), p('CÓDIGO', 83, 791), p('MEDIDA', 159, 791), p('INGCO · CONTENEDOR 15/11/2026', 34, 789),
    p('8” / 200mm', 147, 777), p('HMFLNP28200', 57, 776), p('USD 15,51', 224, 776),
    p('JUEGO DE 3 ALICATES COMBINADOS', 56, 743), p('■ Mango de Bi-color', 56, 718),
    p('CÓDIGO', 84, 562), p('CONTENIDO', 152, 562), p('3 PIEZAS', 153, 548), p('HKPS08318', 67, 547), p('USD 21,40', 224, 547),
    p('PINZA PICO DE LORO', 57, 509), p('■ Niquelado', 68, 481),
  ];
  // El encabezado de página se repite en todas las páginas.
  const f = leerFichas([ingco[0], pag3, ingco[0]], 'ARS').filter((x) => x.fila >= 2000 && x.fila < 3000);
  assert.deepEqual(f.map((x) => [x.codigo, x.descripcion]), [
    ['HMFLNP28200', 'JUEGO DE 3 ALICATES COMBINADOS 8” / 200mm'],
    ['HKPS08318', 'PINZA PICO DE LORO'],
  ]);
});

test('leerFichas: medidas con unidades técnicas (psi, Nm, bar) no son códigos', () => {
  const f = leerFichas([[p('CÓDIGO', 84, 380), p('COMPRESOR 12V', 56, 420), p('ACA1208', 70, 360), p('140PSI', 160, 360), p('USD 20,58', 470, 360)]], 'ARS');
  assert.deepEqual(f.map((x) => [x.codigo, x.descripcion]), [['ACA1208', 'COMPRESOR 12V 140PSI']]);
});
