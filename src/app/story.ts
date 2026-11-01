import { STORY_MIDDLE_MAX, type StoryPart } from '../core/types.ts';
import { addCard, entriesOf } from './recipe.ts';
import { addLines } from './composing.ts';
import { t } from '../i18n/index.ts';

/**
 * An Erzählen sheet: a Rezept's walls of cards in three parts, and one thing
 * of its own — it is born with cards in it. The Hallo at the top and the
 * row to answer with at the foot are the same every week; the middle is the
 * week's. They are ordinary cards in their parts, made from words the way a
 * Zutat typed as a line is, so a picture that did not fit is changed in the
 * same picker, and a card nobody wants goes in the same bin.
 */

/** The cards a new Erzählen sheet starts with, looked up in the source in front of the reader. */
export async function seedStory(): Promise<void> {
  await addLines(t('ui.story_seed_oben'), 'oben');
  await addLines(t('ui.story_seed_unten'), 'unten');
}

/** Whether a part takes another card: the middle stops at four. */
export const roomIn = (part: StoryPart): boolean =>
  part !== 'mitte' || entriesOf('mitte').length < STORY_MIDDLE_MAX;

/** A new card at the end of its part, with the picker open on it — when there is room for one. */
export async function addStoryCard(part: StoryPart): Promise<void> {
  if (!roomIn(part)) return;
  await addCard(part);
}
