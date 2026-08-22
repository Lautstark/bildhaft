export function Footer({ attribution }: { attribution: string | null }) {
  return (
    <footer className="footer">
      {/* Attribution is required by the ARASAAC licence — compact, but never hidden. */}
      {attribution && <p style={{ margin: 0 }}>{attribution}</p>}
      <p style={{ margin: 0 }}>
        Läuft vollständig im Browser.{' '}
        <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener">arasaac.org</a>
      </p>
    </footer>
  );
}
