/**
 * The Tafel on screen: a grid of fields, and under it the cards not yet on it.
 *
 * Two places for one set of cards. The composer puts every new word into the
 * tray, because typing ten words is fast and deciding where each one goes is
 * a different act done afterwards, by hand: a card is dragged into a field,
 * from field to field (they swap), or back into the tray. A field left free is
 * left free on paper too.
 *
 * A group is fields that lie together, drawn apart from the rest — what a
 * Symboltafel sets its colours or its feelings apart with. A group has a
 * name on its edge, a frame around it and a colour behind it, each on its
 * own and none required. It is made the way cells in a table are coloured:
 * the fields are marked, then a panel offers the three, and each choice goes
 * straight onto the Tafel. A field is marked by a press on its tile around
 * the card; the card itself keeps its own presses. Nothing here is a mode
 * and nothing sits on a card.
 *
 * The cards themselves are the wall's cards — `wordCard()` — handed in already
 * built and cached by the caller, for the reason the wall caches them: a card
 * rebuilt is a symbol re-resolved. What this draws around each one is new on
 * every paint.
 */

import type { Board, Sentence, ZoneStyle } from '../core/types.ts';
import { blockAt, firstFree, labelColour, labelField, MAX_BOARD_SIDE, newZoneId, zoneBorder, zoneBox, zoneJoint, zoneMap } from '../core/board.ts';
import { el } from './dom.ts';
import { t } from '../i18n/index.ts';

/**
 * The eight hues a group can be, each in two strengths: `frame` strong enough
 * to be a line, `fill` pale enough for a white card to stay a white card on
 * it, and for the toner. Frame and fill are picked apart — a yellow frame on
 * a blue ground is allowed — but the hues are the same eight in both rows,
 * so that the two rows read as one palette.
 */
