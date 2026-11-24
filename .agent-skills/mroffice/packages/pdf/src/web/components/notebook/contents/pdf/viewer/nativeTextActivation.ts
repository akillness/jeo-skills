/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfNativeListTextSelectionEvidence,
  PdfNativeListTextSelectionProof,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";
import {
  nativeTextItemLayoutGeometry,
} from "../../../../../lib/pdf/native-paragraph-edit-boxes";
import type { PdfTextCaretPoint } from "../../../../../lib/pdf/text-caret";
import type { PdfNativeTextReaderRun } from "@mrnote/core/web/lib/pdf/text-box-rect.ts";
import type { PdfTextSourceAppearance } from "../../../../../lib/pdf/source-text-appearance";
import type {
  PdfTextBoxCommandTargetLike,
} from "../../../../../lib/pdf/text-box-command-target";
import { textBoxEditAnchorsExtractedBox } from "../../../../../lib/pdf/text-box-edit-anchor";
import type {
  PdfNativeTextInputLayout,
} from "../../../../../lib/pdf/native-text-input-layout";

/** Native text edit activation contracts shared by the PDF viewer and the page window. */

export type PdfViewerTextBoxCommandTarget = PdfTextBoxCommandTargetLike;

/** Where one source text run sits, independent of pdf.js item order. */
export type PdfNativeTextRunTarget = Readonly<{
  pageNumber: number;
  str: string;
  /** The run's own text-matrix origin, in PDF user space. */
  x: number;
  y: number;
}>;

/** Whether a font the page has loaded for these items is a Type3 face. */
export function selectionDrawnInType3(
  page: unknown,
  selection: Readonly<{ item: Readonly<{ fontName: string }>; items?: readonly Readonly<{ fontName: string }>[] }>,
): boolean {
  const fonts = (page as { commonObjs?: { has?: (name: string) => boolean; get?: (name: string) => unknown } } | undefined)?.commonObjs;
  if (!fonts?.has || !fonts.get) return false;
  for (const { fontName } of selection.items?.length ? selection.items : [selection.item]) {
    if (fonts.has(fontName) && (fonts.get(fontName) as { isType3Font?: unknown } | null)?.isType3Font === true) return true;
  }
  return false;
}

export type PdfNativeTextEditActivationEvidence = Readonly<{
  caretOffset: number | null;
  /** Entry point for current saved text; never an offset into the proof span. */
  caretPoint?: PdfTextCaretPoint;
  /** A single click (WPS): the line opens selected as a block, its frame and
   * the Text Editing tab up, with no caret. The keyboard, a double click and
   * the ribbon open it with the caret in. */
  selectObject?: boolean;
  /** The window's own, never the viewer's: the box is asked for as a block
   * that takes formats where its text stands and no words -- the whole of a
   * paragraph refused before, asked from a line of it
   * (lib/pdf/text-edit/block-only-opening). */
  formatsWhole?: boolean;
  /** Clicked while the page's boxes wait for the revision an edit just made
   * (the working copy's staged head being read in): the line opens at once
   * on the page as shown, typing live, and is opened again on that revision
   * once it is in (`adopt`). */
  queued?: boolean;
  /** Opened on the revision read in, taking over the same line opened
   * `queued` before it: the same box goes on (its draft, caret and focus). */
  adopt?: boolean;
  /** Copy only the exact still-mounted source for read preparation. Writers
   * independently download/recheck their current resource version. */
  copySourceBytes?: () => Uint8Array | null;
  /** Exact reader paint identity for speculative native editing backgrounds. */
  editingSurface?: Readonly<{ key: string; isCurrent: () => boolean }>;
  /** Read-only replay of the already loaded page, after native source proof. */
  renderNativeEditingSurface?: (proof: PdfNativeListTextSelectionProof, signal: AbortSignal) => Promise<HTMLCanvasElement | null>;
  /** The same replay before the proof, from the reader's own selection
   * witness: the line is taken over on the click (WPS), the proof gates the
   * save. Null when the witness does not name the shows unambiguously. */
  

  renderProvisionalEditingSurface?: (signal: AbortSignal, shown?: (() => HTMLCanvasElement | null) | null, waitForShown?: boolean) => Promise<HTMLCanvasElement | null>;
  /** The line's glyph geometry before the proof, read from the same loaded
   * page: the box draws its caret on the glyphs from the first moment, as it
   * does once the proof lands. `text` is the text the box opens with. */
  readProvisionalSourceGeometry?: (text: string, signal: AbortSignal) => Promise<PdfTextSourceAppearance | null>;
  /** The painted-source token of the bytes copySourceBytes returns (a
   * queued opening): a box saved after the page painted other bytes is in
   * these when they are newer than the ones it was saved over. */
  storedSourceToken?: string;
  /** UI-only cached background, after independent source-bound owner proof. */
  renderManagedEditingSurface?: (annotationId: string, signal: AbortSignal) => Promise<HTMLCanvasElement | null>;
  /** Extracted WPS-style object geometry for wrap/resize/rotate fallback. */
  layout?:
    | Readonly<{
        box: PdfViewerTextBoxCommandTarget;
        pageWidthPx: number;
        pageHeightPx: number;
        pageHeightPoints?: number;
        pdfToCssTransform?: readonly number[];
        sourceInputLayout?: PdfNativeTextInputLayout | null;
        sourceInputKey?: string;
        /** The face the page loaded for each font the box's runs are set in
         * (pdf.js's own program of it): the editor drafts each run in it. */
        runFaces?: readonly Readonly<{ sourceFontName: string; displayFontFamily: string }>[];
        /** The box's runs as the page draws them, in order, with their fonts
         * and faces' weight and slant: drafted so before the proof comes. */
        readerRuns?: readonly PdfNativeTextReaderRun[];
        /** Drawn in a Type3 face (selectionDrawnInType3). */
        type3Text?: boolean;
        /** The width (a fraction of the page) from the box's left edge to
         * the next text the page draws on its row (pdfNativeTextRowRoom);
         * absent where nothing stands there or the box is turned. */
        rowRoom?: number;
      }>
    | null;
}>;

