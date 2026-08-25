# bildhaft

**Deutsch** · [English](README.md)

**Deutsche Sätze in AAC-Piktogramme übersetzen, korrigieren und drucken.**

bildhaft ist ein Werkzeug zur Materialherstellung für Unterstützte Kommunikation
(UK). Man tippt einen Satz, bekommt eine Reihe von Symbolen, korrigiert was falsch
ist, und druckt am Ende Satzstreifen oder Kartenblätter zum Laminieren.

Es ist kein Chatbot. Es ist für Eltern, Lehrkräfte und Therapeut:innen gedacht, die
mit einem nicht sprechenden Kind arbeiten und oft dutzende Zeilen am Stück
übersetzen — zum Beispiel ein ganzes Bilderbuch.

**bildhaft läuft vollständig im Browser.** Kein Server, keine Datenbank, keine
Konten, keine API-Schlüssel, kein Tracking. Sätze, Sammlungen und
METACOM-Dateien verlassen den eigenen Rechner nie. Das Einzige, was ihn verlässt,
ist ein einzelnes Wort: es geht an ARASAAC, wenn dort ein passendes Piktogramm
gesucht wird. Die Antworten werden zwischengespeichert — das ist zuerst eine Frage
des Datenschutzes und erst dann eine der Geschwindigkeit: Wer dasselbe Bilderbuch
über Wochen bearbeitet, schickt ein Wort einmal statt bei jedem Öffnen erneut.
Nach 30 Tagen läuft die gespeicherte Antwort ab; wird das Wort danach wieder
gebraucht, geht es noch einmal an ARASAAC. Die Bilddateien selbst werden einmal
geladen und dann behalten, ohne Ablauf.

> Die Oberfläche ist deutsch, weil das die Sprache der Menschen ist, für die
> bildhaft gebaut ist. Code und Dokumentation sind englisch.

---

## Symbole und Lizenzen

> **Dieses Repository enthält keine Symbole.** Weder ARASAAC- noch
> METACOM-Grafiken sind hier eingecheckt, und es werden auch keine
> mitausgeliefert.

### ARASAAC (Voreinstellung)

