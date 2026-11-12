-- Amplía todos los montos de Decimal(10,2) a Decimal(14,2) (máx. 999.999.999.999,99).
-- Aumentar la precisión de NUMERIC sin cambiar la escala no reescribe ni pierde datos.
-- Agrega el flag del módulo de costos por empresa (apagado por defecto).

-- AlterTable
ALTER TABLE "CajaDiaria" ALTER COLUMN "montoInicial" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "facturadoTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "efectivoNeto" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "totalCaja" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "CierreCaja" ALTER COLUMN "montoInicial" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "facturadoTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "efectivoNeto" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "totalCaja" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Cliente" ALTER COLUMN "limiteCredito" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "saldoCuentaCorriente" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "EgresoCaja" ALTER COLUMN "monto" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "EgresoCostoAsignacion" ALTER COLUMN "costoUnitario" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "montoTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "moduloCostos" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MovimientoCuentaCorriente" ALTER COLUMN "importe" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "saldoResultante" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Pago" ALTER COLUMN "monto" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Plan" ALTER COLUMN "precioMensual" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Producto" ALTER COLUMN "precioCosto" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costoPackaging" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costoEnvio" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "precioVenta" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Venta" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "iva" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "descuentoTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "VentaItem" ALTER COLUMN "precioUnitario" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costoUnitario" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2);

