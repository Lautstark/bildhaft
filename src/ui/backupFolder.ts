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
import { el, fill } from './dom.ts';

/**
 * "vor 3 Minuten". Intl does the German, so this is a unit choice and nothing
 * more. Written here rather than shared: mitreden and vorlaut carry de/en
 * tables and format against their own current language, and a helper that
 * hardcoded 'de' for them would be a bug the day somebody switched to English.
 */
const RELATIVE = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

const STEPS: [limit: number, unit: Intl.RelativeTimeFormatUnit, per: number][] = [
  [60_000, 'second', 1000],
  [3_600_000, 'minute', 60_000],
  [86_400_000, 'hour', 3_600_000],
  [Infinity, 'day', 86_400_000],
];

export function ago(at: number, now = Date.now()): string {
  const gap = Math.max(0, now - at);
  const [, unit, per] = STEPS.find(([limit]) => gap < limit)!;
  return RELATIVE.format(-Math.round(gap / per), unit);
}

/** The age of the last real copy, or the admission that there has never been one. */
const lastCopy = (at: number | null): string =>
  at === null ? 'noch nie gesichert' : `zuletzt gesichert ${ago(at)}`;

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
      : `Ordner „${status.folder}“ · gesichert ${ago(status.lastWrite)}`;
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
  const button = (text: string, kind: string, run: () => Promise<unknown>) =>
    el('button', {
      class: `btn ${kind} sm`, text, attrs: { type: 'button' },
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

    const forget = button('Ordner vergessen', 'quiet', async () => {
      await backup.forget();
      notify('Der Ordner wird nicht mehr beschrieben.');
    });

    switch (status.kind) {
      case 'off':
        fill(actions, button('Ordner wählen', 'primary', () => backup.choose()));
        break;
      case 'needs-permission':
        fill(actions, button('Zugriff bestätigen', 'primary', () => backup.confirm()), forget);
        break;
      case 'failed':
        fill(actions, button('Erneut versuchen', 'primary', () => backup.save()), forget);
        break;
      case 'idle':
        // No "save now". The folder is written on every change already, so a
        // button offering to do it again is a control whose only honest label
        // would be "do the thing that is already happening" — and it sat
        // directly above „Sicherung als Datei", where two buttons both saying
        // sichern differed by a word that named the wrong axis. „Erneut
        // versuchen" below is not the same button: after a failure there is
        // nothing happening to be redundant with.
        fill(actions, forget);
        break;
      case 'saving':
        // No buttons at all for the moment it is writing. Disabling them would
        // leave two greyed controls flickering on every keystroke's debounce.
        fill(actions);
        break;
      case 'unsupported':
        break;
    }
  }

  paint(backup.status);
  // The dialog is thrown away on close, so the subscription goes with it —
  // otherwise every reopen adds another listener painting a detached node.
  return { node, dispose: backup.subscribe(paint) };
}
