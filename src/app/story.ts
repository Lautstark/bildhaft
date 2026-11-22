import { storyMiddle, type PrintSettings, type StoryPart } from '../core/types.ts';
import { addCard, entriesOf } from './recipe.ts';
import { addLines } from './composing.ts';
import { paperOf } from './print.ts';
import { t } from '../i18n/index.ts';

/**
 * An Erzählen sheet: a Rezept's walls of cards in two parts, and one thing
 * of its own — it is born with cards in it. The row to answer with at the
 * foot is the same every week; the middle is the week's. They are ordinary cards in their parts, made from words the way a
 * Zutat typed as a line is, so a picture that did not fit is changed in the
 * same picker, and a card nobody wants goes in the same bin.
 */

/** The cards a new Erzählen sheet starts with, looked up in the source in front of the reader. */
export async function seedStory(): Promise<void> {
  await addLines(t('ui.story_seed_unten'), 'unten');
}

/** The paper the sheet prints on, A5 lying until it has one. */
const paperNow = (): Pick<PrintSettings, 'paper' | 'orientation'> => paperOf() ?? { paper: 'a5', orientation: 'landscape' };

/** The most cards the middle holds on the paper the sheet prints on. */
export const middleMax = (): number => storyMiddle(paperNow().paper, paperNow().orientation).max;

/** „A4 hoch": the paper, as the print column names it. */
function paperName(): string {
  const { paper, orientation } = paperNow();
  return `${paper.toUpperCase()} ${(orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')).toLowerCase()}`;
}

/** What the empty middle says: how many pictures its paper takes. */
export const middleWhisper = (): string => t('ui.story_mitte_whisper', { n: middleMax(), paper: paperName() });

/**
 * With more cards in the middle than its paper holds, which of them are
 * printed; null otherwise. A sheet made on A4 and put on A5 keeps its eight,
 * and the first four print.
 */
export function middleOver(): string | null {
  const n = middleMax();
  return entriesOf('mitte').length > n ? t('ui.story_mitte_over', { n, paper: paperName() }) : null;
}

/** Whether a part takes another card: the middle stops when its paper is full. */
export const roomIn = (part: StoryPart): boolean =>
  part !== 'mitte' || entriesOf('mitte').length < middleMax();

/** A new card at the end of its part, with the picker open on it — when there is room for one. */
export async function addStoryCard(part: StoryPart): Promise<void> {
  if (!roomIn(part)) return;
  await addCard(part);
}
