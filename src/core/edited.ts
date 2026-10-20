/**
 * When a Sammlung was last worked on, said the way a person would: „heute",
 * „gestern", „vor 3 Tagen", and past a week the date, with its year.
 *
 * Calendar days, not 24-hour spans: something done at 23:50 yesterday was
 * yesterday at 00:10 today. `now` is a parameter so the words can be held to a
 * fixed day in a test.
 */
export type EditedWords = {
  today: string;
  yesterday: string;
  daysAgo: (n: number) => string;
  date: (at: Date) => string;
};

export function editedLabel(at: number, now: number, words: EditedWords): string {
  const day = (ms: number): number => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const ago = day(now) - day(at);
  if (ago <= 0) return words.today;
  if (ago === 1) return words.yesterday;
  if (ago < 7) return words.daysAgo(ago);
  return words.date(new Date(at));
}
