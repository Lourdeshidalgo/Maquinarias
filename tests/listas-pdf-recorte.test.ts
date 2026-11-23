import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origenesDeTexto, sinTextoRecortado, type Operacion } from '../lib/listas/pdf-recorte.ts';

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ fn: 'constructPath', args: [28, [], [x0, y0, x1, y1]] });
const texto = (x: number, y: number, s: string): Operacion[] => [
  { fn: 'beginText', args: null },
  { fn: 'setFont', args: ['f1', 10] },
  { fn: 'setTextMatrix', args: [[1, 0, 0, 1, x, y]] },
  { fn: 'showText', args: [[...s].map((c) => ({ unicode: c, width: 500 }))] },
  { fn: 'endText', args: null },
];

test('origenesDeTexto: el texto fuera del recorte vigente queda oculto; restore vuelve al recorte anterior', () => {
  const ops: Operacion[] = [
    ...texto(50, 700, 'VISIBLE1'),
    { fn: 'save', args: null },
    { fn: 'clip', args: null }, rect(0, 0, 300, 400), // solo la mitad de abajo a la izquierda
    ...texto(50, 300, 'ADENTRO'),
    ...texto(50, 600, 'AFUERA'),
    { fn: 'restore', args: null },
    ...texto(400, 600, 'VISIBLE2'),
  ];
  assert.deepEqual(origenesDeTexto(ops).map((o) => [o.texto, o.visible]), [
    ['VISIBLE1', true], ['ADENTRO', true], ['AFUERA', false], ['VISIBLE2', true],
  ]);
});

test('origenesDeTexto: transform mueve el texto y el recorte; los recortes se intersectan', () => {
  const ops: Operacion[] = [
    { fn: 'save', args: null },
    { fn: 'transform', args: [1, 0, 0, 1, 100, 100] },
    { fn: 'clip', args: null }, rect(0, 0, 200, 200), // en la página: 100..300
    { fn: 'clip', args: null }, rect(50, 50, 400, 400), // intersección: 150..300
    ...texto(10, 10, 'A'), // página (110,110): fuera
    ...texto(100, 100, 'B'), // página (200,200): dentro
    { fn: 'restore', args: null },
  ];
  const o = origenesDeTexto(ops);
  assert.deepEqual(o.map((x) => [x.texto, x.visible, Math.round(x.x), Math.round(x.y)]), [['A', false, 110, 110], ['B', true, 200, 200]]);
});

test('origenesDeTexto: varios showText seguidos avanzan en x según el ancho de las letras', () => {
  const ops: Operacion[] = [
    { fn: 'beginText', args: null },
    { fn: 'setFont', args: ['f1', 10] },
    { fn: 'setTextMatrix', args: [[1, 0, 0, 1, 20, 50]] },
    { fn: 'showText', args: [[{ unicode: 'A', width: 600 }, { unicode: 'B', width: 400 }]] }, // avanza 10
    { fn: 'showText', args: [[{ unicode: 'C', width: 500 }]] },
    { fn: 'endText', args: null },
  ];
  assert.deepEqual(origenesDeTexto(ops).map((o) => [o.texto, Math.round(o.x)]), [['AB', 20], ['C', 30]]);
});

test('sinTextoRecortado: saca los textos que empiezan donde hay un texto recortado', () => {
  const pagina = [{ str: 'HRUH8816', x: 69, y: 317 }, { str: 'HSTH81000', x: 67, y: 565 }, { str: 'otro', x: 300, y: 10 }];
  const origenes = [
    { texto: 'HRUH8816', x: 69.2, y: 316.8, visible: false },
    { texto: 'HSTH81000', x: 67, y: 565, visible: true },
  ];
  assert.deepEqual(sinTextoRecortado(pagina, origenes).map((t) => t.str), ['HSTH81000', 'otro']);
});

test('origenesDeTexto: acepta las matrices y cajas como Float32Array (así las da pdf.js)', () => {
  const ops: Operacion[] = [
    { fn: 'save', args: null },
    { fn: 'clip', args: null }, { fn: 'constructPath', args: [28, [], new Float32Array([0, 0, 100, 100])] },
    { fn: 'beginText', args: null },
    { fn: 'setFont', args: ['f1', 10] },
    { fn: 'setTextMatrix', args: [new Float32Array([1, 0, 0, 1, 50, 50])] },
    { fn: 'showText', args: [[{ unicode: 'A', width: 500 }]] },
    { fn: 'setTextMatrix', args: [new Float32Array([1, 0, 0, 1, 150, 50])] },
    { fn: 'showText', args: [[{ unicode: 'B', width: 500 }]] },
    { fn: 'endText', args: null },
    { fn: 'restore', args: null },
  ];
  assert.deepEqual(origenesDeTexto(ops).map((o) => [o.texto, o.x, o.visible]), [['A', 50, true], ['B', 150, false]]);
});

test('sinTextoRecortado: un precio oculto en el mismo lugar que uno visible se descarta (compara el texto)', () => {
  const pagina = [{ str: 'USD 13,41', x: 474, y: 309 }, { str: 'USD 23,18', x: 474, y: 309 }];
  const origenes = [
    { texto: ' USD 23,18 ', x: 474, y: 309, visible: false },
    { texto: ' USD 13,41 ', x: 474.3, y: 309, visible: true },
  ];
  assert.deepEqual(sinTextoRecortado(pagina, origenes).map((t) => t.str), ['USD 13,41']);
});

test('origenesDeTexto: el origen es la primera letra, no los espacios iniciales (como pdf.js)', () => {
  const ops: Operacion[] = [
    { fn: 'beginText', args: null },
    { fn: 'setFont', args: ['f1', 10] },
    { fn: 'setTextMatrix', args: [[1, 0, 0, 1, 100, 50]] },
    { fn: 'showText', args: [[{ unicode: ' ', width: 300, isSpace: true }, { unicode: 'U', width: 700 }, { unicode: 'S', width: 600 }]] },
    { fn: 'endText', args: null },
  ];
  assert.deepEqual(origenesDeTexto(ops).map((o) => [o.texto, o.x]), [[' US', 103]]);
});
