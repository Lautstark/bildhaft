/**
 * The Tafel on screen: a grid of fields, and beside it the cards not yet on it.
 *
 * Two places for one set of cards. The composer puts every new word into the
 * tray, because typing ten words is fast and deciding where each one goes is
 * a different act done afterwards, by hand: a card is dragged into a field,
 * from field to field (they swap), or back into the tray. A field left free is
 * left free on paper too.
 *
 * The cards themselves are the wall's cards — `wordCard()` — handed in already
 * built and cached by the caller, for the reason the wall caches them: a card
 * rebuilt is a symbol re-resolved. What this draws around each one is new on
 * every paint: the wrapper that is dragged, and the one button a keyboard
 * needs where a mouse has the drag.
 */

import type { Board, Sentence } from '../core/types.ts';
import { firstFree, MAX_BOARD_SIDE, zoneCorners } from '../core/board.ts';

/**
 * The colours a field can be. Pale on purpose: they go *behind* a symbol on
 * paper, where a strong colour would fight the picture and eat the toner. Six
 * is enough to tell groups apart — colours, animals, people, things to do —
 * and few enough to pick without a dialog.
 */
export const ZONE_COLOURS: { colour: string; name: string }[] = [
  { colour: '#fff3bf', name: 'ui.zone_yellow' },
  { colour: '#d3f9d8', name: 'ui.zone_green' },
  { colour: '#d0ebff', name: 'ui.zone_blue' },
  { colour: '#ffdeeb', name: 'ui.zone_pink' },
  { colour: '#ffe8cc', name: 'ui.zone_orange' },
  { colour: '#e9ecef', name: 'ui.zone_grey' },
];
import { el } from './dom.ts';
import { t } from '../i18n/index.ts';

export interface BoardHandlers {
  onResize: (cols: number, rows: number) => void;
  /** A card into a field, from wherever it was. */
  onPlace: (id: string, index: number) => void;
  /** A card back into the tray. */
  onTakeOff: (id: string) => void;
  /** A card that does not exist yet, made straight into this field. */
  onNewCardAt: (index: number) => void;
  onNewCard: () => void;
  /** This field in that colour, or bare again. */
  onPaint: (index: number, colour: string | null) => void;
}

export interface BoardState {
  board: Board;
  sentences: Sentence[];
  /** The built card for each sentence, by id. */
  cards: Map<string, HTMLElement>;
}

export interface BoardView {
  /** The grid's size controls: one node, kept across paints so typing in it is not interrupted. */
  head: HTMLElement;
  grid: HTMLElement;
  tray: HTMLElement;
  render(state: BoardState): void;
}

const MIME = 'text/plain';

