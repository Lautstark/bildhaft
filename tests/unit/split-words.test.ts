import { describe, expect, it } from 'vitest';
import { splitWords } from '../../src/app/composing.ts';

/** What a typed text becomes on a template of cards: one card a word or a phrase. */
describe('the cards a typed text makes', () => {
  it('cuts at a comma, a semicolon and a new line', () => {
    expect(splitWords('Apfel, Banane;Kiwi\nBirne')).toEqual(['Apfel', 'Banane', 'Kiwi', 'Birne']);
  });

  it('keeps a card of several words whole', () => {
    expect(splitWords('Guten Morgen, rote Paprika')).toEqual(['Guten Morgen', 'rote Paprika']);
  });

  it('does not cut a number at its decimal comma', () => {
    expect(splitWords('1,5 l Milch, Brot')).toEqual(['1,5 l Milch', 'Brot']);
  });

  it('drops what is empty between two cuts', () => {
    expect(splitWords('Apfel,, ,\n\nBanane,')).toEqual(['Apfel', 'Banane']);
  });
});
