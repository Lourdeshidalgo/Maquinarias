// Empresa demo del rubro maquinaria agrícola y jardinería, con el módulo de
// costos activo. Pensado para mostrar el sistema (también en un entorno
// publicado), así que NO crea los usuarios root/superadmin del seed general.
//
// Uso:
//   SEED_DEMO_PASSWORD='...' npx ts-node prisma/seed-maquinaria.ts
//   SEED_RESET=1 ...   → borra la empresa demo y la vuelve a crear
//
// Todo en pesos. Los datos son inventados.

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const CUIT_DEMO = '30000000007';
const EMAIL_DUENO = 'demo.maquinaria@example.com';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const DIA = 86_400_000;
const haceDias = (d: number) => new Date(Date.now() - d * DIA);

// Reglas de recargo sobre el costo (mismo criterio que lib/costos.ts)
const RECARGO_GENERAL = 30;
const RECARGO_CATEGORIA: Record<string, number> = { Tractores: 15, Implementos: 18, 'Herramientas de jardín': 45 };
const REDONDEO = 100;
const precioVenta = (costo: number, recargo: number) => Math.round((costo * (1 + recargo / 100)) / REDONDEO) * REDONDEO;

type Prov = 'AMS' | 'DVJ' | 'RLP';
type Item = {
  codigo: string; nombre: string; categoria: string; iva: number; costo: number; stock: number; min: number;
  prov: Prov; codProv: string;
  // Otro proveedor que también lo vende (para el comparador): costo de lista y código
  alternativo?: { prov: Prov; codProv: string; costo: number; bonif?: string };
  historial?: number[]; // costos anteriores, del más viejo al más nuevo (para el gráfico)
};

const PROVEEDORES: Record<Prov, { nombre: string; cuit: string; contacto: string; telefono: string; email: string; diasLista: number }> = {
  AMS: { nombre: 'Agromáquinas del Sur S.A.', cuit: '30000000015', contacto: 'Martín Ferreyra', telefono: '0291 455-0101', email: 'ventas@agromaquinas.example.com', diasLista: 8 },
  DVJ: { nombre: 'Distribuidora Verde Jardín', cuit: '30000000023', contacto: 'Laura Benítez', telefono: '011 4700-2020', email: 'pedidos@verdejardin.example.com', diasLista: 22 },
  RLP: { nombre: 'Repuestos y Lubricantes Pampa', cuit: '30000000031', contacto: 'Diego Sosa', telefono: '02983 43-3030', email: 'listas@repuestospampa.example.com', diasLista: 45 },
};

