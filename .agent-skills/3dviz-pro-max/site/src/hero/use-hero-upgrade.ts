// Poster → live upgrade. Everything expensive is behind the gates and behind an idle callback:
// on a phone, a reduced-motion profile, a small window or a WebGL2-less browser the hero stays a
// single <img> and this hook never imports the scene chunk.
//
// It is fully off while HERO_LIVE_LOOK is null, which is how the site ships: the hook still runs
// (hero-cinematic.tsx calls it) but returns before touching the canvas, so re-enabling a look is
// one constant away.
import { useEffect, useState, type RefObject } from 'react';
import { HERO_LIVE_LOOK } from './hero-looks';
import type { HeroScene } from './hero-live-scene';

const CROSSFADE_MS = 600;
const IDLE_FALLBACK_MS = 200;
const IDLE_TIMEOUT_MS = 2000;
const MIN_WIDTH = 900;
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4; // navigator.deviceMemory is Chromium-only; undefined passes

export type HeroState = 'poster' | 'loading' | 'live' | 'failed';

export interface HeroUpgrade {
  state: HeroState;
  /** True once the crossfade has finished and the poster may leave the accessibility tree. */
  posterHidden: boolean;
}

export interface HeroUpgradeOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  posterRef: RefObject<HTMLImageElement | null>;
}

/** True when this browser, window and connection can afford a second WebGL scene. */
export function canUpgrade(win: Window = window): boolean {
  const nav = win.navigator;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (win.innerWidth < MIN_WIDTH) return false;
  if (nav.hardwareConcurrency < MIN_CORES) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < MIN_MEMORY_GB) return false;
  if (nav.connection?.saveData === true) return false;
  const probe = win.document.createElement('canvas').getContext('webgl2');
  probe?.getExtension('WEBGL_lose_context')?.loseContext();
  return probe !== null;
}

/** Runs `then` once the poster has painted; a poster that failed to load must not block the swap. */
function afterPoster(img: HTMLImageElement | null, then: () => void): () => void {
  if (!img || img.complete) {
    then();
    return () => {};
  }
  img.addEventListener('load', then, { once: true });
  img.addEventListener('error', then, { once: true });
  return () => {
    img.removeEventListener('load', then);
    img.removeEventListener('error', then);
  };
}

export function useHeroUpgrade({ canvasRef, posterRef }: HeroUpgradeOptions): HeroUpgrade {
  const [state, setState] = useState<HeroState>('poster');
  const [posterHidden, setPosterHidden] = useState(false);

  useEffect(() => {
    // The upgrade is off while no look is live (see HERO_LIVE_LOOK): no canvas work, and above
    // all no `import('./hero-live-scene')`, so three.js never enters the landing bundle.
    if (HERO_LIVE_LOOK === null) return undefined;
    const canvas = canvasRef.current;
    if (!canvas || !canUpgrade()) return undefined;

    let scene: HeroScene | null = null;
    let cancelled = false;
    let frame = 0;
    let elapsed = 0;
    let startedAt = 0;
    let onScreen = true;
    let idle = 0;
    let fade = 0;

    const draw = (now: number): void => {
      if (!scene) return;
      frame = requestAnimationFrame(draw);
      scene.setOrbit(elapsed + (now - startedAt) / 1000);
      scene.render();
    };
    const stop = (): void => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      elapsed += (performance.now() - startedAt) / 1000;
      frame = 0;
    };
    const sync = (): void => {
      if (scene && onScreen && !document.hidden) {
        if (frame) return;
        startedAt = performance.now();
        frame = requestAnimationFrame(draw);
      } else stop();
    };

    const drop = (): void => {
      stop();
      scene?.dispose();
      scene = null;
    };
    const onLost = (event: Event): void => {
      // The context is gone for good: fall back to the poster and never rebuild.
      event.preventDefault();
      drop();
      if (cancelled) return;
      clearTimeout(fade);
      setPosterHidden(false);
      setState('poster');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    const resizer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !scene) return;
      scene.resize(entry.contentRect.width, entry.contentRect.height);
      if (!frame) scene.render();
    });

    // An arrow constant, not a hoisted declaration: only this form keeps `canvas` narrowed.
    const build = async (): Promise<void> => {
      const { createHeroScene } = await import('./hero-live-scene');
      if (cancelled) return;
      const box = canvas.getBoundingClientRect();
      const built = await createHeroScene({ canvas, width: box.width, height: box.height });
      if (cancelled) {
        built.dispose();
        return;
      }
      scene = built;
      built.render();
      await built.ready;
      if (cancelled) return;
      setState('live');
      fade = window.setTimeout(() => setPosterHidden(true), CROSSFADE_MS);
      observer.observe(canvas);
      resizer.observe(canvas);
      document.addEventListener('visibilitychange', sync);
      sync();
    };

    const start = (): void => {
      if (cancelled) return;
      setState('loading');
      build().catch((cause: unknown) => {
        console.warn('hero: staying on the poster —', cause);
        drop();
        if (!cancelled) setState('failed');
      });
    };
    // Safari only gained requestIdleCallback in 16.4; the timeout is the fallback path.
    const hasIdleCallback = typeof window.requestIdleCallback === 'function';
    const unwatchPoster = afterPoster(posterRef.current, () => {
      idle = hasIdleCallback
        ? window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS })
        : window.setTimeout(start, IDLE_FALLBACK_MS);
    });

    return () => {
      cancelled = true;
      unwatchPoster();
      if (hasIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
      clearTimeout(fade);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', sync);
      observer.disconnect();
      resizer.disconnect();
      drop();
    };
  }, [canvasRef, posterRef]);

  return { state, posterHidden };
}
