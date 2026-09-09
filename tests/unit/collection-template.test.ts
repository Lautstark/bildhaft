import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import { buildWordSlot } from '../../src/core/match.ts';
import { kindOf, slotCaption } from '../../src/core/types.ts';
import { ArasaacProvider } from '@lautstark/bildquelle';

/**
 * A Sammlung's template — what one card holds.
 *
 * Two things worth holding. A Sammlung that was made before there were
 * templates is a Satzstreifen one, and stays one without anything rewriting it.
 * And a word card takes the whole line: `buildSlots` would make „Kita
 * Sonnenschein" two cards and drop „der" for being a function word, which is
 * the sentence pipeline being right about sentences and wrong about cards.
 */
describe('a Sammlung’s template', () => {
  beforeEach(async () => { await repo.clearEverything(); });

  it('is Satzstreifen when nobody chose, and the record says nothing', async () => {
    const made = await repo.createCollection('Alt');
    expect(made).not.toHaveProperty('kind');
    expect(kindOf(made)).toBe('satzstreifen');
  });

  it('is written only when it is the other one', async () => {
    expect(await repo.createCollection('Karten', 'wortkarten'))
      .toMatchObject({ kind: 'wortkarten' });
    expect(await repo.createCollection('Sätze', 'satzstreifen')).not.toHaveProperty('kind');
  });
});

describe('one card’s worth of a line', () => {
  const provider = new ArasaacProvider();

  beforeEach(async () => {
    await repo.clearEverything();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      { ok: true, status: 200, json: () => Promise.resolve([]) } as unknown as Response)));
  });

  it('keeps a two-word name as one card', async () => {
    const slot = await buildWordSlot('Kita Sonnenschein', {
      provider, stopwords: new Set(['der']), overrides: new Map(),
    });
    expect(slot.sourceToken).toBe('Kita Sonnenschein');
  });

  it('keeps a function word, which a sentence would have dropped', async () => {
    const slot = await buildWordSlot('der', {
      provider, stopwords: new Set(['der']), overrides: new Map(),
    });
    expect(slot.sourceToken).toBe('der');
  });

  it('takes the Wortschatz first, picture and text', async () => {
    await repo.putOverride('arasaac', 'Oma', { id: '111', label: 'washerwoman', score: 1 });
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    const slot = await buildWordSlot('Oma', {
      provider, stopwords: new Set<string>(), overrides: await repo.overrideMap('arasaac'),
    });
    expect(slot.choice.arasaac).toBe('111');
    expect(slotCaption(slot)).toBe('Omi');
  });
});
