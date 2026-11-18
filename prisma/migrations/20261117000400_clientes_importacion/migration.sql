-- Clientes: datos para importar el padrón del sistema anterior
ALTER TABLE "Cliente" ADD COLUMN "codigo" INTEGER,
  ADD COLUMN "celular" TEXT,
  ADD COLUMN "localidad" TEXT,
  ADD COLUMN "provincia" TEXT,
  ADD COLUMN "codigoPostal" TEXT,
  ADD COLUMN "notas" TEXT;
CREATE UNIQUE INDEX "Cliente_empresaId_codigo_key" ON "Cliente"("empresaId", "codigo");
