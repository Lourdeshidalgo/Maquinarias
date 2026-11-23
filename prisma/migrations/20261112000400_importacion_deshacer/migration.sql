-- Estado anterior de cada fila aplicada, para poder deshacer la importación.
ALTER TABLE "ImportacionItem" ADD COLUMN     "aplicado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ppAnterior" JSONB,
ADD COLUMN     "productoAnterior" JSONB,
ADD COLUMN     "productoCreadoId" TEXT;
