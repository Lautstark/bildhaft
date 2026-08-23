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
import { actionsFor, ago } from '@lautstark/sicherung/ui';
import { el, fill } from './dom.ts';

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
const LABELS: Record<'choose' | 'confirm' | 'retry' | 'forget', string> = {
  choose: 'Ordner wählen',
  confirm: 'Zugriff bestätigen',
  retry: 'Erneut versuchen',
  forget: 'Ordner vergessen',
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
 */
function sentence(status: Status): string {
  switch (status.kind) {
    case 'unsupported': return '';
    case 'off': return 'Noch kein Ordner gewählt.';
    case 'saving': return 'Wird gesichert …';
    case 'idle': return status.lastWrite === null
      ? `Ordner „${status.folder}“ · noch nie gesichert`
      : `Ordner „${status.folder}“ · gesichert ${since(status.lastWrite)}`;
    case 'needs-permission':
      return `Zugriff auf „${status.folder}“ muss bestätigt werden — ${lastCopy(status.lastWrite)}.`;
    case 'failed':
      return `Sicherung fehlgeschlagen: ${status.reason} — ${lastCopy(status.lastWrite)}.`;
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
export function mountBackupFolder(backup: Sicherung, notify: (message: string) => void)
: FolderBlock | null {
  if (!Sicherung.supported) return null;

  const line = el('p', { class: 'standing' });
  const actions = el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
  const node = el('div', { style: { margin: '0 0 18px' } },
    el('p', { class: 'small faint', style: { margin: '0 0 8px' }, text:
      'Wähle einen Ordner, dann schreibt bildhaft die Sicherung dort hinein, '
      + 'sobald sich etwas ändert.' }),
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
    // data-state takes the kind verbatim — the stylesheet keys off exactly
    // these names, so there is no mapping here to disagree with it.
    line.setAttribute('data-state', status.kind);
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
        if (action.id === 'forget') notify('Der Ordner wird nicht mehr beschrieben.');
      })));
  }

  paint(backup.status);
  // The dialog is thrown away on close, so the subscription goes with it —
  // otherwise every reopen adds another listener painting a detached node.
  return { node, dispose: backup.subscribe(paint) };
}
