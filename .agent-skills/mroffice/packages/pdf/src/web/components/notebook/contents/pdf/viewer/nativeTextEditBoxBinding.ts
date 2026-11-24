/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { samePdfTextCharacters } from "../../../../../lib/pdf/native-text-hard-groups";
import type {
  PdfNativeListTextSelectionItemEvidence,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";
import {
  summarizePdfNativeSelectionItems,
} from "../../../../../lib/pdf/engine/native/list-text-model";
import {
  pdfNativeParagraphBoxHasHandle,
  type PdfNativeParagraphEditBox,
} from "../../../../../lib/pdf/native-paragraph-edit-boxes";
import {
  PDF_NATIVE_TEXT_ITEM_INDEX_ATTR,
  PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR,
  PDF_NATIVE_TEXT_TYPOGRAPHY_BOUND_ATTR,
  PDF_NATIVE_TEXT_EDITED_CLIP,
  pdfTextLayerLocalRect,
  unscaledPdfTextFrame,
} from "./nativeTextDom";
import {
  type PdfNativeTextEditBoxPresentation,
  applyNativeTextEditBoxPresentation,
} from "./nativeTextEditBoxPresentation";

export function bindNativeTextItemEvidence(
  layer: HTMLElement,
  items: readonly (PdfNativeListTextSelectionItemEvidence | null)[],
  options?: Readonly<{
    nativeTextDivs?: readonly HTMLElement[];
    presentation?: PdfNativeTextEditBoxPresentation;
    presentationForIndex?: (
      itemIndex: number,
    ) => PdfNativeTextEditBoxPresentation;
  }>,
): boolean {
  const spans = Array.from(layer.querySelectorAll<HTMLElement>("span"));
  for (const span of spans) {
    span.removeAttribute(PDF_NATIVE_TEXT_ITEM_INDEX_ATTR);
    applyNativeTextEditBoxPresentation(span, {
      active: false,
      interactive: false,
      label: "",
    });
  }
  const indexedSpans = options?.nativeTextDivs ?? spans;
  if (indexedSpans.length !== items.length) return false;
  let bound = false;
  indexedSpans.forEach((span, index) => {
    const item = items[index];
    if (!layer.contains(span) || !item) return;
    if (span.textContent !== item.str) {
      // A right-to-left run read in logical order (pdfJsRtlItemsInLogicalOrder):
      // the span pdf.js drew holds the same letters; it takes the order too,
      // so a copy reads right.
      if (!samePdfTextCharacters(span.textContent ?? "", item.str)) return;
      span.textContent = item.str;
    }
    span.setAttribute(PDF_NATIVE_TEXT_ITEM_INDEX_ATTR, String(index));
    const presentation =
      options?.presentationForIndex?.(index) ?? options?.presentation;
    if (presentation) {
      applyNativeTextEditBoxPresentation(span, presentation);
    }
    bound = true;
  });
  return bound;
}

export function bindNativeTextParagraphEditBoxes(
  layer: HTMLElement,
  paragraphs: readonly PdfNativeParagraphEditBox[],
  indexedSpans: readonly HTMLElement[],
  presentationForParagraph: (
    paragraph: PdfNativeParagraphEditBox,
  ) => PdfNativeTextEditBoxPresentation,
  /** The page as shown, in px (the paragraphs' viewport): a turned page's
   * boxes are set in the turned text layer's own frame. */
  pageSize?: Readonly<{ width: number; height: number }>,
): void {
  const rotation = Number(layer.dataset.mainRotation ?? 0);
  const turned =
    rotation !== 0 &&
    [90, 180, 270].includes(rotation) &&
    Number(pageSize?.width) > 0 &&
    Number(pageSize?.height) > 0;
  for (const stale of Array.from(
    layer.querySelectorAll<HTMLElement>(
      `span[${PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR}]`,
    ),
  )) {
    stale.remove();
  }
  for (const paragraph of paragraphs) {
    // (A box of one item the reader read from several runs of ink has a
    // handle too: no one span of the layer holds its words.)
    if (!pdfNativeParagraphBoxHasHandle(paragraph)) continue;
    const overlay = layer.ownerDocument.createElement("span");
    const summaryText =
      paragraph.selectionItem?.str ??
      summarizePdfNativeSelectionItems(paragraph.items);
    overlay.setAttribute(PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR, paragraph.id);
    overlay.textContent = summaryText;
    const box = turned
      ? pdfTextLayerLocalRect(
          paragraph,
          rotation,
          pageSize!.width,
          pageSize!.height,
        )
      : paragraph;
    overlay.style.left = `${box.x * 100}%`;
    overlay.style.top = `${box.y * 100}%`;
    overlay.style.width = `${box.width * 100}%`;
    overlay.style.height = `${box.height * 100}%`;
    overlay.style.display = "block";
    overlay.style.pointerEvents = "auto";
    overlay.style.zIndex = "2";
    overlay.style.color = "transparent";
    overlay.style.setProperty("-webkit-text-fill-color", "transparent");
    overlay.style.whiteSpace = "pre-wrap";
    // The summary is a handle for clicking and naming the paragraph, not a
    // second copy of its text: selectable, a select-all copy repeated every
    
    overlay.style.userSelect = "none";
    overlay.style.setProperty("-webkit-user-select", "none");
    // Nor a second reading of it: the accessibility tree read every
    // multi-run paragraph twice, the page's own spans and this handle
    // (user audit C-0038).
    overlay.setAttribute("aria-hidden", "true");
    // A clip path, not `overflow: hidden`: the paragraph's dashed frame is
    // this overlay's own ::before outline, drawn just outside its box, and
    // overflow clipping cut it off (a multi-item line showed no frame).
    overlay.style.clipPath = PDF_NATIVE_TEXT_EDITED_CLIP;
    // The box is the paragraph's frame turned about its centre, as an
    // edited line's is (synchronizePdfNativeTextEditedOutline); on a turned
    // page by its angle less the page's, which leaves upright text upright.
    const angle = turned
      ? ((((paragraph.angle ?? 0) - rotation) % 360) + 540) % 360 - 180
      : (paragraph.angle ?? 0);
    overlay.style.transform =
      Math.abs(angle) > 1e-6 ? `rotate(${angle}deg)` : "none";
    // The frame is laid out centred on the turned text (its x/y are the
    // centre less half its size), so it turns about its centre on any page:
    // about the text layer's top-left default, a turned paragraph's frame
    
    if (turned || Math.abs(angle) > 1e-6) overlay.style.transformOrigin = "50% 50%";
    unscaledPdfTextFrame(overlay);
    // The paragraph's typography is its body's: the run holding the most
    // of its words, not its first. A footnote opening on a superscript
    // marker set the whole editor in the marker's five-glyph symbol face
    
    // arXiv 1706.03762 p.1 "*Equal contribution").
    const bodyItem = paragraph.items.reduce<(typeof paragraph.items)[number] | undefined>(
      (best, item) => (!best || item.str.trim().length > best.str.trim().length ? item : best), undefined);
    const sourceSpan = indexedSpans[bodyItem?.itemIndex ?? -1];
    if (sourceSpan && layer.contains(sourceSpan)) {
      const computed =
        sourceSpan.ownerDocument.defaultView?.getComputedStyle(sourceSpan);
      const fontSize = Number.parseFloat(computed?.fontSize ?? "");
      if (
        computed &&
        computed.fontFamily.trim().length > 0 &&
        Number.isFinite(fontSize) &&
        fontSize > 0
      ) {
        overlay.style.fontFamily = computed.fontFamily;
        // The source span's size is set --min-font-size times larger and
        // scaled back down by its transform; this handle has no such scale.
        const minFontSize = Number.parseFloat(
          computed.getPropertyValue("--min-font-size"),
        );
        overlay.style.fontSize =
          Number.isFinite(minFontSize) && minFontSize > 1
            ? `${fontSize / minFontSize}px`
            : computed.fontSize;
        overlay.style.fontStyle = computed.fontStyle;
        overlay.style.fontWeight = computed.fontWeight;
        overlay.style.fontStretch = computed.fontStretch;
        overlay.style.fontKerning = computed.fontKerning;
        overlay.style.fontFeatureSettings = computed.fontFeatureSettings;
        overlay.style.fontVariationSettings = computed.fontVariationSettings;
        overlay.style.fontVariantLigatures = computed.fontVariantLigatures;
        overlay.style.fontVariantCaps = computed.fontVariantCaps;
        overlay.style.fontVariantEastAsian = computed.fontVariantEastAsian;
        overlay.style.fontVariantNumeric = computed.fontVariantNumeric;
        overlay.style.fontVariantPosition = computed.fontVariantPosition;
        overlay.style.fontSynthesis = computed.fontSynthesis;
        overlay.style.fontOpticalSizing = computed.fontOpticalSizing;
        overlay.style.letterSpacing = computed.letterSpacing;
        overlay.style.wordSpacing = computed.wordSpacing;
        overlay.style.lineHeight = computed.lineHeight;
        overlay.style.textAlign = computed.textAlign;
        overlay.style.direction = computed.direction;
        overlay.style.unicodeBidi = computed.unicodeBidi;
        overlay.style.textRendering = computed.textRendering;
        overlay.setAttribute(PDF_NATIVE_TEXT_TYPOGRAPHY_BOUND_ATTR, "true");
      }
    }
    applyNativeTextEditBoxPresentation(
      overlay,
      presentationForParagraph(paragraph),
      summaryText,
    );
    layer.appendChild(overlay);
  }
}
