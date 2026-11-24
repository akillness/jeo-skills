/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { flushDeferredInkPaints } from "@mrnote/core/web/components/console/editor/native-document/deferredInkPaint.ts";

/** On <html> while the browser prints a document's sheets. */
export const DOCS_NATIVE_PRINT_ATTR = "data-docs-native-print";
/** On the page surface (and its band overlay) that print. */
export const DOCS_NATIVE_PRINT_TARGET_ATTR = "data-docs-native-print-target";
/** On every ancestor of a target, which the print stylesheet unboxes. */
export const DOCS_NATIVE_PRINT_PATH_ATTR = "data-docs-native-print-path";

export type NativeDocumentPrintSource = {
  /** The editor's wrapper; the page surface and band overlay are inside it. */
  wrapper: () => HTMLElement | null;
  /** Whether the document prints as sheets now (a structural copy can be made). */
  printable: () => boolean;
};

const sources = new Set<NativeDocumentPrintSource>();
let installed = false;
let undo: (() => void) | null = null;

// Up to the next 1/1000": paper a hair shorter than its sheet (an A4 sheet is
// 1122.27 px, offsetHeight says 1122) sends the sheet's last 0.3 px, and a
// blank page, after it.
const inch = (px: number) => `${(Math.ceil((px / 96) * 1000) / 1000).toFixed(3)}in`;
// The sheet's own paper size in px (its layout boxes are whole pixels on
// screen: an A4 sheet's 1122.27 px reads 1122).
const sheetPaperPx = (sheet: HTMLElement) => {
  const style = getComputedStyle(sheet);
  const height = Number.parseFloat(style.getPropertyValue("--page-height-px")) ||
    Number.parseFloat(sheet.style.minHeight) || Number.parseFloat(style.minHeight) || sheet.offsetHeight;
  const width = Number.parseFloat(sheet.style.width) || Number.parseFloat(style.getPropertyValue("--page-width-px")) || sheet.offsetWidth;
  return { width: Math.max(width, sheet.offsetWidth), height: Math.max(height, sheet.offsetHeight) };
};

export function registerNativeDocumentPrint(source: NativeDocumentPrintSource): () => void {
  sources.add(source);
  if (!installed && typeof window !== "undefined") {
    installed = true;
    window.addEventListener("beforeprint", () => {
      undo?.();
      undo = markFrontmostDocument();
    });
    window.addEventListener("afterprint", () => {
      undo?.();
      undo = null;
    });
  }
  return () => {
    sources.delete(source);
  };
}

function frontmostSource(): { wrapper: HTMLElement; surface: HTMLElement } | null {
  const candidates: Array<{ wrapper: HTMLElement; surface: HTMLElement; focused: boolean; z: number }> = [];
  for (const source of sources) {
    const wrapper = source.wrapper();
    if (!wrapper?.isConnected || !source.printable()) continue;
    const surface = wrapper.querySelector<HTMLElement>('[data-testid="note-editor-page-surface"]');
    if (!surface || !surface.querySelector(".note-editor-content > article[data-page-sheet]")) continue;
    const win = wrapper.closest<HTMLElement>(".wm-window");
    const box = (win ?? wrapper).getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const z = Number.parseInt(getComputedStyle(win?.parentElement ?? win ?? wrapper).zIndex, 10);
    candidates.push({ wrapper, surface, focused: Boolean(win?.classList.contains("wm-window--focused")), z: Number.isFinite(z) ? z : 0 });
  }
  if (candidates.length === 0) return null;
  const focused = candidates.filter((candidate) => candidate.focused);
  if (focused.length === 1) return focused[0];
  // No window holds the focus (or several claim it): only an unambiguous
  // front window prints; otherwise the browser's own print stays as it was.
  if (focused.length === 0 && candidates.length === 1) return candidates[0];
  const pool = focused.length ? focused : candidates;
  const top = Math.max(...pool.map((candidate) => candidate.z));
  const front = pool.filter((candidate) => candidate.z === top);
  return front.length === 1 ? front[0] : null;
}