export function resolvePdfNativeTextActivationLayoutBox(input: {
  pageNumber: number;
  pageRect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  targetRect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  text: string;
  fallbackId: string;
  candidates: readonly PdfViewerTextBoxCommandTarget[];
  sourceGeometry?: (NonNullable<ReturnType<typeof nativeTextItemLayoutGeometry>> & {
    sourceFontName?: string;
    displayFontFamily?: string;
  }) | null;
}): PdfViewerTextBoxCommandTarget | null {
  const { pageRect, targetRect } = input;
  if (
    !Number.isFinite(pageRect.width) ||
    !Number.isFinite(pageRect.height) ||
    pageRect.width <= 0 ||
    pageRect.height <= 0
  ) {
    return null;
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const rect = {
    x: clamp((targetRect.left - pageRect.left) / pageRect.width),
    y: clamp((targetRect.top - pageRect.top) / pageRect.height),
    width: clamp(targetRect.width / pageRect.width),
    height: clamp(targetRect.height / pageRect.height),
  };
  rect.width = Math.min(rect.width, 1 - rect.x);
  rect.height = Math.min(rect.height, 1 - rect.y);
  if (rect.width <= 0 || rect.height <= 0) return null;

  const normalizedText = input.text.replace(/\s+/gu, " ").trim();
  const sameText = input.candidates.filter(
    (candidate) =>
      candidate.page === input.pageNumber - 1 &&
      candidate.text.replace(/\s+/gu, " ").trim() === normalizedText,
  );
  // Extraction metadata may enrich typography, never change the clicked
  // native identity/text. A nearby heading is not a fallback for a subtitle.
  const matches = sameText.filter(candidate => textBoxEditAnchorsExtractedBox(rect, candidate));
  const metadata = matches.length === 1 ? matches[0] : null;
  return Object.freeze({
    ...rect,
    fontSize: rect.height,
    ...metadata,
    ...input.sourceGeometry,
    id: input.fallbackId,
    page: input.pageNumber - 1,
    text: input.text,
  });
}

export type PdfNativeTextEditActivationOutcome =
  | Readonly<{
      status: "accepted";
      trigger: HTMLElement;
      selection: PdfNativeListTextSelectionEvidence;
    }>
  | Readonly<{ status: "transient-refusal" }>
  /** `reason`: the one sentence the box shows while it stays closed. */
  | Readonly<{ status: "unsupported"; reason?: string }>
  /** Opened at once on the page as shown (`queued` evidence): it is opened
   * again on the revision being read in, which the caller waits for. */
  | Readonly<{ status: "queued" }>
  /** An `adopt` opening found no line opened queued to take over (the reader
   * closed it): nothing opens. */
  | Readonly<{ status: "released" }>;
