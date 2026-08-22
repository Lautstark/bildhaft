import { useEffect, useState } from 'react';

/** Reactive media query. Used to give mobile its own navigation behaviour. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Matches the `max-width: 820px` breakpoint used throughout the stylesheet. */
export const MOBILE_QUERY = '(max-width: 820px)';
