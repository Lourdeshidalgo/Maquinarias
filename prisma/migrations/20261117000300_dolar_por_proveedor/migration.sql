-- Dólar y descuento base por proveedor, y recargo para el precio crédito.

-- Descuento del proveedor sobre su lista (ej "25+15"); lo reemplazan las bonificaciones propias del producto.
ALTER TABLE "Proveedor" ADD COLUMN "bonificacionesBase" TEXT NOT NULL DEFAULT '';

-- Precio con tarjeta de crédito = precio de venta + este %.
ALTER TABLE "ConfiguracionCostos" ADD COLUMN "recargoCredito" DECIMAL(7,2) NOT NULL DEFAULT 10;

-- Dólar propio de un proveedor (null = dólar general de la empresa; las cotizaciones existentes quedan como generales).
ALTER TABLE "Cotizacion" ADD COLUMN "proveedorId" TEXT;
CREATE INDEX "Cotizacion_empresaId_proveedorId_moneda_fecha_idx" ON "Cotizacion"("empresaId", "proveedorId", "moneda", "fecha");
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
