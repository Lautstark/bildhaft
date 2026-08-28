import type { Collection, Sentence } from '../core/types.ts';
import { sentenceCaption } from '../core/types.ts';
import { drawCollections } from '@lautstark/design/collections';
import { el, fill } from './dom.ts';
import { icons, logo } from './logo.ts';
import { t } from '../i18n/index.ts';

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
  // It follows the source in force, so it is written rather than built in — and
  // that is now the open Sammlung's source rather than one setting for the whole
  // program, which makes this line the page's plainest statement of which source
  // drew what is on it. Classed so a test can ask that question of it.
  const credit = el('p', { class: 'footer__credit', style: { margin: '0 0 4px' } });

  const node = el('footer', { class: 'footer' },
    credit,
    el('p', { class: 'footer__links' },
      link(t('ui.what_is'), handlers.onAbout),
      // Both are legally required to be reachable and to be called exactly this.
      // "Kontakt" or a line inside the About dialog would not count.
      link(t('ui.impressum'), handlers.onImpressum),
      link(t('ui.privacy'), handlers.onDatenschutz),
      el('a', { text: t('ui.source_code'),
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
      class: 'btn quiet icon',
      attrs: { type: 'button', 'aria-label': t('ui.open_menu') },
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
    attrs: { type: 'search', placeholder: t('ui.search_placeholder'), 'aria-label': t('ui.search_label') },
    on: { input: () => handlers.onSearchChange(search.value) },
  });

  const listSection = el('div', { class: 'sidebar__section' });
  /* Made once and refilled: drawCollections() empties whatever it is handed,
     so a node rebuilt on every render would throw its listeners away each
     time for no reason. */
  const rowsHost = el('div', { class: 'collections' });

  const node = el('aside', { class: 'sidebar' },
    el('div', { class: 'sidebar__brand' },
      logo(),
      el('h1', { text: 'bildhaft' }),
      el('button', {
        class: 'btn quiet icon',
        attrs: { type: 'button', title: t('ui.hide_sidebar') },
        on: { click: handlers.onCollapse },
      }, icons.chevronLeft()),
    ),
    el('div', { class: 'sidebar__section' }, search),
    listSection,
    el('div', { class: 'sidebar__section',
      style: { marginTop: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      el('button', { class: 'btn quiet sm', text: t('ui.settings'),
        attrs: { type: 'button' }, on: { click: handlers.onOpenSettings } }),
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
              sentenceCaption(sentence),
              el('small', { text: where }),
            );
          }),
          state.searchResults.length === 0
            ? el('p', { class: 'small faint', text: t('ui.nothing_found'), style: { padding: '0 10px' } })
            : null,
        ),
      );
      return;
    }

    /* The rows are @lautstark/design/collections'. It empties the container it
       is given, so that container is made once here and refilled rather than
       rebuilt with the rest of the section — the heading above it and the
       button under it are this sidebar's and are not shared, which is the
       line the package draws. The additive flag it reports is ignored because
       bildhaft opens one Sammlung at a time (§4.2) — which v1.17.0 separated
       from how many a line may be *in* (§4.1), the question this comment used
       to answer and the one that is now one everywhere. */
    fill(listSection,
      el('h2', { text: t('ui.collections') }),
      rowsHost,
      el('button', { class: 'btn quiet sm', text: t('ui.new_collection'),
        style: { marginTop: '6px' }, attrs: { type: 'button' }, on: { click: handlers.onNew } }),
    );
    drawCollections(rowsHost, {
      rows: state.collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        count: state.counts[collection.id] ?? 0,
      })),
      open: state.activeId ? [state.activeId] : [],
      onPick: (id) => handlers.onSelect(id),
    });
  }

  return { node, render };
}
