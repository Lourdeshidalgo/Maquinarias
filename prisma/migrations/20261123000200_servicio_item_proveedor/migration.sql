-- Presupuesto de servicio técnico: proveedor elegido para cada repuesto (opcional)
ALTER TABLE "OrdenServicioItem" ADD COLUMN "proveedorId" TEXT;
CREATE INDEX "OrdenServicioItem_proveedorId_idx" ON "OrdenServicioItem"("proveedorId");
ALTER TABLE "OrdenServicioItem" ADD CONSTRAINT "OrdenServicioItem_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
