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

/** The custom properties a page's ancestors set inline, nearest first. */
function inherited(page: HTMLElement): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let at = page.parentElement; at; at = at.parentElement) {
    for (const name of Array.from(at.style)) {
      if (name.startsWith('--') && !(name in vars)) vars[name] = at.style.getPropertyValue(name);
    }
  }
  return vars;
}

/** What the page is printed on: its own background, or white. */
function paperColour(page: HTMLElement): string {
  const colour = getComputedStyle(page).backgroundColor;
  return colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)' ? '#ffffff' : colour;
}

async function addPages(pdf: PDFDocument, pages: HTMLElement[], settings: PrintSettings): Promise<void> {
  /* The printer's sheet: on A5, an A4 with two pages on it. */
  const sheetPaper = printerPaper(settings);
  const paper = paperSize(sheetPaper.paper, sheetPaper.orientation);
  /* The sheet's font comes with the app but loads when first used: drawn
     before it is in, a page came out in the fallback. */
  await document.fonts.ready;
  for (const page of pages) {
    const canvas = await domToCanvas(page, {
      /* Its own size, not the size on screen: the preview is scaled down to
         fit the dialog, and measured through that the page came out cropped
         to its top-left corner at twice the size. */
      width: page.offsetWidth,
      height: page.offsetHeight,
      scale: DPI / CSS_DPI,
      /* Under the page, not over it: the option is laid on with !important,
         and white there painted out a coloured page — an Einkaufsliste's
         board. Its own colour where it has one, white where it has none. */
      backgroundColor: paperColour(page),
      /* The page box carries the preview's drop shadow and the gap to the
         next page; neither is paper. */
      style: { boxShadow: 'none', margin: '0' },
      /* The sheet's colours — the page, an Einkaufsliste's cart, a title —
         are variables set on the sheet around the page, and a page drawn on
         its own has no sheet around it: they came out as nothing, the cart not
         at all. Set with setProperty, because `style` above is assigned by
         name, which a custom property does not take. */
      onCloneNode: (clone) => {
        for (const [name, value] of Object.entries(inherited(page))) {
          (clone as HTMLElement).style.setProperty(name, value);
        }
      },
    });
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the page could not be drawn'))), 'image/png'));
    const image = await pdf.embedPng(await png.arrayBuffer());
    const sheet = pdf.addPage([paper.width * PT_PER_MM, paper.height * PT_PER_MM]);
    sheet.drawImage(image, { x: 0, y: 0, width: sheet.getWidth(), height: sheet.getHeight() });
  }
}
