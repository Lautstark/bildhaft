import { newId } from '../db/repo.ts';
import type { Override, ProviderId, Slot } from './types.ts';
import type { SymbolProvider } from '@lautstark/bildquelle';
import type { ResolvedWord } from '@lautstark/bildquelle/german';
import { resolveText } from '../i18n/pipeline.ts';

/**
 * How many candidates travel with a stored slot. Enough to change your mind
 * without reopening the network, small enough that a 500-line book export stays
 * a sane size. The picker re-queries the provider for the full list when opened.
 */
const STORED_CANDIDATES = 8;

export interface MatchContext {
  provider: SymbolProvider;
  stopwords: Set<string>;
  overrides: Map<string, Override>;
}

/**
 * Turns a German sentence into ordered slots with ranked candidates.
 *
 * The German half of this - tokenising, lemmas, compounds, separable verbs,
 * synonyms - is @lautstark/bildquelle/german now. It used to be five modules
 * and six tables in this folder, and it moved because vorlaut reads sentences
 * too and the alternative was a second lemmatiser that would disagree with
 * this one.
 *
 * What is left here is what was always bildhaft's: the personal override
 * dictionary, and turning a resolved word into a stored Slot with an id and a
 * per-provider choice. The dictionary is passed in as `prefer` and is still
 * checked before anything else - the package calls the hook first and marks
 * what it answers as an override, which is exactly what this file did.
 */
export async function buildSlots(raw: string, ctx: MatchContext): Promise<Slot[]> {
  const words = await resolveText(raw, {
    provider: ctx.provider,
    stopwords: ctx.stopwords,
    prefer: (key) => {
      const override = ctx.overrides.get(key);
      return override
        ? [{ id: override.symbolId, label: override.label, score: 1000 }]
        : null;
    },
  });
  return words.map((word) => toSlot(word, ctx.provider.id, ctx.overrides));
}

function toSlot(word: ResolvedWord, provider: ProviderId, overrides: Map<string, Override>): Slot {
  const chosen = word.candidates[0]?.id ?? null;
  const kept = word.candidates.slice(0, STORED_CANDIDATES);
  /* The words that go with the symbol, when the Wortschatz has been told what
     they should be. `prefer` above can only hand back a picture — a candidate is an
     id, a name and a score — so the caption has to be read here, from the same
     entry, or setting one in the Wortschatz would change nothing anywhere a
     sentence is written. It lands on the slot as if a person had typed it,
     because that is what it is: they typed it once, for every sentence. */
  const caption = (overrides.get(word.concept.toLowerCase())
    ?? overrides.get(word.sourceToken.toLowerCase()))?.caption;
  return {
    id: newId(),
    sourceToken: word.sourceToken,
    concept: word.concept,
    origin: word.origin,
    choice: { [provider]: chosen },
    candidates: { [provider]: kept },
    ...(caption ? { label: caption } : {}),
  };
}

/**
 * One card's worth: the whole line as a single slot.
 *
 * Not `buildSlots`, which is the sentence pipeline and would turn „Kita
 * Sonnenschein" into two cards and drop „der" for being a function word. On a
 * word card a line is one thing by definition — that is what the template
 * means — so the line is looked up whole and the Wortschatz is asked first,
 * exactly as it is for a sentence.
 *
 * Returns a slot with no symbol when the source has nothing, rather than
 * nothing at all: an empty card that opens the picker is where the proper nouns
 * get their picture, and refusing the line would be refusing the case this is
 * most needed for.
 */
export async function buildWordSlot(raw: string, ctx: MatchContext): Promise<Slot> {
  const word = raw.trim();
  const held = ctx.overrides.get(word.toLowerCase());
  const candidates = held
    ? [{ id: held.symbolId, label: held.label, score: 1000 }]
    : await ctx.provider.search(word).catch(() => []);

  return {
    id: newId(),
    sourceToken: word,
    concept: word.toLowerCase(),
    origin: held ? 'override' : 'lemma',
    choice: { [ctx.provider.id]: candidates[0]?.id ?? null },
    candidates: { [ctx.provider.id]: candidates.slice(0, STORED_CANDIDATES) },
    ...(held?.caption ? { label: held.caption } : {}),
  };
}

/**
 * Re-resolves existing slots against a different provider, preserving any manual
 * choice the user already made for that provider. This is what lets one stored
 * sentence render in ARASAAC for someone without a METACOM licence and in METACOM
 * for someone with one.
 */
export async function resolveSlotsForProvider(
  slots: Slot[],
  provider: SymbolProvider,
  overrides: Map<string, Override>,
): Promise<Slot[]> {
  return Promise.all(slots.map(async (slot) => {
    if (slot.choice[provider.id] !== undefined && slot.candidates[provider.id]) return slot;

    const override = overrides.get(slot.concept.toLowerCase());
    const candidates = override
      ? [{ id: override.symbolId, label: override.label, score: 1000 }]
      : await provider.search(slot.concept);

    return {
      ...slot,
      choice: { ...slot.choice, [provider.id]: slot.choice[provider.id] ?? candidates[0]?.id ?? null },
      candidates: { ...slot.candidates, [provider.id]: candidates.slice(0, STORED_CANDIDATES) },
    };
  }));
}

/**
 * Re-picks each slot's symbol from the source as it now ranks things.
 *
 * resolveSlotsForProvider deliberately leaves a slot alone once it has a
 * choice — it is there to fill in a provider that has never been resolved.
 * Changing which of METACOM's parallel renderings is preferred is the opposite
 * case: every choice is still the right symbol and the wrong copy of it, so
 * each one has to be asked again.
 *
 * A slot someone picked by hand is left as it is. That choice was about this
 * word and this picture, and a later preference about renderings is not a
 * reason to overrule it.
 */
export async function refreshSlotChoices(
  slots: Slot[],
  provider: SymbolProvider,
  overrides: Map<string, Override>,
): Promise<Slot[]> {
  return Promise.all(slots.map(async (slot) => {
    if (slot.origin === 'manual' || !slot.concept) return slot;

    const override = overrides.get(slot.concept.toLowerCase());
    const candidates = override
      ? [{ id: override.symbolId, label: override.label, score: 1000 }]
      : await provider.search(slot.concept);
    if (candidates.length === 0) return slot;

    return {
      ...slot,
      choice: { ...slot.choice, [provider.id]: candidates[0].id },
      candidates: { ...slot.candidates, [provider.id]: candidates.slice(0, STORED_CANDIDATES) },
    };
  }));
}
