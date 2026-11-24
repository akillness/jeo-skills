/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { holdPdfTextLayerGhost } from "../../../../../lib/pdf/text-layer-ghost";
import { recordPdfNativeTextLineLineage } from "../../../../../lib/pdf/native-text-line-lineage";
export { nativeListTextItemEvidence } from "../../../../../lib/pdf/native-list-text-item-evidence";
import {
  PDF_NATIVE_TEXT_EDIT_BOX_ATTR,
  PDF_NATIVE_TEXT_EDITABLE_ATTR,
  PDF_NATIVE_TEXT_EDIT_SELECTED_ATTR,
  PDF_NATIVE_TEXT_OTHER_PAGE_ATTR,
  PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR,
  nativeTextEditOriginalAttributes,
} from "./nativeTextDom";
import type {
  PdfNativeParagraphEditBlockReason,
} from "../../../../../lib/pdf/native-paragraph-edit-boxes";
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";

export type PdfNativeTextEditBoxPresentation = Readonly<{
  active: boolean;
  interactive: boolean;
  label: string;
  disabledReason?: string;
  /** The box sits on a rendered page that is not the current page. */
  otherPage?: boolean;
  /** Not interactive only for a moment (the reader checking the revision an
   *  edit just saved): the box keeps its live frame instead of turning grey,
   *  so every frame on the page no longer blinks after each edit. */
  transient?: boolean;
}>;

/** Empties a page's text layer before it is rebuilt. During a swap to the
 * revision an edit just saved, the boxes it showed are held meanwhile. */
export function emptyPdfTextLayerForRebuild(layer: HTMLElement | null | undefined, swapStartedAt: number): void {
  if (!layer) return;
  // On a busy machine the rebuild starts seconds after the swap; held only
  // within 3 s, the boxes went out and came back after each edit.
  if (performance.now() - swapStartedAt < 15_000) holdPdfTextLayerGhost(layer, 12_000);
  // Each line's id goes on to the box that continues it in the rebuilt layer.
  recordPdfNativeTextLineLineage(layer);
  // The box a line's editor is open in stays, out of the page's boxes (no
  // box, item or paragraph of its own any more), until the editor goes over
  // to the rebuilt box of its line (PdfNativeListTextEditDialog). Emptied
  // with the rest, the editor -- frame, handles, caret and focus -- went out
  // for the second the revision took to be read in (quick-operation probe
  
  const kept = [...layer.querySelectorAll<HTMLElement>('[data-pdf-native-text-inline-editing="true"]')];
  if (kept.length === 0) {
    layer.replaceChildren();
    return;
  }
  const keep = new Set<Node>();
  for (const host of kept) {
    host.setAttribute(PDF_NATIVE_TEXT_HOST_KEPT_ATTR, "true");
    host.removeAttribute(PDF_NATIVE_TEXT_EDIT_BOX_ATTR);
    host.removeAttribute(PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR);
    host.removeAttribute("data-pdf-native-text-item-index");
    for (let node: Node | null = host; node && node !== layer; node = node.parentNode) keep.add(node);
  }
  // Everything else goes, the kept boxes' own wrappers emptied of all but them.
  const prune = (parent: Node) => {
    for (const child of [...parent.childNodes]) {
      if (!keep.has(child)) parent.removeChild(child);
      else if (!kept.includes(child as HTMLElement)) prune(child);
    }
  };
  prune(layer);
}
/** The box an open editor is in, kept over a rebuild of its layer. */
export const PDF_NATIVE_TEXT_HOST_KEPT_ATTR = "data-pdf-native-text-host-kept";

