// Reports whether the returned ref's element is on screen. `once` freezes the answer at the first
// intersection (used by the count-up ribbon); without it the flag tracks entry and exit (used by
// the origin recording, which pauses when scrolled away).
import { useEffect, useRef, useState, type RefObject } from 'react';

interface InViewOptions {
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
}

export default function useInView<T extends Element = HTMLElement>({
  once = false,
  rootMargin = '0px',
  threshold = 0,
}: InViewOptions = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    // No observer (very old browser, or a test environment): show the section as if it were read.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return [ref, inView];
}
