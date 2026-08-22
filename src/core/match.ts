import synonymTable from '../data/synonyms.json';
import { tokenize, type Token } from './tokenize.ts';
import { lemmatize } from './lemmatize.ts';
import { findSeparableMerge } from './separable.ts';
import { splitCompound } from './compound.ts';
import { newId } from '../db/repo.ts';
import type { Candidate, Override, ProviderId, Slot, SlotOrigin } from './types.ts';
import type { SymbolProvider } from '@lautstark/bildquelle';

const SYNONYMS = synonymTable as Record<string, string[]>;

/** How many lemma guesses to spend a lookup on before moving to the next strategy. */
const MAX_LEMMA_TRIES = 3;

/**
 * How many candidates travel with a stored slot. Enough to change your mind
 * without reopening the network, small enough that a 500-line book export stays
 * a sane size. The picker re-queries the provider for the full list when opened.
 */
const STORED_CANDIDATES = 8;

interface SlotSpec {
  sourceToken: string;
  concept: string;
  origin: SlotOrigin;
  candidates: Candidate[];
}

export interface MatchContext {
  provider: SymbolProvider;
  stopwords: Set<string>;
  overrides: Map<string, Override>;
}

/**
 * Turns a German sentence into ordered slots with ranked candidates.
 *
 * Deliberately shallow: this is a lexical pipeline, not a parser. Coverage on
 * simple concrete language is the goal; the tail is corrected by hand in the UI,
 * and every correction feeds the personal override dictionary, which is what
 * actually makes the tool good after a few weeks of real use.
 */
export async function buildSlots(raw: string, ctx: MatchContext): Promise<Slot[]> {
  const tokens = tokenize(raw);
  const merge = findSeparableMerge(tokens);

  const specs: SlotSpec[] = [];

  for (const token of tokens) {
    // The particle of a separable verb is folded into its verb, not its own slot.
    if (merge && token.index === merge.particleIndex) continue;

    if (merge && token.index === merge.verbIndex) {
      specs.push(await resolveMerged(merge.lemma, merge.display, ctx));
      continue;
    }

    // Function words get no slot of their own — AAC output is telegraphic.
    if (ctx.stopwords.has(token.lower)) continue;

    specs.push(...(await resolveToken(token, ctx)));
  }

  return specs.map((spec) => toSlot(spec, ctx.provider.id));
}

function toSlot(spec: SlotSpec, provider: ProviderId): Slot {
  const chosen = spec.candidates[0]?.id ?? null;
  const kept = spec.candidates.slice(0, STORED_CANDIDATES);
  return {
    id: newId(),
    sourceToken: spec.sourceToken,
    concept: spec.concept,
    origin: spec.origin,
    choice: { [provider]: chosen },
    candidates: { [provider]: kept },
  };
}

async function resolveMerged(lemma: string, display: string, ctx: MatchContext): Promise<SlotSpec> {
  const override = ctx.overrides.get(lemma.toLowerCase());
  if (override) {
    return {
      sourceToken: display,
      concept: lemma,
      origin: 'override',
      candidates: [{ id: override.symbolId, label: override.label, score: 1000 }],
    };
  }

  const candidates = await ctx.provider.search(lemma);
  return {
    sourceToken: display,
    concept: lemma,
    origin: candidates.length > 0 ? 'separable' : 'unmatched',
    candidates,
  };
}

async function resolveToken(token: Token, ctx: MatchContext): Promise<SlotSpec[]> {
  // 1. Personal override dictionary — checked first, before everything else.
  const override = ctx.overrides.get(token.lower);
  if (override) {
    return [{
      sourceToken: token.surface,
      concept: token.lower,
      origin: 'override',
      candidates: [{ id: override.symbolId, label: override.label, score: 1000 }],
    }];
  }

  const guesses = lemmatize(token.lower, token.capitalized);

  // 2. Direct lemma lookup against the active symbol index.
  for (const { lemma } of guesses.slice(0, MAX_LEMMA_TRIES)) {
    const candidates = await ctx.provider.search(lemma);
    if (candidates.length > 0) {
      return [{
        sourceToken: token.surface,
        concept: lemma,
        origin: lemma === token.lower ? 'raw' : 'lemma',
        candidates,
      }];
    }
  }

  // 3. Compound splitting. German punishes you here immediately.
  const best = guesses[0]?.lemma.toLowerCase() ?? token.lower;
  for (const form of new Set([best, token.lower])) {
    const parts = splitCompound(form);
    if (!parts) continue;

    const resolved = await Promise.all(
      parts.map(async (part) => ({
        part,
        candidates: await ctx.provider.search(part.word),
      })),
    );

    // Only accept the split if it actually bought us symbols.
    if (resolved.some((r) => r.candidates.length > 0)) {
      return resolved.map(({ part, candidates }) => ({
        sourceToken: part.word,
        concept: part.word.toLowerCase(),
        origin: candidates.length > 0 ? ('compound' as const) : ('unmatched' as const),
        candidates,
      }));
    }
  }

  // 4. Synonym fallback: Fahrrad -> Rad.
  for (const { lemma } of guesses.slice(0, MAX_LEMMA_TRIES)) {
    for (const synonym of SYNONYMS[lemma.toLowerCase()] ?? []) {
      const candidates = await ctx.provider.search(synonym);
      if (candidates.length > 0) {
        return [{
          sourceToken: token.surface,
          concept: lemma,
          origin: 'synonym',
          candidates,
        }];
      }
    }
  }

  // 5. Nothing found. Emit a visible placeholder — never silently drop a word.
  return [{
    sourceToken: token.surface,
    concept: guesses[0]?.lemma ?? token.lower,
    origin: 'unmatched',
    candidates: [],
  }];
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
