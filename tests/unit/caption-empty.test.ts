import { describe, expect, it } from 'vitest';
import { slotCaption, type Slot } from '../../src/core/types.ts';

const card = (label?: string | null): Slot => ({
  id: 's', sourceToken: 'Hallo', concept: 'hallo', origin: 'manual', choice: {}, candidates: {},
  ...(label !== undefined ? { label } : {}),
});

describe('slotCaption', () => {
  it('falls back to the word when the card has no words of its own', () => {
    expect(slotCaption(card())).toBe('Hallo');
    expect(slotCaption(card(null))).toBe('Hallo');
  });
  it('prints nothing for a card she emptied', () => {
    expect(slotCaption(card(''))).toBe('');
    expect(slotCaption(card('  '))).toBe('');
  });
  it('prints her own words', () => {
    expect(slotCaption(card('Hallo Mia'))).toBe('Hallo Mia');
  });
});
