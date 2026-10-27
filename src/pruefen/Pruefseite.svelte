<script lang="ts">
  /**
   * Die Prüfseite (`?pruefen`): eine Vorlage, eine Kombination, ein Bogen —
   * so, wie er gedruckt wird. Links die Schalter der Vorlage mit denselben
   * Wörtern wie in der App, der Standard markiert, und die Liste der Probleme,
   * die in den gemessenen Kombinationen gefunden wurden; ein Klick stellt die
   * Schalter auf den Fall. Rechts der Bogen, alle Seiten nebeneinander im
   * gleichen Maßstab, und in einem Satz, was daran nicht stimmt.
   */
  import { COLLECTION_KINDS, type CollectionKind } from '../core/types.ts';
  import { primeSymbolUrl } from '../ui/symbols.ts';
  import Kachel from './Kachel.svelte';
  import { achsen, FAELLE, fallFor, standardLines, standardWahl, SYMBOLE, VORLAGE, zwillinge, type Fall, type Wahl } from './faelle.ts';
  import { vergleichen, type Befund, type Messung } from './messen.ts';

  for (const { id, url } of SYMBOLE.values()) primeSymbolUrl('arasaac', id, url);
  document.title = 'bildhaft — Prüfseite Druck';

  let vorlage = $state<CollectionKind>('spiel');
  let wahl = $state<Wahl>(standardWahl('spiel'));
  let scale = $state(0.5);
  let gemessen = $state.raw(new Map<string, Messung>());
  const onGemessen = (id: string, messung: Messung) => { gemessen = new Map(gemessen).set(id, messung); };

  const waehle = (which: CollectionKind, w: Wahl = standardWahl(which)) => { vorlage = which; wahl = w; };
  let fall = $derived(fallFor(vorlage, wahl));
  let std = $derived(standardWahl(vorlage));

  /* Measured out of sight: the problem list's cases, and what the shown case is compared with. */
  let still = $derived([...new Map([...FAELLE, ...zwillinge(fall)].map((one) => [one.id, one])).values()]);
  let fertig = $derived(FAELLE.every((one) => gemessen.has(one.id)));

  const befundeOf = (one: Fall): Befund[] => {
    const mine = gemessen.get(one.id);
    return mine ? [...mine.befunde, ...vergleichen(one, mine, gemessen)] : [];
  };
  const fehlerOf = (one: Fall) => befundeOf(one).filter((b) => b.schwere === 'fehler');
  let hier = $derived(befundeOf(fall));

  /* The problems of a template: each kind of fault once, with the combinations it shows in. */
  let probleme = $derived.by(() => {
    const by = new Map<string, Fall[]>();
    for (const one of FAELLE.filter((f) => f.vorlage === vorlage)) {
      for (const b of fehlerOf(one)) {
        /* Without its numbers, which differ from case to case. */
        const plain = b.text.replace(/^[^:]+: /, '').replace(/\s*\(.*?\)/g, '').replace(/,.*$/, '');
        const kind = plain.charAt(0).toUpperCase() + plain.slice(1);
        if (!by.get(kind)?.includes(one)) by.set(kind, [...(by.get(kind) ?? []), one]);
      }
    }
    return [...by.entries()];
  });
  const zahl = (which: CollectionKind) => FAELLE.filter((f) => f.vorlage === which && fehlerOf(f).length > 0).length;
</script>

