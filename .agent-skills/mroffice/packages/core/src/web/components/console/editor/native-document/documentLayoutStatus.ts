/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
export const DOCUMENT_AUTO_LINE_SPACING_PENDING = "data-docs-auto-line-spacing-pending";
/** Sent (bubbling) from an in-line formula's preview when it has been typeset
 * where its placeholder stood: its line breaks may have changed with no change
 * to the document (lazyKatex, InlineMath). */
export const INLINE_FORMULA_TYPESET_EVENT = "docs-inline-formula-typeset";
export const DOCUMENT_WORD_CJK_SPACING_PENDING = "data-docs-word-cjk-spacing-pending";
/** The first layout is not done but has run past its time: its pages are shown. */
export const INITIAL_SETTLE_SHOWN_ATTR = "data-pagination-settle-shown";
/** Exact-line baselines of far pages wait for the layout to settle
 * (documentExactLineBaseline): they move no line, but print shows them. */
export const DOCUMENT_EXACT_LINE_PENDING = "data-docs-exact-line-pending";
/** The text engine is about to correct lines the browser breaks elsewhere
 * (documentEngineLineBreaks, flag `docs`): the page ledger waits, and asks
 * for them at once with LAYOUT_METRICS_FLUSH_EVENT. */
export const DOCUMENT_ENGINE_LINES_PENDING = "data-docs-engine-lines-pending";
/** Paragraphs the text engine read while a face file it needs had not come:
 * they keep the browser's lines until it comes, past the page ledger's short
 * hold (documentEngineLineBreaks FACE_HOLD_MS). A print waits for them
 * (useDocumentSurfaceReadiness): taken before, its pages had the browser's
 * lines where the screen, moments later, had the engine's. */
export const DOCUMENT_ENGINE_FACES_WAITING = "data-docs-engine-faces-waiting";
/** Paragraphs Word's narrowed spaces have not been measured for yet
 * (justifiedSpaceShrink): a page measured before them reads a line too many. */
export const DOCUMENT_JUSTIFIED_SHRINK_PENDING = "data-docs-justified-shrink-pending";
/**
 * The page ledger has a change it cannot compose yet — an IME composition is
 * open, or a document whose pass is felt waits for typing to pause. While it
 * stands, a sheet whose text has run past its foot may GROW (the stylesheet
 * lifts `contain: size`), so the words wait on paper above the footer band,
 * never drawn over it; the next pass restores the paper height.
 */
export const PAGE_LEDGER_DEFERRED_ATTR = "data-pagination-ledger-deferred";
/**
 * The page ledger is still laying pages out in the background: a long
 * document shown as soon as its first pages were laid out, or the pages after
 * an edit of a long one. The pages after the background's position are still
 * provisional, so nothing may capture them as the document's layout (a saved
 * pagination projection, a lifecycle "settled" fact).
 */
export const PAGE_LEDGER_BACKGROUND_ATTR = "data-pagination-background";
/**
 * The collaboration bridge is still filling an empty view with a long
 * document, a few hundred blocks per task. The sheets present are not the
 * whole document yet: the page ledger lays nothing out until the last chunk
 * landed, and nothing may capture the layout meanwhile.
 */
export const PAGED_BULK_FILL_ATTR = "data-paged-bulk-filling";
/**
 * Diagnostic only: the page ledger stopped on a layout that alternated with
 * another until its pass limit (a two-layout cycle no hold could break). The
 * pages it left are the document's layout; nothing waits on this.
 */
export const PAGE_LEDGER_CYCLE_ATTR = "data-pagination-ledger-cycle";
/** Transient root-only layout flags are not authored DOM changes. */
const layoutStatusNames = new Set([
  DOCUMENT_AUTO_LINE_SPACING_PENDING,
  "data-pagination-initial-settling",
  INITIAL_SETTLE_SHOWN_ATTR,
  "data-pagination-stalled",
  "aria-busy",
  DOCUMENT_WORD_CJK_SPACING_PENDING,
  DOCUMENT_ENGINE_LINES_PENDING,
  DOCUMENT_ENGINE_FACES_WAITING,
  DOCUMENT_JUSTIFIED_SHRINK_PENDING,
  DOCUMENT_EXACT_LINE_PENDING,
  "data-docs-page-bands-pending",
  "data-document-display-fonts",
  "data-docs-display-fonts-pending",
  "data-docs-display-fonts-settling",
  "data-pagination-ledger-shadow",
  "data-pagination-ledger-mismatch",
  "data-pagination-ledger-passes",
  PAGE_LEDGER_DEFERRED_ATTR,
  PAGE_LEDGER_BACKGROUND_ATTR,
  PAGED_BULK_FILL_ATTR,
  PAGE_LEDGER_CYCLE_ATTR,
  // A document's parts coming in (NoteEditor, from lib/document-page-parts):
  // read by the ledger as state, styled by nothing. Taken as authored, each
  // part's loading true/false and count left cleared every page's measures:
  // R286-D01 (5 parts) measured all its pages again on each part, five times
  
  "data-document-parts-loading",
  "data-document-parts-left",
  "data-document-parts-eager",
]);

