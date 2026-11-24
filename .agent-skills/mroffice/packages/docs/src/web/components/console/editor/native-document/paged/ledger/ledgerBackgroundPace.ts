/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The pace of the page ledger's background: pages near the reader are laid
 * out at once, pages far from them only while the app is idle.
 *
 * Word lays out the pages in front of the reader first and repaginates the
 * rest of a long document in the background while nothing else is going on.
 * Once a long document is shown, the ledger's background (the pages after the
 * reader's, still standing as their provisional sheets) used to follow frame
 * after frame: every step one pass of the document's whole-document work, a
 * few hundred milliseconds in Chromium and seconds in WebKit, back to back for
 * as long as the document took. While the window stayed open the whole app
 * waited behind it (the sidebar, another window, scrolling this one).
 *
 * Here a background step whose first page is more than FAR_LOOKAHEAD_PAGES
 * past the last page the reader sees waits for a pause: no input anywhere for
 * a moment (a key in the document's own window too: nobody typing there waits
 * for a far page), and a gap after the previous step that grows with what that
 * step cost, so the thread is free most of the time and a click never queues
 * behind two steps. The pages it reaches, and the layout they get, are the
 * same; only when they are laid out changes. A reader scrolling towards those
 * pages brings them near, and a near step runs at once again.
 */

/** Pages after the last one the reader sees that are laid out eagerly. */
export const FAR_LOOKAHEAD_PAGES = 3;
/** The least time between two far background steps. */
export const FAR_STEP_MIN_GAP_MS = 120;
/** The gap after a far step, as a multiple of what the step cost: a step of
 * 300 ms leaves the next 600 ms to everything else. */
export const FAR_STEP_GAP_FACTOR = 2;
/** The same while no input comes: half the thread stays free for whatever
 * arrives next (a save's timers, a room's update, the first key). With only
 * the least gap the background held the thread 80-95 % of the time for as long
 * as a long document took, and a timer due after the last key ran seconds late. */
export const FAR_STEP_QUIET_GAP_FACTOR = 1;
/** The same once nothing has come for a while (the reader reading, the window
 * left alone): most of the thread goes to the layout, which was half of a long
 * document's time to its last page, and the next input brings the longer gap
 * back at once. */
export const FAR_STEP_REST_GAP_FACTOR = 0.25;
export const FAR_STEP_REST_MIN_GAP_MS = 30;
/** How long nothing must have come for that. */
export const FAR_STEP_REST_AFTER_MS = 3000;
/** The longest gap a slow step earns. */
export const FAR_STEP_MAX_GAP_MS = 4000;
/** How long a far step waits for input to pause before it runs anyway (the
 * document still finishes while the reader keeps working). */
export const FAR_STEP_MAX_WAIT_MS = 8000;
/** The same while the person types: nobody is waiting for the far pages and
 * the next key would wait for the step. Longer than any run of typing without
 * a pause, so it only ever bounds a key held down. */
export const FAR_STEP_TYPING_MAX_WAIT_MS = 30_000;
/** A key, a press or the wheel this recent, in any window, holds a far step:
 * past the document's own typing gate and save timers (800 ms at most), which
 * then run on time. */
export const FAR_STEP_INPUT_PAUSE_MS = 1000;
/** How often a waiting far step looks again whether input paused. */
const FAR_STEP_POLL_MS = 150;
/** How long the work a step set off may be waited for before the gap counts. */
const FAR_STEP_SETTLE_MAX_MS = 1000;

/** Whether the background's next page (`frontier`, a sheet index) is far
 * from the pages the reader sees (`visible`; null: none, the window is
 * scrolled away from the document or hidden). */
export function backgroundIsFar(frontier: number, visible: { first: number; last: number } | null): boolean {
  if (!visible) return true;
  return frontier > visible.last + FAR_LOOKAHEAD_PAGES;
}

/** The gap a far step leaves after itself. */
export function farStepGapMs(lastStepMs: number, factor = FAR_STEP_GAP_FACTOR): number {
  return Math.min(FAR_STEP_MAX_GAP_MS, Math.max(FAR_STEP_MIN_GAP_MS, lastStepMs * factor));
}

/**
 * The pages of a background step, by what the last ones cost. A slow step halves
 * the next and a quick one grows it back. Halving only helps when the pages are
 * what costs: a step of a long document is mostly work done once per step
 * whatever its size, and at the fewest pages the document took three times as
 * long for steps no shorter. So a halving that did not pay is undone, and steps
 * of about that cost stand.
 */
export interface StepSizing {
  pages: number;
  /** The step before the last size change was made from. */
  last: { pages: number; ms: number } | null;
  /** What a step costs whatever its pages, as far as seen. */
  fixedMs: number;
}

const STEP_KEPT_UP_TO_MS = 1500;

export function nextStepSizing(
  sizing: StepSizing,
  stepMs: number,
  limits: { minPages: number; maxPages: number; slowMs: number; quickMs: number },
): StepSizing {
  const last = { pages: sizing.pages, ms: stepMs };
  if (stepMs > Math.max(limits.slowMs, sizing.fixedMs * 1.25)) {
    // (Past that, the fewest pages whatever it pays: one paragraph as long as a
    // book costs more for every page further down it, and no share of a step
    // that long is worth keeping for.)
    if (stepMs <= STEP_KEPT_UP_TO_MS && sizing.last && sizing.last.pages > sizing.pages && stepMs > sizing.last.ms * 0.75) {
      return { pages: sizing.last.pages, last, fixedMs: stepMs };
    }
    return { ...sizing, pages: Math.max(limits.minPages, Math.floor(sizing.pages / 2)), last };
  }
  if (stepMs < limits.quickMs) return { ...sizing, pages: Math.min(limits.maxPages, sizing.pages + 2), last };
  return { ...sizing, last };
}

