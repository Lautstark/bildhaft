import type { RecipePart, Sentence } from '../core/types.ts';
import { normalizeInput, splitLines } from '@lautstark/bildquelle/german';
import { buildSlots, buildWordSlot } from '../core/match.ts';
import { buildPartSlot } from '../core/recipe.ts';
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

/*
 * The rows whose write was given up on, by the line they were made from.
 *
 * Giving up on a store write does not stop it — `withTimeout` says so — and an
 * IndexedDB that is stalled behind another tab's upgrade lands every queued
 * write the moment the other tab lets go. So the line that was put back in the
 * box may already be a row by the time it is sent again, and a second row with
 * a fresh id beside it was the duplicate. Sending it again under the *same* id
 * makes the second write a put over the first rather than a second row,
 * whichever of the two lands first and whether or not the first ever does.
 *
 * Keyed by the Sammlung, the part and the text, because that is what "the same
 * line sent again" means: a line edited in the box is a different line, and
 * the same words sent to another Sammlung are another row. A list per line,
 * and each id is taken by one line only, because a song repeats its lines and
 * two rows of „La la la" are two rows. Bounded by what timed out this session,
 * which is a handful of lines on a bad day.
 */
const unsettled = new Map<string, { id: string; createdAt: number }[]>();

/** The id a line timed out under before, if it did, taken so no other line gets it. */
function takeUnsettled(key: string): { id: string; createdAt: number } | undefined {
  const held = unsettled.get(key);
  const first = held?.shift();
  if (held && held.length === 0) unsettled.delete(key);
  return first;
}

const lineKey = (collectionId: string, line: string, part?: RecipePart): string =>
  `${collectionId}\n${part ?? ''}\n${line}`;

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
  /* Without itself: a line sent again under the id of a write that timed out
     may already be on screen, if that write landed and the list was read back
     since — and one id twice in a keyed list is an error, not a duplicate. */
  const rows = s.sentences.filter((x) => x.id !== sentence.id);
  const at = rows.findIndex((x) => x.createdAt < sentence.createdAt);
  s.sentences = at === -1
    ? [...rows, sentence]
    : [...rows.slice(0, at), sentence, ...rows.slice(at)];
}

export async function handleSubmit(): Promise<void> {
  const raw = s.draft.trim();
  if (!raw || !s.settings || !s.activeId || s.busy) return;
  /*
   * The box is emptied now, not at the end. A pasted text is the case where
   * the wait is long enough to read as a hang, and a box still holding the
   * words is the strongest sign nothing happened. Whatever fails to translate
   * is put back, so nothing is lost by clearing it early.
   */
  s.draft = '';
  s.reuse = null;
  const left = await addLines(raw);
  if (left) s.draft = left;
}

/**
 * Translates what was typed into rows or cards of the open Sammlung, and hands
 * back whatever could not be — for the box it came from to show again.
 *
 * Shared by the composer and by the three boxes of a Rezept, which differ only
 * in where the lines land: `part` says which part of the recipe, and with it
 * how a line is looked up — a Schritt as a sentence, a Zutat or a Hilfsmittel
 * as one card with its amount kept off the lookup.
 */
export async function addLines(raw: string, part?: RecipePart): Promise<string> {
  const collectionId = s.activeId;
  if (!raw.trim() || !s.settings || !collectionId || s.busy) return raw;

  const lines = splitLines(raw.trim());
  if (lines.length === 0) return '';

  s.busy = true;
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
    const words = part ? part !== 'schritt' : holdsWords();
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
      const key = lineKey(collectionId, line, part);
      const earlier = takeUnsettled(key);
      let parked = false;
      try {
        const sentence: Sentence = {
          id: earlier?.id ?? newId(),
          normalizedInput: normalizeInput(line),
          rawInput: line,
          /* One card holds one thing, so on that template the whole line is
             looked up as one word — „Kita Sonnenschein" is one card, and
             „der" is not dropped for being a function word. */
          /* With an end: a source that does not answer gives the line back
             to the box with a word about it, rather than a button that spins
             until the tab is closed. */
          slots: await withTimeout(
            words
              ? (part ? buildPartSlot(line, options) : buildWordSlot(line, options)).then((slot) => [slot])
              : buildSlots(line, options),
            LOOKUP_MS, t('ui.wait_source')),
          collectionId,
          /*
           * Descending within the batch. The list is sorted newest first, so
           * this is what keeps the lines in the order they were typed — which
           * is also the order they get printed in.
           *
           * A Rezept reads its parts the other way, oldest first, because a
           * recipe is written top to bottom: the next Schritt goes under the
           * last one. So its lines count up instead, and a pasted recipe
           * comes out in the order it was pasted.
           */
          /* A line sent again after a write that timed out keeps its first
             place as well as its id, so the row the late write made does
             not move when this one lands over it. */
          createdAt: earlier?.createdAt ?? (part ? now + index : now - index),
          updatedAt: now,
          ...(part ? { part } : {}),
        };
        try {
          await withTimeout(putSentence(sentence), STORE_MS, t('ui.wait_store'));
        } catch (err) {
          unsettled.set(key, [...(unsettled.get(key) ?? []),
            { id: sentence.id, createdAt: sentence.createdAt }]);
          parked = true;
          throw err;
        }
        delete owed[index];
        if (s.activeId === collectionId) placeRow(sentence);
      } catch (err) {
        /* A lookup that failed before the write was tried leaves the earlier
           write's id where it was, for the next time the line is sent. */
        if (earlier && !parked) unsettled.set(key, [earlier, ...(unsettled.get(key) ?? [])]);
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
    if (firstError !== null) notify(sayWhy(firstError));
  }
  /* Back into the box, in the order they were written. A book whose tenth
     line has no symbols must not take the ninety after it down with it. */
  return [...owed].filter(Boolean).join('\n');
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
