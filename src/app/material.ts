import type { Board, Collection, CollectionKind, Sentence, Slot } from '../core/types.ts';
import { COLLECTION_KINDS, kindOf } from '../core/types.ts';
import {
  addGroup, boardOf, placeOn, removeGroup, resizeBoard, takeOff, updateGroup,
} from '../core/board.ts';
import { newId, putCollection, putSentence } from '../db/repo.ts';
import { t } from '../i18n/index.ts';
import { el, fill, place } from '../ui/dom.ts';
import { boardView } from '../ui/board.ts';
import { sentenceRow, type RowView } from '../ui/row.ts';
import { templateArt, wordCard, type WordCardView } from '../ui/wordCard.ts';
import { activeCollection, holdsWords, kind, providerId } from './state.ts';
import type { Ctx } from './context.ts';

/**
 * What a Sammlung's main area holds: rows, a wall of cards, or a Tafel — and,
 * while it is still empty, the choice between them.
 *
 * The three draw into one host, and each states its own layout on it: the
 * host is one node shared by all, so whichever draws into it has to say what
 * it is — leaving the card grid on it turned every row of the next Sammlung
 * into a narrow column with its words stacked, which is what happens when
 * only one of two paths sets a thing.
 */
export function material(ctx: Ctx): {
  rowsHost: HTMLElement;
  emptyState: HTMLElement;
  render(): void;
  paintEmpty(): void;
} & Pick<Ctx, 'writeBoard' | 'handleNewCard'> {
  const { s } = ctx;

  const rowsHost = el('div', { class: 'rows' });
  /* Refilled rather than fixed: an empty Sammlung is where the template is
     still an open question, and that is the only place it can be asked. */
  const emptyState = el('div', { class: 'empty' });

  const rowViews = new Map<string, { view: RowView; sentence: Sentence }>();
  const cardViews = new Map<string, { view: WordCardView; sentence: Sentence }>();

  /**
   * Whether these two records differ in the name and in nothing else.
   *
   * By reference where it can be, because `handleRename` is the only thing that
   * makes the second from the first and it copies the rest across untouched. A
   * field-by-field comparison would be a second description of the row, kept in
   * step by hand; this asks the one question that matters — is anything the row
   * draws from a different object than it was.
   */
  const renamedOnly = (before: Sentence, after: Sentence): boolean =>
    before.title !== after.title
    && before.slots === after.slots
    && before.rawInput === after.rawInput
    && before.collectionId === after.collectionId;

  function render(): void {
    if (kind(s) === 'tafel') { renderBoard(); return; }
    if (holdsWords(s)) { renderCards(); return; }
    for (const { view } of cardViews.values()) view.destroy();
    cardViews.clear();
    rowsHost.className = 'rows';

    if (s.sentences.length === 0) {
      for (const { view } of rowViews.values()) view.destroy();
      rowViews.clear();
      rowsHost.replaceChildren();
      return;
    }

    const seen = new Set<string>();
    const nodes: HTMLElement[] = [];

    for (const sentence of s.sentences) {
      seen.add(sentence.id);
      const existing = rowViews.get(sentence.id);
      // Rebuilding a row throws away its resolved symbols, so only rebuild when
      // the sentence itself was replaced.
      if (existing && existing.sentence === sentence) {
        nodes.push(existing.view.node);
        continue;
      }
      /* A rename is the one replacement that draws the same row — same symbols,
         same order, same captions — and the one where a rebuild would be felt,
         because the name is typed into the row itself. So the row takes the new
         record instead of being made again from it. */
      if (existing && renamedOnly(existing.sentence, sentence)) {
        existing.view.rename(sentence);
        rowViews.set(sentence.id, { view: existing.view, sentence });
        nodes.push(existing.view.node);
        continue;
      }
      existing?.view.destroy();
      const view = sentenceRow(sentence, providerId(s), {
        onOpenSlot: (slotId) => ctx.openPicker(sentence.id, slotId),
        onAddSlot: () => void ctx.handleAddSlot(sentence.id),
        onReorder: (from, to) => void ctx.handleReorder(sentence.id, from, to),
        onUnreadableSymbol: (id) => void ctx.noteUnreadable(id),
        onPrint: () => ctx.openPrint([sentence.id]),
        onDelete: () => void ctx.confirmDeleteSentence(sentence),
        onRename: (title) => void ctx.handleRename(sentence.id, title),
      });
      rowViews.set(sentence.id, { view, sentence });
      nodes.push(view.node);
    }

    for (const [id, { view }] of rowViews) {
      if (!seen.has(id)) { view.destroy(); rowViews.delete(id); }
    }

    place(rowsHost, nodes);
  }

  /**
   * The wall a Wortkarten-Sammlung draws instead of rows.
   *
   * Kept in step the same way `render` keeps its rows: a card is rebuilt
   * only when the record behind it was replaced, because rebuilding one throws
   * away a resolved symbol and the wall is where most of them are.
   */
  function renderCards(): void {
    const nodes = [...syncCards().values()];

    /* The empty card at the end. Typing is the fast way for ten words at once;
       this is the way for the one that is missing, and for somebody who has no
       word in mind and is looking for a picture. It opens the same picker every
       other card does. */
    nodes.push(el('button', {
      class: 'word word--add', text: '+',
      attrs: { type: 'button', 'aria-label': t('ui.new_card') },
      on: { click: () => void handleNewCard() },
    }));

    rowsHost.className = 'rows words';
    place(rowsHost, nodes);
  }

  /**
   * One built card per sentence, kept across paints. Shared by the wall and
   * the Tafel, which draw the same cards in different places.
   */
  function syncCards(): Map<string, HTMLElement> {
    for (const { view } of rowViews.values()) view.destroy();
    rowViews.clear();
    const seen = new Set<string>();
    const nodes = new Map<string, HTMLElement>();
    for (const sentence of s.sentences) {
      seen.add(sentence.id);
      const existing = cardViews.get(sentence.id);
      if (existing && existing.sentence === sentence) { nodes.set(sentence.id, existing.view.node); continue; }
      existing?.view.destroy();
      const view = wordCard(sentence, providerId(s), {
        onOpenSlot: (slotId) => ctx.openPicker(sentence.id, slotId),
        onDelete: () => void ctx.confirmDeleteSentence(sentence),
        onUnreadableSymbol: (id) => void ctx.noteUnreadable(id),
      });
      cardViews.set(sentence.id, { view, sentence });
      nodes.set(sentence.id, view.node);
    }
    for (const [id, { view }] of cardViews) {
      if (!seen.has(id)) { view.destroy(); cardViews.delete(id); }
    }
    return nodes;
  }

  /**
   * The Tafel: the grid with its fields, and under it the cards not on it yet.
   *
   * Every new word lands in the tray. Typing ten words is one act and deciding
   * where each one lies is another, done by hand afterwards — that is what a
   * Tafel is, and why a field can stay free.
   */
  const tafel = boardView({
    onResize: (cols, rows) => void writeBoard((board) => resizeBoard(board, cols, rows)),
    onPlace: (id, index) => void writeBoard((board) => placeOn(board, id, index)),
    onTakeOff: (id) => void writeBoard((board) => takeOff(board, id)),
    onNewCardAt: (index) => void handleNewCard(index),
    onNewCard: () => void handleNewCard(),
    onAddGroup: (colour) => void writeBoard((board) => addGroup(board, colour)),
    onGroup: (index, patch) => void writeBoard((board) => updateGroup(board, index, patch)),
    onRemoveGroup: (index) => void writeBoard((board) => removeGroup(board, index)),
  });

  function renderBoard(): void {
    const open = activeCollection(s);
    if (!open) return;
    tafel.render({ board: boardOf(open), sentences: s.sentences, cards: syncCards() });
    rowsHost.className = 'rows rows--tafel';
    place(rowsHost, [tafel.head, tafel.grid, tafel.tray]);
  }

  /** The open Tafel's grid, changed and written back. */
  async function writeBoard(change: (board: Board) => Board): Promise<void> {
    const open = activeCollection(s);
    if (!open) return;
    const current = boardOf(open);
    const board = change(current);
    // Every helper hands the same object back when there is nothing to do.
    if (board === current) return;
    const next: Collection = { ...open, board, updatedAt: Date.now() };
    s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
    ctx.render();
    await putCollection(next);
  }

  /**
   * A card with no symbol yet, and the picker open on it. On a Tafel it can be
   * made straight into a field, which is where the „+" in a free field leads.
   */
  async function handleNewCard(at?: number): Promise<void> {
    const collectionId = s.activeId;
    if (!collectionId) return;
    const slot: Slot = {
      id: newId(), sourceToken: '', concept: '', origin: 'manual', choice: {}, candidates: {},
    };
    const sentence: Sentence = {
      id: newId(), normalizedInput: '', rawInput: '', slots: [slot],
      collectionId, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await putSentence(sentence);
    s.sentences = [sentence, ...s.sentences];
    if (at !== undefined) await writeBoard((board) => placeOn(board, sentence.id, at));
    ctx.render();
    ctx.openPicker(sentence.id, slot.id);
  }

  /**
   * The two templates, offered while a Sammlung is still empty.
   *
   * Not a dialog before „+ Neue Sammlung": that would be a question in front of
   * a blank page, and today the button makes one immediately (§1.5). So the
   * Sammlung is made as a Satzstreifen — which is what bildhaft has always been
   * and what somebody who touches nothing should get — and the choice stands in
   * the empty state, where there is nothing yet to convert. Once a card or a
   * row is in it, the tiles are gone and the answer is to make another one.
   */
  /** What an empty Sammlung says: what it is for, and which template it is. */
  function paintEmpty(): void {
    fill(emptyState,
      el('b', { text: t('ui.empty_collection') }),
      el('small', { text: t('ui.empty_collection_hint') }),
      templateChoice(),
      /* The second way to start, said once and where it is useful: an empty
         Sammlung is exactly where somebody wants their own words poured in
         rather than typed again. Afterwards it lives in the ⋯, because by then
         the Sammlung has something in it and the wall is the thing to look at.
         Absent rather than greyed while there is no Wortschatz to pour. */
      s.wordCount === 0 ? null : el('p', { class: 'small muted', style: { marginTop: '14px' } },
        el('button', { class: 'linklike', text: t('ui.add_wortschatz'),
          attrs: { type: 'button' }, on: { click: () => void ctx.openWortschatzSheet() } })));
  }

  function templateChoice(): HTMLElement {
    const tile = (which: CollectionKind) => el('button', {
      class: `tpl ${kind(s) === which ? 'tpl--on' : ''}`,
      attrs: { type: 'button', 'aria-pressed': String(kind(s) === which) },
      on: { click: () => void chooseTemplate(which) },
    },
    el('span', { class: 'tpl__art-box' }, templateArt(which)),
    el('span', {},
      el('b', { text: t(`ui.template_${which}`) }),
      el('small', { text: t(`ui.template_${which}_note`) })));

    return el('div', { class: 'templates' }, ...COLLECTION_KINDS.map(tile));
  }

  async function chooseTemplate(which: CollectionKind): Promise<void> {
    const open = activeCollection(s);
    if (!open || kindOf(open) === which) return;
    const next: Collection = { ...open, kind: which, updatedAt: Date.now() };
    /* A Tafel is born with its grid, so the record says what it is from the
       first paint; the other kinds have none and carry no field for one. */
    if (which === 'tafel') next.board = boardOf(next);
    else delete next.board;
    s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
    ctx.render();
    await putCollection(next);
  }

  return { rowsHost, emptyState, render, paintEmpty, writeBoard, handleNewCard };
}
