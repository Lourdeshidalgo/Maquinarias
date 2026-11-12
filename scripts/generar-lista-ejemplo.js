/* eslint-disable no-console */
// Genera ejemplos/listas/agromaquinas-lista-ejemplo.xlsx: una lista de precios
// inventada de "Agromáquinas del Sur" para probar la importación contra la
// empresa demo (prisma/seed-maquinaria.ts). Formato distinto al del sistema:
// título, fecha, encabezados en la fila 5, secciones y "precio con IVA".
const XLSX = require('xlsx');
const path = require('path');

const filas = [
  ['AGROMÁQUINAS DEL SUR S.A.'],
  ['LISTA DE PRECIOS N° 47 — Vigencia: 01/12/2026'],
  ['Precios en pesos, IVA incluido. Sujetos a modificación sin previo aviso.'],
  [],
  ['Cód.', 'Artículo', 'Línea', 'Precio Lista c/IVA'],
  ['TRACTORES'],
  ['AMS-T75', 'Tractor 75 HP 4x4', 'Tractores', '$ 55.120.000,00'],     // +6%
  ['AMS-T110C', 'Tractor 110 HP cabinado', 'Tractores', '$ 94.870.000,00'], // +6%
  ['AMS-T25', 'Tractor compacto 25 HP', 'Tractores', '$ 22.672.000,00'],   // +4%
  ['AMS-TP22', 'Tractor parquero 22 HP 1,07 m', 'Tractores', '$ 9.800.000,00'], // sin cambios
  ['IMPLEMENTOS'],
  ['AMS-RD20', 'Rastra de discos 20 platos', 'Implementos', '$ 7.245.000,00'],  // +5%
  ['AMS-PF01', 'Pala frontal universal', 'Implementos', '$ 4.074.000,00'],      // -3%
  ['AMS-DA180', 'Desmalezadora arrastre 1,80 m', 'Implementos', '$ 5.913.000,00'], // +62% (para revisar)
  ['AMS-SGF15', 'Sembradora grano fino 15 surcos', 'Implementos', '$ 19.320.000,00'], // +5%
  ['AMS-ROT180', 'Rotativa de 3 puntos 1,80 m', 'Implementos', '$ 3.480.000,00'], // nuevo
  // AMS-PU2000 (pulverizadora) no viene en esta lista → aparece como faltante
];

const ws = XLSX.utils.aoa_to_sheet(filas);
ws['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 14 }, { wch: 20 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Lista 47');
const destino = path.join(__dirname, '..', 'ejemplos', 'listas', 'agromaquinas-lista-ejemplo.xlsx');
XLSX.writeFile(wb, destino);
console.log('Generado', destino);
