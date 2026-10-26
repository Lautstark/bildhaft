import type { Board, Collection, CollectionKind, GameRow, PrintSettings, SavedPdf, Sentence } from '../core/types.ts';
import { contentOf, DEFAULT_PRINT_SETTINGS, kindOf, titleOf, titlePictures } from '../core/types.ts';
import { boardOf, placedIds, stylesOf, zonesOf } from '../core/board.ts';
import { rowsOfGame } from '../core/game.ts';
import { copyrightFor, creditLines, gameFits, gameGeometry, gameReserveMm, printableArea, tafelFieldMm } from '../ui/printSheet.ts';
import { sungParts } from '../core/song.ts';
import { patchCollection } from '../db/repo.ts';
import { keepsPdfs, pdfFolderFor, readPdf, writePdf } from '../db/folder.ts';
import { download } from '@lautstark/werkzeuge/download';
import { t } from '../i18n/index.ts';
import { notify } from './notify.ts';
import type { PrintOptions } from '../ui/printDialog.svelte.ts';
import { activeCollection, kind, provider, providerId, s } from './state.svelte.ts';
import { persistSettings } from './settings.ts';
import { openPrint, settle } from './templates.ts';

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
 * The steps that brought what a Sammlung keeps of its print to where it is
 * now, each run once, in order: `printVersion` in the settings says how many
 * have run in this browser. Each takes what the Sammlung kept and hands back
 * what it keeps now, so that nothing changes on paper.
 */
type PrintStep = (which: CollectionKind, own: Partial<PrintSettings>, collection: Collection, household: PrintSettings)
  => Partial<PrintSettings>;
const PRINT_STEPS: PrintStep[] = [
  /* 2026-10-22: Satzstreifen, Wortkarten and Tafeln printed with the
     household's settings. Each keeps exactly what it printed with, a Tafel's
     own air included; after this a new Sammlung starts from its template,
     never from the one printed last. */
  (which, own, collection, household) => {
    if (!['satzstreifen', 'wortkarten', 'tafel'].includes(which)) return own;
    const board = which === 'tafel' ? boardOf(collection) : null;
    return ownPrint(which, printFor({ ...household, ...own }, which, board, own), board);
  },
  /* 2026-10-22: a colour behind the page drew on a Tafel and an
     Einkaufsliste only, and the household's could sit unseen in any other
     Sammlung's print. Every template draws it now, so where it never showed
     it goes. */
  (which, own) => {
    if (which === 'tafel' || which === 'einkaufsliste' || !('pageColour' in own)) return own;
    const { pageColour: _unseen, ...rest } = own;
    return rest;
  },
];

/** The steps not yet run in this browser, over every Sammlung. */
export async function bringPrintUpToDate(collections: Collection[]): Promise<Collection[]> {
  if (!s.settings) return collections;
  const done = s.settings.printVersion ?? (s.settings.printOnMaterial ? 1 : 0);
  if (done >= PRINT_STEPS.length) return collections;
  const household = s.settings.print;
  const brought = await Promise.all(collections.map(async (collection) => {
    const which = kindOf(collection);
    const before = collection.print ?? {};
    const print = PRINT_STEPS.slice(done).reduce((own, step) => step(which, own, collection, household), before);
    if (JSON.stringify(print) === JSON.stringify(before)) return collection;
    await patchCollection(collection.id, { print });
    return { ...collection, print };
  }));
  const { printOnMaterial: _old, ...settings } = s.settings;
  persistSettings({ ...settings, printVersion: PRINT_STEPS.length });
  return brought;
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
  /* A Plauderbuch prints whole and in its order: page after page, each with
     its question, then the cards to cut out for all of them. */
  const talk = kind() === 'plauderbuch' && open?.talk ? {
    pages: open.talk.pages.map((page) => ({
      question: page.question ? byId.get(page.question) ?? null : null,
      sayings: page.sayings.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)),
    })),
  } : null;
  /* A Spiel prints whole and in its order: the Spielblatt's rows, cell by
     cell, then the cards to cut out for the free ones. */
  const game = kind() === 'spiel' && open?.game ? {
    rows: rowsOfGame(open.game).map((row) => ({
      zellen: row.zellen
        .map((zelle) => ({ karte: byId.get(zelle.karte), platz: zelle.platz }))
        .filter((zelle): zelle is { karte: Sentence; platz: boolean } => Boolean(zelle.karte)),
    })),
  } : null;
  const chosen = board
    ? placedIds(board).map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x))
    : song
      ? [...new Set(song.parts.flatMap((part) => part.lines))]
    : talk
      ? talk.pages.flatMap((page) => [...(page.question ? [page.question] : []), ...page.sayings])
    : game
      ? game.rows.flatMap((row) => row.zellen.map((zelle) => zelle.karte))
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
    game,
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

