-- Servicio técnico: órdenes, ítems del presupuesto e historial de estados.
-- Solo tablas nuevas; no modifica tablas existentes.

-- CreateTable
CREATE TABLE "OrdenServicio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "clienteId" TEXT,
    "clienteNombre" TEXT NOT NULL,
    "clienteTelefono" TEXT,
    "equipoTipo" TEXT NOT NULL,
    "equipoMarca" TEXT,
    "equipoModelo" TEXT,
    "equipoSerie" TEXT,
    "equipoHoras" TEXT,
    "fallaReportada" TEXT NOT NULL,
    "diagnostico" TEXT,
    "tecnico" TEXT,
    "observaciones" TEXT,
    "fechaPrometida" TIMESTAMP(3),
    "validezDias" INTEGER NOT NULL DEFAULT 15,
    "stockDescontado" BOOLEAN NOT NULL DEFAULT false,
    "ventaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenServicioItem" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "productoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "ivaPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "posicion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrdenServicioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenServicioEvento" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT NOT NULL,
    "detalle" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenServicioEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenServicio_ventaId_key" ON "OrdenServicio"("ventaId");

-- CreateIndex
CREATE INDEX "OrdenServicio_empresaId_estado_idx" ON "OrdenServicio"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "OrdenServicio_empresaId_createdAt_idx" ON "OrdenServicio"("empresaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenServicio_empresaId_numero_key" ON "OrdenServicio"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "OrdenServicioItem_ordenId_idx" ON "OrdenServicioItem"("ordenId");

-- CreateIndex
CREATE INDEX "OrdenServicioItem_productoId_idx" ON "OrdenServicioItem"("productoId");

-- CreateIndex
CREATE INDEX "OrdenServicioEvento_ordenId_createdAt_idx" ON "OrdenServicioEvento"("ordenId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrdenServicio" ADD CONSTRAINT "OrdenServicio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicio" ADD CONSTRAINT "OrdenServicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicio" ADD CONSTRAINT "OrdenServicio_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicioItem" ADD CONSTRAINT "OrdenServicioItem_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicioItem" ADD CONSTRAINT "OrdenServicioItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicioEvento" ADD CONSTRAINT "OrdenServicioEvento_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenServicioEvento" ADD CONSTRAINT "OrdenServicioEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

