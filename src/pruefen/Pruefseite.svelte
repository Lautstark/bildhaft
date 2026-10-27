<script lang="ts">
  /**
   * Die Prüfseite (`?pruefen`): eine Vorlage, ein Material, eine Kombination,
   * ein Bogen — so, wie er gedruckt wird. Links die Schalter der Vorlage mit
   * denselben Wörtern und denselben freien Feldern wie in der App, der
   * Standard markiert, das Material (Testdaten oder eins aus ihrer Sammlung)
   * und die Probleme, die über die gemessenen Kombinationen gefunden wurden;
   * ein Klick stellt die Schalter auf den Fall. Rechts der Bogen, die Seiten
   * in die Breite umgebrochen, alle im gleichen Maßstab, und in einem Satz,
   * was daran nicht stimmt.
   */
  import { COLLECTION_KINDS, type CollectionKind } from '../core/types.ts';
  import { primeSymbolUrl } from '../ui/symbols.ts';
  import Kachel from './Kachel.svelte';
  import {
    achsen, faelleFor, fallFor, standardWahl, SYMBOLE, testdaten, VORLAGE, zahlText, zwillinge,
    type Fall, type Material, type Wahl,
  } from './faelle.ts';
  import { vergleichen, type Befund, type Messung } from './messen.ts';
  import { gemerkterOrdner, ordnerOeffnen, sammlungLesen } from './sammlung.ts';

  /* Every template's test data made first: that is what draws the test symbols. */
  for (const which of COLLECTION_KINDS) testdaten(which);
  for (const { id, url } of SYMBOLE.values()) primeSymbolUrl('arasaac', id, url);
  document.title = 'bildhaft — Prüfseite Druck';

  let vorlage = $state<CollectionKind>('spiel');
  /* Her materials, once the folder is open; and which one each template shows. */
  let ihre = $state.raw(new Map<CollectionKind, Material[]>());
  let gewaehlt = $state.raw(new Map<CollectionKind, string>());
  const materialOf = (which: CollectionKind): Material =>
    ihre.get(which)?.find((one) => one.id === gewaehlt.get(which)) ?? testdaten(which);
  let m = $derived(materialOf(vorlage));
  let wahl = $state<Wahl>(standardWahl('spiel'));
  const waehle = (which: CollectionKind) => { vorlage = which; wahl = standardWahl(which, materialOf(which)); };
  const nimm = (id: string) => {
    gewaehlt = new Map(gewaehlt).set(vorlage, id);
    wahl = standardWahl(vorlage, materialOf(vorlage));
  };

  let scale = $state(0.5);
  let breite = $state(0);
  /* The room beside the column, its padding off. */
  let platz = $derived(Math.max(0, breite - 48));
  /* Never wider than the room: a page lying on its side is shrunk to fit rather than scrolled to. */
  let shown = $derived(platz ? Math.min(scale, platz / (297 * 96 / 25.4)) : scale);

  let gemessen = $state.raw(new Map<string, Messung>());
  const onGemessen = (id: string, messung: Messung) => { gemessen = new Map(gemessen).set(id, messung); };

  let fall = $derived(fallFor(vorlage, m, wahl));
  let std = $derived(standardWahl(vorlage, m));
  let alle = $derived(new Map(COLLECTION_KINDS.map((which) => [which, faelleFor(which, materialOf(which))])));
  let hierAlle = $derived(alle.get(vorlage) ?? []);

  /* Measured out of sight, a few at a time: what the shown case is compared with first, then this template's, then the others'. */
  let still = $derived([...new Map([...zwillinge(fall), ...hierAlle, ...[...alle.values()].flat()].map((one) => [one.id, one])).values()]
    .filter((one) => !gemessen.has(one.id)).slice(0, 12));
  let fertig = $derived(hierAlle.every((one) => gemessen.has(one.id)));

  const befundeOf = (one: Fall): Befund[] => {
    const mine = gemessen.get(one.id);
    return mine ? [...mine.befunde, ...vergleichen(one, mine, gemessen)] : [];
  };
  const fehlerOf = (one: Fall) => befundeOf(one).filter((b) => b.schwere === 'fehler');
  let hier = $derived(befundeOf(fall));

  /* The problems of a template: each kind of fault once, with the combinations it shows in. */
  let probleme = $derived.by(() => {
    const by = new Map<string, Fall[]>();
    for (const one of hierAlle) {
      for (const b of fehlerOf(one)) {
        /* Without the card's kind and the numbers, which differ from case to case. */
        const plain = b.text.replace(/^[^:]+: /, '').replace(/\s*\(.*?\)/g, '').replace(/,.*$/, '');
        const kind = plain.charAt(0).toUpperCase() + plain.slice(1);
        if (!by.get(kind)?.includes(one)) by.set(kind, [...(by.get(kind) ?? []), one]);
      }
    }
    return [...by.entries()];
  });
  const zahl = (which: CollectionKind) => {
    const all = alle.get(which) ?? [];
    return all.every((one) => gemessen.has(one.id)) ? all.filter((one) => fehlerOf(one).length > 0).length : 0;
  };

  /* Her collection: the folder kept from last time, opened again with a click. */
  let ordner = $state<'zu' | 'liest' | 'offen' | 'fehler'>('zu');
  let gemerkt = $state<FileSystemDirectoryHandle | null>(null);
  void gemerkterOrdner().then((kept) => { gemerkt = kept; });
  async function oeffnen(): Promise<void> {
    try {
      const root = await ordnerOeffnen(gemerkt);
      ordner = 'liest';
      ihre = await sammlungLesen(root);
      gemerkt = root;
      ordner = 'offen';
    } catch {
      ordner = 'fehler';
    }
  }
  let anzahlIhre = $derived([...ihre.values()].reduce((n, list) => n + list.length, 0));
