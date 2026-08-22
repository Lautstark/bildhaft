import { Dialog } from './Dialog.tsx';

/**
 * Die Pflichtinformationen nach Art. 13 DSGVO. Der Text kommt ohne Baukasten-
 * Floskeln aus, weil hier fast nichts passiert: es gibt keinen Server, auf dem
 * etwas landen könnte. Genannt werden muss trotzdem, was der Hoster protokolliert
 * und dass eine ARASAAC-Anfrage die IP-Adresse mitnimmt.
 */

const EMAIL = 'lautstark@grewenig.online';

export function Datenschutz({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Datenschutz" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        bildhaft läuft vollständig in deinem Browser. Es gibt keinen Server, keine
        Konten, keine Auswertung und keine Werbung. Deine Sätze, deine Sammlungen
        und deine METACOM-Dateien verlassen deinen Rechner nicht — ich kann sie
        nicht sehen, auch nicht auf Nachfrage.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Verantwortliche</h3>
      <p style={{ margin: 0 }}>
        Stefanie Grewenig, Talheide 5, 21149 Hamburg, Deutschland
        <br />
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Hosting und Server-Logs</h3>
      <p style={{ margin: 0 }}>
        Die Seite wird von GitHub Pages ausgeliefert (GitHub, Inc., 88 Colin P.
        Kelly Jr. Street, San Francisco, CA 94107, USA). Beim Abruf verarbeitet
        GitHub technisch notwendige Zugriffsdaten, darunter deine IP-Adresse,
        Zeitpunkt, aufgerufene Datei und Browserkennung. Ich habe darauf keinen
        Zugriff und erhalte keine Statistiken. Rechtsgrundlage ist Art. 6 Abs. 1
        lit. f DSGVO — das berechtigte Interesse, die Seite überhaupt ausliefern
        zu können. Die Übermittlung in die USA stützt sich auf das EU-US Data
        Privacy Framework, unter dem GitHub zertifiziert ist.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Anfragen an ARASAAC</h3>
      <p style={{ margin: 0 }}>
        Wird ein Piktogramm gesucht, schickt dein Browser ein einzelnes Wort an
        die öffentliche Schnittstelle von{' '}
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a>{' '}
        (Regierung von Aragón, Spanien). Dabei wird technisch bedingt deine
        IP-Adresse übertragen. Ganze Sätze werden nicht übertragen. Antworten und
        Bilder werden im Browser zwischengespeichert, ein Wort geht also einmal
        hinaus statt bei jedem Öffnen; nach 30 Tagen kann es erneut angefragt
        werden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — ohne diese
        Anfrage gibt es keine Symbole. Spanien liegt in der EU, es findet keine
        Drittlandübermittlung statt.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Speicherung auf deinem Gerät</h3>
      <p style={{ margin: 0 }}>
        Deine Sammlungen, Sätze, Wörterbuch-Korrekturen, Einstellungen, die
        zwischengespeicherten Symbole und die Verknüpfung zu deinem
        METACOM-Ordner liegen in der lokalen Datenbank deines Browsers
        (IndexedDB). Sie bleiben dort, bis du sie löschst — unter
        „Einstellungen → Alle Daten löschen“ oder über die Browserfunktion zum
        Löschen von Websitedaten. Diese Speicherung ist für die von dir
        ausdrücklich gewünschte Funktion unbedingt erforderlich und daher nach
        § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei. Deshalb gibt es hier auch
        kein Cookie-Banner: es gibt nichts, wofür eines nötig wäre.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Was nicht stattfindet</h3>
      <p style={{ margin: 0 }}>
        Keine Analyse- oder Trackingdienste, keine Werbenetzwerke, keine
        Social-Media-Plugins, keine Schriftarten von fremden Servern, keine
        Weitergabe von Daten an Dritte, keine automatisierte Entscheidungsfindung
        oder Profilbildung.
      </p>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Deine Rechte</h3>
      <p style={{ margin: 0 }}>
        Dir stehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16),
        Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO) zu. Da mir
        keine personenbezogenen Daten von dir vorliegen, wird eine Auskunft in
        der Regel ergebnislos bleiben. Beschweren kannst du dich bei jeder
        Aufsichtsbehörde, für mich zuständig ist der Hamburgische Beauftragte für
        Datenschutz und Informationsfreiheit.
      </p>

      <p style={{ margin: '18px 0 0', color: 'var(--text-faint)' }}>Stand: August 2026</p>
    </Dialog>
  );
}
