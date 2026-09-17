/**
 * This app's dialogs, which are @lautstark/design/dialog's now.
 *
 * The implementation that stood here is gone: the sheet skeleton, the
 * backdrop-press test, the single close exit and the confirm's settled guard
 * are all in the shared module, which took this file as its base because this
 * was the copy that had been through the failures.
 *
 * What is left is the one thing the shared module deliberately will not carry -
 * a word. Every label reaches it from the caller, because two of the three
 * products carry de/en tables and a string written into the package would be
 * wrong in one of them. bildhaft is German throughout by policy (see
 * ui/dom.ts), so its words are literals, and the two dismissals are named
 * apart: the corner cross says what it is, and a footer button says what it
 * does. Giving both the same name is the defect design.md §2 recorded.
 */

import { confirmDialog as ask, openDialog as open } from '@lautstark/design/dialog';
import type { DialogOptions, OpenDialog } from '@lautstark/design/dialog';
import { t } from '../i18n/index.ts';

/**
 * The corner cross, in this app's language. Never the same as a footer's.
 *
 * Read once, at module load, and that is safe *here* and would not be
 * everywhere: the only thing that changes this app's language is
 * `chooseLanguage()`, and it reloads the document — see the Sprache section of
 * SettingsBody.svelte, which says why that is the honest small version. A
 * product whose shell repaints in place would need a thunk.
 *
 * Exported because the sheets need it too. `@lautstark/design/svelte/sheet`'s
 * `openSheet` takes `closeLabel` required and with no fallback, and this is the
 * one place bildhaft names the dismissal — the eight sheets pass this constant
 * rather than eight `t()` calls that can drift apart.
 */
export const CLOSE = t('ui.close_dialog');

export type { OpenDialog };

export function openDialog(options: Omit<DialogOptions, 'closeLabel'>): OpenDialog {
  return open({ ...options, closeLabel: CLOSE });
}

/** A destructive or confirming prompt. Resolves true when confirmed. */
export function confirmDialog(options: {
  title: string; body: string; confirmLabel: string; danger?: boolean;
  requireTyping?: string; typingLabel?: string;
}): Promise<boolean> {
  return ask({ ...options, cancelLabel: t('ui.cancel'), closeLabel: CLOSE });
}
