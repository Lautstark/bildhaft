<script lang="ts">
  /**
   * Das „+" am Ende jeder Wand, als ein Teil: dieselbe leere Karte bei den
   * Wortkarten, den Zutaten, dem Plauderbuch, der Tafel-Ablage und dem Spiel
   * — konfiguriert statt kopiert. `word` stellt ein kleines Wort unter das
   * Zeichen, wo zwei Kacheln nebeneinander stehen und das „+" allein nicht
   * mehr sagt, was kommt; `platz` zeichnet statt des bloßen „+" den
   * Klettpunkt des Spiels: die Kachel, die eine Lücke verspricht.
   */
  let { label, word = null, platz = false, onAdd }: {
    label: string;
    word?: string | null;
    platz?: boolean;
    onAdd: () => void;
  } = $props();
</script>

<button class="word word--add" type="button" aria-label={label} title={label} onclick={onAdd}>{#if platz}<span class="word--add__dot" aria-hidden="true">+</span>{:else}<span aria-hidden="true">+</span>{/if}{#if word}<span class="word--add__word">{word}</span>{/if}</button>
