import type { Slot } from './types.ts';
import { buildWordSlot, type MatchContext } from './match.ts';

/**
 * A line of a Zutaten list, taken apart into how much and what.
 *
 * „2 Eier", „325 ml Milch", „1 Päckchen Vanillezucker", „wenig Salz": the
 * card is all of it, and the picture is only the thing. Looking the whole line
 * up as one word, the way a Wortkarte is looked up, asks the source for „2 eier"
 * and gets nothing — or worse, a picture of a 2.
 *
 * Only a leading amount is taken off, and only one that reads as an amount: a
 * number (with a unit after it, when there is one), or one of the few words a
 * recipe says instead of a number. Anything else is the thing itself, so
 * „Kita Sonnenschein" or „gelber Löffel" stays whole. A line that is nothing
 * but an amount stays whole too: there is no thing left to find a picture for.
 */
const NUMBER = String.raw`(?:\d+(?:[.,/]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|[½¼¾⅓⅔])`;
const UNIT = [
  'g', 'gr', 'gramm', 'kg', 'kilo', 'mg', 'ml', 'cl', 'dl', 'l', 'liter',
  'el', 'tl', 'msp', 'stück', 'stk', 'päckchen', 'pck', 'packung', 'prise', 'prisen',
  'becher', 'tasse', 'tassen', 'dose', 'dosen', 'glas', 'gläser', 'bund', 'scheibe',
  'scheiben', 'zehe', 'zehen', 'handvoll', 'würfel', 'tropfen', 'flasche', 'flaschen',
  'esslöffel', 'teelöffel', 'löffel',
].join('|');
/* Longest first: the alternation takes the first that matches, and „eine"
   before „eine prise" would leave „prise Salz" to be looked up. */
const WORDS = [
  'ein paar', 'eine prise', 'eine handvoll', 'wenig', 'etwas', 'viel', 'einen', 'eine', 'ein',
].join('|');
const AMOUNT = new RegExp(String.raw`^(?:${NUMBER}\s*(?:(?:${UNIT})\.?(?=\s))?|${WORDS})\s+`, 'iu');
const ONLY_UNIT = new RegExp(String.raw`^(?:${UNIT})\.?$`, 'iu');

export function splitAmount(line: string): { amount: string; thing: string } {
  const text = line.trim().replace(/\s+/g, ' ');
  const found = AMOUNT.exec(text);
  if (!found) return { amount: '', thing: text };
  const thing = text.slice(found[0].length).trim();
  if (!thing || ONLY_UNIT.test(thing)) return { amount: '', thing: text };
  return { amount: found[0].trim(), thing };
}

/**
 * The card for a line of the Zutaten or the Hilfsmittel: the picture for the
 * thing, and the whole line under it.
 *
 * The thing is what is looked up and what the Wortschatz is asked about, so
 * „Eier" fixed once in the Wortschatz is fixed in „2 Eier" and „6 Eier" too.
 * The amount goes in front of whatever caption that word has there.
 */
export async function buildPartSlot(line: string, ctx: MatchContext): Promise<Slot> {
  const { amount, thing } = splitAmount(line);
  const slot = await buildWordSlot(thing, ctx);
  if (!amount) return slot;
  return { ...slot, label: `${amount} ${slot.label ?? thing}` };
}
