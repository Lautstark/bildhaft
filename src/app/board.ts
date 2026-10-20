import type { Board, Collection, Sentence, Slot } from '../core/types.ts';
import { boardOf, placeOn, placedIds, resizeBoard } from '../core/board.ts';
import { newId, patchCollection, putSentence } from '../db/repo.ts';
import { activeCollection, s } from './state.svelte.ts';
import { openPicker } from './editing.ts';
import { notify } from './notify.ts';
import { t } from '../i18n/index.ts';

/**
 * Writes to a Tafel, and the card that is made straight into a field.
 *
 * A file of its own because both of its callers would otherwise import the
 * other: the Tafel writes them from its grid and its tray, and `editing.ts`
 * frees a field when the card lying in it is deleted.
 */

/** The open Tafel's grid, changed and written back. */
export async function writeBoard(change: (board: Board) => Board): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const current = boardOf(open);
  const board = change(current);
  // Every helper hands the same object back when there is nothing to do.
  if (board === current) return;
  const next: Collection = { ...open, board, updatedAt: Date.now() };
  s.collections = s.collections.map((c) => (c.id === next.id ? next : c));
  // The grid alone: the rest of the copy on screen may be behind the store.
  await patchCollection(next.id, { board });
}

/**
 * The open Tafel at another size. A card whose field is gone goes back to the
 * cards not yet on the Tafel — and that is said, because it happens below the
 * counter that was pressed, where nobody is looking.
 */
export async function resizeOpenBoard(cols: number, rows: number): Promise<void> {
  const open = activeCollection();
  if (!open) return;
  const before = placedIds(boardOf(open)).length;
  let after = before;
  await writeBoard((board) => {
    const next = resizeBoard(board, cols, rows);
    after = placedIds(next).length;
    return next.cols === board.cols && next.rows === board.rows ? board : next;
  });
  const off = before - after;
  if (off > 0) notify(off === 1 ? t('ui.board_off_one') : t('ui.board_off', { n: off }));
}

/**
 * A card with no symbol yet, and the picker open on it. On a Tafel it can be
 * made straight into a field, which is where the „+" in a free field leads.
 */
export async function handleNewCard(at?: number): Promise<void> {
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
  openPicker(sentence.id, slot.id);
}
