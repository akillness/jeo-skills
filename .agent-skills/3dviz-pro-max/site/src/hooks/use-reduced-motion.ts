// True when the reader asked the operating system for less motion. One subscription shared by the
// hover clips, the count-up figures and the origin recording (the CSS escape hatch in app.css
// covers transitions; this hook covers the things JavaScript starts).
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

let media: MediaQueryList | undefined;
const query = (): MediaQueryList => (media ??= window.matchMedia(QUERY));

function subscribe(onStoreChange: () => void): () => void {
  const list = query();
  list.addEventListener('change', onStoreChange);
  return () => list.removeEventListener('change', onStoreChange);
}

export default function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query().matches,
    () => false,
  );
}
