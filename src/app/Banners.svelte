<script lang="ts">
  /*
   * The banners live inside one permanent region rather than being live regions
   * themselves, and that is the same rule the toast is under (conventions.md
   * §3.8): a reader announces a change in something it was already watching.
   *
   * The busy banner used to carry role="status" itself, and the render set its
   * text and *then* inserted the node — so it entered the accessibility tree
   * already carrying the message and announced nothing, every time. The role
   * read as correct in the markup and in review, which is exactly how the
   * toast's version of this survived as long as it did.
   *
   * So the region is the `.banners` element, which is here for the life of the
   * page, and what changes is which banner is inside it. An addition to a live
   * region's subtree is a change, which is what makes this work where the old
   * arrangement could not. The banners themselves carry no role="status": two
   * regions nested inside each other would announce twice.
   *
   * The signature guard this used to need is gone with the hand-written paint.
   * A banner whose condition still holds is a block that was never re-entered,
   * so its spinner is never restarted — which is what the guard was for.
   */
  import { metacom, MetacomProvider } from '@lautstark/bildquelle';
  import { sourceStatusLine } from '../ui/symbolSources.ts';
  import { resetSymbolResolution } from '../ui/symbols.ts';
  import { followsDefault, provider, providerId, s } from './state.svelte.ts';
  import { openAppSettings } from './settings.ts';
  import { t } from '../i18n/index.ts';

  /* What the source last said about itself. bildquelle tells us when that
     changes; nothing else about it is a rune, so this is the one place the
     subscription has to reach. */
  let status = $state(metacom.status());
  $effect(() => metacom.subscribe(() => { status = metacom.status(); }));

  /*
   * Indexing a real METACOM folder walks tens of thousands of files and takes
   * seconds. The source is not ready during that, but it is not broken either —
   * showing the warning through it left the user looking at an unchanged alarm
   * with no sign that the folder they just picked was being read.
   */
  let sourceBusy = $derived(providerId() === 'metacom' && status.kind === 'loading');
  /*
   * A pasted text, and how far through it we are.
   *
   * It shares the source's banner rather than getting one of its own: both
   * are the same sentence — something is working, wait — and the region below
   * shows one banner per kind. A single line does not raise it at all; its
   * spinner in the composer is over before there is anything to report, and a
   * banner that appears and vanishes within a second is noise.
   */
  let translating = $derived(s.batch !== null);
  /*
   * The active source cannot answer. For METACOM this is the normal state
   * after anything that resets a browser's per-site permissions — a new
   * address, cleared site data — because the folder grant is scoped to the
   * site, not to the app. Without this the only signal was "(nicht bereit)"
   * in grey next to the composer, while every row showed broken symbols and
   * offered nothing to click.
   */
  let sourceUnusable = $derived(s.sourceSettled && !sourceBusy
    && (!provider().isReady() || (providerId() === 'metacom' && s.unreadable >= 3)));

  /* The source's own words win: a folder being read is why nothing is being
     looked up yet, which is the more useful half of the same wait. */
  let busyMessage = $derived(status.kind === 'loading'
    ? sourceStatusLine(status)
    : s.batch
      ? t('ui.translating_lines', { n: Math.min(s.batch.done + 1, s.batch.total), total: s.batch.total })
      : t('ui.one_moment'));

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
   * `no-folder` is the state that only became reachable when the source moved
   * onto the collection: restoring a backup onto a machine that has no METACOM
   * folder brings collections that ask for one. Confirming access is no use
   * there — nothing has been mislaid — so it says what is actually missing and
   * where the way out is.
   */
  let unusableMessage = $derived.by(() => {
    if (providerId() !== 'metacom') return t('ui.source_unavailable');
    if (status.kind === 'needs-setup' && status.code === 'no-folder') {
      return `${t(followsDefault() ? 'ui.metacom_missing_default' : 'ui.metacom_missing_own')} `
        + t('ui.metacom_missing_fix');
    }
    return t('ui.metacom_unreadable');
  });

  async function regrant(): Promise<void> {
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
  }
</script>

<div class="banners" role="status">{#if sourceBusy || translating}<div class="banner banner--busy"><span class="spinner"></span><span style="flex:1">{busyMessage}</span></div>{/if}{#if sourceUnusable}<div class="banner" role="alert"><span style="flex:1">{unusableMessage}</span><button class="btn sm primary" type="button" style:display={providerId() === 'metacom' ? '' : 'none'} onclick={() => void regrant()}>{t('ui.confirm_access')}</button><button class="btn sm" type="button" onclick={() => openAppSettings()}>{t('ui.settings')}</button></div>{/if}{#if s.dbBlocked}<div class="banner" role="alert">{t('ui.blocked_by_tab')}</div>{/if}</div>
