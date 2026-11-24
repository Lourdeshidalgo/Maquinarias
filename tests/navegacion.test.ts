import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seccionActiva, seccionesVisibles } from '../lib/navegacion.ts';

test('seccionesVisibles: el dueño con módulo de costos ve las 8 secciones', () => {
  const s = seccionesVisibles({ rol: 'OWNER', moduloCostos: true });
  assert.deepEqual(s.map((x) => x.nombre), ['Punto de venta', 'Caja', 'Productos', 'Clientes', 'Servicio técnico', 'Proveedores', 'Reportes', 'Configuración']);
  assert.deepEqual(s.find((x) => x.nombre === 'Productos')!.pestanas.map((p) => p.nombre), ['Catálogo', 'Stock', 'Repuestos', 'Edición rápida de costos']);
  assert.equal(s.find((x) => x.nombre === 'Productos')!.href, '/dashboard/catalogo');
});

test('seccionesVisibles: sin módulo de costos no aparecen sus pestañas', () => {
  const s = seccionesVisibles({ rol: 'OWNER', moduloCostos: false });
  assert.deepEqual(s.find((x) => x.nombre === 'Proveedores')!.pestanas.map((p) => p.nombre), ['Proveedores']);
  assert.ok(!s.find((x) => x.nombre === 'Productos')!.pestanas.some((p) => p.nombre === 'Edición rápida de costos'));
  assert.ok(!s.find((x) => x.nombre === 'Configuración')!.pestanas.some((p) => p.nombre === 'Ganancia y precios'));
});

test('seccionesVisibles: el empleado ve solo lo que puede usar', () => {
  const s = seccionesVisibles({ rol: 'EMPLOYEE', moduloCostos: true });
  assert.deepEqual(s.map((x) => x.nombre), ['Punto de venta', 'Caja', 'Productos', 'Servicio técnico']);
  assert.deepEqual(s.find((x) => x.nombre === 'Productos')!.pestanas.map((p) => p.nombre), ['Catálogo', 'Stock', 'Repuestos']);
});

test('seccionActiva: encuentra la sección y la pestaña por la ruta (también subrutas y pantallas relacionadas)', () => {
  const s = seccionesVisibles({ rol: 'OWNER', moduloCostos: true });
  assert.deepEqual(pick(seccionActiva('/dashboard/egresos', s)), ['Caja', 'Egresos']);
  assert.deepEqual(pick(seccionActiva('/dashboard/costos/importaciones', s)), ['Proveedores', 'Importar lista']);
  assert.deepEqual(pick(seccionActiva('/dashboard/servicio/123', s)), ['Servicio técnico', 'Órdenes de servicio']);
  assert.deepEqual(pick(seccionActiva('/dashboard/productos-destacados', s)), ['Productos', 'Stock']);
  assert.equal(seccionActiva('/dashboard', s), null);
});

const pick = (r: ReturnType<typeof seccionActiva>) => (r ? [r.seccion.nombre, r.pestana.nombre] : null);
