import { PDFDocument } from 'pdf-lib';
import { domToCanvas } from 'modern-screenshot';
import type { PrintSettings } from '../core/types.ts';
import { paperSize, printerPaper } from './printSheet.ts';

/**
 * The print preview, made into a PDF by bildhaft itself.
 *
 * Each sheet of the preview is the whole paper — the printable area with the
 * paper's margin around it — so each is drawn to a picture at 300 dpi and laid
 * on a PDF page of exactly that paper. A picture rather than text and lines,
 * because the preview is the one thing already proven to break where the
 * printer breaks: drawing the same page again by other means would be a second
 * layout to keep in step with the first, and the first one is what was looked
 * at before saving. 300 dpi is what a printer is fed; a symbol's edge and a
 * 9 pt word under it are sharp at it.
 *
 * The browser's own print dialog stays for printing; this is for keeping.
 */
const DPI = 300;
const CSS_DPI = 96;
const PT_PER_MM = 72 / 25.4;

export async function previewToPdf(pages: HTMLElement[], settings: PrintSettings): Promise<Blob> {
  return previewsToPdf([{ pages, settings }]);
}

/**
 * Several previews as the one file — the group print's PDF. Each part keeps
 * its own paper, so an A5 material's sheets stand beside an A4 one's, each as
 * the sheet its printer would get.
 */
export async function previewsToPdf(parts: { pages: HTMLElement[]; settings: PrintSettings }[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (const part of parts) await addPages(pdf, part.pages, part.settings);
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

async function addPages(pdf: PDFDocument, pages: HTMLElement[], settings: PrintSettings): Promise<void> {
  /* The printer's sheet: on A5, an A4 with two pages on it. */
  const sheetPaper = printerPaper(settings);
  const paper = paperSize(sheetPaper.paper, sheetPaper.orientation);
  for (const page of pages) {
    const canvas = await domToCanvas(page, {
      /* Its own size, not the size on screen: the preview is scaled down to
         fit the dialog, and measured through that the page came out cropped
         to its top-left corner at twice the size. */
      width: page.offsetWidth,
      height: page.offsetHeight,
      scale: DPI / CSS_DPI,
      backgroundColor: '#ffffff',
      /* The page box carries the preview's drop shadow and the gap to the
         next page; neither is paper. */
      style: { boxShadow: 'none', margin: '0' },
    });
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the page could not be drawn'))), 'image/png'));
    const image = await pdf.embedPng(await png.arrayBuffer());
    const sheet = pdf.addPage([paper.width * PT_PER_MM, paper.height * PT_PER_MM]);
    sheet.drawImage(image, { x: 0, y: 0, width: sheet.getWidth(), height: sheet.getHeight() });
  }
}
