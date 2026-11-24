-- Productos que solo están en el catálogo (vienen de una lista de proveedor y no están en Stock)
ALTER TABLE "Producto" ADD COLUMN "soloCatalogo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Producto_empresaId_soloCatalogo_activo_idx" ON "Producto"("empresaId", "soloCatalogo", "activo");
