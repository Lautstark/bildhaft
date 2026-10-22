import type { Board, Collection, CollectionKind, PrintSettings, SavedPdf, Sentence } from '../core/types.ts';
import { contentOf, DEFAULT_PRINT_SETTINGS, kindOf, titleOf, titlePictures } from '../core/types.ts';
import { boardOf, placedIds, stylesOf, zonesOf } from '../core/board.ts';
import { copyrightFor, creditLines, tafelFieldMm } from '../ui/printSheet.ts';
import { sungParts } from '../core/song.ts';
import { patchCollection } from '../db/repo.ts';
import { keepsPdfs, pdfFolderFor, readPdf, writePdf } from '../db/folder.ts';
import { download } from '@lautstark/werkzeuge/download';
import { t } from '../i18n/index.ts';
import { notify } from './notify.ts';
import type { PrintOptions } from '../ui/printDialog.svelte.ts';
import { activeCollection, kind, provider, providerId, s } from './state.svelte.ts';
import { persistSettings } from './settings.ts';
import { openPrint } from './templates.ts';

/**
 * The print settings a template opens on — its entry in `TEMPLATES` says
 * which, and why.
 *
 * A function of its inputs and nothing else, so tests/unit/print-for.test.ts
 * can hold each template to its opening layout without a page. `own` is what
 * this Sammlung set for itself.
 */
export function printFor(
  print: PrintSettings, which: CollectionKind, board: Board | null,
  own: Partial<PrintSettings> = {},
): PrintSettings {
  return openPrint(which, print, own, board);
}

/**
 * What a Sammlung set for itself: where `print` differs from what its
 * template gives by itself, and nothing else. Only the difference, so that a
 * Sammlung given another template takes that template's defaults rather than
 * carrying the last one's, and the household's copyright choice not at all.
 */
export function ownPrint(which: CollectionKind, print: PrintSettings, board: Board | null): Partial<PrintSettings> {
  const plain = printFor(DEFAULT_PRINT_SETTINGS, which, board);
  const own: Partial<Record<keyof PrintSettings, unknown>> = {};
  for (const key of Object.keys(print) as (keyof PrintSettings)[]) {
    if (key !== 'showCopyright' && print[key] !== plain[key]) own[key] = print[key];
  }
  return own as Partial<PrintSettings>;
}

/** What this Sammlung has set for its printing, written to it. */
async function keepPrint(print: PrintSettings): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const own = ownPrint(kind(), print, kind() === 'tafel' ? boardOf(open) : null);
  if (JSON.stringify(open.print ?? {}) === JSON.stringify(own)) return;
  const next: Collection = { ...open, print: own, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { print: own });
}

/**
 * What every Sammlung's print starts from, under its template's defaults and
 * what it set for itself: the same for all of them. Only whether the METACOM
 * notice prints is the household's, because it is about passing paper on,
 * not about any one material.
 */
function printBase(): PrintSettings {
  return { ...DEFAULT_PRINT_SETTINGS, showCopyright: s.settings!.print.showCopyright };
}

/**
 * Once: what Satzstreifen, Wortkarten and Tafeln printed with when their
 * settings were the household's, written onto each of them — exactly what
 * each printed with, a Tafel's own air included — so that nothing changes on
 * paper the day their settings became their own. After this a new Sammlung
 * starts from its template, never from the one printed last.
 */
export async function movePrintOntoMaterials(collections: Collection[]): Promise<Collection[]> {
  if (!s.settings || s.settings.printOnMaterial) return collections;
  const household = s.settings.print;
  const moved = await Promise.all(collections.map(async (collection) => {
    const which = kindOf(collection);
    if (!SHARED_BEFORE.includes(which)) return collection;
    const board = which === 'tafel' ? boardOf(collection) : null;
    const own = collection.print ?? {};
    const print = ownPrint(which, printFor({ ...household, ...own }, which, board, own), board);
    if (JSON.stringify(print) === JSON.stringify(own)) return collection;
    await patchCollection(collection.id, { print });
    return { ...collection, print };
  }));
  persistSettings({ ...s.settings, printOnMaterial: true });
  return moved;
}

/* The templates whose print settings were the household's until 2026-10-22. */
const SHARED_BEFORE: CollectionKind[] = ['satzstreifen', 'wortkarten', 'tafel'];

/** „2026-10-19 A5 hoch": what a saved PDF is called — its day, its paper. */
export function pdfStem(at: Date, print: Pick<PrintSettings, 'paper' | 'orientation'>): string {
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const side = (print.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')).toLowerCase();
  return `${day} ${print.paper.toUpperCase()} ${side}`;
}

/**
 * A PDF of the open Sammlung, kept: into the Ablage folder beside it, and
 * onto its list, where the folder is the store; downloaded where it is not —
 * a browser on its own has nowhere to keep a file it could open again.
 */
async function keepPdf(pdf: Blob, print: PrintSettings, pages: number): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const now = new Date();
  const stem = pdfStem(now, print);
  if (!keepsPdfs()) {
    download(pdf, `${pdfFolderFor(open.name)} ${stem}.pdf`);
    return;
  }
  const path = await writePdf(pdfFolderFor(open.name), stem, pdf);
  if (!path) {
    download(pdf, `${pdfFolderFor(open.name)} ${stem}.pdf`);
    return;
  }
  const saved: SavedPdf = { path, at: now.getTime(), paper: print.paper, orientation: print.orientation, pages };
  const pdfs = [saved, ...(open.pdfs ?? [])];
  const next: Collection = { ...open, pdfs, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { pdfs });
  notify(t('ui.pdf_saved', { name: path.split('/').pop() ?? path }));
}

