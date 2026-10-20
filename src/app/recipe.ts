import type { RecipePart, Sentence } from '../core/types.ts';
import { partOf, sentenceCaption, slotCaption } from '../core/types.ts';
import { deleteSentence, newId, putSentence } from '../db/repo.ts';
import { handleAddSlot, openPicker } from './editing.ts';
import { addLines } from './composing.ts';
import { s } from './state.svelte.ts';

/**
 * A Rezept changed part by part, where the part stands — the way a Lied is.
 * The box at the top still adds to the part chosen under it; these are the
 * part's own „+ Zutat" and „✎ Text".
 */

const linesOf = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

/** A part's entries top to bottom, the order the Rezept shows and prints. */
export const entriesOf = (part: RecipePart): Sentence[] =>
  s.sentences.filter((sentence) => partOf(sentence) === part).sort((a, b) => a.createdAt - b.createdAt);

/* What an entry reads as where it stands: a card its caption („2 Eier"), a
   Schritt its name — what is seen is what the text shows. */
const shown = (sentence: Sentence): string => (partOf(sentence) === 'schritt'
  ? sentenceCaption(sentence)
  : (sentence.slots[0] ? slotCaption(sentence.slots[0]) : '') || sentence.rawInput);

/** A part as text, one entry a line, for writing it again. */
export const partText = (part: RecipePart): string => entriesOf(part).map(shown).join('\n');

/** Lines typed under a part, at its end. Hands back what could not be added. */
export function addToPart(part: RecipePart, text: string): Promise<string> {
  return addLines(text, part);
}

/**
 * One part written again as text. An entry whose line is kept keeps its row
 * and every symbol fixed in it; only new lines are looked up; lines taken
 * out go. The order is the text's. Nothing is taken out unless every new
 * line found its symbols — a half-written part would print a step short.
 */
export async function rewritePart(part: RecipePart, text: string): Promise<string> {
  const lines = linesOf(text);
  const collectionId = s.activeId;
  if (!collectionId || s.busy) return text;
  const pool = entriesOf(part);
  const base = Math.min(Date.now(), ...pool.map((sentence) => sentence.createdAt));
  const kept = lines.map((line) => {
    const at = pool.findIndex((sentence) => shown(sentence).trim() === line || sentence.rawInput.trim() === line);
    return at === -1 ? null : pool.splice(at, 1)[0]!;
  });

  const fresh = lines.filter((_, at) => !kept[at]);
  const made = new Map<string, Sentence[]>();
  if (fresh.length > 0) {
    const left = await addLines(fresh.join('\n'), part, (line, sentence) => {
      made.set(line, [...(made.get(line) ?? []), sentence]);
    });
    if (left) return text;
  }
  if (s.activeId !== collectionId) return '';

  const placed: Sentence[] = [];
  for (const [at, line] of lines.entries()) {
    const sentence = kept[at] ?? made.get(line)?.shift();
    if (!sentence) continue;
    const next = { ...sentence, createdAt: base + at };
    if (next.createdAt !== sentence.createdAt) await putSentence(next);
    placed.push(next);
  }
  for (const gone of pool) await deleteSentence(gone.id);
  const byId = new Map(placed.map((sentence) => [sentence.id, sentence]));
  const goneIds = new Set(pool.map((sentence) => sentence.id));
  s.sentences = s.sentences.filter((sentence) => !goneIds.has(sentence.id)).map((sentence) => byId.get(sentence.id) ?? sentence);
  return '';
}

/**
 * The picture beside a Rezept's name, chosen in the picker every field has.
 * Its sentence is made the first time it is asked for, with one empty field;
 * a field left empty is taken out again when the picker closes, as any field
 * added by hand is, and the Rezept then has no picture.
 */
export async function chooseTitlePicture(): Promise<void> {
  const collectionId = s.activeId;
  if (!collectionId) return;
  let sentence = s.sentences.find((one) => one.part === 'titel');
  if (!sentence) {
    const now = Date.now();
    sentence = {
      id: newId(), normalizedInput: '', rawInput: '', slots: [], collectionId,
      createdAt: now, updatedAt: now, part: 'titel',
    };
    await putSentence(sentence);
    s.sentences = [...s.sentences, sentence];
  }
  const field = sentence.slots[0];
  if (field) { openPicker(sentence.id, field.id); return; }
  await handleAddSlot(sentence.id);
}
