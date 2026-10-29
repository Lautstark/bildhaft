import type { Board, Collection, CollectionKind, GameRow, PrintSettings, SavedPdf, Sentence } from '../core/types.ts';
import { contentOf, DEFAULT_PRINT_SETTINGS, kindOf, titleOf, titlePictures } from '../core/types.ts';
import { boardOf, placedIds, stylesOf, zonesOf } from '../core/board.ts';
import { rowsOfGame } from '../core/game.ts';
import {
  copyrightFor, creditLines, cutGeometry, gameFits, gameReserveMm, printableArea, tafelFieldMm,
  talkCapacity, type Titled,
} from '../ui/printSheet.ts';
import { sungParts } from '../core/song.ts';
import { sameOrdner, type GroupPrintWhich } from '../core/ordner.ts';
import { listSentences, patchCollection } from '../db/repo.ts';
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
 * carrying the last one's.
 */
export function ownPrint(which: CollectionKind, print: PrintSettings, board: Board | null): Partial<PrintSettings> {
  const plain = printFor(DEFAULT_PRINT_SETTINGS, which, board);
  const own: Partial<Record<keyof PrintSettings, unknown>> = {};
  for (const key of Object.keys(print) as (keyof PrintSettings)[]) {
    if (print[key] !== plain[key]) own[key] = print[key];
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
 * what it set for itself: the same for all of them. Whether the METACOM
 * notice prints is the material's too — one is handed on, the next stays at
 * home (her call, 2026-10-28).
 */
function printBase(): PrintSettings {
  return { ...DEFAULT_PRINT_SETTINGS };
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
  /* 2026-10-27: a Spiel starts without its word. One that printed with it
     because that was the template's answer keeps printing with it. */
  (which, own) => (which === 'spiel' && !('showLabel' in own) ? { ...own, showLabel: true } : own),
  /* 2026-10-28: whether the METACOM notice prints was the household's, one
     switch for every material. Each keeps what it printed with, and from
     here the switch is its own. */
  (_which, own, _collection, household) =>
    (household.showCopyright && !('showCopyright' in own) ? { ...own, showCopyright: true } : own),
  /* 2026-10-28: a Spiel opens punched at the top, without marks. One that
     printed unpunched, or punched with marks, because that was the
     template's answer stays so. */
  (which, own) => {
    if (which !== 'spiel') return own;
    if (!('punch' in own)) return { ...own, punch: null };
    return own.punch && !('punchMarks' in own) ? { ...own, punchMarks: true } : own;
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
  const open = activeCollection();
  return buildOptions(open, s.sentences, kind(), {
    /* The Sammlung keeps what was set, so it prints tomorrow as it printed
       today; nothing of it reaches another one. */
    onChange: (print: PrintSettings) => { if (s.settings) void keepPrint(print); },
    onPdf: (pdf, print, pages) => keepPdf(pdf, print, pages),
  });
}

/**
 * One material's print, put together from what is handed in rather than from
 * what is open — the group print asks for many at once, and only one of them
 * can be the open one. The hooks are the caller's: the live preview writes
 * settings back and keeps PDFs, the group print does neither.
 */
function buildOptions(
  open: Collection | null, all: Sentence[], which: CollectionKind,
  hooks: Pick<PrintOptions, 'onChange' | 'onPdf'>, over: Partial<PrintSettings> = {},
): PrintOptions | null {
  const byId = new Map(all.map((sentence) => [sentence.id, sentence]));
  /* A Tafel prints whole and in its own order: the fields, free ones
     included, and nothing from the tray. What is asked for is ignored on
     purpose — there is no such thing as printing half a Tafel. A Tafel with
     every field free is still a Tafel, and a blank laminated one is a thing
     people make. */
  const board = which === 'tafel' && open ? boardOf(open) : null;
  /* A Rezept prints whole too, and in the order it reads on screen: oldest
     first, each part in its place on the paper. */
  /* A Lied prints whole, as it is sung: every part where it comes, its rows
     looked up by id each time, so a row sung ten times is the same row ten
     times on paper. */
  const song = which === 'lied' && open?.song ? {
    parts: sungParts(open.song).map((at) => ({
      kind: at.kind, n: at.n, first: at.first,
      lines: at.part.lines.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)),
    })),
  } : null;
  /* A Plauderbuch prints whole and in its order: page after page, each with
     its question, then the cards to cut out for all of them. */
  const talk = which === 'plauderbuch' && open?.talk ? {
    pages: open.talk.pages.map((page) => ({
      question: page.question ? byId.get(page.question) ?? null : null,
      sayings: page.sayings.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x)),
    })),
  } : null;
  /* A Spiel prints whole and in its order: the Spielblatt's rows, cell by
     cell, then the cards to cut out for the free ones. */
  const game = which === 'spiel' && open?.game ? {
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
    : which === 'rezept'
      ? [...all].sort((a, b) => a.createdAt - b.createdAt)
      : contentOf(all);
  if ((chosen.length === 0 && !board) || !s.settings) return null;

  return {
    sentences: chosen,
    kind: which,
    board: board ? {
      cols: board.cols, rows: board.rows, zones: zonesOf(board), styles: stylesOf(board),
      cells: board.cells.map((id) => (id ? byId.get(id) ?? null : null)),
    } : null,
    song,
    talk,
    game,
    collectionName: open ? titleOf(open) : 'bildhaft',
    pictures: titlePictures(all),
    settings: printOf(open, over),
    onChange: hooks.onChange,
    onPdf: hooks.onPdf,
    provider: providerId(),
    attribution: provider().attribution,
    onClose: () => undefined,
  };
}

