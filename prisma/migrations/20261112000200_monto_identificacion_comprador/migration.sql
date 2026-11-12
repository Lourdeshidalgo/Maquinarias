-- Monto desde el que ARCA exige identificar al comprador (DNI/CUIT). 0 = sin control.
-- AlterTable
ALTER TABLE "ConfiguracionAfip" ADD COLUMN     "montoIdentificacion" DECIMAL(14,2) NOT NULL DEFAULT 10000000;

