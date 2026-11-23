// Lectura de un tramo de una lista de precios en PDF con Claude (solo servidor).
// El navegador corta el PDF en tramos de pocas páginas; acá se manda cada tramo a la
// API de Anthropic con salida estructurada y se devuelven los renglones leídos.
import Anthropic from '@anthropic-ai/sdk';
import { ESQUEMA_RENGLONES, type RenglonLeido } from '@/lib/listas/pdf-renglones';

export class ErrorLecturaPdf extends Error {}

export const pdfConfigurado = () => !!process.env.ANTHROPIC_API_KEY;

const INSTRUCCIONES = `Estas páginas son parte de una lista de precios de un proveedor de repuestos y herramientas (Argentina).
Extraé un renglón por cada producto que tenga precio. Reglas:
- Ignorá portadas, índices, encabezados, pies de página, condiciones comerciales, datos de contacto y especificaciones técnicas sueltas.
- codigo: el código del artículo tal como figura en la lista, sin el "#" inicial. null si no tiene.
- descripcion: el nombre del producto como lo escribe el proveedor (sin las especificaciones largas).
- precio: el precio unitario tal como figura (por ejemplo "$ 6.196,07" o 17.4). Si el producto muestra precio regular y precio de oferta, usá el que la lista presenta como precio unitario a pagar. null si no tiene precio.
- moneda: "USD" si el precio está en dólares (U$S, USD, US$, dólares), "ARS" si está en pesos, null si no se puede saber.
- codigoFabricante: el número de parte del fabricante u OEM si figura (en una columna o dentro de la descripción). null si no figura.
- marca y rubro: si figuran, si no null.
- pagina: número de página dentro de este documento (1 = la primera página que recibiste).
Si estas páginas no tienen productos con precio, devolvé "renglones": [].`;

/** Lee un tramo de PDF (ya recortado) y devuelve sus renglones. Lanza ErrorLecturaPdf con un mensaje para el usuario. */
export async function leerTramoPdf(pdf: Uint8Array): Promise<{ renglones: RenglonLeido[]; uso: { entrada: number; salida: number } }> {
  if (!pdfConfigurado()) throw new ErrorLecturaPdf('La lectura de PDF no está configurada.');
  const client = new Anthropic();
  let mensaje: Anthropic.Beta.BetaMessage;
  try {
    mensaje = await client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_RENGLONES } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(pdf).toString('base64') } },
              { type: 'text', text: INSTRUCCIONES },
            ],
          },
        ],
      })
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorLecturaPdf('La clave de Anthropic no es válida.');
    if (e instanceof Anthropic.RateLimitError) throw new ErrorLecturaPdf('El servicio de lectura está ocupado. Esperá un minuto y reintentá.');
    if (e instanceof Anthropic.BadRequestError) throw new ErrorLecturaPdf(`El servicio no aceptó estas páginas: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new ErrorLecturaPdf('No se pudo conectar con el servicio de lectura. Reintentá.');
    throw e;
  }

  const uso = { entrada: mensaje.usage.input_tokens, salida: mensaje.usage.output_tokens };
  console.info(`[lista-pdf] tokens entrada=${uso.entrada} salida=${uso.salida} modelo=${mensaje.model}`);
  if (mensaje.stop_reason === 'refusal') throw new ErrorLecturaPdf('El servicio no pudo leer estas páginas.');
  if (mensaje.stop_reason === 'max_tokens') throw new ErrorLecturaPdf('Las páginas tienen demasiados productos; probá con menos páginas.');

  const texto = mensaje.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  try {
    const datos = JSON.parse(texto) as { renglones?: RenglonLeido[] };
    if (!Array.isArray(datos.renglones)) throw new Error('sin renglones');
    return { renglones: datos.renglones, uso };
  } catch {
    throw new ErrorLecturaPdf('La respuesta del servicio no se pudo interpretar. Reintentá.');
  }
}
