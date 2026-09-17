<script lang="ts">
  /** Which words go into the open Sammlung: everything, or one tag. */
  import { t } from '../i18n/index.ts';

  let { s }: {
    s: {
      total: number;
      tags: { label: string; n: number }[];
      pick(lens: string | null): void;
    };
  } = $props();

  const words = (n: number) => (n === 1 ? t('ui.n_words_one') : t('ui.n_words', { n }));
</script>

<p class="small muted" style="margin-top:0">{t('ui.add_wortschatz_note')}</p><div class="wortschatz-picks"><button class="btn quiet wortschatz-pick" type="button" disabled={s.total === 0} onclick={() => s.pick(null)}><b>{t('ui.all_words')}</b><span class="small faint">{words(s.total)}</span></button>{#each s.tags as tag (tag.label)}<button class="btn quiet wortschatz-pick" type="button" disabled={tag.n === 0} onclick={() => s.pick(tag.label)}><b>{tag.label}</b><span class="small faint">{words(tag.n)}</span></button>{/each}</div>
