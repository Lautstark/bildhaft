import { newId } from '../db/repo.ts';
import type { Override, ProviderId, Slot } from './types.ts';
import type { SymbolProvider } from '@lautstark/bildquelle';
import { resolveText, type ResolvedWord } from '@lautstark/bildquelle/german';

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
  return words.map((word) => toSlot(word, ctx.provider.id));
}

function toSlot(word: ResolvedWord, provider: ProviderId): Slot {
  const chosen = word.candidates[0]?.id ?? null;
  const kept = word.candidates.slice(0, STORED_CANDIDATES);
  return {
    id: newId(),
    sourceToken: word.sourceToken,
    concept: word.concept,
    origin: word.origin,
    choice: { [provider]: chosen },
    candidates: { [provider]: kept },
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
