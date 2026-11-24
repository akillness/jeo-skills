"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PDFJS_ANNOTATION_MODE_ENABLE_STORAGE } from "../../../../lib/pdf/form-appearance-storage";
import { WindowContentFallback } from "@mrnote/core/web/components/notebook/WindowContentFallback.tsx";

import {
  PDF_JS_DOCUMENT_ASSETS,
  loadCompatiblePdfJs,
} from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";
import { createPdfSessionDestroyer } from "../../../../lib/pdf/render-lifecycle";
import {
  buildCrossPageReflowEdits,
  findCrossPageReflowOffer,
} from "../../../../lib/pdf/cross-page-reflow";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  RefreshCw,
  Replace as ReplaceIcon,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { TextBox } from "../../../../lib/pdf/text-boxes";
import {
  readPdfTextContent,
  repairShortCjkTextBoxesFromPageText,
  textBoxesFromPdfTextContent,
  type PdfTextContentLike,
} from "../../../../lib/pdf/text-box-extract";
import {
  analyzePdfTextTrust,
  type PdfTextTrustReport,
} from "../../../../lib/pdf/math-font-trust";
import {
  dataUrlToBase64,
  formulaTranscribeCropRect,
} from "../../../../lib/pdf/formula-transcribe-crop";
import { apiPost, fetchWorkspaceScoped } from "@mrnote/core/web/lib/api.ts";
import { textBoxCommandTargetFromTextBox } from "../../../../lib/pdf/text-box-command-target";
import { createTextBox } from "@mrnote/core/web/lib/pdf/text-box-create.ts";
import type { PdfViewMode } from "../../../../lib/pdf/view-modes";
import { resolveAbsolutePageRotation } from "../../../../lib/pdf/page-rotation";
import { cropCanvasRegion, cropCanvasRegionToPng } from "../../../../lib/pdf/canvas-crop";
import type {
  EmbeddedImageCropRect,
  EmbeddedImageEditKind,
} from "@/lib/pdf/embedded-image-edits";
import {
  detectPdfSmartCropMarginsFromCanvas,
  keepBoxesInsideSmartCrop,
  type PdfSmartCropKeepBox,
  type PdfSmartCropResult,
} from "../../../../lib/pdf/smart-crop";
import {
  rotateFractionRect,
  unrotateFractionRect,
} from "../../../../lib/pdf/fraction-rotation";
import {
  placedImagesFromOperatorList,
  significantImages,
  type ImageOperatorIds,
  type PlacedImage,
} from "../../../../lib/pdf/embedded-images";
import {
  currentRectFor,
  imageEditAt,
  type EmbeddedImageEdits,
} from "../../../../lib/pdf/embedded-image-session";
import PdfEmbeddedImageLayer from "./PdfEmbeddedImageLayer";
import type {
  PdfEmbeddedImageContextCommand,
  PdfEmbeddedImageDragBackdrop,
} from "./PdfEmbeddedImageLayer";
import {
  buildNativeVectorDragModel,
  composeDragGhostPixels,
  nativeVectorDragGhostBox,
} from "../../../../lib/pdf/native-vector-drag-backdrop";
import { renderEmbeddedImageAbsentPage } from "../../../../lib/pdf/embedded-image-drag-backdrop";
import { createPdfNativePlanners, type PdfNativePlanners } from "../../../../lib/pdf/remote/pdf-native-planners";
import {
  findTextBoxEditAnchor,
  textBoxEditAnchorsExtractedBox,
} from "../../../../lib/pdf/text-box-edit-anchor";
import { isObsoletePersistedTextBoxEdit } from "../../../../lib/pdf/text-box-edit-prune";
import {
  effectiveTextBoxKind,
  latexForTextBoxKind,
} from "@mrnote/core/web/lib/pdf/text-box-kind.ts";
import {
  coverRectForEdit,
  unionBoxRects,
  type BoxRect,
} from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";
import {
  applyReplaceOne,
  findDocumentBoxMatches,
  pageLocalMatchIndex,
  type ReplaceBoxWithPage,
} from "../../../../lib/pdf/text-box-replace";
import { replaceAcrossDocument } from "../../../../lib/pdf/document-replace";
import { isFindShortcut } from "../../../../lib/pdf/find-key";
import {
  matchCountLabel,
  nextMatchIndex,
  prevMatchIndex,
} from "@mrnote/core/web/lib/pdf/text-search.ts";
import { pdfSourceTextBoxCoversInk } from "../../../../lib/pdf/source-text-box";
import {
  DEFAULT_TEXTBOX_BACKGROUND,
  samplePdfTextRunColors,
  sampleTextBoxBackgroundColor,
  sampleTextBoxTextColor,
} from "../../../../lib/pdf/text-box-background";
import {
  persistablePdfTextStyleRuns,
  reconcilePdfTextStyleRuns,
  type PdfTextStyleRun,
} from "@mrnote/core/web/lib/pdf/text-style-runs.ts";
import {
  normalizePdfTextLineLayout,
  reconcilePdfTextLineLayout,
  type PdfTextLineLayout,
} from "@mrnote/core/web/lib/pdf/text-line-layout.ts";
import {
  dataItemIdFromPreviewUrl,
  getDecryptedPdfBytes,
  isIncorrectPdfPassword,
  isPdfPasswordException,
  requestServerPdfDecrypt,
} from "../../../../lib/pdf/pdf-password";

import { measureFreeTextLineWidth } from "../../../../lib/pdf/free-text-line-measure";
import {
  normalizeNativePdfFreeTextAnnotations,
  sanitizeNativePdfFreeTextAnnotationSource,
  type NativePdfFreeTextAnnotation,
  type NativePdfFreeTextImportLoss,
} from "../../../../lib/pdf/native-free-text-annotations";
import { readNativeFreeTextSourceFacts } from "../../../../lib/pdf/native-free-text-source-facts";

import type { KeyedEditHistoryEntry } from "../../../../lib/pdf/edit-history";

import PdfFindBar from "./PdfFindBar";
import PdfPasswordPrompt from "./PdfPasswordPrompt";
import PdfTextBoxOverlay, {
  type PdfTextBoxContextCommand,
  type PdfTextBoxEdit,
  type PdfTextBoxEditEmitOptions,
  type PdfTextBoxSelection,
} from "./PdfTextBoxOverlay";
import { pdfTextBoxListWithBox } from "./window/textBoxChangeQueue";
import PdfImageOverlay, { type PdfImageOverlayItem } from "./PdfImageOverlay";
import PdfInkOverlay, { type PdfInkStroke } from "./PdfInkOverlay";
import type { PdfInkEraseResult, PdfInkEraserKind } from "../../../../lib/pdf/ink-erase";
import { pdfDocumentPageMap, structuredDocumentMap, wrapStructuredPdfDocument, type PdfDocumentPageMap, type PdfDocumentPageStructure } from "../../../../lib/pdf/structured-document";

const TEXT_EDITOR_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

type PdfPageProxyLike = {
  rotate?: number;
  getViewport: (args: { scale: number; rotation?: number }) => {
    width: number;
    height: number;
    transform: number[];
  };
  render: (args: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    /** pdf.js AnnotationMode (3: from the document's annotation storage). */
    annotationMode?: number;
  }) => { promise: Promise<unknown>; cancel: () => void };
  getTextContent: () => Promise<PdfTextContentLike>;
  getAnnotations?: () => Promise<unknown[]>;
  streamTextContent?: () => ReadableStream<PdfTextContentLike>;
  getOperatorList?: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
};
type PdfDocumentProxyLike = {
  destroy: () => Promise<void> | void;
  getPage: (pageNumber: number) => Promise<PdfPageProxyLike>;
  numPages: number;
  annotationStorage?: {
    setValue: (id: string, value: { noView?: boolean }) => void;
  };
};
type PdfDocumentLoadingTaskLike = {
  destroy: () => Promise<void> | void;
  promise: Promise<PdfDocumentProxyLike>;
};

const pdfBytesCache = new Map<string, Promise<ArrayBuffer>>();
const PDF_BYTES_CACHE_LIMIT = 8;
/** Renders of "this page without that picture" kept for a second drag. */
const IMAGE_ABSENT_PAGE_CACHE_LIMIT = 3;
const pdfTextTrustCache = new Map<string, Promise<PdfTextTrustReport>>();

/**
 * Analyze the document's math-font ToUnicode trust once per URL. Never
 * rejects: trust is a best-effort extraction refinement and an empty report
 * keeps extraction behavior unchanged.
 */
function loadPdfTextTrust(url: string): Promise<PdfTextTrustReport> {
  const cached = pdfTextTrustCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const bytes = await loadPdfBytes(url);
    return analyzePdfTextTrust(bytes);
  })().catch(() => ({ fonts: new Map() }) as PdfTextTrustReport);
  pdfTextTrustCache.set(url, promise);
  while (pdfTextTrustCache.size > PDF_BYTES_CACHE_LIMIT) {
    const oldest = pdfTextTrustCache.keys().next().value;
    if (!oldest) break;
    pdfTextTrustCache.delete(oldest);
  }
  return promise;
}

function pageTextHintScore(text: string | undefined): number {
  if (!text?.trim()) return 0;
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return cjkCount * 10 + text.length / 1000;
}

function bestPageTextHint(
  current: string | undefined,
  next: string | undefined,
): string | undefined {
  return pageTextHintScore(next) > pageTextHintScore(current) ? next : current;
}

async function loadPdfBytes(url: string): Promise<ArrayBuffer> {
  // A password-protected document unlocked earlier this session is served
  // from the decrypted-bytes cache: pdf-lib consumers (and pdf.js) then work
  // on plaintext bytes without re-prompting.
  const decrypted = getDecryptedPdfBytes(url);
  if (decrypted) return decrypted;
  const cached = pdfBytesCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const response = await fetchWorkspaceScoped(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }
    return response.arrayBuffer();
  })();
  pdfBytesCache.set(url, promise);
  promise.catch(() => {
    if (pdfBytesCache.get(url) === promise) {
      pdfBytesCache.delete(url);
    }
  });
  while (pdfBytesCache.size > PDF_BYTES_CACHE_LIMIT) {
    const oldest = pdfBytesCache.keys().next().value;
    if (!oldest) break;
    pdfBytesCache.delete(oldest);
  }
  return promise;
}

/**
 * Seed the editor's byte cache with bytes the host already holds for a
 * URL (the accepted revision of a save it just made), so the surface opens
 * that revision without a second download. The bytes are copied: the host
 * zeroes its own buffer once the acceptance completes.
 */
export function primePdfTextEditorBytes(url: string, bytes: Uint8Array): void {
  if (!url || bytes.byteLength === 0) return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  pdfBytesCache.delete(url);
  pdfBytesCache.set(url, Promise.resolve(copy.buffer));
  while (pdfBytesCache.size > PDF_BYTES_CACHE_LIMIT) {
    const oldest = pdfBytesCache.keys().next().value;
    if (!oldest) break;
    pdfBytesCache.delete(oldest);
  }
}

