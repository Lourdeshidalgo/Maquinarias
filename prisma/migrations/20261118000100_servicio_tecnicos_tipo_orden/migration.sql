-- Servicio técnico: lista de técnicos, tipo de orden (taller / domicilio) y N° de orden externo
ALTER TABLE "Empresa" ADD COLUMN "servicioTecnicos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "OrdenServicio" ADD COLUMN "tipoOrden" TEXT NOT NULL DEFAULT 'TALLER',
  ADD COLUMN "ordenExterna" TEXT;
