import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import { buildSlots } from '../../src/core/match.ts';
import { slotCaption } from '../../src/core/types.ts';
import { ArasaacProvider } from '@lautstark/bildquelle';

/**
 * An entry is a word, a picture, and the text that goes with the picture. The
 * third of those was missing for a week: the picker offered „Text zum Symbol"
 * from a Wortschatz card and threw the answer away, so the field appeared to
 * work and changed nothing anywhere.
 *
 * What holds it here is the two ends of that: the caption survives the writes
 * that go over the same record, and it reaches a sentence written afterwards —
 * because a caption that only shows on its own card is a caption nobody needs.
 */
describe('the text an entry carries', () => {
  beforeEach(async () => {
    await repo.clearEverything();
    await repo.putOverride('arasaac', 'Oma', { id: '111', label: 'washerwoman', score: 100 });
  });

  const entry = async () =>
    (await repo.listOverrides('arasaac')).find((one) => one.token === 'oma');

  it('is kept apart from the name the source gave the picture', async () => {
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    const held = await entry();
    // Both, and they are different facts: one is printed, the other is what
    // hands this entry back to the pipeline as a candidate.
    expect(held?.caption).toBe('Omi');
    expect(held?.label).toBe('washerwoman');
  });

  it('survives a better picture being chosen for the same word', async () => {
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    await repo.putOverride('arasaac', 'Oma', { id: '222', label: 'grandmother', score: 100 });
    expect((await entry())?.caption).toBe('Omi');
  });

  it('is gone rather than empty when it is cleared', async () => {
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    await repo.setOverrideCaption('arasaac', 'Oma', '  ');
    // Not '' — an entry that never had one and one cleared of it are the same
    // record, and both mean "the word itself".
    expect(await entry()).not.toHaveProperty('caption');
  });

  it('is what a sentence written afterwards puts on the slot', async () => {
    await repo.setOverrideCaption('arasaac', 'Oma', 'Omi');
    const slots = await buildSlots('Oma', {
      provider: new ArasaacProvider(),
      stopwords: new Set<string>(),
      overrides: await repo.overrideMap('arasaac'),
    });
    expect(slots).toHaveLength(1);
    expect(slotCaption(slots[0]!)).toBe('Omi');
    // The word stays the key it was matched on, so the next correction still
    // finds the same entry.
    expect(slots[0]!.sourceToken).toBe('Oma');
  });
});
