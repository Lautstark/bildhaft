import type { Board, Collection, CollectionKind, PrintSettings, Sentence } from '../core/types.ts';
import { boardOf, defaultAirMm, placedIds, zonesOf } from '../core/board.ts';
import { putCollection } from '../db/repo.ts';
import { openPrintDialog } from '../ui/printDialog.ts';
import { printableArea } from '../ui/printSheet.ts';
import { activeCollection, kind, provider, providerId } from './state.ts';
import type { Ctx } from './context.ts';

/**
 * The print settings a template opens on.
 *
 * A Wortkarten-Sammlung opens on the card sheet, and only there: a strip of
 * one symbol is a card with the wrong margins, so the remembered layout in
 * that case is the other template's setting arriving in this one. A
 * Satzstreifen-Sammlung keeps whatever was chosen, because cutting sentences
 * into cards is a thing people do.
 *
 * An Einkaufsliste opens on itself, and brings its own millimetres with it.
 * Fifteen zones beside fifteen more on one sheet is only possible at 20 mm,
 * measured rather than chosen — and a 3 mm laminating margin, because 5 mm
 * around a 20 mm card is a third of the card. Those are facts about this
 * material and not preferences, which is why the material carries them and
 * the global settings do not.
 *
 * A function of its inputs and nothing else, so tests/unit/print-for.test.ts
 * can hold each template to its opening layout without a page. `ownAirMm` is
 * what a Tafel set for itself, when it did; the board's own `airMm` stands
 * behind it, and the paper decides when neither says.
 */
export function printFor(
  print: PrintSettings, which: CollectionKind, board: Board | null, ownAirMm?: number,
): PrintSettings {
  /* A Tafel prints as the grid it is. Its columns and rows are the
     Sammlung's, not the dialog's — the dialog's are for a deck of cards
     that is being asked to *become* a grid at print time. */
  if (which === 'tafel') {
    const grid = board ?? boardOf({});
    /* And the air around each card rather than the cutting margin, which on
       a Tafel is the same number under a different name. What this Tafel
       set for itself when it has; otherwise from the size of a field on
       this paper, so a crowded A5 gets less than a roomy A4. */
    const page = printableArea(print.paper, print.orientation);
    const field = Math.min(page.width / grid.cols, page.height / grid.rows);
    const own = ownAirMm ?? grid.airMm;
    return {
      ...print, layout: 'sheet', sheetFit: 'grid', gridCols: grid.cols, gridRows: grid.rows,
      cutMarginMm: own ?? defaultAirMm(field),
    };
  }
  if (which === 'einkaufsliste') {
    return {
      ...print,
      layout: 'einkaufsliste',
      paper: 'a4',
      orientation: 'landscape',
      symbolSizeMm: 20,
      cutMarginMm: 3,
      showLabel: true,
      showCollectionTitle: true,
    };
  }
  if (which === 'wortkarten' && print.layout !== 'sheet') {
    return { ...print, layout: 'sheet' };
  }
  return print;
}

export function printing(ctx: Ctx): Pick<Ctx, 'openPrint'> {
  const { s } = ctx;

  /** What this Sammlung has set for its printing, written to it — everything but the household's copyright choice. */
  async function keepPrint(print: PrintSettings): Promise<void> {
    const open = activeCollection(s);
    if (!open) return;
    const { showCopyright: _copyright, ...own } = print;
    if (JSON.stringify(open.print) === JSON.stringify(own)) return;
    const next: Collection = { ...open, print: own, updatedAt: Date.now() };
    s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
    await putCollection(next);
  }

  /**
   * The settings a print of the open Sammlung starts from: the household's
   * defaults, under what this Sammlung has set for itself, under what its
   * template insists on. Whether the METACOM notice prints stays the
   * household's whatever the Sammlung says.
   */
  function printBase(): PrintSettings {
    const own = activeCollection(s)?.print ?? {};
    return { ...s.settings!.print, ...own, showCopyright: s.settings!.print.showCopyright };
  }

  function openPrint(ids: string[]): void {
    const byId = new Map(s.sentences.map((sentence) => [sentence.id, sentence]));
    /* A Tafel prints whole and in its own order: the fields, free ones
       included, and nothing from the tray. What is asked for is ignored on
       purpose — there is no such thing as printing half a Tafel. A Tafel with
       every field free is still a Tafel, and a blank laminated one is a thing
       people make. */
    const open = activeCollection(s);
    const board = kind(s) === 'tafel' && open ? boardOf(open) : null;
    const chosen = board
      ? placedIds(board).map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x))
      : ids.map((id) => byId.get(id)).filter((x): x is Sentence => Boolean(x));
    if ((chosen.length === 0 && !board) || !s.settings) return;

    openPrintDialog({
      sentences: chosen,
      kind: kind(s),
      board: board ? {
        cols: board.cols, rows: board.rows, zones: zonesOf(board),
        cells: board.cells.map((id) => (id ? byId.get(id) ?? null : null)),
      } : null,
      collectionName: open?.name ?? 'bildhaft',
      /* A Wortkarten-Sammlung opens on the card sheet, whatever the remembered
         layout says. Strips are a shape for a sentence: a strip of one symbol
         is a card with the wrong margins, so the stored preference here is not
         a preference, it is the other template's setting arriving in this one.
         The control is still there and still changes it for this print.

         Not symmetrical. A Satzstreifen-Sammlung keeps whatever was chosen,
         because cutting sentences into cards is a thing people actually do. */
      settings: printFor(printBase(), kind(s), board, open?.print?.cutMarginMm),
      onChange: (print: PrintSettings) => {
        if (!s.settings) return;
        /* Twice, on purpose. The household's defaults follow along, so the
           next Sammlung starts from what was last wanted; and the Sammlung
           keeps its own, so this one prints tomorrow as it printed today,
           whatever was set elsewhere in between. */
        ctx.persistSettings({ ...s.settings, print });
        void keepPrint(print);
      },
      provider: providerId(s),
      attribution: provider(s).attribution,
      onClose: () => undefined,
    });
  }

  return { openPrint };
}