export function applyNativeTextEditBoxPresentation(
  span: HTMLElement,
  presentation: PdfNativeTextEditBoxPresentation,
  accessibleText?: string,
): void {
  if (!presentation.active) {
    if (span.ownerDocument?.activeElement === span) span.blur();
    if (span.hasAttribute(PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR)) {
      span.style.pointerEvents = "none";
    }
    span.removeAttribute(PDF_NATIVE_TEXT_EDIT_BOX_ATTR);
    span.removeAttribute(PDF_NATIVE_TEXT_EDITABLE_ATTR);
    span.removeAttribute(PDF_NATIVE_TEXT_EDIT_SELECTED_ATTR);
    span.removeAttribute(PDF_NATIVE_TEXT_OTHER_PAGE_ATTR);
    const original = nativeTextEditOriginalAttributes.get(span);
    if (original) {
      for (const [name, value] of [
        ["aria-disabled", original.ariaDisabled],
        ["aria-label", original.ariaLabel],
        ["role", original.role],
        ["tabindex", original.tabIndex],
        ["title", original.title],
      ] as const) {
        if (value === null) span.removeAttribute(name);
        else span.setAttribute(name, value);
      }
      nativeTextEditOriginalAttributes.delete(span);
    }
    return;
  }

  if (!nativeTextEditOriginalAttributes.has(span)) {
    nativeTextEditOriginalAttributes.set(
      span,
      Object.freeze({
        ariaDisabled: span.getAttribute("aria-disabled"),
        ariaLabel: span.getAttribute("aria-label"),
        role: span.getAttribute("role"),
        tabIndex: span.getAttribute("tabindex"),
        title: span.getAttribute("title"),
      }),
    );
  }

  const text = accessibleText?.trim() || span.textContent?.trim() || "";
  if (span.hasAttribute(PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR)) {
    span.style.pointerEvents = "auto";
  } else if (span.style.pointerEvents === "none") {
    // A swap to the revision an edit saved holds every box inert for a
    
    // click again once it is presented: left "none", every standalone line
    // the swap had caught (a chart's labels) stayed unclickable in Safari,
    
    span.style.pointerEvents = "";
  }
  span.setAttribute(PDF_NATIVE_TEXT_EDIT_BOX_ATTR, "true");
  span.setAttribute(
    PDF_NATIVE_TEXT_EDITABLE_ATTR,
    presentation.interactive ? "true" : presentation.transient ? "pending" : "false",
  );
  if (presentation.otherPage) {
    span.setAttribute(PDF_NATIVE_TEXT_OTHER_PAGE_ATTR, "true");
  } else {
    span.removeAttribute(PDF_NATIVE_TEXT_OTHER_PAGE_ATTR);
  }
  span.setAttribute("role", "button");
  const label = text ? `${presentation.label}: ${text}` : presentation.label;
  span.setAttribute(
    "aria-label",
    !presentation.interactive && presentation.disabledReason
      ? `${label}. ${presentation.disabledReason}`
      : label,
  );
  span.tabIndex = -1;
  if (presentation.interactive) {
    span.removeAttribute("aria-disabled");
    span.title = presentation.label;
  } else {
    span.removeAttribute(PDF_NATIVE_TEXT_EDIT_SELECTED_ATTR);
    span.setAttribute("aria-disabled", "true");
    span.title = presentation.disabledReason ?? presentation.label;
  }
}

export function normalizeNativeTextEditBoxTabStops(
  root: HTMLElement,
  preferred?: HTMLElement | null,
): void {
  const boxes = Array.from(
    root.querySelectorAll<HTMLElement>(
      `span[${PDF_NATIVE_TEXT_EDIT_BOX_ATTR}="true"]`,
    ),
  );
  if (boxes.length === 0) return;
  const active =
    preferred && boxes.includes(preferred)
      ? preferred
      : root.ownerDocument?.activeElement instanceof HTMLElement &&
          boxes.includes(root.ownerDocument.activeElement)
        ? root.ownerDocument.activeElement
        : boxes[0];
  for (const box of boxes) box.tabIndex = box === active ? 0 : -1;
}

export type PdfCaretAwareDocument = Document &
  Readonly<{
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => Readonly<{ offsetNode: Node; offset: number }> | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }>;

export function textOffsetWithinNativeTextHost(
  host: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (node !== host && !host.contains(node)) return null;
  const range = host.ownerDocument.createRange();
  try {
    range.setStart(host, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

export function readNativeTextPointerCaretOffset(
  host: HTMLElement,
  point: Readonly<{ clientX: number; clientY: number }> | null,
): number | null {
  if (!point) return null;
  const ownerDocument = host.ownerDocument as PdfCaretAwareDocument;
  const caretPosition = ownerDocument.caretPositionFromPoint?.(
    point.clientX,
    point.clientY,
  );
  const caretRange = caretPosition
    ? null
    : ownerDocument.caretRangeFromPoint?.(point.clientX, point.clientY);
  const pointOffset = caretPosition
    ? textOffsetWithinNativeTextHost(
        host,
        caretPosition.offsetNode,
        caretPosition.offset,
      )
    : caretRange
      ? textOffsetWithinNativeTextHost(
          host,
          caretRange.startContainer,
          caretRange.startOffset,
        )
      : null;
  const textLength = host.textContent?.length ?? 0;
  if (pointOffset !== null) {
    return Math.max(0, Math.min(textLength, pointOffset));
  }
  const rect = host.getBoundingClientRect();
  if (!(rect.width > 0)) return null;
  const fraction = Math.max(
    0,
    Math.min(1, (point.clientX - rect.left) / rect.width),
  );
  return Math.round(textLength * fraction);
}

export function nativeTextEditBoxRefusalKey(
  sourceSha256: string,
  pageNumber: number,
  itemIndex: number,
  endItemIndex = itemIndex,
): string {
  return `${sourceSha256.toLowerCase()}:${pageNumber}:${itemIndex}-${endItemIndex}`;
}


export function pdfNativeParagraphEditBlockedCopy(
  reason: PdfNativeParagraphEditBlockReason,
  t: PdfRibbonTranslator,
): string {
  const copy: Record<PdfNativeParagraphEditBlockReason, string> = {
    "too-many-items": "pdf.viewer.paragraphTooManyItems",
    "noncontiguous-items": "pdf.viewer.paragraphNoncontiguousItems",
    "mixed-font-items": "pdf.viewer.paragraphMixedFontItems",
    "incomplete-line-boundaries":
      "pdf.viewer.paragraphIncompleteLineBoundaries",
    "unsupported-geometry": "pdf.viewer.paragraphUnsupportedGeometry",
    "not-text": "pdf.viewer.paragraphNotText",
  };
  return t(copy[reason]);
}
