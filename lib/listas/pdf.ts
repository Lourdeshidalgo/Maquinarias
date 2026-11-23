// Lectura de un tramo de una lista de precios en PDF con Gemini (solo servidor).
// El navegador corta el PDF en tramos de pocas páginas; acá se manda cada tramo a la
// API de Gemini con salida estructurada (JSON) y se devuelven los renglones leídos.
import { ApiError, GoogleGenAI } from '@google/genai';
import { ESQUEMA_RENGLONES, type RenglonLeido } from '@/lib/listas/pdf-renglones';

export class ErrorLecturaPdf extends Error {}

// Si el principal está saturado (503), se usa el liviano.
const MODELOS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];

export const pdfConfigurado = () => !!process.env.GEMINI_API_KEY;

const INSTRUCCIONES = `Estas páginas son parte de una lista de precios de un proveedor de repuestos, herramientas y máquinas (Argentina).
Extraé un renglón por cada producto que tenga código o precio. Reglas:
- Ignorá portadas, índices, encabezados, pies de página, condiciones comerciales y datos de contacto.
- codigo: el código del artículo tal como figura en la lista, sin el "#" inicial. No confundas con medidas o pesos (ej. "450gr", "700mm" no son códigos). null si no tiene.
- descripcion: el nombre del producto como lo escribe el proveedor; podés sumar la medida o el modelo si distinguen al producto (ej. "Martillo de goma 450 g"). Sin listas largas de especificaciones.
- precio: el precio unitario tal como figura (por ejemplo "$ 6.196,07" o 17.4). Si el producto muestra precio regular y precio de oferta, usá el que la lista presenta como precio unitario a pagar. null si no tiene precio.
- moneda: "USD" si el precio está en dólares (U$S, USD, US$, dólares), "ARS" si está en pesos, null si no se puede saber.
- codigoFabricante: el número de parte del fabricante u OEM si figura (en una columna o dentro de la descripción). null si no figura.
- marca y rubro: si figuran, si no null.
- pagina: número de página dentro de este documento (1 = la primera página que recibiste).
Si una tabla tiene varias variantes de un mismo producto (distintas medidas con su propio código y precio), cada variante es un renglón.
Si estas páginas no tienen productos, devolvé "renglones": [].`;

/** Lee un tramo de PDF (ya recortado) y devuelve sus renglones. Lanza ErrorLecturaPdf con un mensaje para el usuario. */
export async function leerTramoPdf(pdf: Uint8Array): Promise<{ renglones: RenglonLeido[]; uso: { entrada: number; salida: number } }> {
  if (!pdfConfigurado()) throw new ErrorLecturaPdf('La lectura de PDF no está configurada (falta la clave de Gemini).');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Interactions API (la que Google recomienda en lugar de generateContent).
  const pedir = (model: string) =>
    ai.interactions.create({
      model,
      input: [
        { type: 'document', data: Buffer.from(pdf).toString('base64'), mime_type: 'application/pdf' },
        { type: 'text', text: INSTRUCCIONES },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: ESQUEMA_RENGLONES },
    });

  let respuesta: Awaited<ReturnType<typeof pedir>> | undefined;
  try {
    for (const [i, model] of MODELOS.entries()) {
      try {
        respuesta = await pedir(model);
        break;
      } catch (e) {
        const saturado = e instanceof ApiError && (e.status === 503 || e.status === 500);
        if (!saturado || i === MODELOS.length - 1) throw e;
      }
    }
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 429) throw new ErrorLecturaPdf('Se llegó al límite de uso de Gemini. Esperá un minuto y reintentá.');
      if (e.status === 400 && /api key/i.test(e.message)) throw new ErrorLecturaPdf('La clave de Gemini no es válida.');
      if (e.status === 401 || e.status === 403) throw new ErrorLecturaPdf('La clave de Gemini no es válida o no tiene permiso.');
      if (e.status === 400) throw new ErrorLecturaPdf(`Gemini no aceptó estas páginas: ${e.message.slice(0, 200)}`);
      if (e.status === 503) throw new ErrorLecturaPdf('Gemini está saturado en este momento. Esperá un minuto y reintentá.');
      throw new ErrorLecturaPdf('No se pudo conectar con Gemini. Reintentá.');
    }
    throw e;
  }

  if (!respuesta) throw new ErrorLecturaPdf('No se pudo conectar con Gemini. Reintentá.');
  const uso = { entrada: respuesta.usage?.total_input_tokens ?? 0, salida: respuesta.usage?.total_output_tokens ?? 0 };
  console.info(`[lista-pdf] gemini tokens entrada=${uso.entrada} salida=${uso.salida} modelo=${respuesta.model ?? '?'}`);
  if (respuesta.status === 'incomplete' || respuesta.status === 'budget_exceeded') {
    throw new ErrorLecturaPdf('Las páginas tienen demasiados productos; probá con menos páginas.');
  }
  if (respuesta.status && respuesta.status !== 'completed') throw new ErrorLecturaPdf('Gemini no pudo leer estas páginas. Reintentá.');

  try {
    const datos = JSON.parse(respuesta.output_text ?? '') as { renglones?: RenglonLeido[] };
    if (!Array.isArray(datos.renglones)) throw new Error('sin renglones');
    return { renglones: datos.renglones, uso };
  } catch {
    throw new ErrorLecturaPdf('La respuesta de Gemini no se pudo interpretar. Reintentá.');
  }
}
