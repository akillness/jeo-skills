// Two globals the hero owns and two navigator fields the DOM lib does not model.
// `__heroReady` is the capture contract of the `?poster=<look>` route (site/scripts/hero-posters.py
// waits on it); `__heroScenes` is the counter the phase-3 gate checks read to prove that a
// reduced-motion, narrow or WebGL2-less page never built a scene at all.
declare global {
  interface Window {
    __heroReady?: boolean;
    __heroScenes?: number;
  }

  interface Navigator {
    /** Chromium only; undefined everywhere else, which the gate treats as a pass. */
    readonly deviceMemory?: number;
    readonly connection?: { readonly saveData?: boolean };
  }
}

export {};
