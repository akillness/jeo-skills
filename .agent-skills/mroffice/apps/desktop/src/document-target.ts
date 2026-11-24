/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a document opened from the system goes while the app runs: into
 * the app's window the person is using, not a new one. macOS hands the
 * running app the document (open-file); Windows starts a second process,
 * which passes its arguments to the first (second-instance) and quits.
 *
 * Kept free of Electron so the choice is tested on its own
 * (test/document-target.test.mjs).
 */

export interface TargetCandidate {
  isDestroyed(): boolean;
  isFocused(): boolean;
}

/**
 * The app's page windows in the order they were last focused (last = most
 * recent). Scratch windows a page opens (printing, a presenter view) and the
 * splash are never tracked.
 */
export class FocusOrder<T extends TargetCandidate> {
  private readonly windows: T[] = [];

  add(window: T): void {
    this.remove(window);
    this.windows.push(window);
  }

  /** The window was focused: it becomes the most recent. */
  focused(window: T): void {
    if (this.windows.includes(window)) this.add(window);
  }

  remove(window: T): void {
    const index = this.windows.indexOf(window);
    if (index >= 0) this.windows.splice(index, 1);
  }

  /** The window a document goes to: the focused one, else the one used last;
   * null when the app has no page window (a new one opens for it). */
  target(): T | null {
    const live = this.windows.filter((window) => !window.isDestroyed());
    return live.find((window) => window.isFocused()) ?? live[live.length - 1] ?? null;
  }
}
