import { el } from './dom.ts';
import { openDialog } from './dialog.ts';

const REPO = 'https://github.com/Lautstark/bildhaft';
const ORG = 'https://github.com/Lautstark';
const MITREDEN = 'https://lautstark.github.io/mitreden/';
const ISSUES = 'https://github.com/Lautstark/bildhaft/issues';

/** The one line to change if a different address should be public. */
const EMAIL = 'lautstark@grewenig.online';

/** Every external link in these pages opens in a new tab and tells the browser so. */
const ext = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noreferrer noopener">${text}</a>`;

const h3 = (text: string, first = false) =>
  `<h3 style="font-size:14px;margin:${first ? '0' : '18px'} 0 6px">${text}</h3>`;

function page(title: string, html: string, onClose: () => void): void {
  openDialog({ title, body: [el('div', { html })], onClose });
}

/**
 * What the footer used to try to say in five words. It has room here to be
 * accurate about the one thing that does leave the browser, which the old
 * footer line quietly rounded off.
 */
export function openAbout(onClose: () => void): void {
  page('Was ist bildhaft?', `
    <p style="margin-top:0">
      bildhaft macht aus getippten Sätzen Reihen von Symbolen, die man korrigieren
      und ausdrucken kann — für Satzstreifen und Karten zum Laminieren. Gedacht für
      Eltern, Lehrkräfte und Therapeut:innen, die mit einem nicht sprechenden Kind
      arbeiten.
    </p>
    ${h3('Was den Rechner verlässt')}
    <p style="margin:0">
      Deine Sätze, deine Sammlungen und deine METACOM-Dateien bleiben hier. Das
      Einzige, was hinausgeht, ist ein einzelnes Wort an ARASAAC, wenn dort ein
      Piktogramm gesucht wird. Antworten werden gespeichert, ein Wort geht also
      einmal statt bei jedem Öffnen. Es gibt keinen Server, keine Konten und keine
      Auswertung.
    </p>
    ${h3('Symbole')}
    <p style="margin:0">
      Die Piktogramme stammen von ${ext('https://arasaac.org', 'ARASAAC')} und stehen
      unter CC BY-NC-SA — Material daraus darf nicht kommerziell verwertet werden.
      METACOM ist lizenzpflichtig: bildhaft liefert keine METACOM-Symbole mit,
      sondern liest deinen eigenen, lizenzierten Ordner.
    </p>
    ${h3('Quellcode und Schwesterprojekt')}
    <p style="margin:0">
      bildhaft ist quelloffen (MIT): ${ext(REPO, 'github.com/Lautstark/bildhaft')}.
      Die übrigen Werkzeuge liegen unter ${ext(ORG, 'Lautstark')}.
      ${ext(MITREDEN, 'mitreden')} ist das Schwesterprojekt: Satz eintippen,
      Audiodatei zurückbekommen, damit alle Geräte mit derselben Stimme sprechen.
    </p>
  `, onClose);
}

/**
 * Pflichtangaben nach § 5 DDG. bildhaft ist kein Gewerbe, also keine
 * Registereintragung und keine Umsatzsteuer-ID — Name, Anschrift und zwei
 * Wege, jemanden direkt zu erreichen, sind hier alles, was verlangt ist.
 */
export function openImpressum(onClose: () => void): void {
  page('Impressum', `
    ${h3('Angaben gemäß § 5 DDG', true)}
    <p style="margin:0">
      Stefanie Grewenig<br>Talheide 5<br>21149 Hamburg<br>Deutschland
    </p>
    ${h3('Kontakt')}
    <p style="margin:0">
      E-Mail: <a href="mailto:${EMAIL}">${EMAIL}</a><br>
      Fehler und Fragen auch öffentlich:
      ${ext(ISSUES, 'github.com/Lautstark/bildhaft/issues')}
    </p>
    ${h3('Verantwortlich für den Inhalt')}
    <p style="margin:0">Stefanie Grewenig, Anschrift wie oben.</p>
    ${h3('Piktogramme und Quellcode')}
    <p style="margin:0">
      bildhaft ist ein privates, nicht kommerzielles Projekt. Der Quellcode steht
      unter der MIT-Lizenz. Die Piktogramme stammen von
      ${ext('https://arasaac.org', 'ARASAAC')} (CC BY-NC-SA, Autor: Sergio Palao,
      Urheber: Regierung von Aragón) und sind nicht Teil dieser Software.
      METACOM-Symbole werden weder mitgeliefert noch übertragen.
    </p>
    ${h3('Haftung für Links')}
    <p style="margin:0">
      Für die Inhalte verlinkter externer Seiten sind deren Betreiber
      verantwortlich. Zum Zeitpunkt der Verlinkung waren dort keine Rechtsverstöße
      erkennbar.
    </p>
    ${h3('Streitbeilegung')}
    <p style="margin:0">
      Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
      Verbraucherschlichtungsstelle bin ich weder verpflichtet noch bereit.
    </p>
  `, onClose);
}