/** Whether a material prints Anybook codes, as its own print would — or as the group print sets it. */
export function anybookOf(collection: Collection, over: Partial<PrintSettings> = {}): boolean {
  return printOf(collection, over).anybookCircle;
}

/**
 * What a material prints with: what it set for itself, over its template's
 * defaults, under what the template always is (templates.ts) — and over all
 * it set, what the group print sets for one print (`over`). No material is
 * what nothing is open prints with, the way `kind()` answers then.
 */
function printOf(collection: Collection | null, over: Partial<PrintSettings> = {}): PrintSettings {
  const which = collection ? kindOf(collection) : 'satzstreifen';
  const board = which === 'tafel' && collection ? boardOf(collection) : null;
  return printFor(printBase(), which, board, { ...collection?.print, ...over });
}

/** A material loaded for the group print: the Sammlung with its rows. */
export interface GroupLoaded { collection: Collection; sentences: Sentence[] }

/** One sheet of the group print: a material's, or (collection null) a shared Kartenbogen. */
export interface GroupPrintPart { collection: Collection | null; options: PrintOptions }

/**
 * Everything one template group holds, loaded once: the open material's rows
 * are the live ones, every other material's come from the store.
 */
export async function groupPrintLoad(which: GroupPrintWhich): Promise<GroupLoaded[]> {
  const rows = s.collections.filter((c) => kindOf(c) === which.kind
    && (which.ordner === undefined || sameOrdner(c.ordner, which.ordner)));
  return Promise.all(rows.map(async (collection) => ({
    collection,
    sentences: collection.id === s.activeId ? s.sentences : await listSentences(collection.id),
  })));
}

/**
 * What decides whether two materials' cut cards may share a Bogen: everything
 * that shapes or dresses a cut card. The paper and the Beschriftung are in
 * here because they are the card's size and form; the colours because a card
 * must print on the shared Bogen exactly as it would have printed alone.
 */
const CUT_KEY: (keyof PrintSettings)[] = [
  'paper', 'orientation', 'punch', 'cutMarginMm',
  'showLabel', 'labelPosition', 'labelSizePt',
  'cardBorderMm', 'cardBorderColor', 'cardRadiusMm', 'cardBackground',
  'anybookCircle', 'anybookPlace',
];

/**
 * The group print's sheets, from what is loaded and what is ticked: each
 * chosen material prints exactly as it prints alone — only its Kartenbogen,
 * where its template has one (Spiel, Plauderbuch), moves to the end and is
 * shared with every material whose cards would print identically. Materials
 * whose cards differ (another paper, with instead of without Beschriftung)
 * keep a Bogen of their own, after the shared one.
 */
