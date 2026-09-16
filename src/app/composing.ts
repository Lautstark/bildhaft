import type { Sentence } from '../core/types.ts';
import { normalizeInput, splitLines } from '@lautstark/bildquelle/german';
import { buildSlots, buildWordSlot } from '../core/match.ts';
import { findByNormalized, newId, overrideMap, putSentence } from '../db/repo.ts';
import { withTimeout } from '../core/timeout.ts';
import { LANG, t } from '../i18n/index.ts';
import { holdsWords, provider, providerId, s } from './state.svelte.ts';
import { notify } from './notify.ts';
import { LOOKUP_MS, STORE_MS, sayWhy } from './waiting.ts';

/**
 * How many lines are translated at the same time.
 *
 * Four rather than all of them. A line is a chain of lookups — one per word,
 * each waiting on the one before it — so a pasted song spent its whole time
 * with a single request in flight and the page empty: 24 lines of a children's
 * song took eight seconds against a 150 ms endpoint, and a picture book takes
 * minutes. Four keeps four requests moving without turning a paste into a
 * burst at a free public service, which is the same restraint the cache is
 * there for.
 */
const LINES_AT_ONCE = 4;

/* What the composer does with what was typed: the reuse hint, and Enter. */

let reuseTimer = 0;

export function scheduleReuseLookup(): void {
  window.clearTimeout(reuseTimer);
  const normalized = normalizeInput(s.draft);
  if (!normalized) {
    s.reuse = null;
    return;
  }
  reuseTimer = window.setTimeout(async () => {
    const hits = await findByNormalized(normalized);
    const hit = hits.find((h) => h.slots.length > 0) ?? null;
    if (normalizeInput(s.draft) === normalized) s.reuse = hit;
  }, 320);
}

/**
 * Puts a row where its age says it goes.
 *
 * The list is sorted newest first and translations no longer land in the
 * order they were started, so a row cannot simply go on the front. createdAt
 * is what fixes the order — it counts down through the batch — and reading it
 * back here is what lets a line that finished early wait for its place.
 */
function placeRow(sentence: Sentence): void {
  const at = s.sentences.findIndex((x) => x.createdAt < sentence.createdAt);
  s.sentences = at === -1
    ? [...s.sentences, sentence]
    : [...s.sentences.slice(0, at), sentence, ...s.sentences.slice(at)];
}

export async function handleSubmit(): Promise<void> {
  const raw = s.draft.trim();
  const collectionId = s.activeId;
  if (!raw || !s.settings || !collectionId || s.busy) return;

  const lines = splitLines(raw);
  if (lines.length === 0) return;

  s.busy = true;
  /*
   * The box is emptied now, not at the end. A pasted text is the case where
   * the wait is long enough to read as a hang, and a box still holding the
   * words is the strongest sign nothing happened. Whatever fails to translate
   * is put back below, so nothing is lost by clearing it early.
   */
  s.draft = '';
  s.reuse = null;
  s.batch = lines.length > 1 ? { done: 0, total: lines.length } : null;

  const now = Date.now();
  /*
   * The lines still owed a row. A line is struck off the moment its row is
   * written, so whatever is left at the end — a word the source could not be
   * asked about, or a failure before the first line was even started — is
   * exactly what goes back into the box.
   */
  const owed = [...lines];
  let firstError: unknown = null;

  try {
    /* Everything that can throw is inside, so that the `finally` below always
       hands the button back. It used to matter more than it does: the paint
       was a call rather than a consequence, and one error in it left `busy`
       set and the button spinning for good. */
    const words = holdsWords();
    const options = {
      provider: provider(),
      stopwords: new Set(s.settings.stopwords[LANG]),
      overrides: await overrideMap(providerId()),
    };

    /*
     * Each line is written and drawn as it comes back, rather than the whole
     * batch appearing at the end. That is what a long text needed: the rows
     * fill in from the top while the rest is still being looked up, and the
     * first corrections can be made before the last line has arrived.
     */
    const translate = async (line: string, index: number): Promise<void> => {
      try {
        const sentence: Sentence = {
          id: newId(),
          normalizedInput: normalizeInput(line),
          rawInput: line,
          /* One card holds one thing, so on that template the whole line is
             looked up as one word — „Kita Sonnenschein" is one card, and
             „der" is not dropped for being a function word. */
          /* With an end: a source that does not answer gives the line back
             to the box with a word about it, rather than a button that spins
             until the tab is closed. */
          slots: await withTimeout(
            words ? buildWordSlot(line, options).then((slot) => [slot]) : buildSlots(line, options),
            LOOKUP_MS, t('ui.wait_source')),
          collectionId,
          /*
           * Descending within the batch. The list is sorted newest first, so
           * this is what keeps the lines in the order they were typed — which
           * is also the order they get printed in.
           */
          createdAt: now - index,
          updatedAt: now,
        };
        await withTimeout(putSentence(sentence), STORE_MS, t('ui.wait_store'));
        delete owed[index];
        if (s.activeId === collectionId) placeRow(sentence);
      } catch (err) {
        firstError ??= err;
      }
      if (s.batch) s.batch = { ...s.batch, done: s.batch.done + 1 };
    };

    let next = 0;
    await Promise.all(Array.from({ length: Math.min(LINES_AT_ONCE, lines.length) },
      async () => {
        while (next < lines.length) {
          const index = next++;
          await translate(lines[index], index);
        }
      }));
  } catch (err) {
    firstError ??= err;
  } finally {
    s.busy = false;
    s.batch = null;
    /* Back into the box, in the order they were written. A book whose tenth
       line has no symbols must not take the ninety after it down with it. */
    const left = [...owed].filter(Boolean);
    if (left.length > 0) s.draft = left.join('\n');
    if (firstError !== null) notify(sayWhy(firstError));
  }
}

export async function handleReuse(): Promise<void> {
  if (!s.reuse || !s.activeId) return;
  const now = Date.now();
  const sentence: Sentence = {
    ...s.reuse,
    id: newId(),
    slots: s.reuse.slots.map((slot) => ({ ...slot, id: newId() })),
    collectionId: s.activeId,
    createdAt: now,
    updatedAt: now,
  };
  await putSentence(sentence);
  s.sentences = [sentence, ...s.sentences];
  s.draft = '';
  s.reuse = null;
}
