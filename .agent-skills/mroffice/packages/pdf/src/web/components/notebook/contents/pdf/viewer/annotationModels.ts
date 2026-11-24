/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfWpsSelectionType } from "../../../../../lib/pdf/ribbon-state";
import type { HighlightMarkupStyle } from "@mrnote/core/web/lib/pdf/highlight-markup.ts";
import type {
  PdfAnnotationAuthor,
  PdfAnnotationReply,
} from "@mrnote/core/web/lib/pdf/annotation-replies.ts";
import type { HighlightLink } from "../HighlightEditDialog";
import type {
  PdfSemanticAppearanceSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-command-routing";
import type {
  AnnotationListBatchDeleteTarget,
} from "../../../../../lib/pdf/annotation-list";
import type { PdfLinkAnnotation, PdfLinkOverlay } from "@mrnote/core/web/lib/pdf/links.ts";
import type {
  NativePdfTextAnnotation,
  NativePdfTextMarkupAnnotation,
} from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";
import type {
  ManagedPdfTextMarkup,
  ManagedPdfTextMarkupSync,
} from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";
import type { PercentBox } from "../../../../../lib/pdf/annotation-transform";
import type { InkAnnotation } from "@mrnote/core/web/lib/pdf/ink.ts";
import type { MeasurePoint } from "../../../../../lib/pdf/measure";
import type { ShapeAnnotation } from "@mrnote/core/web/lib/pdf/shapes.ts";

/**
 * A normalized link annotation enriched with its page-relative overlay rect (in
 * percentages, like highlights / find), computed at render time from the page
 * viewport. The pure normalization / sanitization lives in `lib/pdf/links.ts`.
 */
export interface RenderedLinkAnnotation extends PdfLinkAnnotation {
  percent: { x: number; y: number; width: number; height: number };
  

  quadPercents?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface RenderedNativeTextMarkup extends NativePdfTextMarkupAnnotation {
  percent: { x: number; y: number; width: number; height: number };
}

export interface RenderedNativeTextNote extends NativePdfTextAnnotation {
  percent: { x: number; y: number; width: number; height: number };
}

export interface NativeTextAnnotationViewport {
  sourceKey: string;
  rotation: number;
  width: number;
  height: number;
  convertToViewportRectangle: (rect: readonly number[]) => readonly number[];
}

export interface HighlightAnnotation {
  id: string;
  page: number;
  text: string;
  color: string;
  createdAt?: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  /** Slanted source quads, one per rect (page percent, PDF vertex order). */
  quads?: number[][];
  note?: string;
  links?: HighlightLink[];
  markupStyle?: HighlightMarkupStyle;
  nativeMarkup?: ManagedPdfTextMarkup;
  /** Creator identity; absent on legacy highlights created before authors. */
  author?: PdfAnnotationAuthor;
  /** Comment-thread replies (Acrobat / WPS PDF "Reply"); absent for none. */
  replies?: PdfAnnotationReply[];
  xfdfSourceId?: string;
}







export interface PdfManagedShapeUpsertOptions {
  readonly pageContent?: boolean;
}

/** `"page-content"`: the shape was written as a page object, so the page
 * draws it and the reader row it was drawn through is not kept beside it. */
export type PdfManagedShapeUpsertResult = void | "page-content";

export interface ManagedPdfNoteSync {
  readonly id: string;
  readonly text: string;
  readonly page: number;
  readonly rect: [number, number, number, number];
  readonly color: string;
  readonly createdAt?: string;
  readonly author?: string;
  /** Complete reply thread; absent preserves the currently stored thread. */
  readonly replies?: readonly PdfAnnotationReply[];
}

export type ManagedPdfCommentBatchDeleteTarget =
  | (AnnotationListBatchDeleteTarget & {
      readonly kind: "highlight";
      readonly native?: ManagedPdfTextMarkupSync;
    })
  | (AnnotationListBatchDeleteTarget & {
      readonly kind: "note";
      readonly native?: ManagedPdfNoteSync;
    })
  | (AnnotationListBatchDeleteTarget & {
      readonly kind: "ink";
      readonly native?: InkAnnotation;
    })
  | (AnnotationListBatchDeleteTarget & {
      readonly kind: "shape";
      readonly native?: ShapeAnnotation;
    })
  | (AnnotationListBatchDeleteTarget & { readonly kind: "bookmark" });

export interface SelectedPdfLinkContext {
  readonly overlay: PdfLinkOverlay;
  readonly sourceId: string | null;
  readonly trigger: HTMLButtonElement;
  readonly semanticRoute?: PdfSemanticAppearanceSelectionRoute;
}

/** A Delete pressed on the selected placed object while that object's own
 * save runs: it waits for the save and is carried out after it, by the frame
 * that took the key (`frameHeldKey`) or by the viewer (`waiting`). One the
 * save outlasted is not carried out, and `notCarriedOut` says so. */
export type PdfPlacedDeleteHold = {
  waiting: { key: string; at: number } | null;
  frameHeldKey: string | null;
  savingAtKey: boolean | null;
  notCarriedOut: (() => void) | null;
};

export type PdfPlacedAnnotationSelection = {
  kind:
    | "shape"
    | "nativeSourceShape"
    | "signature"
    | "measurement"
    | "fileAttachment"
    | "note"
    | "ink"
    | "nativeInk"
    | "redaction"
    | "stamp"
    | "nativeSourceStamp"
    /** A /FreeText text box of the source PDF: moved, sized or deleted on
     * the page as WPS does (its text is edited in the Insert tab). */
    | "nativeSourceFreeText";
  id: string;
};

export function pdfPlacedSelectionType(
  selection: PdfPlacedAnnotationSelection,
): PdfWpsSelectionType {
  if (selection.kind === "measurement") return "measurement";
  if (selection.kind === "signature") return "signature";
  if (selection.kind === "fileAttachment") return "attachment";
  if (selection.kind === "ink" || selection.kind === "nativeInk") return "ink";
  if (selection.kind === "note") return "text-style";
  return "shape";
}

export function measurementPointBox(
  points: readonly MeasurePoint[],
): PercentBox | null {
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/** An external reviewer named in an XFDF file, as an annotation author the
 * panel can show and filter on. Its id is namespaced so it never collides
 * with a platform account. */
export function xfdfAuthorIdentity(displayName: string): { userId: string; displayName: string } {
  const name = displayName.trim().slice(0, 200);
  return { userId: `xfdf:${name}`.slice(0, 200), displayName: name };
}
