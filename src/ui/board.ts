/**
 * The Tafel on screen: a grid of fields, its groups, and under it the cards
 * not yet on it.
 *
 * Two places for one set of cards. The composer puts every new word into the
 * tray, because typing ten words is fast and deciding where each one goes is
 * a different act done afterwards, by hand: a card is dragged into a field,
 * from field to field (they swap), or back into the tray. A field left free is
 * left free on paper too.
 *
 * A group is a rectangle of fields with a colour behind it — the thing a
 * Symboltafel sets its colours or its feelings apart with. It is made with
 * one press, moved by its badge, drawn out by its corner, and recoloured or
 * removed from the badge's menu. Groups are not painted field by field: that
 * was tried, and painting a group of eight is eight acts where making one
 * group is one — and the brush it needed got in the way of everything else.
 *
 * The cards themselves are the wall's cards — `wordCard()` — handed in already
 * built and cached by the caller, for the reason the wall caches them: a card
 * rebuilt is a symbol re-resolved. What this draws around each one is new on
 * every paint.
 */

import type { Board, BoardGroup, Sentence } from '../core/types.ts';
import { firstFree, MAX_BOARD_SIDE, updateGroup, zoneBox, zoneMap } from '../core/board.ts';
import { el } from './dom.ts';
import { t } from '../i18n/index.ts';

/**
 * The colours a group can be. Pale on purpose: they go *behind* a symbol on
 * paper, where a strong colour would fight the picture and eat the toner. Six
 * is enough to tell groups apart and few enough to pick at a glance; the
 * seventh is whichever the household wants.
 */
export const ZONE_COLOURS: { colour: string; name: string }[] = [
  { colour: '#fff1b8', name: 'ui.zone_yellow' },
  { colour: '#d9f2d0', name: 'ui.zone_green' },
  { colour: '#d6e9fb', name: 'ui.zone_blue' },
  { colour: '#fbdde6', name: 'ui.zone_pink' },
  { colour: '#ffe3c4', name: 'ui.zone_orange' },
  /* Sand, not grey: grey on white paper reads as „nothing", or as a field
     that is switched off. */
  { colour: '#f1e6d3', name: 'ui.zone_sand' },
];

export interface BoardHandlers {
  onResize: (cols: number, rows: number) => void;
  /** A card into a field, from wherever it was. */
  onPlace: (id: string, index: number) => void;
  /** A card back into the tray. */
  onTakeOff: (id: string) => void;
  /** A card that does not exist yet, made straight into this field. */
  onNewCardAt: (index: number) => void;
  onNewCard: () => void;
  /** A new group, in this colour. */
  onAddGroup: (colour: string) => void;
  /** This group, changed: moved, drawn out, or recoloured. */
  onGroup: (index: number, patch: Partial<BoardGroup>) => void;
  onRemoveGroup: (index: number) => void;
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
  /** What was last drawn, so a group being dragged can be redrawn without the store. */
  let current: BoardState | null = null;
  /** The grid's children, kept apart: a grab rebuilds the fields under it and must keep its own node. */
  let cellNodes: HTMLElement[] = [];
  let overlayNodes: HTMLElement[] = [];
  /** Which group's menu is open, if any. */
  let menuFor: number | null = null;

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
  /* A new group takes the palette colour the board has fewest of, so five
     groups made in a row come out in five colours without anybody choosing. */
  const nextColour = (): string => {
    const used = (current?.board.groups ?? []).map((g) => g.colour);
    const counts = ZONE_COLOURS.map((z) => used.filter((u) => u === z.colour).length);
    return ZONE_COLOURS[counts.indexOf(Math.min(...counts))]!.colour;
  };
  const addGroup = el('button', {
    class: 'btn quiet sm', text: t('ui.group_add'),
    attrs: { type: 'button' },
    on: { click: () => handlers.onAddGroup(nextColour()) },
  });
  const head = el('div', { class: 'board-head' },
    el('label', { class: 'small', text: t('ui.columns') }, colsInput),
    el('span', { class: 'faint', text: '×', attrs: { 'aria-hidden': 'true' } }),
    el('label', { class: 'small', text: t('ui.rows') }, rowsInput),
    addGroup);
  const grid = el('div', { class: 'board', attrs: { role: 'list' } });
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

