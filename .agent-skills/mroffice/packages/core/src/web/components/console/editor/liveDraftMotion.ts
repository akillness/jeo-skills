/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Motion for a page an AI run is writing while the member watches.
 *
 * Each section the run saves arrives as a whole new body, and the editor
 * installs it the way a reload does. That is correct and stays: the paged
 * layout owns every block. What changes is how it looks. Before the new body
 * goes in, the blocks on screen are fingerprinted; afterwards only the blocks
 * that are new (or were redrawn, such as a picture that just landed) get an
 * entrance, and the reading position is kept, or follows the new section when
 * the member was already at the end.
 */

import { useLayoutEffect, useRef } from "react";

import { moveScrollWhenStill, placeScrollTop, scrollInMotion } from "../../../lib/scroll-follow";

import manuscript from "./LiveDraftManuscript.module.css";
import {
  paginationBoxRelativeTo,
  paginationTransformScale,
} from "./native-document/paged/paginationGeometry";
import {
  AI_MOTION_ATTRIBUTE,
  playAiBlockTransition,
  readAiBlocks,
  snapshotAiBlocks,
  type AiBlockSnapshotSet,
  type AiMotionDirection,
} from "../../../__cut__/m39a24b3ce5";

type ViewLike = {
  dom: HTMLElement;
  state: {
    doc: {
      forEach: (fn: (node: NodeLike, offset: number) => void) => void;
    };
  };
  nodeDOM: (pos: number) => Node | null;
};

type NodeLike = {
  type: { name: string };
  forEach: (fn: (node: NodeLike, offset: number) => void) => void;
};

/** Attributes regenerated on every compile, which say nothing about content. */
const VOLATILE_KEYS = new Set(["block_id", "anchor_id", "blockId"]);
/** Paragraph entrance: 200 ms, each of the first six 40 ms after the last. */
const ENTER_STAGGER_MS = 40;
const ENTER_STAGGERED = 6;
const ENTER_MS = 200 + 320 + ENTER_STAGGER_MS * ENTER_STAGGERED;
/** The arrival bar holds, then fades (its animation), then leaves. */
const ARRIVAL_MS = 1_700;
/** Within this distance of the end, the member is following the writing. */
const FOLLOW_SLACK_PX = 160;

export function liveDraftBlockSignatures(content: unknown): string[] {
  const blocks =
    content && typeof content === "object" && Array.isArray((content as { content?: unknown }).content)
      ? ((content as { content: unknown[] }).content)
      : [];
  return blocks.map((block) =>
    JSON.stringify(block, (key, value) => (VOLATILE_KEYS.has(key) ? undefined : value)),
  );
}

/** Indexes of the blocks in `next` that the previous body did not have. */
export function changedLiveDraftBlocks(
  previous: readonly string[],
  next: readonly string[],
): number[] {
  const remaining = new Map<string, number>();
  for (const signature of previous) {
    remaining.set(signature, (remaining.get(signature) ?? 0) + 1);
  }
  const changed: number[] = [];
  next.forEach((signature, index) => {
    const left = remaining.get(signature) ?? 0;
    if (left > 0) remaining.set(signature, left - 1);
    else changed.push(index);
  });
  return changed;
}

function scrollParentOf(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node) {
    const overflow = window.getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface LiveDraftScroll {
  parent: HTMLElement | null;
  top: number;
  followsEnd: boolean;
  /** The first block the reader can see, by its flat index, and how far its
   *  top sits below the scroller's top edge. */
  anchorIndex: number;
  anchorOffset: number;
}

export function captureLiveDraftScroll(view: ViewLike | null | undefined): LiveDraftScroll | null {
  if (!view) return null;
  const parent = scrollParentOf(view.dom);
  if (!parent) return { parent: null, top: 0, followsEnd: false, anchorIndex: -1, anchorOffset: 0 };
  const distance = parent.scrollHeight - parent.scrollTop - parent.clientHeight;
  const edge = parent.getBoundingClientRect().top;
  let anchorIndex = -1;
  let anchorOffset = 0;
  blockElements(view).some((element, index) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= edge + 1) return false;
    anchorIndex = index;
    anchorOffset = rect.top - edge;
    return true;
  });
  return {
    parent, top: parent.scrollTop, followsEnd: distance <= FOLLOW_SLACK_PX,
    anchorIndex, anchorOffset,
  };
}

/** The DOM of each flat block, in the order the saved body lists them. */
function blockElements(view: ViewLike): (HTMLElement | null)[] {
  const out: (HTMLElement | null)[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.type.name !== "pageBlock") {
      const dom = view.nodeDOM(offset);
      out.push(dom instanceof HTMLElement ? dom : null);
      return;
    }
    node.forEach((_child, childOffset) => {
      const dom = view.nodeDOM(offset + 1 + childOffset);
      out.push(dom instanceof HTMLElement ? dom : null);
    });
  });
  return out;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Frames during which the reader's block is held in place while the paged
 *  layout settles around the new body. */
const ANCHOR_FRAMES = 18;

