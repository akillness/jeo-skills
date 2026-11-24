/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The page's paper as its own layer, under the header and footer.
 *
 * Word draws the header and footer stories under the whole body: the body's
 * text and its objects (Behind Text ones included) stand on the header's
 * pictures, and the page colour and a picture watermark are not tinted by
 * anything drawn over them. A sheet here is ProseMirror's own node and its
 * own stacking context, so nothing could go between its paper and its
 * lines: the header and footer overlay was drawn over the sheets and
 * multiplied onto them (white paper only), and the body's objects cut holes
 * in it.
 *
 * Instead the paper is drawn by a layer of its own under everything
 * (`.sheet-paper-underlay`, one box per measured sheet, z -1), the watermark
 * and the header and footer overlay are drawn over it and still under the
 * content (z -1, after it in tree order), and each measured sheet's own paper
 * is made clear (`--doc-sheet-paper`). A sheet not measured yet keeps its own
 * paper, so a new page is never the desk's colour for a frame. Its drop
 * shadow goes with the paper (`--doc-sheet-drop`): over a clear page below it
 * would have shown.
 *
 * The print copy (structuralPrint) draws its bands inside each sheet copy and
 * keeps the sheets' own paper: the attribute is not carried over to it.
 *
 * `window.__docsPaperUnderlayOff = true` draws the layers as before.
 */

/** On the content columns host while the paper is drawn as its own layer. */
export const PAPER_UNDERLAY_ATTR = "data-docs-paper-underlay";

export function paperUnderlayOff(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Window & { __docsPaperUnderlayOff?: boolean }).__docsPaperUnderlayOff === true
  );
}

/** Whether `element` (the content columns host or anything in it) draws the paper as its own layer. */
export function paperUnderlayActive(element: Element | null | undefined): boolean {
  const columns = element?.closest?.(".note-editor-content-columns");
  return Boolean(columns?.hasAttribute(PAPER_UNDERLAY_ATTR));
}

export interface PaperBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Whether the measured boxes stand where their sheets are: while the page is
 * still settling every box is measured at the origin (useDocumentPagedSurface),
 * and a clear sheet over a paper drawn elsewhere showed the desk.
 */
export function paperBoxesPlaced(boxes: readonly PaperBox[]): boolean {
  if (boxes.length === 0) return false;
  if (boxes.length === 1) return boxes[0].width > 0 && boxes[0].height > 0;
  return boxes.some((box) => box.top !== boxes[0].top || box.left !== boxes[0].left);
}

/**
 * The rule that clears the first `count` sheets' own paper under the host
 * whose attribute value is `scope` (the paper layer draws theirs). A sheet
 * past them (a page added since the last measurement) keeps its own.
 */
export function paperUnderlaySheetRule(scope: string, count: number): string {
  if (count <= 0) return "";
  const value = scope.replace(/["\\]/g, "\\$&");
  return (
    `.note-editor-content-columns[${PAPER_UNDERLAY_ATTR}="${value}"] .note-editor-content:not(.sheet-band-story)` +
    ` > article[data-page-sheet]:nth-child(-n + ${count} of article[data-page-sheet])` +
    "{--doc-sheet-paper:transparent;--doc-sheet-paper-image:none;--doc-sheet-drop:0 0 transparent}"
  );
}
