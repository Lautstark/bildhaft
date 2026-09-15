import type { Candidate, Sentence, Slot } from '../core/types.ts';
import { sentenceCaption } from '../core/types.ts';
import { takeOff } from '../core/board.ts';
import { metacom } from '@lautstark/bildquelle';
import {
  deleteSentence, newId, pruneOwnImages, putOverride, putOwnImage, putSentence,
} from '../db/repo.ts';
import { t } from '../i18n/index.ts';
import { confirmDialog } from '../ui/dialog.ts';
import { openSlotPicker } from '../ui/slotPicker.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { kind, providerId } from './state.ts';
import type { Ctx } from './context.ts';

type Editing = Pick<Ctx,
  'openPicker' | 'handleAddSlot' | 'handleReorder' | 'handleRename'
  | 'confirmDeleteSentence' | 'noteUnreadable'>;

/**
 * Edits to one sentence: its name, its slots, and the picker that settles a
 * slot. Everything here goes through `queued`, for the reason on it.
 */
export function editing(ctx: Ctx): Editing {
  const { s } = ctx;

  /**
   * One edit to a sentence at a time, in the order the edits were made.
   *
   * The picker can settle a field while an earlier edit to the same field is
   * still being written — type a caption, then press a symbol — and a handler
   * that read the store before the write in front of it had landed built its
   * change on the slot as it was, putting the earlier edit back.
   *
   * Queueing rather than updating the store first, because "what the row shows
   * has been written" is worth keeping: there is no undo here and no server to
   * ask, so an edit that is visible but not yet saved is one a reload can eat.
   * A failed write drops out of the queue and does not stall the ones behind it.
   */
  let writes: Promise<unknown> = Promise.resolve();

  function queued<T>(fn: () => Promise<T>): Promise<T> {
    const run = writes.then(fn, fn);
    writes = run.catch(() => undefined);
    return run;
  }

  async function updateSentence(next: Sentence): Promise<void> {
    await putSentence(next);
    s.sentences = s.sentences.map((x) => (x.id === next.id ? next : x));
    ctx.render();
  }

  /**
   * Names a row, or takes the name off it again.
   *
   * Trimming is decided here rather than in the bound field, which hands over
   * exactly what was typed — bildhaft has somewhere to show an unnamed row, so
   * an empty name is allowed and means the typed line.
   */
  function handleRename(sentenceId: string, title: string): Promise<void> {
    return queued(async () => {
      const sentence = s.sentences.find((x) => x.id === sentenceId);
      if (!sentence) return;
      const next = title.trim();
      if (next === (sentence.title?.trim() ?? '')) return;
      // Empty is stored as absent, so "never named" and "name cleared" stay
      // the one state rather than two that read alike.
      await updateSentence({ ...sentence, title: next || null });
    });
  }

  /** Reads the sentence inside the queue, so it sees the edit before it. */
  function mutateSlots(sentenceId: string, fn: (slots: Slot[]) => Slot[]): Promise<void> {
    return queued(async () => {
      const sentence = s.sentences.find((x) => x.id === sentenceId);
      if (!sentence) return;
      await updateSentence({ ...sentence, slots: fn(sentence.slots) });
    });
  }

  function openPicker(sentenceId: string, slotId: string): void {
    const slot = s.sentences.find((x) => x.id === sentenceId)?.slots.find((sl) => sl.id === slotId);
    if (!slot) return;
    s.picker = { sentenceId, slotId };
    openSlotPicker(slot, providerId(s), {
      onChoose: (candidate) => void handleChoose(candidate),
      onOwnImage: (picture, name) => void handleOwnImage(picture, name),
      onClearOwnImage: () => void handleClearOwnImage(),
      onNegate: (negated) => void handleNegate(negated),
      onLabel: (label) => void handleLabel(label),
      onRemove: () => void handleRemoveSlot(),
      onClose: () => void handleClosePicker(),
    });
  }

  async function handleChoose(candidate: Candidate): Promise<void> {
    if (!s.picker) return;
    // The field is settled now; which field it was has to be taken now too,
    // because the work below waits its turn behind any edit still in flight.
    const { sentenceId, slotId } = s.picker;
    s.picker = null;

    await queued(async () => {
      const sentence = s.sentences.find((x) => x.id === sentenceId);
      const slot = sentence?.slots.find((sl) => sl.id === slotId);
      if (!sentence || !slot) return;
      const source = providerId(s);

      const isNew = !slot.concept;
      const nextSlot: Slot = {
        ...slot,
        // A slot added by hand takes its word from the chosen symbol.
        sourceToken: isNew ? candidate.label : slot.sourceToken,
        concept: isNew ? candidate.label.toLowerCase() : slot.concept,
        // Either way a human chose this, so say so. Leaving the pipeline's origin
        // in place made the tooltip claim a lemma lookup had picked the symbol.
        origin: 'manual',
        choice: { ...slot.choice, [source]: candidate.id },
        candidates: {
          ...slot.candidates,
          [source]: mergeCandidate(slot.candidates[source] ?? [], candidate),
        },
      };

      await updateSentence({
        ...sentence,
        slots: sentence.slots.map((sl) => (sl.id === slot.id ? nextSlot : sl)),
      });

      if (!isNew) {
        // Remember the correction under both the typed word and the resolved concept,
        // so it fires again whether the same surface form or a variant shows up.
        const keys = new Set([slot.sourceToken.toLowerCase(), slot.concept.toLowerCase()]);
        for (const key of keys) {
          if (key.trim()) await putOverride(source, key, candidate);
        }
      }
    });
  }

  /*
   * A picture of the user's own goes in whole: the bytes are copied into
   * bildhaft, so the file it came from is free to move or disappear. The slot
   * keeps whatever symbol it had underneath, and removing the picture later
   * uncovers it rather than leaving an empty field.
   */
  async function handleOwnImage(picture: Blob, name: string): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    s.picker = null;

    await queued(async () => {
      const sentence = s.sentences.find((x) => x.id === sentenceId);
      const slot = sentence?.slots.find((sl) => sl.id === slotId);
      if (!sentence || !slot) return;

      try {
        const image = await putOwnImage(picture, name);
        await updateSentence({
          ...sentence,
          slots: sentence.slots.map((sl) => (sl.id === slotId ? {
            ...sl,
            ownImage: image.id,
            // A field added by hand takes its word from the file it was given.
            sourceToken: sl.sourceToken || stemOf(name),
            concept: sl.concept || stemOf(name).toLowerCase(),
            origin: 'manual' as const,
          } : sl)),
        });
        ctx.notify(t('ui.own_picture_saved'));
      } catch {
        ctx.notify(t('ui.own_picture_failed'));
      }
    });
  }

  async function handleClearOwnImage(): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    s.picker = null;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, ownImage: null } : sl)));
    // The picture itself only goes once nothing points at it any more.
    await pruneOwnImages();
    resetSymbolResolution();
  }

  /*
   * Unlike every other picker outcome this one leaves `picker` alone: crossing a
   * symbol out does not settle the dialog, so the field it refers to has to
   * still be the one the dialog is editing when the next toggle arrives.
   */
  async function handleNegate(negated: boolean): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, negated } : sl)));
  }

  /*
   * Like negation, a rewording leaves the dialog open, so `picker` stays put:
   * the field being edited has to still be the one the next keystroke means.
   *
   * An empty field is stored as null rather than as '', because "" and "no
   * wording of its own" are the same state and only one of them should be
   * capable of being written to disk.
   */
  async function handleLabel(label: string): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    const next = label.trim() || null;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, label: next } : sl)));
  }

  async function handleRemoveSlot(): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    s.picker = null;
    /* A card is its one slot. Take that away and what is left is a record
       with no picture, no word and nothing to open — which is what the „+"
       left behind whenever its picker was closed without a choice: a blank
       card whose only working control was its ×, and a „Zeile löschen: „“
       wird entfernt" for anybody who pressed it. There is nothing in it to
       lose, so it goes without being asked about, and its field on a Tafel
       goes free with it. A row keeps its other slots as before. */
    const sentence = s.sentences.find((x) => x.id === sentenceId);
    const left = sentence?.slots.filter((sl) => sl.id !== slotId) ?? [];
    if (sentence && left.length === 0 && !sentence.rawInput.trim()) {
      await deleteSentence(sentence.id);
      s.sentences = s.sentences.filter((x) => x.id !== sentence.id);
      if (kind(s) === 'tafel') await ctx.writeBoard((board) => takeOff(board, sentence.id));
      ctx.render();
      return;
    }
    await mutateSlots(sentenceId, (slots) => slots.filter((sl) => sl.id !== slotId));
  }

  async function handleAddSlot(sentenceId: string): Promise<void> {
    const slot: Slot = {
      id: newId(),
      sourceToken: '',
      concept: '',
      origin: 'manual',
      choice: {},
      candidates: {},
    };
    await mutateSlots(sentenceId, (slots) => [...slots, slot]);
    openPicker(sentenceId, slot.id);
  }

  async function handleReorder(sentenceId: string, from: number, to: number): Promise<void> {
    await mutateSlots(sentenceId, (slots) => {
      const next = [...slots];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Discard a hand-added slot the user never filled. */
  async function handleClosePicker(): Promise<void> {
    if (!s.picker) return;
    const { sentenceId, slotId } = s.picker;
    const slot = s.sentences
      .find((x) => x.id === sentenceId)
      ?.slots.find((sl) => sl.id === slotId);
    if (slot && !slot.concept) await handleRemoveSlot();
    s.picker = null;
  }

  async function confirmDeleteSentence(sentence: Sentence): Promise<void> {
    const ok = await confirmDialog({
      title: t('ui.delete_row_title'),
      body: t('ui.row_will_be_removed', { text: sentenceCaption(sentence) }),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteSentence(sentence.id);
    s.sentences = s.sentences.filter((x) => x.id !== sentence.id);
    /* Its field on a Tafel is freed with it. The board tolerates an id it
       cannot find — it draws the field free — but a record that names a card
       which no longer exists is a record that lies. */
    if (kind(s) === 'tafel') await ctx.writeBoard((board) => takeOff(board, sentence.id));
    ctx.render();
  }

  async function noteUnreadable(id: string): Promise<void> {
    if (providerId(s) !== 'metacom') return;
    /*
     * A symbol the current folder simply does not contain is missing, not
     * unreadable — that is the ordinary result of pointing at a differently
     * organised folder, and it must not be reported as the folder being
     * unreadable. Only count symbols the index still knows about.
     */
    const known = await metacom.labelFor(id).catch(() => null);
    if (known) { s.unreadable += 1; ctx.render(); }
  }

  return {
    openPicker, handleAddSlot, handleReorder, handleRename, confirmDeleteSentence, noteUnreadable,
  };
}

/** "Bente-Sommer 2026.jpg" -> "Bente-Sommer 2026". The filename is the only label a photo has. */
function stemOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || t('ui.picture');
}

function mergeCandidate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  if (candidates.some((c) => c.id === candidate.id)) return candidates;
  // Keep a manually searched pick in the list so it stays offered next time.
  return [candidate, ...candidates].slice(0, 8);
}
