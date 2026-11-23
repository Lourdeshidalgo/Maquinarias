-- Catálogo de repuestos: datos propios de un repuesto en el producto
ALTER TABLE "Producto" ADD COLUMN "esRepuesto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "codigoFabricante" TEXT,
  ADD COLUMN "marca" TEXT,
  ADD COLUMN "compatibles" TEXT,
  ADD COLUMN "ubicacion" TEXT;
CREATE INDEX "Producto_empresaId_esRepuesto_idx" ON "Producto"("empresaId", "esRepuesto");
