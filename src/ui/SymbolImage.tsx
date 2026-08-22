import { useEffect, useState } from 'react';
import type { ProviderId } from '../core/types.ts';
import { useSymbolUrl } from './useSymbolUrl.ts';

interface Props {
  provider: ProviderId;
  id: string | null | undefined;
  /** Reports an unreadable symbol so the app can explain a whole row of them. */
  onUnreadable?: (id: string) => void;
  /** Only used as a tooltip. See the note on alt below. */
  alt: string;
  placeholder?: string;
}

export function SymbolImage({ provider, id, alt, placeholder = '+', onUnreadable }: Props) {
  const { url, state, retry } = useSymbolUrl(provider, id);
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [url]);

  // 'error' means resolution gave up; a broken <img> means the source lied.
  // Either way the symbol is unreadable and the app should be able to say so.
  useEffect(() => {
    if (id && (state === 'error' || broken)) onUnreadable?.(id);
  }, [id, state, broken, onUnreadable]);

  if (state === 'empty') return <span className="slot__blank" aria-hidden="true">{placeholder}</span>;
  if (state === 'loading') return <span className="slot__blank" aria-hidden="true"><span className="spinner" /></span>;

  if (state === 'error' || broken || !url) {
    return (
      <span
        className="slot__blank slot__blank--error"
        role="button"
        tabIndex={0}
        title="Symbol konnte nicht geladen werden. Zum erneuten Versuch klicken."
        onClick={(e) => { e.stopPropagation(); setBroken(false); retry(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setBroken(false);
            retry();
          }
        }}
      >
        ↻
      </span>
    );
  }

  return (
    <img
      src={url}
      /*
       * Deliberately empty. Every symbol already sits next to a visible text label,
       * so alt text would be announced twice by a screen reader — and, worse, a
       * failed image paints its alt text inside the picture box, making the word
       * appear both "in" the symbol and underneath it.
       */
      alt=""
      title={alt}
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}
