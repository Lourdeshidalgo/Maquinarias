-- Servicio técnico: seña, accesorios, notas internas, modalidad y numeración inicial
ALTER TABLE "Empresa" ADD COLUMN "servicioNumeroDesde" INTEGER;
ALTER TABLE "OrdenServicio" ADD COLUMN "modalidad" TEXT NOT NULL DEFAULT 'PRESUPUESTAR',
  ADD COLUMN "accesorios" TEXT,
  ADD COLUMN "notasInternas" TEXT,
  ADD COLUMN "senaMonto" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "senaFormaPago" TEXT,
  ADD COLUMN "senaFecha" TIMESTAMP(3);
CREATE INDEX "OrdenServicio_empresaId_senaFecha_idx" ON "OrdenServicio"("empresaId", "senaFecha");
