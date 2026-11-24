// Descarga del catálogo en PDF o Excel, para mandarlo por WhatsApp. Corre en el navegador.
import { gruposParaExportar, nombreArchivoCatalogo, type ProductoExportar } from '@/lib/catalogo';

const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fechaTexto = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

type Opciones = { empresa: string | null; titulo?: string; filtro?: string };

/** Comparte el archivo (en el celular abre WhatsApp y demás) o, si no se puede, lo descarga. */
async function entregar(blob: Blob, nombre: string) {
  const archivo = new File([blob], nombre, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (esCelular && nav.canShare?.({ files: [archivo] })) {
    try {
      await nav.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // canceló
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function descargarCatalogoPdf(items: ProductoExportar[], op: Opciones) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const grupos = gruposParaExportar(items);
  const hoy = new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(op.titulo || `Catálogo${op.empresa ? ` ${op.empresa}` : ''}`, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Precios al ${fechaTexto(hoy)}${op.filtro ? ` · ${op.filtro}` : ''} · Sujetos a cambio sin previo aviso`, 14, 22);
  doc.setTextColor(0);

  const body: (string | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [];
  for (const g of grupos) {
    body.push([{ content: g.categoria.toUpperCase(), colSpan: 4, styles: { fontStyle: 'bold', fillColor: [229, 231, 235], textColor: 20 } }]);
    for (const f of g.filas) body.push([f.codigo, f.nombre, pesos(f.efectivo), pesos(f.tarjeta)]);
  }

  autoTable(doc, {
    startY: 27,
    head: [['Código', 'Descripción', 'Efectivo', 'Tarjeta']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: [210, 210, 210], lineWidth: 0.1 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28 },
      2: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (c) => {
      if (c.section === 'head' && c.column.index >= 2) c.cell.styles.halign = 'right';
    },
    didDrawPage: () => {
      const pagina = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(`Página ${pagina}`, ancho - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  await entregar(doc.output('blob'), nombreArchivoCatalogo(op.empresa, hoy, 'pdf', op.filtro));
}

export async function descargarCatalogoExcel(items: ProductoExportar[], op: Opciones) {
  const XLSX = await import('xlsx');
  const grupos = gruposParaExportar(items);
  const hoy = new Date();
  const filas: (string | number)[][] = [
    [op.titulo || `Catálogo${op.empresa ? ` ${op.empresa}` : ''}`],
    [`Precios al ${fechaTexto(hoy)}${op.filtro ? ` · ${op.filtro}` : ''}`],
    [],
    ['Código', 'Descripción', 'Efectivo', 'Tarjeta'],
  ];
  for (const g of grupos) {
    filas.push([g.categoria.toUpperCase()]);
    for (const f of g.filas) filas.push([f.codigo, f.nombre, Math.round(f.efectivo), Math.round(f.tarjeta)]);
  }
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = [{ wch: 16 }, { wch: 60 }, { wch: 14 }, { wch: 14 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Catálogo');
  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await entregar(blob, nombreArchivoCatalogo(op.empresa, hoy, 'xlsx', op.filtro));
}
