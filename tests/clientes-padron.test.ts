import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { filasExportacion, indiceExistentes, interpretarFilas, type ClienteExportable } from '../lib/clientes/padron.ts';

const base: ClienteExportable = {
  codigo: null, razonSocial: '', tipoDoc: '99', nroDoc: '', condicionIva: 'Consumidor Final',
  direccion: null, localidad: null, provincia: null, codigoPostal: null, telefono: null, celular: null,
  email: null, notas: null, limiteCredito: null, saldoCuentaCorriente: 0, createdAt: '2026-11-01T12:00:00Z',
};

const clientes: ClienteExportable[] = [
  { ...base, codigo: 15, razonSocial: 'Agro Los Pinos SRL', tipoDoc: 'CUIT', nroDoc: '30712345678', condicionIva: 'Responsable Inscripto',
    direccion: 'Ruta 5 km 120', localidad: 'Bragado', provincia: 'Buenos Aires', codigoPostal: '6640', telefono: '2342 401122',
    celular: '2342 155566', email: 'compras@lospinos.com.ar', notas: 'Paga a 30 días', limiteCredito: '500000.00', saldoCuentaCorriente: '12500.50' },
  { ...base, razonSocial: 'Juan Pérez', tipoDoc: 'DNI', nroDoc: '28123456', celular: '11 5555 1234' },
  { ...base, codigo: 40, razonSocial: 'Taller Gómez', tipoDoc: '99', nroDoc: 'C40', condicionIva: 'Monotributista', telefono: '4444-1234' },
  { ...base, razonSocial: 'Vecino sin datos', tipoDoc: '99', nroDoc: 'F12' },
  { ...base, razonSocial: 'Consumidor Final', tipoDoc: '99', nroDoc: '0' },
];

/** Exporta, arma el .xlsx en memoria y lo vuelve a leer como lo hace la pantalla de importar. */
function idaYVuelta(lista: ClienteExportable[]) {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasExportacion(lista)), 'Clientes');
  const archivo = XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
  const leido = XLSX.read(archivo, { type: 'array' });
  return interpretarFilas(XLSX.utils.sheet_to_json<unknown[]>(leido.Sheets['Clientes'], { header: 1, raw: true, defval: '' }));
}

test('exportar: no incluye el Consumidor Final genérico del POS ni el identificador interno', () => {
  const filas = filasExportacion(clientes);
  assert.equal(filas.length, 4);
  assert.ok(!filas.some((f) => f['Razón social'] === 'Consumidor Final'));
  assert.equal(filas[2]['CUIT/DNI'], '');
  assert.equal(filas[0]['Saldo cuenta corriente'], 12500.5);
  assert.equal(filas[0]['Límite de crédito'], 500000);
});

test('exportar e importar: el Excel exportado se lee con los mismos datos', () => {
  const { clientes: leidos, avisos, omitidos } = idaYVuelta(clientes);
  assert.equal(omitidos, 0);
  assert.deepEqual(avisos, []);
  assert.equal(leidos.length, 4);

  const [pinos, juan, gomez, vecino] = leidos;
  assert.deepEqual(
    { ...pinos, fila: 0 },
    { fila: 0, codigo: 15, razonSocial: 'Agro Los Pinos SRL', tipoDoc: 'CUIT', nroDoc: '30712345678', condicionIva: 'Responsable Inscripto',
      direccion: 'Ruta 5 km 120', telefono: '2342 401122', celular: '2342 155566', email: 'compras@lospinos.com.ar',
      localidad: 'Bragado', provincia: 'Buenos Aires', codigoPostal: '6640', notas: 'Paga a 30 días' },
  );
  assert.equal(juan.tipoDoc, 'DNI');
  assert.equal(juan.nroDoc, '28123456');
  assert.equal(juan.codigo, null);
  assert.equal(gomez.codigo, 40);
  assert.equal(gomez.condicionIva, 'Monotributista');
  assert.equal(gomez.tipoDoc, '99');
  assert.equal(vecino.razonSocial, 'Vecino sin datos');
});

test('volver a subir el exportado en la misma empresa actualiza, no duplica', () => {
  const existentes = clientes.map((c, i) => ({ id: `id${i}`, codigo: c.codigo, tipoDoc: c.tipoDoc, nroDoc: c.nroDoc, razonSocial: c.razonSocial }));
  const indice = indiceExistentes(existentes);
  const { clientes: leidos } = idaYVuelta(clientes);
  assert.deepEqual(leidos.map((c) => indice.buscar(c)), ['id0', 'id1', 'id2', 'id3']);
});

test('cruce por nombre: solo para clientes sin N° ni documento, y si el nombre no está repetido', () => {
  const indice = indiceExistentes([
    { id: 'a', codigo: null, tipoDoc: '99', nroDoc: 'F1', razonSocial: 'José Díaz' },
    { id: 'b', codigo: null, tipoDoc: '99', nroDoc: 'F2', razonSocial: 'Ana' },
    { id: 'c', codigo: null, tipoDoc: '99', nroDoc: 'F3', razonSocial: 'ANA' },
    { id: 'd', codigo: null, tipoDoc: 'DNI', nroDoc: '20111222', razonSocial: 'Pedro' },
  ]);
  const sin = { codigo: null, tipoDoc: '99' as const, nroDoc: 'F9' };
  assert.equal(indice.buscar({ ...sin, razonSocial: 'jose diaz' }), 'a');
  assert.equal(indice.buscar({ ...sin, razonSocial: 'Ana' }), undefined); // dos "Ana": no se adivina
  assert.equal(indice.buscar({ ...sin, razonSocial: 'Pedro' }), undefined); // Pedro tiene DNI: no se cruza por nombre
  assert.equal(indice.buscar({ codigo: 7, tipoDoc: '99', nroDoc: 'C7', razonSocial: 'José Díaz' }), undefined); // trae N° propio
});
