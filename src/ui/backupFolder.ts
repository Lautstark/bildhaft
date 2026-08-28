/**
 * The Sicherung that keeps itself: a folder chosen once, written to from then
 * on without anybody remembering to.
 *
 * This block is an *addition* to the „Alles exportieren" button beside it and
 * never a replacement — the picker exists only on Chromium on the desktop, and
 * `mount` returns null everywhere else so the panel simply does not carry it.
 * A tablet must not be shown a backup story it cannot have. See
 * @lautstark/design design.md §3.3, which settles the wording all three
 * products share.
 *
 * What is handed to the folder is `exportEverything()` and nothing else. That
 * matters beyond tidiness: a folder inside Dropbox is somewhere else, and
 * bildhaft's export is the audited artefact that carries symbol *references*
 * and never METACOM bytes or filenames. There is a test asserting this exact
 * wiring in test/backupFolder.test.ts; it is a licensing check, not a unit test.
 */

import { Sicherung, type Status } from '@lautstark/sicherung';
import { actionsFor, ago, needsAttention } from '@lautstark/sicherung/ui';
import { el, fill } from './dom.ts';
import { t } from '../i18n/index.ts';

/**
 * The one word this file has to say about language: bildhaft is German, so
 * this is a constant and not a lookup. It is passed on every call rather than
 * captured in a formatter, which is the package's rule — see its note on
 * ago(). The rule costs nothing here and is what keeps mitreden correct.
 */
const LOCALE = 'de';

/** "vor 3 Minuten", against this page's one language. */
const since = (at: number): string => ago(at, LOCALE);

/**
 * The labels, keyed by what the shared table calls each action.
 *
 * This is the whole of what the package left behind for the product, and
 * deliberately so: @lautstark/sicherung/ui returns an id and never a word,
 * because bildhaft has no t() to route one through and that is an argued
 * position rather than a gap. See src/ui/dom.ts.
 */
const LABELS: Record<'choose' | 'confirm' | 'save-empty' | 'retry' | 'forget', string> = {
  choose: t('ui.folder_choose'),
  confirm: t('ui.confirm_access'),
  'save-empty': t('ui.save_empty_anyway'),
  retry: t('ui.try_again'),
  forget: t('ui.forget_folder'),
};

/** The age of the last real copy, or the admission that there has never been one. */
const lastCopy = (at: number | null): string =>
  at === null ? 'noch nie gesichert' : `zuletzt gesichert ${since(at)}`;

/**
 * The sentence for each state.
 *
 * The two states that mean *nothing is being written* both carry the age, and
 * that is the point rather than a detail: „es funktioniert nicht" is a sentence
 * somebody can put off, and „seit elf Tagen nichts gesichert" is not.
 *
 * Exported for the test that holds that rule, the way `headline` below is —
 * it is the one thing about this panel still written out in three products
 * with nothing checking they agree. @lautstark/sicherung/ui owns the rest, and
 * deliberately not the words. Nothing outside this file calls it.
 */
export function sentence(status: Status): string {
  switch (status.kind) {
    case 'unsupported': return '';
    case 'off': return t('ui.no_folder_yet');
    case 'saving': return t('ui.backing_up');
    case 'idle': return status.lastWrite === null
      ? `Ordner „${status.folder}“ · noch nie gesichert`
      : `Ordner „${status.folder}“ · gesichert ${since(status.lastWrite)}`;
    case 'needs-permission':
      return `Zugriff auf „${status.folder}“ muss bestätigt werden — ${lastCopy(status.lastWrite)}.`;
    case 'failed':
      return `Sicherung fehlgeschlagen: ${status.reason} — ${lastCopy(status.lastWrite)}.`;
    // Deliberately not phrased as a failure. Nothing broke: the copy in the
    // folder is whole and untouched, and the only open question is whether
    // this browser being empty is the truth.
    case 'held':
      return `Dieser Browser hat keine Sammlungen. In „${status.folder}“ wurde nichts überschrieben — ${lastCopy(status.lastWrite)}.`;
  }
}

/**
 * The one line the „Daten" heading carries, so the panel says which folder it
 * writes to without anybody opening it.
 *
 * Deliberately not `sentence()`: a heading has no room for an age, and the age
 * is the whole reason the line inside the panel exists. What it must keep is
 * the distinction that file argues for everywhere else — a folder that is
 * being written and one that only looks like it is are not the same fact, and
 * a heading that showed just the name for both would manufacture exactly the
 * confidence this module is built to avoid.
 *
 * Exported only so that distinction can be asserted directly — see
 * tests/unit/backup-headline.test.ts. Nothing outside this file calls it.
 */