function isHeading(element: HTMLElement): boolean {
  return /^H[1-6]$/.test(element.tagName);
}

/**
 * Mark the section that just arrived with a 2px bar in the left gutter of
 * each sheet it landed on, the review window's change-marker idiom. Drawn in
 * the editor's overlay container, outside ProseMirror, and gone in 1.7 s.
 */
function markArrival(view: ViewLike, entering: readonly HTMLElement[]): void {
  const container = view.dom.closest<HTMLElement>(".note-editor-content-columns");
  if (!container || entering.length === 0) return;
  const scale = paginationTransformScale(container);
  const bySheet = new Map<HTMLElement, { top: number; bottom: number }>();
  for (const element of entering) {
    const sheet = element.closest<HTMLElement>("article[data-page-sheet]");
    if (!sheet) continue;
    const box = paginationBoxRelativeTo(element, container, scale);
    const span = bySheet.get(sheet);
    bySheet.set(sheet, {
      top: Math.min(span?.top ?? box.top, box.top),
      bottom: Math.max(span?.bottom ?? box.top + box.height, box.top + box.height),
    });
  }
  bySheet.forEach((span, sheet) => {
    const sheetBox = paginationBoxRelativeTo(sheet, container, scale);
    const padLeft = Number.parseFloat(window.getComputedStyle(sheet).paddingLeft) || 0;
    const bar = document.createElement("div");
    bar.className = manuscript.arrival;
    bar.setAttribute("aria-hidden", "true");
    bar.setAttribute("data-testid", "live-draft-arrival");
    bar.style.top = `${span.top}px`;
    bar.style.height = `${Math.max(4, span.bottom - span.top)}px`;
    bar.style.left = `${sheetBox.left + Math.max(10, padLeft - 18)}px`;
    container.appendChild(bar);
    window.setTimeout(() => bar.remove(), ARRIVAL_MS);
  });
}

/** The document's blocks: the children of each sheet, or of the root when unpaged. */
const DOCS_BLOCK_SELECTOR = "article[data-page-sheet] > *, :scope > :not(article)";

/**
 * What the AI changes is drawn against this: the blocks on screen now, with
 * clones of them so the ones a write removes can be struck through where they
 * were. Taken before the new body goes in; `playAiEditMotion` compares.
 */
export function captureAiEditMotion(view: ViewLike | null | undefined): AiBlockSnapshotSet | null {
  if (!view || !view.dom.isConnected) return null;
  const host = view.dom.closest<HTMLElement>(".note-editor-content-columns") ?? null;
  const blocks = readAiBlocks(view.dom, DOCS_BLOCK_SELECTOR, 600);
  if (blocks.length === 0) return null;
  return snapshotAiBlocks(blocks, { host, ghosts: true });
}

/**
 * Mark what the AI's write changed: new paragraphs enter under the focus
 * ring, restyled ones sweep, removed ones leave as struck-through ghosts. A
 * heading that was already on the page as a planned ghost only solidifies,
 * the manuscript's own motion. Undo plays the film backwards.
 */
export function playAiEditMotion(
  view: ViewLike | null | undefined,
  snapshot: AiBlockSnapshotSet | null,
  options: { direction?: AiMotionDirection; solidifyHeadings?: boolean } = {},
): void {
  if (!view || !snapshot) return;
  window.requestAnimationFrame(() => {
    if (!view.dom.isConnected) return;
    const after = readAiBlocks(view.dom, DOCS_BLOCK_SELECTOR, 600);
    const result = playAiBlockTransition(snapshot, after, { direction: options.direction });
    if (options.solidifyHeadings && !prefersReducedMotion()) {
      for (const element of result.entered) {
        if (!isHeading(element)) continue;
        element.removeAttribute(AI_MOTION_ATTRIBUTE);
        element.classList.add(manuscript.solidify);
        window.setTimeout(() => element.classList.remove(manuscript.solidify), ENTER_MS);
      }
    }
  });
}

/**
 * Install the motion for one new body. `scroll` null leaves scrolling to the
 * caller (the manuscript follows the writing point itself); `arrival` marks
 * the new section in the gutter; `snapshot` (from `captureAiEditMotion`)
 * draws the differences with the AI edit motion, ghosts included, in place
 * of the plain paragraph entrance.
 */
