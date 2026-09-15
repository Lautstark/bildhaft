import { metacom, MetacomProvider } from '@lautstark/bildquelle';
import { t } from '../i18n/index.ts';
import { el } from '../ui/dom.ts';
import { sourceStatusLine } from '../ui/symbolSources.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { followsDefault, provider, providerId } from './state.ts';
import type { Ctx } from './context.ts';

/*
 * The banners live inside one permanent region rather than being live regions
 * themselves, and that is the same rule the toast is under (conventions.md
 * §3.8): a reader announces a change in something it was already watching.
 *
 * busyBanner used to carry role="status" itself, and the render set its text
 * and *then* inserted the node — so it entered the accessibility tree already
 * carrying the message and announced nothing, every time. The role read as
 * correct in the markup and in review, which is exactly how the toast's
 * version of this survived as long as it did.
 *
 * So the region is `host`, mounted once by app.ts, and what changes is which
 * banner is inside it. An addition to a live region's subtree is a change,
 * which is what makes this work where the old arrangement could not. The
 * banners themselves carry no role: two regions nested inside each other
 * would announce twice.
 */
export function banners(ctx: Ctx): { host: HTMLElement; render(): void } {
  const { s } = ctx;

  /* The region the banners are drawn into. Mounted once, and never taken out
     again; it sits above the composer. Empty it is a block with no content and
     costs no room. */
  const host = el('div', { class: 'banners', attrs: { role: 'status' } });

  const busyMessage = el('span', { style: { flex: '1' } });
  const busyBanner = el('div', { class: 'banner banner--busy' },
    el('span', { class: 'spinner' }), busyMessage);

  const unusableMessage = el('span', { style: { flex: '1' } });
  const regrant = el('button', {
    class: 'btn sm primary',
    text: t('ui.confirm_access'),
    attrs: { type: 'button' },
    on: {
      click: async () => {
        // Both need the click: re-granting and re-picking are gated on a user
        // gesture and cannot happen on load.
        const ok = await metacom.requestPermission().catch(() => false);
        if (!ok && MetacomProvider.supportsPersistentPicker) {
          await metacom.pickDirectory().catch(() => undefined);
        }
        // Re-granting alone changes nothing on screen: the symbols already gave
        // up and nothing about them has changed.
        resetSymbolResolution('metacom');
        s.unreadable = 0;
        ctx.render();
      },
    },
  });
  const unusableBanner = el('div', { class: 'banner', attrs: { role: 'alert' } },
    unusableMessage, regrant,
    el('button', { class: 'btn sm', text: t('ui.settings'),
      attrs: { type: 'button' }, on: { click: () => ctx.openAppSettings() } }),
  );

  const blockedBanner = el('div', { class: 'banner', attrs: { role: 'alert' }, text:
    t('ui.blocked_by_tab') });

  let signature = '';

  function render(): void {
    /*
     * Indexing a real METACOM folder walks tens of thousands of files and takes
     * seconds. The source is not ready during that, but it is not broken either —
     * showing the warning through it left the user looking at an unchanged alarm
     * with no sign that the folder they just picked was being read.
     */
    const status = metacom.status();
    const sourceBusy = providerId(s) === 'metacom' && status.kind === 'loading';
    /*
     * A pasted text, and how far through it we are.
     *
     * It shares the source's banner rather than getting one of its own: both
     * are the same sentence — something is working, wait — and the region below
     * shows one banner per kind. A single line does not raise it at all; its
     * spinner in the composer is over before there is anything to report, and a
     * banner that appears and vanishes within a second is noise.
     */
    const translating = s.batch !== null;
    /*
     * The active source cannot answer. For METACOM this is the normal state
     * after anything that resets a browser's per-site permissions — a new
     * address, cleared site data — because the folder grant is scoped to the
     * site, not to the app. Without this the only signal was "(nicht bereit)"
     * in grey next to the composer, while every row showed broken symbols and
     * offered nothing to click.
     */
    const sourceUnusable = s.sourceSettled && !sourceBusy
      && (!provider(s).isReady() || (providerId(s) === 'metacom' && s.unreadable >= 3));

    /* The source's own words win: a folder being read is why nothing is being
       looked up yet, which is the more useful half of the same wait. */
    if (status.kind === 'loading') busyMessage.textContent = sourceStatusLine(status);
    else if (s.batch) {
      busyMessage.textContent =
        t('ui.translating_lines', { n: Math.min(s.batch.done + 1, s.batch.total), total: s.batch.total });
    } else busyMessage.textContent = t('ui.one_moment');
    unusableMessage.textContent = providerId(s) === 'metacom'
      ? metacomWanted(status.kind === 'needs-setup' && status.code === 'no-folder')
      : t('ui.source_unavailable');
    regrant.style.display = providerId(s) === 'metacom' ? '' : 'none';

    const wanted: [string, HTMLElement][] = [];
    if (sourceBusy || translating) wanted.push(['busy', busyBanner]);
    if (sourceUnusable) wanted.push(['unusable', unusableBanner]);
    if (s.dbBlocked) wanted.push(['blocked', blockedBanner]);

    // Re-inserting an unchanged banner would restart its spinner animation.
    const next = wanted.map(([key]) => key).join('|');
    if (next === signature) return;
    signature = next;

    // Into the region rather than into the page: the host stays, the contents
    // change. `replaceChildren` with the wanted set keeps the signature guard
    // above meaningful — an unchanged set returns before this line, so a
    // spinner that is still spinning is never restarted.
    host.replaceChildren(...wanted.map(([, node]) => node));
  }

  /**
   * The sentence for "METACOM is what this page is drawing in, and it cannot
   * draw". Which of the two it is matters, and so does who asked.
   *
   * bildhaft never quietly renders one source when another was asked for — the
   * page says the source is unavailable and shows nothing rather than filling
   * the rows with ARASAAC pictures under a collection that asked for METACOM.
   * A silent fall-back is the failure vorlaut met from the other side, where a
   * package baked pictures nobody had chosen.
   *
   * `noFolder` is the state that only became reachable when the source moved
   * onto the collection: restoring a backup onto a machine that has no METACOM
   * folder brings collections that ask for one. Confirming access is no use
   * there — nothing has been mislaid — so it says what is actually missing and
   * where the way out is.
   */
  function metacomWanted(noFolder: boolean): string {
    const own = !followsDefault(s);
    if (noFolder) {
      return `${t(own ? 'ui.metacom_missing_own' : 'ui.metacom_missing_default')} `
        + t('ui.metacom_missing_fix');
    }
    return t('ui.metacom_unreadable');
  }

  return { host, render };
}