export function headline(status: Status): string {
  switch (status.kind) {
    case 'unsupported':
    case 'off': return '';
    case 'idle':
    case 'saving': return `Ordner „${status.folder}“`;
    case 'needs-permission': return `Ordner „${status.folder}“ · Zugriff bestätigen`;
    case 'failed': return `Ordner „${status.folder}“ · Sicherung fehlgeschlagen`;
    // Says what happened rather than that something broke, and still not just
    // the folder name — this is a state somebody has to answer, and a heading
    // that showed only the name would manufacture the confidence above.
    case 'held': return `Ordner „${status.folder}“ · nichts überschrieben`;
  }
}

export interface FolderBlock {
  node: HTMLElement;
  /** Must be called when the dialog closes, or every reopen adds a listener. */
  dispose: () => void;
}

/**
 * Builds the block, or answers null where the browser has no picker.
 *
 * Returns the node rather than appending it, so the caller decides the order
 * inside its panel and this file never reaches up into one.
 */
export function mountBackupFolder(
  backup: Sicherung,
  notify: (message: string) => void,
  /*
   * Told the heading line on every repaint. A callback rather than a second
   * `backup.subscribe` at the call site, so there stays one subscription with
   * one dispose — and so the wording lives in this file with the rest of it.
   * Never called where there is no picker, because there is then no block and
   * no folder to name, and the heading stays as blank as it was.
   */
  onHeadline: (text: string) => void = () => {},
): FolderBlock | null {
  if (!Sicherung.supported) return null;

  const line = el('p', { class: 'standing' });
  const actions = el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
  const node = el('div', { style: { margin: '0 0 18px' } },
    el('p', { class: 'small faint', style: { margin: '0 0 8px' }, text:
      t('ui.folder_note') }),
    line, actions);

  /** One button, described rather than built at each call site. */
  const button = (text: string, primary: boolean, run: () => Promise<unknown>) =>
    el('button', {
      class: `btn ${primary ? 'primary' : 'quiet'} sm`, text, attrs: { type: 'button' },
      on: { click: (event) => {
        // The gesture is the whole reason these are buttons: choose() and
        // confirm() open a browser prompt and are refused without one.
        const pressed = event.currentTarget as HTMLButtonElement;
        pressed.disabled = true;
        void run().finally(() => { pressed.disabled = false; });
      } },
    });

  function paint(status: Status): void {
    onHeadline(headline(status));

    // data-state takes the kind verbatim — the stylesheet keys off exactly
    // these names, so there is no mapping here to disagree with it.
    line.setAttribute('data-state', status.kind);
    /* Whether this state is somebody's to act on is the package's answer, the
     * same as the buttons below. This drew `needs-permission` in the same grey
     * as „gesichert vor 3 Minuten" - and all three products did, which is what
     * it looks like when each decides for itself out of one status.
     * @lautstark/design conventions.md §3.7. */
    line.className = needsAttention(status) ? 'standing notice bad' : 'standing';
    fill(line, el('span', { class: 'dot' }), el('span', { text: sentence(status) }));

    // Which buttons belong to this state is the package's answer now, not
    // this file's. It was the same six-branch switch in all three products,
    // which is one contract with three copies and nothing checking they
    // agreed — the arrangement where one of them quietly stops offering a way
    // out of `failed`. What stays here is the drawing and the words.
    //
    // Two of that table's decisions were argued in this margin and are worth
    // keeping findable. `idle` offers no "save now": the folder is written on
    // every change already, so the button's only honest label would be "do the
    // thing that is already happening" — and it sat directly above „Sicherung
    // als Datei", two buttons both saying sichern, differing by a word that
    // named the wrong axis. `saving` offers nothing at all rather than
    // disabled buttons, which would leave two greyed controls flickering on
    // every keystroke's debounce.
    fill(actions, ...actionsFor(backup, status).map((action) =>
      button(LABELS[action.id], action.primary, async () => {
        await action.run();
        // The only one that says anything: the others are reported by the
        // status line repainting underneath.
        if (action.id === 'forget') notify(t('ui.folder_forgotten'));
      })));
  }

  paint(backup.status);
  // The dialog is thrown away on close, so the subscription goes with it —
  // otherwise every reopen adds another listener painting a detached node.
  return { node, dispose: backup.subscribe(paint) };
}
