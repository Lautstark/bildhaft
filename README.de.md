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
Konten, keine API-Schlüssel, kein Tracking. Nichts verlässt den eigenen Rechner.

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

### Datenmodell

Die Einheit der Wiederverwendung ist **der Satz, nicht die Sammlung.** Wer ein Buch
überträgt, hilft der nächsten Person mit der einzelnen Zeile.

Sätze sind eigenständige Einträge mit `normalizedInput` als Schlüssel. Sammlungen
sind nur eine Gruppierung darüber und tragen einen frei wählbaren Namen (etwa „Der
Grüffelo“). Daraus ergibt sich kostenlos: „diesen Satz hast du schon übersetzt“ und
eine flache Suche über alles Bisherige.

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

- **Symbolgröße in Millimetern** — Leute gleichen bestehende Tafeln ab; ein
  MetaTalk-3×5-Raster hat eine bestimmte Zellgröße.
- **Schneiderand** — Laminierfolien brauchen eine dichte Kante; bündig geschnittene
  Karten lösen sich auf.
- **Beschriftung** an/aus, über oder unter dem Symbol.
- **Layout**: *Satzstreifen* (eine Reihe, Leserichtung) oder *Kartenblatt* (Raster
  einzelner Karten zum Ausschneiden).
- **Ein Satz pro Seite** oder fortlaufend.

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
| `src/ui/` | React-Komponenten |
| `src/data/` | Erzeugte Lexikondaten |
| `scripts/` | Lexikon-Generator und seine Wortlisten |

Die Symbolquellen liegen nicht in diesem Repository. Sie kommen aus
[bildquelle](https://github.com/Lautstark/bildquelle), auf einen Commit gepinnt.

### Technische Rahmenbedingungen

- Statisches Bundle, ausgeliefert über GitHub Pages. Kein serverseitiger Code.
- SPA-Routing über die `404.html`-Kopie, weil GitHub Pages keine Rewrites kann.
- **Kein Code, der `SharedArrayBuffer` braucht.** GitHub Pages kann die
  COOP/COEP-Header nicht setzen. Deshalb in v1 **keine** Transformer- oder
  ONNX-Modelle im Browser; die Zuordnung ist lexikalisch.
- Desktop ist das primäre Ziel. Die Ordnerauswahl auf Mobilgeräten funktioniert
  erwartungsgemäß nicht.

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

[mitreden](https://github.com/SteffiPeTaffy/mitreden) ist ein Schwesterprojekt: Satz
eintippen, Audiodatei zurückbekommen, damit alle Geräte mit derselben Stimme
sprechen. Gleiches Sprechblasen-Zeichen, in Pink.

## Lizenz

Quellcode: [MIT](LICENSE). Symbole: siehe oben — sie gehören nicht dazu.
