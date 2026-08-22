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
 * Only one is open at a time in this app, but nothing here enforces that — the
 * caller owns the handle and closes it.
 */
export function openDialog(options: DialogOptions): OpenDialog {
  const body = el('div', { class: 'dialog__body' }, ...options.body);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    options.onClose?.();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const panel = el('div',
    { class: `dialog${options.wide ? ' dialog--wide' : ''}`,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title } },
    el('div', { class: 'dialog__head' },
      el('h2', { text: options.title }),
      el('button', {
        class: 'btn btn--ghost btn--icon',
        text: '✕',
        attrs: { type: 'button', 'aria-label': 'Dialog schließen' },
        on: { click: close },
      }),
    ),
    body,
    options.footer ? el('div', { class: 'dialog__foot' }, ...options.footer) : null,
  );

  const overlay = el('div', { class: 'overlay',
    on: { mousedown: (event) => { if (event.target === overlay) close(); } } }, panel);

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  // Move focus into the dialog so Escape and Tab behave as expected.
  panel.querySelector<HTMLElement>('input, button, textarea, select')?.focus();

  return { close, body };
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
          class: options.danger ? 'btn btn--danger-solid' : 'btn btn--primary',
          text: options.confirmLabel,
          attrs: { type: 'button' },
          on: { click: () => finish(true) },
        }),
      ],
      onClose: () => finish(false),
    });
  });
}