export function groupPrintParts(
  loaded: GroupLoaded[], chosen: ReadonlySet<string>, over: Partial<PrintSettings> = {},
): GroupPrintPart[] {
  const parts: GroupPrintPart[] = [];
  const noop = () => undefined;
  const condense = loaded.some(({ collection }) => ['spiel', 'plauderbuch'].includes(kindOf(collection)));
  const cutGroups = new Map<string, { geo: NonNullable<ReturnType<typeof cutGeometry>>; all: PrintOptions[] }>();
  for (const { collection, sentences } of loaded) {
    if (!chosen.has(collection.id)) continue;
    const options = buildOptions(collection, sentences, kindOf(collection), { onChange: noop }, over);
    if (!options) continue;
    if (condense) {
      /* The card as this material's own print cuts it — a game whose rows
         did not fit the sheet at the one field size prints smaller cards,
         and those share a Bogen only with cards of their very size. */
      const geo = cutGeometry({
        ...options, copyright: copyrightFor(options.provider, options.settings.showCopyright),
      });
      options.cut = 'none';
      if (geo) {
        const key = JSON.stringify([
          ...CUT_KEY.map((k) => options.settings[k]), geo.cutW.toFixed(2), geo.cutH.toFixed(2), geo.air.toFixed(2),
        ]);
        const group = cutGroups.get(key) ?? { geo, all: [] };
        group.all.push(options);
        cutGroups.set(key, group);
      }
    }
    parts.push({ collection, options });
  }
  for (const { geo, all: group } of cutGroups.values()) {
    const first = group[0]!;
    parts.push({
      collection: null,
      options: {
        ...first,
        /* What each card's code says, and which are off, is its own
           material's: the first one's alone left every other card saying
           its Beschriftung. A slot's id is its own, so they merge. */
        settings: {
          ...first.settings,
          anybookSay: Object.assign({}, ...group.map((options) => options.settings.anybookSay)),
          anybookOff: group.flatMap((options) => options.settings.anybookOff ?? []),
        },
        cutGeo: geo,
        sentences: group.flatMap((options) => options.sentences),
        game: first.kind === 'spiel' ? { rows: group.flatMap((options) => options.game?.rows ?? []) } : null,
        talk: first.kind === 'plauderbuch' ? { pages: group.flatMap((options) => options.talk?.pages ?? []) } : null,
        collectionName: '',
        pictures: [],
        cut: 'only',
        onPdf: undefined,
      },
    });
  }
  return parts;
}

/** Who has which value of a setting, where the materials of a group print disagree on it. */
export type PrintMixed = { value: unknown; names: string[] }[];

/**
 * Print settings and the way to change them, for the menu over a sheet: one
 * material's, or every ticked one of the group print's.
 */
export interface PrintSource {
  kind: CollectionKind;
  /** What the menu shows; in the group print, the first ticked material's. */
  settings: PrintSettings;
  set: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void;
  /** Several at once, as one change: the Materialfarbe is the title's, the frame's and the cart's. */
  patch: (next: Partial<PrintSettings>) => void;
  /**
   * Where the materials disagree: who has what, by the value `as` makes of
   * it (a Lochrand on the left and one on top are both „zum Lochen"). Null
   * where they agree, and always for one material.
   */
  mixed: (key: keyof PrintSettings, as?: (value: unknown) => unknown) => PrintMixed | null;
}

/**
 * The open material's print settings, to be set from Bearbeiten: what the
 * sheet will print with, and the two ways to change it. The same `keepPrint`
 * path the print preview writes through, so the Zeile over the material and
 * the preview can never disagree about what was set.
 */
export function materialPrint(): PrintSource | null {
  const open = activeCollection();
  if (!open || !s.settings) return null;
  const which = kind();
  const board = which === 'tafel' ? boardOf(open) : null;
  const settings = printOf(open);
  const write = (next: PrintSettings) => { void keepPrint(next); };
  return {
    kind: which,
    settings,
    mixed: () => null,
    set: (key, value) => write(settle(which, { ...settings, [key]: value }, board)),
    patch: (next) => write(settle(which, { ...settings, ...next }, board)),
  };
}

