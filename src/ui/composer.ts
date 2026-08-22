import type { Sentence } from '../core/types.ts';
import { el } from './dom.ts';
import { icons } from './logo.ts';

/** Past this the box scrolls instead of growing. */
const MAX_INPUT_HEIGHT = 190;

export interface ComposerHandlers {
  onChange: (value: string) => void;
  onSubmit: () => void;
  onReuse: () => void;
}

export interface ComposerState {
  value: string;
  busy: boolean;
  /** A previous translation of the same line, offered for reuse. */
  reuse: Sentence | null;
  providerName: string;
  providerReady: boolean;
}

export function composer(handlers: ComposerHandlers): {
  node: HTMLElement;
  render(state: ComposerState): void;
} {
  const input = el('textarea', {
    class: 'composer__input',
    attrs: { rows: 1, placeholder: 'Satz eingeben, z. B. „Ich möchte einen Apfel essen“',
      'aria-label': 'Satz eingeben', spellcheck: 'true', lang: 'de' },
    on: {
      input: () => { handlers.onChange(input.value); grow(); },
      keydown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          handlers.onSubmit();
        }
      },
    },
  });

  const goIcon = el('span', { class: 'composer__go-icon' }, icons.arrow());
  const go = el('button', {
    class: 'btn primary composer__go',
    attrs: { type: 'button', 'aria-label': 'Übersetzen', title: 'Übersetzen' },
    on: { click: handlers.onSubmit },
  }, goIcon);

  const providerLine = el('span');
  const reuseRow = el('div', { class: 'composer__reuse' },
    el('span', { text: 'Diesen Satz hast du schon übersetzt.', style: { flex: '1' } }),
    el('button', { class: 'btn sm', text: 'Übernehmen',
      attrs: { type: 'button' }, on: { click: handlers.onReuse } }),
  );

  const node = el('div', { class: 'composer' },
    el('div', { class: 'composer__box' }, input, go),
    el('div', { class: 'composer__meta' },
      el('span', { html: '<kbd>Enter</kbd> übersetzt · <kbd>Shift</kbd>+<kbd>Enter</kbd> neue Zeile' }),
      providerLine,
    ),
  );

  /*
   * Grow with the content instead of scrolling inside a fixed box.
   *
   * Collapsing to 0 first makes the measurement deterministic — reading back
   * 'auto' can report the previous used height within the same frame. The
   * viewport guard matters because a page mounted in a background tab measures
   * against a zero-height viewport and would otherwise lock the box open at its
   * maximum height for the rest of the session.
   */
  function grow(): void {
    if (window.innerHeight === 0 || document.visibilityState === 'hidden') return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  document.addEventListener('visibilitychange', grow);
  window.addEventListener('resize', grow);
  document.fonts?.ready.then(grow).catch(() => undefined);

  // Focused on load: typing is the entire interaction. Skipped on touch devices,
  // where it would immediately open the on-screen keyboard and shrink the viewport.
  if (!window.matchMedia('(hover: none)').matches) input.focus();

  function render(state: ComposerState): void {
    if (input.value !== state.value) {
      input.value = state.value;
      grow();
    }

    go.toggleAttribute('disabled', state.busy || !state.value.trim());
    goIcon.replaceChildren(state.busy ? el('span', { class: 'spinner' }) : icons.arrow());

    providerLine.textContent =
      `Symbole: ${state.providerName}${state.providerReady ? '' : ' (nicht bereit)'}`;

    if (state.reuse) node.appendChild(reuseRow);
    else reuseRow.remove();
  }

  return { node, render };
}
