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

/** The corner cross, in this app's language. Never the same as a footer's. */
const CLOSE = 'Dialog schließen';

export type { OpenDialog };

export function openDialog(options: Omit<DialogOptions, 'closeLabel'>): OpenDialog {
  return open({ ...options, closeLabel: CLOSE });
}

/** A destructive or confirming prompt. Resolves true when confirmed. */
export function confirmDialog(options: {
  title: string; body: string; confirmLabel: string; danger?: boolean;
}): Promise<boolean> {
  return ask({ ...options, cancelLabel: 'Abbrechen', closeLabel: CLOSE });
}
