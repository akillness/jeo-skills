/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { NativePdfFreeTextAnnotation } from "../../../../../lib/pdf/native-free-text-annotations";
import type {
  PdfNativeVectorSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import type { PdfLinkOverlay } from "@mrnote/core/web/lib/pdf/links.ts";
import type {
  NativePdfLinkAnnotation,
} from "../../../../../lib/pdf/native-link-annotations";
import type {
  NativePdfTextAnnotation,
  NativePdfTextMarkupAnnotation,
} from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";
import type { NativePdfInkStroke } from "../../../../../lib/pdf/native-ink-annotations";
import type { StickyNoteAnnotation } from "@mrnote/core/web/lib/pdf/sticky-notes.ts";
import type { InkAnnotation } from "@mrnote/core/web/lib/pdf/ink.ts";
import type { SignatureAnnotation } from "@mrnote/core/web/lib/pdf/signatures.ts";
import type { StampAnnotation } from "../../../../../lib/pdf/stamps-annotation";
import type {
  NativePdfStampAnnotation,
} from "../../../../../lib/pdf/native-stamp-annotations";
import type { RedactionAnnotation } from "@mrnote/core/web/lib/pdf/redaction.ts";
import type { ShapeAnnotation } from "@mrnote/core/web/lib/pdf/shapes.ts";
import type {
  NativePdfShapeAnnotation,
} from "../../../../../lib/pdf/native-shape-annotations";
import type { TextBoxViewOverlay } from "../../../../../lib/pdf/text-box-view-overlay";
import type {
  RenderedLinkAnnotation,
  RenderedNativeTextMarkup,
  RenderedNativeTextNote,
  HighlightAnnotation,
} from "./annotationModels";
import type { RenderedFormField } from "./formFieldSessions";
import type {
  NativePdfInkStrokeLike,
  NativePdfImageOverlayLike,
} from "./nativeOverlays";

// Stable empty array for pages without link annotations, so the per-page
// `pageLinks` lookup doesn't create a new array each render.
export const EMPTY_LINKS: RenderedLinkAnnotation[] = [];
// Stable empty array for pages without AcroForm fields (see EMPTY_LINKS).
export const EMPTY_FORM_FIELDS: RenderedFormField[] = [];
// Stable empty arrays for pages without highlights / sticky notes / ink strokes,
// returned by the per-page lookups below so a page with no annotations of a
// given kind doesn't allocate a fresh array every render (see EMPTY_LINKS).
export const EMPTY_HIGHLIGHTS: HighlightAnnotation[] = [];
export const EMPTY_NOTES: StickyNoteAnnotation[] = [];
export const EMPTY_INKS: InkAnnotation[] = [];
export const EMPTY_SIGNATURES: SignatureAnnotation[] = [];
export const EMPTY_STAMPS: StampAnnotation[] = [];
export const EMPTY_REDACTIONS: RedactionAnnotation[] = [];
export const EMPTY_SHAPES: ShapeAnnotation[] = [];
export const EMPTY_NATIVE_SOURCE_SHAPES: NativePdfShapeAnnotation[] = [];
export const EMPTY_NATIVE_SOURCE_STAMPS: NativePdfStampAnnotation[] = [];
export const EMPTY_NATIVE_SOURCE_FREE_TEXTS: NativePdfFreeTextAnnotation[] = [];
export const EMPTY_NATIVE_SOURCE_LINKS: NativePdfLinkAnnotation[] = [];
export const EMPTY_NATIVE_SOURCE_TEXT_MARKUPS: NativePdfTextMarkupAnnotation[] = [];
export const EMPTY_RENDERED_NATIVE_TEXT_MARKUPS: RenderedNativeTextMarkup[] = [];
export const EMPTY_NATIVE_SOURCE_TEXT_NOTES: NativePdfTextAnnotation[] = [];
export const EMPTY_RENDERED_NATIVE_TEXT_NOTES: RenderedNativeTextNote[] = [];

export const EMPTY_LINK_OVERLAYS: PdfLinkOverlay[] = [];
export const EMPTY_TEXT_BOX_VIEW_OVERLAYS: TextBoxViewOverlay[] = [];
export const EMPTY_NATIVE_INK_STROKES: NativePdfInkStrokeLike[] = [];
export const EMPTY_NATIVE_SOURCE_INK_STROKES: NativePdfInkStroke[] = [];
export const EMPTY_NATIVE_IMAGE_OVERLAYS: NativePdfImageOverlayLike[] = [];
export const EMPTY_NATIVE_VECTOR_SELECTION_ROUTES: PdfNativeVectorSelectionRoute[] =
  [];
