import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Alta y edición de la ficha de un cliente. Lo usan POST /clientes y PUT /clientes/:id.

export class ErrorCliente extends Error {}

export const CONDICIONES_IVA = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento'] as const;

export type DatosCliente = {
  tipoDoc?: string; nroDoc?: string; razonSocial?: string; condicionIva?: string;
  codigo?: number | string | null; direccion?: string | null; localidad?: string | null; provincia?: string | null;
  codigoPostal?: string | null; telefono?: string | null; celular?: string | null; email?: string | null;
  notas?: string | null; limiteCredito?: number | string | null;
};

const texto = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
};

const esGenerico = (c: { tipoDoc: string; nroDoc: string }) => c.tipoDoc === '99' && c.nroDoc === '0';

/** Arma los datos a guardar y valida documento y N° de cliente contra la empresa. */
export async function prepararCliente(empresaId: string, d: DatosCliente, actual?: { id: string; tipoDoc: string; nroDoc: string; codigo: number | null }) {
  const razonSocial = texto(d.razonSocial, 150);
  if (!razonSocial) throw new ErrorCliente('Indicá el nombre o la razón social.');
  const condicionIva = (CONDICIONES_IVA as readonly string[]).includes(String(d.condicionIva)) ? String(d.condicionIva) : 'Consumidor Final';

  // N° de cliente: si viene vacío en un alta, se asigna el siguiente
  let codigo: number | null;
  const codTexto = String(d.codigo ?? '').replace(/\D/g, '');
  if (codTexto) {
    codigo = parseInt(codTexto, 10);
    const otro = await prisma.cliente.findFirst({ where: { empresaId, codigo, ...(actual ? { NOT: { id: actual.id } } : {}) }, select: { razonSocial: true } });
    if (otro) throw new ErrorCliente(`El N° de cliente ${codigo} ya lo tiene ${otro.razonSocial}.`);
  } else if (actual) {
    codigo = null;
  } else {
    const ultimo = await prisma.cliente.findFirst({ where: { empresaId, codigo: { not: null } }, orderBy: { codigo: 'desc' }, select: { codigo: true } });
    codigo = (ultimo?.codigo ?? 0) + 1;
  }

  // Documento. El "Consumidor Final" genérico no cambia de documento.
  let tipoDoc = ['CUIT', 'DNI', '99'].includes(String(d.tipoDoc)) ? String(d.tipoDoc) : '99';
  let nroDoc = String(d.nroDoc ?? '').replace(/\D/g, '');
  if (actual && esGenerico(actual)) {
    tipoDoc = '99';
    nroDoc = '0';
  } else if (tipoDoc === 'CUIT' && nroDoc.length !== 11) {
    throw new ErrorCliente('El CUIT tiene que tener 11 dígitos.');
  } else if (tipoDoc === 'DNI' && (nroDoc.length < 7 || nroDoc.length > 8)) {
    throw new ErrorCliente('El DNI tiene que tener 7 u 8 dígitos.');
  } else if (tipoDoc === '99') {
    // Sin documento: AFIP recibe 0; guardamos un identificador interno único
    nroDoc = actual && actual.tipoDoc === '99' ? actual.nroDoc : codigo !== null ? `C${codigo}` : `S${Date.now()}`;
  }
  if (tipoDoc !== '99') {
    const otro = await prisma.cliente.findFirst({ where: { empresaId, tipoDoc, nroDoc, ...(actual ? { NOT: { id: actual.id } } : {}) }, select: { razonSocial: true } });
    if (otro) throw new ErrorCliente(`El ${tipoDoc} ${nroDoc} ya está cargado en ${otro.razonSocial}.`);
  } else if (!actual || actual.tipoDoc !== '99') {
    const choca = await prisma.cliente.findFirst({ where: { empresaId, tipoDoc: '99', nroDoc }, select: { id: true } });
    if (choca) nroDoc = `S${Date.now()}`;
  }

  const limiteTexto = String(d.limiteCredito ?? '').replace(/[^\d.,]/g, '').replace(',', '.');
  const limiteCredito = limiteTexto ? Math.max(0, parseFloat(limiteTexto)) || null : null;
  const email = texto(d.email, 150);
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new ErrorCliente('Revisá el email.');

  const data = {
    razonSocial, condicionIva, codigo, tipoDoc, nroDoc,
    direccion: texto(d.direccion, 200),
    localidad: texto(d.localidad, 100),
    provincia: texto(d.provincia, 100),
    codigoPostal: texto(d.codigoPostal, 20),
    telefono: texto(d.telefono, 50),
    celular: texto(d.celular, 50),
    email,
    notas: texto(d.notas, 2000),
    limiteCredito,
  } satisfies Prisma.ClienteUncheckedUpdateInput;
  return data;
}
