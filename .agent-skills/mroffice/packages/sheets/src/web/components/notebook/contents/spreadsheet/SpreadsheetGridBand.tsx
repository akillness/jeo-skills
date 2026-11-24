"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useState, type ReactNode, type SetStateAction } from "react";

type GridOffset = { readonly left: number; readonly top: number };

/** Where the grid's mounted band is: the scroll it was resolved for, the reach a motion is predicted to have, and the slice of it already revealed. */
export type SpreadsheetGridBandState = {
  readonly scroll: GridOffset;
  readonly reach: GridOffset;
  readonly revealTick: number;
};

/**
 * The scroll band of a workbook window, outside the window's own state. A
 * band change (a wheel tick, a fling, a row slice coming in) renders the grid
 * band subtree only: the ribbon, the panes, the dialogs and the status bar
 * show nothing that depends on it. The setters keep React's setState shape
 * (a value or an updater; the same value changes nothing) and its timing:
 * they set the band component's own state, so an update keeps the priority
 * of where it was made (a wheel's flushSync renders at once, a frame's
 * reveal tick in a task of its own, as the window's state did).
 */
export class SpreadsheetGridBandStore {
  #state: SpreadsheetGridBandState = { scroll: { left: 0, top: 0 }, reach: { left: 0, top: 0 }, revealTick: 0 };
  #setBand: ((state: SpreadsheetGridBandState) => void) | null = null;
  readonly #commitListeners = new Set<() => void>();

  readonly get = (): SpreadsheetGridBandState => this.#state;

  /** The band component's state setter, while it is mounted. */
  attach(setBand: (state: SpreadsheetGridBandState) => void) {
    this.#setBand = setBand;
    return () => {
      if (this.#setBand === setBand) this.#setBand = null;
    };
  }

  /**
   * Hear every commit of the band: the cells it mounted are in the DOM. What
   * used to wait for the window's next render to find a cell a scroll brought
   * in (Find's pending focus, a drag's range preview) listens here, since a
   * band change no longer renders the window. Returns the unsubscribe.
   */
  readonly onCommit = (listener: () => void) => {
    this.#commitListeners.add(listener);
    return () => {
      this.#commitListeners.delete(listener);
    };
  };

  /** Called by the band after each of its commits. */
  committed() {
    for (const listener of [...this.#commitListeners]) listener();
  }

  #set<K extends keyof SpreadsheetGridBandState>(key: K, action: SetStateAction<SpreadsheetGridBandState[K]>) {
    const current = this.#state[key];
    const next = typeof action === "function"
      ? (action as (value: SpreadsheetGridBandState[K]) => SpreadsheetGridBandState[K])(current)
      : action;
    if (Object.is(next, current)) return;
    this.#state = { ...this.#state, [key]: next };
    this.#setBand?.(this.#state);
  }

  readonly setScroll = (action: SetStateAction<GridOffset>) => this.#set("scroll", action);
  readonly setReach = (action: SetStateAction<GridOffset>) => this.#set("reach", action);
  readonly setRevealTick = (action: SetStateAction<number>) => this.#set("revealTick", action);
}

/**
 * Renders the grid band from the window's latest render scope (`render` is
 * that render's function, so it always sees the window's current state) and
 * again on its own whenever the band moves. `render` may call hooks: they
 * belong to this component and run on every render of it, in a fixed order.
 */
export function SpreadsheetGridBand({
  store,
  render,
}: {
  store: SpreadsheetGridBandStore;
  render: (band: SpreadsheetGridBandState) => ReactNode;
}) {
  const [band, setBand] = useState(store.get);
  useLayoutEffect(() => {
    const detach = store.attach(setBand);
    // A band set between this render and now.
    setBand(store.get());
    return detach;
  }, [store]);
  // Every commit of the band, its cells' own layout effects done.
  useLayoutEffect(() => {
    store.committed();
  });
  return <>{render(band)}</>;
}
