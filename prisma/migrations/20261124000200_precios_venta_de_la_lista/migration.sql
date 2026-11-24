-- Precios de venta que trae la lista del proveedor (contado y tarjeta), para mostrarlos como en su Excel
ALTER TABLE "ImportacionItem" ADD COLUMN "precioContado" DECIMAL(14,2);
ALTER TABLE "ImportacionItem" ADD COLUMN "precioTarjeta" DECIMAL(14,2);
ALTER TABLE "ProveedorProducto" ADD COLUMN "precioContadoLista" DECIMAL(14,2);
ALTER TABLE "ProveedorProducto" ADD COLUMN "precioTarjetaLista" DECIMAL(14,2);
