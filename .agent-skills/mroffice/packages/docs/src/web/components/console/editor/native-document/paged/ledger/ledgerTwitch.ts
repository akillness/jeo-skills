/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { reportOfficeExperience } from "@mrnote/core/web/lib/office-experience-report.ts";

export interface LayoutTwitch {
  /** `returned`: a page's opening came back to one it had, and left, since
   * the last authored edit. `held`: a guard stopped two layouts alternating. */
  kind: "returned" | "held";
  /** The first page whose opening differs (0-based). */
  page: number;
  /** The page stood in the window when it twitched: the reader saw it. (A
   * page further on, or one laid out before the document was shown, moved
   * unseen; counted all the same, told apart here.) */
  seen: boolean;
  /** Milliseconds since the epoch. */
  at: number;
  /** What moved: the opening it left and the one it came (back) to. */
  detail: string;
}

export interface TwitchWatch {
  /** A plan was dispatched: the first page whose opening came back to one
   * it had, and left, since the last authored edit; or null. */
  dispatched(before: readonly string[], after: readonly string[], editSeq: number): number | null;
}

/** Openings kept per page for one authored edit (a pass budget's worth). */
const MAX_OPENINGS = 32;

/**
 * Page by page, not the pages as a whole: a row sent on from page 10 and
 * taken back moved the opening of pages 11, 12 and 13 there and back while
 * page 10 itself ended one word further on, so no whole layout came round
 * and the reader of page 12 still saw it jump.
 */
export function createTwitchWatch(): TwitchWatch {
  let seq: number | null = null;
  /** By page: the openings it has had since the edit, in order. */
  let seen: string[][] = [];
  return {
    dispatched(before, after, editSeq) {
      if (seq !== editSeq) {
        seq = editSeq;
        seen = before.map((opening) => [opening]);
      }
      let twitched: number | null = null;
      for (let page = 0; page < after.length; page += 1) {
        const had = seen[page] ?? (seen[page] = before[page] === undefined ? [] : [before[page]]);
        const opening = after[page];
        if (had[had.length - 1] === opening) continue;
        if (twitched === null && had.includes(opening)) twitched = page;
        had.push(opening);
        if (had.length > MAX_OPENINGS) had.splice(0, had.length - MAX_OPENINGS);
      }
      return twitched;
    },
  };
}

/**
 * Tell the 监控 page a reader's layout twitched: the kind alone (`returned`,
 * `held-cycle`, `held-repair`), once in ten minutes for a tab, nothing of the
 * document (lib/office-experience-report). Never throws.
 */
export function reportLayoutTwitch(code: "returned" | "held-cycle" | "held-repair"): void {
  // The one key for every document of the tab: the count is of twitches seen, not of pages.
  reportOfficeExperience("layout_twitch", { pageId: "document", pageType: "document", code });
}

/** Whether sheet `page` of the editor at `root` stands in the window now. */
export function pageOnScreen(root: HTMLElement, page: number): boolean {
  try {
    const sheet = root.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]")[page];
    const win = root.ownerDocument.defaultView;
    if (!sheet || !win) return false;
    const box = sheet.getBoundingClientRect();
    return box.bottom > 0 && box.top < win.innerHeight && box.right > 0 && box.left < win.innerWidth;
  } catch {
    return false;
  }
}

/** Twitches kept for a harness to read, at most. */
const MAX_KEPT = 200;

/** Keep a twitch where the typing harness and an A/B read it. */
export function noteLayoutTwitch(win: Window | null | undefined, twitch: LayoutTwitch): void {
  if (!win) return;
  const holder = win as Window & { __docsLayoutTwitches?: LayoutTwitch[] };
  const list = Array.isArray(holder.__docsLayoutTwitches) ? holder.__docsLayoutTwitches : (holder.__docsLayoutTwitches = []);
  list.push(twitch);
  if (list.length > MAX_KEPT) list.splice(0, list.length - MAX_KEPT);
}
