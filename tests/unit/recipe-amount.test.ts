import { describe, expect, it } from 'vitest';
import { splitAmount } from '../../src/core/recipe.ts';

/**
 * What a line of a Zutaten list looks up, and what it keeps for the card.
 *
 * The waffle recipe this template was made from, line for line, and the
 * lines that must not be taken apart — a name, a coloured tool, a line that
 * is only an amount.
 */
describe('a Zutat taken apart into how much and what', () => {
  it.each([
    ['2 Eier', '2', 'Eier'],
    ['325 ml Milch', '325 ml', 'Milch'],
    ['250 g Mehl', '250 g', 'Mehl'],
    ['50g Zucker', '50g', 'Zucker'],
    ['1 Päckchen Vanillezucker', '1 Päckchen', 'Vanillezucker'],
    ['125 ml Rapsöl', '125 ml', 'Rapsöl'],
    ['wenig Salz', 'wenig', 'Salz'],
    ['eine Prise Salz', 'eine Prise', 'Salz'],
    ['1,5 l Wasser', '1,5 l', 'Wasser'],
    ['5-6 Äpfel', '5-6', 'Äpfel'],
    ['½ TL Zimt', '½ TL', 'Zimt'],
    ['2 Liter Milch', '2 Liter', 'Milch'],
    ['ein Ei', 'ein', 'Ei'],
  ])('„%s" is %s of %s', (line, amount, thing) => {
    expect(splitAmount(line)).toEqual({ amount, thing });
  });

  it.each([
    'Eier', 'Kita Sonnenschein', 'gelber Löffel', 'Eis', '250 g', 'Lauch',
  ])('„%s" stays whole', (line) => {
    expect(splitAmount(line)).toEqual({ amount: '', thing: line });
  });
});
