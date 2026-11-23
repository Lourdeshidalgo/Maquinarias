import type { Prisma } from '@prisma/client';

/**
 * Filtro de búsqueda de productos que usan Stock, Repuestos y el presupuesto de
 * servicio técnico: nombre, códigos, categoría y datos de repuesto (N° de parte,
 * marca, modelos compatibles, ubicación). Cada palabra tiene que aparecer en algún
 * campo: "cadena ms 180" encuentra la cadena compatible con MS 180.
 */
export function filtroBusquedaProducto(search: string): Prisma.ProductoWhereInput[] {
  const q = search.trim();
  if (!q) return [];
  const campos = (t: string): Prisma.ProductoWhereInput[] => [
    { nombre: { contains: t, mode: 'insensitive' } },
    { codigo: { contains: t, mode: 'insensitive' } },
    { categoria: { contains: t, mode: 'insensitive' } },
    { codigos: { some: { codigo: { contains: t, mode: 'insensitive' } } } },
    { codigoFabricante: { contains: t, mode: 'insensitive' } },
    { marca: { contains: t, mode: 'insensitive' } },
    { compatibles: { contains: t, mode: 'insensitive' } },
    { ubicacion: { contains: t, mode: 'insensitive' } },
  ];
  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (palabras.length > 1) return [{ OR: [...campos(q), { AND: palabras.map((w) => ({ OR: campos(w) })) }] }];
  return [{ OR: campos(q) }];
}
