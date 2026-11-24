/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const HELD_ANIMATIONS = "*,*::before,*::after{animation-play-state:paused!important}";

/** The part of Electron's WebContents the hold uses. */
export interface HeldAnimationsPage {
  insertCSS(css: string, options?: { cssOrigin?: "user" | "author" }): Promise<string>;
  removeInsertedCSS(key: string): Promise<void>;
  isDestroyed(): boolean;
  on(event: "did-navigate" | "dom-ready" | "did-finish-load", listener: (...args: never[]) => void): unknown;
  removeListener(event: "did-navigate" | "dom-ready" | "did-finish-load", listener: (...args: never[]) => void): unknown;
}

export interface HoldOptions {
  /** After the page's document has loaded, the longest the hold lasts (ms). */
  readonly maxHoldMs?: number;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

export const MAX_HOLD_AFTER_LOAD_MS = 8_000;

/** Holds `page`'s CSS animations; the function returned ends the hold (idempotent). */
export function holdAnimations(page: HeldAnimationsPage, options: HoldOptions = {}): () => void {
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const maxHoldMs = options.maxHoldMs ?? MAX_HOLD_AFTER_LOAD_MS;
  let released = false;
  const keys = new Set<string>();
  let timer: unknown = null;

  const remove = (key: string) => {
    if (!page.isDestroyed()) void page.removeInsertedCSS(key).catch(() => undefined);
  };
  const hold = () => {
    if (released || page.isDestroyed()) return;
    void page
      .insertCSS(HELD_ANIMATIONS, { cssOrigin: "author" })
      .then((key) => {
        if (released) remove(key);
        else keys.add(key);
      })
      .catch(() => undefined);
  };
  // A new document has none of the old one's sheets: held again as it commits.
  const committed = () => hold();
  const loaded = () => {
    if (released || timer !== null) return;
    timer = setTimer(release, maxHoldMs);
  };
  function release(): void {
    if (released) return;
    released = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    page.removeListener("did-navigate", committed);
    page.removeListener("dom-ready", hold);
    page.removeListener("did-finish-load", loaded);
    for (const key of keys) remove(key);
    keys.clear();
  }
  page.on("did-navigate", committed);
  page.on("dom-ready", hold);
  page.on("did-finish-load", loaded);
  return release;
}