  /** The field under a point on the page, as column and row, clamped to the grid. */
  const fieldAt = (x: number, y: number): { col: number; row: number } => {
    const first = grid.querySelector<HTMLElement>('.cell')?.getBoundingClientRect();
    const last = [...grid.querySelectorAll<HTMLElement>('.cell')].at(-1)?.getBoundingClientRect();
    if (!first || !last) return { col: 0, row: 0 };
    const width = (last.right - first.left) / cols;
    const height = (last.bottom - first.top) / rows;
    return {
      col: Math.min(cols - 1, Math.max(0, Math.floor((x - first.left) / width))),
      row: Math.min(rows - 1, Math.max(0, Math.floor((y - first.top) / height))),
    };
  };

  /**
   * A pointer on a group's badge or corner: down, move, up. Moving redraws
   * the grid from a changed copy without touching the store; up writes the
   * change once, or, when nothing moved, opens the badge's menu.
   */
  const grab = (node: HTMLElement, overlay: HTMLElement, index: number, change: (g: BoardGroup, at: { col: number; row: number }) => Partial<BoardGroup>, onTap?: () => void) => {
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !current) return;
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture(event.pointerId);
      const group = current.board.groups?.[index];
      if (!group) return;
      let patch: Partial<BoardGroup> | null = null;
      let last = '';
      const move = (e: PointerEvent) => {
        const at = fieldAt(e.clientX, e.clientY);
        const next = change(group, at);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        patch = next;
        /* The fields are redrawn from the changed copy and this overlay is
           moved; the other overlays and this node stay as they are, because
           a node that is replaced mid-drag takes the pointer capture with it
           and the drag ends in silence. */
        const preview = updateGroup(current!.board, index, next);
        paintCells({ ...current!, board: preview });
        place(overlay, preview.groups![index]!);
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        if (patch) handlers.onGroup(index, patch);
        else onTap?.();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
  };

  /** The badge's menu: the colours, one of one's own, and the way out. */
  const menu = (index: number, group: BoardGroup): HTMLElement => {
    const swatch = (colour: string, label: string) => el('button', {
      class: `group-menu__swatch${group.colour === colour ? ' group-menu__swatch--on' : ''}`,
      style: { '--zone': colour },
      attrs: { type: 'button', 'aria-label': label, 'aria-pressed': String(group.colour === colour) },
      on: { click: () => { menuFor = null; handlers.onGroup(index, { colour }); } },
    });
    const own = el('input', {
      class: 'group-menu__own',
      attrs: { type: 'color', value: group.colour, 'aria-label': t('ui.zone_custom') },
      on: { change: () => { menuFor = null; handlers.onGroup(index, { colour: own.value }); } },
    });
    return el('div', { class: 'group-menu', attrs: { role: 'group', 'aria-label': t('ui.group_menu', { n: index + 1 }) },
      on: { pointerdown: (e) => e.stopPropagation() } },
      el('div', { class: 'group-menu__row' },
        ...ZONE_COLOURS.map(({ colour, name }) => swatch(colour, t(name))),
        el('label', { class: 'group-menu__pick', attrs: { title: t('ui.zone_custom') } }, own, el('span', { text: '…', attrs: { 'aria-hidden': 'true' } }))),
      el('button', {
        class: 'linklike group-menu__remove', text: t('ui.group_remove'),
        attrs: { type: 'button' },
        on: { click: () => { menuFor = null; handlers.onRemoveGroup(index); } },
      }));
  };

