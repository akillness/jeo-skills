/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useSyncExternalStore } from "react";

export interface CanvasScrollPosition {
  readonly left: number;
  readonly top: number;
}

export interface CanvasScrollStore {
  get(): CanvasScrollPosition;
  /** Records the scroller's position; listeners hear of a real change only. */
  set(next: CanvasScrollPosition): void;
  subscribe(listener: () => void): () => void;
}

export function createCanvasScrollStore(): CanvasScrollStore {
  let current: CanvasScrollPosition = { left: 0, top: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (next.left === current.left && next.top === current.top) return;
      current = { left: next.left, top: next.top };
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Kill switch, per device: `localStorage["mrnote.canvas.perf-legacy"]`
 * listing `scroll` puts back the old behaviour (the canvas re-rendered on
 * every scroll frame), for a same-build A/B or if the store misbehaves.
 */
export const CANVAS_PERF_LEGACY_KEY = "mrnote.canvas.perf-legacy";

export function canvasPerfLegacy(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CANVAS_PERF_LEGACY_KEY) ?? "";
    return raw.split(",").map((part) => part.trim()).includes(name);
  } catch {
    return false;
  }
}

/** The scroll position, re-rendering the caller as the desk moves. */
export function useCanvasScroll(store: CanvasScrollStore): CanvasScrollPosition {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
