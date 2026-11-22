// Chrome-free route the capture pipeline shoots the hero posters from: one canvas on a black page,
// one frame, then `window.__heroReady`. It runs the same createHeroScene the live hero runs, which
// is what makes the poster and the first live frame the same picture.
//
// Dormant while HERO_LIVE_LOOK is null (the hero ships a baked frame, see hero-looks.ts): the
// route then draws nothing and says so, and the `import('./hero-live-scene')` below is dropped
// from the build, which is what keeps three.js out of the site bundle. Re-enable a look and the
// route shoots its poster again.
import { useEffect, useRef, useState } from 'react';
import { HERO_LIVE_LOOK, resolveLook } from './hero-looks';
import type { HeroScene } from './hero-live-scene';

export interface HeroPosterPageProps {
  /** The raw `?poster=` value; there is one look, so every value resolves to it. */
  look: string;
}

/** The route is a client-side branch on the landing page; keep it out of every index. */
function noindex(): () => void {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex';
  document.head.append(meta);
  return () => meta.remove();
}

export default function HeroPosterPage({ look }: HeroPosterPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = resolveLook(look).id;

  useEffect(() => {
    if (HERO_LIVE_LOOK === null) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let scene: HeroScene | null = null;
    let cancelled = false;
    const removeMeta = noindex();
    window.__heroReady = false;

    const build = async (): Promise<void> => {
      const { createHeroScene } = await import('./hero-live-scene');
      if (cancelled) return;
      const built = await createHeroScene({
        canvas,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      if (cancelled) {
        built.dispose();
        return;
      }
      scene = built;
      built.render();
      await built.ready;
      if (!cancelled) window.__heroReady = true;
    };

    build().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });

    return () => {
      cancelled = true;
      removeMeta();
      window.__heroReady = false;
      scene?.dispose();
    };
  }, [id]);

  return (
    <div className="fixed inset-0 m-0 bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Hero poster plate: ${id}`} />
      {HERO_LIVE_LOOK === null ? (
        <p role="alert" className="p-6 font-mono text-[12px] text-white">
          No live look is enabled (HERO_LIVE_LOOK is null): the hero ships a baked frame, so there
          is nothing to capture here.
        </p>
      ) : null}
      {error ? <p role="alert" className="p-6 font-mono text-[12px] text-white">{error}</p> : null}
    </div>
  );
}
