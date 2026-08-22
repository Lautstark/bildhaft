import type { Collection, Sentence } from '../core/types.ts';
import { el, fill } from './dom.ts';
import { icons, logo } from './logo.ts';

/* ------------------------------------------------------------------ footer */

export interface FooterHandlers {
  onAbout: () => void;
  onImpressum: () => void;
  onDatenschutz: () => void;
}

export function footer(handlers: FooterHandlers): {
  node: HTMLElement;
  setAttribution(attribution: string | null): void;
} {
  const link = (text: string, onClick: () => void) =>
    el('button', { class: 'linklike', text, attrs: { type: 'button' }, on: { click: onClick } });

  // Attribution is required by the ARASAAC licence — compact, but never hidden.
  // It follows the active source, so it is written rather than built in.
  const credit = el('p', { style: { margin: '0 0 4px' } });

  const node = el('footer', { class: 'footer' },
    credit,
    el('p', { class: 'footer__links' },
      link('Was ist bildhaft?', handlers.onAbout),
      // Both are legally required to be reachable and to be called exactly this.
      // "Kontakt" or a line inside the About dialog would not count.
      link('Impressum', handlers.onImpressum),
      link('Datenschutz', handlers.onDatenschutz),
      el('a', { text: 'Quellcode',
        attrs: { href: 'https://github.com/Lautstark/bildhaft', target: '_blank', rel: 'noreferrer noopener' } }),
      el('a', { text: 'arasaac.org',
        attrs: { href: 'https://arasaac.org', target: '_blank', rel: 'noreferrer noopener' } }),
    ),
  );

  return {
    node,
    setAttribution(attribution) {
      credit.textContent = attribution ?? '';
      if (attribution) node.prepend(credit);
      else credit.remove();
    },
  };
}

/* ------------------------------------------------------------------ topbar */

/**
 * Mobile-only header. Hidden on desktop, where the sidebar is always reachable
 * as a grid column. It is sticky and opaque so content scrolls underneath it
 * rather than showing through.
 */
export function topBar(onToggleNav: () => void): { node: HTMLElement; setTitle(title: string): void } {
  const title = el('span', { class: 'topbar__title' });
  const node = el('header', { class: 'topbar' },
    el('button', {
      class: 'btn btn--quiet btn--icon',
      attrs: { type: 'button', 'aria-label': 'Menü öffnen' },
      on: { click: onToggleNav },
    }, icons.menuMobile()),
    logo(20),
    title,
  );
  return { node, setTitle: (value) => { title.textContent = value; } };
}

/* ----------------------------------------------------------------- sidebar */

export interface SidebarHandlers {
  onSelect: (id: string) => void;
  onNew: () => void;
  onSearchChange: (value: string) => void;
  onOpenResult: (sentence: Sentence) => void;
  onOpenSettings: () => void;
  onImport: (file: File) => void;
  onCollapse: () => void;
}

export interface SidebarState {
  collections: Collection[];
  counts: Record<string, number>;
  activeId: string | null;
  searchQuery: string;
  searchResults: Sentence[];
}

export function sidebar(handlers: SidebarHandlers): {
  node: HTMLElement;
  render(state: SidebarState): void;
} {
  const search = el('input', {
    class: 'field',
    attrs: { type: 'search', placeholder: 'Alle Sätze durchsuchen …', 'aria-label': 'Alle Sätze durchsuchen' },
    on: { input: () => handlers.onSearchChange(search.value) },
  });

  const listSection = el('div', { class: 'sidebar__section' });

  const importInput = el('input', {
    attrs: { type: 'file', accept: 'application/json,.json', hidden: true },
    on: {
      change: () => {
        const file = importInput.files?.[0];
        if (file) handlers.onImport(file);
        importInput.value = '';
      },
    },
  });

  const node = el('aside', { class: 'sidebar' },
    el('div', { class: 'sidebar__brand' },
      logo(),
      el('h1', { text: 'bildhaft' }),
      el('button', {
        class: 'btn btn--quiet btn--icon',
        attrs: { type: 'button', title: 'Seitenleiste ausblenden' },
        on: { click: handlers.onCollapse },
      }, icons.chevronLeft()),
    ),
    el('div', { class: 'sidebar__section' }, search),
    listSection,
    el('div', { class: 'sidebar__section',
      style: { marginTop: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      el('button', { class: 'btn btn--quiet btn--sm', text: 'Einstellungen',
        attrs: { type: 'button' }, on: { click: handlers.onOpenSettings } }),
      el('label', { class: 'btn btn--quiet btn--sm', text: 'Importieren', style: { cursor: 'pointer' } },
        importInput),
    ),
  );

  function render(state: SidebarState): void {
    if (search.value !== state.searchQuery) search.value = state.searchQuery;

    if (state.searchQuery.trim().length > 0) {
      fill(listSection,
        el('h2', { text: `${state.searchResults.length} Treffer` }),
        el('div', { class: 'list' },
          ...state.searchResults.map((sentence) => {
            const where = state.collections.find((c) => c.id === sentence.collectionId)?.name ?? '—';
            return el('button', { class: 'hit', attrs: { type: 'button' },
              on: { click: () => handlers.onOpenResult(sentence) } },
              sentence.rawInput,
              el('small', { text: where }),
            );
          }),
          state.searchResults.length === 0
            ? el('p', { class: 'small faint', text: 'Nichts gefunden.', style: { padding: '0 10px' } })
            : null,
        ),
      );
      return;
    }

    fill(listSection,
      el('h2', { text: 'Sammlungen' }),
      el('div', { class: 'list' },
        ...state.collections.map((collection) => el('button', {
          class: `list__item${collection.id === state.activeId ? ' list__item--active' : ''}`,
          attrs: { type: 'button' },
          on: { click: () => handlers.onSelect(collection.id) },
        },
          el('span', { class: 'list__name', text: collection.name }),
          el('span', { class: 'list__count', text: String(state.counts[collection.id] ?? 0) }),
        )),
      ),
      el('button', { class: 'btn btn--quiet btn--sm', text: '+ Neue Sammlung',
        style: { marginTop: '6px' }, attrs: { type: 'button' }, on: { click: handlers.onNew } }),
    );
  }

  return { node, render };
}
