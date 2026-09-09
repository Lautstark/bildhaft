import { describe, expect, it } from 'vitest';
import { KINDS, SHARED, SHARED_KINDS, APP } from '../../src/db/folder.ts';

/**
 * Where the Wortschatz lives in a folder.
 *
 * The words a household has settled belong to the household, not to the
 * programme that was open when they settled them — which stops being true the
 * moment the records sit under `bildhaft/`. So there are two compartments in
 * one folder, and the thing worth holding is that they stay two: a subtree that
 * quietly folded back into the product's own would be invisible until the day a
 * second product went looking and found nothing.
 */
describe('the folder’s compartments', () => {
  it('keeps the Wortschatz beside bildhaft rather than inside it', () => {
    expect(SHARED).not.toBe(APP);
    expect([...SHARED_KINDS]).toEqual(['woerterbuch']);
  });

  it('declares the dictionary in both, because one of them still has to be read', () => {
    // bildhaft keeps the kind declared so a folder written before the move can
    // still be read out of `bildhaft/woerterbuch/` and emptied into the other.
    // Dropping it here would strand exactly the folders the move exists for.
    expect(KINDS).toContain('woerterbuch');
  });
});