/**
 * Die Pflichtinformationen nach Art. 13 DSGVO. Der Text kommt ohne Baukasten-
 * Floskeln aus, weil hier fast nichts passiert: es gibt keinen Server, auf dem
 * etwas landen könnte. Genannt werden muss trotzdem, was der Hoster protokolliert
 * und dass eine ARASAAC-Anfrage die IP-Adresse mitnimmt.
 */
export function openDatenschutz(onClose: () => void): void {
  page('Datenschutz', `
    <p style="margin-top:0">
      bildhaft läuft vollständig in deinem Browser. Es gibt keinen Server, keine
      Konten, keine Auswertung und keine Werbung. Deine Sätze, deine Sammlungen und
      deine METACOM-Dateien verlassen deinen Rechner nicht — ich kann sie nicht
      sehen, auch nicht auf Nachfrage.
    </p>
    ${h3('Verantwortliche')}
    <p style="margin:0">
      Stefanie Grewenig, Talheide 5, 21149 Hamburg, Deutschland<br>
      <a href="mailto:${EMAIL}">${EMAIL}</a>
    </p>
    ${h3('Hosting und Server-Logs')}
    <p style="margin:0">
      Die Seite wird von GitHub Pages ausgeliefert (GitHub, Inc., 88 Colin P. Kelly
      Jr. Street, San Francisco, CA 94107, USA). Beim Abruf verarbeitet GitHub
      technisch notwendige Zugriffsdaten, darunter deine IP-Adresse, Zeitpunkt,
      aufgerufene Datei und Browserkennung. Ich habe darauf keinen Zugriff und
      erhalte keine Statistiken. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO —
      das berechtigte Interesse, die Seite überhaupt ausliefern zu können. Die
      Übermittlung in die USA stützt sich auf das EU-US Data Privacy Framework,
      unter dem GitHub zertifiziert ist.
    </p>
    ${h3('Anfragen an ARASAAC')}
    <p style="margin:0">
      Wird ein Piktogramm gesucht, schickt dein Browser ein einzelnes Wort an die
      öffentliche Schnittstelle von ${ext('https://arasaac.org', 'arasaac.org')}
      (Regierung von Aragón, Spanien). Dabei wird technisch bedingt deine
      IP-Adresse übertragen. Ganze Sätze werden nicht übertragen. Antworten und
      Bilder werden im Browser zwischengespeichert, ein Wort geht also einmal
      hinaus statt bei jedem Öffnen; nach 30 Tagen kann es erneut angefragt werden.
      Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — ohne diese Anfrage gibt es
      keine Symbole. Spanien liegt in der EU, es findet keine Drittlandübermittlung
      statt.
    </p>
    ${h3('Speicherung auf deinem Gerät')}
    <p style="margin:0">
      Deine Sammlungen, Sätze, Wörterbuch-Korrekturen, Einstellungen, die
      zwischengespeicherten Symbole und die Verknüpfung zu deinem METACOM-Ordner
      liegen in der lokalen Datenbank deines Browsers (IndexedDB). Sie bleiben
      dort, bis du sie löschst — unter „Einstellungen → Alle Daten löschen“ oder
      über die Browserfunktion zum Löschen von Websitedaten. Diese Speicherung ist
      für die von dir ausdrücklich gewünschte Funktion unbedingt erforderlich und
      daher nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei. Deshalb gibt es hier
      auch kein Cookie-Banner: es gibt nichts, wofür eines nötig wäre.
    </p>
    ${h3('Was nicht stattfindet')}
    <p style="margin:0">
      Keine Analyse- oder Trackingdienste, keine Werbenetzwerke, keine
      Social-Media-Plugins, keine Schriftarten von fremden Servern, keine Weitergabe
      von Daten an Dritte, keine automatisierte Entscheidungsfindung oder
      Profilbildung.
    </p>
    ${h3('Deine Rechte')}
    <p style="margin:0">
      Dir stehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
      (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
      (Art. 20) und Widerspruch (Art. 21 DSGVO) zu. Da mir keine personenbezogenen
      Daten von dir vorliegen, wird eine Auskunft in der Regel ergebnislos bleiben.
      Beschweren kannst du dich bei jeder Aufsichtsbehörde, für mich zuständig ist
      der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit.
    </p>
    <p style="margin:18px 0 0;color:var(--text-faint)">Stand: August 2026</p>
  `, onClose);
}