export const ZONE_COLOURS: { frame: string; fill: string; name: string }[] = [
  { frame: '#f0b323', fill: '#fff1b3', name: 'ui.zone_yellow' },
  { frame: '#4caf50', fill: '#d8f2d2', name: 'ui.zone_green' },
  { frame: '#3f88e0', fill: '#d8e9fc', name: 'ui.zone_blue' },
  { frame: '#e35d8f', fill: '#fddfe9', name: 'ui.zone_pink' },
  { frame: '#f0862b', fill: '#ffe3c9', name: 'ui.zone_orange' },
  { frame: '#9366d6', fill: '#eadffb', name: 'ui.zone_purple' },
  { frame: '#23ada0', fill: '#d3f2ee', name: 'ui.zone_teal' },
  { frame: '#dd4a44', fill: '#fbdad8', name: 'ui.zone_red' },
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
  /** These fields into that group, drawn like this. */
  onGroup: (indices: number[], id: string, style: ZoneStyle) => void;
  /** The group gone: its fields bare. */
  onDissolve: (id: string) => void;
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
/** How far the pointer has to travel before a press on the air is a frame and not a click. */
const DRAG_THRESHOLD = 6;

export function boardView(handlers: BoardHandlers): BoardView {
  let dragging: string | null = null;
  /** What was last drawn, so the selection can be redrawn without the store. */
  let current: BoardState | null = null;
  /** The marked fields, by index. Kept until „Fertig" or Escape. */
  let selected = new Set<number>();
  /**
   * The group the panel is changing: the one the marked fields are all in,
   * or one made on the first choice for fields that were in none. Reset with
   * the selection.
   */
  let editing: string | null = null;
  /** The panel, one node while the selection lasts, so typing a name is not interrupted by a repaint. */
  let panel: HTMLElement | null = null;

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
  const head = el('div', { class: 'board-head' },
    el('label', { class: 'small', text: t('ui.columns') }, colsInput),
    el('span', { class: 'faint', text: '×', attrs: { 'aria-hidden': 'true' } }),
    el('label', { class: 'small', text: t('ui.rows') }, rowsInput));
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

  /* ------------------------------------------------------- the selection --- */

  const cellNodes = (): HTMLElement[] => [...grid.querySelectorAll<HTMLElement>('.cell')];

  /** Which fields a frame on the page touches. */
  const fieldsUnder = (a: { x: number; y: number }, b: { x: number; y: number }): number[] => {
    const left = Math.min(a.x, b.x); const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y); const bottom = Math.max(a.y, b.y);
    const hit: number[] = [];
    cellNodes().forEach((cell, index) => {
      const r = cell.getBoundingClientRect();
      if (r.right > left && r.left < right && r.bottom > top && r.top < bottom) hit.push(index);
    });
    return hit;
  };

  /* The group being edited is kept while the marks change: a field pressed
     into the selection while the panel is open joins that group on the next
     choice, which is how a group grows. It is let go only when none of its
     fields is marked any more — see paintSelection(). */
  const setSelection = (next: Iterable<number>) => {
    selected = new Set(next);
    if (current) paintSelection();
  };

  /**
   * A press on a field's air. Alone it marks the field, or unmarks it; on a
   * coloured field with nothing marked yet it marks the whole block, so a
   * group is changed as one. Held and moved, it draws a frame instead, and
   * every field the frame touches is marked when it is let go.
   */
  const pressAir = (event: PointerEvent, index: number) => {
    if (event.button !== 0 || !current) return;
    if ((event.target as HTMLElement).closest('.board-card, .cell__add, .group-panel')) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    let frame: HTMLElement | null = null;
    const gridBox = () => grid.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const here = { x: e.clientX, y: e.clientY };
      if (!frame) {
        if (Math.hypot(here.x - start.x, here.y - start.y) < DRAG_THRESHOLD) return;
        frame = el('div', { class: 'board__frame' });
        grid.appendChild(frame);
        grid.setPointerCapture(e.pointerId);
      }
      const g = gridBox();
      Object.assign(frame.style, {
        left: `${Math.min(start.x, here.x) - g.left}px`, top: `${Math.min(start.y, here.y) - g.top}px`,
        width: `${Math.abs(here.x - start.x)}px`, height: `${Math.abs(here.y - start.y)}px`,
      });
      const hit = new Set(fieldsUnder(start, here));
      cellNodes().forEach((cell, i) => cell.classList.toggle('cell--framed', hit.has(i)));
    };
    const up = (e: PointerEvent) => {
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', up);
      grid.removeEventListener('pointercancel', up);
      cellNodes().forEach((cell) => cell.classList.remove('cell--framed'));
      if (frame) {
        frame.remove();
        const hit = fieldsUnder(start, { x: e.clientX, y: e.clientY });
        setSelection(new Set([...selected, ...hit]));
        return;
      }
      const map = zoneMap(current!.board);
      if (selected.has(index)) { selected.delete(index); setSelection(selected); return; }
      if (selected.size === 0 && map.zones[index]) { setSelection(blockAt(map, index)); return; }
      setSelection([...selected, index]);
    };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);
  };

  /* ----------------------------------------------------------- the panel --- */

  /** The style the panel is showing: the group's, or nothing yet. */
  const styleNow = (): ZoneStyle => (editing && current ? zoneMap(current.board).styles[editing] ?? {} : {});

  /**
   * One choice in the panel. The marked fields join the group being edited —
   * or a new one, on the first choice — and the group takes the style, whole.
   * Nothing waits for „Fertig": the Tafel is the preview.
   */
  const choose = (patch: Partial<ZoneStyle>) => {
    if (!current) return;
    const style = { ...styleNow(), ...patch };
    if (!editing) editing = newZoneId(current.board);
    handlers.onGroup([...selected], editing, style);
  };

  /**
   * The panel over the marked fields: how many, and the three things a group
   * can have — a name, a frame, a colour behind — each with „Kein" first,
   * each taking effect on the spot. „Gruppe entfernen" takes all three away;
   * „Fertig" only puts the marks down.
   */
  const groupPanel = (): HTMLElement => {
    const style = styleNow();
    const count = el('span', { class: 'group-panel__count' });
    const name = el('input', {
      class: 'field group-panel__name',
      attrs: { type: 'text', placeholder: t('ui.group_name_none'), 'aria-label': t('ui.group_name'), maxlength: 40 },
    });
    name.value = style.name ?? '';
    /* Written when the typing pauses, and on leaving the field: every
       keystroke straight to the store would be a write and a repaint each. */
    let pending: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (pending) { clearTimeout(pending); pending = null; }
      if (name.value.trim() !== (styleNow().name ?? '')) choose({ name: name.value.trim() || undefined });
    };
    name.addEventListener('input', () => { if (pending) clearTimeout(pending); pending = setTimeout(flush, 400); });
    name.addEventListener('blur', flush);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); flush(); } });

    const row = (what: string, key: 'frame' | 'fill', ownStart: string) => {
      const chosen = style[key];
      const none = el('button', {
        class: `group-panel__swatch group-panel__swatch--none${chosen ? '' : ' group-panel__swatch--on'}`,
        attrs: { type: 'button', 'aria-label': `${what}: ${t('ui.none')}`, 'aria-pressed': String(!chosen) },
        on: { click: () => choose({ [key]: undefined }) },
      });
      const swatches = ZONE_COLOURS.map((c) => el('button', {
        class: `group-panel__swatch${chosen === c[key] ? ' group-panel__swatch--on' : ''}`,
        style: { '--c': c[key] },
        attrs: { type: 'button', 'aria-label': t('ui.colour_for', { what, colour: t(c.name) }), 'aria-pressed': String(chosen === c[key]) },
        on: { click: () => choose({ [key]: c[key] }) },
      }));
      const own = el('input', {
        class: 'group-panel__own',
        attrs: { type: 'color', value: chosen ?? ownStart, 'aria-label': t('ui.own_colour_for', { what }) },
        on: { change: () => choose({ [key]: own.value }) },
      });
      const isOwn = Boolean(chosen) && !ZONE_COLOURS.some((c) => c[key] === chosen);
      return [
        el('span', { class: 'group-panel__label', text: what }),
        el('div', { class: 'group-panel__row', attrs: { role: 'group', 'aria-label': what } },
          none, ...swatches,
          el('label', { class: `group-panel__wheel${isOwn ? ' group-panel__swatch--on' : ''}`, attrs: { title: t('ui.own_colour_for', { what }) } }, own)),
      ];
    };

    const node = el('div', { class: 'group-panel', attrs: { role: 'group', 'aria-label': t('ui.selection') },
      on: { pointerdown: (e) => e.stopPropagation() } },
      el('div', { class: 'group-panel__head' }, count,
        el('button', { class: 'group-panel__done', text: t('ui.done'), attrs: { type: 'button' }, on: { click: () => { flush(); setSelection([]); } } })),
      el('span', { class: 'group-panel__label', text: t('ui.group_name') }), name,
      ...row(t('ui.group_frame'), 'frame', '#3f88e0'),
      ...row(t('ui.group_fill'), 'fill', '#d8e9fc'),
      el('div', { class: 'group-panel__foot' },
        el('button', {
          class: 'group-panel__remove', text: t('ui.remove_group'), attrs: { type: 'button' },
          on: { click: () => { const id = editing; setSelection([]); if (id) handlers.onDissolve(id); } },
        })));
    node.querySelector('.group-panel__count')!.textContent = selected.size === 1 ? t('ui.n_fields_one') : t('ui.n_fields', { n: selected.size });
    return node;
  };

  /**
   * The panel as the board now is: the count, and which swatch is pressed.
   * Refreshed rather than rebuilt, for the name being typed — see `refresh`.
   */
  const refreshPanel = () => {
    if (!panel) return;
    const style = styleNow();
    panel.querySelector('.group-panel__count')!.textContent = selected.size === 1 ? t('ui.n_fields_one') : t('ui.n_fields', { n: selected.size });
    const name = panel.querySelector<HTMLInputElement>('.group-panel__name')!;
    if (document.activeElement !== name && name.value.trim() !== (style.name ?? '')) name.value = style.name ?? '';
    panel.querySelectorAll<HTMLElement>('.group-panel__row').forEach((row, i) => {
      const key = i === 0 ? 'frame' : 'fill';
      const chosen = style[key];
      let ownOn = Boolean(chosen);
      row.querySelectorAll<HTMLElement>('.group-panel__swatch').forEach((sw) => {
        const c = sw.style.getPropertyValue('--c') || undefined;
        const on = c ? c === chosen : !chosen;
        if (on && c) ownOn = false;
        sw.classList.toggle('group-panel__swatch--on', on);
        sw.setAttribute('aria-pressed', String(on));
      });
      row.querySelector('.group-panel__wheel')?.classList.toggle('group-panel__swatch--on', ownOn);
    });
    panel.querySelector<HTMLButtonElement>('.group-panel__remove')!.disabled = !editing;
  };

  /**
   * The marks on the fields, and the panel in the head row above the grid.
   * There rather than floating over the fields: a bar over the first row
   * covered the very tiles the next press was meant for.
   */
  function paintSelection(): void {
    cellNodes().forEach((cell, i) => {
      cell.classList.toggle('cell--selected', selected.has(i));
      cell.setAttribute('aria-selected', String(selected.has(i)));
    });
    if (selected.size === 0) { panel?.remove(); panel = null; editing = null; return; }
    /* The group the marks are in, when they are all in one: the panel then
       shows and changes that group rather than starting a new one. A group
       being edited is kept as long as one of its fields is still marked. */
    if (current) {
      const zones = zoneMap(current.board).zones;
      const ids = new Set([...selected].map((i) => zones[i]));
      if (editing && !ids.has(editing)) editing = null;
      if (!editing && ids.size === 1) editing = [...ids][0];
    }
    if (!panel) { panel = groupPanel(); head.appendChild(panel); }
    refreshPanel();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected.size > 0) setSelection([]);
  });

  /* Keys on a field: Space marks it, Shift with an arrow marks the neighbour too. */
  const keysOn = (cell: HTMLElement, index: number) => {
    cell.addEventListener('keydown', (event) => {
      if (event.target !== cell) return;
      if (event.key === ' ') { event.preventDefault(); selected.has(index) ? selected.delete(index) : selected.add(index); setSelection(selected); return; }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[event.key];
      if (step === undefined) return;
      const next = index + step;
      if (next < 0 || next >= cols * rows) return;
      if ((step === -1 && index % cols === 0) || (step === 1 && next % cols === 0)) return;
      event.preventDefault();
      if (event.shiftKey) setSelection([...selected, index, next]);
      cellNodes()[next]?.focus();
    });
  };

  function render(state: BoardState): void {
    current = state;
    const { board, sentences, cards } = state;
    cols = board.cols;
    rows = board.rows;
    refresh(colsInput, cols);
    refresh(rowsInput, rows);
    selected = new Set([...selected].filter((i) => i < board.cells.length));

    const byId = new Map(sentences.map((s) => [s.id, s]));
    const map = zoneMap(board);
    grid.style.setProperty('--cols', String(cols));
    const nodes: HTMLElement[] = [];
    board.cells.forEach((id, index) => {
      const card = id ? cards.get(id) : undefined;
      const zone = map.zones[index];
      const cell = el('div', {
        class: `cell${card ? '' : ' cell--free'}${zone ? ' cell--zoned' : ''}`,
        attrs: { role: 'listitem', tabindex: 0, 'aria-label': t('ui.board_field', { n: index + 1 }), 'aria-selected': 'false' },
      });
      /* The colour is a layer under the card, stepped in by half a gutter
         where the block ends, so that the same rule draws it on paper — see
         boardSheet() in printSheet.ts, which reads the same zoneBox(). */
      const box = zoneBox(map, index, '4px', '12px', '-2px');
      const style = zone ? map.styles[zone] : undefined;
      if (zone && box) {
        cell.appendChild(el('div', {
          class: 'cell__zone',
          style: {
            '--zone': style?.fill ?? 'transparent', inset: box.inset, borderRadius: box.borderRadius,
            borderColor: style?.frame ?? 'transparent', borderWidth: style?.frame ? zoneBorder(map, index, '2px') ?? '0' : '0',
            clipPath: box.clipPath ?? '',
          },
        }));
        /* Where the block turns an inner corner at this field, the frame is
           carried round it here — see zoneJoint(). */
        if (style?.frame) {
          for (const corner of box.crooks) {
            const j = zoneJoint(corner, '4px', '-2px', '2px');
            cell.appendChild(el('div', {
              class: 'cell__joint',
              style: {
                ...j.position, width: j.size, height: j.size,
                backgroundImage: `linear-gradient(${style.frame}, ${style.frame}), linear-gradient(${style.frame}, ${style.frame})`,
                backgroundPosition: `${j.x} 0, 0 ${j.y}`, backgroundSize: `2px 100%, 100% 2px`,
              },
            }));
          }
        }
        // The name, a shield on the block's top left edge, on the group's first field.
        if (style?.name && labelField(map, zone) === index) {
          cell.appendChild(el('div', { class: 'cell__shield', text: style.name, style: { '--shield': labelColour(style) } }));
        }
      }
      target(cell, 'cell--over', (dropId) => handlers.onPlace(dropId, index));
      cell.addEventListener('pointerdown', (event) => pressAir(event, index));
      keysOn(cell, index);

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
    grid.replaceChildren(...nodes);
    paintSelection();

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
