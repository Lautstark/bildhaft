<script lang="ts">
  /**
   * Die Prüfseite (`?pruefen`): jede Vorlage, wie sie öffnet — ihr Standard,
   * hervorgehoben, mit den Werten, die ihn ausmachen — und daneben jede
   * Einstellung, die eine Karte oder ein Symbol anders macht. Gedruckt wird
   * nichts; gezeigt wird genau das Blatt, das der Drucker bekäme, mit dem, was
   * darauf gemessen wurde. Testsymbole füllen ihr Feld bis zum Rand, damit
   * man die Größe sieht; nichts davon sind ihre Daten, nichts geht ins Netz.
   */
  import { COLLECTION_KINDS, type CollectionKind } from '../core/types.ts';
  import { primeSymbolUrl } from '../ui/symbols.ts';
  import Kachel from './Kachel.svelte';
  import { FAELLE, standardLines, SYMBOLE, VORLAGE } from './faelle.ts';
  import { vergleichen, type Befund, type Messung } from './messen.ts';

  for (const { id, url } of SYMBOLE.values()) primeSymbolUrl('arasaac', id, url);
  document.title = 'bildhaft — Prüfseite Druck';

  let scale = $state(0.4);
  let masse = $state(true);
  let nurBefunde = $state(false);
  let gemessen = $state.raw(new Map<string, Messung>());
  const onGemessen = (id: string, messung: Messung) => { gemessen = new Map(gemessen).set(id, messung); };

  let fertig = $derived(gemessen.size === FAELLE.length);
  /* Its own findings, then — once the twin it is compared with is measured — those against it. */
  let befunde = $derived(new Map(FAELLE.map((fall) => {
    const mine = gemessen.get(fall.id);
    const own: Befund[] = mine ? [...mine.befunde, ...vergleichen(fall, mine, gemessen)] : [];
    return [fall.id, own];
  })));
  const fehlerOf = (id: string) => (befunde.get(id) ?? []).filter((b) => b.schwere === 'fehler');
  let alleFehler = $derived(FAELLE.flatMap((fall) => fehlerOf(fall.id).map((b) => ({ fall, text: b.text }))));
  /* The three questions the page was made for, answered per template. */
  const FRAGEN = [
    { n: 1, text: 'Ist ein Symbol auf Spielbogen und Kartenbogen gleich groß?' },
    { n: 2, text: 'Lässt der Anybook-Kreis das Symbol nie wachsen und drückt nichts über das Wort?' },
    { n: 3, text: 'Wird mit Beschriftung die Karte höher, statt dass das Symbol schrumpft?' },
  ] as const;
  const antwort = (frage: number, which: CollectionKind) => {
    const all = of(which).flatMap((fall) => (befunde.get(fall.id) ?? []).filter((b) => b.frage === frage).map((b) => ({ fall, b })));
    const fehler = all.filter(({ b }) => b.schwere === 'fehler');
    const hinweis = all.filter(({ b }) => b.schwere === 'hinweis');
    return { fehler: fehler.length, hinweis: hinweis.length, ok: all.length - fehler.length - hinweis.length, erster: (fehler[0] ?? hinweis[0])?.fall.id ?? null };
  };
  const of = (which: CollectionKind) => FAELLE.filter((fall) => fall.vorlage === which);
  const shown = (which: CollectionKind) => of(which).filter((fall) => !nurBefunde || fall.standard || fehlerOf(fall.id).length > 0);
</script>