const ITEMS: Item[] = [
  // Tractores (IVA 10,5%)
  { codigo: 'TR-001', nombre: 'Tractor 75 HP doble tracción', categoria: 'Tractores', iva: 10.5, costo: 52_000_000, stock: 2, min: 1, prov: 'AMS', codProv: 'AMS-T75', historial: [44_500_000, 47_200_000, 49_800_000] },
  { codigo: 'TR-002', nombre: 'Tractor 110 HP con cabina', categoria: 'Tractores', iva: 10.5, costo: 89_500_000, stock: 1, min: 1, prov: 'AMS', codProv: 'AMS-T110C', historial: [78_000_000, 84_300_000] },
  { codigo: 'TR-003', nombre: 'Tractor compacto 25 HP', categoria: 'Tractores', iva: 10.5, costo: 21_800_000, stock: 3, min: 1, prov: 'AMS', codProv: 'AMS-T25' },
  { codigo: 'TR-004', nombre: 'Tractor parquero 22 HP corte 1,07 m', categoria: 'Tractores', iva: 21, costo: 9_800_000, stock: 2, min: 1, prov: 'AMS', codProv: 'AMS-TP22', historial: [8_900_000, 9_350_000] },
  // Implementos (IVA 10,5%)
  { codigo: 'IM-001', nombre: 'Rastra de discos 20 platos', categoria: 'Implementos', iva: 10.5, costo: 6_900_000, stock: 2, min: 1, prov: 'AMS', codProv: 'AMS-RD20' },
  { codigo: 'IM-002', nombre: 'Pala frontal para tractor', categoria: 'Implementos', iva: 10.5, costo: 4_200_000, stock: 3, min: 1, prov: 'AMS', codProv: 'AMS-PF01' },
  { codigo: 'IM-003', nombre: 'Desmalezadora de arrastre 1,80 m', categoria: 'Implementos', iva: 10.5, costo: 3_650_000, stock: 2, min: 1, prov: 'AMS', codProv: 'AMS-DA180' },
  { codigo: 'IM-004', nombre: 'Sembradora de grano fino 15 surcos', categoria: 'Implementos', iva: 10.5, costo: 18_400_000, stock: 1, min: 0, prov: 'AMS', codProv: 'AMS-SGF15' },
  { codigo: 'IM-005', nombre: 'Pulverizadora de arrastre 2000 l', categoria: 'Implementos', iva: 10.5, costo: 12_700_000, stock: 1, min: 0, prov: 'AMS', codProv: 'AMS-PU2000' },
  // Maquinaria de jardín (IVA 21%)
  { codigo: 'JM-001', nombre: 'Motosierra 52 cc espada 45 cm', categoria: 'Maquinaria de jardín', iva: 21, costo: 420_000, stock: 6, min: 2, prov: 'DVJ', codProv: 'DVJ-0101', alternativo: { prov: 'RLP', codProv: 'RLP-MS52', costo: 445_000, bonif: '5' }, historial: [365_000, 392_000] },
  { codigo: 'JM-002', nombre: 'Desmalezadora a explosión 43 cc', categoria: 'Maquinaria de jardín', iva: 21, costo: 310_000, stock: 8, min: 3, prov: 'DVJ', codProv: 'DVJ-0102' },
  { codigo: 'JM-003', nombre: 'Cortacésped a explosión 21" autopropulsado', categoria: 'Maquinaria de jardín', iva: 21, costo: 690_000, stock: 4, min: 2, prov: 'DVJ', codProv: 'DVJ-0103' },
  { codigo: 'JM-004', nombre: 'Cortacésped eléctrico 1600 W', categoria: 'Maquinaria de jardín', iva: 21, costo: 245_000, stock: 5, min: 2, prov: 'DVJ', codProv: 'DVJ-0104' },
  { codigo: 'JM-005', nombre: 'Sopladora a explosión 26 cc', categoria: 'Maquinaria de jardín', iva: 21, costo: 210_000, stock: 4, min: 2, prov: 'DVJ', codProv: 'DVJ-0105' },
  { codigo: 'JM-006', nombre: 'Hidrolavadora 1800 W 140 bar', categoria: 'Maquinaria de jardín', iva: 21, costo: 280_000, stock: 3, min: 1, prov: 'DVJ', codProv: 'DVJ-0106' },
  { codigo: 'JM-007', nombre: 'Motocultivador 7 HP', categoria: 'Maquinaria de jardín', iva: 21, costo: 1_150_000, stock: 2, min: 1, prov: 'DVJ', codProv: 'DVJ-0107' },
  // Herramientas de jardín (IVA 21%)
  { codigo: 'HJ-001', nombre: 'Tijera de podar profesional', categoria: 'Herramientas de jardín', iva: 21, costo: 28_500, stock: 15, min: 5, prov: 'DVJ', codProv: 'DVJ-0201' },
  { codigo: 'HJ-002', nombre: 'Manguera reforzada 1/2" x 25 m', categoria: 'Herramientas de jardín', iva: 21, costo: 36_000, stock: 20, min: 6, prov: 'DVJ', codProv: 'DVJ-0202' },
  { codigo: 'HJ-003', nombre: 'Rastrillo metálico 16 dientes', categoria: 'Herramientas de jardín', iva: 21, costo: 14_900, stock: 12, min: 4, prov: 'DVJ', codProv: 'DVJ-0203' },
  { codigo: 'HJ-004', nombre: 'Pala punta corazón mango largo', categoria: 'Herramientas de jardín', iva: 21, costo: 22_000, stock: 10, min: 4, prov: 'DVJ', codProv: 'DVJ-0204' },
  { codigo: 'HJ-005', nombre: 'Carretilla 90 l rueda neumática', categoria: 'Herramientas de jardín', iva: 21, costo: 98_000, stock: 6, min: 2, prov: 'DVJ', codProv: 'DVJ-0205' },
  { codigo: 'HJ-006', nombre: 'Aspersor oscilante 16 picos', categoria: 'Herramientas de jardín', iva: 21, costo: 17_500, stock: 14, min: 5, prov: 'DVJ', codProv: 'DVJ-0206' },
  // Repuestos y lubricantes (IVA 21%)
  { codigo: 'RL-001', nombre: 'Aceite motor 15W40 bidón 20 l', categoria: 'Repuestos y lubricantes', iva: 21, costo: 165_000, stock: 10, min: 4, prov: 'RLP', codProv: 'RLP-1540-20' },
  { codigo: 'RL-002', nombre: 'Aceite hidráulico 68 bidón 20 l', categoria: 'Repuestos y lubricantes', iva: 21, costo: 142_000, stock: 8, min: 3, prov: 'RLP', codProv: 'RLP-H68-20' },
  { codigo: 'RL-003', nombre: 'Filtro de aceite tractor 75 HP', categoria: 'Repuestos y lubricantes', iva: 21, costo: 18_500, stock: 25, min: 8, prov: 'RLP', codProv: 'RLP-FA75' },
  { codigo: 'RL-004', nombre: 'Filtro de aire tractor 75 HP', categoria: 'Repuestos y lubricantes', iva: 21, costo: 32_000, stock: 18, min: 6, prov: 'RLP', codProv: 'RLP-FAI75' },
  { codigo: 'RL-005', nombre: 'Cadena motosierra 3/8 72 eslabones', categoria: 'Repuestos y lubricantes', iva: 21, costo: 24_000, stock: 30, min: 10, prov: 'RLP', codProv: 'RLP-C38-72', alternativo: { prov: 'DVJ', codProv: 'DVJ-0301', costo: 22_800 } },
  { codigo: 'RL-006', nombre: 'Tanza para desmalezadora 3 mm x 100 m', categoria: 'Repuestos y lubricantes', iva: 21, costo: 26_500, stock: 22, min: 8, prov: 'RLP', codProv: 'RLP-T3-100', alternativo: { prov: 'DVJ', codProv: 'DVJ-0302', costo: 29_000, bonif: '10' } },
  { codigo: 'RL-007', nombre: 'Bujía para motor 2 tiempos', categoria: 'Repuestos y lubricantes', iva: 21, costo: 6_800, stock: 60, min: 20, prov: 'RLP', codProv: 'RLP-BJ2T' },
  { codigo: 'RL-008', nombre: 'Aceite 2 tiempos 1 l', categoria: 'Repuestos y lubricantes', iva: 21, costo: 12_500, stock: 40, min: 15, prov: 'RLP', codProv: 'RLP-A2T-1', alternativo: { prov: 'DVJ', codProv: 'DVJ-0303', costo: 13_900 } },
];

