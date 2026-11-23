import { prisma } from '@/lib/prisma';

// Importación del padrón de clientes desde un Excel del sistema anterior.
// La pantalla lee el archivo (SheetJS) y manda las filas tal cual; acá se
// detectan las columnas por su título, se normalizan los datos y se cargan.
// Si el cliente ya existe (mismo N° de cliente, documento o, sin ninguno de
// los dos, mismo nombre) se
// actualizan sus datos de contacto; nunca se toca el saldo de cuenta corriente.

import { indiceExistentes, interpretarFilas, type ClienteImportado } from './padron';

export type { ClienteImportado };

export type ResumenImportacion = {
  filas: number;
  validos: number;
  nuevos: number;
  actualizados: number;
  omitidos: number;
  conCuit: number;
  conDni: number;
  sinDocumento: number;
  avisos: string[]; // primeros avisos, para mostrar
  totalAvisos: number;
  ejemplos: Pick<ClienteImportado, 'codigo' | 'razonSocial' | 'tipoDoc' | 'nroDoc' | 'celular' | 'localidad'>[];
};

const CONTACTO = (c: ClienteImportado) => ({
  razonSocial: c.razonSocial,
  direccion: c.direccion,
  telefono: c.telefono,
  celular: c.celular,
  email: c.email,
  localidad: c.localidad,
  provincia: c.provincia,
  codigoPostal: c.codigoPostal,
  notas: c.notas,
});

/** Analiza (simular) o carga el padrón en la empresa. */
export async function importarClientes(empresaId: string, filas: unknown[][], simular: boolean): Promise<ResumenImportacion> {
  const { clientes, avisos, omitidos, filas: totalFilas } = interpretarFilas(filas);

  // Clientes que ya existen: por N° de cliente o por documento
  const existentes = await prisma.cliente.findMany({
    where: { empresaId },
    select: { id: true, codigo: true, tipoDoc: true, nroDoc: true, razonSocial: true },
  });
  const indice = indiceExistentes(existentes);
  const { porCodigo } = indice;

  const nuevos: ClienteImportado[] = [];
  const actualizar: { id: string; c: ClienteImportado }[] = [];
  for (const c of clientes) {
    const id = indice.buscar(c);
    if (id) actualizar.push({ id, c });
    else nuevos.push(c);
  }

  if (!simular) {
    for (let i = 0; i < nuevos.length; i += 500) {
      await prisma.cliente.createMany({
        data: nuevos.slice(i, i + 500).map((c) => ({
          empresaId, codigo: c.codigo, tipoDoc: c.tipoDoc, nroDoc: c.nroDoc, condicionIva: c.condicionIva, saldoCuentaCorriente: 0, ...CONTACTO(c),
        })),
        skipDuplicates: true,
      });
    }
    for (let i = 0; i < actualizar.length; i += 200) {
      await prisma.$transaction(
        actualizar.slice(i, i + 200).map(({ id, c }) =>
          prisma.cliente.update({ where: { id }, data: { ...CONTACTO(c), ...(c.codigo !== null && !porCodigo.has(c.codigo) ? { codigo: c.codigo } : {}) } })
        )
      );
    }
  }

  return {
    filas: totalFilas,
    validos: clientes.length,
    nuevos: nuevos.length,
    actualizados: actualizar.length,
    omitidos,
    conCuit: clientes.filter((c) => c.tipoDoc === 'CUIT').length,
    conDni: clientes.filter((c) => c.tipoDoc === 'DNI').length,
    sinDocumento: clientes.filter((c) => c.tipoDoc === '99').length,
    avisos: avisos.slice(0, 50),
    totalAvisos: avisos.length,
    ejemplos: clientes.slice(0, 5).map(({ codigo, razonSocial, tipoDoc, nroDoc, celular, localidad }) => ({ codigo, razonSocial, tipoDoc, nroDoc, celular, localidad })),
  };
}
