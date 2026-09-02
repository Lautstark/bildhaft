/**
 * The themes a household sorts by, and how a symbol source's own vocabulary
 * lands in them.
 *
 * ARASAAC files every pictogram under categories of its own, and they are
 * granular and taxonomic: a sample of 31 everyday German words came back with
 * 89 distinct ones, among them `carnivorous`, `viviparous`, `library science`
 * and `signaling system`. Translating that list one to one would be a lot of
 * work to produce tags nobody sorts material by. So it is not translated — it
 * is *mapped*, many to one, onto the handful of themes people actually reach
 * for, and everything that lands in none of them is dropped. bildquelle's own
 * note on `Candidate.categories` asks for exactly this: match the ones you have
 * words for, ignore the rest, and never show one untranslated.
 *
 * This module returns keys, never words — the same division bildquelle keeps.
 * `ui/wortschatz.ts` turns a key into „Essen & Trinken" or "Food & drink".
 *
 * METACOM does not come through here at all. Its categories are the folders in
 * somebody's own copy of the set, already their words and already their
 * language, and mapping those onto our themes would replace what a person
 * called a thing with what we would have called it.
 */

/**
 * Every theme, in the order they are shown.
 *
 * A real array rather than a bare union because `tests/unit/text-keys.test.ts`
 * builds `ui.topic_*` from it: a twelfth theme with no sentence has to fail
 * there rather than reach somebody as a dotted identifier.
 */
export const TOPICS = [
  'core', 'food', 'animals', 'people', 'body', 'clothes',
  'home', 'school', 'play', 'transport', 'feelings',
] as const;

export type Topic = (typeof TOPICS)[number];

/**
 * What has to appear in an ARASAAC category for it to count as a theme.
 *
 * A needle holding a space is matched against the whole category, anything else
 * against its separate words. That distinction is not decoration: `pet` as a
 * substring also matches `competition` and `appetite`, and a Wortschatz that
 * files sport under Tiere is worse than one that files it nowhere.
 *
 * Two of ARASAAC's frequent categories are deliberately absent. `verb` is a
 * word class and arrives as one, from the keyword type. `qualifying adjective`
 * is the same thing for a class this app does not state at all.
 */
const NEEDLES: Record<Topic, readonly string[]> = {
  core: ['core vocabulary'],
  food: ['food', 'feeding', 'fruit', 'vegetable', 'beverage', 'drink', 'dairy',
    'meal', 'sweets', 'cereal', 'meat'],
  animals: ['animal', 'pet', 'mammal', 'bird', 'insect', 'reptile',
    'carnivorous', 'herbivorous', 'omnivorous', 'viviparous', 'oviparous'],
  people: ['family', 'person', 'people', 'elderly', 'profession', 'occupation',
    'relative', 'baby'],
  body: ['body', 'disease', 'patient', 'health', 'hygiene', 'medicine',
    'hospital', 'anatomy'],
  clothes: ['clothes', 'clothing', 'footwear', 'garment', 'accessory'],
  home: ['furniture', 'building room', 'house', 'home', 'kitchen', 'appliance',
    'household'],
  /* `library science` is ARASAAC's category on a book and was in here for a
     while. A book is not school — it is a book at home as often as not — and a
     theme that is only sometimes true is one a person stops trusting. */
  school: ['educational', 'school', 'teaching'],
  play: ['game', 'toy', 'play', 'sport', 'physical exercise', 'leisure'],
  transport: ['transport', 'vehicle', 'road safety', 'traffic'],
  feelings: ['feeling', 'emotion', 'mood'],
};

/**
 * The themes a set of ARASAAC categories falls into, in display order.
 *
 * A category may land in more than one and most land in none. Both are
 * ordinary: `dairy product` is food, `library science` is nothing we have a
 * word for, and neither is a fault to report.
 */
export function topicsOf(categories: readonly string[] | undefined): Topic[] {
  if (!categories?.length) return [];

  const found = new Set<Topic>();
  for (const category of categories) {
    const flat = category.toLowerCase().replace(/_/g, ' ');
    const words = new Set(flat.split(/[^a-z]+/).filter(Boolean));
    for (const topic of TOPICS) {
      if (found.has(topic)) continue;
      const hit = NEEDLES[topic].some((needle) =>
        needle.includes(' ') ? flat.includes(needle) : words.has(needle));
      if (hit) found.add(topic);
    }
  }
  return TOPICS.filter((topic) => found.has(topic));
}
