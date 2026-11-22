// Counts from zero to `target` once `active` turns true. With reduced motion the final value is
// returned from the first render, so the figure is never animated and never briefly wrong.
import { useEffect, useState } from 'react';
import useReducedMotion from './use-reduced-motion';

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export default function useCountUp(target: number, active: boolean, duration = 900): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || reduced) return undefined;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const progress = Math.min(1, (now - started) / duration);
      setValue(Math.round(target * easeOutCubic(progress)));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, duration, reduced, target]);

  return reduced ? target : value;
}