Rund 13.000 Piktogramme mit deutschen Bezeichnungen, zur Laufzeit über die
öffentliche REST-API von [arasaac.org](https://arasaac.org) geladen und im Browser
zwischengespeichert.

ARASAAC steht unter **CC BY-NC-SA**. Die Namensnennung ist verpflichtend und
erscheint deshalb in der Fußzeile der Anwendung *und* auf jedem Ausdruck:

> Piktogramme: ARASAAC (arasaac.org), CC BY-NC-SA.
> Autor: Sergio Palao. Urheber: Regierung von Aragón (Spanien).

Nicht-kommerziell heißt: Material, das mit ARASAAC-Symbolen entsteht, darf nicht
kommerziell verwertet werden.

### METACOM (optional)

METACOM ist eine **kommerzielle Symbolsammlung mit personengebundener Lizenz.**

bildhaft geht damit so um:

- Es liefert **keine** METACOM-Datei mit und lädt **keine** herunter.
- Es überträgt **keine** METACOM-Datei — nirgendwohin.
- Wer METACOM besitzt, wählt **den eigenen, lizenzierten Ordner** auf der eigenen
  Festplatte aus. Lesen, Indizieren, Zuordnen und Anzeigen passiert ausschließlich
  lokal im Browser.
- Auch nichts *Abgeleitetes* verlässt den Browser — nicht einmal ein
  Dateinamen-Index.

Ohne eigene METACOM-Lizenz ist diese Funktion schlicht nicht nutzbar. Das ist
Absicht.

Beide Symbolquellen und die Regeln von oben liegen in
[bildquelle](https://github.com/Lautstark/bildquelle) — einem kleinen Paket, das
sich bildhaft mit [vorlaut](https://github.com/Lautstark/vorlaut) teilt. So steht
die METACOM-Regel an einer Stelle, wird dort durchgesetzt und dort getestet,
statt einmal pro Anwendung.

### Warum das architektonisch sicher ist

Gespeichert werden **Symbol-Verweise, keine Bilder.** Ein gespeicherter Satz ist
eine Liste von Konzept-Schlüsseln plus den Auswahlentscheidungen der Nutzerin.
Erst beim Anzeigen werden diese Verweise gegen die gerade aktive Symbolquelle
aufgelöst.

Damit ist eine METACOM-Tafel *konstruktionsbedingt* nicht als Pixel speicherbar.
Ein angenehmer Nebeneffekt: derselbe geteilte Satz erscheint bei jemandem ohne
Lizenz in ARASAAC und bei jemandem mit Lizenz in METACOM.

Eine serverseitige Bilderzeugung, ein Upload oder ein „Tafel als Bild teilen“ darf
es in bildhaft deshalb nie geben.

---

## Funktionsweise

### Zuordnung (rein lexikalisch, im Browser)

Die Pipeline ist bewusst flach — kein Parser, kein Sprachmodell. Gute Abdeckung bei
einfacher, konkreter Sprache ist das Ziel; **den Rest korrigiert der Mensch in der
Oberfläche.**

1. **Persönliches Wörterbuch** — wird *zuerst* geprüft. Jede manuelle Korrektur
   wird als `Wort → Symbol` gemerkt und für immer wiederverwendet. Nach ein paar
   Wochen echter Nutzung schlägt das die gesamte übrige Pipeline, weil der
   Arbeitswortschatz einer Familie ein paar hundert Wörter umfasst.
2. **Tokenisierung** inklusive Auflösung von Verschmelzungen (`im` → `in` + `dem`),
   damit die bedeutungstragende Präposition ihr eigenes Feld behält.
3. **Funktionswörter** filtern. AAC-Sequenzen sind telegrafisch. Artikel und
   Hilfsverben bekommen kein Feld; Pronomen, Präpositionen und Modalverben schon.
   Die Liste ist Daten, nicht Code, und in der Anwendung editierbar.
4. **Grundformen** über ein mitgeliefertes Lexikon, nach Wortart getrennt, damit die
   deutsche Großschreibung disambiguieren kann (`Bad` ≠ `bad`, `Morgen` ≠ `morgen`).
   Für Unbekanntes greifen Suffix- und Umlautregeln.
5. **Trennbare Verben** wieder zusammensetzen: `räum bitte auf` → `aufräumen`.
6. **Komposita** zerlegen, wenn nichts gefunden wird: `Apfelsaft` → `Apfel` + `Saft`,
   `Zahnbürste` → `Zahn` + `Bürste`.
7. **Synonyme** als letzte Rückfallebene: `Fahrrad` → `Rad`.

Ein Wort ohne Treffer wird **nie stillschweigend verworfen** — es bekommt ein leeres
Feld, das man anklicken und von Hand belegen kann.

### Korrigieren

Was erzeugt wird, gilt als übernommen — es gibt keinen Bestätigungsschritt. Jede
Zeile lässt sich direkt bearbeiten:

- **Symbol tauschen**: auf ein Feld klicken, Vorschlag wählen oder selbst suchen.
- **Feld entfernen**: im selben Dialog.
- **Feld hinzufügen**: das `+` am Ende der Reihe.
- **Umsortieren**: Felder mit der Maus ziehen, oder mit `Alt` + `←` / `→`.
- **Symbol durchstreichen**: im selben Dialog. METACOMs Konvention für die
  Verneinung — „nicht hauen“ ist das *hauen*-Symbol mit einem roten Kreuz darüber,
  kein anderes Bild. Es gehört zum Feld, übersteht also den Wechsel der
  Symbolquelle und reist im Export mit.

### Datenmodell

Die Einheit der Wiederverwendung ist **der Satz, nicht die Sammlung.** Wer ein Buch
überträgt, hilft der nächsten Person mit der einzelnen Zeile.

Sätze sind eigenständige Einträge mit `normalizedInput` als Schlüssel. Sammlungen
sind eine Gruppierung darüber und tragen einen frei wählbaren Namen (etwa „Der
Grüffelo“). Daraus ergibt sich kostenlos: „diesen Satz hast du schon übersetzt“ und
eine flache Suche über alles Bisherige.

Eine Sammlung kann außerdem festhalten, **womit sie gezeichnet wird** — über das
Menü `⋯` neben ihrem Namen. Ohne eigene Wahl folgt sie der Standardquelle aus den
Einstellungen, auch wenn die sich später ändert. Das ist eine Anzeige-Einstellung
und keine inhaltliche: gespeichert bleiben Verweise, und eine einzeln exportierte
Sammlung nimmt sie nicht mit, damit die Datei bei jeder Empfängerin in deren
eigener Symbolsammlung aufgeht.

Gespeichert wird in **IndexedDB**, automatisch bei jeder Änderung. Es gibt keinen
Speichern-Knopf.

### Sicherung

Auf einer statischen Seite ist der **JSON-Export** die einzige Sicherung. Wer den
Browser-Speicher leert, verliert sonst seine Arbeit.

- **Eine einzelne Sammlung**: über das Menü `⋯` neben ihrem Namen.
- **Alles auf einmal** — jede Sammlung plus das persönliche Wörterbuch:
  *Einstellungen → Daten → Alles exportieren*.

Importieren legt immer **neue** Sammlungen an und kann Vorhandenes nie
überschreiben. Ältere Exportdateien werden weiterhin gelesen.

Weil nur Verweise gespeichert werden, sind diese Dateien frei weitergebbar —
unabhängig davon, wer welche Symbolsammlung besitzt.

### Drucken

Gedruckt wird über den **Browser-Druck** mit einem Druck-Stylesheet: echte
Vektorausgabe, korrekte Papierformate, die eigenen Druckereinstellungen. Kein
`html2canvas`, kein Rastern — unscharfe Symbole sind bei einer Kommunikationstafel
genau das Falsche.

Weil der Browser-Druckdialog zu spät im Ablauf kommt, gibt es eine **eingebaute
A4-Vorschau**, die exakt das Raster zeigt, das gedruckt wird.

Einstellbar ist, was in der Praxis zählt:

- **Layout**: *Satzstreifen* (eine Reihe, Leserichtung) oder *Kartenblatt*
  (einzelne Karten zum Ausschneiden).
- **Papier**: A5, A4 oder A3, hoch oder quer. Tafeln sind fast immer quer;
  A5 passt für Kommunikationsbücher und -fächer, A3 für eine Wandtafel.
- **Kartengröße**, beim Kartenblatt, auf zwei Arten:
  - *in Millimetern* — Leute gleichen bestehende Tafeln ab; ein MetaTalk-3×5-Raster
    hat eine bestimmte Zellgröße;
  - *als Raster* — `4 × 3` angeben, und die Karten teilen die Seite genau auf. So
    wird eine Tafel beschrieben, und nur so füllt sie die Seite absichtlich. Die
    Seiten werden hier umbrochen und nicht dem Browser überlassen, damit dieselbe
    Tafel zweimal gedruckt dieselben Reihen auf denselben Blättern ergibt.
- **Schneiderand** — Laminierfolien brauchen eine dichte Kante; bündig geschnittene
  Karten lösen sich auf.
- **Rahmen und Hintergrundfarbe** — ein Rahmen mit Dicke, Farbe und Eckenradius
  sowie eine Farbe hinter dem Symbol, damit ein Ausdruck zum Material passt, das
  ein Kind schon hat. Gezeichnet wird *innerhalb* des Schneiderands: die Kante der
  Karte ist die Schnittkante. Standardmäßig aus, und wenn aus, wird gar nichts
  gezeichnet — eine Karte ohne Rahmen ist exakt so groß wie eh und je.
- **Beschriftung** an/aus, über oder unter dem Symbol.
- **Ein Satz pro Seite** oder fortlaufend.
- **Copyright-Hinweis** (nur METACOM) — `METACOM Symbole © Annette Kitzinger` am
  Seitenfuß. METACOMs Nutzungsbedingungen verlangen ihn bei Weitergabe und
  Veröffentlichung (A.6.2, A.7.2), für den eigenen Gebrauch nicht — deshalb eine
  Wahl und nichts Automatisches. ARASAACs Nachweis ist bedingungslos und wird
  immer gedruckt.

Gedruckt wird eine einzelne Zeile oder die ganze Sammlung.

---

## Entwicklung

```bash
npm install
npm run dev
```

```bash
npm run build
```

Das Lexikon wird aus kompakten Wortlisten erzeugt. Nach Änderungen an
`scripts/lexicon-seeds.mjs`:

```bash
node scripts/build-lexicon.mjs
```

Die erzeugten JSON-Dateien unter `src/data/` sind eingecheckt, damit der Build
keinen Codegenerierungs-Schritt braucht.

### Git-Hooks

`npm install` setzt `core.hooksPath` auf `.githooks/`, damit die Hooks dort ab
der ersten Installation greifen. Es gibt einen: `commit-msg` entfernt den
`Co-Authored-By`-Trailer, den Agent-Sitzungen standardmäßig anhängen und den
kein Commit dieser Historie trägt. Er erkennt die anthropic.com-Adresse statt
des Namens, sodass eine menschliche Mitautorin im selben Commit erhalten bleibt.

Wer aus einem nie installierten Klon committet, hat den Hook nicht aktiv. Ohne
vollständige Installation genügt:

```bash
git config core.hooksPath .githooks
```

### Abdeckung des Lexikons messen

```bash
node scripts/coverage.mjs --verbose
```

Zeigt, welchen Anteil der bedeutungstragenden Wörter aus `scripts/corpus.de.txt`
das Lexikon direkt kennt, und listet die übrigen auf. Der Textkorpus besteht
bewusst aus dem, was Leute wirklich eintippen: Alltag, Therapiesätze und Zeilen
aus Bilderbüchern. `--verbose` nennt die Lücken — so entscheidet man, was als
Nächstes dazugehört.

Die Zahl gilt für einen Korpus, mit dem der Wortschatz ausgewählt wurde; sie ist
eine Untergrenze, keine Note. Wer eine Änderung beurteilen will, schreibt neue
Sätze, die nicht in die Auswahl eingeflossen sind.

### Tests

```bash
npm run test:e2e
```

End-to-End-Tests laufen mit Playwright gegen das echte Produktions-Bundle und
decken die wichtigen Pfade ab: einen Satz übersetzen, ein Symbol korrigieren und
die Korrektur wiederverwenden, Felder hinzufügen/entfernen/umsortieren,
Persistenz nach dem Neuladen, Druckgeometrie in Millimetern, Export ohne
Bilddaten und die mobile Navigation.

ARASAAC wird dabei simuliert. Die Tests müssen zuverlässig genug sein, um einen
Deploy abzusichern, und sollen einen kostenlosen öffentlichen Dienst nicht bei
jedem Push belasten. Der Preis: eine Änderung an der echten API würde hier nicht
auffallen.

Die CI führt die Tests bei jedem Push und Pull Request aus. **GitHub Pages wird
nur veröffentlicht, wenn sie bestehen.**

### Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/core/` | Zuordnungs-Pipeline und Datenmodell, frei von UI |
| `src/db/` | IndexedDB-Schema, Repository, Export/Import |
| `src/ui/` | Oberfläche, Dialoge und die Element-Helfer dahinter |
| `src/data/` | Erzeugte Lexikondaten |
| `scripts/` | Lexikon-Generator und seine Wortlisten |

Zwei Dinge liegen außerhalb dieses Repositorys, beide auf ein genaues
Release-Tag gepinnt, damit ein Install den Build nicht von selbst verschiebt:
[bildquelle](https://github.com/Lautstark/bildquelle) für die Symbolquellen und
[design](https://github.com/Lautstark/design) für Tokens und Komponenten, die
sich die Geschwisterprodukte teilen.

### Technische Rahmenbedingungen

- Statisches Bundle, ausgeliefert über GitHub Pages. Kein serverseitiger Code.
- Kein UI-Framework. Die Oberfläche entsteht in reinem TypeScript direkt im DOM
  (`src/ui/dom.ts`) — ein Framework hat hier nur noch Elemente erzeugt.
- SPA-Routing über die `404.html`-Kopie, weil GitHub Pages keine Rewrites kann.
- **Kein Code, der `SharedArrayBuffer` braucht.** GitHub Pages kann die
  COOP/COEP-Header nicht setzen. Deshalb in v1 **keine** Transformer- oder
  ONNX-Modelle im Browser; die Zuordnung ist lexikalisch.
- Desktop ist das primäre Ziel. Die Ordnerauswahl auf Mobilgeräten funktioniert
  erwartungsgemäß nicht.
- **Die Oberfläche ist ausschließlich deutsch, und das ist eine Entscheidung und
  keine Lücke.** Es gibt kein `t()`, keine Sprachdateien und keine Sprachumschaltung;
  jeder Text steht dort, wo er verwendet wird. bildhaft übersetzt *deutsche* Sätze
  in Piktogramme — Lemmatisierung, Komposita-Zerlegung, die Zusammenführung
  trennbarer Verben und die Funktionswortliste sind sämtlich deutschspezifisch. Eine
  englische Oberfläche wäre die Fassade eines Programms, das weiterhin nur Deutsch
  versteht, und verspräche damit etwas, das der Rest der Anwendung nicht hält. Die
  Oberfläche zu übersetzen ist der letzte Schritt einer zweiten Sprache, nicht der
  erste.

  Erwähnenswert, weil die beiden Schwesterprodukte es anders halten: mitreden und
  vorlaut führen beide de/en-Tabellen und eine Umschaltung zur Laufzeit. Von außen
  sieht das hier deshalb nach einem Versäumnis aus und ist auch schon so gelesen
  worden. Sollte bildhaft je eine zweite Eingabesprache bekommen, ist mitredens
  `src/i18n/` die Vorlage; bis dahin ist die Oberfläche allein zu übersetzen keine
  Verbesserung.

### Browser-Unterstützung für METACOM

| Browser | Ordnerauswahl | Merkt sich die Auswahl |
| --- | --- | --- |
| Chrome / Edge | `showDirectoryPicker()` | ja, einmalig |
| Firefox / Safari | `<input webkitdirectory>` | nein, bis zum Neuladen |
| alle | ZIP-Datei, im Browser entpackt | nein |

---

## Bewusst nicht enthalten (v1)

Backend, Datenbank, Benutzerkonten · öffentliche Bibliothek fremder Sammlungen ·
LLM-gestützte Disambiguierung · Embedding-Modelle im Browser · `pdf-lib`-Export ·
mobile Optimierung · hochgeladene eigene Bilder.

## Verwandt

[mitreden](https://github.com/Lautstark/mitreden) ist ein Schwesterprojekt: Satz
eintippen, Audiodatei zurückbekommen, damit alle Geräte mit derselben Stimme
sprechen. Gleiches Sprechblasen-Zeichen, in Pink.

## Lizenz

Quellcode: [MIT](LICENSE). Symbole: siehe oben — sie gehören nicht dazu.
