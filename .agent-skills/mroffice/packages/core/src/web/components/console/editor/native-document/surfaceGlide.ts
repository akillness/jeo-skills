/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A window or pane that glides to a new frame (lib/desk-motion
 * `glideBetweenFrames`: a FLIP animation of `translate` and `scale`) draws
 * everything inside it moved and scaled until the animation ends. Glyph and
 * line geometry read from client rects in that time is in drawn pixels, not
 * laid-out ones: a typography projection that measured then took a line that
 * fits for one that overflows and dropped its hanging space (R06-D17 first
 * open: a paragraph wrapped, page 2's last line moved to page 3, and nothing
 * measured again once the glide ended — a transform fires no resize and no
 * mutation).
 *
 * Only a RUNNING animation of an element that contains the editor and moves
 * it counts: a steady transform (the document's own zoom view) is the frame
 * the editor is laid out in and never stops a measurement.
 */

const MOVING_PROPERTIES = ["transform", "scale", "translate", "rotate"] as const;

function moves(animation: Animation): boolean {
  const effect = animation.effect;
  if (typeof KeyframeEffect === "undefined" || !(effect instanceof KeyframeEffect)) return false;
  try {
    // A looping animation (a breathing glow, a spinner, a live cover) never
    // finishes: it is decoration, not a frame on its way somewhere.
    if (!Number.isFinite(effect.getTiming().iterations ?? 1)) return false;
    return effect
      .getKeyframes()
      .some((frame) => MOVING_PROPERTIES.some((property) => frame[property] != null && frame[property] !== ""));
  } catch {
    return false;
  }
}

/** The running animations that move an ancestor of (or) `root`. */
export function surfaceGlidesOver(root: HTMLElement): Animation[] {
  const doc = root.ownerDocument;
  if (!root.isConnected || typeof doc.getAnimations !== "function") return [];
  const out: Animation[] = [];
  for (const animation of doc.getAnimations()) {
    if (animation.playState !== "running") continue;
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (!(target instanceof Element) || !target.contains(root)) continue;
    if (moves(animation)) out.push(animation);
  }
  return out;
}

const waiting = new WeakMap<HTMLElement, Set<() => void>>();
/** However a glide behaves (paused, retimed), a measurement waits no longer. */
const GLIDE_WAIT_LIMIT_MS = 1500;

/**
 * Whether `root` is being glided now. If it is, `then` runs once every glide
 * moving it has ended (finished or cancelled); several callers waiting on one
 * root share that wait.
 */
export function deferWhileSurfaceGlides(root: HTMLElement, then: () => void): boolean {
  const glides = surfaceGlidesOver(root);
  if (glides.length === 0) return false;
  const queued = waiting.get(root);
  if (queued) {
    queued.add(then);
    return true;
  }
  const callbacks = new Set([then]);
  waiting.set(root, callbacks);
  const view = root.ownerDocument.defaultView;
  const done = () => {
    if (waiting.get(root) !== callbacks) return;
    if (timer !== undefined) view?.clearTimeout(timer);
    waiting.delete(root);
    callbacks.forEach((callback) => callback());
  };
  const timer = view?.setTimeout(done, GLIDE_WAIT_LIMIT_MS);
  void Promise.allSettled(glides.map((glide) => glide.finished)).then(() => {
    // A glide that ended may have started another (a maximize right after
    // an open): wait for that one too before anything measures.
    const again = () => {
      const next = surfaceGlidesOver(root);
      if (next.length === 0) {
        done();
        return;
      }
      void Promise.allSettled(next.map((glide) => glide.finished)).then(again);
    };
    if (view) view.requestAnimationFrame(again);
    else again();
  });
  return true;
}
