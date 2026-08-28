import { describe, expect, it } from 'vitest';
import type { Sentence, Slot } from '../../src/core/types.ts';
import { ownImageId, symbolIdFor, symbolIdsIn } from '../../src/core/types.ts';

/**
 * Which picture a slot shows, and which pictures a print job has to have in
 * hand before it starts.
 *
 * The second question is the one that went wrong. The print dialog asked it by
 * reading `slot.choice` itself instead of going through `symbolIdFor`, so a
 * slot holding a picture of the user's own was never resolved before
 * `window.print()`. It was not a reliable blank — the card kicks off its own
 * resolution too and usually won that race on a fast disk — which is exactly
 * why it is pinned here as a list of ids rather than as something about the
 * rendered page.
 */

function slot(over: Partial<Slot> = {}): Slot {
  return {
    id: 'slot-1',
    sourceToken: 'Apfel',
    concept: 'apfel',
    origin: 'exact',
    choice: {},
    candidates: {},
    ...over,
  };
}

const row = (...slots: Slot[]): Pick<Sentence, 'slots'> => ({ slots });

describe('symbolIdFor', () => {
  it('takes the provider\'s choice when there is no own picture', () => {
    expect(symbolIdFor(slot({ choice: { arasaac: '2497' } }), 'arasaac')).toBe('2497');
  });

  it('is null when the active provider has no choice', () => {
    expect(symbolIdFor(slot({ choice: { metacom: 'PNG/ja' } }), 'arasaac')).toBeNull();
  });

  it('prefers an own picture over the provider\'s choice', () => {
    const withPhoto = slot({ choice: { arasaac: '2497' }, ownImage: 'img-7' });
    expect(symbolIdFor(withPhoto, 'arasaac')).toBe(ownImageId('img-7'));
  });

  it('keeps showing an own picture whichever source is active', () => {
    const withPhoto = slot({ choice: { arasaac: '2497' }, ownImage: 'img-7' });
    expect(symbolIdFor(withPhoto, 'metacom')).toBe(ownImageId('img-7'));
  });
});

describe('symbolIdsIn', () => {
  it('names an own picture, so the warm step cannot skip it', () => {
    const ids = symbolIdsIn([row(
      slot({ id: 'a', choice: { arasaac: '2497' } }),
      slot({ id: 'b', choice: { arasaac: '111' }, ownImage: 'img-7' }),
    )], 'arasaac');

    expect(ids).toEqual(['2497', ownImageId('img-7')]);
  });

  it('gathers every row, not just the first', () => {
    const ids = symbolIdsIn([
      row(slot({ id: 'a', choice: { arasaac: '1' } })),
      row(slot({ id: 'b', choice: { arasaac: '2' } })),
    ], 'arasaac');

    expect(ids).toEqual(['1', '2']);
  });

  it('drops slots with nothing to show rather than passing on a null', () => {
    const ids = symbolIdsIn([row(
      slot({ id: 'a', choice: { arasaac: '1' } }),
      slot({ id: 'b', choice: {} }),
      slot({ id: 'c', choice: { arasaac: null } }),
    )], 'arasaac');

    expect(ids).toEqual(['1']);
  });

  it('is empty for an empty job', () => {
    expect(symbolIdsIn([], 'arasaac')).toEqual([]);
    expect(symbolIdsIn([row()], 'arasaac')).toEqual([]);
  });
});
