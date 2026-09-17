/** What the page says when the database it found was not one it can read.
 *
 * The other end of adr/0001. migrations.ts had no step for a version this
 * database has to cross, or the database is not the shape its version claims,
 * so db.ts aborted the upgrade — or never got past the check on the way out of
 * one — and every record is still there, untouched, at its own version.
 *
 * Nothing may happen next until the person holding those records has them in a
 * file. That is the whole of what this sheet is for, and it is the only place
 * in bildhaft where a modal stops the page.
 *
 * Closing it costs nothing, and that is the point rather than an oversight: the
 * database is exactly as it was and a reload asks again. The one thing that
 * must not be reachable without the file is the button that discards.
 *
 * ## What is left here, now that the sheet is the package's
 *
 * The three lines, the two buttons and the state they are driven by are
 * `@lautstark/sicherung/svelte`'s — `RescueBody`, `RescueFoot` and `Rescuing`,
 * conventions.md §6.7, which records that **bildhaft's shape is the standard**:
 * the count line, the said line as a region present from the first paint and
 * empty, the failure path that rolls the in-flight flag back and reports rather
 * than closing first, and disabled-until-saved as the whole enforcement with no
 * second confirm. All four survive the move and are the reason there was
 * anything to move.
 *
 * What stays is what only this product can answer: the words, because a shared
 * component carries no German; the file and its name, which is „rettung" and
 * undated here; what discarding means; and what „again" means, which is the
 * boot.
 *
 * The package calls its rune module `rescuing.svelte.ts` rather than
 * `rescue.svelte.ts`, because TypeScript resolves `./Rescue.svelte` by
 * appending `.ts` and on a case-insensitive filesystem the two collide. This
 * file is plain `.ts` for a plainer reason: with the class gone there is no
 * rune left in it.
 */

import { Rescuing, type RescueWords } from '@lautstark/sicherung/svelte/rescuing';
import RescueBody from '@lautstark/sicherung/svelte/RescueBody';
import RescueFoot from '@lautstark/sicherung/svelte/RescueFoot';
import { downloadJson } from '../db/exportImport.ts';
import { asFile, countRecords, dumpEverything, type Dump } from '../db/rescue.ts';
import { discardEverything } from '../db/db.ts';
import { isRefusal } from '../db/migrations.ts';
import { openSheet } from '@lautstark/design/svelte/sheet';
import { CLOSE } from './dialog.ts';
import { t } from '../i18n/index.ts';

/** The sentence for an error, without leaking an object into a paragraph. */
const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface Page { report(message: string): void; again(): void }

/* Positional arguments rather than this product's `{from}` placeholders,
   because the package has no i18n and is not growing one. The sentences on
   both sides of that seam are bildhaft's own, out of the one text table. */
const words: RescueWords = {
  body: (from) => t('ui.rescue_body', { from }),
  holds: (count) => t('ui.rescue_holds', { n: count }),
  saved: t('ui.rescue_saved'),
  discarding: t('ui.rescue_discarding'),
  failed: (why) => t('ui.rescue_failed', { error: why }),
  download: t('ui.rescue_download'),
  discard: (from) => t('ui.rescue_discard', { from }),
};

/** Offers the sheet, and says whether this was its error to take.
 *
 * A boolean rather than a throw, because the caller is a `catch` that already
 * has to report everything else and this is one error out of all of them. */
export function offerRescue(error: unknown, page: Page): boolean {
  if (!isRefusal(error)) return false;
  void show(page);
  return true;
}

async function show(page: Page): Promise<void> {
  let dump: Dump;
  try {
    dump = await dumpEverything();
  } catch (failure) {
    // Nothing can be offered and nothing has been touched. The sentence is the
    // whole of what is left to do.
    page.report(t('ui.rescue_failed', { error: reason(failure) }));
    return;
  }

  const state = new Rescuing(dump.version, countRecords(dump), words, {
    /* Whole and undated: „rettung", which is this product's name for it. */
    save: async () => { downloadJson(await asFile(dump, t('ui.rescue_notice')), 'rettung'); },
    discard: discardEverything,
    again: () => page.again(),
  });

  const sheet = openSheet({
    title: t('ui.rescue_title'),
    closeLabel: CLOSE,
    state,
    body: RescueBody,
    foot: RescueFoot,
    /* Dismissing costs nothing, because nothing has happened. Said out loud
       rather than left as a page that quietly does not work.

       `discarded` and not `going`: the two were one flag here until §6.7 pulled
       them apart. `going` is *a job is running*, and it is false again after a
       discard that failed — a sheet that is still up and still offers both
       buttons, so somebody who then walks away has walked away and should be
       told. `discarded` is true only on the path that closed this sheet itself. */
    onClose: () => { if (!state.discarded) page.report(t('ui.rescue_stopped')); },
  });
  state.close = sheet.close;
}