<main class="pruef" data-fertig={fertig ? '' : undefined}>
  <aside class="pruef__links">
    <h1>Prüfseite Druck</h1>
    <nav class="pruef__vorlagen" aria-label="Vorlage">{#each COLLECTION_KINDS as which (which)}<button type="button" aria-pressed={vorlage === which} onclick={() => waehle(which)}>{VORLAGE[which]}{#if fertig && zahl(which) > 0}<span class="pruef__n" title="Kombinationen mit Fehlern">{zahl(which)}</span>{/if}</button>{/each}</nav>

    <section class="pruef__block" aria-label="Einstellungen">
      <div class="pruef__kopf"><h2>Einstellungen</h2>{#if !fall.standard}<button class="pruef__std-knopf" type="button" aria-label="Zurück zum Standard" onclick={() => { wahl = standardWahl(vorlage); }}>Standard</button>{/if}</div>
      {#each achsen(vorlage) as achse (achse.key)}<div class="pruef__achse"><span class="pruef__achse-name">{achse.name}</span><span class="segmented">{#each achse.werte as w (String(w.wert))}<button type="button" aria-pressed={wahl[achse.key] === w.wert} onclick={() => { wahl = { ...wahl, [achse.key]: w.wert }; }}>{w.name}{#if std[achse.key] === w.wert}<span class="pruef__std-punkt" title="Standard der Vorlage">•</span>{/if}</button>{/each}</span></div>{/each}
      <p class="pruef__klein">• = Standard der Vorlage</p>
      <details class="pruef__klein"><summary>Alle Standardwerte</summary><ul class="pruef__werte">{#each standardLines(vorlage) as line (line.name)}<li><span>{line.name}</span> {line.value}</li>{/each}</ul></details>
    </section>

    <section class="pruef__block" aria-label="Probleme">
      <h2>Probleme in {VORLAGE[vorlage]}</h2>
      {#if !fertig}<p class="pruef__klein">wird gemessen … {gemessen.size} / {FAELLE.length}</p>
      {:else if probleme.length === 0}<p class="pruef__ok">Keine gefunden.</p>
      {:else}<ul class="pruef__probleme">{#each probleme as [text, wo] (text)}<li><p>{text}</p><span class="pruef__wo">{#each wo as one (one.id)}<button type="button" aria-pressed={one.id === fall.id} onclick={() => { wahl = one.wahl; }}>{one.name || 'Standard'}</button>{/each}</span></li>{/each}</ul>{/if}
    </section>
  </aside>

  <section class="pruef__rechts" aria-label="Bogen">
    <header class="pruef__titel">
      <h2>{VORLAGE[vorlage]} · {fall.name || 'Standard'}</h2>
      <label class="pruef__klein">Größe <input type="range" min="0.25" max="1" step="0.05" bind:value={scale} /> {Math.round(scale * 100)} %</label>
    </header>
    {#if gemessen.has(fall.id)}<ul class="pruef__befunde">{#each hier.filter((b) => b.schwere === 'fehler') as b (b.text)}<li class="f">{b.text}</li>{/each}{#each hier.filter((b) => b.schwere === 'ok') as b (b.text)}<li class="ok">{b.text}</li>{/each}{#if hier.every((b) => b.schwere !== 'fehler')}<li class="ok">Kein Fehler gefunden.</li>{/if}</ul>{/if}
    <div class="pruef__buehne">{#key fall.id}<Kachel {fall} {scale} gezeigt {onGemessen} />{/key}</div>
  </section>

  <div class="pruef__still" aria-hidden="true">{#each still as one (one.id)}<Kachel fall={one} {onGemessen} />{/each}</div>
</main>

<style>
  .pruef { display: grid; grid-template-columns: 400px minmax(0, 1fr); min-height: 100vh; background: var(--bg, #faf8f6); color: var(--text, #2b2522); font-family: system-ui, sans-serif; font-size: 14px; }
  .pruef h1 { margin: 0 0 12px; font-size: 18px; }
  .pruef h2 { margin: 0; font-size: 15px; }
  .pruef__links { position: sticky; top: 0; height: 100vh; overflow: auto; box-sizing: border-box; padding: 18px; border-right: 1px solid var(--border, #e2ddd9); background: var(--surface, #fff); }
  .pruef__vorlagen { display: flex; flex-wrap: wrap; gap: 6px; }
  .pruef__vorlagen button, .pruef__wo button, .pruef__std-knopf { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border, #e2ddd9); background: transparent; color: inherit; cursor: pointer; }
  .pruef__vorlagen button[aria-pressed='true'], .pruef__wo button[aria-pressed='true'] { background: var(--accent, #ff6b35); border-color: var(--accent, #ff6b35); color: #fff; }
  .pruef__n { display: inline-block; margin-left: 5px; min-width: 16px; padding: 0 4px; border-radius: 8px; background: #c62828; color: #fff; font-size: 11px; text-align: center; }
  .pruef__block { margin-top: 22px; }
  .pruef__kopf { display: flex; align-items: center; justify-content: space-between; }
  .pruef__achse { display: grid; grid-template-columns: 84px auto; justify-content: start; align-items: center; gap: 8px; margin-top: 8px; }
  .pruef__achse-name { color: var(--muted, #776e69); font-size: 13px; }
  .pruef__achse .segmented button { font-size: 13px; }
  .pruef__std-punkt { margin-left: 3px; color: var(--accent, #ff6b35); }
  .pruef__klein { margin: 8px 0 0; font-size: 12px; color: var(--muted, #776e69); }
  .pruef__werte { margin: 6px 0 0; padding: 0; list-style: none; line-height: 1.6; }
  .pruef__werte span { display: inline-block; width: 100px; }
  .pruef__ok { color: #2e7d32; margin: 8px 0 0; }
  .pruef__probleme { margin: 8px 0 0; padding: 0; list-style: none; }
  .pruef__probleme li { padding: 8px 0; border-top: 1px solid var(--border, #e2ddd9); }
  .pruef__probleme p { margin: 0 0 6px; color: #b71c1c; font-weight: 600; font-size: 13px; }
  .pruef__wo { display: flex; flex-wrap: wrap; gap: 4px; }
  .pruef__wo button { font-size: 12px; padding: 2px 8px; }
  .pruef__rechts { padding: 18px 24px 60px; min-width: 0; }
  .pruef__titel { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .pruef__titel h2 { font-size: 18px; }
  .pruef__befunde { margin: 10px 0 16px; padding: 0; list-style: none; line-height: 1.6; }
  .pruef__befunde .f { color: #b71c1c; font-weight: 600; }
  .pruef__befunde .f::before { content: '✕ '; }
  .pruef__befunde .ok { color: #2e7d32; }
  .pruef__befunde .ok::before { content: '✓ '; }
  .pruef__buehne { overflow: auto; padding: 4px 4px 20px; }
  /* Out of sight but laid out: a sheet has to have its sizes to be measured. */
  .pruef__still { position: absolute; left: -100000px; top: 0; width: 1px; overflow: hidden; }
</style>
