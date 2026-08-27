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
 */

import { downloadJson } from '../db/exportImport.ts';
import { asFile, countRecords, dumpEverything, type Dump } from '../db/rescue.ts';
import { discardEverything } from '../db/db.ts';
import { isRefusal } from '../db/migrations.ts';
import { openDialog } from './dialog.ts';
import { el } from './dom.ts';
import { t } from '../i18n/index.ts';

/** The sentence for an error, without leaking an object into a paragraph. */
const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Offers the sheet, and says whether this was its error to take.
 *
 * A boolean rather than a throw, because the caller is a `catch` that already
 * has to report everything else and this is one error out of all of them. */
export function offerRescue(
  error: unknown, page: { report(message: string): void; again(): void },
): boolean {
  if (!isRefusal(error)) return false;
  void show(page);
  return true;
}

async function show(page: { report(message: string): void; again(): void }): Promise<void> {
  let dump: Dump;
  try {
    dump = await dumpEverything();
  } catch (failure) {
    // Nothing can be offered and nothing has been touched. The sentence is the
    // whole of what is left to do.
    page.report(t('ui.rescue_failed', { error: reason(failure) }));
    return;
  }

  const line = el('p', { text: t('ui.rescue_body', { from: dump.version }) });
  const held = el('p', {
    class: 'hint',
    text: t('ui.rescue_holds', { n: countRecords(dump) }),
  });
  /* The sheet's own live region. showModal() makes the page behind it inert,
   * so the toast is not somewhere anybody can be told anything while this is
   * open — conventions.md §3.8, "a modal earns a second region". In the tree
   * from the first paint and empty, because a region that arrives carrying its
   * message announces nothing. */
  const state = el('p', { class: 'hint', attrs: { role: 'status' } });

  const save = el('button', {
    class: 'btn primary', text: t('ui.rescue_download'), attrs: { type: 'button' },
  });

  /* Disabled, and this is the whole enforcement of "handed their data before
   * anything is destroyed".
   *
   * A second dialog asking "are you sure" was the other way to do it, and it
   * would be showModal() on top of showModal(). A button that cannot be pressed
   * until the file has been taken says the same thing earlier, and it names the
   * act rather than asking about it. */
  const discard = el('button', {
    class: 'btn destructive',
    text: t('ui.rescue_discard', { from: dump.version }),
    attrs: { type: 'button', disabled: true },
  });

  let going = false;
  const sheet = openDialog({
    title: t('ui.rescue_title'),
    body: [line, held, state],
    footer: [save, discard],
    // Dismissing costs nothing, because nothing has happened. Said out loud
    // rather than left as a page that quietly does not work.
    onClose: () => { if (!going) page.report(t('ui.rescue_stopped')); },
  });

  save.addEventListener('click', () => {
    void (async () => {
      try {
        downloadJson(await asFile(dump, t('ui.rescue_notice')), 'rettung');
        state.textContent = t('ui.rescue_saved');
        // Only now. The file is the whole of what makes the button beside it
        // survivable.
        discard.removeAttribute('disabled');
      } catch (failure) {
        state.textContent = t('ui.rescue_failed', { error: reason(failure) });
      }
    })();
  });

  discard.addEventListener('click', () => {
    void (async () => {
      going = true;
      discard.setAttribute('disabled', '');
      save.setAttribute('disabled', '');
      state.textContent = t('ui.rescue_discarding');
      try {
        await discardEverything();
      } catch (failure) {
        going = false;
        state.textContent = t('ui.rescue_failed', { error: reason(failure) });
        discard.removeAttribute('disabled');
        return;
      }
      sheet.close();
      page.again();
    })();
  });
}