  /* The menu closes on a press anywhere else, and on Escape. */
  document.addEventListener('pointerdown', (event) => {
    if (menuFor === null || !current) return;
    if ((event.target as HTMLElement).closest('.group__badge, .group-menu')) return;
    menuFor = null;
    paintGroups(current);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuFor !== null && current) { menuFor = null; paintGroups(current); }
  });

  /** Where an overlay lies: over its group's fields. */
  const place = (overlay: HTMLElement, group: BoardGroup) => {
    overlay.style.gridColumn = `${group.col + 1} / span ${group.cols}`;
    overlay.style.gridRow = `${group.row + 1} / span ${group.rows}`;
  };

  /** The fields, drawn afresh. In place, one for one, when the grid already has them. */
  function paintCells(state: BoardState): void {
    const { board, sentences, cards } = state;
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const map = zoneMap(board);
    grid.style.setProperty('--cols', String(board.cols));
    const nodes: HTMLElement[] = [];
    board.cells.forEach((id, index) => {
      const card = id ? cards.get(id) : undefined;
      const zone = map.zones[index];
      const cell = el('div', {
        class: `cell${card ? '' : ' cell--free'}${zone ? ' cell--zoned' : ''}`,
        /* Placed by hand rather than flowing, so a group can be placed over
           the same fields: auto-placement would step around it. */
        style: { gridColumn: String((index % board.cols) + 1), gridRow: String(Math.floor(index / board.cols) + 1) },
        attrs: { role: 'listitem', 'aria-label': t('ui.board_field', { n: index + 1 }) },
      });
      /* The colour is a layer under the card, stepped in by half a gutter
         where the block ends, so that the same rule draws it on paper — see
         boardSheet() in printSheet.ts, which reads the same zoneBox(). */
      const box = zoneBox(map, index, '4px', '12px', '-1px');
      if (zone && box) {
        cell.appendChild(el('div', { class: 'cell__zone', style: { '--zone': zone, inset: box.inset, borderRadius: box.borderRadius } }));
      }
      target(cell, 'cell--over', (dropId) => handlers.onPlace(dropId, index));

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
      nodes.push(cell);
    });
    const inPlace = cellNodes.length === nodes.length && cellNodes.every((n) => n.parentNode === grid);
    if (inPlace) cellNodes.forEach((old, i) => old.replaceWith(nodes[i]!));
    else { for (const old of cellNodes) old.remove(); grid.prepend(...nodes); }
    cellNodes = nodes;
  }

  /** The groups, laid over their fields. The layer itself lets every press
      through to the cards; only the badge and the corner take one. */
  function paintGroups(state: BoardState): void {
    const { board } = state;
    /* Whichever badge had the keyboard keeps it: an arrow key moves the group,
       the board is redrawn, and the next arrow must still find its badge. */
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.group__badge')?.dataset.group;
    const nodes: HTMLElement[] = [];
    (board.groups ?? []).forEach((group, index) => {
      const badge = el('button', {
        class: 'group__badge',
        style: { '--zone': group.colour },
        attrs: { type: 'button', 'data-group': String(index), 'aria-label': t('ui.group_badge', { n: index + 1 }), 'aria-expanded': String(menuFor === index) },
        on: {
          keydown: (event: KeyboardEvent) => {
            const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (step) {
              event.preventDefault();
              handlers.onGroup(index, event.shiftKey
                ? { cols: group.cols + step[0]!, rows: group.rows + step[1]! }
                : { col: group.col + step[0]!, row: group.row + step[1]! });
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              handlers.onRemoveGroup(index);
            }
          },
        },
      });
      const corner = el('span', {
        class: 'group__corner',
        attrs: { role: 'button', tabindex: 0, 'aria-label': t('ui.group_corner', { n: index + 1 }) },
      });
      const overlay = el('div', { class: `group${menuFor === index ? ' group--open' : ''}` },
        badge, corner, menuFor === index ? menu(index, group) : null);
      place(overlay, group);
      grab(badge, overlay, index, (_g, at) => ({ col: at.col, row: at.row }), () => {
        menuFor = menuFor === index ? null : index;
        paintGroups(current!);
      });
      grab(corner, overlay, index, (g, at) => ({ cols: at.col - g.col + 1, rows: at.row - g.row + 1 }));
      nodes.push(overlay);
    });
    for (const old of overlayNodes) old.remove();
    grid.append(...nodes);
    overlayNodes = nodes;
    const keep = menuFor !== null ? String(menuFor) : focused;
    if (keep !== undefined) grid.querySelector<HTMLElement>(`.group__badge[data-group="${keep}"]`)?.focus();
  }

  function paintGrid(state: BoardState): void {
    paintCells(state);
    paintGroups(state);
  }

  function render(state: BoardState): void {
    current = state;
    const { board, sentences, cards } = state;
    cols = board.cols;
    rows = board.rows;
    refresh(colsInput, cols);
    refresh(rowsInput, rows);
    if (menuFor !== null && !(board.groups ?? [])[menuFor]) menuFor = null;
    paintGrid(state);

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
