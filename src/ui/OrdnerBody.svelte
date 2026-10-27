<script lang="ts">
  import type { Placing } from './ordnerSheet.svelte.ts';
  import LineAdd from './LineAdd.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Placing } = $props();

  const group = () => t(`ui.group_${s.options.collection.kind ?? 'satzstreifen'}`);
  const many = (n: number) => (n === 1 ? t('ui.ordner_n_one') : t('ui.ordner_n', { n }));
</script>

<p class="small muted" style="margin:0 0 12px">{t('ui.ordner_where', { name: s.options.collection.name })}</p><div class="sources" role="radiogroup" aria-label={t('ui.ordner_sheet_title')}><button class="source{s.isChosen(null) ? ' source--live' : ''}" type="button" role="radio" aria-checked={s.isChosen(null)} onclick={() => s.pick(null)}><span class="source__name">{t('ui.ordner_none')}</span><span class="source__facts">{t('ui.ordner_none_facts', { group: group() })}</span></button>{#each s.rows as row (row.name)}<button class="source{s.isChosen(row.name) ? ' source--live' : ''}" type="button" role="radio" aria-checked={s.isChosen(row.name)} onclick={() => s.pick(row.name)}><span class="source__name">{row.name}</span><span class="source__facts">{many(row.count)}</span></button>{/each}</div><div style="margin-top:10px"><!--
  The line every material adds with (LineAdd), so a new Ordner is typed the
  way a Schritt or an Aussage is.
--><LineAdd open={s.adding} plus={t('ui.new_ordner')} label={t('ui.ordner_name')} placeholder={t('ui.ordner_name')} onOpen={() => { s.adding = true; }} onClose={() => { s.adding = false; }} onSend={async (raw) => { s.make(raw); return null; }} /></div>