export function boardView(handlers: BoardHandlers): BoardView {
  let dragging: string | null = null;
  /*
   * The colour in hand, while there is one. A brush rather than a dialog per
   * field: a group is five or eight fields, and painting them is pick once,
   * click each. While a colour is in hand a click on a field paints it and
   * does nothing else — not the picture, not the „+" — and the brush is put
   * down by clicking its swatch again or pressing Escape. `undefined` is no
   * brush; `null` is the eraser.
   */
  let brush: string | null | undefined;

  const sideInput = (label: string, onInput: (n: number) => void): HTMLInputElement => {
    const input = el('input', {
      class: 'field board-head__n',
      attrs: { type: 'number', min: 1, max: MAX_BOARD_SIDE, step: 1, 'aria-label': label },
      on: { input: () => { if (Number.isFinite(input.valueAsNumber)) onInput(input.valueAsNumber); } },
    });
    return input;
  };
  let cols = 0;
  let rows = 0;
  const colsInput = sideInput(t('ui.columns'), (n) => handlers.onResize(n, rows));
  const rowsInput = sideInput(t('ui.rows'), (n) => handlers.onResize(cols, n));
  const swatches = el('div', { class: 'zones', attrs: { role: 'group', 'aria-label': t('ui.zone_colour') } });
  const paintSwatches = () => {
    const one = (colour: string | null, label: string, cls: string) => el('button', {
      class: `zone-swatch ${cls}${brush === colour ? ' zone-swatch--on' : ''}`,
      style: colour ? { '--zone': colour } : {},
      attrs: { type: 'button', 'aria-label': label, 'aria-pressed': String(brush === colour) },
      on: { click: () => { brush = brush === colour ? undefined : colour; paintSwatches(); grid.classList.toggle('board--painting', brush !== undefined); } },
    });
    swatches.replaceChildren(
      el('span', { class: 'small', text: t('ui.zone_colour') }),
      ...ZONE_COLOURS.map(({ colour, name }) => one(colour, t(name), '')),
      one(null, t('ui.zone_none'), 'zone-swatch--none'));
  };
  paintSwatches();
  const head = el('div', { class: 'board-head' },
    el('label', { class: 'small', text: t('ui.columns') }, colsInput),
    el('span', { class: 'faint', text: '×', attrs: { 'aria-hidden': 'true' } }),
    el('label', { class: 'small', text: t('ui.rows') }, rowsInput),
    swatches);
  const grid = el('div', { class: 'board', attrs: { role: 'list' } });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && brush !== undefined && grid.isConnected) {
      brush = undefined; paintSwatches(); grid.classList.remove('board--painting');
    }
  });
  const tray = el('div', { class: 'tray' });

  /* Refreshed rather than assigned: a render lands on every keystroke in the
     composer, and a value written over the field being typed in would put the
     stored number back under the finger. */
  const refresh = (input: HTMLInputElement, value: number) => {
    if (document.activeElement !== input && input.valueAsNumber !== value) input.value = String(value);
  };

  const clear = () => {
    dragging = null;
    for (const cell of grid.children) cell.classList.remove('cell--over');
    tray.classList.remove('tray--over');
  };

  /** The dragged card's id, from the closure while the drag is ours and from the payload otherwise. */
  const dropped = (event: DragEvent): string | null =>
    dragging ?? (event.dataTransfer?.getData(MIME) || null);

  /** What every draggable card gets: the drag itself, and a class while it lasts. */
  const draggable = (node: HTMLElement, id: string) => {
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', (event) => {
      dragging = id;
      node.classList.add('board-card--dragging');
      event.dataTransfer?.setData(MIME, id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    node.addEventListener('dragend', () => { node.classList.remove('board-card--dragging'); clear(); });
  };

  /** A place a card can be dropped: a field, or the tray. */
  const target = (node: HTMLElement, over: string, onDrop: (id: string) => void) => {
    node.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      node.classList.add(over);
    });
    node.addEventListener('dragleave', () => node.classList.remove(over));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      const id = dropped(event);
      clear();
      /* A tick later, not now. The drop repaints the board, and the repaint
         takes the dragged card's wrapper out of the page — and Chrome, when the
         source of a drag is removed while the drop is still being handled,
         never fires dragend and never starts another drag on that page. The
         first drag worked and every one after it did nothing, which is the
         bug this comment is here for. Deferred by a task, the drag is over
         before the page changes. */
      if (id) setTimeout(() => onDrop(id), 0);
    });
  };

  function render(state: BoardState): void {
    const { board, sentences, cards } = state;
    cols = board.cols;
    rows = board.rows;
    refresh(colsInput, cols);
    refresh(rowsInput, rows);

    const byId = new Map(sentences.map((s) => [s.id, s]));
    grid.style.setProperty('--cols', String(cols));
    const cells: HTMLElement[] = [];
    board.cells.forEach((id, index) => {
      const card = id ? cards.get(id) : undefined;
      const zone = board.zones?.[index] ?? null;
      const cell = el('div', {
        class: `cell${card ? '' : ' cell--free'}${zone ? ' cell--zoned' : ''}`,
        style: zone ? { '--zone': zone, borderRadius: zoneCorners(board, index, '12px') } : {},
        attrs: { role: 'listitem', 'aria-label': t('ui.board_field', { n: index + 1 }) },
      });
      target(cell, 'cell--over', (dropId) => handlers.onPlace(dropId, index));
      /* With a colour in hand the click is the brush, whatever it landed on.
         Captured, so the picture and the „+" underneath never hear it. */
      cell.addEventListener('click', (event) => {
        if (brush === undefined) return;
        event.stopPropagation();
        event.preventDefault();
        handlers.onPaint(index, brush);
      }, true);
      if (card && id) {
        const wrap = el('div', { class: 'board-card' },
          card,
          el('button', {
            class: 'board-card__move', text: '↓',
            attrs: { type: 'button', 'aria-label': t('ui.board_take_off', { word: caption(byId.get(id)) }) },
            on: { click: () => handlers.onTakeOff(id) },
          }));
        draggable(wrap, id);
        cell.appendChild(wrap);
      } else {
        /* A field with nothing in it is also where a card that does not exist
           yet can be made — the same „+" the wall ends with, in the place the
           card is going to lie. */
        cell.appendChild(el('button', {
          class: 'cell__add', text: '+',
          attrs: { type: 'button', 'aria-label': t('ui.board_new_here', { n: index + 1 }) },
          on: { click: () => handlers.onNewCardAt(index) },
        }));
      }
      cells.push(cell);
    });
    grid.replaceChildren(...cells);

    const placed = new Set(board.cells);
    const waiting = sentences.filter((s) => !placed.has(s.id));
    const free = firstFree(board);
    const items: HTMLElement[] = waiting.flatMap((sentence) => {
      const card = cards.get(sentence.id);
      if (!card) return [];
      const wrap = el('div', { class: 'board-card', attrs: { title: t('ui.board_drag_hint') } },
        card,
        el('button', {
          class: 'board-card__move', text: '↑',
          attrs: { type: 'button', 'aria-label': t('ui.board_put_on', { word: caption(sentence) }),
            disabled: free === -1 },
          on: { click: () => handlers.onPlace(sentence.id, firstFree(board)) },
        }));
      draggable(wrap, sentence.id);
      return [wrap];
    });
    items.push(el('button', {
      class: 'word word--add', text: '+',
      attrs: { type: 'button', 'aria-label': t('ui.new_card') },
      on: { click: handlers.onNewCard },
    }));

    tray.replaceChildren(
      el('div', { class: 'tray__head' },
        el('b', { text: t('ui.board_tray') }),
        el('span', { class: 'small faint', text: t('ui.board_tray_hint') })),
      el('div', { class: 'words tray__wall' }, ...items));
  }
  target(tray, 'tray--over', (id) => handlers.onTakeOff(id));

  return { head, grid, tray, render };
}

function caption(sentence: Sentence | undefined): string {
  const slot = sentence?.slots[0];
  return slot?.label?.trim() || slot?.sourceToken || '…';
}