export interface IdleStepper {
  /** Run `step` once the gap after the last step has passed and input
   * paused (or the wait is over). A step already waiting is kept. */
  request(step: () => void): void;
  /** A step is waiting. */
  readonly waiting: boolean;
  /** Drop the waiting step (the next one is asked for anew). */
  cancel(): void;
  /** What the step that just ran cost (sets the gap before the next). */
  ran(ms: number): void;
  dispose(): void;
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * The thread's far steps, per page: every long document open in a window lays
 * out in the background at once, and each kept its own gap, so a dozen windows
 * of long documents held the thread whatever one gap was worth. One gap between
 * any two steps, whichever editors they belong to.
 */
interface FarStepPace {
  lastEnd: number;
  gap: number;
  quietGap: number;
  restGap: number;
  /** A step ended and what it set off (its frame's work) has not finished. */
  settling: boolean;
}
const paces = new WeakMap<Window, FarStepPace>();

export function createIdleStepper(
  win: Window,
  inputQuiet: () => boolean,
  now: () => number = () => performance.now(),
  /** The person is typing or pressing right now (FAR_STEP_INPUT_PAUSE_MS). */
  typing: () => boolean = () => false,
): IdleStepper {
  const idle = win as IdleWindow;
  let pace = paces.get(win);
  if (!pace) {
    pace = { lastEnd: Number.NEGATIVE_INFINITY, gap: FAR_STEP_MIN_GAP_MS, quietGap: FAR_STEP_MIN_GAP_MS, restGap: FAR_STEP_REST_MIN_GAP_MS, settling: false };
    paces.set(win, pace);
  }
  const shared = pace;
  let timer: number | undefined;
  let idleHandle: number | undefined;
  let pending: (() => void) | null = null;
  let waitingSince = 0;
  let lastBusy = now();
  let disposed = false;
  const clear = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    if (idleHandle !== undefined) idle.cancelIdleCallback?.(idleHandle);
    timer = undefined;
    idleHandle = undefined;
  };
  /** How long before a step may run: 0, it may now. */
  const waitMs = (): number => {
    if (shared.settling) return FAR_STEP_POLL_MS;
    const t = now();
    // While no input comes the gap is shorter; input brings the longer one
    // back at once.
    const quiet = inputQuiet() && !typing();
    if (!quiet) lastBusy = t;
    const gapNow = !quiet ? shared.gap : t - lastBusy >= FAR_STEP_REST_AFTER_MS ? shared.restGap : shared.quietGap;
    const gapLeft = shared.lastEnd + gapNow - t;
    if (gapLeft > 1) return Math.min(gapLeft, FAR_STEP_POLL_MS);
    const maxWait = typing() ? FAR_STEP_TYPING_MAX_WAIT_MS : FAR_STEP_MAX_WAIT_MS;
    return !quiet && t - waitingSince < maxWait ? FAR_STEP_POLL_MS : 0;
  };
  const fire = () => {
    idleHandle = undefined;
    if (disposed || !pending) return;
    // The idle slot comes a while after it is asked for: a key may have come
    // in between, or another editor's step taken the gap.
    const wait = waitMs();
    if (wait > 0) {
      timer = win.setTimeout(check, wait);
      return;
    }
    const step = pending;
    pending = null;
    step();
  };
  const check = () => {
    timer = undefined;
    if (disposed || !pending) return;
    const wait = waitMs();
    if (wait > 0) {
      timer = win.setTimeout(check, wait);
      return;
    }
    // Where the browser can tell when a frame leaves time over, the step
    // runs then (never later than a frame's worth of waiting).
    if (typeof idle.requestIdleCallback === "function") idleHandle = idle.requestIdleCallback(fire, { timeout: 250 });
    else fire();
  };
  return {
    request(step) {
      if (disposed) return;
      pending = step;
      if (timer !== undefined || idleHandle !== undefined) return;
      waitingSince = now();
      check();
    },
    get waiting() {
      return pending !== null;
    },
    cancel() {
      pending = null;
      clear();
    },
    ran(ms) {
      const end = now();
      const started = end - ms;
      const earn = (spent: number) => {
        shared.gap = farStepGapMs(spent);
        shared.quietGap = farStepGapMs(spent, FAR_STEP_QUIET_GAP_FACTOR);
        shared.restGap = Math.min(FAR_STEP_MAX_GAP_MS, Math.max(FAR_STEP_REST_MIN_GAP_MS, spent * FAR_STEP_REST_GAP_FACTOR));
      };
      shared.lastEnd = end;
      earn(ms);
      // A step's page move sets off more than the step (the stamps, the line
      // metrics, the frame that draws it). The gap is earned by all of it,
      // from when the thread first has nothing left to do.
      if (typeof idle.requestIdleCallback === "function") {
        shared.settling = true;
        idle.requestIdleCallback(() => {
          shared.settling = false;
          shared.lastEnd = now();
          earn(shared.lastEnd - started);
        }, { timeout: FAR_STEP_SETTLE_MAX_MS });
      }
    },
    dispose() {
      disposed = true;
      pending = null;
      clear();
    },
  };
}
