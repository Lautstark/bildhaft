import { el } from './dom.ts';
import { icons } from './logo.ts';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Small actions popover. Anchored to its trigger, closes on outside click or Escape. */
export function actionMenu(label: string, items: () => MenuItem[]): HTMLElement {
  let pop: HTMLElement | null = null;

  const close = () => {
    pop?.remove();
    pop = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };

  const onDown = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const open = () => {
    pop = el('div', { class: 'menu', attrs: { role: 'menu' } },
      ...items().map((item) => el('button', {
        class: item.danger ? 'danger' : undefined,
        text: item.label,
        attrs: { type: 'button', role: 'menuitem', disabled: item.disabled ?? false },
        on: { click: () => { close(); item.onSelect(); } },
      })),
    );
    root.appendChild(pop);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  };

  const trigger = el('button', {
    class: 'btn quiet icon',
    attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label },
    on: { click: () => (pop ? close() : open()) },
  }, icons.dots());

  const root = el('div', { class: 'menu-anchor' }, trigger);
  return root;
}