async function main() {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Definí SEED_DEMO_PASSWORD (mínimo 8 caracteres) con la contraseña del usuario demo.');
  }

  const existente = await prisma.empresa.findUnique({ where: { cuit: CUIT_DEMO } });
  if (existente && process.env.SEED_RESET !== '1') {
    console.log('La empresa demo ya existe. Usá SEED_RESET=1 para recrearla.');
    return;
  }
  if (existente) {
    await prisma.ventaItem.deleteMany({ where: { venta: { empresaId: existente.id } } });
    await prisma.usuario.deleteMany({ where: { empresaId: existente.id } });
    await prisma.empresa.delete({ where: { id: existente.id } });
    console.log('Empresa demo anterior borrada.');
  }

  // Planes (los usa la suscripción); si ya existen se reutilizan.
  let plan = await prisma.plan.findFirst({ where: { nombre: 'Premium' } });
  if (!plan) {
    for (const p of [
      { nombre: 'Prueba', precioMensual: 0, limiteVentasMensuales: 50, limiteUsuarios: 2, limiteSucursales: 1 },
      { nombre: 'Básico', precioMensual: 15000, limiteVentasMensuales: 500, limiteUsuarios: 3, limiteSucursales: 1 },
      { nombre: 'Premium', precioMensual: 30000, limiteVentasMensuales: 0, limiteUsuarios: 999, limiteSucursales: 0 },
    ]) {
      if (!(await prisma.plan.findFirst({ where: { nombre: p.nombre } }))) await prisma.plan.create({ data: p });
    }
    plan = await prisma.plan.findFirst({ where: { nombre: 'Premium' } });
  }

  const empresa = await prisma.empresa.create({
    data: {
      nombre: 'Campo y Jardín Demo',
      cuit: CUIT_DEMO,
      condicionIva: 'Responsable Inscripto',
      estado: 'ACTIVO',
      moduloCostos: true,
      configAfip: {
        create: { cuit: CUIT_DEMO, razonSocial: 'Campo y Jardín Demo', condicionIva: 'Responsable Inscripto', puntoVenta: 1, modo: 'demo' },
      },
      suscripcion: { create: { planId: plan!.id, estado: 'authorized', fechaVencimiento: new Date(Date.now() + 3650 * DIA) } },
      configuracionCostos: {
        create: { margenGeneral: RECARGO_GENERAL, margenMinimo: 12, redondeo: REDONDEO, modoPrecio: 'APROBACION', umbralAmarillo: 15, umbralRojo: 30 },
      },
    },
  });

  const dueno = await prisma.usuario.create({
    data: { nombre: 'Dueño Demo', email: EMAIL_DUENO, passwordHash: hashPassword(password), rol: 'OWNER', empresaId: empresa.id },
  });
  await prisma.cliente.create({
    data: { empresaId: empresa.id, tipoDoc: '99', nroDoc: '0', razonSocial: 'Consumidor Final Genérico', condicionIva: 'Consumidor Final', saldoCuentaCorriente: 0 },
  });
  await prisma.cliente.create({
    data: {
      empresaId: empresa.id, tipoDoc: 'CUIT', nroDoc: '20000000001', razonSocial: 'Establecimiento La Aurora (demo)',
      condicionIva: 'Responsable Inscripto', saldoCuentaCorriente: 0, limiteCredito: 50_000_000,
    },
  });

  const proveedores = {} as Record<Prov, string>;
  for (const [clave, p] of Object.entries(PROVEEDORES) as [Prov, (typeof PROVEEDORES)[Prov]][]) {
    const creado = await prisma.proveedor.create({
      data: { empresaId: empresa.id, nombre: p.nombre, cuit: p.cuit, contacto: p.contacto, telefono: p.telefono, email: p.email },
    });
    proveedores[clave] = creado.id;
  }

  // Reglas de recargo por categoría (la general está en la configuración)
  for (const [categoria, margen] of Object.entries(RECARGO_CATEGORIA)) {
    await prisma.reglaMargen.create({ data: { empresaId: empresa.id, tipo: 'CATEGORIA', categoria, margen } });
  }

  for (const it of ITEMS) {
    const recargo = RECARGO_CATEGORIA[it.categoria] ?? RECARGO_GENERAL;
    const fechaCosto = haceDias(PROVEEDORES[it.prov].diasLista);
    const producto = await prisma.producto.create({
      data: {
        empresaId: empresa.id, proveedorId: proveedores[it.prov], codigo: it.codigo, nombre: it.nombre, categoria: it.categoria,
        unidad: 'unidad', precioCosto: it.costo, precioVenta: precioVenta(it.costo, recargo), ivaPorcentaje: it.iva,
        stockActual: it.stock, stockMinimo: it.min, costoActualizadoAt: fechaCosto,
      },
    });
    const pp = await prisma.proveedorProducto.create({
      data: {
        empresaId: empresa.id, proveedorId: proveedores[it.prov], productoId: producto.id, codigoProveedor: it.codProv,
        descripcionProveedor: it.nombre, costoLista: it.costo, moneda: 'ARS', incluyeIva: true, preferido: true, costoActualizadoAt: fechaCosto,
      },
    });
    if (it.alternativo) {
      await prisma.proveedorProducto.create({
        data: {
          empresaId: empresa.id, proveedorId: proveedores[it.alternativo.prov], productoId: producto.id, codigoProveedor: it.alternativo.codProv,
          descripcionProveedor: it.nombre, costoLista: it.alternativo.costo, bonificaciones: it.alternativo.bonif ?? '', moneda: 'ARS',
          incluyeIva: true, preferido: false, costoActualizadoAt: haceDias(PROVEEDORES[it.alternativo.prov].diasLista),
        },
      });
    }
    // Historial de costos para ver la evolución en el gráfico del producto
    if (it.historial?.length) {
      const serie = [...it.historial, it.costo];
      const paso = 25;
      for (let i = 1; i < serie.length; i++) {
        const dias = PROVEEDORES[it.prov].diasLista + (serie.length - 1 - i) * paso;
        await prisma.historialCosto.create({
          data: {
            empresaId: empresa.id, productoId: producto.id, proveedorProductoId: pp.id, proveedorId: proveedores[it.prov], origen: i % 2 ? 'IMPORTACION' : 'MANUAL',
            costoListaAnterior: serie[i - 1], costoListaNuevo: serie[i], moneda: 'ARS', costoAnterior: serie[i - 1], costoNuevo: serie[i],
            precioVentaAnterior: precioVenta(serie[i - 1], recargo), precioVentaNuevo: precioVenta(serie[i], recargo),
            usuarioId: dueno.id, detalle: i % 2 ? 'Lista del proveedor' : 'Aumento informado por el proveedor', createdAt: haceDias(dias),
          },
        });
      }
    }
  }

  console.log(`Empresa demo creada: ${empresa.nombre} · ${ITEMS.length} productos · 3 proveedores`);
  console.log(`Usuario: ${EMAIL_DUENO} (la contraseña es la de SEED_DEMO_PASSWORD)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