/** Opens a saved PDF in a new tab, or says that it is no longer there. */
export async function openSavedPdf(saved: SavedPdf): Promise<void> {
  const pdf = await readPdf(saved.path);
  if (!pdf) { notify(t('ui.pdf_gone')); return; }
  const url = URL.createObjectURL(pdf);
  window.open(url, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * What the open Sammlung prints, put together for a preview: the rows in the
 * order the paper wants them, the Tafel's grid or the Lied's parts, and the
 * settings it opens on. One answer for the column beside the Sammlung and for
 * the big preview, so the two can never show different sheets. Null when
 * there is nothing to print.
 */
export function printOptions(): PrintOptions | null {
  const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence]));
  /* A Tafel prints whole and in its own order: the fields, free ones
     included, and nothing from the tray. What is asked for is ignored on
     purpose — there is no such thing as printing half a Tafel. A Tafel with
     every field free is still a Tafel, and a blank laminated one is a thing
     people make. */
  const open = activeCollection();
  const board = kind() === 'tafel' && open ? boardOf(open) : null;
  /* A Rezept prints whole too, and in the order it reads on screen: oldest
     first, each part in its place on the paper. */
  /* A Lied prints whole, as it is sung: every part where it comes, its rows
     looked up by id each time, so a row sung ten times is the same row ten
     times on paper. */
  const song = kind() === 'lied' && open?.song ? {
    parts: sungParts(open.song).map((at) => ({
      kind: at.kind, n: at.n, first: at.first,
      lines: at.part.lines.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)),
    })),
  } : null;
  /* A Plauderbuch prints whole and in its order: page after page, each with
     its question, then the cards to cut out for all of them. */
  const talk = kind() === 'plauderbuch' && open?.talk ? {
    pages: open.talk.pages.map((page) => ({
      question: page.question ? byId.get(page.question) ?? null : null,
      sayings: page.sayings.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)),
    })),
  } : null;
  const chosen = board
    ? placedIds(board).map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x))
    : song
      ? [...new Set(song.parts.flatMap((part) => part.lines))]
    : talk
      ? talk.pages.flatMap((page) => [...(page.question ? [page.question] : []), ...page.sayings])
    : kind() === 'rezept'
      ? [...s.sentences].sort((a, b) => a.createdAt - b.createdAt)
      : contentOf(s.sentences);
  if ((chosen.length === 0 && !board) || !s.settings) return null;

  return {
    sentences: chosen,
    kind: kind(),
    board: board ? {
      cols: board.cols, rows: board.rows, zones: zonesOf(board), styles: stylesOf(board),
      cells: board.cells.map((id) => (id ? byId.get(id) ?? null : null)),
    } : null,
    song,
    talk,
    collectionName: open ? titleOf(open) : 'bildhaft',
    pictures: titlePictures(s.sentences),
    /* What this Sammlung set, over its template's defaults, under what the
       template always is (templates.ts). */
    settings: printFor(printBase(), kind(), board, open?.print ?? {}),
    onChange: (print: PrintSettings) => {
      if (!s.settings) return;
      /* The Sammlung keeps what was set, so it prints tomorrow as it printed
         today; nothing of it reaches another one. Whether the METACOM notice
         prints is the household's, and keepPrint leaves it out. */
      if (print.showCopyright !== s.settings.print.showCopyright) {
        persistSettings({ ...s.settings, print: { ...s.settings.print, showCopyright: print.showCopyright } });
      }
      void keepPrint(print);
    },
    onPdf: (pdf, print, pages) => keepPdf(pdf, print, pages),
    provider: providerId(),
    attribution: provider().attribution,
    onClose: () => undefined,
  };
}

/** The paper the open Sammlung prints on, as its template opens it. */
export function paperOf(): Pick<PrintSettings, 'paper' | 'orientation'> | null {
  const open = activeCollection();
  if (!open || !s.settings) return null;
  const board = kind() === 'tafel' ? boardOf(open) : null;
  const print = printFor(printBase(), kind(), board, open.print ?? {});
  return { paper: print.paper, orientation: print.orientation };
}



/**
 * One field of the open Tafel on its paper, in millimetres — what the sheet
 * will make of it, asked the same way the sheet asks: the same credits under
 * it, the same name over it. Null for anything that is not a Tafel.
 */
export function tafelField(): { width: number; height: number } | null {
  const open = activeCollection();
  if (!open || kind() !== 'tafel' || !s.settings) return null;
  const board = boardOf(open);
  const print = printFor(printBase(), kind(), board, open.print ?? {});
  const credits = creditLines(provider().attribution, copyrightFor(providerId(), print.showCopyright));
  const titled = !print.showCollectionTitle || !titleOf(open).trim() ? false
    : titlePictures(s.sentences).length > 0 ? 'pictured' : 'text';
  return tafelFieldMm(print, board, credits, titled);
}