export interface PdfTextEditorProps {
  /** Same-origin preview URL for the PDF bytes. */
  url: string;
  /** The planners of the page this surface edits (its window's): a drag's
   * picture-less page is planned on that page's head only, never a twin
   * page's holding the same bytes. Absent: bound to no page. */
  nativePlanners?: PdfNativePlanners;
  /**
   * The document the URL is a revision of. While it stays the same across a
   * URL change (a save's accepted revision, an Undo), the surface swaps the
   * document in place: the painted page, the overlays and the selection stay
   * up until the new revision has rendered, nothing shows a loading state.
   * A different key (another file) reloads as before.
   */
  documentKey?: string;
  /** The revision at `url` has rendered on this surface (its page painted
   * and, in image editing, its pictures inventoried); the host may now drop
   * a draft that the revision carries. */
  onSourceRevisionRendered?: (url: string) => void;
  /** Zero-based page index to edit. */
  page: number;
  /** Editor layout: single-page editing or WPS-style continuous reading. */
  viewMode?: PdfViewMode;
  /** Absolute display rotations by original 1-based page number. */
  pageRotations?: Record<number, number>;
  /** Persisted text-box edits (all pages). */
  edits: PdfTextBoxEdit[];
  /** Emit the full edits list whenever a box changes. */
  onEditsChange: (
    edits: PdfTextBoxEdit[] | ((current: PdfTextBoxEdit[]) => PdfTextBoxEdit[]),
  ) => void;
  /**
   * Optional undo/redo recorder for USER text-box gestures (commit / move /
   * resize / style / kind / create / delete / replace). When provided, those
   * gestures route through it as id-keyed before/after records — the host
   * both applies them (replay-idempotent replace-by-id) and records them in
   * its bounded history. Housekeeping emissions (origin widening, auto-fit,
   * stale-edit pruning, re-anchoring) still flow through `onEditsChange`
   * directly and are never recorded.
   */
  onTextBoxHistory?: (entry: KeyedEditHistoryEntry<PdfTextBoxEdit>) => void;
  /**
   * Whether the host writes a change to this box. Replace All leaves a box
   * the host cannot write as it is and says so, instead of counting its
   * occurrences as replaced while the host turns the change away (user
   * audit PDF 0068). Absent: every box is writable.
   */
  canWriteTextBoxEdit?: (edit: PdfTextBoxEdit) => boolean;
  /** Uncommitted formula source drafts keyed by `${page}:${boxId}`. */
  formulaDraftsByKey?: Record<string, string>;
  /** Persist formula source drafts outside the page overlay/editor lifecycle. */
  onFormulaDraftsChange?: (
    drafts:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  /**
   * "Add Text" mode: clicking a blank area of the page creates a new editable
   * text box at that spot. Off by default (the page stays a normal edit surface).
   */
  addTextMode?: boolean;
  /** A created "Add Text" box lost focus; see PdfTextBoxOverlay. */
  onCreatedBoxCommit?: (id: string, text: string) => void;
  /** Initial typography for a newly placed Text Comment. */
  addTextStyle?: {
    color: string;
    fontFamily: string;
    fontSizePoints: number;
    sourceFontName?: string;
  };
  /** Hand tool: drag the editor viewport without selecting or changing objects. */
  panMode?: boolean;
  /** Reports the page count once the document loads. */
  onPageCountChange?: (count: number) => void;
  /** Reports the most-visible 1-based page while continuous editing scrolls. */
  onPageChange?: (page: number) => void;
  /** Reports the effective text visible on the current edited page. */
  onPageTextChange?: (payload: { page: number; text: string }) => void;
  /** Reports editable text-box targets on the current page for AI commands. */
  onPageTextBoxesChange?: (payload: {
    page: number;
    boxes: PdfTextBoxCommandTarget[];
  }) => void;
  /** Register content-margin detection for the active rendered page canvas. */
  onSmartCropDetectorChange?: (
    detector: (() => PdfSmartCropResult) | null,
  ) => void;
  /** Trusted visible page text from the read-only PDF text layer. */
  pageTextHint?: string;
  /** Reports standard third-party `/FreeText` objects for exact writeback. */
  onNativeFreeTextAnnotationsChange?: (payload: {
    pageNumber: number;
    textBoxes: NativePdfFreeTextAnnotation[];
    losses: NativePdfFreeTextImportLoss[];
  }) => void;
  /** Image overlays for the current page (optional). */
  imageOverlays?: PdfImageOverlayItem[];
  resolveImageUrl?: (dataItemId: string) => string;
  onImageChange?: (overlay: PdfImageOverlayItem) => void;
  onImageDelete?: (id: string) => void;
  /** Freehand ink (optional). */
  inkStrokes?: PdfInkStroke[];
  inkDrawMode?: boolean;
  inkColor?: string;
  inkWidth?: number;
  /** Pen type for NEW strokes ("pen" default; "highlighter" translucent). */
  inkPenType?: "pen" | "highlighter";
  onInkStroke?: (stroke: PdfInkStroke) => void;
  /** Erase a stroke by id (click-to-delete when not drawing). */
  onInkStrokeDelete?: (id: string) => void;
  /** The Draw tab's Eraser is armed, with this kind; a drag's erase lands as one result. */
  inkEraseMode?: boolean;
  inkEraserKind?: PdfInkEraserKind;
  onInkErase?: (result: PdfInkEraseResult) => void;
  /** The page room's presence, for the ink drawn live (PdfInkOverlay). */
  liveInkAwareness?: import("y-protocols/awareness").Awareness | null;
  /** Internal: a page mounted inside the continuous editor stack. */
  embeddedPage?: boolean;
  /** Internal: whether this embedded page may keep inline editing chrome open. */
  activeEditingPage?: boolean;
  /** Internal: reuse the parent continuous editor's loaded pdf.js document. */
  sharedPdfDoc?: PdfDocumentProxyLike;
  




  entryPainting?: { pageNumber: number; canvas: HTMLCanvasElement } | null;
  /** The saved file the surface shows holds the page's structure (pages
   * deleted, moved, added): read as the upload, as the reader reads it
   * (lib/pdf/structured-document), so `page` and every overlay keep the
   * upload's numbers. Applied to a file with the structure's page count. */
  documentPageStructure?: PdfDocumentPageStructure | null;
  /** The page map of the document the surface shows (null: as numbered). */
  onDocumentPageMapChange?: (map: PdfDocumentPageMap | null) => void;
  /** "Edit images" mode: the images already in the PDF become selectable. */
  imageEditMode?: boolean;
  /** Pending edits to those images, keyed by page and paint order. */
  embeddedImageEdits?: EmbeddedImageEdits;
  /** Browser-local pixels shown before Apply; keyed by local data-item id. */
  embeddedImagePreviewUrls?: Readonly<Record<string, string>>;
  /**
   * What the user asked for. The host builds the edit — this component only
   * reports it, because only it has the rendered canvas the mask colour and a
   * moved image's pixels have to come from.
   */
  onEmbeddedImageAction?: (action: PdfEmbeddedImageAction) => void;
  /**
   * The host can rewrite an image's paint instance in place (matrix and
   * clip), so a source paint that is already rotated or skewed stays
   * movable, resizable, croppable, rotatable and flippable.
   */
  nativeImageTransformReady?: boolean;
  /** Applying is in flight; the layer stays visible but stops taking input. */
  embeddedImageBusy?: boolean;
  /** Live host authority; revoked editors stay visible but cannot mutate. */
  objectInteractionDisabled?: boolean;
  /** Typed object selection lifted into the editor ribbon. */
  onObjectSelectionChange?: (
    selection: PdfEditorObjectSelection | null,
  ) => void;
  /** Clear a child selection when the host leaves its contextual tab. */
  objectSelectionResetKey?: number;
  /** Contextual-ribbon request for the selected source object. */
  contextCommand?: PdfEditorContextCommand | null;
  /** The viewer's select tool clicked this painted image (1-based page,
   * paint order): select it here once the page's inventory is loaded. */
  





  imageWritePending?: boolean;
  /** The page now paints the pending picture write itself (its prepared
   * bytes), so the draft's screenshot and the dropped picture step aside. */
  imageDraftsSuperseded?: boolean;
  /** How many picture commands wait for the write before them (the host
   * keeps showing Saving until they have all been written). */
  onQueuedImageCommandsChange?: (count: number) => void;
  /** Put the caret in this text box once it is shown (see
   * PdfTextBoxOverlay's focusBoxRequest). */
  focusTextBoxRequest?: Readonly<{ id: string; nonce: number }> | null;
  selectImageRequest?: {
    page: number;
    order: number;
    requestId: number;
    /** Scroll the picture into view: when the reader's click opened this
     * surface. A re-selection after a save keeps the view where it is. */
    reveal?: boolean;
  } | null;
}

export type PdfEditorObjectSelection =
  | ({ kind: "text" } & PdfTextBoxSelection)
  | {
      kind: "embedded-image";
      page: number;
      order: number;
      hasEdit: boolean;
      rect: BoxRect;
      rotated: boolean;
      opacity?: number;
      editKind?: EmbeddedImageEditKind;
      cropSupported?: boolean;
      rotationSupported?: boolean;
      /** Rotation is refused only because a quarter turn would leave the
       * page: the picture needs shrinking or moving first, not a reset. */
      rotationBlockedByPage?: boolean;
      flipSupported?: boolean;
    };

export type PdfEditorContextCommand =
  | ({ kind: "text" } & PdfTextBoxContextCommand)
  | ({ kind: "embedded-image" } & PdfEmbeddedImageContextCommand);

/**
 * A request about one embedded image. Geometry is in the page's STORED
 * orientation (what pdf-lib draws in), already converted back from what the
 * user pointed at.
 */
export type PdfEmbeddedImageAction =
  | {
      kind: "delete" | "restore";
      /** 1-based. */
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
    }
  | {
      kind: "replace";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      file: File;
    }
  | {
      kind: "move";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      /** Where it goes, stored orientation. */
      rect: { x: number; y: number; width: number; height: number };
      /** The original pixels, cut from the rendered page. Absent means the
       *  crop failed and the host must refuse the move rather than mask it. */
      pixels?: Uint8Array;
    }
  | {
      kind: "resize";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      rect: { x: number; y: number; width: number; height: number };
      pixels?: Uint8Array;
    }
  | {
      kind: "opacity";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      opacity: number;
      pixels?: Uint8Array;
    }
  | {
      kind: "crop";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      crop: EmbeddedImageCropRect;
      rect: { x: number; y: number; width: number; height: number };
      pixels?: Uint8Array;
    }
  | {
      kind: "rotate";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      direction: "left" | "right";
      rect: { x: number; y: number; width: number; height: number };
      pixels?: Uint8Array;
    }
  | {
      kind: "flip";
      page: number;
      image: PlacedImage;
      origin: { x: number; y: number; width: number; height: number };
      maskColor?: string;
      axis: "horizontal" | "vertical";
      rect: { x: number; y: number; width: number; height: number };
      pixels?: Uint8Array;
    };

function quarterTurnPictureRect(
  rect: { x: number; y: number; width: number; height: number },
  pageSize: { width: number; height: number } | null,
): { x: number; y: number; width: number; height: number } | null {
  if (
    !pageSize ||
    !(pageSize.width > 0) ||
    !(pageSize.height > 0) ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    !(rect.width > 0) ||
    !(rect.height > 0)
  ) {
    return null;
  }
  const width = (rect.height * pageSize.height) / pageSize.width;
  const height = (rect.width * pageSize.width) / pageSize.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  // A quarter turn keeps the picture's centre. A turned picture that
  // would leave the page is moved back inside (and, when it is taller or
  // wider than the page, scaled down to fit) instead of being refused:
  // a wide logo along the top edge could never be rotated before
  // (stress walkthrough on the invoice sample), and the picture ribbon
  // blamed "the picture's state" for it.
  let fitWidth = width;
  let fitHeight = height;
  const overflow = Math.max(width, height);
  if (overflow > 1) {
    fitWidth = width / overflow;
    fitHeight = height / overflow;
  }
  const clamp = (value: number, size: number) =>
    Math.min(Math.max(value, 0), Math.max(0, 1 - size));
  return {
    x: clamp(centerX - fitWidth / 2, fitWidth),
    y: clamp(centerY - fitHeight / 2, fitHeight),
    width: fitWidth,
    height: fitHeight,
  };
}

export interface PdfTextBoxCommandTarget {
  id: string;
  page: number;
  kind?: "text" | "formula";
  latex?: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  sourceFontName?: string;
  bold?: boolean;
  italic?: boolean;
  runs?: PdfTextStyleRun[];
  lineLayout?: PdfTextLineLayout[];
  edited?: boolean;
  created?: boolean;
  /** The Office family a box someone made is set in (its font menu). */
  officeFamily?: string;
  /** A text annotation of the file itself: it keeps a face of the box's
   * own five (the font menu offers it no Office family). */
  annotation?: boolean;
}

function textBoxRect(box: TextBox): BoxRect {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

function sourceFieldsFromRect(rect: BoxRect) {
  return {
    originX: rect.x,
    originY: rect.y,
    originWidth: rect.width,
    originHeight: rect.height,
  };
}

function textBoxEditHasExplicitOrigin(edit: PdfTextBoxEdit): boolean {
  return (
    Number.isFinite(edit.originX) &&
    Number.isFinite(edit.originY) &&
    Number.isFinite(edit.originWidth) &&
    Number.isFinite(edit.originHeight)
  );
}

function sameIdEditShouldBeDroppedAsStale(
  edit: PdfTextBoxEdit,
  extracted: TextBox,
): boolean {
  if (textBoxEditAnchorsExtractedBox(edit, extracted)) return false;
  if (edit.created) return false;
  return textBoxEditHasExplicitOrigin(edit);
}

function reanchorTextBoxEdit(
  edit: PdfTextBoxEdit,
  anchor: TextBox,
): PdfTextBoxEdit {
  const sourceCover = unionBoxRects(
    coverRectForEdit(edit),
    textBoxRect(anchor),
  );
  const kind = effectiveTextBoxKind(anchor, edit);
  return {
    ...edit,
    id: anchor.id,
    fontFamily: edit.fontFamily ?? anchor.fontFamily,
    sourceFontName: edit.sourceFontName ?? anchor.sourceFontName,
    bold: edit.bold ?? anchor.bold,
    italic: edit.italic ?? anchor.italic,
    color: edit.color ?? anchor.color,
    kind,
    latex: latexForTextBoxKind(kind, edit.latex ?? anchor.latex),
    ...sourceFieldsFromRect(sourceCover),
  };
}

/**
 * Self-contained WPS-style inline PDF text editor: renders one page to a canvas
 * and overlays inline-editable text boxes extracted from that same pdf.js load,
 * so the canvas glyphs and the editable boxes are aligned by construction
 * (independent of device pixel ratio or container width).
 */
export default function PdfTextEditor({
  url,
  nativePlanners: nativePlannersProp,
  page,
  viewMode = "single",
  pageRotations,
  edits,
  onEditsChange,
  onTextBoxHistory,
  canWriteTextBoxEdit,
  formulaDraftsByKey,
  onFormulaDraftsChange,
  addTextMode = false,
  onCreatedBoxCommit,
  addTextStyle,
  panMode = false,
  onPageCountChange,
  onPageChange,
  onPageTextChange,
  onPageTextBoxesChange,
  onSmartCropDetectorChange,
  pageTextHint,
  onNativeFreeTextAnnotationsChange,
  imageOverlays,
  resolveImageUrl,
  onImageChange,
  onImageDelete,
  inkStrokes,
  inkDrawMode = false,
  inkColor = "#dc2626",
  inkWidth = 2,
  inkPenType = "pen",
  inkEraseMode = false,
  inkEraserKind = "stroke",
  onInkErase,
  liveInkAwareness = null,
  onInkStroke,
  onInkStrokeDelete,
  embeddedPage = false,
  activeEditingPage = true,
  sharedPdfDoc,
  entryPainting,
  documentPageStructure,
  onDocumentPageMapChange,
  documentKey,
  onSourceRevisionRendered,
  imageEditMode = false,
  embeddedImageEdits,
  embeddedImagePreviewUrls,
  onEmbeddedImageAction,
  nativeImageTransformReady = false,
  embeddedImageBusy = false,
  objectInteractionDisabled = false,
  onObjectSelectionChange,
  objectSelectionResetKey,
  contextCommand,
  selectImageRequest = null,
  focusTextBoxRequest = null,
  imageWritePending = false,
  imageDraftsSuperseded = false,
  onQueuedImageCommandsChange,
}: PdfTextEditorProps) {
  // Read at load (the document is read once per source).
  const documentPageStructureRef = useRef(documentPageStructure ?? null);
  documentPageStructureRef.current = documentPageStructure ?? null;
  const onDocumentPageMapChangeRef = useRef(onDocumentPageMapChange);
  onDocumentPageMapChangeRef.current = onDocumentPageMapChange;
  const t = useTranslations("console-notebooks");
  const loadFailedMessage = t("pdfViewer.loadFailed");
  const retryLabel = t("pdfViewer.retry");
  const objectEditingDisabled =
    objectInteractionDisabled || !activeEditingPage || panMode;
  const objectEditingDisabledRef = useRef(objectEditingDisabled);
  objectEditingDisabledRef.current = objectEditingDisabled;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Visible source notes the page canvas does not draw (the reader draws
  // their icons itself): auto-crop keeps them and its preview shows them
  
  const smartCropKeepBoxesRef = useRef<readonly PdfSmartCropKeepBox[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panGestureRef = useRef<{
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
    scroller: HTMLDivElement;
  } | null>(null);
  const handlePanPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!panMode || embeddedPage || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, input, select, textarea, [contenteditable=true]",
        )
      ) {
        return;
      }
      event.preventDefault();
      panGestureRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: event.currentTarget.scrollLeft,
        scrollTop: event.currentTarget.scrollTop,
        scroller: event.currentTarget,
      };
      if (
        Number.isFinite(event.pointerId) &&
        typeof event.currentTarget.setPointerCapture === "function"
      ) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [embeddedPage, panMode],
  );
  const handlePanPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = panGestureRef.current;
      if (!panMode || !gesture) return;
      event.preventDefault();
      gesture.scroller.scrollLeft =
        gesture.scrollLeft + gesture.clientX - event.clientX;
      gesture.scroller.scrollTop =
        gesture.scrollTop + gesture.clientY - event.clientY;
    },
    [panMode],
  );
  const handlePanPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        Number.isFinite(event.pointerId) &&
        event.currentTarget.hasPointerCapture?.(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      panGestureRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!onSmartCropDetectorChange || viewMode === "continuous") return;
    onSmartCropDetectorChange(() =>
      keepBoxesInsideSmartCrop(
        detectPdfSmartCropMarginsFromCanvas(canvasRef.current),
        smartCropKeepBoxesRef.current,
      ),
    );
    return () => onSmartCropDetectorChange(null);
  }, [onSmartCropDetectorChange, page, viewMode]);

  // Release the canvas's backing store on unmount. Dropping the element is
  // not enough: the driver-side bitmap survives until GC (indefinitely on
  // Safari), and in continuous editing every scrolled-past page unmounts one
  // of these at render scale — the read-mode viewer already zeroes evicted
  // canvases for exactly this reason.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  const [boxesPage, setBoxesPage] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
    documentHeight: number;
  } | null>(null);
  const [pageSizePage, setPageSizePage] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<"source" | "page" | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceRetryRevision, setSourceRetryRevision] = useState(0);
  const [pageRetryRevision, setPageRetryRevision] = useState(0);
  const loadRetryInFlightRef = useRef(false);
  // Password-protected documents: pdf.js rejects the load with a
  // PasswordException → show the unlock prompt (mirrors PDFViewer).
  // `passwordAttempt` is a fresh object per submit (so an identical retry
  // still re-runs the effect) and keyed by url (a doc swap never inherits a
  // stale password).
  const [passwordAttempt, setPasswordAttempt] = useState<{
    url: string;
    password: string;
  } | null>(null);
  const [passwordGate, setPasswordGate] = useState<null | "need" | "incorrect">(
    null,
  );
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxyLike | null>(null);
  // The window addresses the file's pages through the map of the document
  // shown here while the reader is not mounted.
  useEffect(() => { onDocumentPageMapChangeRef.current?.(structuredDocumentMap(pdfDoc)); }, [pdfDoc]);
  useEffect(() => () => onDocumentPageMapChangeRef.current?.(null), []);
  const [textTrust, setTextTrust] = useState<PdfTextTrustReport | null>(null);
  // The document on this surface and its identity. A load whose
  // `documentKey` matches is a revision swap: the previous document stays
  // installed (and its session alive) until the new one is, the render
  // paints offscreen and blits, and no state that the reader is looking at
  // (page bitmap, boxes, page size, selection) is cleared in between.
  const installedSourceRef = useRef<{
    documentKey: string | null;
    url: string;
    doc: PdfDocumentProxyLike;
  } | null>(null);
  const retiredSessionsRef = useRef<Array<() => Promise<void>>>([]);
  const unmountedRef = useRef(false);
  // The document a revision swap installed: its first paint replaces the
  // page in place. Keyed to the document, not a flag, because the page can
  // re-render for other reasons (a text hint, a width) before it arrives.
  const quietSwapDocRef = useRef<PdfDocumentProxyLike | null>(null);
  const lastRenderedRef = useRef<{ doc: PdfDocumentProxyLike; page: number } | null>(null);
  // What the page canvas was last painted from and with: the revision's URL
  // (its bytes are the byte cache's) and the exact pdf.js viewport, so a
  // second render of the same page without a picture lines up pixel for pixel.
  const paintedRenderRef = useRef<{
    doc: PdfDocumentProxyLike;
    url: string | null;
    page: number;
    pageNumber: number;
    rotation: number;
    scale: number;
    width: number;
    height: number;
  } | null>(null);
  // One off-screen render of the page without a picture per source, picture
  // and canvas size; a new document drops them all.
  const nativePlanners = nativePlannersProp ?? createPdfNativePlanners(null);
  const imageAbsentPagesRef = useRef(
    new Map<string, ReturnType<typeof renderEmbeddedImageAbsentPage>>(),
  );
  // An image-mode placement that finished before its page painted: reported
  // once the page has (see the render effect).
  const pendingImageRevisionReportRef = useRef<{ doc: PdfDocumentProxyLike; page: number } | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const imageEditModeRef = useRef(imageEditMode);
  imageEditModeRef.current = imageEditMode;
  const onSourceRevisionRenderedRef = useRef(onSourceRevisionRendered);
  onSourceRevisionRenderedRef.current = onSourceRevisionRendered;
  const revisionSwapEligible = useCallback(
    () => Boolean(documentKey) && installedSourceRef.current?.documentKey === documentKey,
    [documentKey],
  );
  const drainRetiredSessions = useCallback(() => {
    const retired = retiredSessionsRef.current.splice(0);
    for (const destroy of retired) void destroy().catch(() => undefined);
  }, []);
  const retryLoad = useCallback(() => {
    if (!error || loading || loadRetryInFlightRef.current) return;
    loadRetryInFlightRef.current = true;
    const failedPhase = error;
    setError(null);
    setLoading(true);
    if (failedPhase === "source") {
      setSourceRetryRevision((revision) => revision + 1);
    } else {
      setPageRetryRevision((revision) => revision + 1);
    }
  }, [error, loading]);

  useEffect(() => {
    let cancelled = false;
    const swap = revisionSwapEligible();
    queueMicrotask(() => {
      if (!cancelled && !swap) setTextTrust(null);
    });
    if (!url) return;
    void loadPdfTextTrust(url).then((report) => {
      if (!cancelled) setTextTrust(report);
    });
    return () => {
      cancelled = true;
    };
  }, [revisionSwapEligible, url]);

  const pageTextHintKey = `${url}\u0000${page}`;
  const [stablePageTextHint, setStablePageTextHint] = useState<{
    key: string;
    text?: string;
  }>({ key: pageTextHintKey, text: pageTextHint });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStablePageTextHint((current) => {
        if (current.key !== pageTextHintKey) {
          return { key: pageTextHintKey, text: pageTextHint };
        }
        const text = bestPageTextHint(current.text, pageTextHint);
        return text === current.text ? current : { key: current.key, text };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pageTextHint, pageTextHintKey]);

  const effectivePageTextHint =
    stablePageTextHint.key === pageTextHintKey
      ? stablePageTextHint.text
      : pageTextHint;

  // Track the container width so the page renders fit-to-width and re-renders on
  // resize (keeps the overlay aligned to the canvas).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadRetryInFlightRef.current = false;
    if (sharedPdfDoc) {
      let cancelled = false;
      // The parent swapped its document for a new revision of the same
      // file: this page keeps what it shows until the revision paints.
      const swap = revisionSwapEligible() && installedSourceRef.current?.doc !== sharedPdfDoc;
      queueMicrotask(() => {
        if (cancelled) return;
        if (swap) {
          quietSwapDocRef.current = sharedPdfDoc;
        } else {
          setLoading(true);
          setBoxes([]);
          setBoxesPage(null);
          setPageSize(null);
          setPageSizePage(null);
        }
        setError(null);
        installedSourceRef.current = { documentKey: documentKey ?? null, url, doc: sharedPdfDoc };
        setPdfDoc(sharedPdfDoc);
        onPageCountChange?.(sharedPdfDoc.numPages);
      });
      return () => {
        cancelled = true;
        renderTaskRef.current?.cancel();
      };
    }
    if (!url) {
      let cancelled = false;
      installedSourceRef.current = null;
      drainRetiredSessions();
      queueMicrotask(() => {
        if (cancelled) return;
        setPdfDoc(null);
        setBoxes([]);
        setBoxesPage(null);
        setPageSize(null);
        setPageSizePage(null);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    let loadingTask: PdfDocumentLoadingTaskLike | null = null;
    let activeDoc: PdfDocumentProxyLike | null = null;
    const destroySession = createPdfSessionDestroyer(() => ({
      loadingTask,
      document: activeDoc,
    }));
    // A new revision of the document on this surface swaps in place; a
    // different document (or the first) loads with the surface cleared.
    const swap = revisionSwapEligible() && installedSourceRef.current?.url !== url;
    if (!swap) drainRetiredSessions();
    const retired = retiredSessionsRef.current;

    (async () => {
      if (swap) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[pdf-editor] revision swap", { url: url.slice(-40), cached: pdfBytesCache.has(url) || Boolean(getDecryptedPdfBytes(url)) });
        }
      } else {
        setLoading(true);
        setPdfDoc(null);
        setBoxes([]);
        setBoxesPage(null);
        setPageSize(null);
        setPageSizePage(null);
      }
      setError(null);
      try {
        const pdfjs = await loadCompatiblePdfJs();
        // The /preview endpoint requires auth: a bare pdf.js URL fetch is
        // anonymous and 401s (cross-origin, no cookie). Fetch the bytes through
        // the app's CREDENTIALED request path and hand PDF.js a stable
        // ArrayBuffer — matching PDFViewer (also dodges Safari's flaky streaming
        // transport for authenticated /preview responses).
        const bytes = new Uint8Array((await loadPdfBytes(url)).slice(0));
        if (cancelled) return;
        // Password typed for THIS url in the unlock prompt, if any (a
        // document already unlocked server-side is served decrypted by
        // loadPdfBytes and needs no password).
        const attemptPassword =
          passwordAttempt && passwordAttempt.url === url
            ? passwordAttempt.password
            : undefined;
        loadingTask = pdfjs.getDocument({
          data: bytes,
          password: attemptPassword,
          ...PDF_JS_DOCUMENT_ASSETS,
        }) as unknown as PdfDocumentLoadingTaskLike;
        const loadedDoc = await loadingTask.promise;
        // A saved file holding the page's structure is read as the upload.
        const structure = documentPageStructureRef.current;
        const structureMap = structure ? pdfDocumentPageMap(structure, loadedDoc.numPages) : null;
        const doc = structureMap ? wrapStructuredPdfDocument(loadedDoc, structureMap) : loadedDoc;
        activeDoc = doc as PdfDocumentProxyLike;
        if (cancelled) {
          await destroySession().catch(() => undefined);
          activeDoc = null;
          return;
        }
        setPasswordGate(null);
        // Editing runs on pdf-lib, which cannot decrypt: after a successful
        // password open, ask the server for decrypted bytes once and cache
        // them for the session (best-effort — viewing already works).
        if (attemptPassword && !getDecryptedPdfBytes(url)) {
          const dataItemId = dataItemIdFromPreviewUrl(url);
          if (dataItemId) {
            void requestServerPdfDecrypt(
              dataItemId,
              attemptPassword,
              url,
            ).catch(() => undefined);
          }
        }
        onPageCountChange?.(doc.numPages);
        installedSourceRef.current = { documentKey: documentKey ?? null, url, doc: activeDoc };
        if (swap) quietSwapDocRef.current = activeDoc;
        setPdfDoc(activeDoc);
        // The revision this one replaces has nothing left to show.
        drainRetiredSessions();
      } catch (err) {
        await destroySession().catch(() => undefined);
        if (cancelled) return;
        setLoading(false);
        // Encrypted document: show the unlock prompt instead of the error
        // banner; `incorrect` keys the inline wrong-password hint.
        if (isPdfPasswordException(err)) {
          setPasswordGate(isIncorrectPdfPassword(err) ? "incorrect" : "need");
          return;
        }
        if (process.env.NODE_ENV !== "production") {
          try {
            console.debug("[pdf-editor] source load failed", { error: String(err).slice(0, 200), swap });
          } catch { /* diagnostics never throw */ }
        }
        setError("source");
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      // An installed document outlives its effect until the next revision
      // of the same file is installed (or the surface unmounts); a document
      // still loading, or one that is being replaced by another file, ends
      // now, as before.
      if (activeDoc && installedSourceRef.current?.doc === activeDoc && !unmountedRef.current) {
        retired.push(destroySession);
      } else {
        void destroySession().catch(() => undefined);
      }
    };
  }, [
    url,
    documentKey,
    drainRetiredSessions,
    onPageCountChange,
    revisionSwapEligible,
    sharedPdfDoc,
    passwordAttempt,
    sourceRetryRevision,
  ]);
  useEffect(() => {
    // StrictMode unmounts and remounts once in development: without the
    // reset the surface believed itself unmounted for good, and every
    // revision swap destroyed the document on screen while it was still
    
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      drainRetiredSessions();
    };
  }, [drainRetiredSessions]);

  useEffect(() => {
    loadRetryInFlightRef.current = false;
    if (viewMode === "continuous") {
      if (pdfDoc && containerWidth > 0) {
        let cancelled = false;
        queueMicrotask(() => {
          if (!cancelled) setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    if (!pdfDoc || containerWidth <= 0) return;
    let cancelled = false;
    let activeTask: { promise: Promise<unknown>; cancel: () => void } | null =
      null;

    // A revision swap, a re-render of the page already on screen (the text
    // trust report arriving, a width change) or a turn to another page of
    // the same document paints over what the reader sees: no loading state,
    // and the boxes, page size and selection stay until the paint replaces
    // them. A page turn used to clear the surface to a placeholder for the
    
    const inPlace =
      quietSwapDocRef.current === pdfDoc ||
      lastRenderedRef.current?.doc === pdfDoc;
    if (quietSwapDocRef.current === pdfDoc) quietSwapDocRef.current = null;
    (async () => {
      if (!inPlace) {
        setLoading(true);
        setBoxes([]);
        setBoxesPage(null);
        setPageSize(null);
        setPageSizePage(null);
      }
      setError(null);
      try {
        const pageNumber = Math.min(Math.max(1, page + 1), pdfDoc.numPages);
        const pdfPage = await pdfDoc.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const rotation = resolveAbsolutePageRotation(
          pageNumber,
          pageRotations,
          pdfPage.rotate,
        );
        const unscaled = pdfPage.getViewport({ scale: 1, rotation });
        const scale = containerWidth / unscaled.width;
        const dpr = Math.min(
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
          2,
        );
        // Render at device resolution; lay out (and extract text) in CSS space so
        // the overlay's page-fraction boxes align to the on-screen canvas.
        // Nudge exact-integer render scales: pdfjs-dist 5.x corrupts full-page
        // image pages on the integer-scale blit fast path (see PDFViewer's
        // dodgeIntegerScale), upward so the floored canvas is the whole page.
        const renderScale = (() => {
          const raw = scale * dpr;
          const nearest = Math.round(raw);
          return nearest >= 1 && Math.abs(raw - nearest) < 0.001
            ? nearest + 0.0001
            : raw;
        })();
        const renderViewport = pdfPage.getViewport({
          scale: renderScale,
          rotation,
        });
        const cssViewport = pdfPage.getViewport({ scale, rotation });

        // Discover safe third-party `/FreeText` annotations before painting.
        // Hide only the editable source objects from the pdf.js canvas: the
        // shared DOM text-box overlay becomes their single visual + interaction
        // authority, avoiding doubled glyphs while typing or moving a box.
        if (pdfPage.getAnnotations) {
          try {
            const rawAnnotations = await pdfPage.getAnnotations();
            if (cancelled) return;
            {
              const keep: PdfSmartCropKeepBox[] = [];
              for (const annotation of Array.isArray(rawAnnotations)
                ? (rawAnnotations as unknown[])
                : []) {
                if (!annotation || typeof annotation !== "object") continue;
                const raw = annotation as {
                  subtype?: unknown;
                  rect?: unknown;
                  annotationFlags?: unknown;
                };
                if (raw.subtype !== "Text" || !Array.isArray(raw.rect)) continue;
                const flags = Number(raw.annotationFlags ?? 0);
                if (Number.isInteger(flags) && (flags & ((1 << 1) | (1 << 5))) !== 0) continue;
                try {
                  const rect = (
                    cssViewport as typeof cssViewport & {
                      convertToViewportRectangle: (value: number[]) => number[];
                    }
                  ).convertToViewportRectangle(raw.rect.map(Number));
                  const x = Math.min(rect[0]!, rect[2]!);
                  const y = Math.min(rect[1]!, rect[3]!);
                  keep.push({
                    x: (x / cssViewport.width) * 100,
                    y: (y / cssViewport.height) * 100,
                    width: (Math.abs(rect[2]! - rect[0]!) / cssViewport.width) * 100,
                    height: (Math.abs(rect[3]! - rect[1]!) / cssViewport.height) * 100,
                  });
                } catch {
                  /* a note without usable geometry keeps nothing */
                }
              }
              smartCropKeepBoxesRef.current = keep;
            }
            // /RD and the real font behind /DA come from the bytes: pdf.js
            
            const freeTextRefs: string[] = [];
            for (const annotation of Array.isArray(rawAnnotations)
              ? (rawAnnotations as unknown[])
              : []) {
              if (!annotation || typeof annotation !== "object") continue;
              const { subtype, id } = annotation as { subtype?: unknown; id?: unknown };
              if (subtype === "FreeText" && typeof id === "string") freeTextRefs.push(id);
            }
            const sourceFacts =
              freeTextRefs.length > 0
                ? await readNativeFreeTextSourceFacts(
                    pdfDoc,
                    async () =>
                      Uint8Array.from(
                        await (
                          pdfDoc as unknown as { getData: () => Promise<Uint8Array> }
                        ).getData(),
                      ),
                    freeTextRefs,
                  ).catch(() => null)
                : null;
            if (cancelled) return;
            const imported = normalizeNativePdfFreeTextAnnotations(
              rawAnnotations,
              pageNumber,
              {
                width: cssViewport.width,
                height: cssViewport.height,
                scale,
                convertToViewportRectangle: (rect) =>
                  (
                    cssViewport as typeof cssViewport & {
                      convertToViewportRectangle: (
                        value: number[],
                      ) => [number, number, number, number];
                    }
                  ).convertToViewportRectangle(Array.from(rect)),
                measureTextWidth: measureFreeTextLineWidth,
              },
              sourceFacts,
            );
            for (const textBox of imported.textBoxes) {
              pdfDoc.annotationStorage?.setValue(
                textBox.nativeSource.objectRef,
                { noView: true },
              );
            }
            // A text box made in MRAI that the saved version paints: the
            // window's overlay draws it (its edits, its formula), so its
            // appearance is not painted under it -- the surface paints the
            // version, the page's text written into it included, instead of
            
            // with Insert > Text was missing from this view and its find).
            for (const [objectRef, facts] of sourceFacts ?? []) {
              if (facts.managedTextBox) pdfDoc.annotationStorage?.setValue(objectRef, { noView: true });
            }
            onNativeFreeTextAnnotationsChange?.({
              pageNumber,
              textBoxes: imported.textBoxes,
              losses: imported.losses,
            });
          } catch {
            onNativeFreeTextAnnotationsChange?.({
              pageNumber,
              textBoxes: [],
              losses: [{ reason: "invalid_page_geometry" }],
            });
          }
        }

        const canvas = canvasRef.current;
        if (canvas) {
          // A page already painted is never blanked for the next paint:
          // the new one renders offscreen and replaces it whole. (A fresh
          // canvas element measures 300x150 before anything is painted, so
          // the record of a completed paint decides, not the size.)
          const painted = lastRenderedRef.current !== null && canvas.width > 0 && canvas.height > 0;
          const target = painted ? canvas.ownerDocument.createElement("canvas") : canvas;
          target.width = renderViewport.width;
          target.height = renderViewport.height;
          if (!painted) {
            canvas.style.width = `${cssViewport.width}px`;
            canvas.style.height = `${cssViewport.height}px`;
          }
          const ctx = target.getContext("2d");
          if (ctx) {
            renderTaskRef.current?.cancel();
            const task = pdfPage.render({
              canvas: target,
              canvasContext: ctx,
              viewport: renderViewport,
              // Rendered from the document's annotation storage: an imported
              // FreeText shown as an editable box is marked noView there, and
              // the default mode never reads the storage, so its appearance
              // stayed painted under the box -- its text twice (bug list).
              annotationMode: PDFJS_ANNOTATION_MODE_ENABLE_STORAGE,
            });
            renderTaskRef.current = task;
            activeTask = task;
            let rendered = true;
            await task.promise.catch(() => { rendered = false; });
            if (target !== canvas) {
              if (rendered && !cancelled) {
                canvas.width = target.width;
                canvas.height = target.height;
                canvas.style.width = `${cssViewport.width}px`;
                canvas.style.height = `${cssViewport.height}px`;
                canvas.getContext("2d")?.drawImage(target, 0, 0);
              }
              target.width = 0;
              target.height = 0;
            }
            if (rendered && !cancelled) {
              const installed = installedSourceRef.current;
              paintedRenderRef.current = {
                doc: pdfDoc,
                url: installed?.doc === pdfDoc ? installed.url : null,
                page,
                pageNumber,
                rotation,
                scale: renderScale,
                width: canvas.width,
                height: canvas.height,
              };
            } else if (target === canvas) {
              // A cancelled paint left the canvas matching no record.
              paintedRenderRef.current = null;
            }
          }
        }

        const textContent = await readPdfTextContent(pdfPage);
        if (cancelled) {
          return;
        }
        const extractedBoxes = repairShortCjkTextBoxesFromPageText(
          textBoxesFromPdfTextContent(textContent, cssViewport, `p${page}`, {
            commonObjs: (
              pdfPage as unknown as {
                commonObjs?: {
                  has?: (id: string) => boolean;
                  get?: (id: string) => unknown;
                };
              }
            ).commonObjs,
            textTrust,
          }),
          effectivePageTextHint,
        ).map((box) => {
          const color =
            sampleTextBoxTextColor(canvasRef.current, box) ?? box.color;
          return {
            ...box,
            color,
            runs: samplePdfTextRunColors(canvasRef.current, box.runs, color),
          };
        });
        setBoxes(extractedBoxes);
        setBoxesPage(page);
        setPageSize({
          width: cssViewport.width,
          height: cssViewport.height,
          documentHeight: unscaled.height,
        });
        setPageSizePage(page);
        setLoading(false);
        lastRenderedRef.current = { doc: pdfDoc, page };
        const pendingImageReport = pendingImageRevisionReportRef.current;
        if (pendingImageReport && pendingImageReport.doc === pdfDoc && pendingImageReport.page === page) {
          pendingImageRevisionReportRef.current = null;
          onSourceRevisionRenderedRef.current?.(urlRef.current);
        }
        if (process.env.NODE_ENV !== "production" && inPlace) {
          console.debug("[pdf-editor] page painted in place", { page: pageNumber, url: urlRef.current.slice(-40) });
        }
        // In image editing the revision has rendered once its pictures are
        // inventoried (below); otherwise the painted page is the revision.
        if (!imageEditModeRef.current) onSourceRevisionRenderedRef.current?.(urlRef.current);
      } catch (err) {
        if (cancelled) return;
        // A revision swap retires the document it replaces at once, and a
        // render of that document still in flight then fails: that is not
        // this page failing. It flashed the load-error bar (68px, pushing
        
        if (process.env.NODE_ENV !== "production") {
          try {
            console.debug("[pdf-editor] page render failed", {
              error: String(err).slice(0, 200),
              installed: installedSourceRef.current?.doc === pdfDoc,
            });
          } catch { /* diagnostics never throw */ }
        }
        if (installedSourceRef.current && installedSourceRef.current.doc !== pdfDoc) return;
        setError("page");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      activeTask?.cancel();
      if (renderTaskRef.current === activeTask) {
        renderTaskRef.current = null;
      }
    };
  }, [
    pdfDoc,
    page,
    pageRotations,
    containerWidth,
    effectivePageTextHint,
    viewMode,
    textTrust,
    onNativeFreeTextAnnotationsChange,
    pageRetryRevision,
  ]);

  const currentPageBoxes = useMemo(
    () => (boxesPage === page ? boxes : []),
    [boxes, boxesPage, page],
  );
  const currentPageSize = useMemo(
    () => (pageSizePage === page ? pageSize : null),
    [page, pageSize, pageSizePage],
  );

  const extractedBoxesById = useMemo(() => {
    const map: Record<string, TextBox> = {};
    for (const box of currentPageBoxes) map[box.id] = box;
    return map;
  }, [currentPageBoxes]);

  const staleSameIdEditIds = useMemo(
    () =>
      edits
        .filter((edit) => {
          if (edit.page !== page) return false;
          const extracted = extractedBoxesById[edit.id];
          return (
            Boolean(extracted) &&
            sameIdEditShouldBeDroppedAsStale(edit, extracted)
          );
        })
        .map((edit) => edit.id)
        .sort(),
    [edits, extractedBoxesById, page],
  );
  const staleSameIdEditKey = staleSameIdEditIds.join("\u0000");

  const obsoleteSameIdEditIds = useMemo(
    () =>
      edits
        .filter((edit) => {
          if (edit.page !== page) return false;
          if (!extractedBoxesById[edit.id]) return false;
          return isObsoletePersistedTextBoxEdit(edit, currentPageBoxes, {
            pageTextHint: effectivePageTextHint,
          });
        })
        .map((edit) => edit.id)
        .sort(),
    [currentPageBoxes, edits, extractedBoxesById, effectivePageTextHint, page],
  );
  const obsoleteSameIdEditKey = obsoleteSameIdEditIds.join("\u0000");

  const obsoletePersistedOnlyEditIds = useMemo(() => {
    const extractedIds = new Set(currentPageBoxes.map((box) => box.id));
    return edits
      .filter((edit) => edit.page === page && !extractedIds.has(edit.id))
      .filter((edit) =>
        isObsoletePersistedTextBoxEdit(edit, currentPageBoxes, {
          pageTextHint: effectivePageTextHint,
        }),
      )
      .map((edit) => edit.id)
      .sort();
  }, [currentPageBoxes, edits, effectivePageTextHint, page]);
  const obsoletePersistedOnlyEditKey =
    obsoletePersistedOnlyEditIds.join("\u0000");
  const obsoletePersistedOnlyEditIdSet = useMemo(
    () => new Set(obsoletePersistedOnlyEditIds),
    [obsoletePersistedOnlyEditIds],
  );

  const reanchoredPersistedOnlyEdits = useMemo(() => {
    const extractedIds = new Set(currentPageBoxes.map((box) => box.id));
    const editIdsOnPage = new Set(
      edits.filter((edit) => edit.page === page).map((edit) => edit.id),
    );
    const claimedTargetIds = new Set<string>();
    const migrated: Array<{ fromId: string; edit: PdfTextBoxEdit }> = [];
    for (const edit of edits) {
      if (edit.page !== page || edit.created) continue;
      if (extractedIds.has(edit.id)) continue;
      if (obsoletePersistedOnlyEditIdSet.has(edit.id)) continue;
      const anchor = findTextBoxEditAnchor(edit, currentPageBoxes);
      if (!anchor || editIdsOnPage.has(anchor.id)) continue;
      if (claimedTargetIds.has(anchor.id)) continue;
      claimedTargetIds.add(anchor.id);
      migrated.push({
        fromId: edit.id,
        edit: reanchorTextBoxEdit(edit, anchor),
      });
    }
    return migrated;
  }, [currentPageBoxes, edits, obsoletePersistedOnlyEditIdSet, page]);
  const reanchoredPersistedOnlyEditKey = reanchoredPersistedOnlyEdits
    .map(({ fromId, edit }) => `${fromId}->${edit.id}`)
    .sort()
    .join("\u0000");
  const reanchoredPersistedOnlyEditIdSet = useMemo(
    () => new Set(reanchoredPersistedOnlyEdits.map(({ fromId }) => fromId)),
    [reanchoredPersistedOnlyEdits],
  );

  useEffect(() => {
    if (
      !staleSameIdEditKey &&
      !obsoleteSameIdEditKey &&
      !obsoletePersistedOnlyEditKey
    ) {
      return;
    }
    const staleIds = new Set(
      [staleSameIdEditKey, obsoleteSameIdEditKey, obsoletePersistedOnlyEditKey]
        .filter(Boolean)
        .flatMap((key) => key.split("\u0000")),
    );
    onEditsChange((current) => {
      const next = current.filter(
        (edit) => !(edit.page === page && staleIds.has(edit.id)),
      );
      return next.length === current.length ? current : next;
    });
  }, [
    obsoletePersistedOnlyEditKey,
    obsoleteSameIdEditKey,
    onEditsChange,
    page,
    staleSameIdEditKey,
  ]);

  useEffect(() => {
    if (!reanchoredPersistedOnlyEditKey) return;
    onEditsChange((current) => {
      const migrations = new Map(
        reanchoredPersistedOnlyEdits.map(({ fromId, edit }) => [fromId, edit]),
      );
      const targetIds = new Set(
        reanchoredPersistedOnlyEdits.map(({ edit }) => edit.id),
      );
      const existingTargetIds = new Set(
        current
          .filter((edit) => edit.page === page && targetIds.has(edit.id))
          .map((edit) => edit.id),
      );
      let changed = false;
      const next = current.filter((edit) => {
        const shouldRemove = edit.page === page && migrations.has(edit.id);
        changed = changed || shouldRemove;
        return !shouldRemove;
      });
      for (const { edit } of reanchoredPersistedOnlyEdits) {
        if (existingTargetIds.has(edit.id)) continue;
        next.push(edit);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [
    onEditsChange,
    page,
    reanchoredPersistedOnlyEditKey,
    reanchoredPersistedOnlyEdits,
  ]);

  const editsById = useMemo(() => {
    const map: Record<string, PdfTextBoxEdit> = {};
    for (const edit of edits) {
      if (edit.page !== page) continue;
      const extracted = extractedBoxesById[edit.id];
      if (extracted && sameIdEditShouldBeDroppedAsStale(edit, extracted)) {
        continue;
      }
      if (
        isObsoletePersistedTextBoxEdit(edit, currentPageBoxes, {
          pageTextHint: effectivePageTextHint,
        })
      ) {
        continue;
      }
      map[edit.id] = edit;
    }
    for (const { edit } of reanchoredPersistedOnlyEdits) {
      map[edit.id] ??= edit;
    }
    return map;
  }, [
    currentPageBoxes,
    edits,
    extractedBoxesById,
    effectivePageTextHint,
    page,
    reanchoredPersistedOnlyEdits,
  ]);

  // Persisted boxes can outlive extraction ids when the paragraph grouping model
  // improves. Synthesize any saved edit that is not present in the freshly
  // extracted boxes so older edits never disappear after a regrouping upgrade.
  const persistedOnlyBoxes = useMemo<TextBox[]>(() => {
    const extractedIds = new Set(currentPageBoxes.map((box) => box.id));
    return edits
      .filter((e) => e.page === page && !extractedIds.has(e.id))
      .filter((e) => !reanchoredPersistedOnlyEditIdSet.has(e.id))
      .filter(
        (e) =>
          !isObsoletePersistedTextBoxEdit(e, currentPageBoxes, {
            pageTextHint: effectivePageTextHint,
          }),
      )
      .map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        text: e.text,
        fontSize: e.fontSize ?? 0.018,
        fontFamily: e.fontFamily,
        displayFontFamily: e.fontFamily,
        sourceFontName: e.sourceFontName,
        bold: e.bold,
        italic: e.italic,
        runs: e.runs,
        lineLayout: e.lineLayout,
        color: e.color,
        kind: e.kind,
        latex: e.latex,
      }));
  }, [
    currentPageBoxes,
    edits,
    effectivePageTextHint,
    page,
    reanchoredPersistedOnlyEditIdSet,
  ]);

  // Extracted paragraph boxes + persisted-only boxes, de-duplicated by id.
  const allBoxes = useMemo<TextBox[]>(() => {
    const seen = new Set(currentPageBoxes.map((b) => b.id));
    return [
      ...currentPageBoxes,
      ...persistedOnlyBoxes.filter((b) => !seen.has(b.id)),
    ];
  }, [currentPageBoxes, persistedOnlyBoxes]);

  const ensureTextBoxBackgroundColor = useCallback(
    (edit: PdfTextBoxEdit): PdfTextBoxEdit => {
      // An imported FreeText keeps its own fill, none included: a sampled
      // white would be saved into the object and cover what it lets show
      
      // is clear by contract (the line under it is hidden, not covered): a
      // fill made it ineligible as a source box, and its next save deleted
      
      // A box typed on the page has no fill either, as a WPS text box has
      // none until one is chosen (a sampled white hid the lines under a box
      // taller than its line; audit 18644-18681).
      if (
        (typeof edit.backgroundColor === "string" &&
          edit.backgroundColor.trim() !== "") ||
        edit.nativeSource || edit.sourceText === undefined || !pdfSourceTextBoxCoversInk(edit.sourceText)
      ) {
        return edit;
      }
      return {
        ...edit,
        backgroundColor:
          sampleTextBoxBackgroundColor(canvasRef.current, edit) ??
          DEFAULT_TEXTBOX_BACKGROUND,
      };
    },
    [],
  );

  // The persisted edit a change would replace — the undo record for that box.
  const persistedEditBefore = useCallback(
    (pageIndex: number, id: string): PdfTextBoxEdit | undefined =>
      edits.find((e) => e.page === pageIndex && e.id === id),
    [edits],
  );

  const handleEditBox = useCallback(
    (edit: PdfTextBoxEdit, options?: PdfTextBoxEditEmitOptions) => {
      const enriched = ensureTextBoxBackgroundColor(edit);
      const nativeSource = sanitizeNativePdfFreeTextAnnotationSource(
        enriched.nativeSource,
      );
      const prepared = nativeSource
        ? {
            ...enriched,
            created: true as const,
            nativeSource,
            sourceAction: "content_style_geometry" as const,
            // Any user gesture invalidates the previous appearance. The host
            // renders a fresh one before committing the native directive.
            nativeAppearanceImage: undefined,
          }
        : enriched;
      // Housekeeping emissions (origin widening / auto-fit) bypass the undo
      // history: recording them would let an undo fight the emitting effect.
      if (!onTextBoxHistory || options?.transient) {
        // (In the place the list has it: moved to the end, the box's
        // element moved too and the caret left it, pdfTextBoxListWithBox.)
        onEditsChange((current) => pdfTextBoxListWithBox(current, prepared, prepared));
        return;
      }
      onTextBoxHistory({
        page: prepared.page,
        changes: [
          {
            id: prepared.id,
            before: persistedEditBefore(prepared.page, prepared.id),
            after: prepared,
          },
        ],
        foldKey: options?.fold
          ? `${options.fold}:${prepared.page}:${prepared.id}`
          : undefined,
      });
    },
    [
      ensureTextBoxBackgroundColor,
      onEditsChange,
      onTextBoxHistory,
      persistedEditBefore,
    ],
  );

  // Crop the rendered canvas around a transcription-needed formula box and ask
  // the vision endpoint for its LaTeX. The canvas holds the CORRECT glyphs even
  // when the PDF's math-font text is charcode garbage, so the crop — not the
  // extracted text — is the reliable transcription source.
  const transcribeFormulaBox = useCallback(
    async (box: TextBox): Promise<string> => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("pdf canvas unavailable");
      const rect = formulaTranscribeCropRect({
        box,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      });
      if (!rect) throw new Error("formula region too small to capture");
      const crop = document.createElement("canvas");
      crop.width = rect.width;
      crop.height = rect.height;
      const ctx = crop.getContext("2d");
      if (!ctx) throw new Error("2d canvas context unavailable");
      // Opaque white backing: a transparent PNG region reads as black in many
      // vision pipelines.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.drawImage(
        canvas,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
      );
      const base64 = dataUrlToBase64(crop.toDataURL("image/png"));
      if (!base64) throw new Error("failed to encode formula image");
      const res = await apiPost<{ latex?: string }>(
        "/api/v1/ai/notebook/pdf-formula-transcribe",
        { image_b64: base64, image_mime_type: "image/png" },
      );
      return (res.latex ?? "").trim();
    },
    [],
  );

  // Place a brand-new text box at the fractional click position (Add-Text mode).
  // The id is unique per page + time so re-renders never collide; the box is
  // clamped on-page and persisted immediately (with empty text — the overlay
  // shows the cursor for the user to type).
  const handleCreateBox = useCallback(
    (xFrac: number, yFrac: number) => {
      const id = `new-${page}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const fontSize =
        addTextStyle &&
        currentPageSize?.documentHeight &&
        Number.isFinite(addTextStyle.fontSizePoints) &&
        addTextStyle.fontSizePoints > 0
          ? addTextStyle.fontSizePoints / currentPageSize.documentHeight
          : undefined;
      const box = ensureTextBoxBackgroundColor({
        ...createTextBox(xFrac, yFrac, {
          page,
          id,
          color: addTextStyle?.color,
          fontSize,
        }),
        ...(addTextStyle?.fontFamily.trim()
          ? { fontFamily: addTextStyle.fontFamily.trim() }
          : {}),
        ...(addTextStyle?.sourceFontName?.trim()
          ? { sourceFontName: addTextStyle.sourceFontName.trim() }
          : {}),
      });
      if (onTextBoxHistory) {
        // A brand-new id: `before` is undefined, so undo removes the box.
        onTextBoxHistory({ page, changes: [{ id, after: box }] });
        return;
      }
      onEditsChange((current) => [...current, box]);
    },
    [
      addTextStyle,
      currentPageSize,
      ensureTextBoxBackgroundColor,
      onEditsChange,
      onTextBoxHistory,
      page,
    ],
  );

  // Remove a persisted edit (a created "Add Text" box) entirely. Scoped to the
  // current page id so a same-id edit on another page is never touched. The edit
  // list is the source of truth, so dropping it here (and re-emitting via
  // onEditsChange, which the host persists) makes the box disappear next render.
  const handleDeleteBox = useCallback(
    (id: string) => {
      const before = persistedEditBefore(page, id);
      const nativeSource = sanitizeNativePdfFreeTextAnnotationSource(
        before?.nativeSource,
      );
      if (before && nativeSource) {
        const after: PdfTextBoxEdit = {
          ...before,
          text: "",
          deleted: true,
          created: true,
          nativeSource,
          nativeAppearanceImage: undefined,
        };
        if (onTextBoxHistory) {
          onTextBoxHistory({ page, changes: [{ id, before, after }] });
          return;
        }
        onEditsChange((current) => pdfTextBoxListWithBox(current, { page, id }, after));
        return;
      }
      if (onTextBoxHistory && before) {
        // `after` undefined removes the edit; undo restores the record.
        onTextBoxHistory({ page, changes: [{ id, before }] });
        return;
      }
      onEditsChange((current) =>
        current.filter((e) => !(e.page === page && e.id === id)),
      );
    },
    [onEditsChange, onTextBoxHistory, page, persistedEditBefore],
  );

  // ---- Find & Replace over the editable text boxes (WPS/Acrobat) ----------
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const continuousPageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const continuousObservedPageRef = useRef<number | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null);
  // Bumped per sweep; a stale run sees the mismatch and stops between pages.
  const replaceRunRef = useRef(0);
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findActiveIndex, setFindActiveIndex] = useState(-1);
  // The other pages' boxes (effective text) for the editor's document find,
  // read once per document and edit set while the find bar has a term.
  const [docFindBoxes, setDocFindBoxes] = useState<
    ReadonlyMap<number, ReplaceBoxWithPage[]>
  >(() => new Map());
  const [continuousMountedPages, setContinuousMountedPages] = useState<
    ReadonlySet<number>
  >(() => new Set([page]));
  const [continuousPageAspectRatio, setContinuousPageAspectRatio] =
    useState(1.414);
  const [continuousPageTexts, setContinuousPageTexts] = useState<
    Record<number, string>
  >({});
  const [continuousPageTargets, setContinuousPageTargets] = useState<
    Record<number, PdfTextBoxCommandTarget[]>
  >({});

  const setContinuousPageRef = useCallback(
    (pageIndex: number) => (node: HTMLDivElement | null) => {
      if (node) {
        continuousPageRefs.current.set(pageIndex, node);
      } else {
        continuousPageRefs.current.delete(pageIndex);
      }
    },
    [],
  );

  const handleContinuousPageTextChange = useCallback(
    ({ page: pageIndex, text }: { page: number; text: string }) => {
      setContinuousPageTexts((current) =>
        current[pageIndex] === text
          ? current
          : { ...current, [pageIndex]: text },
      );
    },
    [],
  );

  // ---- Cross-page reflow (continuous mode) ------------------------------
  // The per-page overlay honestly sees one page; the seam between pages is
  // this component's to own. Chains are inferred over adjacent page pairs
  // with their REAL page numbers, so only genuine page-crossing links form.
  const [crossPageReflowDismissed, setCrossPageReflowDismissed] = useState<
    Set<string>
  >(() => new Set());

  const crossPageReflowOffer = useMemo(() => {
    if (viewMode !== "continuous") return null;
    return findCrossPageReflowOffer(
      edits,
      continuousPageTargets,
      crossPageReflowDismissed,
    );
  }, [continuousPageTargets, crossPageReflowDismissed, edits, viewMode]);

  const applyCrossPageReflow = useCallback(() => {
    const offer = crossPageReflowOffer;
    if (!offer) return;
    const built = buildCrossPageReflowEdits(
      offer,
      edits,
      continuousPageTargets,
    );
    if (!built || built.length === 0) return;
    onEditsChange((current) => {
      let next = [...current];
      for (const record of built) {
        const at = next.findIndex((edit) => edit.id === record.id);
        // The lib returns its own slice of the edit shape; keep whatever
        // extra fields an existing record carries (runs, latex, kind…).
        const merged = { ...(at >= 0 ? next[at] : {}), ...record };
        if (at >= 0) next[at] = merged;
        else next = [...next, merged];
      }
      return next;
    });
    setCrossPageReflowDismissed((current) =>
      new Set(current).add(offer.editId),
    );
  }, [continuousPageTargets, crossPageReflowOffer, edits, onEditsChange]);

  const handleContinuousPageTextBoxesChange = useCallback(
    ({
      page: pageIndex,
      boxes: nextBoxes,
    }: {
      page: number;
      boxes: PdfTextBoxCommandTarget[];
    }) => {
      setContinuousPageTargets((current) => ({
        ...current,
        [pageIndex]: nextBoxes,
      }));
    },
    [],
  );

  const mountContinuousPages = useCallback((pageIndexes: number[]) => {
    if (pageIndexes.length === 0) return;
    setContinuousMountedPages((current) => {
      let changed = false;
      const next = new Set(current);
      for (const pageIndex of pageIndexes) {
        if (pageIndex < 0) continue;
        if (!next.has(pageIndex)) {
          next.add(pageIndex);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) mountContinuousPages([page - 1, page, page + 1]);
    });
    return () => {
      cancelled = true;
    };
  }, [mountContinuousPages, page, viewMode]);

  // Images the page already contains, in the page's STORED orientation (the
  // operator list is written in it, and pdf-lib draws in it).
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  // The document the inventory was read from: a queued picture command may
  // only run once the inventory describes the document on the surface, or
  // it plans from the geometry before the write it waited for.
  const [placedImagesDoc, setPlacedImagesDoc] = useState<PdfDocumentProxyLike | null>(null);
  const [pageRotation, setPageRotation] = useState(0);
  const [selectedImageOrder, setSelectedImageOrder] = useState<number | null>(
    null,
  );
  const selectedImageOrderRef = useRef<number | null>(null);
  const [textSelectionResetKey, setTextSelectionResetKey] = useState(0);
  const suppressNextTextDeselectionRef = useRef(false);

  useEffect(() => {
    selectedImageOrderRef.current = null;
    setSelectedImageOrder(null);
    setTextSelectionResetKey((current) => current + 1);
    onObjectSelectionChange?.(null);
  }, [imageEditMode, onObjectSelectionChange, page]);

  useEffect(() => {
    if (!objectEditingDisabled) return;
    selectedImageOrderRef.current = null;
    setSelectedImageOrder(null);
    setTextSelectionResetKey((current) => current + 1);
    onObjectSelectionChange?.(null);
  }, [objectEditingDisabled, onObjectSelectionChange]);

  useEffect(() => {
    selectedImageOrderRef.current = null;
    setSelectedImageOrder(null);
    setTextSelectionResetKey((current) => current + 1);
    onObjectSelectionChange?.(null);
  }, [objectSelectionResetKey, onObjectSelectionChange]);

  const handleTextSelectionChange = useCallback(
    (selection: PdfTextBoxSelection | null) => {
      if (objectEditingDisabled) {
        onObjectSelectionChange?.(null);
        return;
      }
      if (!selection && selectedImageOrderRef.current !== null) {
        suppressNextTextDeselectionRef.current = false;
        return;
      }
      if (!selection && suppressNextTextDeselectionRef.current) {
        suppressNextTextDeselectionRef.current = false;
        return;
      }
      if (selection) {
        suppressNextTextDeselectionRef.current = false;
        selectedImageOrderRef.current = null;
        setSelectedImageOrder(null);
      }
      onObjectSelectionChange?.(
        selection ? { kind: "text", ...selection } : null,
      );
    },
    [objectEditingDisabled, onObjectSelectionChange],
  );

  const handleSelectedImageOrderChange = useCallback(
    (order: number | null) => {
      if (objectEditingDisabled) {
        selectedImageOrderRef.current = null;
        setSelectedImageOrder(null);
        onObjectSelectionChange?.(null);
        return;
      }
      selectedImageOrderRef.current = order;
      setSelectedImageOrder(order);
      if (order === null) {
        onObjectSelectionChange?.(null);
        return;
      }
      const image = placedImages.find((candidate) => candidate.order === order);
      if (!image) {
        selectedImageOrderRef.current = null;
        setSelectedImageOrder(null);
        onObjectSelectionChange?.(null);
        return;
      }
      const edit = imageEditAt(embeddedImageEdits ?? {}, page + 1, order);
      suppressNextTextDeselectionRef.current = true;
      setTextSelectionResetKey((current) => current + 1);
      onObjectSelectionChange?.({
        kind: "embedded-image",
        page: page + 1,
        order,
        hasEdit: Boolean(edit),
        rect: rotateFractionRect(currentRectFor(image, edit), pageRotation),
        rotated: image.rotated && !nativeImageTransformReady,
        // A saved transparency lives in the page's own graphics state once
        
        opacity: edit?.opacity ?? image.sourceOpacity ?? 1,
        editKind: edit?.kind,
        cropSupported:
          (!image.rotated || nativeImageTransformReady) &&
          pageRotation === 0 &&
          edit?.kind !== "replace" &&
          edit?.kind !== "rotate",
        rotationSupported:
          (!image.rotated || nativeImageTransformReady) &&
          pageRotation === 0 &&
          edit?.kind !== "crop" &&
          edit?.kind !== "replace" &&
          edit?.kind !== "rotate" &&
          quarterTurnPictureRect(
            rotateFractionRect(currentRectFor(image, edit), pageRotation),
            currentPageSize,
          ) !== null,
        rotationBlockedByPage:
          (!image.rotated || nativeImageTransformReady) &&
          pageRotation === 0 &&
          edit?.kind !== "crop" &&
          edit?.kind !== "replace" &&
          edit?.kind !== "rotate" &&
          quarterTurnPictureRect(
            rotateFractionRect(currentRectFor(image, edit), pageRotation),
            currentPageSize,
          ) === null,
        flipSupported:
          (!image.rotated || nativeImageTransformReady) &&
          pageRotation === 0 &&
          edit?.kind !== "crop" &&
          edit?.kind !== "replace" &&
          edit?.kind !== "rotate" &&
          edit?.kind !== "flip",
      });
    },
    [
      embeddedImageEdits,
      currentPageSize,
      objectEditingDisabled,
      onObjectSelectionChange,
      page,
      pageRotation,
      placedImages,
    ],
  );
  const handledSelectImageRequestRef = useRef(0);
  useEffect(() => {
    if (
      !selectImageRequest ||
      !imageEditMode ||
      selectImageRequest.page !== page + 1 ||
      handledSelectImageRequestRef.current === selectImageRequest.requestId ||
      !placedImages.some((image) => image.order === selectImageRequest.order)
    ) {
      return;
    }
    handledSelectImageRequestRef.current = selectImageRequest.requestId;
    handleSelectedImageOrderChange(selectImageRequest.order);
    // A re-selection after a save must not move the page: scrolling there
    
    if (!selectImageRequest.reveal) return;
    // The reader showed the picture where the user clicked it; this surface
    // opened at the page top. Bring the picture back under the pointer's
    // region instead of leaving it below the fold.
    const frame = window.requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(
          `[data-testid="pdf-embedded-image-${selectImageRequest.order}"]`,
        )
        ?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    handleSelectedImageOrderChange,
    imageEditMode,
    page,
    placedImages,
    selectImageRequest,
  ]);

  useEffect(() => {
    if (
      selectedImageOrder === null ||
      selectedImageOrderRef.current !== selectedImageOrder ||
      objectEditingDisabled
    ) {
      return;
    }
    const image = placedImages.find(
      (candidate) => candidate.order === selectedImageOrder,
    );
    if (!image) {
      onObjectSelectionChange?.(null);
      return;
    }
    const edit = imageEditAt(
      embeddedImageEdits ?? {},
      page + 1,
      selectedImageOrder,
    );
    onObjectSelectionChange?.({
      kind: "embedded-image",
      page: page + 1,
      order: selectedImageOrder,
      hasEdit: Boolean(edit),
      rect: rotateFractionRect(currentRectFor(image, edit), pageRotation),
      rotated: image.rotated && !nativeImageTransformReady,
      opacity: edit?.opacity ?? image.sourceOpacity ?? 1,
      editKind: edit?.kind,
      cropSupported:
        (!image.rotated || nativeImageTransformReady) &&
        pageRotation === 0 &&
        edit?.kind !== "replace" &&
        edit?.kind !== "rotate",
      rotationSupported:
        (!image.rotated || nativeImageTransformReady) &&
        pageRotation === 0 &&
        edit?.kind !== "crop" &&
        edit?.kind !== "replace" &&
        edit?.kind !== "rotate" &&
        quarterTurnPictureRect(
          rotateFractionRect(currentRectFor(image, edit), pageRotation),
          currentPageSize,
        ) !== null,
      rotationBlockedByPage:
        (!image.rotated || nativeImageTransformReady) &&
        pageRotation === 0 &&
        edit?.kind !== "crop" &&
        edit?.kind !== "replace" &&
        edit?.kind !== "rotate" &&
        quarterTurnPictureRect(
          rotateFractionRect(currentRectFor(image, edit), pageRotation),
          currentPageSize,
        ) === null,
      flipSupported:
        (!image.rotated || nativeImageTransformReady) &&
        pageRotation === 0 &&
        edit?.kind !== "crop" &&
        edit?.kind !== "replace" &&
        edit?.kind !== "rotate" &&
        edit?.kind !== "flip",
    });
  }, [
    embeddedImageEdits,
    currentPageSize,
    objectEditingDisabled,
    onObjectSelectionChange,
    page,
    pageRotation,
    placedImages,
    selectedImageOrder,
  ]);

  useEffect(() => {
    if (!imageEditMode || !pdfDoc) {
      setPlacedImages([]);
      setPlacedImagesDoc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const api = await loadCompatiblePdfJs();
        const pdfPage = await pdfDoc.getPage(
          Math.min(Math.max(1, page + 1), pdfDoc.numPages),
        );
        if (cancelled || !pdfPage.getOperatorList) return;
        const rotation = resolveAbsolutePageRotation(
          page + 1,
          pageRotations,
          pdfPage.rotate,
        );
        // Rotation 0: the operator list's transforms are in stored space, so
        // the page box they are measured against has to be too.
        const stored = pdfPage.getViewport({ scale: 1, rotation: 0 });
        const operatorList = await pdfPage.getOperatorList();
        if (cancelled) return;
        const ops = api.OPS as unknown as Record<string, number>;
        const ids: ImageOperatorIds = {
          save: ops.save,
          restore: ops.restore,
          transform: ops.transform,
          paintImageXObject: ops.paintImageXObject,
          paintInlineImageXObject: ops.paintInlineImageXObject,
          paintImageMaskXObject: ops.paintImageMaskXObject,
          clip: ops.clip,
          eoClip: ops.eoClip,
          constructPath: ops.constructPath,
          dependency: ops.dependency,
          setGState: ops.setGState,
          beginGroup: ops.beginGroup,
          endGroup: ops.endGroup,
          paintFormXObjectBegin: ops.paintFormXObjectBegin,
          paintFormXObjectEnd: ops.paintFormXObjectEnd,
        };
        setPageRotation(rotation);
        setPlacedImages(
          significantImages(
            placedImagesFromOperatorList(operatorList, ids, {
              width: stored.width,
              height: stored.height,
              transform: stored.transform,
            }),
          ),
        );
        setPlacedImagesDoc(pdfDoc);
        // The picture layer is placed; the revision counts as rendered once
        // the page itself has painted too (the render effect reports then),
        // otherwise a host dropping its placeholder here saw a blank page.
        const painted = lastRenderedRef.current;
        if (painted && painted.doc === pdfDoc && painted.page === page) {
          onSourceRevisionRenderedRef.current?.(urlRef.current);
        } else {
          pendingImageRevisionReportRef.current = { doc: pdfDoc, page };
        }
      } catch {
        if (!cancelled) {
          setPlacedImages([]);
          setPlacedImagesDoc(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageEditMode, page, pageRotations, pdfDoc]);

  /**
   * The stored-orientation rect of a placement.
   *
   * Looked up by paint order rather than read off the argument: the layer is
   * handed images in DISPLAY orientation and hands them back, so reading x/y
   * off one of those returns the rotated rect and the mask lands nowhere near
   * the image on any turned page.
   */
  const storedRectFor = useCallback(
    (image: PlacedImage) => {
      const source =
        placedImages.find((candidate) => candidate.order === image.order) ??
        image;
      return {
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
      };
    },
    [placedImages],
  );

  /** The rect the reader is looking at, for anything sampled off the canvas. */
  const shownRectFor = useCallback(
    (image: PlacedImage) =>
      rotateFractionRect(storedRectFor(image), pageRotation),
    [pageRotation, storedRectFor],
  );

  /** What the user sees, which is what they point at. */
  const displayImages = useMemo(
    () =>
      placedImages.map((image) => ({
        ...image,
        ...rotateFractionRect(storedRectFor(image), pageRotation),
      })),
    [pageRotation, placedImages, storedRectFor],
  );

  // The canvas that currently shows this page's pixels. Until the editor's
  // own canvas has painted, that is the reader's painting handed in on entry
  // (entryPainting): a picture dragged right after the click that opened the
  // editor cut its ghost from the still-blank own canvas and moved nothing
  
  const paintedPageCanvas = useCallback((): HTMLCanvasElement | null => {
    if (lastRenderedRef.current !== null) return canvasRef.current;
    if (entryPainting && entryPainting.pageNumber === page + 1) return entryPainting.canvas;
    return canvasRef.current;
  }, [entryPainting, page]);

  const sampleMaskColor = useCallback(
    (image: PlacedImage) =>
      sampleTextBoxBackgroundColor(paintedPageCanvas(), shownRectFor(image)),
    [paintedPageCanvas, shownRectFor],
  );

  useEffect(() => {
    // Renders of another document's pages are nothing to reuse.
    const cache = imageAbsentPagesRef.current;
    cache.clear();
    return () => cache.clear();
  }, [pdfDoc]);

  /**
   * The page as painted, the page without this picture (the removal plan's
   * bytes, rendered off screen with the painted viewport) and the per-pixel
   * model between them. Null whenever any of it cannot be had: the layer
   * then keeps the flat mask and the plain crop. Never rejects.
   */
  const imageDragBackdropFor = useCallback(
    async (image: PlacedImage): Promise<PdfEmbeddedImageDragBackdrop | null> => {
      try {
        const canvas = canvasRef.current;
        const painted = paintedRenderRef.current;
        const shown = lastRenderedRef.current;
        if (
          !canvas ||
          !painted?.url ||
          !shown ||
          shown.doc !== painted.doc ||
          shown.page !== painted.page ||
          painted.page !== page ||
          canvas.width !== painted.width ||
          canvas.height !== painted.height
        ) {
          return null;
        }
        const bounds = shownRectFor(image);
        const key = [
          painted.url,
          painted.pageNumber,
          image.order,
          painted.width,
          painted.height,
          painted.rotation,
          painted.scale,
        ].join("\u0000");
        const cache = imageAbsentPagesRef.current;
        let absentPage = cache.get(key);
        if (!absentPage) {
          const url = painted.url;
          absentPage = (async () => {
            // The byte cache keeps what pdf.js was handed a copy of; this
            // copy is ours to zero.
            const sourceBytes = new Uint8Array((await loadPdfBytes(url)).slice(0));
            try {
              return await renderEmbeddedImageAbsentPage({
                planners: nativePlanners,
                sourceBytes,
                pageNumber: painted.pageNumber,
                imageOrder: image.order,
                bounds,
                rotation: painted.rotation,
                scale: painted.scale,
                width: painted.width,
                height: painted.height,
              });
            } finally {
              sourceBytes.fill(0);
            }
          })().catch((error: unknown) => {
            if (process.env.NODE_ENV !== "production") {
              try {
                console.debug("[pdf-editor] picture drag backdrop unavailable", String(error).slice(0, 200));
              } catch { /* diagnostics never throw */ }
            }
            return null;
          });
          cache.set(key, absentPage);
          while (cache.size > IMAGE_ABSENT_PAGE_CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) break;
            cache.delete(oldest);
          }
        }
        const absent = await absentPage;
        if (!absent) {
          // Not remembered: the next drag may find the bytes reachable.
          if (cache.get(key) === absentPage) cache.delete(key);
          return null;
        }
        // The canvas must still show what the absent page was matched to.
        const now = paintedRenderRef.current;
        if (
          canvasRef.current !== canvas ||
          !now ||
          now.doc !== painted.doc ||
          now.url !== painted.url ||
          now.page !== painted.page ||
          canvas.width !== absent.canvas.width ||
          canvas.height !== absent.canvas.height
        ) {
          return null;
        }
        // A picture that paints its whole frame moves as that whole frame,
        // the parts that match the page under them included; one with a
        // mask, or turned out of its rectangle, only where it shows.
        // What the page paints over the picture (text set on a photo) stays
        // where it is, and the picture slides under whatever it lands
        
        const model = buildNativeVectorDragModel(canvas, absent.canvas, bounds, null, {
          footprint: absent.opaque && !image.rotated && !image.mask ? bounds : null,
          above: absent.above,
        });
        return model ? { model, bounds } : null;
      } catch {
        return null;
      }
    },
    [nativePlanners, page, shownRectFor],
  );

  /**
   * The picture's own pixels where it stands, as a PNG: from the drag's
   * model when that is ready in time (the picture alone, what the page
   * paints over it left out), else the page canvas cut there.
   */
  const imageOwnPixelsPng = useCallback(
    async (
      image: PlacedImage,
      shown: { x: number; y: number; width: number; height: number },
    ): Promise<Uint8Array | null> => {
      const canvas = paintedPageCanvas();
      const cut = () => cropCanvasRegionToPng(canvas, shown);
      if (!canvas || canvas !== canvasRef.current) return cut();
      const backdrop = await Promise.race([
        imageDragBackdropFor(image),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1_500)),
      ]);
      if (!backdrop || canvasRef.current !== canvas) return cut();
      try {
        const { model } = backdrop;
        const box = nativeVectorDragGhostBox(
          model,
          {
            x: backdrop.bounds.x * 100,
            y: backdrop.bounds.y * 100,
            width: backdrop.bounds.width * 100,
            height: backdrop.bounds.height * 100,
          },
          {
            width: backdrop.bounds.width * 100,
            height: backdrop.bounds.height * 100,
          },
        ).pixels;
        const width = Math.max(1, Math.round(box.width));
        const height = Math.max(1, Math.round(box.height));
        const own = document.createElement("canvas");
        own.width = width;
        own.height = height;
        const context = own.getContext("2d");
        if (!context) return cut();
        const data = context.createImageData(width, height);
        composeDragGhostPixels(
          { ...model, above: null },
          data.data,
          width,
          height,
          Math.round(box.x),
          Math.round(box.y),
        );
        context.putImageData(data, 0, 0);
        // The model's crop reaches a little past the frame; the move
        // carries the frame itself.
        const padLeft = Math.round(model.pad.left);
        const padTop = Math.round(model.pad.top);
        const frameWidth = Math.max(1, width - padLeft - Math.round(model.pad.right));
        const frameHeight = Math.max(1, height - padTop - Math.round(model.pad.bottom));
        const framed = document.createElement("canvas");
        framed.width = frameWidth;
        framed.height = frameHeight;
        framed
          .getContext("2d")
          ?.drawImage(own, padLeft, padTop, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        const blob = await new Promise<Blob | null>((resolve) =>
          framed.toBlob((value) => resolve(value), "image/png"),
        );
        return blob ? new Uint8Array(await blob.arrayBuffer()) : await cut();
      } catch {
        return cut();
      }
    },
    [imageDragBackdropFor, paintedPageCanvas],
  );

  const imageDragGhostFor = useCallback(
    (image: PlacedImage) => {
      const source = paintedPageCanvas();
      const cropped = cropCanvasRegion(source, shownRectFor(image));
      if (!cropped || !(cropped.canvas instanceof HTMLCanvasElement)) return null;
      return {
        canvas: cropped.canvas,
        maskColor: sampleMaskColor(image) ?? "#ffffff",
        // Only the surface's own painting has a known viewport to match; the
        // reader's entry painting keeps the flat mask.
        refine:
          source !== null && source === canvasRef.current
            ? () => imageDragBackdropFor(image)
            : undefined,
      };
    },
    [imageDragBackdropFor, paintedPageCanvas, sampleMaskColor, shownRectFor],
  );

  // Picture commands made while an earlier picture write is still being
  // saved wait here, in order, and each runs on the revision the one before
  // it produced. Running them at once merged them into the draft on its way
  
  type QueuedImageRect = { x: number; y: number; width: number; height: number };
  type QueuedImageAction =
    | { kind: "move" | "resize"; order: number; rect: QueuedImageRect }
    | { kind: "rotate"; order: number; direction: "left" | "right" }
    | { kind: "flip"; order: number; axis: "horizontal" | "vertical" }
    | { kind: "opacity"; order: number; opacity: number }
    | {
        kind: "crop";
        order: number;
        crop: EmbeddedImageCropRect;
        base: QueuedImageRect;
        target: QueuedImageRect;
      }
    | { kind: "delete" | "restore"; order: number }
    | { kind: "replace"; order: number; file: File };
  const imageWritePendingRef = useRef(imageWritePending);
  imageWritePendingRef.current = imageWritePending;
  const [imageActionQueue, setImageActionQueue] = useState<
    readonly QueuedImageAction[]
  >([]);
  const imageActionQueueRef = useRef(imageActionQueue);
  imageActionQueueRef.current = imageActionQueue;
  // Set while a released command is being staged (its pixels are cut
  // asynchronously): nothing else runs until the host shows it pending.
  const awaitingImageStageRef = useRef<number | null>(null);
  const bypassImageQueueRef = useRef(false);
  const releasedImageActionRef = useRef<object | null>(null);
  const [imageQueueTick, setImageQueueTick] = useState(0);
  const queueImageAction = useCallback((action: QueuedImageAction): boolean => {
    if (bypassImageQueueRef.current) return false;
    if (
      !imageWritePendingRef.current &&
      imageActionQueueRef.current.length === 0 &&
      awaitingImageStageRef.current === null
    ) {
      return false;
    }
    setImageActionQueue((queue) => {
      const last = queue[queue.length - 1];
      // Two drags in a row end where the second let go.
      if (
        last &&
        (last.kind === "move" || last.kind === "resize") &&
        last.kind === action.kind &&
        last.order === action.order
      ) {
        return [...queue.slice(0, -1), action];
      }
      return [...queue, action];
    });
    return true;
  }, []);
  const heldImageGesture = useMemo(() => {
    for (let index = imageActionQueue.length - 1; index >= 0; index -= 1) {
      const action = imageActionQueue[index];
      if (action.kind === "move" || action.kind === "resize") {
        return { order: action.order, rect: action.rect };
      }
    }
    return null;
  }, [imageActionQueue]);
  useEffect(() => {
    if (imageWritePending) awaitingImageStageRef.current = null;
  }, [imageWritePending]);
  useEffect(() => {
    onQueuedImageCommandsChange?.(imageActionQueue.length);
  }, [imageActionQueue.length, onQueuedImageCommandsChange]);

  const handleImageDelete = useCallback(
    (image: PlacedImage) => {
      if (queueImageAction({ kind: "delete", order: image.order })) return;
      onEmbeddedImageAction?.({
        kind: "delete",
        page: page + 1,
        image,
        origin: storedRectFor(image),
        maskColor: sampleMaskColor(image),
      });
    },
    [onEmbeddedImageAction, page, sampleMaskColor, storedRectFor, queueImageAction],
  );

  const handleImageRestore = useCallback(
    (image: PlacedImage) => {
      if (queueImageAction({ kind: "restore", order: image.order })) return;
      onEmbeddedImageAction?.({
        kind: "restore",
        page: page + 1,
        image,
        origin: storedRectFor(image),
      });
    },
    [onEmbeddedImageAction, page, storedRectFor, queueImageAction],
  );

  const handleImageReplace = useCallback(
    (image: PlacedImage, file: File) => {
      if (queueImageAction({ kind: "replace", order: image.order, file })) return;
      onEmbeddedImageAction?.({
        kind: "replace",
        page: page + 1,
        image,
        origin: storedRectFor(image),
        maskColor: sampleMaskColor(image),
        file,
      });
    },
    [onEmbeddedImageAction, page, sampleMaskColor, storedRectFor, queueImageAction],
  );

  const handleImageMove = useCallback(
    (
      image: PlacedImage,
      to: { x: number; y: number; width: number; height: number },
    ) => {
      if (queueImageAction({ kind: "move", order: image.order, rect: { ...to } })) {
        return;
      }
      const shown = shownRectFor(image);
      const maskColor = sampleMaskColor(image);
      // Cut the pixels BEFORE anything is applied: the canvas still shows the
      // original, which is the only place a moved image's content comes from.
      // With the drag's model at hand they are the picture alone, without
      
      void imageOwnPixelsPng(image, shown).then((pixels) => {
        if (objectEditingDisabledRef.current) return;
        onEmbeddedImageAction?.({
          kind: "move",
          page: page + 1,
          image,
          origin: storedRectFor(image),
          maskColor,
          rect: unrotateFractionRect(to, pageRotation),
          pixels: pixels ?? undefined,
        });
      });
    },
    [
      imageOwnPixelsPng,
      onEmbeddedImageAction,
      page,
      pageRotation,
      queueImageAction,
      sampleMaskColor,
      shownRectFor,
      storedRectFor,
    ],
  );

  const handleImageResize = useCallback(
    (
      image: PlacedImage,
      shownTarget: { x: number; y: number; width: number; height: number },
    ) => {
      if (
        queueImageAction({
          kind: "resize",
          order: image.order,
          rect: { ...shownTarget },
        })
      ) {
        return;
      }
      const source = shownRectFor(image);
      const maskColor = sampleMaskColor(image);
      void cropCanvasRegionToPng(paintedPageCanvas(), source).then((pixels) => {
        if (objectEditingDisabledRef.current) return;
        onEmbeddedImageAction?.({
          kind: "resize",
          page: page + 1,
          image,
          origin: storedRectFor(image),
          maskColor,
          rect: unrotateFractionRect(shownTarget, pageRotation),
          pixels: pixels ?? undefined,
        });
      });
    },
    [
      onEmbeddedImageAction,
      page,
      pageRotation,
      paintedPageCanvas,
      queueImageAction,
      sampleMaskColor,
      shownRectFor,
      storedRectFor,
    ],
  );

  const handleImageOpacity = useCallback(
    (image: PlacedImage, opacity: number) => {
      if (queueImageAction({ kind: "opacity", order: image.order, opacity })) return;
      if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 1) return;
      const shown = shownRectFor(image);
      const maskColor = sampleMaskColor(image);
      void cropCanvasRegionToPng(paintedPageCanvas(), shown).then((pixels) => {
        if (objectEditingDisabledRef.current) return;
        onEmbeddedImageAction?.({
          kind: "opacity",
          page: page + 1,
          image,
          origin: storedRectFor(image),
          maskColor,
          opacity,
          pixels: pixels ?? undefined,
        });
      });
    },
    [onEmbeddedImageAction, page, paintedPageCanvas, queueImageAction, sampleMaskColor, shownRectFor, storedRectFor],
  );

  const handleImageCrop = useCallback(
    (
      image: PlacedImage,
      crop: EmbeddedImageCropRect,
      shownTarget: { x: number; y: number; width: number; height: number },
    ) => {
      if (
        queueImageAction({
          kind: "crop",
          order: image.order,
          crop,
          base: shownRectFor(image),
          target: { ...shownTarget },
        })
      ) {
        return;
      }
      const source = shownRectFor(image);
      const pixelsRect = {
        x: source.x + crop.x * source.width,
        y: source.y + crop.y * source.height,
        width: crop.width * source.width,
        height: crop.height * source.height,
      };
      const maskColor = sampleMaskColor(image);
      void cropCanvasRegionToPng(paintedPageCanvas(), pixelsRect).then(
        (pixels) => {
          if (objectEditingDisabledRef.current) return;
          onEmbeddedImageAction?.({
            kind: "crop",
            page: page + 1,
            image,
            origin: storedRectFor(image),
            maskColor,
            crop,
            rect: unrotateFractionRect(shownTarget, pageRotation),
            pixels: pixels ?? undefined,
          });
        },
      );
    },
    [
      onEmbeddedImageAction,
      page,
      pageRotation,
      paintedPageCanvas,
      queueImageAction,
      sampleMaskColor,
      shownRectFor,
      storedRectFor,
    ],
  );

  const handleImageRotate = useCallback(
    (
      image: PlacedImage,
      direction: "left" | "right",
      shownRect: { x: number; y: number; width: number; height: number },
    ) => {
      if (queueImageAction({ kind: "rotate", order: image.order, direction })) return;
      if (!currentPageSize || pageRotation !== 0) return;
      const source = shownRectFor(image);
      const turns: 1 | 3 = direction === "right" ? 1 : 3;
      const target = quarterTurnPictureRect(shownRect, currentPageSize);
      if (!target) return;
      const maskColor = sampleMaskColor(image);
      void cropCanvasRegionToPng(paintedPageCanvas(), source, {
        quarterTurns: turns,
      }).then((pixels) => {
        if (objectEditingDisabledRef.current) return;
        onEmbeddedImageAction?.({
          kind: "rotate",
          page: page + 1,
          image,
          origin: storedRectFor(image),
          maskColor,
          direction,
          rect: target,
          pixels: pixels ?? undefined,
        });
      });
    },
    [
      currentPageSize,
      onEmbeddedImageAction,
      page,
      pageRotation,
      paintedPageCanvas,
      queueImageAction,
      sampleMaskColor,
      shownRectFor,
      storedRectFor,
    ],
  );

  const handleImageFlip = useCallback(
    (
      image: PlacedImage,
      axis: "horizontal" | "vertical",
      shownRect: { x: number; y: number; width: number; height: number },
    ) => {
      if (queueImageAction({ kind: "flip", order: image.order, axis })) return;
      if (pageRotation !== 0) return;
      const source = shownRectFor(image);
      const maskColor = sampleMaskColor(image);
      void cropCanvasRegionToPng(paintedPageCanvas(), source, {
        flipX: axis === "horizontal",
        flipY: axis === "vertical",
      }).then((pixels) => {
        if (objectEditingDisabledRef.current) return;
        onEmbeddedImageAction?.({
          kind: "flip",
          page: page + 1,
          image,
          origin: storedRectFor(image),
          maskColor,
          axis,
          rect: shownRect,
          pixels: pixels ?? undefined,
        });
      });
    },
    [
      onEmbeddedImageAction,
      page,
      pageRotation,
      paintedPageCanvas,
      queueImageAction,
      sampleMaskColor,
      shownRectFor,
      storedRectFor,
    ],
  );

  // The write before has landed (or failed and rolled back): the next
  // queued command goes to the picture as the page now paints it. A drag's
  // target is a place on the page, so it ends where the user let go.
  useEffect(() => {
    if (
      imageActionQueue.length === 0 ||
      imageWritePending ||
      placedImagesDoc !== pdfDoc
    ) {
      return;
    }
    const awaitingSince = awaitingImageStageRef.current;
    if (awaitingSince !== null) {
      // A released command that never staged (refused) stops holding the
      // rest after a moment.
      const timer = window.setTimeout(() => {
        if (awaitingImageStageRef.current === awaitingSince) {
          awaitingImageStageRef.current = null;
          setImageQueueTick((tick) => tick + 1);
        }
      }, Math.max(0, awaitingSince + 3_000 - Date.now()));
      return () => window.clearTimeout(timer);
    }
    const head = imageActionQueue[0];
    const frame = window.requestAnimationFrame(() => {
      if (releasedImageActionRef.current === head) return;
      releasedImageActionRef.current = head;
      setImageActionQueue((queue) => (queue[0] === head ? queue.slice(1) : queue));
      const image = displayImages.find((candidate) => candidate.order === head.order);
      if (!image) return;
      const rect = { x: image.x, y: image.y, width: image.width, height: image.height };
      awaitingImageStageRef.current = Date.now();
      bypassImageQueueRef.current = true;
      try {
        switch (head.kind) {
          case "move":
            handleImageMove(image, head.rect);
            break;
          case "resize":
            handleImageResize(image, head.rect);
            break;
          case "rotate":
            handleImageRotate(image, head.direction, rect);
            break;
          case "flip":
            handleImageFlip(image, head.axis, rect);
            break;
          case "opacity":
            handleImageOpacity(image, head.opacity);
            break;
          case "crop": {
            // The crop keeps its place relative to the picture, wherever the
            // commands before it put the picture.
            const sx = head.base.width > 0 ? rect.width / head.base.width : 1;
            const sy = head.base.height > 0 ? rect.height / head.base.height : 1;
            handleImageCrop(image, head.crop, {
              x: rect.x + (head.target.x - head.base.x) * sx,
              y: rect.y + (head.target.y - head.base.y) * sy,
              width: head.target.width * sx,
              height: head.target.height * sy,
            });
            break;
          }
          case "delete":
            handleImageDelete(image);
            break;
          case "restore":
            handleImageRestore(image);
            break;
          case "replace":
            handleImageReplace(image, head.file);
            break;
        }
      } finally {
        bypassImageQueueRef.current = false;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    displayImages,
    handleImageCrop,
    handleImageDelete,
    handleImageFlip,
    handleImageMove,
    handleImageOpacity,
    handleImageReplace,
    handleImageResize,
    handleImageRestore,
    handleImageRotate,
    imageActionQueue,
    imageQueueTick,
    imageWritePending,
    pdfDoc,
    placedImagesDoc,
  ]);

  /** Edits keyed the way the layer reads them, in display orientation. */
  const displayImageEdits = useMemo(() => {
    if (!embeddedImageEdits || pageRotation === 0) {
      return embeddedImageEdits ?? {};
    }
    const out: Record<string, (typeof embeddedImageEdits)[string]> = {};
    for (const [key, edit] of Object.entries(embeddedImageEdits)) {
      out[key] = {
        ...edit,
        origin: rotateFractionRect(edit.origin, pageRotation),
        rect: edit.rect
          ? rotateFractionRect(edit.rect, pageRotation)
          : undefined,
      };
    }
    return out;
  }, [embeddedImageEdits, pageRotation]);

  useEffect(() => {
    if (viewMode !== "continuous" || !pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(
          Math.min(Math.max(1, page + 1), pdfDoc.numPages),
        );
        if (cancelled) return;
        const rotation = resolveAbsolutePageRotation(
          page + 1,
          pageRotations,
          pdfPage.rotate,
        );
        const viewport = pdfPage.getViewport({ scale: 1, rotation });
        if (viewport.width > 0 && viewport.height > 0) {
          setContinuousPageAspectRatio(viewport.height / viewport.width);
        }
      } catch {
        // Keep the A-series portrait fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pageRotations, pdfDoc, viewMode]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const text = continuousPageTexts[page];
    if (typeof text !== "string") return;
    onPageTextChange?.({ page, text });
  }, [continuousPageTexts, onPageTextChange, page, viewMode]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const boxesForPage = continuousPageTargets[page];
    if (!boxesForPage) return;
    onPageTextBoxesChange?.({ page, boxes: boxesForPage });
  }, [continuousPageTargets, onPageTextBoxesChange, page, viewMode]);

  useEffect(() => {
    if (viewMode !== "continuous" || !pdfDoc || !onPageChange) return;
    const root = containerElRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const selectMostVisiblePage = () => {
      const rootRect = root.getBoundingClientRect();
      let bestPage: number | null = null;
      let bestRatio = 0;
      const pagesToMount: number[] = [];
      continuousPageRefs.current.forEach((node, pageIndex) => {
        const rect = node.getBoundingClientRect();
        const visible = Math.max(
          0,
          Math.min(rect.bottom, rootRect.bottom) -
            Math.max(rect.top, rootRect.top),
        );
        const ratio = visible / Math.max(1, rect.height);
        const nearViewport =
          rect.bottom >= rootRect.top - rootRect.height * 0.8 &&
          rect.top <= rootRect.bottom + rootRect.height * 0.8;
        if (nearViewport) {
          pagesToMount.push(pageIndex - 1, pageIndex, pageIndex + 1);
        }
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestPage = pageIndex;
        }
      });
      mountContinuousPages(pagesToMount);
      if (bestPage == null || bestRatio < 0.12 || bestPage === page) return;
      continuousObservedPageRef.current = bestPage;
      onPageChange(bestPage + 1);
    };

    const observer = new IntersectionObserver(selectMostVisiblePage, {
      root,
      threshold: [0, 0.12, 0.25, 0.5, 0.75],
    });
    continuousPageRefs.current.forEach((node) => observer.observe(node));
    selectMostVisiblePage();
    return () => observer.disconnect();
  }, [mountContinuousPages, onPageChange, page, pdfDoc, viewMode]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    if (continuousObservedPageRef.current === page) return;
    const target = continuousPageRefs.current.get(page);
    target?.scrollIntoView({ block: "start" });
  }, [page, viewMode]);

  const findOptions = useMemo(
    () => ({ caseSensitive: findCaseSensitive, wholeWord: findWholeWord }),
    [findCaseSensitive, findWholeWord],
  );

  // The current page's boxes as (id, effective text, page) for the replace
  // engine. Effective text = a persisted edit's text wins over the extracted
  // line's text, matching what the overlay renders + what an export bakes.
  const replaceBoxes = useMemo<ReplaceBoxWithPage[]>(
    () =>
      allBoxes.map((b) => {
        const edit = editsById[b.id];
        const kind = effectiveTextBoxKind(b, edit);
        return {
          id: b.id,
          text: edit?.text ?? b.text,
          kind,
          latex: latexForTextBoxKind(kind, edit?.latex ?? b.latex),
          page,
        };
      }),
    [allBoxes, editsById, page],
  );

  const effectivePageText = useMemo(
    () =>
      replaceBoxes
        .map((box) => box.text.trim())
        .filter(Boolean)
        .join("\n"),
    [replaceBoxes],
  );

  useEffect(() => {
    if (viewMode === "continuous") return;
    onPageTextChange?.({ page, text: effectivePageText });
  }, [effectivePageText, onPageTextChange, page, viewMode]);

  const commandTargets = useMemo<PdfTextBoxCommandTarget[]>(
    () =>
      allBoxes.map((box) => {
        const edit = editsById[box.id];
        const target = textBoxCommandTargetFromTextBox(box, page);
        const kind = effectiveTextBoxKind(box, edit);
        return {
          ...target,
          text: edit?.text ?? box.text,
          x: edit?.x ?? box.x,
          y: edit?.y ?? box.y,
          width: edit?.width ?? box.width,
          height: edit?.height ?? box.height,
          fontSize: edit?.fontSize ?? box.fontSize,
          fontFamily: edit?.fontFamily ?? box.fontFamily,
          sourceFontName: edit?.sourceFontName ?? box.sourceFontName,
          bold: edit?.bold ?? box.bold,
          italic: edit?.italic ?? box.italic,
          runs: edit?.runs ?? persistablePdfTextStyleRuns(box.runs, box.text),
          lineLayout:
            normalizePdfTextLineLayout(
              edit?.lineLayout,
              edit?.text ?? box.text,
            ) ?? normalizePdfTextLineLayout(box.lineLayout, box.text),
          kind,
          latex: latexForTextBoxKind(kind, edit?.latex ?? box.latex),
          edited: Boolean(edit),
          created: Boolean(edit?.created),
          ...(edit?.officeFamily ? { officeFamily: edit.officeFamily } : {}),
          ...(edit?.nativeSource ? { annotation: true } : {}),
        };
      }),
    [allBoxes, editsById, page],
  );

  useEffect(() => {
    if (viewMode === "continuous") return;
    onPageTextBoxesChange?.({ page, boxes: commandTargets });
  }, [commandTargets, onPageTextBoxesChange, page, viewMode]);

  // "Find in document" covers every page: the current page from its live
  
  
  const findMatchList = useMemo(() => {
    if (findTerm.trim().length === 0) return [];
    const pages = [{ page, boxes: replaceBoxes }];
    for (const [pageIndex, boxes] of docFindBoxes) {
      if (pageIndex !== page) pages.push({ page: pageIndex, boxes });
    }
    return findDocumentBoxMatches(pages, findTerm, findOptions);
  }, [docFindBoxes, findOptions, findTerm, page, replaceBoxes]);

  // Keep the effective active index inside the (possibly shrunken) match list
  // without a corrective setState effect. With no hit chosen yet, the first
  // hit at or after the page being edited is the current one.
  const effectiveFindActiveIndex = useMemo(() => {
    if (findMatchList.length === 0) return -1;
    if (findActiveIndex < 0 || findActiveIndex >= findMatchList.length) {
      const here = findMatchList.findIndex((match) => match.page >= page);
      return here >= 0 ? here : 0;
    }
    return findActiveIndex;
  }, [findMatchList, findActiveIndex, page]);

  const pageFindMatches = useMemo(
    () =>
      findOpen
        ? findMatchList.flatMap((match, index) =>
            match.page === page
              ? [
                  {
                    boxId: match.boxId,
                    start: match.start,
                    end: match.end,
                    active: index === effectiveFindActiveIndex,
                  },
                ]
              : [],
          )
        : [],
    [effectiveFindActiveIndex, findMatchList, findOpen, page],
  );

  const findLabel = useMemo(
    () => matchCountLabel(findMatchList.length, effectiveFindActiveIndex),
    [findMatchList.length, effectiveFindActiveIndex],
  );

  const boxesById = useMemo<Record<string, TextBox>>(() => {
    const map: Record<string, TextBox> = {};
    for (const b of allBoxes) map[b.id] = b;
    return map;
  }, [allBoxes]);

  // Seed a text-only edit for a box that has none yet, carrying the extracted
  // line's geometry + font + ORIGIN rect so a replace inside an unedited line
  // still masks the original glyphs on export (same seed the overlay's style
  // edits use). An existing edit is returned as-is so its fields ride through.
  /**
   * A persistable edit seeded from an extracted box, carrying the origin rect so
   * a replacement masks the glyphs it covers. Takes the page explicitly: the
   * whole-document sweep seeds boxes on pages this component never rendered.
   */
  const seedEditFromBox = useCallback(
    (box: TextBox, pageIndex: number): PdfTextBoxEdit => ({
      id: box.id,
      page: pageIndex,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      text: box.text,
      fontSize: box.fontSize,
      fontFamily: box.fontFamily,
      sourceFontName: box.sourceFontName,
      bold: box.bold,
      italic: box.italic,
      runs: persistablePdfTextStyleRuns(box.runs, box.text),
      lineLayout: normalizePdfTextLineLayout(box.lineLayout, box.text),
      kind: box.kind,
      latex: box.latex,
      // Carried from the extracted run: editing a watermark and downloading
      // must give back a watermark, not a horizontal line across the page.
      ...(box.angle ? { angle: box.angle } : {}),
      // Origin === extracted rect: the cover/mask pins to where the glyphs
      // were, so the replacement text covers the original line.
      originX: box.x,
      originY: box.y,
      originWidth: box.width,
      originHeight: box.height,
    }),
    [],
  );

  const editForReplace = useCallback(
    (boxId: string): PdfTextBoxEdit | undefined => {
      const existing = editsById[boxId];
      if (existing) return existing;
      const box = boxesById[boxId];
      if (!box) return undefined;
      return seedEditFromBox(box, page);
    },
    [editsById, boxesById, page, seedEditFromBox],
  );

  // ---- Whole-document find & replace ------------------------------------
  // "Replace all" means the whole document, which needs the boxes of pages this
  // component has never rendered. Box geometry is page-relative (0..1), so a
  // headless extraction at scale 1 yields exactly the numbers a rendered page
  // would; only the canvas colour sampling is skipped, leaving each box at the
  // colour the extractor derived.
  const docScanCacheRef = useRef<Map<number, TextBox[]>>(new Map());
  useEffect(() => {
    docScanCacheRef.current.clear();
  }, [pdfDoc]);

  const boxesForScan = useCallback(
    async (pageIndex: number): Promise<TextBox[] | null> => {
      if (pageIndex === page && allBoxes.length > 0) return allBoxes;
      const cached = docScanCacheRef.current.get(pageIndex);
      if (cached) return cached;
      if (!pdfDoc) return null;
      try {
        const pageNumber = Math.min(
          Math.max(1, pageIndex + 1),
          pdfDoc.numPages,
        );
        const pdfPage = await pdfDoc.getPage(pageNumber);
        const rotation = resolveAbsolutePageRotation(
          pageNumber,
          pageRotations,
          pdfPage.rotate,
        );
        const viewport = pdfPage.getViewport({ scale: 1, rotation });
        const textContent = await readPdfTextContent(pdfPage);
        const extracted = textBoxesFromPdfTextContent(
          textContent,
          viewport,
          `p${pageIndex}`,
          {
            commonObjs: (
              pdfPage as unknown as {
                commonObjs?: {
                  has?: (id: string) => boolean;
                  get?: (id: string) => unknown;
                };
              }
            ).commonObjs,
            textTrust,
          },
        );
        docScanCacheRef.current.set(pageIndex, extracted);
        return extracted;
      } catch {
        // One unreadable page must not abort a whole-document sweep.
        return null;
      }
    },
    [allBoxes, page, pageRotations, pdfDoc, textTrust],
  );

  // Read the other pages' boxes for the document find, with each box's
  // persisted edit applied (what the page shows and an export bakes).
  const findScanActive = findOpen && findTerm.trim().length > 0;
  useEffect(() => {
    if (!findScanActive || !pdfDoc) {
      setDocFindBoxes(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = new Map<number, ReplaceBoxWithPage[]>();
      for (let pageIndex = 0; pageIndex < pdfDoc.numPages; pageIndex += 1) {
        if (pageIndex === page) continue;
        const boxes = await boxesForScan(pageIndex);
        if (cancelled) return;
        if (!boxes) continue;
        next.set(
          pageIndex,
          boxes.map((box) => {
            const edit = persistedEditBefore(pageIndex, box.id);
            const kind = effectiveTextBoxKind(box, edit);
            return {
              id: box.id,
              text: edit?.text ?? box.text,
              kind,
              latex: latexForTextBoxKind(kind, edit?.latex ?? box.latex),
              page: pageIndex,
            };
          }),
        );
      }
      if (!cancelled) setDocFindBoxes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [boxesForScan, findScanActive, page, pdfDoc, persistedEditBefore]);

  // Merge changed edits (for this page) into the full edits list, replacing any
  // existing edit for the same box id + page.
  const mergeEdits = useCallback(
    (changed: PdfTextBoxEdit[]) => {
      if (changed.length === 0) return;
      const enriched = changed.map((edit) => {
        const existing = editsById[edit.id];
        const sourceBox = boxesById[edit.id];
        const previousText = existing?.text ?? sourceBox?.text ?? edit.text;
        const sourceRuns =
          existing?.runs ??
          (sourceBox && previousText === sourceBox.text
            ? sourceBox.runs
            : undefined);
        const sourceLineLayout =
          existing?.lineLayout ??
          (sourceBox && previousText === sourceBox.text
            ? sourceBox.lineLayout
            : undefined);
        return ensureTextBoxBackgroundColor({
          ...edit,
          runs: reconcilePdfTextStyleRuns(sourceRuns, previousText, edit.text),
          lineLayout: reconcilePdfTextLineLayout(
            sourceLineLayout,
            previousText,
            edit.text,
          ),
        });
      });
      if (onTextBoxHistory) {
        // A replace-one/replace-all sweep is ONE user gesture: record every
        // touched box in a single entry so one undo reverts the whole sweep.
        onTextBoxHistory({
          page,
          changes: enriched.map((e) => ({
            id: e.id,
            before: persistedEditBefore(page, e.id),
            after: e,
          })),
        });
        return;
      }
      onEditsChange((current) => {
        let next = current;
        for (const edit of enriched) next = pdfTextBoxListWithBox(next, { page, id: edit.id }, edit);
        return next;
      });
    },
    [
      ensureTextBoxBackgroundColor,
      boxesById,
      editsById,
      onEditsChange,
      onTextBoxHistory,
      page,
      persistedEditBefore,
    ],
  );

  const handleReplaceOne = useCallback(() => {
    if (findMatchList.length === 0 || effectiveFindActiveIndex < 0) return;
    const activeMatch = findMatchList[effectiveFindActiveIndex];
    if (activeMatch.page !== page) {
      // The hit is on another page: show it first; the next Replace acts.
      onPageChange?.(activeMatch.page + 1);
      return;
    }
    const result = applyReplaceOne({
      boxes: replaceBoxes,
      matchIndex: pageLocalMatchIndex(findMatchList, effectiveFindActiveIndex),
      query: findTerm,
      replacement: replaceValue,
      options: findOptions,
      editFor: editForReplace,
    });
    if (!result) return;
    if ("formulaLeft" in result) {
      // Inside a formula whose LaTeX cannot take the change: left whole,
      // said so, and Replace moves on.
      setReplaceStatus(t("presentation.findReplace.equationSkipped", { count: 1 }));
      if (findMatchList.length > 1) {
        setFindActiveIndex((effectiveFindActiveIndex + 1) % findMatchList.length);
      }
      return;
    }
    mergeEdits([result.editById]);
    // Re-anchor: stay on the same ordinal position (now pointing at what was the
    // NEXT match), clamped to the post-replace match count.
    const onThisPage = findMatchList.filter(
      (match) => match.page === page,
    ).length;
    const after =
      findMatchList.length - onThisPage + result.matchesAfter.length;
    setFindActiveIndex(
      after === 0 ? -1 : Math.min(effectiveFindActiveIndex, after - 1),
    );
  }, [
    findMatchList,
    onPageChange,
    page,
    effectiveFindActiveIndex,
    replaceBoxes,
    findTerm,
    replaceValue,
    findOptions,
    editForReplace,
    mergeEdits,
    t,
  ]);

  /**
   * Commit a sweep that crossed pages as ONE undo step. `mergeEdits` is
   * page-local in three ways (its by-id maps and its history entry all assume
   * the current page), so the document sweep has its own commit: it enriches
   * each edit against the box the SCAN produced, and records every page's
   * changes inside a single history entry via each change's own `page`.
   */
  const mergeEditsAcrossPages = useCallback(
    (changed: PdfTextBoxEdit[]) => {
      if (changed.length === 0) return;
      const sourceBoxFor = (edit: PdfTextBoxEdit): TextBox | undefined => {
        if (edit.page === page) return boxesById[edit.id];
        return docScanCacheRef.current
          .get(edit.page)
          ?.find((box) => box.id === edit.id);
      };
      const enriched = changed.map((edit) => {
        const existing = persistedEditBefore(edit.page, edit.id);
        const sourceBox = sourceBoxFor(edit);
        const previousText = existing?.text ?? sourceBox?.text ?? edit.text;
        const sourceRuns =
          existing?.runs ??
          (sourceBox && previousText === sourceBox.text
            ? sourceBox.runs
            : undefined);
        const sourceLineLayout =
          existing?.lineLayout ??
          (sourceBox && previousText === sourceBox.text
            ? sourceBox.lineLayout
            : undefined);
        return ensureTextBoxBackgroundColor({
          ...edit,
          runs: reconcilePdfTextStyleRuns(sourceRuns, previousText, edit.text),
          lineLayout: reconcilePdfTextLineLayout(
            sourceLineLayout,
            previousText,
            edit.text,
          ),
        });
      });
      if (onTextBoxHistory) {
        onTextBoxHistory({
          page,
          changes: enriched.map((edit) => ({
            id: edit.id,
            page: edit.page,
            before: persistedEditBefore(edit.page, edit.id),
            after: edit,
          })),
        });
        return;
      }
      onEditsChange((current) => {
        let next = current;
        for (const edit of enriched) next = pdfTextBoxListWithBox(next, edit, edit);
        return next;
      });
    },
    [
      boxesById,
      ensureTextBoxBackgroundColor,
      onEditsChange,
      onTextBoxHistory,
      page,
      persistedEditBefore,
    ],
  );

  const handleReplaceAll = useCallback(() => {
    if (!pdfDoc || replaceBusy) return;
    const query = findTerm;
    if (!query.trim()) return;
    const replacement = replaceValue;
    setReplaceBusy(true);
    setReplaceStatus(null);
    const token = ++replaceRunRef.current;
    void (async () => {
      try {
        const result = await replaceAcrossDocument<TextBox, PdfTextBoxEdit>({
          pageCount: pdfDoc.numPages,
          // This component keys pages 0-based (box ids are `p<index>-…` and an
          // edit's `page` is the same index), so the sweep counts from 0 too.
          firstPage: 0,
          boxesForPage: boxesForScan,
          query,
          replacement,
          options: findOptions,
          editFor: (box, pageIndex) =>
            persistedEditBefore(pageIndex, box.id) ??
            seedEditFromBox(box, pageIndex),
          canReplace: canWriteTextBoxEdit
            ? (box, pageIndex) =>
                canWriteTextBoxEdit(
                  persistedEditBefore(pageIndex, box.id) ??
                    seedEditFromBox(box, pageIndex),
                )
            : undefined,
          onPageVisited: (visited, total) => {
            if (replaceRunRef.current !== token) return;
            setReplaceStatus(
              t("pdfViewer.replaceAllScanning", { page: visited, total }),
            );
          },
          isCancelled: () => replaceRunRef.current !== token,
        });
        if (replaceRunRef.current !== token) return;
        mergeEditsAcrossPages(result.changedEdits);
        // Matches inside formulas whose LaTeX cannot take the change are
        // left, the formulas whole, and the line says how many.
        const formulaNote =
          result.formulaSkipped > 0
            ? t("presentation.findReplace.equationSkipped", { count: result.formulaSkipped })
            : "";
        const summary =
          result.skipped > 0
            ? result.replaced === 0
              ? t("pdfViewer.replaceAllPageTextOnly", {
                  count: result.skipped,
                })
              : t("pdfViewer.replaceAllDoneSkippedPageText", {
                  count: result.replaced,
                  pages: result.pages,
                  skipped: result.skipped,
                })
            : result.replaced === 0
              ? formulaNote
                ? ""
                : t("pdfViewer.replaceAllNone")
              : t("pdfViewer.replaceAllDone", {
                  count: result.replaced,
                  pages: result.pages,
                });
        setReplaceStatus([summary, formulaNote].filter(Boolean).join(" "));
        setFindActiveIndex(-1);
      } finally {
        if (replaceRunRef.current === token) setReplaceBusy(false);
      }
    })();
  }, [
    boxesForScan,
    canWriteTextBoxEdit,
    findOptions,
    findTerm,
    mergeEditsAcrossPages,
    pdfDoc,
    persistedEditBefore,
    replaceBusy,
    replaceValue,
    seedEditFromBox,
    t,
  ]);

  // A new search term invalidates the previous sweep's result line.
  useEffect(() => {
    setReplaceStatus(null);
  }, [findTerm]);

  const stepFind = useCallback(
    (direction: "next" | "prev") => {
      if (findMatchList.length === 0) return;
      const next =
        direction === "next"
          ? nextMatchIndex(findMatchList.length, effectiveFindActiveIndex)
          : prevMatchIndex(findMatchList.length, effectiveFindActiveIndex);
      setFindActiveIndex(next);
      
      const target = findMatchList[next];
      if (target && target.page !== page) onPageChange?.(target.page + 1);
    },
    [effectiveFindActiveIndex, findMatchList, onPageChange, page],
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setReplaceVisible(false);
    setFindActiveIndex(-1);
    // Abandon a whole-document sweep still walking pages: the run token moves,
    // so the in-flight loop stops at its next page boundary and drops its result.
    replaceRunRef.current += 1;
    setReplaceBusy(false);
    setReplaceStatus(null);
  }, []);

  // Ctrl/Cmd+F opens the find bar when the keystroke originates inside THIS
  // editor (so it doesn't fight other surfaces); Escape closes it.
  useEffect(() => {
    if (embeddedPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFindShortcut(event)) {
        const target = event.target as Node | null;
        const container = containerElRef.current;
        if (!container) return;
        if (!findOpen && !(target && container.contains(target))) return;
        event.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 0);
      } else if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        closeFind();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [embeddedPage, findOpen, closeFind]);

  // The find/replace UI, shared by both view modes. It used to live only in the
  // single-page branch, so continuous reading — the mode a long document is
  // actually read in — had no find bar at all.
  const findUi = embeddedPage ? null : (
    <>
        {!findOpen ? (
          <button
            type="button"
            className={TEXT_EDITOR_TARGET_CLASS}
            data-testid="pdf-text-editor-find-open"
            // Opening Find keeps the selected box selected, as the keyboard
            // path does: a press here deselected it, and a surface opened
            // from the reader for that box went back to the reader with no
            // find bar and a blank ribbon (user audit PDF 0067).
            data-pdf-object-selection-retain="true"
            onClick={() => {
              setFindOpen(true);
              window.setTimeout(() => {
                findInputRef.current?.focus();
                findInputRef.current?.select();
              }, 0);
            }}
            title={t("pdfViewer.replaceToggle")}
            aria-label={t("pdfViewer.replaceToggle")}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              zIndex: 5,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#ffffff",
              color: "#374151",
              fontSize: 12,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <ReplaceIcon size={14} />
            <span>{t("pdfViewer.replaceToggle")}</span>
          </button>
        ) : null}
        {findOpen ? (
          <PdfFindBar
            ref={findInputRef}
            term={findTerm}
            position={findLabel.position}
            total={findLabel.total}
            caseSensitive={findCaseSensitive}
            wholeWord={findWholeWord}
            disabled={loading}
            onTermChange={setFindTerm}
            onToggleCaseSensitive={() => setFindCaseSensitive((v) => !v)}
            onToggleWholeWord={() => setFindWholeWord((v) => !v)}
            onNext={() => stepFind("next")}
            onPrev={() => stepFind("prev")}
            onClose={closeFind}
            // Matching is live (computed from box texts), so an explicit submit is
            // a no-op beyond keeping focus — re-affirm by clearing nothing.
            onSubmit={() => undefined}
            replaceValue={replaceValue}
            onReplaceChange={setReplaceValue}
            replaceVisible={replaceVisible}
            onToggleReplace={() => setReplaceVisible((v) => !v)}
            onReplaceOne={handleReplaceOne}
            onReplaceAll={handleReplaceAll}
          replaceBusy={replaceBusy}
          replaceStatus={replaceStatus}
          />
        ) : null}
    </>
  );
  const loadErrorUi = error ? (
    <div
      role="alert"
      style={{ padding: 16, color: "#b91c1c" }}
      data-testid="pdf-text-editor-load-error"
    >
      <span>{loadFailedMessage}</span>
      <button
        type="button"
        className={TEXT_EDITOR_TARGET_CLASS}
        aria-label={retryLabel}
        disabled={loading}
        onClick={retryLoad}
        data-testid="pdf-text-editor-retry"
        style={{ marginLeft: 8 }}
      >
        <RefreshCw size={14} aria-hidden />
        {retryLabel}
      </button>
    </div>
  ) : null;
  const entryPaintingShown =
    loading && !error && entryPainting && entryPainting.pageNumber === page + 1
      ? entryPainting
      : null;
  const loadingUi = loading ? (
    entryPaintingShown ? (
      <div
        data-testid="pdf-text-editor-entry-painting"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        ref={(node) => {
          if (!node) return;
          const canvas = entryPaintingShown.canvas;
          if (canvas.parentElement !== node) {
            Object.assign(canvas.style, {
              display: "block",
              width: "100%",
              height: "auto",
            });
            node.replaceChildren(canvas);
          }
        }}
      />
    ) : (
      <WindowContentFallback kind="pdf" testId="pdf-text-editor-loading" />
    )
  ) : null;

  if (viewMode === "continuous") {
    const pageCount = pdfDoc?.numPages ?? 0;
    const estimatedPageHeight = Math.max(
      280,
      Math.round((containerWidth || 720) * continuousPageAspectRatio),
    );
    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          containerElRef.current = node;
        }}
        data-testid="pdf-text-editor"
        data-view-mode="continuous"
        data-pan-mode={panMode ? "true" : undefined}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={handlePanPointerEnd}
        onPointerCancel={handlePanPointerEnd}
        style={{
          position: "relative",
          width: "100%",
          overflow: "auto",
          cursor: panMode ? "grab" : undefined,
          userSelect: panMode ? "none" : undefined,
        }}
      >
        {findUi}
        {passwordGate ? (
          <PdfPasswordPrompt
            incorrect={passwordGate === "incorrect"}
            busy={loading}
            onSubmit={(password) => setPasswordAttempt({ url, password })}
          />
        ) : null}
        {loadErrorUi}
        {pageCount > 0 ? (
          <div className="pdf-text-editor__continuous-pages">
            {Array.from({ length: pageCount }, (_, pageIndex) => {
              const mounted =
                continuousMountedPages.has(pageIndex) ||
                Math.abs(pageIndex - page) <= 1;
              return (
                <div
                  key={pageIndex}
                  ref={setContinuousPageRef(pageIndex)}
                  className="pdf-text-editor__continuous-page"
                  data-page-number={pageIndex + 1}
                  style={
                    mounted ? undefined : { minHeight: estimatedPageHeight }
                  }
                >
                  {mounted ? (
                    <PdfTextEditor
                      url={url}
                      nativePlanners={nativePlannersProp}
                      documentKey={documentKey}
                      page={pageIndex}
                      viewMode="single"
                      pageRotations={pageRotations}
                      embeddedPage
                      activeEditingPage={pageIndex === page}
                      sharedPdfDoc={pdfDoc ?? undefined}
                      edits={edits}
                      onEditsChange={onEditsChange}
                      onTextBoxHistory={onTextBoxHistory}
                      canWriteTextBoxEdit={canWriteTextBoxEdit}
                      formulaDraftsByKey={formulaDraftsByKey}
                      onFormulaDraftsChange={onFormulaDraftsChange}
                      addTextMode={addTextMode}
                      addTextStyle={addTextStyle}
                      onPageTextChange={handleContinuousPageTextChange}
                      onPageTextBoxesChange={
                        handleContinuousPageTextBoxesChange
                      }
                      onSmartCropDetectorChange={
                        pageIndex === page
                          ? onSmartCropDetectorChange
                          : undefined
                      }
                      pageTextHint={
                        pageIndex === page ? pageTextHint : undefined
                      }
                      imageOverlays={imageOverlays}
                      resolveImageUrl={resolveImageUrl}
                      onImageChange={onImageChange}
                      onImageDelete={onImageDelete}
                      inkStrokes={inkStrokes}
                      inkDrawMode={inkDrawMode}
                      inkColor={inkColor}
                      inkWidth={inkWidth}
                      inkPenType={inkPenType}
                      onInkStroke={onInkStroke}
                      onInkStrokeDelete={onInkStrokeDelete}
                      inkEraseMode={inkEraseMode}
                      inkEraserKind={inkEraserKind}
                      onInkErase={onInkErase}
                      liveInkAwareness={liveInkAwareness}
                      objectInteractionDisabled={
                        objectInteractionDisabled || pageIndex !== page
                      }
                      panMode={panMode}
                      onObjectSelectionChange={
                        pageIndex === page ? onObjectSelectionChange : undefined
                      }
                      objectSelectionResetKey={objectSelectionResetKey}
                      contextCommand={contextCommand}
                    />
                  ) : (
                    <div className="pdf-text-editor__page-placeholder">
                      <span>{pageIndex + 1}</span>
                    </div>
                  )}
                  {crossPageReflowOffer &&
                  crossPageReflowOffer.pageIndex === pageIndex ? (
                    <div
                      data-testid="pdf-cross-page-reflow-prompt"
                      onPointerDown={(event) => event.stopPropagation()}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "6px 10px",
                        margin: "4px auto",
                        width: "fit-content",
                        background: "#ffffff",
                        border: "1px solid var(--console-border-flat, #99f6e4)",
                        borderRadius: 6,
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgba(15,23,42,0.14)",
                      }}
                    >
                      <span>{t("pdf.textbox.reflowCrossPagePrompt")}</span>
                      <button
                        type="button"
                        data-testid="pdf-cross-page-reflow-apply"
                        onClick={applyCrossPageReflow}
                      >
                        {t("pdf.textbox.reflowApply")}
                      </button>
                      <button
                        type="button"
                        data-testid="pdf-cross-page-reflow-dismiss"
                        onClick={() =>
                          setCrossPageReflowDismissed((current) =>
                            new Set(current).add(crossPageReflowOffer.editId),
                          )
                        }
                      >
                        {t("pdf.textbox.reflowDismiss")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {loadingUi}
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        containerElRef.current = node;
      }}
      data-testid="pdf-text-editor"
      data-view-mode="single"
      data-embedded-page={embeddedPage ? "true" : undefined}
      data-pan-mode={panMode ? "true" : undefined}
      onPointerDown={handlePanPointerDown}
      onPointerMove={handlePanPointerMove}
      onPointerUp={handlePanPointerEnd}
      onPointerCancel={handlePanPointerEnd}
      style={{
        position: "relative",
        width: "100%",
        overflow: "auto",
        padding: embeddedPage ? 0 : undefined,
        cursor: panMode ? "grab" : undefined,
        userSelect: panMode ? "none" : undefined,
      }}
    >
      {findUi}
      {passwordGate && !embeddedPage ? (
        <PdfPasswordPrompt
          incorrect={passwordGate === "incorrect"}
          busy={loading}
          onSubmit={(password) => setPasswordAttempt({ url, password })}
        />
      ) : null}
      {loadErrorUi}
      <div
        style={{
          position: "relative",
          width: currentPageSize?.width ?? "100%",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
        {currentPageSize &&
        imageOverlays &&
        resolveImageUrl &&
        onImageChange &&
        onImageDelete ? (
          <PdfImageOverlay
            overlays={imageOverlays.filter((o) => o.page === page)}
            pageWidth={currentPageSize.width}
            pageHeight={currentPageSize.height}
            resolveImageUrl={resolveImageUrl}
            onChange={onImageChange}
            onDelete={onImageDelete}
          />
        ) : null}
        {currentPageSize ? (
          <PdfTextBoxOverlay
            boxes={allBoxes}
            page={page}
            pageWidth={currentPageSize.width}
            pageHeight={currentPageSize.height}
            documentPageHeight={currentPageSize.documentHeight}
            editsById={editsById}
            onEditBox={handleEditBox}
            formulaDraftsByKey={formulaDraftsByKey}
            onFormulaDraftsChange={onFormulaDraftsChange}
            active={activeEditingPage}
            addMode={addTextMode}
            onCreateBox={handleCreateBox}
            onDeleteBox={handleDeleteBox}
            onCreatedBoxCommit={onCreatedBoxCommit}
            onTranscribeFormula={transcribeFormulaBox}
            disabled={objectEditingDisabled}
            onSelectionChange={
              onObjectSelectionChange ? handleTextSelectionChange : undefined
            }
            selectionResetKey={
              textSelectionResetKey + (objectSelectionResetKey ?? 0)
            }
            focusBoxRequest={focusTextBoxRequest}
            contextCommand={
              contextCommand?.kind === "text" ? contextCommand : null
            }
            findMatches={pageFindMatches}
          />
        ) : null}
        {currentPageSize && imageEditMode ? (
          <PdfEmbeddedImageLayer
            rotatedEditable={nativeImageTransformReady}
            page={page + 1}
            images={displayImages}
            edits={displayImageEdits}
            previewUrls={embeddedImagePreviewUrls}
            selectedOrder={selectedImageOrder}
            onSelectedOrderChange={handleSelectedImageOrderChange}
            onDelete={handleImageDelete}
            onReplace={handleImageReplace}
            onRestore={handleImageRestore}
            onMove={handleImageMove}
            dragGhostFor={imageDragGhostFor}
            heldRect={heldImageGesture}
            writePending={imageWritePending}
            previewsHidden={imageDraftsSuperseded}
            onResize={handleImageResize}
            resizeDisabled={pageRotation !== 0}
            onOpacity={handleImageOpacity}
            onCrop={handleImageCrop}
            cropDisabled={pageRotation !== 0}
            onRotate={handleImageRotate}
            rotateDisabled={pageRotation !== 0}
            onFlip={handleImageFlip}
            flipDisabled={pageRotation !== 0}
            disabled={embeddedImageBusy || objectEditingDisabled}
            showInlineToolbar={!onObjectSelectionChange}
            contextCommand={
              contextCommand?.kind === "embedded-image" ? contextCommand : null
            }
          />
        ) : null}
        {currentPageSize && inkStrokes && onInkStroke ? (
          <PdfInkOverlay
            strokes={inkStrokes.filter((s) => s.page === page)}
            page={page}
            pageWidth={currentPageSize.width}
            pageHeight={currentPageSize.height}
            drawMode={inkDrawMode}
            color={inkColor}
            width={inkWidth}
            penType={inkPenType}
            onStrokeComplete={onInkStroke}
            onDeleteStroke={onInkStrokeDelete}
            eraseMode={inkEraseMode}
            eraserKind={inkEraserKind}
            onErase={onInkErase}
            liveInkAwareness={liveInkAwareness}
          />
        ) : null}
      </div>
      {loadingUi}
    </div>
  );
}
