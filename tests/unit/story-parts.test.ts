import { describe, expect, it } from 'vitest';
import { partOf } from '../../src/core/types.ts';

/**
 * An Erzählen sheet made before its top row went (2026-11-01) still has its
 * „Hallo" saved under `oben`. It is neither lost nor rewritten: it reads as
 * one of the foot's cards, and being the oldest it comes first there.
 */
describe('a card from the Erzählen sheet’s old top row', () => {
  it('reads as one of the foot’s', () => {
    expect(partOf({ part: 'oben' })).toBe('unten');
    expect(partOf({ part: 'mitte' })).toBe('mitte');
    expect(partOf({})).toBe('zutat');
  });
});
