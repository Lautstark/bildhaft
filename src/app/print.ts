import type { Board, Collection, CollectionKind, PrintSettings, SavedPdf, Sentence } from '../core/types.ts';
import { boardOf, placedIds, stylesOf, zonesOf } from '../core/board.ts';
import { METACOM_COPYRIGHT, tafelFieldMm } from '../ui/printSheet.ts';
import { sungParts } from '../core/song.ts';
import { patchCollection } from '../db/repo.ts';
import { keepsPdfs, pdfFolderFor, readPdf, writePdf } from '../db/folder.ts';
import { download } from '@lautstark/werkzeuge/download';
import { t } from '../i18n/index.ts';
import { notify } from './notify.ts';
import type { PrintOptions } from '../ui/printDialog.svelte.ts';
import { activeCollection, kind, provider, providerId, s } from './state.svelte.ts';
import { persistSettings } from './settings.ts';
import { TEMPLATES } from './templates.ts';

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
  return TEMPLATES[which].opens(print, own, board);
}

/** What this Sammlung has set for its printing, written to it — everything but the household's copyright choice. */
async function keepPrint(print: PrintSettings): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const { showCopyright: _copyright, ...own } = print;
  if (JSON.stringify(open.print) === JSON.stringify(own)) return;
  const next: Collection = { ...open, print: own, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  await patchCollection(next.id, { print: own });
}

/**
 * The settings a print of the open Sammlung starts from: the household's
 * defaults, under what this Sammlung has set for itself, under what its
 * template insists on. Whether the METACOM notice prints stays the
 * household's whatever the Sammlung says.
 */
function printBase(): PrintSettings {
  const own = activeCollection()?.print ?? {};
  return { ...s.settings!.print, ...own, showCopyright: s.settings!.print.showCopyright };
}

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
  const chosen = board
    ? placedIds(board).map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x))
    : song
      ? [...new Set(song.parts.flatMap((part) => part.lines))]
    : kind() === 'rezept'
      ? [...s.sentences].sort((a, b) => a.createdAt - b.createdAt)
      : s.sentences;
  if ((chosen.length === 0 && !board) || !s.settings) return null;

  return {
    sentences: chosen,
    kind: kind(),
    board: board ? {
      cols: board.cols, rows: board.rows, zones: zonesOf(board), styles: stylesOf(board),
      cells: board.cells.map((id) => (id ? byId.get(id) ?? null : null)),
    } : null,
    song,
    collectionName: open?.name ?? 'bildhaft',
    /* A Wortkarten-Sammlung opens on the card sheet, whatever the remembered
       layout says. Strips are a shape for a sentence: a strip of one symbol
       is a card with the wrong margins, so the stored preference here is not
       a preference, it is the other template's setting arriving in this one.
       The control is still there and still changes it for this print.

       Not symmetrical. A Satzstreifen-Sammlung keeps whatever was chosen,
       because cutting sentences into cards is a thing people actually do. */
    settings: printFor(printBase(), kind(), board, open?.print ?? {}),
    onChange: (print: PrintSettings) => {
      if (!s.settings) return;
      /* Twice, on purpose. The household's defaults follow along, so the
         next Sammlung starts from what was last wanted; and the Sammlung
         keeps its own, so this one prints tomorrow as it printed today,
         whatever was set elsewhere in between.

         Not for a template that keeps its print to itself (`ownPrint`): its
         colour and its small cards handed to the household would be the next
         Satzstreifen's symbol size. */
      if (!TEMPLATES[kind()].ownPrint) persistSettings({ ...s.settings, print });
      /* Whether the METACOM notice prints is the household's in every
         template, a Rezept's and a Lied's too: the Sammlung does not keep it
         (keepPrint leaves it out), so a template that keeps its print to
         itself lost the tick on the next preview. */
      else if (print.showCopyright !== s.settings.print.showCopyright) {
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
  const credits = [provider().attribution, providerId() === 'metacom' && print.showCopyright ? METACOM_COPYRIGHT : null]
    .filter(Boolean).length;
  return tafelFieldMm(print, board, credits, print.showCollectionTitle && Boolean(open.name.trim()));
}