<main class="pruef" data-fertig={fertig ? '' : undefined}>
  <header class="pruef__kopf">
    <h1>Prüfseite Druck</h1>
    <p class="faint">Jede Vorlage im <b>Standard</b> (hervorgehoben) und je Einstellung, die Karte oder Symbol ändert — gezeichnet von der echten Druck-Pipeline. Testsymbole füllen ihr Feld bis zum Rand: <span class="leg leg--sym">blau</span> das gezeichnete Symbol, <span class="leg leg--wort">grün</span> der Text des Worts, die Zahlen Karte B×H und S = Symbol, in mm.</p>
    <div class="pruef__steuer">
      <label>Größe <input type="range" min="0.2" max="1" step="0.05" bind:value={scale} /> {Math.round(scale * 100)} %</label>
      <label><input type="checkbox" bind:checked={masse} /> Maße auf den Karten</label>
      <label><input type="checkbox" bind:checked={nurBefunde} /> nur Fälle mit Fehlern (und Standard)</label>
      <span class="faint">{gemessen.size} / {FAELLE.length} gemessen</span>
    </div>
    <nav class="pruef__nav">{#each COLLECTION_KINDS as which (which)}{@const n = of(which).reduce((sum, fall) => sum + fehlerOf(fall.id).length, 0)}<a href="#vorlage-{which}">{VORLAGE[which]}{#if n > 0} <span class="pruef__n">{n}</span>{/if}</a>{/each}</nav>
    {#if fertig}<table class="pruef__fragen">
      <thead><tr><th></th>{#each COLLECTION_KINDS as which (which)}<th>{VORLAGE[which]}</th>{/each}</tr></thead>
      <tbody>{#each FRAGEN as frage (frage.n)}<tr><th>{frage.text}</th>{#each COLLECTION_KINDS as which (which)}{@const a = antwort(frage.n, which)}<td class:f={a.fehler > 0} class:h={a.fehler === 0 && a.hinweis > 0} class:ok={a.fehler === 0 && a.hinweis === 0 && a.ok > 0}>{#if a.erster}<a href="#{a.erster}">{a.fehler > 0 ? `✕ ${a.fehler}` : `· ${a.hinweis}`}</a>{:else if a.ok > 0}✓{:else}–{/if}</td>{/each}</tr>{/each}</tbody>
    </table>
    <p class="faint pruef__legende">✕ Fehler (Zahl der Befunde, Link zum ersten Fall) · Punkt: nur Hinweise, z. B. Symbol schrumpft bei vorgegebener Kartengröße · ✓ geprüft und stimmt · – trifft nicht zu</p>
    <details class="pruef__summe" open={alleFehler.length > 0}>
      <summary>{alleFehler.length === 0 ? 'Keine Fehler gefunden' : `${alleFehler.length} Fehler in ${new Set(alleFehler.map((f) => f.fall.id)).size} Fällen`}</summary>
      <ul>{#each alleFehler as f, at (at)}<li><a href="#{f.fall.id}">{VORLAGE[f.fall.vorlage]}{#if f.fall.name} · {f.fall.name}{:else} · Standard{/if}</a> — {f.text}</li>{/each}</ul>
    </details>{/if}
  </header>

  {#each COLLECTION_KINDS as which (which)}<section class="vorlage" id="vorlage-{which}">
    <h2>{VORLAGE[which]}</h2>
    <dl class="vorlage__std" aria-label="Standard der Vorlage {VORLAGE[which]}">{#each standardLines(which) as line (line.name)}<div class:vorlage__eigen={line.own}><dt>{line.name}</dt><dd>{line.value}</dd></div>{/each}</dl>
    <p class="faint vorlage__fuss">Standard, wie ein neues Material dieser Vorlage öffnet (templates.ts). <b>Fett</b>: von der Vorlage selbst gesetzt, sonst der allgemeine Ausgangswert.</p>
    <div class="vorlage__kacheln">{#each shown(which) as fall (fall.id)}<Kachel {fall} {scale} {masse} befunde={befunde.get(fall.id) ?? []} {onGemessen} />{/each}</div>
  </section>{/each}
</main>

<style>
  .pruef { max-width: none; padding: 20px 24px 80px; background: var(--bg, #faf8f6); color: var(--text, #2b2522); min-height: 100vh; font-family: system-ui, sans-serif; }
  .pruef__kopf { padding-bottom: 10px; border-bottom: 1px solid var(--border, #e2ddd9); }
  .pruef h1 { margin: 0 0 4px; font-size: 22px; }
  .pruef__kopf > p { margin: 0 0 8px; font-size: 13px; max-width: 900px; }
  .leg { font-weight: 600; }
  .leg--sym { color: #1976d2; }
  .leg--wort { color: #00965a; }
  .pruef__steuer { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; font-size: 13px; }
  .pruef__nav { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pruef__nav a { font-size: 13px; padding: 3px 10px; border-radius: 999px; background: var(--surface-2, #eeeae7); color: inherit; text-decoration: none; }
  .pruef__n { display: inline-block; min-width: 16px; padding: 0 4px; border-radius: 8px; background: #c62828; color: #fff; font-size: 11px; text-align: center; }
  .pruef__fragen { margin-top: 10px; border-collapse: collapse; font-size: 12.5px; }
  .pruef__fragen th, .pruef__fragen td { padding: 4px 8px; border: 1px solid var(--border, #e2ddd9); text-align: center; }
  .pruef__fragen tbody th { text-align: left; font-weight: 500; max-width: 420px; }
  .pruef__fragen td.f { background: #fde3e3; color: #b71c1c; font-weight: 700; }
  .pruef__fragen td.h { background: #fff4d6; }
  .pruef__fragen td.ok { background: #e3f3e3; color: #2e7d32; }
  .pruef__fragen a { color: inherit; }
  .pruef__legende { margin: 4px 0 0; font-size: 12px; }
  .pruef__summe { margin-top: 8px; font-size: 13px; max-height: 30vh; overflow: auto; }
  .pruef__summe summary { cursor: pointer; font-weight: 600; }
  .pruef__summe ul { margin: 4px 0 0; padding-left: 18px; }
  .pruef__summe a { color: inherit; }
  .vorlage { margin-top: 28px; scroll-margin-top: 12px; }
  .vorlage h2 { margin: 0 0 8px; font-size: 19px; }
  .vorlage__std { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
  .vorlage__std > div { display: flex; gap: 5px; padding: 3px 9px; border-radius: 6px; font-size: 12.5px; background: var(--surface-2, #eeeae7); border: 1px solid transparent; }
  .vorlage__std dt { color: var(--muted, #776e69); }
  .vorlage__std dd { margin: 0; }
  .vorlage__eigen { border-color: var(--accent, #ff6b35) !important; background: color-mix(in srgb, var(--accent, #ff6b35) 10%, var(--surface, #fff)) !important; }
  .vorlage__eigen dd { font-weight: 700; }
  .vorlage__fuss { margin: 4px 0 10px; font-size: 12px; }
  .vorlage__kacheln { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
  :global(.kachel) { scroll-margin-top: 12px; }
</style>