function markFrontmostDocument(): (() => void) | null {
  const target = frontmostSource();
  if (!target) return null;
  // The strokes still waiting in the paint queue are empty drawings.
  flushDeferredInkPaints();
  const { wrapper, surface } = target;
  const root = surface.querySelector<HTMLElement>(".note-editor-content");
  const sheets = root ? Array.from(root.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]")) : [];
  if (!root || sheets.length === 0) return null;
  const doc = surface.ownerDocument;
  const restores: Array<() => void> = [];
  const mark = (element: Element, name: string) => {
    if (element.hasAttribute(name)) return;
    element.setAttribute(name, "");
    restores.push(() => element.removeAttribute(name));
  };
  const overlay = wrapper.querySelector<HTMLElement>(".sheet-band-overlay");
  const targets = overlay ? [surface, overlay] : [surface];
  for (const element of targets) {
    mark(element, DOCS_NATIVE_PRINT_TARGET_ATTR);
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (targets.includes(node)) continue;
      mark(node, DOCS_NATIVE_PRINT_PATH_ATTR);
    }
  }
  mark(doc.documentElement, DOCS_NATIVE_PRINT_ATTR);

  // Each sheet is exactly its paper (the same inch length for the @page box
  // and the sheet's height), so sheet i starts on page i at the sum of the
  // papers before it with no page break to fragment the flow: a forced break
  // after a sheet a hair taller than its paper left a blank page, and the band
  // boxes, placed in the overlay's one continuous space, crept 0.8 pt up per
  // page against the sheets (Chromium, R161-D07).
  const papers = sheets.map((sheet) => {
    const paper = sheetPaperPx(sheet);
    const width = inch(paper.width);
    const height = inch(paper.height);
    return { width, height, heightPx: Number.parseFloat(height) * 96 };
  });
  const uniform = papers.every((paper) => paper.width === papers[0].width && paper.height === papers[0].height);
  const sheetRule = (selector: string, height: string) =>
    `${selector}{height:${height}!important;min-height:${height}!important;max-height:${height}!important;overflow:hidden!important;break-after:auto!important;break-before:auto!important}`;
  const sheetSelector = `[${DOCS_NATIVE_PRINT_TARGET_ATTR}] .note-editor-content>article[data-page-sheet]`;
  const style = doc.createElement("style");
  style.setAttribute("data-docs-native-print-style", "");
  style.textContent = uniform
    ? `@page{size:${papers[0].width} ${papers[0].height};margin:0}` + sheetRule(sheetSelector, papers[0].height)
    : papers.map((paper, index) => {
      const selector = `${sheetSelector}:nth-child(${index + 1} of article[data-page-sheet])`;
      return `@page mrn-native-${index}{size:${paper.width} ${paper.height};margin:0}${selector}{page:mrn-native-${index}}` + sheetRule(selector, paper.height);
    }).join("");
  doc.head.appendChild(style);
  restores.push(() => style.remove());

  // Each band box was placed at its sheet's screen place, gaps included; on
  // paper box i stands at sheet i's place, keeping the first box's offset.
  // So do the paper layer's boxes and the watermark's stamps (paperUnderlay.ts),
  // each moved with its own sheet.
  if (overlay) {
    const boxes = Array.from(overlay.querySelectorAll<HTMLElement>(":scope > .sheet-band-box"));
    const firstTop = Number.parseFloat(boxes[0]?.style.top ?? "");
    if (Number.isFinite(firstTop)) {
      let paperTop = 0;
      boxes.forEach((box, index) => {
        const before = box.style.top;
        if (index < papers.length && Number.isFinite(Number.parseFloat(before))) {
          box.style.top = `${firstTop + paperTop}px`;
          restores.push(() => { box.style.top = before; });
        }
        paperTop += papers[index]?.heightPx ?? 0;
      });
    }
  }
  const columns = root.closest<HTMLElement>(".note-editor-content-columns");
  const papersLayer = columns?.querySelector<HTMLElement>(":scope > .sheet-paper-underlay");
  const paperBoxes = papersLayer
    ? Array.from(papersLayer.querySelectorAll<HTMLElement>(":scope > .sheet-paper[data-sheet-index]"))
    : [];
  const screenTops = new Map<number, number>();
  for (const box of paperBoxes) {
    const top = Number.parseFloat(box.style.top);
    if (Number.isFinite(top)) screenTops.set(Number(box.dataset.sheetIndex), top);
  }
  const firstScreenTop = screenTops.get(0);
  if (firstScreenTop !== undefined) {
    const paperTops: number[] = [];
    let paperTop = 0;
    for (const paper of papers) {
      paperTops.push(paperTop);
      paperTop += paper.heightPx;
    }
    const stamps = columns?.querySelector<HTMLElement>(":scope > .sheet-watermark-overlay");
    const moved = [
      ...paperBoxes,
      ...(stamps ? Array.from(stamps.querySelectorAll<HTMLElement>(":scope > [data-sheet-index]")) : []),
    ];
    for (const box of moved) {
      const index = Number(box.dataset.sheetIndex);
      const screenTop = screenTops.get(index);
      const before = box.style.top;
      const top = Number.parseFloat(before);
      if (screenTop === undefined || paperTops[index] === undefined || !Number.isFinite(top)) continue;
      box.style.top = `${top - screenTop + firstScreenTop + paperTops[index]}px`;
      restores.push(() => { box.style.top = before; });
    }
  }
  return () => {
    for (const restore of restores.reverse()) restore();
  };
}
