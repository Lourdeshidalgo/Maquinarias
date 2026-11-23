// Lectura de un tramo de una lista de precios en PDF con Gemini (solo servidor).
// El navegador corta el PDF en tramos de pocas páginas; acá se manda cada tramo a la
// API de Gemini con salida estructurada (JSON) y se devuelven los renglones leídos.
import { ApiError, GoogleGenAI } from '@google/genai';
import { ESQUEMA_RENGLONES, type RenglonLeido } from '@/lib/listas/pdf-renglones';

export class ErrorLecturaPdf extends Error {}

const MODELO = 'gemini-flash-latest';

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

  let respuesta: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    respuesta = await ai.models.generateContent({
      model: MODELO,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') } },
            { text: INSTRUCCIONES },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', responseJsonSchema: ESQUEMA_RENGLONES, temperature: 0 },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 429) throw new ErrorLecturaPdf('Se llegó al límite de uso de Gemini. Esperá un minuto y reintentá.');
      if (e.status === 400 && /api key/i.test(e.message)) throw new ErrorLecturaPdf('La clave de Gemini no es válida.');
      if (e.status === 401 || e.status === 403) throw new ErrorLecturaPdf('La clave de Gemini no es válida o no tiene permiso.');
      if (e.status === 400) throw new ErrorLecturaPdf(`Gemini no aceptó estas páginas: ${e.message.slice(0, 200)}`);
      throw new ErrorLecturaPdf('No se pudo conectar con Gemini. Reintentá.');
    }
    throw e;
  }

  const uso = { entrada: respuesta.usageMetadata?.promptTokenCount ?? 0, salida: respuesta.usageMetadata?.candidatesTokenCount ?? 0 };
  console.info(`[lista-pdf] gemini tokens entrada=${uso.entrada} salida=${uso.salida} modelo=${respuesta.modelVersion ?? MODELO}`);

  const fin = respuesta.candidates?.[0]?.finishReason;
  if (fin === 'MAX_TOKENS') throw new ErrorLecturaPdf('Las páginas tienen demasiados productos; probá con menos páginas.');
  if (fin && fin !== 'STOP') throw new ErrorLecturaPdf('Gemini no pudo leer estas páginas. Reintentá.');

  try {
    const datos = JSON.parse(respuesta.text ?? '') as { renglones?: RenglonLeido[] };
    if (!Array.isArray(datos.renglones)) throw new Error('sin renglones');
    return { renglones: datos.renglones, uso };
  } catch {
    throw new ErrorLecturaPdf('La respuesta de Gemini no se pudo interpretar. Reintentá.');
  }
}