/**
 * The menu over „Alle drucken": what the ticked materials print with, and
 * changing it changes it for all of them — for this print only. Nothing is
 * written to a material; `onOver` hands the group print what it now sets
 * over every one of them, and closing the overlay forgets it. With it comes
 * the one setting that was changed, by name: a patch is one change, named by
 * its first — the Materialfarbe sets the cart's and the accent with the
 * title's, and is still one.
 */
export function groupPrintSource(
  loaded: GroupLoaded[], chosen: ReadonlySet<string>, over: Partial<PrintSettings>,
  onOver: (next: Partial<PrintSettings>, changed: keyof PrintSettings) => void,
): PrintSource | null {
  const ticked = loaded.filter(({ collection }) => chosen.has(collection.id));
  const first = ticked[0];
  if (!first || !s.settings) return null;
  const all = ticked.map(({ collection }) => ({ name: collection.name, settings: printOf(collection, over) }));
  return {
    kind: kindOf(first.collection),
    settings: all[0]!.settings,
    set: (key, value) => onOver({ ...over, [key]: value }, key),
    patch: (next) => {
      const first = Object.keys(next)[0] as keyof PrintSettings | undefined;
      if (first) onOver({ ...over, ...next }, first);
    },
    mixed: (key, as = (value) => value) => {
      const groups: PrintMixed = [];
      for (const one of all) {
        const value = as(one.settings[key]);
        const same = groups.find((group) => JSON.stringify(group.value) === JSON.stringify(value));
        if (same) same.names.push(one.name); else groups.push({ value, names: [one.name] });
      }
      return groups.length > 1 ? groups : null;
    },
  };
}

/** The paper the open Sammlung prints on, as its template opens it. */
export function paperOf(): Pick<PrintSettings, 'paper' | 'orientation'> | null {
  const open = activeCollection();
  if (!open || !s.settings) return null;
  const print = printOf(open);
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
  const print = printOf(open);
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
  const print = printOf(open);
  const credits = creditLines(provider().attribution, copyrightFor(providerId(), print.showCopyright));
  const titled: Titled = !print.showCollectionTitle || !titleOf(open).trim() ? false
    : titlePictures(s.sentences).length > 0 ? 'pictured' : 'text';
  return { print, titled, page: printableArea(print.paper, print.orientation, print.punch), reserve: gameReserveMm(print, credits, titled) };
}

/**
 * The open Plauderbuch as Bearbeiten needs it: how many Antworten a page
 * prints — the rest wait under it, as cards beside a Tafel do.
 */
export function talkPrint(): { room: number } | null {
  const open = activeCollection();
  if (!open || kind() !== 'plauderbuch' || !s.settings) return null;
  return { room: talkCapacity(printOf(open)) };
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
 * What the open Spiel still has room for at its one card size: a picture or
 * a Platzhalter in a given row, and another row. Bearbeiten offers only that,
 * so a game never grows past its sheet and every game's cards stay the size
 * of every other's. Measured against the fullest sheet the Spiel can be
 * printed on — punched at the top or the left, with the METACOM line and
 * page numbers — so that switching any of them on later never shrinks what
 * was built. A new row counts as holding one picture, the least it prints with.
 */
export function gameRoom(): { bild: (rowId?: string) => boolean; platz: (rowId?: string) => boolean; zeile: boolean } {
  const sheet = gameSheet();
  const rows = rowsOfGame(activeCollection()?.game ?? { rows: [] });
  const fullest = !sheet ? [] : ([null, 'top', 'left'] as const).map((punch) => {
    const print = { ...sheet.print, punch, showPageNumbers: true };
    const credits = creditLines(provider().attribution, copyrightFor(providerId(), true));
    return { print, page: printableArea(print.paper, print.orientation, punch), reserve: gameReserveMm(print, credits, sheet.titled) };
  });
  const fits = (next: GameRow[]) => fullest.every((one) => gameFits(one.print, one.page, one.reserve, shapeOf(next)));
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
