-- Módulo Costos y listas de proveedores: tablas nuevas.
-- Producto.costoActualizadoAt arranca con la fecha de hoy para los productos existentes.
-- El proveedor actual de cada producto se copia a ProveedorProducto (preferido) al activar el módulo en la empresa (lib/costos-db.ts).

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "costoActualizadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "margenPorcentaje" DECIMAL(7,2);

-- CreateTable
CREATE TABLE "ConfiguracionCostos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "margenGeneral" DECIMAL(7,2) NOT NULL DEFAULT 30,
    "margenMinimo" DECIMAL(7,2) NOT NULL DEFAULT 15,
    "redondeo" INTEGER NOT NULL DEFAULT 0,
    "modoPrecio" TEXT NOT NULL DEFAULT 'APROBACION',
    "ivaEnCosto" BOOLEAN NOT NULL DEFAULT true,
    "umbralAmarillo" INTEGER NOT NULL DEFAULT 15,
    "umbralRojo" INTEGER NOT NULL DEFAULT 30,
    "alertaSubaPct" DECIMAL(7,2) NOT NULL DEFAULT 50,
    "alertaBajaPct" DECIMAL(7,2) NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionCostos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProveedorProducto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "codigoProveedor" TEXT,
    "descripcionProveedor" TEXT,
    "costoLista" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "bonificaciones" TEXT NOT NULL DEFAULT '',
    "incluyeIva" BOOLEAN NOT NULL DEFAULT true,
    "preferido" BOOLEAN NOT NULL DEFAULT false,
    "costoActualizadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importacionId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialCosto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "proveedorProductoId" TEXT,
    "proveedorId" TEXT,
    "origen" TEXT NOT NULL,
    "afectaVigente" BOOLEAN NOT NULL DEFAULT true,
    "costoListaAnterior" DECIMAL(14,2),
    "costoListaNuevo" DECIMAL(14,2),
    "moneda" TEXT,
    "costoAnterior" DECIMAL(14,2) NOT NULL,
    "costoNuevo" DECIMAL(14,2) NOT NULL,
    "precioVentaAnterior" DECIMAL(14,2),
    "precioVentaNuevo" DECIMAL(14,2),
    "importacionId" TEXT,
    "loteId" TEXT,
    "usuarioId" TEXT,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionLista" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "fechaVigencia" TIMESTAMP(3) NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "archivoTipo" TEXT NOT NULL,
    "archivoUrl" TEXT,
    "mapeo" JSONB,
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "subas" INTEGER NOT NULL DEFAULT 0,
    "bajas" INTEGER NOT NULL DEFAULT 0,
    "sinCambios" INTEGER NOT NULL DEFAULT 0,
    "nuevos" INTEGER NOT NULL DEFAULT 0,
    "faltantes" INTEGER NOT NULL DEFAULT 0,
    "alertas" INTEGER NOT NULL DEFAULT 0,
    "aplicados" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadaAt" TIMESTAMP(3),
    "deshechaAt" TIMESTAMP(3),

    CONSTRAINT "ImportacionLista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionItem" (
    "id" TEXT NOT NULL,
    "importacionId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "codigo" TEXT,
    "descripcion" TEXT,
    "precio" DECIMAL(14,2),
    "moneda" TEXT,
    "marca" TEXT,
    "rubro" TEXT,
    "bonificaciones" TEXT,
    "tipoMatch" TEXT NOT NULL,
    "productoId" TEXT,
    "proveedorProductoId" TEXT,
    "sugerenciaProductoId" TEXT,
    "costoListaAnterior" DECIMAL(14,2),
    "variacionPct" DECIMAL(9,2),
    "estado" TEXT NOT NULL,
    "alerta" BOOLEAN NOT NULL DEFAULT false,
    "accion" TEXT NOT NULL DEFAULT 'APLICAR',
    "seleccionado" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "ImportacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantillaImportacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "mapeo" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantillaImportacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "valor" DECIMAL(14,4) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuente" TEXT NOT NULL DEFAULT 'MANUAL',
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaMargen" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT,
    "proveedorId" TEXT,
    "margen" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaMargen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioSugerido" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "precioActual" DECIMAL(14,2) NOT NULL,
    "precioSugerido" DECIMAL(14,2) NOT NULL,
    "costoReal" DECIMAL(14,2) NOT NULL,
    "margenAplicado" DECIMAL(7,2) NOT NULL,
    "nivelMargen" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "importacionId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoAt" TIMESTAMP(3),

    CONSTRAINT "PrecioSugerido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionCostos_empresaId_key" ON "ConfiguracionCostos"("empresaId");

-- CreateIndex
CREATE INDEX "ProveedorProducto_empresaId_productoId_idx" ON "ProveedorProducto"("empresaId", "productoId");

-- CreateIndex
CREATE INDEX "ProveedorProducto_empresaId_proveedorId_activo_idx" ON "ProveedorProducto"("empresaId", "proveedorId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "ProveedorProducto_proveedorId_productoId_key" ON "ProveedorProducto"("proveedorId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProveedorProducto_proveedorId_codigoProveedor_key" ON "ProveedorProducto"("proveedorId", "codigoProveedor");

-- CreateIndex
CREATE INDEX "HistorialCosto_empresaId_productoId_createdAt_idx" ON "HistorialCosto"("empresaId", "productoId", "createdAt");

-- CreateIndex
CREATE INDEX "HistorialCosto_importacionId_idx" ON "HistorialCosto"("importacionId");

-- CreateIndex
CREATE INDEX "HistorialCosto_empresaId_loteId_idx" ON "HistorialCosto"("empresaId", "loteId");

-- CreateIndex
CREATE INDEX "ImportacionLista_empresaId_proveedorId_createdAt_idx" ON "ImportacionLista"("empresaId", "proveedorId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportacionLista_empresaId_estado_idx" ON "ImportacionLista"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "ImportacionItem_importacionId_estado_idx" ON "ImportacionItem"("importacionId", "estado");

-- CreateIndex
CREATE INDEX "ImportacionItem_importacionId_fila_idx" ON "ImportacionItem"("importacionId", "fila");

-- CreateIndex
CREATE UNIQUE INDEX "PlantillaImportacion_proveedorId_key" ON "PlantillaImportacion"("proveedorId");

-- CreateIndex
CREATE INDEX "PlantillaImportacion_empresaId_idx" ON "PlantillaImportacion"("empresaId");

-- CreateIndex
CREATE INDEX "Cotizacion_empresaId_moneda_fecha_idx" ON "Cotizacion"("empresaId", "moneda", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaMargen_empresaId_categoria_key" ON "ReglaMargen"("empresaId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaMargen_empresaId_proveedorId_key" ON "ReglaMargen"("empresaId", "proveedorId");

-- CreateIndex
CREATE INDEX "PrecioSugerido_empresaId_estado_idx" ON "PrecioSugerido"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "PrecioSugerido_productoId_estado_idx" ON "PrecioSugerido"("productoId", "estado");

-- AddForeignKey
ALTER TABLE "ConfiguracionCostos" ADD CONSTRAINT "ConfiguracionCostos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorProducto" ADD CONSTRAINT "ProveedorProducto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorProducto" ADD CONSTRAINT "ProveedorProducto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorProducto" ADD CONSTRAINT "ProveedorProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorProducto" ADD CONSTRAINT "ProveedorProducto_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionLista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_proveedorProductoId_fkey" FOREIGN KEY ("proveedorProductoId") REFERENCES "ProveedorProducto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionLista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCosto" ADD CONSTRAINT "HistorialCosto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionLista" ADD CONSTRAINT "ImportacionLista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionLista" ADD CONSTRAINT "ImportacionLista_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionLista" ADD CONSTRAINT "ImportacionLista_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionItem" ADD CONSTRAINT "ImportacionItem_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionLista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantillaImportacion" ADD CONSTRAINT "PlantillaImportacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantillaImportacion" ADD CONSTRAINT "PlantillaImportacion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaMargen" ADD CONSTRAINT "ReglaMargen_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaMargen" ADD CONSTRAINT "ReglaMargen_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioSugerido" ADD CONSTRAINT "PrecioSugerido_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioSugerido" ADD CONSTRAINT "PrecioSugerido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioSugerido" ADD CONSTRAINT "PrecioSugerido_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionLista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