const layoutStatusChangedAt = new WeakMap<HTMLElement, number>();

/** How long since a layout flag of this root last changed (a pass counted, a
 * background step, a projection pending): Infinity when none ever did. */
export function msSinceLayoutStatusChange(root: HTMLElement): number {
  const at = layoutStatusChangedAt.get(root);
  return at === undefined ? Number.POSITIVE_INFINITY : performance.now() - at;
}

/** Whether `name` is one of the transient root-only layout flags above. */
export function isDocumentLayoutStatusAttribute(name: string): boolean {
  return layoutStatusNames.has(name);
}

export function writeDocumentLayoutStatus(
  root: HTMLElement | null | undefined,
  name: string,
  value: string | null,
  owner?: EditorView | { view: EditorView } | null,
): void {
  if (
    !root ||
    !layoutStatusNames.has(name) ||
    root.getAttribute(name) === value
  )
    return;
  let observer: { stop(): void; start(): void } | undefined;
  try {
    const view = owner ? ("dom" in owner ? owner : owner.view) : undefined;
    // Tiptap can return a proxy during unmount: reading dom, not obtaining
    // the view itself, throws. Keep the complete view inspection guarded.
    if (view?.dom === root && !view.isDestroyed) {
      observer = (view as EditorView & {domObserver?: {stop():void; start():void}}).domObserver;
    }
  } catch {
    // Only the detached root flag is cleaned up; no editor is reactivated.
  }
  // ProseMirror's own stop() retains outstanding content mutations in its
  // queue. Only this synchronous attribute write is excluded; user input
  // cannot interleave, and the observer is restored even if the write fails.
  observer?.stop();
  try {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  } finally {
    observer?.start();
  }
  layoutStatusChangedAt.set(root, performance.now());
  // The stylesheet hides the page overlays while the page's own editor is
  // settling. It reads that off the columns box around the editor (a header
  // or footer story editor inside the layer settles on its own and hides
  // nothing): a :has() reaching into the editor for the root's flag was
  // re-evaluated on every keystroke and recalculated the whole document's
  // styles each time.
  if (name === INITIAL_SETTLE_SHOWN_ATTR && !root.classList.contains("sheet-band-story")) {
    const columns = root.closest<HTMLElement>(".note-editor-content-columns");
    if (value === "true") columns?.setAttribute("data-editor-settle-shown", "true");
    else columns?.removeAttribute("data-editor-settle-shown");
  }
  if (name === "data-pagination-initial-settling" && !root.classList.contains("sheet-band-story")) {
    const columns = root.closest<HTMLElement>(".note-editor-content-columns");
    if (columns) {
      if (value === "true") columns.setAttribute("data-editor-initial-settling", "true");
      else columns.removeAttribute("data-editor-initial-settling");
    }
  }
}

















export function measureOutsideEditorObservation<T>(view: EditorView | null | undefined, measure: () => T): T {
  let observer: { stop(): void; start(): void } | undefined;
  try {
    if (view && !view.isDestroyed) {
      observer = (view as EditorView & {domObserver?: {stop():void; start():void}}).domObserver;
    }
  } catch {
    // A view torn down mid-call measures unobserved anyway.
  }
  observer?.stop();
  try {
    return measure();
  } finally {
    observer?.start();
  }
}

const IMPORTED_FROM_SOURCE = new SheetFact((node) => node.attrs.source?.adapter === "docx");
/** The hook starts after hydration. Absence of a loading flag is therefore
 * not readiness: wait for an explicit success, empty plan, or failure outcome. */
export function sourceFontPlanIsReady(doc: PmNode, root: HTMLElement, wait: boolean): boolean {
  if (!wait) return true;
  const status = root.getAttribute("data-document-display-fonts");
  if (status === "available" || status === "unbound" || status === "unavailable") return true;
  return !IMPORTED_FROM_SOURCE.inDoc(doc);
}

/**
 * Dispatched on the editor root by the page ledger when a metric projection
 * (Word Auto line spacing, CJK spacing) is still waiting for its animation
 * frame while the ledger must compose the page NOW, in the frame of the
 * keystroke: the projection measures synchronously instead, as Word lays
 * out the line boxes a page depends on before it paints the page.
 */
export const LAYOUT_METRICS_FLUSH_EVENT = "mrn-layout-metrics-flush";
