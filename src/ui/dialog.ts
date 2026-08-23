import { el } from './dom.ts';

export interface DialogOptions {
  title: string;
  body: (Node | string)[];
  footer?: (Node | string)[];
  wide?: boolean;
  onClose?: () => void;
}

export interface OpenDialog {
  close(): void;
  /** The body element, for dialogs that rewrite their own contents. */
  body: HTMLElement;
}

/**
 * Opens a modal and returns a handle to close it.
 *
 * A native <dialog> shown with showModal(), which is what mitreden and vorlaut
 * both use. This was a <div class="overlay"> holding a <div class="sheet">, with
 * an Escape listener on the document — and the parts it could not hand-roll are
 * the reason it changed. showModal() puts the dialog in the top layer and makes
 * the rest of the page inert: Tab cannot leave, a click cannot reach a button
 * behind the sheet, and a screen reader does not read the page underneath. The
 * old arrangement trapped nothing, so Tab walked straight out of the settings
 * sheet and into the sentence list behind it.
 *
 * Escape, the backdrop and the dim all come from the platform now. The one
 * thing that does not is dismissal by clicking outside, because a modal
 * dialog's backdrop is not an element that can be clicked — see below.
 *
 * Only one is open at a time in this app, but nothing here enforces that — the
 * caller owns the handle and closes it.
 */
export function openDialog(options: DialogOptions): OpenDialog {
  const body = el('div', { class: 'body' }, ...options.body);

  // No role and no aria-modal: a <dialog> shown with showModal() already has
  // both, and writing them again is how an element ends up announced twice.
  const dialog = el('dialog',
    { class: `sheet${options.wide ? ' wide' : ''}`, attrs: { 'aria-label': options.title } },
    el('div', { class: 'head' },
      el('h2', { text: options.title }),
      el('button', {
        class: 'btn icon',
        text: '✕',
        attrs: { type: 'button', 'aria-label': 'Dialog schließen' },
        on: { click: () => dialog.close() },
      }),
    ),
    body,
    options.footer ? el('div', { class: 'foot' }, ...options.footer) : null,
  );

  /*
   * Dismissal by pressing outside the sheet, which the platform does not offer.
   * ::backdrop is a pseudo-element and takes no clicks, so a press on it lands
   * on the dialog itself — the same target as a press on the sheet's own
   * padding. What tells them apart is where it landed: outside the dialog's
   * box is the backdrop, inside it is the sheet.
   *
   * mousedown rather than click, as before: a click whose press began inside
   * the sheet and ended outside it — the end of a drag, or a text selection
   * that overshot — is not somebody asking to leave.
   */
  dialog.addEventListener('mousedown', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });

  // One exit for every way out — the ✕, Escape, a press outside, or close() —
  // because the browser fires this for all of them. The listener that used to
  // watch the document for Escape is gone with it, and so is the risk it
  // carried: it was added per dialog and removed only on the path through
  // close(), so anything that tore the overlay down another way left it behind.
  dialog.addEventListener('close', () => {
    dialog.remove();
    options.onClose?.();
  });

  document.body.appendChild(dialog);
  dialog.showModal();

  return { close: () => dialog.close(), body };
}

/** A destructive or confirming prompt. Resolves true when confirmed. */
export function confirmDialog(options: {
  title: string; body: string; confirmLabel: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(value);
    };

    const dialog = openDialog({
      title: options.title,
      body: [el('p', { text: options.body, style: { margin: '0', lineHeight: '1.55' } })],
      footer: [
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', text: 'Abbrechen', attrs: { type: 'button' },
          on: { click: () => finish(false) } }),
        el('button', {
          class: options.danger ? 'btn destructive filled' : 'btn primary',
          text: options.confirmLabel,
          attrs: { type: 'button' },
          on: { click: () => finish(true) },
        }),
      ],
      onClose: () => finish(false),
    });
  });
}