export function playLiveDraftUpdate(
  view: ViewLike | null | undefined,
  previous: readonly string[],
  next: readonly string[],
  scroll: LiveDraftScroll | null,
  options: { arrival?: boolean; snapshot?: AiBlockSnapshotSet | null } = {},
): void {
  if (!view) return;
  const changed = changedLiveDraftBlocks(previous, next);
  // The block the reader was looking at, found again by what it says.
  const anchorSignature =
    scroll && scroll.anchorIndex >= 0 ? previous[scroll.anchorIndex] : undefined;
  const anchorIndex = anchorSignature === undefined ? -1 : next.indexOf(anchorSignature);
  window.requestAnimationFrame(() => {
    const elements = blockElements(view);
    // A body the layout regrouped differently than it was saved gives no
    // reliable block-to-DOM map: show it without an entrance, never a wrong one.
    const mapped = elements.length === next.length;
    const entering = mapped
      ? changed.map((index) => elements[index]).filter((el): el is HTMLElement => Boolean(el))
      : [];
    if (options.arrival) markArrival(view, entering);
    if (options.snapshot) {
      playAiEditMotion(view, options.snapshot, { solidifyHeadings: true });
    } else if (!prefersReducedMotion()) {
      entering.forEach((element, index) => {
        const enterClass = isHeading(element) ? manuscript.solidify : manuscript.enter;
        const delay = Math.min(index, ENTER_STAGGERED - 1) * ENTER_STAGGER_MS;
        element.style.setProperty("--live-draft-delay", `${delay}ms`);
        element.classList.add(enterClass);
        window.setTimeout(() => {
          element.classList.remove(enterClass);
          element.style.removeProperty("--live-draft-delay");
        }, ENTER_MS);
      });
    }
    const parent = scroll?.parent;
    if (!parent || !scroll) return;
    const first = entering[0];
    // A scroll written while the reader's own is moving moved the box from
    // two threads at once, and Safari's screen and its hit testing parted
    // (lib/wheel-gesture): following the end waits for the box to be still,
    // and a reader who is scrolling keeps their place unheld.
    if (scroll.followsEnd && first) {
      moveScrollWhenStill(parent, () => {
        if (!first.isConnected) return;
        first.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }, "live-draft-follow-end");
      return;
    }
    if (scrollInMotion(parent)) return;
    if (!mapped || anchorIndex < 0) {
      if (Math.abs(parent.scrollTop - scroll.top) > 2) placeScrollTop(parent, scroll.top);
      return;
    }
    // Hold the reader's block where it was, frame by frame, until the paged
    // layout stops moving it: one restore of a scroll number is undone by
    // the pages being rebuilt a frame later.
    let frame = 0;
    let still = 0;
    const hold = () => {
      // A reader who starts scrolling takes the box over from the hold.
      if (scrollInMotion(parent)) return;
      const element = blockElements(view)[anchorIndex];
      if (element && parent.isConnected) {
        const drift =
          element.getBoundingClientRect().top - parent.getBoundingClientRect().top - scroll.anchorOffset;
        if (Math.abs(drift) > 0.5) {
          placeScrollTop(parent, parent.scrollTop + drift);
          still = 0;
        } else {
          still += 1;
        }
      }
      frame += 1;
      if (frame < ANCHOR_FRAMES && still < 4) window.requestAnimationFrame(hold);
    };
    hold();
  });
}

/**
 * When an AI draft becomes the member's page, its editing ribbon comes in above
 * the text. The ribbon sits in the same scroller as the page (sticky at its
 * top), so without help the whole document drops by the ribbon's height at the
 * moment the member is reading it. Before that frame paints, the scroller is
 * moved by exactly the distance the text was pushed, so the text stays where
 * it was and the ribbon slides in over the top edge instead.
 *
 * Two ways in: the same editor flips from draft to page (the text's position
 * was tracked while drafting, including as the reader scrolled), or the page
 * opens fresh in the place of its review (the ribbon's own height is taken).
 */
export function useRibbonRevealKeepsBodyStill(
  getDom: () => HTMLElement | null,
  draftActive: boolean,
  revealing: boolean,
  hydrated: boolean,
): void {
  const snapshotRef = useRef<number | null>(null);
  const settledRef = useRef(false);
  useLayoutEffect(() => {
    if (!draftActive) return;
    settledRef.current = false;
    const dom = getDom();
    if (!dom) return;
    const take = () => {
      snapshotRef.current = dom.getBoundingClientRect().top;
    };
    take();
    const scroller = scrollParentOf(dom);
    scroller?.addEventListener("scroll", take, { passive: true });
    return () => scroller?.removeEventListener("scroll", take);
  });
  useLayoutEffect(() => {
    if (draftActive) return;
    const dom = getDom();
    if (!dom) return;
    const before = snapshotRef.current;
    if (before !== null) {
      snapshotRef.current = null;
      settledRef.current = true;
      const scroller = scrollParentOf(dom);
      const delta = dom.getBoundingClientRect().top - before;
      if (scroller && Math.abs(delta) > 0.5) scroller.scrollTop += delta;
      return;
    }
    if (!revealing || !hydrated || settledRef.current) return;
    settledRef.current = true;
    const scroller = scrollParentOf(dom);
    const ribbon = scroller?.querySelector(".note-editor-toolbar-stack");
    if (!scroller || !(ribbon instanceof HTMLElement) || scroller.scrollTop > 0) return;
    const style = window.getComputedStyle(ribbon);
    const height =
      ribbon.offsetHeight +
      (Number.parseFloat(style.marginTop) || 0) +
      (Number.parseFloat(style.marginBottom) || 0);
    if (height > 0) scroller.scrollTop += height;
  }, [draftActive, getDom, hydrated, revealing]);
}