</script>

{#snippet knopf(one: Fall)}<button type="button" aria-pressed={one.id === fall.id} onclick={() => { wahl = one.wahl; }}>{one.name || 'Standard'}</button>{/snippet}

<main class="pruef" data-fertig={fertig ? '' : undefined}>
  <aside class="pruef__links">
    <h1>Prüfseite Druck</h1>
    <nav class="pruef__vorlagen" aria-label="Vorlage">{#each COLLECTION_KINDS as which (which)}<button type="button" aria-pressed={vorlage === which} onclick={() => waehle(which)}>{VORLAGE[which]}{#if zahl(which) > 0}<span class="pruef__n" title="Kombinationen mit Fehlern">{zahl(which)}</span>{/if}</button>{/each}</nav>

    <section class="pruef__block" aria-label="Material">
      <h2>Material</h2>
      <div class="pruef__material">
        <select aria-label="Material" value={m.id} onchange={(event) => nimm(event.currentTarget.value)}>
          <option value={testdaten(vorlage).id}>Testdaten</option>
          {#each ihre.get(vorlage) ?? [] as one (one.id)}<option value={one.id}>{one.quelle}</option>{/each}
        </select>
        {#if ordner !== 'offen'}<button class="pruef__std-knopf" type="button" onclick={oeffnen} disabled={ordner === 'liest'}>{ordner === 'liest' ? 'liest …' : 'Meine Sammlung öffnen'}</button>{/if}
      </div>
      {#if ordner === 'offen'}<p class="pruef__klein">{anzahlIhre} Materialien aus deiner Sammlung geladen.</p>
      {:else if ordner === 'fehler'}<p class="pruef__klein pruef__rot">Der Ordner ließ sich nicht lesen. Wähle den Ordner „Lautstark“ (mit „bildhaft“ und „METACOM_9_Desktop“ darin).</p>
      {:else if !gemerkt}<p class="pruef__klein">Wähle den Ordner „Lautstark“: daraus kommen deine Materialien und deine METACOM-Symbole. Es wird nichts verändert.</p>{/if}
    </section>

    <section class="pruef__block" aria-label="Einstellungen">
      <div class="pruef__kopf"><h2>Einstellungen</h2>{#if !fall.standard}<button class="pruef__std-knopf" type="button" aria-label="Zurück zum Standard" onclick={() => { wahl = standardWahl(vorlage, m); }}>Standard</button>{/if}</div>
      {#each [...new Set(achsen(vorlage, m).map((achse) => achse.menu))] as menu (menu)}<h3 class="pruef__menu">{menu}</h3>{#each achsen(vorlage, m).filter((achse) => achse.menu === menu) as achse (achse.key)}<div class="pruef__achse" class:pruef__achse--anders={wahl[achse.key] !== std[achse.key]}><span class="pruef__achse-name">{achse.name}</span>{#if achse.art === 'wahl'}<span class="segmented">{#each achse.werte as w, at (at)}<button type="button" aria-pressed={wahl[achse.key] === at} onclick={() => { wahl = { ...wahl, [achse.key]: at }; }}>{w.name}{#if std[achse.key] === at}<span class="pruef__std-punkt" title="Standard der Vorlage">•</span>{/if}</button>{/each}</span>{:else if achse.art === 'zahl'}<label class="pruef__zahl"><input class="field" type="number" min={achse.min} max={achse.max} step={achse.step} value={wahl[achse.key]} aria-label={achse.name} onchange={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n)) wahl = { ...wahl, [achse.key]: Math.min(achse.max, Math.max(achse.min, n)) }; }} /> {achse.unit}<span class="pruef__klein">Standard {zahlText(Number(std[achse.key]))}</span></label>{:else}<input class="field pruef__text" type="text" value={wahl[achse.key]} aria-label={achse.name} onchange={(event) => { wahl = { ...wahl, [achse.key]: event.currentTarget.value }; }} />{/if}</div>{/each}{/each}
      <p class="pruef__klein">• und „Standard“ = so öffnet ein neues Material dieser Vorlage. Was davon abweicht, ist links markiert.</p>
    </section>

    <section class="pruef__block" aria-label="Probleme">
      <h2>Probleme in {VORLAGE[vorlage]}</h2>
      {#if !fertig}<p class="pruef__klein">wird gemessen … {hierAlle.filter((one) => gemessen.has(one.id)).length} / {hierAlle.length}</p>
      {:else if probleme.length === 0}<p class="pruef__ok">Keine gefunden.</p>
      {:else}<ul class="pruef__probleme">{#each probleme as [text, wo] (text)}<li><p>{text} <span class="pruef__anzahl">in {wo.length === 1 ? '1 Kombination' : `${wo.length} Kombinationen`}</span></p><span class="pruef__wo">{#each wo.slice(0, 4) as one (one.id)}{@render knopf(one)}{/each}</span>{#if wo.length > 4}<details class="pruef__mehr"><summary>alle {wo.length} zeigen</summary><span class="pruef__wo">{#each wo.slice(4) as one (one.id)}{@render knopf(one)}{/each}</span></details>{/if}</li>{/each}</ul>{/if}
    </section>
  </aside>

  <section class="pruef__rechts" aria-label="Bogen" bind:clientWidth={breite}>
    <header class="pruef__titel">
      <h2>{VORLAGE[vorlage]} · {fall.name || 'Standard'}</h2>
      <label class="pruef__klein">Größe <input type="range" min="0.25" max="1" step="0.05" bind:value={scale} /> {Math.round(shown * 100)} %</label>
    </header>
    {#if m.id !== testdaten(vorlage).id}<p class="pruef__klein">Material: {m.quelle}</p>{/if}
    {#if gemessen.has(fall.id)}<ul class="pruef__befunde">{#each hier.filter((b) => b.schwere === 'fehler') as b (b.text)}<li class="f">{b.text}</li>{/each}{#each hier.filter((b) => b.schwere === 'ok') as b (b.text)}<li class="ok">{b.text}</li>{/each}{#if hier.every((b) => b.schwere !== 'fehler')}<li class="ok">Kein Fehler gefunden.</li>{/if}</ul>{/if}
    <div class="pruef__buehne">{#key fall.id}<Kachel {fall} scale={shown} breite={platz || undefined} gezeigt {onGemessen} />{/key}</div>
  </section>

  <div class="pruef__still" aria-hidden="true">{#each still as one (one.id)}<Kachel fall={one} {onGemessen} />{/each}</div>
</main>

<style>
  .pruef { display: grid; grid-template-columns: 470px minmax(0, 1fr); min-height: 100vh; background: var(--bg, #faf8f6); color: var(--text, #2b2522); font-family: system-ui, sans-serif; font-size: 14px; }
  .pruef h1 { margin: 0 0 12px; font-size: 18px; }
  .pruef h2 { margin: 0; font-size: 15px; }
  .pruef__links { position: sticky; top: 0; height: 100vh; overflow: auto; box-sizing: border-box; padding: 18px; border-right: 1px solid var(--border, #e2ddd9); background: var(--surface, #fff); }
  .pruef__vorlagen { display: flex; flex-wrap: wrap; gap: 6px; }
  .pruef__vorlagen button, .pruef__wo button, .pruef__std-knopf { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border, #e2ddd9); background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
  .pruef__vorlagen button[aria-pressed='true'], .pruef__wo button[aria-pressed='true'] { background: var(--accent, #ff6b35); border-color: var(--accent, #ff6b35); color: #fff; }
  .pruef__n { display: inline-block; margin-left: 5px; min-width: 16px; padding: 0 4px; border-radius: 8px; background: #c62828; color: #fff; font-size: 11px; text-align: center; }
  .pruef__block { margin-top: 22px; }
  .pruef__kopf { display: flex; align-items: center; justify-content: space-between; }
  .pruef__material { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .pruef__material select { flex: 1; min-width: 0; font: inherit; padding: 4px 6px; }
  .pruef__menu { margin: 14px 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, #776e69); }
  .pruef__achse { display: grid; grid-template-columns: 150px auto; justify-content: start; align-items: center; gap: 8px; margin-top: 8px; padding-left: 6px; border-left: 3px solid transparent; }
  .pruef__achse--anders { border-left-color: var(--accent, #ff6b35); }
  .pruef__achse-name { color: var(--muted, #776e69); font-size: 13px; }
  .pruef__achse .segmented button { font-size: 13px; white-space: nowrap; padding-inline: 9px; }
  .pruef__zahl { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .pruef__zahl input { width: 80px; }
  .pruef__zahl .pruef__klein { margin: 0 0 0 6px; }
  .pruef__text { width: 230px; }
  .pruef__std-punkt { margin-left: 3px; color: var(--accent, #ff6b35); }
  .pruef__klein { margin: 8px 0 0; font-size: 12px; color: var(--muted, #776e69); }
  .pruef__rot { color: #b71c1c; }
  .pruef__ok { color: #2e7d32; margin: 8px 0 0; }
  .pruef__probleme { margin: 8px 0 0; padding: 0; list-style: none; }
  .pruef__probleme li { padding: 8px 0; border-top: 1px solid var(--border, #e2ddd9); }
  .pruef__probleme p { margin: 0 0 6px; color: #b71c1c; font-weight: 600; font-size: 13px; }
  .pruef__anzahl { font-weight: 400; color: var(--muted, #776e69); }
  .pruef__wo { display: flex; flex-wrap: wrap; gap: 4px; }
  .pruef__wo button { font-size: 12px; padding: 2px 8px; }
  .pruef__mehr { margin-top: 6px; font-size: 12px; }
  .pruef__mehr summary { cursor: pointer; color: var(--muted, #776e69); margin-bottom: 4px; }
  .pruef__rechts { padding: 18px 24px 60px; min-width: 0; overflow-x: hidden; }
  .pruef__titel { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .pruef__titel h2 { font-size: 18px; }
  .pruef__befunde { margin: 10px 0 16px; padding: 0; list-style: none; line-height: 1.6; }
  .pruef__befunde .f { color: #b71c1c; font-weight: 600; }
  .pruef__befunde .f::before { content: '✕ '; }
  .pruef__befunde .ok { color: #2e7d32; }
  .pruef__befunde .ok::before { content: '✓ '; }
  .pruef__buehne { padding: 4px 0 20px; }
  /* Out of sight but laid out: a sheet has to have its sizes to be measured. */
  .pruef__still { position: absolute; left: -100000px; top: 0; width: 1px; overflow: hidden; }
</style>
