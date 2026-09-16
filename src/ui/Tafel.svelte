<script lang="ts">
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
   * The cards themselves are the wall's cards — `WordCard.svelte` — drawn here
   * as they are drawn there. They used to be built once by the caller and
   * handed in, because a card rebuilt was a symbol resolved again; the keyed
   * blocks below keep a card across every paint of the grid it stays in, and
   * the process-wide URL cache answers the one case they cannot cover, which is
   * a card carried from the tray into a field.
   */
  import type { Board, ProviderId, Sentence, ZoneStyle } from '../core/types.ts';
  import {
    blockAt, boardOf, firstFree, labelColour, labelField, MAX_BOARD_SIDE, newZoneId,
    placeOn, resizeBoard, takeOff, zoneBorder, zoneBox, zoneJoint, zoneMap,
  } from '../core/board.ts';
  import { dissolveZone, setZone } from '../core/board.ts';
  import WordCard from './WordCard.svelte';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { handleNewCard, writeBoard } from '../app/board.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  /**
   * The eight hues a group can be, each in two strengths: `frame` strong enough
   * to be a line, `fill` pale enough for a white card to stay a white card on
   * it, and for the toner. Frame and fill are picked apart — a yellow frame on
   * a blue ground is allowed — but the hues are the same eight in both rows,
   * so that the two rows read as one palette.
   */
  const ZONE_COLOURS: { frame: string; fill: string; name: string }[] = [
    { frame: '#f0b323', fill: '#fff1b3', name: 'ui.zone_yellow' },
    { frame: '#4caf50', fill: '#d8f2d2', name: 'ui.zone_green' },
    { frame: '#3f88e0', fill: '#d8e9fc', name: 'ui.zone_blue' },
    { frame: '#e35d8f', fill: '#fddfe9', name: 'ui.zone_pink' },
    { frame: '#f0862b', fill: '#ffe3c9', name: 'ui.zone_orange' },
    { frame: '#9366d6', fill: '#eadffb', name: 'ui.zone_purple' },
    { frame: '#23ada0', fill: '#d3f2ee', name: 'ui.zone_teal' },
    { frame: '#dd4a44', fill: '#fbdad8', name: 'ui.zone_red' },
  ];

  const MIME = 'text/plain';
  /** How far the pointer has to travel before a press on the air is a frame and not a click. */
  const DRAG_THRESHOLD = 6;

  /* boardOf() fills a record that has no grid yet with the default one, which
     is the frame between a template change and the write that follows it. */
  let board = $derived<Board>(boardOf(activeCollection() ?? {}));
  let map = $derived(zoneMap(board));
  let byId = $derived(new Map(s.sentences.map((one) => [one.id, one])));
  let placed = $derived(new Set(board.cells));
  let waiting = $derived(s.sentences.filter((one) => !placed.has(one.id)));
  let free = $derived(firstFree(board));

  /** Which card is being carried, while the drag is ours. */
  let carrying = $state<string | null>(null);
  /** Which field or the tray the pointer is over, so the drop target can say so. */
  let overCell = $state<number | null>(null);
  let overTray = $state(false);

  /** The marked fields, by index. Kept until „Fertig" or Escape. */
  let selected = $state.raw<Set<number>>(new Set());
  /**
   * The group the panel is changing: the one the marked fields are all in,
   * or one made on the first choice for fields that were in none.
   */
  let editing = $state<string | null>(null);
  /** The fields a frame being drawn is touching, while it is being drawn. */
  let framed = $state.raw<Set<number>>(new Set());
  /** Where the frame lies on the grid, or null when none is being drawn. */
  let frame = $state.raw<{ left: number; top: number; width: number; height: number } | null>(null);

  let grid: HTMLElement;
  let colsInput: HTMLInputElement;
  let rowsInput: HTMLInputElement;
  let nameInput: HTMLInputElement | undefined = $state();

  /* Refreshed rather than bound: a paint lands on every keystroke in the
     composer, and a value written over the field being typed in would put the
     stored number back under the finger. */
  $effect(() => {
    const value = board.cols;
    if (document.activeElement !== colsInput && colsInput.valueAsNumber !== value) colsInput.value = String(value);
  });
  $effect(() => {
    const value = board.rows;
    if (document.activeElement !== rowsInput && rowsInput.valueAsNumber !== value) rowsInput.value = String(value);
  });

  /* A grid that shrank takes its marks with it. */
  $effect(() => {
    const fits = [...selected].filter((i) => i < board.cells.length);
    if (fits.length !== selected.size) selected = new Set(fits);
  });

  /* The group the marks are in, when they are all in one: the panel then shows
     and changes that group rather than starting a new one. A group being
     edited is kept as long as one of its fields is still marked — a field
     pressed into the selection while the panel is open joins that group on the
     next choice, which is how a group grows. */
  $effect(() => {
    if (selected.size === 0) { editing = null; return; }
    const ids = new Set([...selected].map((i) => map.zones[i]));
    if (editing && !ids.has(editing)) editing = null;
    if (!editing && ids.size === 1) editing = [...ids][0] ?? null;
  });

  /* Escape puts the marks down. */
  $effect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected.size > 0) selected = new Set();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  });

  /* ------------------------------------------------------------- cards --- */

  function clear(): void { carrying = null; overCell = null; overTray = false; }

  /** The dragged card's id, from the closure while the drag is ours and from the payload otherwise. */
  const dropped = (event: DragEvent): string | null =>
    carrying ?? (event.dataTransfer?.getData(MIME) || null);

  function cardDragStart(event: DragEvent, id: string): void {
    carrying = id;
    event.dataTransfer?.setData(MIME, id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function over(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function drop(event: DragEvent, onDrop: (id: string) => void): void {
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
  }

  /* --------------------------------------------------------- selection --- */

  const cellNodes = (): HTMLElement[] => [...grid.querySelectorAll<HTMLElement>('.cell')];

  /** Which fields a frame on the page touches. */
  function fieldsUnder(a: { x: number; y: number }, b: { x: number; y: number }): number[] {
    const left = Math.min(a.x, b.x); const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y); const bottom = Math.max(a.y, b.y);
    const hit: number[] = [];
    cellNodes().forEach((cell, index) => {
      const r = cell.getBoundingClientRect();
      if (r.right > left && r.left < right && r.bottom > top && r.top < bottom) hit.push(index);
    });
    return hit;
  }

  /**
   * A press on a field's air. Alone it marks the field, or unmarks it; on a
   * grouped field with nothing marked yet it marks the whole block, so a
   * group is changed as one. Held and moved, it draws a frame instead, and
   * every field the frame touches is marked when it is let go.
   */
  function pressAir(event: PointerEvent, index: number): void {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.board-card, .cell__add, .group-panel')) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    let drawing = false;
    const move = (e: PointerEvent) => {
      const here = { x: e.clientX, y: e.clientY };
      if (!drawing) {
        if (Math.hypot(here.x - start.x, here.y - start.y) < DRAG_THRESHOLD) return;
        drawing = true;
        grid.setPointerCapture(e.pointerId);
      }
      const box = grid.getBoundingClientRect();
      frame = {
        left: Math.min(start.x, here.x) - box.left, top: Math.min(start.y, here.y) - box.top,
        width: Math.abs(here.x - start.x), height: Math.abs(here.y - start.y),
      };
      framed = new Set(fieldsUnder(start, here));
    };
    const up = (e: PointerEvent) => {
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', up);
      grid.removeEventListener('pointercancel', up);
      if (drawing) {
        const hit = fieldsUnder(start, { x: e.clientX, y: e.clientY });
        frame = null;
        framed = new Set();
        selected = new Set([...selected, ...hit]);
        return;
      }
      if (selected.has(index)) {
        const next = new Set(selected);
        next.delete(index);
        selected = next;
        return;
      }
      if (selected.size === 0 && map.zones[index]) { selected = new Set(blockAt(map, index)); return; }
      selected = new Set([...selected, index]);
    };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);
  }

  /* Keys on a field: Space marks it, Shift with an arrow marks the neighbour too. */
  function keysOn(event: KeyboardEvent, index: number): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ') {
      event.preventDefault();
      const next = new Set(selected);
      if (next.has(index)) next.delete(index); else next.add(index);
      selected = next;
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -board.cols, ArrowDown: board.cols }[event.key];
    if (step === undefined) return;
    const next = index + step;
    if (next < 0 || next >= board.cols * board.rows) return;
    if ((step === -1 && index % board.cols === 0) || (step === 1 && next % board.cols === 0)) return;
    event.preventDefault();
    if (event.shiftKey) selected = new Set([...selected, index, next]);
    cellNodes()[next]?.focus();
  }

  /* ------------------------------------------------------------- panel --- */

  /** The style the panel is showing: the group's, or nothing yet. */
  let style = $derived<ZoneStyle>((editing && map.styles[editing]) || {});

  /**
   * One choice in the panel. The marked fields join the group being edited —
   * or a new one, on the first choice — and the group takes the style, whole.
   * Nothing waits for „Fertig": the Tafel is the preview.
   */
  function choose(patch: Partial<ZoneStyle>): void {
    const next = { ...style, ...patch };
    const id = editing ?? newZoneId(board);
    editing = id;
    const indices = [...selected];
    void writeBoard((one) => setZone(one, indices, id, next));
  }

  /* Written when the typing pauses, and on leaving the field: every keystroke
     straight to the store would be a write and a repaint each. */
  let pending: ReturnType<typeof setTimeout> | null = null;
  function flushName(): void {
    if (pending) { clearTimeout(pending); pending = null; }
    if (!nameInput) return;
    if (nameInput.value.trim() !== (style.name ?? '')) choose({ name: nameInput.value.trim() || undefined });
  }
  function typedName(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(flushName, 400);
  }

  /* The field is written from the store only when nobody is in it, so a name
     being typed is never put back mid-word. */
  $effect(() => {
    const held = style.name ?? '';
    if (nameInput && document.activeElement !== nameInput && nameInput.value.trim() !== held) {
      nameInput.value = held;
    }
  });

  const isOwn = (key: 'frame' | 'fill') =>
    Boolean(style[key]) && !ZONE_COLOURS.some((c) => c[key] === style[key]);

  const caption = (sentence: Sentence | undefined): string => {
    const slot = sentence?.slots[0];
    return slot?.label?.trim() || slot?.sourceToken || '…';
  };

  /** The joint that carries a frame round an inner corner of a block. */
  const joint = (corner: 'tl' | 'tr' | 'br' | 'bl', colour: string) => {
    const j = zoneJoint(corner, '4px', '-2px', '2px');
    return {
      ...j.position, width: j.size, height: j.size,
      backgroundImage: `linear-gradient(${colour}, ${colour}), linear-gradient(${colour}, ${colour})`,
      backgroundPosition: `${j.x} 0, 0 ${j.y}`, backgroundSize: '2px 100%, 100% 2px',
    } as Record<string, string>;
  };

  const asStyle = (from: Record<string, string>): string =>
    Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`).join(';');
</script>

<div class="board-head"><label class="small">{t('ui.columns')}<input bind:this={colsInput} class="field board-head__n" type="number" min="1" max={MAX_BOARD_SIDE} step="1" aria-label={t('ui.columns')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n)) void writeBoard((one) => resizeBoard(one, n, board.rows)); }} /></label><span class="faint" aria-hidden="true">×</span><label class="small">{t('ui.rows')}<input bind:this={rowsInput} class="field board-head__n" type="number" min="1" max={MAX_BOARD_SIDE} step="1" aria-label={t('ui.rows')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n)) void writeBoard((one) => resizeBoard(one, board.cols, n)); }} /></label><!--
  The panel over the marked fields: how many, and the three things a group can
  have — a name, a frame, a colour behind — each with „Kein" first, each taking
  effect on the spot. „Gruppe entfernen" takes all three away; „Fertig" only
  puts the marks down. In the head row rather than floating over the fields: a
  bar over the first row covered the very tiles the next press was meant for.
-->{#if selected.size > 0}<div class="group-panel" role="group" aria-label={t('ui.selection')} onpointerdown={(event) => event.stopPropagation()}><div class="group-panel__head"><span class="group-panel__count">{selected.size === 1 ? t('ui.n_fields_one') : t('ui.n_fields', { n: selected.size })}</span><button class="group-panel__done" type="button" onclick={() => { flushName(); selected = new Set(); }}>{t('ui.done')}</button></div><span class="group-panel__label">{t('ui.group_name')}</span><input bind:this={nameInput} class="field group-panel__name" type="text" placeholder={t('ui.group_name_none')} aria-label={t('ui.group_name')} maxlength="40" oninput={typedName} onblur={flushName} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); flushName(); } }} />{#each [{ key: 'frame' as const, what: t('ui.group_frame'), ownStart: '#3f88e0' }, { key: 'fill' as const, what: t('ui.group_fill'), ownStart: '#d8e9fc' }] as row (row.key)}<span class="group-panel__label">{row.what}</span><div class="group-panel__row" role="group" aria-label={row.what}><button class="group-panel__swatch group-panel__swatch--none{style[row.key] ? '' : ' group-panel__swatch--on'}" type="button" aria-label="{row.what}: {t('ui.none')}" aria-pressed={!style[row.key]} onclick={() => choose({ [row.key]: undefined })}></button>{#each ZONE_COLOURS as colour (colour.name)}<button class="group-panel__swatch{style[row.key] === colour[row.key] ? ' group-panel__swatch--on' : ''}" type="button" style:--c={colour[row.key]} aria-label={t('ui.colour_for', { what: row.what, colour: t(colour.name) })} aria-pressed={style[row.key] === colour[row.key]} onclick={() => choose({ [row.key]: colour[row.key] })}></button>{/each}<label class="group-panel__wheel{isOwn(row.key) ? ' group-panel__swatch--on' : ''}" title={t('ui.own_colour_for', { what: row.what })}><input class="group-panel__own" type="color" value={style[row.key] ?? row.ownStart} aria-label={t('ui.own_colour_for', { what: row.what })} onchange={(event) => choose({ [row.key]: event.currentTarget.value })} /></label></div>{/each}<div class="group-panel__foot"><button class="group-panel__remove" type="button" disabled={!editing} onclick={() => { const id = editing; selected = new Set(); if (id) void writeBoard((one) => dissolveZone(one, id)); }}>{t('ui.remove_group')}</button></div></div>{/if}</div>

<div bind:this={grid} class="board" role="list" style:--cols={String(board.cols)}>{#each board.cells as id, index (index)}{@const card = id ? byId.get(id) : undefined}{@const zone = map.zones[index]}{@const box = zoneBox(map, index, '4px', '12px', '-2px')}{@const zoneStyle = zone ? map.styles[zone] : undefined}<!-- A field takes the keyboard, because Space marks it and an arrow walks to
     the next one; and it says whether it is marked, which is what the panel
     above is counting. Both are what `role="listitem"` has no vocabulary for,
     and the list is what the grid is. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex, a11y_role_supports_aria_props -->
<div
  class="cell"
  class:cell--free={!card}
  class:cell--zoned={!!zone}
  class:cell--over={overCell === index}
  class:cell--selected={selected.has(index)}
  class:cell--framed={framed.has(index)}
  role="listitem"
  tabindex="0"
  aria-label={t('ui.board_field', { n: index + 1 })}
  aria-selected={selected.has(index)}
  ondragover={(event) => { over(event); overCell = index; }}
  ondragleave={() => { if (overCell === index) overCell = null; }}
  ondrop={(event) => drop(event, (dropId) => void writeBoard((one) => placeOn(one, dropId, index)))}
  onpointerdown={(event) => pressAir(event, index)}
  onkeydown={(event) => keysOn(event, index)}
><!--
  The colour is a layer under the card, stepped in by half a gutter where the
  block ends, so that the same rule draws it on paper — see PrintSheet.svelte,
  which reads the same zoneBox(). Its frame runs along those same ends and
  nowhere else, and where the block turns an inner corner at this field the
  frame is carried round it by a joint.
-->{#if zone && box}<div class="cell__zone" style:--zone={zoneStyle?.fill ?? 'transparent'} style:inset={box.inset} style:border-radius={box.borderRadius} style:border-color={zoneStyle?.frame ?? 'transparent'} style:border-width={zoneStyle?.frame ? zoneBorder(map, index, '2px') ?? '0' : '0'} style:clip-path={box.clipPath ?? ''}></div>{#if zoneStyle?.frame}{#each box.crooks as corner (corner)}<div class="cell__joint" style={asStyle(joint(corner, zoneStyle.frame))}></div>{/each}{/if}{#if zoneStyle?.name && labelField(map, zone) === index}<!--
  The name, a shield on the block's top left edge, on the group's first field.
--><div class="cell__shield" style:--shield={labelColour(zoneStyle)}>{zoneStyle.name}</div>{/if}{/if}{#if card && id}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="board-card" class:board-card--dragging={carrying === id} draggable="true" ondragstart={(event) => cardDragStart(event, id)} ondragend={clear}><WordCard sentence={card} {provider} /><button class="board-card__move" type="button" aria-label={t('ui.board_take_off', { word: caption(card) })} onclick={() => void writeBoard((one) => takeOff(one, id))}>↓</button></div>{:else}<!--
  A field with nothing in it is also where a card that does not exist yet can be
  made — the same „+" the wall ends with, in the place the card is going to lie.
--><button class="cell__add" type="button" aria-label={t('ui.board_new_here', { n: index + 1 })} onclick={() => void handleNewCard(index)}>+</button>{/if}</div>{/each}{#if frame}<div class="board__frame" style:left="{frame.left}px" style:top="{frame.top}px" style:width="{frame.width}px" style:height="{frame.height}px"></div>{/if}</div>

<!-- svelte-ignore a11y_no_static_element_interactions --><div class="tray" class:tray--over={overTray} ondragover={(event) => { over(event); overTray = true; }} ondragleave={() => { overTray = false; }} ondrop={(event) => drop(event, (id) => void writeBoard((one) => takeOff(one, id)))}><div class="tray__head"><b>{t('ui.board_tray')}</b><span class="small faint">{t('ui.board_tray_hint')}</span></div><div class="words tray__wall">{#each waiting as sentence (sentence.id)}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="board-card" class:board-card--dragging={carrying === sentence.id} title={t('ui.board_drag_hint')} draggable="true" ondragstart={(event) => cardDragStart(event, sentence.id)} ondragend={clear}><WordCard {sentence} {provider} /><button class="board-card__move" type="button" aria-label={t('ui.board_put_on', { word: caption(sentence) })} disabled={free === -1} onclick={() => void writeBoard((one) => placeOn(one, sentence.id, firstFree(board)))}>↑</button></div>{/each}<button class="word word--add" type="button" aria-label={t('ui.new_card')} onclick={() => void handleNewCard()}>+</button></div></div>
