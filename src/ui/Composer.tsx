import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Sentence } from '../core/types.ts';

/** Past this the box scrolls instead of growing. */
const MAX_INPUT_HEIGHT = 190;

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h13M12 5l7 7-7 7" />
    </svg>
  );
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** A previous translation of the same line, offered for reuse. */
  reuse: Sentence | null;
  onReuse: () => void;
  providerName: string;
  providerReady: boolean;
}

export function Composer({
  value, onChange, onSubmit, busy, reuse, onReuse, providerName, providerReady,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focused on load: typing is the entire interaction. Skipped on touch devices,
  // where it would immediately open the on-screen keyboard and shrink the viewport.
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    ref.current?.focus();
  }, []);

  /*
   * Grow with the content instead of scrolling inside a fixed box.
   *
   * Collapsing to 0 first makes the measurement deterministic — reading back
   * 'auto' can report the previous used height within the same frame. The
   * viewport guard matters because a page mounted in a background tab measures
   * against a zero-height viewport and would otherwise lock the box open at its
   * maximum height for the rest of the session.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const grow = () => {
      if (window.innerHeight === 0 || document.visibilityState === 'hidden') return;
      el.style.height = '0px';
      el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    };

    grow();
    document.fonts?.ready.then(grow).catch(() => undefined);

    // Re-measure when the box becomes measurable or its width changes.
    document.addEventListener('visibilitychange', grow);
    window.addEventListener('resize', grow);
    return () => {
      document.removeEventListener('visibilitychange', grow);
      window.removeEventListener('resize', grow);
    };
  }, [value]);

  return (
    <div className="composer">
      <div className="composer__box">
        <textarea
          ref={ref}
          className="composer__input"
          rows={1}
          value={value}
          placeholder="Satz eingeben, z. B. „Ich möchte einen Apfel essen“"
          aria-label="Satz eingeben"
          spellCheck
          lang="de"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="button"
          className="btn btn--primary composer__go"
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          aria-label="Übersetzen"
          title="Übersetzen"
        >
          {busy ? <span className="spinner" /> : <ArrowIcon />}
        </button>
      </div>

      <div className="composer__meta">
        <span><kbd>Enter</kbd> übersetzt · <kbd>Shift</kbd>+<kbd>Enter</kbd> neue Zeile</span>
        <span>
          Symbole: {providerName}
          {!providerReady && ' (nicht bereit)'}
        </span>
      </div>

      {reuse && (
        <div className="composer__reuse">
          <span style={{ flex: 1 }}>Diesen Satz hast du schon übersetzt.</span>
          <button type="button" className="btn btn--sm" onClick={onReuse}>
            Übernehmen
          </button>
        </div>
      )}
    </div>
  );
}
