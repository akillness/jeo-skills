/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Show me where this goes": bring a passage of an open document into view
 * and flash the block that holds it, without changing the document or the
 * user's selection. The AI panel docked beside an editor asks for it through
 * `requestDocumentLocate` (documentEditEvents.ts); the editor answers with
 * `locateAndFlashInEditor`. Editors that do not answer fall back to
 * `locateAndFlashInWindow`, a plain text search of the window's DOM.
 */

import type { EditorView } from "@tiptap/pm/view";
import { fillHollowPagesAt } from "@mrnote/core/web/components/console/editor/native-document/paged/pageHollowSheets.ts";

export const LOCATE_FLASH_CLASS = "mrn-locate-flash";
const FLASH_MS = 1800;

/** Text as a reader quotes it: runs of white space one space, and none of
 * the zero-width characters the page draws between letters (a set-as-letter
 * word's joiner, the empty-line struts: U+2060, U+200B, U+FEFF), which a text
 * node's parent may hold beside the letters it shows. */
function normalize(text: string): string {
  return text.replace(/[\u200b\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Scroll ``element`` to the middle of its scroller and flash it once. */
export function flashLocatedElement(element: HTMLElement): void {
  element.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  element.classList.remove(LOCATE_FLASH_CLASS);
  // Restart the animation when the same block is located twice in a row.
  void element.offsetWidth;
  element.classList.add(LOCATE_FLASH_CLASS);
  window.setTimeout(() => element.classList.remove(LOCATE_FLASH_CLASS), FLASH_MS);
}

/**
 * Find the first needle in the editor's document and flash its block. A
 * passage inside a table flashes the whole table: a row being added is
 * located by the table it joins.
 */
export function locateAndFlashInEditor(
  view: EditorView,
  needles: readonly string[],
): boolean {
  const doc = view.state.doc;
  for (const raw of needles) {
    const needle = normalize(raw);
    if (!needle) continue;
    const found: { pos: number | null } = { pos: null };
    doc.descendants((node, pos) => {
      if (found.pos !== null) return false;
      if (!node.isTextblock) return true;
      if (normalize(node.textContent).includes(needle)) found.pos = pos;
      return false;
    });
    if (found.pos === null) continue;
    let target = found.pos;
    const resolved = doc.resolve(found.pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (resolved.node(depth).type.name === "table") {
        target = resolved.before(depth);
        break;
      }
    }
    // A far page may stand hollow (paged/pageHollowSheets): drawn first.
    fillHollowPagesAt(view, target);
    const element = view.nodeDOM(target);
    if (element instanceof HTMLElement) {
      flashLocatedElement(element);
      return true;
    }
  }
  return false;
}

/**
 * The first block under `root` whose own text contains a needle, without
 * touching it: the run card's change list rings it on hover and flashes it
 * on click. Null when no needle is on screen.
 */
export function findBlockInWindowBody(
  root: HTMLElement,
  needles: readonly string[],
): HTMLElement | null {
  for (const raw of needles) {
    const needle = normalize(raw);
    if (!needle) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !normalize(parent.textContent ?? "").includes(needle)) {
        continue;
      }
      return (
        parent.closest<HTMLElement>(
          "table, p, li, h1, h2, h3, h4, h5, h6, td, th, [data-block-id]",
        ) ?? parent
      );
    }
  }
  return null;
}

/** The body of the window with this id, or of every page window when null. */
export function windowBodiesFor(windowId: string | null): HTMLElement[] {
  if (typeof document === "undefined") return [];
  if (windowId) {
    const root = document.querySelector<HTMLElement>(
      `[data-window-id="${CSS.escape(windowId)}"] .wm-body`,
    );
    return root ? [root] : [];
  }
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-window-id]:not([data-window-type="ai_panel"]) .wm-body',
    ),
  );
}

/**
 * Fallback for editors that do not answer the locate request: the first
 * element in the window's body whose own text contains a needle.
 */
export function locateAndFlashInWindow(
  windowId: string,
  needles: readonly string[],
): boolean {
  for (const root of windowBodiesFor(windowId)) {
    const block = findBlockInWindowBody(root, needles);
    if (block) {
      flashLocatedElement(block);
      return true;
    }
  }
  return false;
}
