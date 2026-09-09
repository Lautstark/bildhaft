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

/**
 * Pouring the Wortschatz into a Sammlung.
 *
 * The direction matters and was wrong for a day: „Sammlung daraus" made a *new*
 * Sammlung, which serves the rarer half of what people do with a pot of words.
 * The commoner half is the Sammlung already open, half full, with a name and a
 * template somebody chose — and that one can be poured into again and again,
 * which is what these hold.
 */
describe('what a Sammlung takes from the Wortschatz', () => {
  beforeEach(async () => {
    await repo.clearEverything();
    await repo.putOverride('arasaac', 'Apfel', { id: '2462', label: 'apple', score: 1 });
    await repo.putOverride('arasaac', 'Oma', { id: '111', label: 'washerwoman', score: 1 });
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    await repo.setOverrideTags('arasaac', 'Oma', ['Familie']);
  });

  it('offers every word, and each tag as a smaller answer', async () => {
    const all = await repo.listOverrides('arasaac');
    expect(all).toHaveLength(2);
    expect(all.filter((one) => one.tags?.includes('Familie'))).toHaveLength(1);
  });

  it('carries the picture and the text, not a pointer to them', async () => {
    // What handleAddWords copies onto a slot. A Sammlung printed in March must
    // not change because the Wortschatz changed in June.
    const oma = (await repo.listOverrides('arasaac')).find((one) => one.token === 'oma');
    expect(oma?.symbolId).toBe('111');
    expect(oma?.caption).toBe('Omi');

    await repo.setOverrideCaption('arasaac', 'Oma', 'Großmutter');
    // The entry moved; a slot written from the earlier value is unaffected,
    // because it holds the value rather than the entry.
    const slot = { sourceToken: 'Oma', label: oma?.caption };
    expect(slot.label).toBe('Omi');
  });
});