/**
 * The open material's print settings, to be set from Bearbeiten: what the
 * sheet will print with, and the two ways to change it. The same `keepPrint`
 * path the print preview writes through, so the Zeile over the material and
 * the preview can never disagree about what was set.
 */
export function materialPrint(): {
  settings: PrintSettings;
  set: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void;
  /** Several at once, as one change: the Materialfarbe is the title's, the frame's and the cart's. */
  patch: (next: Partial<PrintSettings>) => void;
} | null {
  const open = activeCollection();
  if (!open || !s.settings) return null;
  const which = kind();
  const board = which === 'tafel' ? boardOf(open) : null;
  const settings = printFor(printBase(), which, board, open.print ?? {});
  /* The one setting that is the household's, not the material's: whether the
     METACOM notice prints is about passing paper on, so it goes to the
     settings — the same split printOptions().onChange makes, and keepPrint
     leaves it out of what the Sammlung keeps. */
  const write = (next: PrintSettings) => {
    if (s.settings && next.showCopyright !== s.settings.print.showCopyright) {
      persistSettings({ ...s.settings, print: { ...s.settings.print, showCopyright: next.showCopyright } });
    }
    void keepPrint(next);
  };
  return {
    settings,
    set: (key, value) => write(settle(which, { ...settings, [key]: value }, board)),
    patch: (next) => write(settle(which, { ...settings, ...next }, board)),
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

/** The open Spiel's sheet as the sheet itself measures it: its print, its
 *  page and the room the credits and the name over it take. */
function gameSheet() {
  const open = activeCollection();
  if (!open || kind() !== 'spiel' || !s.settings) return null;
  const print = printFor(printBase(), 'spiel', null, open.print ?? {});
  const credits = creditLines(provider().attribution, copyrightFor(providerId(), print.showCopyright));
  const titled = !print.showCollectionTitle || !titleOf(open).trim() ? false
    : titlePictures(s.sentences).length > 0 ? 'pictured' : 'text';
  return { print, page: printableArea(print.paper, print.orientation, print.punch), reserve: gameReserveMm(print, credits, titled) };
}

/** A game's rows as the geometry counts them: how many, the longest, and
 *  every Platzhalter, whose cards the Ablage holds. */
function shapeOf(rows: GameRow[]) {
  return {
    units: Math.max(1, rows.length),
    zellen: Math.max(1, ...rows.map((row) => row.zellen.length)),
    platz: Math.max(1, rows.reduce((n, row) => n + row.zellen.filter((zelle) => zelle.platz).length, 0)),
  };
}

/**
 * How big the open Spiel's symbols print, in millimetres — the sheet's own
 * answer, asked the same way the sheet asks (the same credits, the same name
 * over it), so the menu can show it as a fact. Null for anything that is not
 * a Spiel.
 */
export function gameSymbol(): number | null {
  const sheet = gameSheet();
  if (!sheet) return null;
  const rows = rowsOfGame(activeCollection()?.game ?? { rows: [] });
  return gameGeometry(sheet.print, sheet.page, sheet.reserve, shapeOf(rows)).symW;
}

/**
 * What the open Spiel still has room for at its one card size: a picture or
 * a Platzhalter in a given row, and another row. Bearbeiten offers only that,
 * so a game never grows past its sheet and every game's cards stay the size
 * of every other's. A new row counts as holding one picture, the least it
 * prints with.
 */
export function gameRoom(): { bild: (rowId?: string) => boolean; platz: (rowId?: string) => boolean; zeile: boolean } {
  const sheet = gameSheet();
  const rows = rowsOfGame(activeCollection()?.game ?? { rows: [] });
  const fits = (next: GameRow[]) => !sheet || gameFits(sheet.print, sheet.page, sheet.reserve, shapeOf(next));
  const grown = (rowId: string | undefined, platz: boolean) => {
    const book = rows.length > 0 ? rows : [{ id: '', zellen: [] }];
    const at = book.findIndex((row) => row.id === rowId);
    const target = at >= 0 ? at : book.length - 1;
    return book.map((row, i) => (i === target ? { ...row, zellen: [...row.zellen, { karte: '', platz }] } : row));
  };
  return {
    bild: (rowId) => fits(grown(rowId, false)),
    platz: (rowId) => fits(grown(rowId, true)),
    zeile: fits([...rows, { id: '', zellen: [{ karte: '', platz: false }] }]),
  };
}
