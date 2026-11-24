// Menú del panel: 8 secciones; las pantallas de cada una se ven como pestañas arriba.
// Una sola definición para el menú lateral (SidebarTenant) y las pestañas (PestanasSeccion).

export type Pestana = {
  nombre: string;
  href: string;
  soloDueno?: boolean;
  requiereCostos?: boolean; // módulo "Costos y listas de proveedores"
  activoEn?: string[]; // otras rutas que también cuentan como esta pestaña
};
export type Seccion = { nombre: string; icono: string; pestanas: Pestana[] };
export type SeccionVisible = Seccion & { href: string };

export const SECCIONES: Seccion[] = [
  { nombre: 'Punto de venta', icono: 'venta', pestanas: [{ nombre: 'Punto de venta', href: '/dashboard/ventas' }] },
  {
    nombre: 'Caja', icono: 'caja',
    pestanas: [
      { nombre: 'Cierre de caja', href: '/dashboard/cierre-z' },
      { nombre: 'Egresos', href: '/dashboard/egresos' },
    ],
  },
  {
    nombre: 'Productos', icono: 'productos',
    pestanas: [
      { nombre: 'Catálogo', href: '/dashboard/catalogo' },
      { nombre: 'Stock', href: '/dashboard/productos', activoEn: ['/dashboard/productos-destacados'] },
      { nombre: 'Repuestos', href: '/dashboard/repuestos' },
      { nombre: 'Edición rápida de costos', href: '/dashboard/costos/grilla', soloDueno: true, requiereCostos: true },
    ],
  },
  { nombre: 'Clientes', icono: 'clientes', pestanas: [{ nombre: 'Clientes', href: '/dashboard/clientes', soloDueno: true }] },
  { nombre: 'Servicio técnico', icono: 'servicio', pestanas: [{ nombre: 'Órdenes de servicio', href: '/dashboard/servicio' }] },
  {
    nombre: 'Proveedores', icono: 'proveedores',
    pestanas: [
      { nombre: 'Proveedores', href: '/dashboard/proveedores', soloDueno: true, activoEn: ['/dashboard/costos/dolar'] },
      {
        nombre: 'Importar lista', href: '/dashboard/costos/importar', soloDueno: true, requiereCostos: true,
        activoEn: ['/dashboard/costos/importaciones', '/dashboard/costos/comparador', '/dashboard/costos/estado'],
      },
      { nombre: 'Precios para aprobar', href: '/dashboard/costos/precios', soloDueno: true, requiereCostos: true },
    ],
  },
  {
    nombre: 'Reportes', icono: 'reportes',
    pestanas: [
      { nombre: 'Ganancia real', href: '/dashboard/rentabilidad', soloDueno: true },
      { nombre: 'Reportes', href: '/dashboard/reportes', soloDueno: true },
      { nombre: 'Estadísticas', href: '/dashboard/estadisticas-mensuales', soloDueno: true },
    ],
  },
  {
    nombre: 'Configuración', icono: 'configuracion',
    pestanas: [
      { nombre: 'Ganancia y precios', href: '/dashboard/costos/margenes', soloDueno: true, requiereCostos: true },
      { nombre: 'Personal y caja', href: '/dashboard/usuarios', soloDueno: true },
      { nombre: 'AFIP', href: '/dashboard/config-afip', soloDueno: true },
    ],
  },
];

/** Secciones con las pestañas que puede ver este usuario; la sección lleva a su primera pestaña. */
export function seccionesVisibles(u: { rol?: string | null; moduloCostos?: boolean | null }): SeccionVisible[] {
  const dueno = u.rol === 'OWNER';
  return SECCIONES.map((s) => ({
    ...s,
    pestanas: s.pestanas.filter((p) => (!p.soloDueno || dueno) && (!p.requiereCostos || !!u.moduloCostos)),
  }))
    .filter((s) => s.pestanas.length > 0)
    .map((s) => ({ ...s, href: s.pestanas[0].href }));
}

const coincide = (ruta: string, base: string) => ruta === base || ruta.startsWith(base + '/');

/** Sección y pestaña de la ruta actual (null si la ruta no es de ninguna, ej. el inicio). */
export function seccionActiva(ruta: string, secciones: SeccionVisible[]): { seccion: SeccionVisible; pestana: Pestana } | null {
  for (const seccion of secciones) {
    const pestana = seccion.pestanas.find((p) => coincide(ruta, p.href) || (p.activoEn ?? []).some((r) => coincide(ruta, r)));
    if (pestana) return { seccion, pestana };
  }
  return null;
}
