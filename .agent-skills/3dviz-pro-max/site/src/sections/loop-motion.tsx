// Motion for the loop section. Each block rises into place on its own first intersection; the
// items inside a revealed block ride its `is-in` class, offset by a per-item `--stagger`.
// Nothing is hidden until JavaScript arms the section (`useLoopArmed` → `loop-motion` on the
// section root), so a script-less render — and a reader who asked for less motion — gets the
// finished layout rather than a blank one. Only opacity and transform move: no layout shift.
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import useInView from '../hooks/use-in-view';
import useReducedMotion from '../hooks/use-reduced-motion';
import '../styles/loop-motion.css';

/** A per-item offset carried as a custom property, so one rule can offset two animations. */
export interface StaggerStyle extends CSSProperties {
  '--stagger'?: string;
}

export const stagger = (ms: number): StaggerStyle => ({ '--stagger': `${ms}ms` });

/** True once the page is interactive and the reader has not asked the system for less motion. */
export function useLoopArmed(): boolean {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  // A layout effect: the arming re-render lands before the first paint, so the reader never sees
  // the static section flash into the animated one.
  useLayoutEffect(() => setMounted(true), []);
  return mounted && !reduced;
}

interface RevealHandle<T extends Element> {
  ref: RefObject<T | null>;
  /** `is-in` once the block has been reached; the flag is never taken away again. */
  state: string;
  style: StaggerStyle;
}

/** Watches one block and reports, once, that it has been scrolled to. */
export function useReveal<T extends Element = HTMLElement>(delayMs = 0): RevealHandle<T> {
  const [ref, inView] = useInView<T>({ once: true, threshold: 0.25 });
  return { ref, state: inView ? 'is-in' : '', style: stagger(delayMs) };
}

/** The dashed rule that ties one step of the loop to the next; it draws downwards when reached. */
export function Connector() {
  const drawn = useReveal<HTMLDivElement>(120);

  return (
    <div
      aria-hidden="true"
      ref={drawn.ref}
      style={drawn.style}
      className={`loop-connector ${drawn.state} ml-[54px] h-[34px] w-0.5 bg-[repeating-linear-gradient(var(--color-dash)_0_6px,transparent_6px_12px)]`}
    />
  );
}
