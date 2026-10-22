import type { Sentence } from '../core/types.ts';
import { newId, patchCollection, putSentence } from '../db/repo.ts';
import { handleAddSlot } from './editing.ts';
import { s } from './state.svelte.ts';

/**
 * A material's title: its words, kept on the Sammlung, and its symbols, the
 * fields of its `titel` sentence. Written in Bearbeiten, and only there; the
 * print view says whether and where it prints, never what it says.
 */

/** The open material's `titel` sentence, made the first time a symbol is asked for. */
async function titleSentence(): Promise<Sentence | null> {
  const collectionId = s.activeId;
  if (!collectionId) return null;
  const held = s.sentences.find((one) => one.part === 'titel');
  if (held) return held;
  const now = Date.now();
  const sentence: Sentence = {
    id: newId(), normalizedInput: '', rawInput: '', slots: [], collectionId,
    createdAt: now, updatedAt: now, part: 'titel',
  };
  await putSentence(sentence);
  s.sentences = [...s.sentences, sentence];
  return sentence;
}

/** One more symbol at the end of the title, chosen in the picker every field has. */
export async function addTitleSymbol(): Promise<void> {
  const sentence = await titleSentence();
  if (sentence) await handleAddSlot(sentence.id);
}

/**
 * The words of the title. Empty, or the name itself, is no title of its own:
 * the field is dropped and the title follows the name again, now and whenever
 * the name changes.
 */
export async function setTitle(text: string): Promise<void> {
  const id = s.activeId;
  const open = s.collections.find((c) => c.id === id);
  if (!id || !open) return;
  const own = text.trim() && text.trim() !== open.name.trim() ? text.trim() : undefined;
  if (own === open.title) return;
  s.collections = s.collections.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c };
    if (own) next.title = own; else delete next.title;
    return next;
  });
  await patchCollection(id, { title: own });
}
