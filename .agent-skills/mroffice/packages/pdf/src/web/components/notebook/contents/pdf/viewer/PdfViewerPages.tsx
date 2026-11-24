"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  pdfAnnotationStackRanks,
  pdfAnnotationStackZIndex,
  type PdfAnnotsEntry,
} from "../../../../../lib/pdf/annotation-stack-order";
import { pdfFormFieldFillableAs, type PdfFormRole } from "../../../../../lib/pdf/form-roles";
import { OFFICE_WORDART_GALLERY_RECIPES } from "@mrnote/core/web/lib/office-wordart-gallery.ts";
import { pdfTextBoxTextPaint } from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import type { PdfShapeAlignCommand } from "../../../../../lib/pdf/shape-align";
import type { PdfBaseRibbonTab } from "./ribbonTabs";
import type { Awareness } from "y-protocols/awareness";
import { usePeerInkStrokes } from "@mrnote/core/web/components/notebook/InkPresenceSvgLayer.tsx";
import { pdfInkPointsFromPresence, pdfInkPresenceSurface, pdfInkWidthFromPresence } from "../../../../../lib/pdf/ink-live-presence";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { useDrawWithTouch } from "@mrnote/core/web/lib/draw-with-touch.ts";
import { useDevicePointerIsCoarse } from "@mrnote/core/web/lib/pointer-capability.ts";
import { touchTextFieldStyle, touchToggleHitStyle } from "../../../../../lib/pdf/touch-form-field";
import { useTouchMode } from "@mrnote/core/web/lib/touch-mode.ts";
import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";
import PdfAnnotationFrame from "../PdfAnnotationFrame";
import SignatureComposer from "../SignatureComposer";
import PdfTextBoxViewLayer from "../PdfTextBoxViewLayer";
import PdfSnapshotLatexPopover from "../PdfSnapshotLatexPopover";
import PdfSnapshotTextPopover from "../PdfSnapshotTextPopover";
import PdfNoteMarker from "../PdfNoteMarker";
import { PdfNoteGlyph } from "../PdfNoteMarker";
import NoteEditPopover from "../NoteEditPopover";
import type { RefObject, Dispatch, SetStateAction } from "react";
import { isPanIgnoredTarget } from "../../../../../lib/pdf/hand-tool";
import { sampleTextBoxBackgroundColor } from "../../../../../lib/pdf/text-box-background";
import PdfTextBoxOverlay, {
  type PdfTextBoxEdit,
  type PdfTextBoxEditEmitOptions,
  type PdfTextBoxSelection,
} from "../PdfTextBoxOverlay";
import type { TextBox } from "../../../../../lib/pdf/text-boxes";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { useOfficeSmartArtPlaceholders } from "@mrnote/core/web/components/office-ribbon/officeSmartArtPlaceholders.ts";
import { pdfSmartArtInsertRecord } from "../../../../../lib/pdf/smartart-insert";
import { DOCUMENT_SHAPE_MAX_GROUP_MEMBERS } from "@mrnote/core/web/lib/document-shapes.ts";
import { createTextBox, pdfArmedChartLeaf, pdfArmedSmartArtLayout, pdfArmedTableSize, PDF_WORDART_FONT_SIZE_PT, type PdfArmedTextKind } from "@mrnote/core/web/lib/pdf/text-box-create.ts";
import { createPresentationChartV2Leaf } from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import type { ChartFamily, ChartSubtype } from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { PdfChartLayer } from "../PdfChartLayer";
import { createPdfTable } from "../../../../../lib/pdf/managed-table";
import { PdfTableLayer, type PdfTableCellAddress } from "../PdfTableLayer";
import type { PdfViewerChartAuthoring, PdfViewerTableAuthoring, PdfViewerTextBoxAuthoring } from "./PDFViewerProps";
import { isSpreadRowStart } from "../../../../../lib/pdf/view-modes";
import {
  EMPTY_HIGHLIGHTS,
  EMPTY_RENDERED_NATIVE_TEXT_MARKUPS,
  EMPTY_RENDERED_NATIVE_TEXT_NOTES,
  EMPTY_NOTES,
  EMPTY_INKS,
  EMPTY_NATIVE_INK_STROKES,
  EMPTY_NATIVE_SOURCE_INK_STROKES,
  EMPTY_NATIVE_IMAGE_OVERLAYS,
  EMPTY_LINKS,
  EMPTY_FORM_FIELDS,
  EMPTY_NATIVE_VECTOR_SELECTION_ROUTES,
  EMPTY_SIGNATURES,
  EMPTY_STAMPS,
  EMPTY_NATIVE_SOURCE_STAMPS,
  EMPTY_NATIVE_SOURCE_FREE_TEXTS,
  EMPTY_REDACTIONS,
  EMPTY_SHAPES,
  EMPTY_NATIVE_SOURCE_SHAPES,
  EMPTY_LINK_OVERLAYS,
  EMPTY_NATIVE_SOURCE_LINKS,
  EMPTY_TEXT_BOX_VIEW_OVERLAYS,
} from "./emptyCollections";
import {
  EMPTY_NATIVE_IMAGE_TARGETS,
  nativeVectorSelectionKey,
  PdfNativeVectorTargetLayer,
  PdfNativeImageTargetLayer,
  type PdfNativeVectorTargetHandler,
  type PdfNativeImageTargetHandler,
} from "./nativeTargetLayers";
import {
  normalizeRedactionDrag,
  type RedactionAnnotation,
} from "@mrnote/core/web/lib/pdf/redaction.ts";
import {
  normalizeShapeDrag,
  shapeBox,
  shapeLineDashPattern,
  type ShapeKind,
  type ShapeAnnotation,
  type ShapeGeometryTransform,
} from "@mrnote/core/web/lib/pdf/shapes.ts";
import {
  measurePoints,
  rotateMeasurePoints,
  type MeasureMode,
  type MeasurePoint,
  type MeasureScale,
} from "../../../../../lib/pdf/measure";
import { rotateFractionPoint } from "../../../../../lib/pdf/fraction-rotation";
import type {
  PercentBox,
  MirrorablePercentBox,
} from "../../../../../lib/pdf/annotation-transform";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  isValidElement,
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  Fragment,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PdfAnnotationFrameProps } from "../PdfAnnotationFrame";
import type { PdfPageTextEditPoint } from "./nativeTextDom";
import { normalizeRotationDegrees } from "@mrnote/core/web/lib/presentation-drag.ts";
import {
  normalizeSignatureObjectRotation,
  resolveSignatureFont,
  type SignatureKind,
  type SignatureAnnotation,
} from "@mrnote/core/web/lib/pdf/signatures.ts";
import {
  measurementPointBox,
  type RenderedNativeTextMarkup,
  type RenderedNativeTextNote,
  type HighlightAnnotation,
  type PdfPlacedAnnotationSelection,
  type PdfPlacedDeleteHold,
  type SelectedPdfLinkContext,
  type RenderedLinkAnnotation,
} from "./annotationModels";
import {
  sameNativeVectorSelectionRoute,
  nativeVectorDisplayAnchors,
  rotatedNativeVectorBounds,
  nativeVectorPointBounds,
  nativeVectorFrameBounds,
  nativeVectorPageKeep,
  nativeVectorPagePoints,
  nativeVectorResizeTransform,
  nativeVectorStraightLineAxis,
  transformTurnedVectorFrame,
} from "./nativeVectorGeometry";
import type {
  PdfNativeVectorStyleCommitRequest,
} from "../../../../../lib/pdf/native-vector-style-selection-edit";
import {
  cancelTrackedPdfTask,
  releasePdfCanvasBackingStore,
  cleanupPdfPageAfter,
} from "../../../../../lib/pdf/render-lifecycle";
import { PdfDecorationOverlay } from "../PdfDecorationDialog";
import {
  highlightQuadLayout,
  highlightMarkupRectStyle,
} from "@mrnote/core/web/lib/pdf/highlight-markup.ts";
import { pdfHighlightWashAttributes } from "../../../../../lib/pdf/draft-highlight-tint";
import {
  nativeInkPathD,
  nativeInkWidthToPercent,
  nativeInkStrokeOpacity,
  type NativePdfInkStrokeLike,
  type NativePdfImageOverlayLike,
} from "./nativeOverlays";
import {
  isInkColor,
  DEFAULT_INK_COLOR,
  inkCurvePathD,
  inkStrokeHasPressure,
  inkWidthPagePercent,
  type InkPoint,
  type InkAnnotation,
} from "@mrnote/core/web/lib/pdf/ink.ts";
import {
  inkSteadyPressureWidthFactor,
  inkVariableWidthOutlinePathData,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";

/**
 * How a reader ink stroke is painted in the page's 0..100 ink layer, as the
 * Docs ink surface paints one (DocumentInkSurface paintWet): a stroke whose
 * pen pressure varies is a FILLED outline whose width follows each sample's
 * pressure (lib/office-ink-smooth); any other is one curve at the pen's
 * width (a steady pressure drawn at its mean, as the running stroke drew it).
 * `width` is the reader's page-percent width; the outline is measured in the
 * page's own units so its width is the stroke's on the page.
 */
/**
 * The others' strokes on this page as they draw them, and each one they
 * lifted until this page has it (`settledKey`), painted as the page paints
 * its own reader ink (the Draw tab's live presence, lib/pdf/ink-live-presence).
 */
function PdfPeerReaderInk({
  awareness,
  pageNumber,
  page,
  settledKey,
}: {
  awareness: Awareness;
  pageNumber: number;
  page: { width: number; height: number };
  settledKey: string;
}) {
  const strokes = usePeerInkStrokes(awareness, pdfInkPresenceSurface("reader", pageNumber), settledKey);
  if (strokes.length === 0) return null;
  return (
    <g data-testid="pdf-peer-ink" aria-hidden style={{ pointerEvents: "none" }}>
      {strokes.map((stroke, index) => {
        const paint = readerInkPaint(pdfInkPointsFromPresence(stroke), pdfInkWidthFromPresence(stroke), stroke.color, page);
        return (
          <path
            key={index}
            d={paint.d}
            fill={paint.fill}
            stroke={paint.stroke}
            strokeWidth={paint.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

/** The view layer's overlays less the boxes the authoring layer draws: made
 * on this page and kept (created, not deleted). */
function filterAuthoredTextBoxViewOverlays<T extends { readonly id: string }>(
  overlays: readonly T[],
  authored: readonly PdfTextBoxEdit[] | undefined,
  pageIndex: number,
): readonly T[] {
  if (!authored?.length || !overlays.length) return overlays;
  const drawn = new Set(authored.filter((edit) => edit.page === pageIndex && edit.created && !edit.deleted)
    .map((edit) => edit.id));
  if (!drawn.size) return overlays;
  const kept = overlays.filter((overlay) => !drawn.has(overlay.id));
  return kept.length === overlays.length ? overlays : kept;
}

/** How a reader stroke is painted on its page (the wet layer paints it the same, lib/office-wet-ink-layer). */
/**
 * A stamp's face: its picture, or its preset label in a coloured frame (a
 * plain text node, never innerHTML; the colour from the static palette).
 * Drawn twice: on the stamp layer as its paint, and in the click target in
 * the page's annotation stack (`hitCopy`), where it is laid out but not
 * shown -- the target is as big as the stamp and holds its delete button.
 */
function pdfStampContent(
  stamp: StampAnnotation,
  text: string,
  color: string,
  alt: string,
  hitCopy: boolean,
): ReactNode {
  const hidden: CSSProperties | undefined = hitCopy ? { visibility: "hidden" } : undefined;
  return stamp.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="pdf-viewer__signature-image"
      src={stamp.image}
      alt={hitCopy ? alt : ""}
      data-testid={hitCopy ? "pdf-stamp-image" : undefined}
      draggable={false}
      style={hidden}
    />
  ) : (
    <span
      data-testid={hitCopy ? "pdf-stamp-text" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontWeight: 700,
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontSize: "clamp(9px, 3vh, 32px)",
        color,
        border: `2px solid ${color}`,
        borderRadius: 6,
        ...hidden,
      }}
    >
      {text}
    </span>
  );
}

export function readerInkPaint(
  points: readonly InkPoint[],
  width: number,
  color: string,
  page: { width: number; height: number },
): {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  pressure: boolean;
} {
  const percent = inkWidthPagePercent(width, page);
  if (inkStrokeHasPressure(points) && page.width > 0 && page.height > 0) {
    const shorter = Math.min(page.width, page.height);
    return {
      d: inkVariableWidthOutlinePathData(
        points.map((point) => ({
          x: Math.min(100, Math.max(0, point.x)),
          y: Math.min(100, Math.max(0, point.y)),
          ...(point.p !== undefined ? { p: point.p } : {}),
        })),
        (percent / 100) * shorter,
        { unit: { x: page.width / 100, y: page.height / 100 }, precision: 3 },
      ),
      fill: color,
      stroke: "none",
      pressure: true,
    };
  }
  return {
    d: inkCurvePathD(points, page),
    fill: "none",
    stroke: color,
    strokeWidth: percent * inkSteadyPressureWidthFactor(points.map((point) => point.p)),
    pressure: false,
  };
}
import {
  nativeShapeDisplayGeometry,
  type NativePdfShapeAnnotation,
} from "../../../../../lib/pdf/native-shape-annotations";
import { renderShapeSvg } from "./shapeSvg";
import {
  EMPTY_FIND_HIGHLIGHTS,
  EMPTY_REFERENCE_OVERLAYS,
  type PdfFindHighlightRect,
  type PdfReferenceOverlayRect,
} from "./findOverlays";
import { semanticAppearanceKindForFormField } from "./semanticAppearance";
import {
  Trash2,
  Printer,
  Save,
  Hash,
  ExternalLink,
  Search,
  Presentation,
  ZoomIn,
  ZoomOut,
  Scaling,
  Maximize2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  Signature,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  nativePdfFormWidgetExpectedIdentity,
  type NativePdfFormFieldGroupExpectedIdentity,
} from "../../../../../lib/pdf/form-field-authoring";
import {
  findAcroFieldOption,
  ACROFORM_MAX_TEXT,
  type AcroFieldOption,
  acroFormTextInputMaxLength,
  type AcroFormValue,
  type PdfFieldRangeValidation,
  type PdfResetFormScope,
} from "@mrnote/core/web/lib/pdf/acroform.ts";
import { sanitizeLinkUrl } from "@mrnote/core/web/lib/pdf/doc-search.ts";
import { MAX_SCALE, MIN_SCALE } from "./zoomScale";
import {
  PDF_READER_PRINT_COMMAND,
  PDF_READER_DOWNLOAD_CURRENT_COMMAND,
} from "./readerCommands";
import {
  parseFormatScript,
  formatWithSpec,
  keystrokePartialOk,
  type PdfKeystrokeRule,
} from "@mrnote/core/web/lib/pdf/acroform-scripts.ts";
import {
  pdfTextFieldTakesEdit,
  type RenderedFormField,
  type SelectedFormFieldContext,
} from "./formFieldSessions";
import {
  resolveStampPreset,
  stampAnnotationColor,
  type StampAnnotation,
} from "../../../../../lib/pdf/stamps-annotation";
import {
  visualMaskOutputAuthorityMatches,
  type VisualMaskOutputAuthoritySnapshot,
  type PdfSemanticAppearanceInspectionBinding,
} from "./outputAuthority";
import { pdfFileAttachmentIcon } from "./attachmentIcon";
import { notePreview, type StickyNoteAnnotation } from "@mrnote/core/web/lib/pdf/sticky-notes.ts";
import type {
  PdfNativeVectorAcceptedTarget,
  PdfNativeVectorCommitOutcome,
  PdfNativeVectorLayerMove,
  PdfNativeVectorGroupTransform,
  PdfNativeVectorGeometryCommitRequest,
  PdfNativeVectorDeleteCommitRequest,
  PdfNativeVectorGroupGeometryCommitRequest,
  PdfNativeVectorNormalizedBounds,
} from "../../../../../lib/pdf/native-vector-selection-edit";
import type { PdfNativeImageTarget } from "./nativeImageTarget";
import type { CanvasObjectGhostState } from "./canvasObjectGhost";
import { liftFrame, sameLiftBox } from "./objectLift";
import type { PdfSourceRiskSnapshot } from "../../../../../lib/pdf/save-policy";
import type { PageRecord } from "./pageRecord";
import type { SignatureComposerMode } from "../SignatureComposer";
import type {
  PdfManagedStampCommandOrigin,
  ReaderStampAnnotation,
} from "./readerStamp";
import type { PdfLinkOverlay } from "@mrnote/core/web/lib/pdf/links.ts";
import type { PdfDocumentDecorations } from "../../../../../lib/pdf/document-decorations";
import type { PdfVisibleLineNumber } from "./visibleLineNumbers";
import type {
  PdfNativeTextSourceHandoff,
} from "../../../../../lib/pdf/native-text-source-handoff";
import type {
  PdfNativeVectorSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import type { PdfVectorContentItem } from "../../../../../lib/pdf/vector-content-inventory";
import type { PdfVectorDragModel } from "../../../../../lib/pdf/native-vector-drag-backdrop";
import type { PdfVectorDragLayers } from "../../../../../lib/pdf/native-vector-drag-layers";
import type {
  PdfVectorPageGeometry,
} from "../../../../../lib/pdf/vector-capability-reconciliation";
import type { PdfOcrRun } from "../../../../../lib/pdf/ocr-text-layer";
import type { PdfOcrReviewAnnotation } from "../../../../../lib/pdf/ocr-acceptance";
import type { PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";
import type {
  PdfSemanticAppearanceSelectionRoute,
  PdfSemanticAppearanceCommandKind,
  PdfSemanticAppearanceCommandSurface,
} from "../../../../../lib/pdf/semantic-appearance-command-routing";
import type { MeasurementRecord } from "../../../../../lib/pdf/measure-annotations";
import type { TextBoxViewOverlay } from "../../../../../lib/pdf/text-box-view-overlay";
import { pdfLineNumberFontSize, pdfLineNumberLabels } from "../../../../../lib/pdf/line-number-labels";
import type { CreateFormFieldCandidate } from "@/lib/pdf/form-field-create";
import type {
  PdfCommandInvocation,
  ResolvedPdfFeatureCommand,
} from "../commandRegistry";
import type { PdfRuntimeFeatureDecision } from "../capabilityAdapter";
import type { PdfReferenceIndex } from "../../../../../lib/pdf/reference-index";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type {
  CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import type {
  NativePdfStampAnnotation,
} from "../../../../../lib/pdf/native-stamp-annotations";
import type { NativePdfFreeTextAnnotation } from "../../../../../lib/pdf/native-free-text-annotations";
import type {
  NativePdfLinkAnnotation,
} from "../../../../../lib/pdf/native-link-annotations";
import type { NativePdfInkStroke } from "../../../../../lib/pdf/native-ink-annotations";
import type {
  FeatureCommandResult,
} from "@mrnote/core/web/components/office-ribbon/featureCommandRegistry.ts";
import type {
  PdfShapeLineCap,
  PdfShapeLineJoin,
} from "../PdfAnnotationFormatContextRibbon";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfEraseOverlay } from "./PdfEraseOverlay";
import { PdfSplitPageOverlay } from "./PdfSplitPageOverlay";
import { HeldPageFrameBackdrop } from "./HeldPageFrameBackdrop";
import { heldPageFrameLayout, type PdfHeldPageFrame } from "../../../../../lib/pdf/held-page-frame";
import type { PdfSplitPageModeView } from "./hooks/usePdfSplitPageMode";
import type { PdfEraseToolView } from "./hooks/usePdfEraseTool";
import { usePdfLiveTransforms, type PdfLiveTransformRoom } from "../pdfLiveTransform";
import { PdfPeerSelections, usePdfSelectionPresence } from "../pdfPeerSelections";
import { pdfTextBoxListWithBox } from "../window/textBoxChangeQueue";
import {
  SNAPSHOT_ROUNDED_RADIUS_CSS,
  type SnapshotShape,
} from "../../../../../lib/pdf/snapshot-region";

export interface PdfViewerPagesModel {
  /** The page room another member's object gestures arrive on, and this
   * member's go out on (pdfLiveTransform); none outside a shared page. */
  liveTransformRoom?: PdfLiveTransformRoom | null;
  /** The shown file's page number of an upload page (the same number unless
   * the file holds pages deleted, moved or added: lib/pdf/structured-document;
   * none for a page deleted from it). */
  filePageNumberFor: (pageNumber: number) => number | undefined;
  annotationContextWritable: boolean;
  onNativeSourceInkDelete: ((annotationId: string) => void | Promise<void>) | undefined;
  onNativeSourceInkTransform: ((annotationId: string, box: { x: number; y: number; width: number; height: number; }) => void | Promise<void>) | undefined;
  managedSignatureAppearanceReady: boolean;
  managedStampAppearanceReady: boolean;
  managedShapeAppearanceReady: boolean;
  onNativeSourceTextMarkupSelect: ((annotationId: string) => void) | undefined;
  onNativeSourceTextNoteSelect: ((annotationId: string) => void) | undefined;
  managedTextMarkupAppearanceReady: boolean;
  dataItemId: string | undefined;
  documentDecorationsNativeAppearanceReady: boolean;
  onNativeFileAttachmentMove: ((id: string, point: { x: number; y: number; }) => Promise<void>) | undefined;
  onNativeFileAttachmentDelete: ((id: string) => Promise<void>) | undefined;
  nativeFileAttachmentBusy: boolean;
  nativeFileAttachmentDisabledReason: string | undefined;
  resolveNativeImageOverlayUrl: ((dataItemId: string) => string) | undefined;
  onNativeVectorGeometryCommit: ((request: PdfNativeVectorGeometryCommitRequest) => PdfNativeVectorCommitOutcome | Promise<PdfNativeVectorCommitOutcome>) | undefined;
  onNativeImageActivate: ((target: PdfNativeImageTarget) => void) | undefined;
  /** Pictures are selected in place (WPS 图片编辑): they are targets, the
   * selected one wears its frame and tools, and a right-click opens its
   * menu. */
  nativePictureSelectable?: boolean;
  renderNativePictureLayer?: (
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
  ) => ReactNode;
  openNativeImageTargetMenu?: PdfNativeImageTargetHandler;
  nativePictureSelected?: boolean;
  clearNativePictureSelection?: () => void;
  onNativeVectorDeleteCommit: ((request: PdfNativeVectorDeleteCommitRequest) => boolean | void | Promise<boolean | void>) | undefined;
  onNativeVectorGeometryCommitAll: ((request: PdfNativeVectorGroupGeometryCommitRequest) => PdfNativeVectorCommitOutcome | Promise<PdfNativeVectorCommitOutcome>) | undefined;
  nativeVectorGeometryBusy: boolean;
  nativeVectorWriteSettling: boolean;
  nativeVectorGeometryDisabledReason: string | undefined;
  onNativeVectorStyleCommit: ((request: PdfNativeVectorStyleCommitRequest) => PdfNativeVectorCommitOutcome | Promise<PdfNativeVectorCommitOutcome>) | undefined;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  locale: string;
  renderLifecycleV2: boolean;
  matchedSourceRiskSnapshot: PdfSourceRiskSnapshot | null;
  pdfDoc: PDFDocumentProxy | null;
  /** Pages whose crop or size the window holds for Save, shown before the
   * saved file carries them (lib/pdf/held-page-frame). */
  heldPageFrames?: ReadonlyMap<number, PdfHeldPageFrame & { drawBeyond: boolean }>;
  /** Pages set in place of pages and held for Save: the new page shown over
   * the one it replaces, fitted and centred as the writer sets it. */
  heldReplacedPages?: ReadonlyMap<number, Readonly<{ width: number; height: number; image: string }>>;
  pages: PageRecord[];
  loading: boolean;
  scale: number;
  formFieldContextBaseTabRef: RefObject<PdfBaseRibbonTab>;
  currentPage: number;
  currentVisibleOrdinal: number;
  /** The visible ordinals drawn in full (the pages about the view); the
   * others are drawn as their paper only. Null: every page in full. */
  fullPageBand: Readonly<{ first: number; last: number }> | null;
  setReaderContextMenu: Dispatch<SetStateAction<{ x: number; y: number; textAt?: PdfPageTextEditPoint | null; } | null>>;
  /** The page's own text under a point, where the reader may edit it (null:
   * no text there, or a file, page or tool that does not edit text). */
  pageTextEditTargetAt: (target: EventTarget | null, clientX: number, clientY: number) => PdfPageTextEditPoint | null;
  /** A double click on the pages: on page text with the Select tool in hand
   * it opens that line for editing. */
  onPageTextDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  findActiveIndex: number;
  findHighlightsByPage: ReadonlyMap<number, PdfFindHighlightRect[]>;
  renderedNativeSourceTextMarkups: Map<number, RenderedNativeTextMarkup[]>;
  renderedNativeSourceTextNotes: Map<number, RenderedNativeTextNote[]>;
  setEditingHighlight: Dispatch<SetStateAction<HighlightAnnotation | null>>;
  commentMentions: CommentMentionsController | null;
  noteMode: boolean;
  /** 插入 › 文字 armed: the next click on a page places a text box. */
  addTextMode: boolean;
  addTextKind: PdfArmedTextKind;
   
  textBoxAuthoring: PdfViewerTextBoxAuthoring | undefined;
  tableAuthoring?: PdfViewerTableAuthoring;
  chartAuthoring?: PdfViewerChartAuthoring;
  /** Each page's /Annots in the array's order: each annotation's pdf.js
   * reference and /NM. The text boxes, tables and charts the reader draws
   * itself, and the click targets of shapes, ink and stamps, are stacked in
   * it (lib/pdf/annotation-stack-order.ts). */
  annotationStackOrderByPage?: ReadonlyMap<number, readonly PdfAnnotsEntry[]>;
  chartSelectedId?: string | null;
  onChartSelectionChange?: (id: string | null) => void;
  chartPreview?: { readonly id: string; readonly attrs: unknown } | null;
  tableSelection?: PdfTableCellAddress | { readonly tableId: string } | null;
  onTableSelectionChange?: (selection: PdfTableCellAddress | { readonly tableId: string } | null) => void;
  /** A box was placed: the tool disarms (one placement per arming). */
  onAddTextPlaced: () => void;
  attachMode: boolean;
  placedAttachments: { id: string; page: number; x: number; y: number; name: string; mimeType: string; size: number; sha256: string; attachmentDataItemId: string; icon: "Paperclip" | "PushPin" | "Graph" | "Tag"; }[];
  activeNoteId: string | null;
  pendingNote: { page: number; x: number; y: number; color: string; } | null;
  noteSaving: boolean;
  drawMode: boolean;
  inkColor: string;
  inkWidth: number;
  drawingStroke: { page: number; points: InkPoint[]; } | null;
  /** Finished strokes not saved yet (saved once the writing pauses), each with its pen. */
  inkWet?: readonly { key: number; page: number; points: InkPoint[]; color: string; width: number }[];
  /** The page's wet-ink element: the pen's finished, unsaved strokes are drawn into it outside React. */
  wetInkHost?: (pageNumber: number) => (element: Element | null) => void;
  /** What the Draw tab shows over a page's ink (Lasso Select's frame). */
  inkPageOverlay?: (pageNumber: number) => import("react").ReactNode;
  /** The page room's presence: the others' Draw tab ink, drawn as they write. */
  liveInkAwareness?: Awareness | null;
  signMode: boolean;
  setSignMode: Dispatch<SetStateAction<boolean>>;
  signSaving: boolean;
  signatureReturnFocusRef: RefObject<HTMLButtonElement | null>;
  setSignatureComposerMode: Dispatch<SetStateAction<SignatureComposerMode>>;
  signatureComposerMode: SignatureComposerMode;
  pendingSignature: { page: number; x: number; y: number; width?: number | undefined; height?: number | undefined; } | null;
  setPendingSignature: Dispatch<SetStateAction<{ page: number; x: number; y: number; width?: number | undefined; height?: number | undefined; } | null>>;
  signDraft: { kind: SignatureKind; text: string; font: string; image: string | null; };
  setSignDraft: Dispatch<SetStateAction<{ kind: SignatureKind; text: string; font: string; image: string | null; }>>;
  resetSignDraft: (mode?: SignatureComposerMode) => void;
  armedStamp: { kind: "preset"; preset: string; origin: PdfManagedStampCommandOrigin; } | { kind: "image"; image: string; aspectRatio: number; origin: PdfManagedStampCommandOrigin; } | null;
  stampSaving: boolean;
  nativeSourceStampSaving: boolean;
  nativeSourceFreeTextSaving: boolean;
  redactMode: boolean;
  redactSaving: boolean;
  redactionDrafts: readonly { id: string; page: number; box: { x: number; y: number; width: number; height: number; }; status: "saving" | "failed"; reason?: string | undefined; }[];
  drawingRedaction: { page: number; start: { x: number; y: number; }; current: { x: number; y: number; }; } | null;
  shapeMode: boolean;
  shapeKind: ShapeKind;
  polygonDraft: { page: number; points: { x: number; y: number; }[]; } | null;
  shapeColor: string;
  shapeWidth: number;
  shapeLineStyle: "solid" | "dashed" | "dotted";
  shapeLineStart: "none" | "openArrow" | "closedArrow" | "circle" | "square";
  shapeLineEnd: "none" | "openArrow" | "closedArrow" | "circle" | "square";
  shapeFillColor: string | null;
  shapeFillOpacity: number;
  renderedVisualMaskOutputAuthority: VisualMaskOutputAuthoritySnapshot;
  shapeSaving: boolean;
  nativeSourceShapeSaving: boolean;
  drawingShape: { page: number; kind: ShapeKind; start: { x: number; y: number; }; current: { x: number; y: number; }; } | null;
  selectedPlaced: PdfPlacedAnnotationSelection | null;
  nativeSourceInkSaving: boolean;
  linkMode: boolean;
  linkSaving: boolean;
  managedLinkUpsertRef: RefObject<((link: PdfLinkOverlay, authorityGeneration: string) => void | Promise<void>) | undefined>;
  nativeSourceLinkTransformRef: RefObject<((annotationId: string, box: { x: number; y: number; width: number; height: number; }, authorityGeneration: string) => void | Promise<void>) | undefined>;
  drawingLink: { page: number; start: { x: number; y: number; }; current: { x: number; y: number; }; } | null;
  selectedLinkContext: SelectedPdfLinkContext | null;
  snapshotMode: boolean;
  drawingSnapshot: { page: number; start: { x: number; y: number; }; current: { x: number; y: number; }; shape?: SnapshotShape; outline?: readonly { x: number; y: number }[] } | null;
  snapshotLatex: { page: number; start: { x: number; y: number; }; current: { x: number; y: number; }; mode: "text" | "offer" | "latex"; translate?: boolean; imageB64: string | null; outputAuthority: VisualMaskOutputAuthoritySnapshot; textAuthority?: Readonly<{ dataItemId: string; sourceSha256: string; pageId?: string | null; pageIndex: number; region: readonly [number, number, number, number]; authorityIsCurrent: () => boolean; }> | undefined; } | null;
  measureMode: boolean;
  measureKind: MeasureMode;
  measurePts: { page: number; points: MeasurePoint[]; } | null;
  setMeasurePts: Dispatch<SetStateAction<{ page: number; points: MeasurePoint[]; } | null>>;
  measurementSaving: boolean;
  printPreflightTriggerRef: RefObject<HTMLButtonElement | null>;
  effectiveDocumentDecorations: PdfDocumentDecorations;
  linkAnnotations: Map<number, RenderedLinkAnnotation[]>;
  setFocusedFormField: Dispatch<SetStateAction<string | null>>;
  focusedFormField: string | null;
  formValues: Record<string, AcroFormValue>;
  formMode: boolean;
  flattening: boolean;
  rasterOutputAuthorityBlocked: boolean;
  viewMode: "continuous" | "single" | "spread";
  lineNumbersVisible: boolean;
  lineNumbersByPage: ReadonlyMap<number, readonly PdfVisibleLineNumber[]>;
  canvasReadFilter: string;
  navCanBack: boolean;
  navCanForward: boolean;
  sameDocumentReloading: boolean;
  panMode: boolean;
  spacePanHeld: boolean;
  panning: boolean;
  presentationActive: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  viewerRootRef: RefObject<HTMLDivElement | null>;
  panSuppressClickRef: RefObject<boolean>;
  pageRefs: RefObject<Map<number, HTMLDivElement>>;
  visibleItemRefs: RefObject<Map<number, HTMLDivElement>>;
  findInputRef: RefObject<HTMLInputElement | null>;
  renderTasksRef: RefObject<Map<number, { cancel: () => void; }>>;
  textLayerTasksRef: RefObject<Map<number, { cancel: () => void; }>>;
  renderPipelinesRef: RefObject<Map<number, Promise<void>>>;
  pageProxiesRef: RefObject<Map<number, PDFPageProxy>>;
  pageRenderEpochsRef: RefObject<Map<number, number>>;
  renderedPagesRef: RefObject<Set<number>>;
  activeTextSourceHandoff: PdfNativeTextSourceHandoff | null;
  semanticAppearanceInspectionBindingRef: RefObject<PdfSemanticAppearanceInspectionBinding | null>;
  nativeVectorSelectionRoutesByPage: ReadonlyMap<number, readonly PdfNativeVectorSelectionRoute[]>;
  selectedNativeVectorSelection: PdfNativeVectorSelectionRoute | null;
  setSelectedNativeVectorSelection: Dispatch<SetStateAction<PdfNativeVectorSelectionRoute | null>>;
  nativeVectorVertexEditing: boolean;
  nativeVectorVertexDrag: { anchorIndex: number; x: number; y: number; } | null;
  setNativeVectorVertexDrag: Dispatch<SetStateAction<{ anchorIndex: number; x: number; y: number; } | null>>;
  nativeVectorVertexDragRef: RefObject<{ anchorIndex: number; layerRect: DOMRect; moved: boolean; x: number; y: number; } | null>;
  nativeImageTargetsByPage: ReadonlyMap<number, readonly PdfNativeImageTarget[]>;
  nativeVectorUserSelectionEpochRef: RefObject<number>;
  visibleVectorsByPageRef: RefObject<Map<number, readonly PdfVectorContentItem[]>>;
  nativeVectorDragGhost: CanvasObjectGhostState | null;
  setNativeVectorDragGhost: Dispatch<SetStateAction<CanvasObjectGhostState | null>>;
  nativeVectorDragGhostRef: RefObject<CanvasObjectGhostState | null>;
  placedTurnFromRef: RefObject<Map<string, string>>;
  previewNativeVectorGesture: (pageNumber: number, route: PdfNativeVectorSelectionRoute, preview: PercentBox | null, start: PercentBox, pageGeometry: PdfVectorPageGeometry | null, base?: number) => void;
  previewNativeVectorRotation: (pageNumber: number, route: PdfNativeVectorSelectionRoute, rotation: number | null, start: PercentBox, pageGeometry: PdfVectorPageGeometry | null, base?: number) => void;
  /** The turned frame a selected source vector stands in, or null when its
   * frame is the box around it. */
  nativeVectorTurnedFrameFor: (route: PdfNativeVectorSelectionRoute) => { rect: PercentBox; rotation: number; line: boolean } | null;
  previewPlacedObjectGesture: (pageNumber: number, key: string, preview: PercentBox | null, start: PercentBox) => void;
  previewPlacedObjectRotation: (pageNumber: number, key: string, rotation: number | null, start: PercentBox) => void;
  previewNativeVectorGroupGesture: (pageNumber: number, routes: readonly PdfNativeVectorSelectionRoute[], preview: PercentBox | null, start: PercentBox, pageGeometry: PdfVectorPageGeometry | null) => void;
  previewNativeVectorGroupRotation: (pageNumber: number, routes: readonly PdfNativeVectorSelectionRoute[], rotation: number | null, start: PercentBox, pageGeometry: PdfVectorPageGeometry | null) => void;
  settleCanvasObjectGesture: (
    pageNumber: number,
    change:
      | { readonly kind: "fit"; readonly from: PercentBox; readonly to: MirrorablePercentBox }
      | { readonly kind: "turn"; readonly from: PercentBox; readonly degrees: number },
    options: {
      readonly base?: number;
      readonly kind: "vector" | "picture" | "placed";
      readonly epoch: number;
      readonly target?: PdfNativeVectorAcceptedTarget | null;
      readonly write: boolean;
      readonly key?: string;
      readonly family?: "vector" | "placed";
    },
  ) => void;
  releaseCanvasObjectGesture: (key: string) => void;
  previewLiftedGesture: (pageNumber: number, preview: PercentBox | null, start: PercentBox) => void;
  previewLiftedRotation: (pageNumber: number, rotation: number | null, start: PercentBox) => void;
  /** Flip the selected source vector as its frame's mirrored resize does:
   * its pixels mirrored at once, the lift's writer writing it. Set while an
   * upright frame is shown for `key`; false when it cannot. */
  nativeVectorFrameFlipRef: RefObject<{ key: string; flip: (axis: "horizontal" | "vertical") => boolean } | null>;
  parkedCanvasObjectLifts: readonly CanvasObjectGhostState[];
  placedLiftWritingRef: RefObject<(liftId: number) => boolean>;
  placedObjectSavingRef: RefObject<boolean>;
  /** The viewer's waiting Delete, and the note that a frame holds one. */
  placedDeleteHoldRef: RefObject<PdfPlacedDeleteHold>;
  staleNativeVectorRoutesByPage: ReadonlyMap<number, readonly PdfNativeVectorSelectionRoute[]>;
  setExtraNativeVectorSelections: Dispatch<SetStateAction<readonly PdfNativeVectorSelectionRoute[]>>;
  extraNativeVectorSelections: readonly PdfNativeVectorSelectionRoute[];
  selectedNativeVectorKeys: Set<string>;
  openNativeVectorTargetMenu: PdfNativeVectorTargetHandler;
  activateNativeVectorTarget: PdfNativeVectorTargetHandler;
  activateNativeImageTarget: PdfNativeImageTargetHandler;
  provisionalNativeVectorRouteRef: RefObject<{ dataItemId: string | null; route: PdfNativeVectorSelectionRoute; } | null>;
  semanticAppearanceBindingIsCurrent: (binding: PdfSemanticAppearanceInspectionBinding) => boolean;
  ocrRunsByPage: ReadonlyMap<number, PdfOcrRun[]>;
  ocrReviewByPage: ReadonlyMap<number, PdfOcrReviewAnnotation>;
  ocrAnnotationHydrationReady: boolean;
  ocrCandidatePages: ReadonlySet<number>;
  ocrPendingPages: ReadonlySet<number>;
  ocrFailedPages: ReadonlySet<number>;
  ocrPreflightLoadingPage: number | null;
  ocrPreflightTriggerRef: RefObject<HTMLElement | null>;
  pendingOcrReview: Readonly<{ authority: Readonly<{ document: PDFDocumentProxy; dataItemId: string; url: string; byteGenerationKey: string; documentRevision: string | number; sourceSha256: string; pageNumber: number; pageCount: number; }>; annotation: PdfOcrReviewAnnotation; }> | null;
  ocrReviewBusy: boolean;
  pdfOcrServerSourceAuthority: Readonly<{ document: PDFDocumentProxy; dataItemId: string; url: string; byteGenerationKey: string; documentRevision: string | number; sourceSha256: string; derived?: true | undefined; }> | null;
  resolvedPageRotation: (pageNumber: number) => PdfRotation;
  prewarmNativeVectorTarget: (route: PdfNativeVectorSelectionRoute) => void;
  prewarmPlacedObjectLayers: (pageNumber: number, key: string, rect: PercentBox) => void;
  visiblePages: PageRecord[];
  visiblePageItems: ({ kind: "original"; page: PageRecord; } | { kind: "inserted"; page: { id: string; afterPage: number; width: number; height: number; copyOfPage?: number | undefined; image?: string; }; })[];
  visiblePageCount: number;
  visibleOrdinalForOriginal: (pageNumber: number) => number;
  previousVisibleOrdinal: number | null;
  nextVisibleOrdinal: number | null;
  goToPage: (pageNumber: number, options?: { offset?: number | undefined; offsetX?: number | undefined; scrollTop?: number | undefined; recordHistory?: boolean | undefined; restoringView?: boolean | undefined; locate?: boolean | undefined; } | undefined) => void;
  goToVisibleOrdinal: (ordinal: number, options?: { scrollTop?: number | undefined; recordHistory?: boolean | undefined; restoringView?: boolean | undefined; } | undefined) => void;
  handleNavBack: () => void;
  handleNavForward: () => void;
  handleLinkNavigate: (link: RenderedLinkAnnotation, onPage?: number | undefined) => Promise<void>;
  requestGoToPageInput: () => void;
  /** 图片字段: choose the picture an image field shows, or take it off
   *  (native form writer only; none elsewhere). */
  onImageFieldPick?: (field: RenderedFormField, pageNumber: number, action: "choose" | "clear") => void;
  /** The image field whose picture is being written. */
  imageFieldBusy?: string | null;
  clearPlacedAnnotationSelection: () => void;
  handleMeasurementTransform: (annotationId: string, nextBox: PercentBox, rotationDegrees?: number | undefined) => Promise<void>;
  handleMeasurementDelete: (annotationId: string) => Promise<void>;
  selectPlacedAnnotation: (next: PdfPlacedAnnotationSelection) => boolean;
  capturePdfOcrDocumentAuthority: (pageNumber: number) => Readonly<{ document: PDFDocumentProxy; dataItemId: string; url: string; byteGenerationKey: string; documentRevision: string | number; sourceSha256: string; pageNumber: number; pageCount: number; }> | null;
  requestOcrPreflight: (pageNumber: number) => Promise<void>;
  openOcrReview: (pageNumber: number) => void;
  handleNoteSave: (next: { text: string; color: string; }) => Promise<void>;
  handleNoteDelete: (requestedNoteId?: string | undefined) => Promise<void>;
  handleNoteSelect: (noteId: string) => void;
  handleNoteClose: () => void;
  handleToggleNoteResolved: (noteId: string) => Promise<void>;
  handleNoteAddReply: (noteId: string, text: string) => Promise<void>;
  handlePagePlaceNote: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  handlePagePlaceAttachment: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  handleMovePlacedAttachment: (id: string, point: { x: number; y: number; }) => Promise<boolean>;
  handleDeletePlacedAttachment: (id: string) => Promise<boolean>;
  handlePagePlaceSignature: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  handleSignatureDelete: (annotationId: string) => Promise<void>;
  handleSignatureCancel: () => void;
  handleSignatureConfirm: (finalDraft: { kind: SignatureKind; text: string; font: string; image: string | null; }) => Promise<void>;
  handleStampDelete: (annotationId: string) => Promise<void>;
  handlePagePlaceStamp: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  handleInkPointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleInkPointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  finishStroke: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  saveRedactionDraft: (draftId: string) => Promise<void>;
  discardRedactionDraft: (draftId: string) => void;
  handleRedactionDelete: (annotationId: string) => Promise<void>;
  handleRedactionPointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleRedactionPointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  finishRedaction: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  finishPolygon: () => Promise<boolean>;
  /** Ends the measurement: one drawn far enough to measure is kept. */
  finishMeasurement: () => void;
  handleShapeDelete: (annotationId: string) => Promise<void>;
  handleShapeTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleNativeSourceShapeTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleNativeSourceShapeDelete: (annotationId: string) => Promise<void>;
  handleNativeSourceStampTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleNativeSourceStampDelete: (annotationId: string) => Promise<void>;
  handleNativeSourceFreeTextTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleNativeSourceFreeTextDelete: (annotationId: string) => Promise<void>;
  handleSignatureTransform: (annotationId: string, box: PercentBox, objectRotation?: number | undefined) => Promise<void>;
  handleStampTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleRedactionTransform: (annotationId: string, box: PercentBox) => Promise<void>;
  handleNoteMove: (noteId: string, point: { x: number; y: number; }) => Promise<boolean>;
  handleNativeSourceInkDelete: (annotationId: string) => Promise<boolean>;
  selectLinkContext: (overlay: PdfLinkOverlay, sourceId: string | null, trigger: HTMLButtonElement, semanticRoute?: PdfSemanticAppearanceSelectionRoute | undefined) => void;
  editSelectedLinkContext: () => void;
  handleSelectedLinkTransform: (box: PercentBox) => Promise<void>;
  deleteSelectedLinkContext: () => Promise<void>;
  handleShapePointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePolygonClick: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  handleShapePointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  finishShape: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  /** WPS 擦除: the eraser's draft, held strokes and pointer handlers. */
  eraseTool: PdfEraseToolView;
  splitPageMode: PdfSplitPageModeView;
  handleLinkPointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleLinkPointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  finishLink: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleSnapshotPointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleSnapshotPointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  openSnapshotLatex: () => void;
  openSnapshotText: () => void;
  closeSnapshotLatex: () => void;
  /** Words read off the page go on to translation (WPS's 图片翻译). */
  openTextTranslation: (text: string) => void;
  finishSnapshot: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleMeasureClick: (pageNumber: number, event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  measureScale: MeasureScale;
  highlightsByPage: Map<number, HighlightAnnotation[]>;
  notesByPage: Map<number, StickyNoteAnnotation[]>;
  inksByPage: Map<number, InkAnnotation[]>;
  signaturesByPage: Map<number, SignatureAnnotation[]>;
  stampsByPage: Map<number, ReaderStampAnnotation[]>;
  nativeSourceStampsByPage: Map<number, NativePdfStampAnnotation[]>;
  /** Source /FreeText boxes by reader page (their x/y in page fractions). */
  nativeSourceFreeTextsByPage: Map<number, NativePdfFreeTextAnnotation[]>;
  onNativeSourceFreeTextEdit?: (annotationId: string) => void;
  redactionsByPage: Map<number, RedactionAnnotation[]>;
  shapesByPage: Map<number, ShapeAnnotation[]>;
  nativeSourceShapesByPage: Map<number, NativePdfShapeAnnotation[]>;
  nativeSourceLinksByPage: Map<number, NativePdfLinkAnnotation[]>;
  linkOverlaysByPage: Map<number, PdfLinkOverlay[]>;
  measurementsByPage: Map<number, MeasurementRecord[]>;
  textBoxViewOverlaysByPage: Map<number, TextBoxViewOverlay[]>;
  nativeInkStrokesByPage: Map<number, NativePdfInkStrokeLike[]>;
  nativeSourceInkStrokesByPage: Map<number, NativePdfInkStroke[]>;
  nativeImageOverlaysByPage: Map<number, NativePdfImageOverlayLike[]>;
  effectiveFormFields: Map<number, RenderedFormField[]>;
  visibleFormCapability: { widgetCount: number; fillableWidgetCount: number; };
  setFormValidationNotice: Dispatch<SetStateAction<{ fieldName: string; range?: PdfFieldRangeValidation; keystroke?: PdfKeystrokeRule; } | null>>;
  formRangeDrafts: Readonly<Record<string, string>>;
  formSessionOnlyValues: Readonly<Record<string, string>>;
  formChoiceDisplay: Readonly<Record<string, string | string[]>>;
  formInstanceId: string;
  multiStateCheckboxFieldNames: Set<string>;
  sourceFormValues: Record<string, AcroFormValue>;
  /** The role each field's widget names (form-roles.ts), by widget id. */
  formFieldRoles: ReadonlyMap<string, PdfFormRole>;
  /** The role the form is filled as; null: anyone (every field). */
  formFillRole: string | null;
  formMutationBlocked: boolean;
  lastFillFieldFocusRef: RefObject<string | null>;
  managedNativeShapeIdSet: Set<string>;
  managedNativeSignatureIdSet: Set<string>;
  managedNativeStampIdSet: Set<string>;
  handleResetForm: (scope?: PdfResetFormScope) => Promise<void>;
  fieldCandidates: CreateFormFieldCandidate[] | null;
  rejectedCandidates: Set<string>;
  setRejectedCandidates: Dispatch<SetStateAction<Set<string>>>;
  existingTextFieldEditMode: boolean;
  selectedFormFieldContext: SelectedFormFieldContext | null;
  existingTextFieldEditBusy: boolean;
  existingFormFieldDeleteMode: boolean;
  readFormFieldContextDisabledReason: (field: RenderedFormField, groupProperties?: NativePdfFormFieldGroupExpectedIdentity | null) => string | undefined;
  selectFormFieldContext: (field: RenderedFormField, pageNumber: number, trigger: HTMLButtonElement, semanticRoute?: PdfSemanticAppearanceSelectionRoute | undefined) => void;
  hasVisibleFormFieldForPropertyEdit: boolean;
  hasVisibleFormFieldForDelete: boolean;
  handleOpenExistingFormFieldDelete: (field: RenderedFormField, pageNumber: number, trigger: HTMLButtonElement) => void;
  handleOpenExistingFormFieldEditor: (field: RenderedFormField, pageNumber: number, trigger: HTMLButtonElement) => void;
  handleSelectedFormFieldTransform: (box: PercentBox) => Promise<void>;
  executeReaderCommand: (invocation: PdfCommandInvocation, decision: PdfRuntimeFeatureDecision) => Promise<FeatureCommandResult>;
  currentDownloadRuntimeDecision: PdfRuntimeFeatureDecision;
  printRuntimeDecision: PdfRuntimeFeatureDecision;
  currentDownloadCommand: ResolvedPdfFeatureCommand;
  printCommand: ResolvedPdfFeatureCommand;
  beginNativeFormFieldGesture: (fieldName: string) => void;
  finishNativeFormFieldGesture: (fieldName: string) => void;
  handleFormFieldChange: (field: RenderedFormField, rawValue: unknown, pageNumber: number, choiceDisplay?: string | string[] | undefined) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitWidth: () => void;
  fitPage: () => void;
  panToolArmed: boolean;
  disarmPageTools: (except?: "draw" | "shape" | "note" | "stamp" | "link" | "form" | "sign" | "redact" | "attach" | "snapshot" | "measure" | "proofing" | "pan" | undefined) => void;
  semanticEditSelectionActive: boolean;
  formWidgetEditSelectionAuthorized: boolean;
  semanticAppearanceSelectionEvidenceActive: boolean;
  semanticAppearanceRouteFor: (pageNumber: number, objectRef: string, semanticKind: PdfSemanticAppearanceCommandKind, surface: PdfSemanticAppearanceCommandSurface) => PdfSemanticAppearanceSelectionRoute | null;
  handlePresentationToggle: () => void;
  speechHighlightTarget: { readonly page: number; readonly chunkIndex: number; readonly start: number; readonly end: number; readonly granularity: "chunk" | "word"; } | null;
  speechHighlightRects: PdfFindHighlightRect[];
  referenceIndex: PdfReferenceIndex | null;
  referenceOverlaysByPage: ReadonlyMap<number, PdfReferenceOverlayRect[]>;
  handleReferenceJump: (refKey: string) => void;
  nativeVectorPageGeometryFor: (pageNumber: number, routeSha256: string | undefined) => PdfVectorPageGeometry | null;
  commitNativeVectorWrite: (route: PdfNativeVectorSelectionRoute, write: () => PdfNativeVectorCommitOutcome | Promise<PdfNativeVectorCommitOutcome>, placed?: PdfNativeVectorNormalizedBounds | null, options?: Readonly<{ turn?: (angle: number) => number }>) => Promise<PdfNativeVectorCommitOutcome>;
  nativeVectorMultiSelection: readonly PdfNativeVectorSelectionRoute[];
  nativeVectorMultiSelected: boolean;
  nativeVectorGroupBounds: PdfNativeVectorNormalizedBounds | null;
  nativeVectorGroupCenter: { x: number; y: number; } | null;
  nativeVectorRouteIsCurrent: boolean;
  nativeVectorRouteStaleReason: string | undefined;
  runOrQueueNativeVectorCommand: (run: (handlers: { rotate: (degrees: number) => Promise<void>; duplicate: () => Promise<void>; arrange: (action: ShapeGeometryTransform) => Promise<void>; align: (command: PdfShapeAlignCommand) => Promise<void>; reorder: (direction: PdfNativeVectorLayerMove) => Promise<void>; resize: (axis: "width" | "height", valuePoints: number, lockAspectRatio?: boolean | undefined) => Promise<void>; remove: () => Promise<void>; merge: (operation: import("../../../../../lib/pdf/native-vector-selection-edit").PdfNativeVectorMergeOperation) => Promise<void>; style: (change: Readonly<{ outlineColor?: string | undefined; lineWidth?: number | undefined; lineStyle?: "solid" | "dashed" | "dotted" | undefined; lineStart?: "none" | "openArrow" | "closedArrow" | "circle" | "square" | undefined; lineEnd?: "none" | "openArrow" | "closedArrow" | "circle" | "square" | undefined; fillColor?: string | null | undefined; fillOpacity?: number | undefined; opacity?: number | undefined; blendMode?: "normal" | "color" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "luminosity" | undefined; cornerRadius?: number | undefined; lineCap?: PdfShapeLineCap | undefined; lineJoin?: PdfShapeLineJoin | undefined; }>) => void; }) => unknown) => void;
  commitNativeVectorGroupTransform: (transform: PdfNativeVectorGroupTransform) => Promise<PdfNativeVectorCommitOutcome>;
  /** WPS's marquee in Edit Content: a drag from an empty part of a page
   * selects every source shape it touches (the box drawn while it lasts). */
  nativeVectorMarquee: Readonly<{
    /** The page the marquee is drawn on and where it started (set when the
     * drag starts and ends; NativeVectorMarqueeBox follows the moves). */
    live: { page: number; start: { x: number; y: number }; current: { x: number; y: number } } | null;
    /** Set by the drawn box: moves it to the pointer without rendering the
     * viewer. */
    followRef: RefObject<((live: NativeVectorMarqueeRect) => void) | null>;
    pointerDown: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
    pointerMove: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
    finish: (pageNumber: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  }>;
}

type LinkQuadPercent = { x: number; y: number; width: number; height: number };







function linkQuadRegions(
  box: LinkQuadPercent,
  quads: ReadonlyArray<LinkQuadPercent> | undefined,
): ReactNode {
  if (!quads || quads.length === 0 || box.width <= 0 || box.height <= 0) {
    return null;
  }
  return quads.map((quad, index) => (
    <span
      key={index}
      aria-hidden
      className="pdf-viewer__link-quad"
      style={{
        left: `${((quad.x - box.x) / box.width) * 100}%`,
        top: `${((quad.y - box.y) / box.height) * 100}%`,
        width: `${(quad.width / box.width) * 100}%`,
        height: `${(quad.height / box.height) * 100}%`,
      }}
    />
  ));
}

export type NativeVectorMarqueeRect = Readonly<{
  page: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
}>;

/** The marquee box while it is drawn: it takes each pointer move itself,
 * so a rubber-band selection renders this box alone, not the viewer and
 * its ribbon once per move. */
function NativeVectorMarqueeBox({
  initial,
  followRef,
}: {
  initial: NativeVectorMarqueeRect;
  followRef: RefObject<((live: NativeVectorMarqueeRect) => void) | null>;
}) {
  const [live, setLive] = useState(initial);
  useLayoutEffect(() => {
    followRef.current = setLive;
    return () => {
      if (followRef.current === setLive) followRef.current = null;
    };
  }, [followRef]);
  return (
    // The marquee being drawn (WPS 编辑内容): a thin box over the page; the
    // shapes it touches are selected on release.
    <div
      className="pdf-viewer__vector-marquee"
      data-testid="pdf-native-vector-marquee"
      aria-hidden
      style={{
        position: "absolute",
        left: `${Math.min(live.start.x, live.current.x)}%`,
        top: `${Math.min(live.start.y, live.current.y)}%`,
        width: `${Math.abs(live.current.x - live.start.x)}%`,
        height: `${Math.abs(live.current.y - live.start.y)}%`,
        border: "1px solid rgba(37, 99, 235, 0.9)",
        background: "rgba(37, 99, 235, 0.08)",
        pointerEvents: "none",
        zIndex: 9,
      }}
    />
  );
}





export function PdfReaderTextBoxLayer({
  authoring,
  pageIndex,
  cssWidth,
  cssHeight,
  documentHeight,
  addMode,
  createKind = "text",
  onPlaced,
  onCreateTable,
  onCreateChart,
  onCreateSmartArt,
  stackRanks,
  t,
}: {
  authoring: PdfViewerTextBoxAuthoring;
  pageIndex: number;
  cssWidth: number;
  cssHeight: number;
  documentHeight: number;
  addMode: boolean;
  /** 插入 › 公式 places a box set as a formula, its source editor open;
   * 插入 › 艺术字 one painted with the WordArt style, its placeholder words
   * selected to be typed over. */
  createKind?: PdfArmedTextKind;
  onPlaced: () => void;
  /** 插入 › 表格: the armed size placed at the click (the table layer's). */
  onCreateTable?: (x: number, y: number, rows: number, columns: number) => void;
  /** 插入 › 图表: the armed chart placed at the click (the chart layer's). */
  onCreateChart?: (x: number, y: number, family: string, subtype: string) => void;
  /** 智能图形: the armed layout placed with its top-left at (x, y). */
  onCreateSmartArt?: (x: number, y: number, layoutId: string) => void;
  /** The page's stack of the annotations the reader draws itself, by
   * `textbox:<id>` (lib/pdf/annotation-stack-order.ts). */
  stackRanks?: ReadonlyMap<string, number>;
  t: PdfViewerPagesModel["t"];
}) {
  const { edits, onEditsChange, onTextBoxHistory, onCreatedBoxCommit, writable, paintedIds, pageDrawnBoxes } = authoring;
  // The box the overlay holds selected: a painted box stays drawn while it
  // is, so a save that settles under the caret does not take the caret.
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  // A painted box clicked open: drawn here (its caret in) until the overlay
  // has selected it and the selection then leaves it. Without it a saved
  // box -- a line set as a text box, a box made earlier -- had nothing to
  // click in edit-content mode, the click went to the page canvas, and the
  
  const [openedPaintedId, setOpenedPaintedId] = useState<string | null>(null);
  const openedPaintedIdRef = useRef<string | null>(null);
  const openPaintedBox = useCallback((id: string | null) => {
    openedPaintedIdRef.current = id;
    setOpenedPaintedId(id);
  }, []);
  const selectedBoxIdRef = useRef<string | null>(null);
  // The host's selection callback, held so this layer's own stays the same
  // across the host's renders: the overlay tells its selection again when
  // its callback changes, and the host renders again when told (a loop).
  const onSelectionChangeRef = useRef(authoring.onSelectionChange);
  onSelectionChangeRef.current = authoring.onSelectionChange;
  const handleSelectionChange = useCallback(
    (selection: PdfTextBoxSelection | null) => {
      const next = selection?.id ?? null;
      const previous = selectedBoxIdRef.current;
      selectedBoxIdRef.current = next;
      if (openedPaintedIdRef.current && previous === openedPaintedIdRef.current && next !== previous) {
        openPaintedBox(null);
      }
      setSelectedBoxId(next);
      onSelectionChangeRef.current?.(selection);
    },
    [openPaintedBox],
  );
  useEffect(() => {
    // Never taken by the overlay (its caret could not go in): the page's own
    // painting shows it again rather than a second copy over it.
    if (!openedPaintedId) return;
    const timer = window.setTimeout(() => {
      if (selectedBoxIdRef.current !== openedPaintedIdRef.current) openPaintedBox(null);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [openPaintedBox, openedPaintedId]);
  const pageEdits = useMemo(
    () => edits.filter((edit) =>
      edit.page === pageIndex && edit.created && !edit.deleted &&
      (!paintedIds?.has(edit.id) || edit.id === selectedBoxId || edit.id === openedPaintedId)),
    [edits, openedPaintedId, pageIndex, paintedIds, selectedBoxId],
  );
  const paintedTargets = useMemo(
    () => writable && paintedIds?.size
      ? edits.filter((edit) =>
        edit.page === pageIndex && edit.created && !edit.deleted && paintedIds.has(edit.id) &&
        edit.id !== selectedBoxId && edit.id !== openedPaintedId)
      : [],
    [edits, openedPaintedId, pageIndex, paintedIds, selectedBoxId, writable],
  );
  const [focusBoxRequest, setFocusBoxRequest] = useState<{ id: string; nonce: number } | null>(null);
  
  // edit: the tool stays armed and the layer mounted meanwhile (disarmed at
  // once, the layer unmounted before the edit arrived, and the typing that
  // followed went nowhere).
  const [placing, setPlacing] = useState<string | null>(null);
  
  
  // as the write is accepted, while the page still showed the bytes before
  
  
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [awaitingPaint, setAwaitingPaint] = useState<
    ReadonlyArray<{ edit: PdfTextBoxEdit; source: string | null; since: number }>
  >([]);
  useEffect(() => {
    if (awaitingPaint.length === 0) return;
    const pageHost = layerRef.current?.closest<HTMLElement>(".pdf-viewer__page") ?? null;
    const settle = () => {
      const painted = pageHost?.dataset.pdfPaintedSource ?? null;
      const now = Date.now();
      setAwaitingPaint((current) => {
        // Kept until the page paints other bytes than it showed at the
        // commit (or for 90 s). A box still in the edits is drawn from them
        // (shownEdits takes it once): released for being there, it was gone
        // the moment the commit took it out, seconds before the page painted
        
        const kept = current.filter(
          (entry) =>
            now - entry.since < 90_000 &&
            (entry.source === null || painted === null || painted === entry.source),
        );
        if (process.env.NODE_ENV !== "production" && kept.length !== current.length) {
          // Dev diagnostics: why a box stopped being drawn (a box vanished
          
          for (const entry of current) {
            if (kept.includes(entry)) continue;
            console.debug("[pdf-reader-text-box] release", {
              id: entry.edit.id.slice(0, 16), pageIndex, agedMs: now - entry.since,
              source: entry.source?.slice(-10) ?? null, painted: painted?.slice(-10) ?? null,
              backInEdits: edits.some((edit) => edit.page === pageIndex && edit.id === entry.edit.id),
            });
          }
        }
        return kept.length === current.length ? current : kept;
      });
    };
    settle();
    if (!pageHost || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(settle);
    observer.observe(pageHost, { attributes: true, attributeFilter: ["data-pdf-painted-source"] });
    const timer = window.setInterval(settle, 5_000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [awaitingPaint.length, edits, pageIndex]);
  const shownEdits = useMemo(
    () => [
      ...pageEdits,
      ...awaitingPaint
        .filter((entry) => !pageEdits.some((edit) => edit.id === entry.edit.id))
        .map((entry) => entry.edit),
    ],
    [awaitingPaint, pageEdits],
  );
  const boxes = useMemo<TextBox[]>(
    () =>
      shownEdits.map((e) => ({
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
      })),
    [shownEdits],
  );
  const editsById = useMemo(() => {
    const map: Record<string, PdfTextBoxEdit> = {};
    for (const edit of shownEdits) map[edit.id] = edit;
    return map;
  }, [shownEdits]);
  // A box drawn here while the page canvas paints it too (a saved box opened
  // to edit, or edited and not yet painted again): the canvas copy, where
  // the page's revision has it, is covered in the page's colour around it
  // (sampled once from the canvas). Drawn by both, every word showed twice,
  
  const [covers, setCovers] = useState<ReadonlyMap<string, { rect: PdfTextBoxEdit; color: string }>>(() => new Map());
  useLayoutEffect(() => {
    const held = shownEdits.flatMap((edit) => {
      const drawn = pageDrawnBoxes?.get(edit.id);
      return drawn && drawn.page === pageIndex && !drawn.deleted ? [drawn] : [];
    });
    if (held.every((drawn) => covers.get(drawn.id)?.rect === drawn) && covers.size === held.length) return;
    const canvas = layerRef.current?.closest<HTMLElement>(".pdf-viewer__page")
      ?.querySelector<HTMLCanvasElement>("canvas[data-pdf-page]") ?? null;
    const next = new Map<string, { rect: PdfTextBoxEdit; color: string }>();
    for (const drawn of held) {
      const kept = covers.get(drawn.id);
      const color = kept?.rect === drawn ? kept.color : sampleTextBoxBackgroundColor(canvas, drawn);
      if (color) next.set(drawn.id, { rect: drawn, color });
    }
    // A colour the canvas could not give is not asked for again on every
    // render: the map is replaced only when it changes.
    if (next.size === covers.size && [...next].every(([id, cover]) => covers.get(id)?.rect === cover.rect)) return;
    setCovers(next);
  }, [covers, pageDrawnBoxes, pageIndex, shownEdits]);
  const handleCreatedBoxCommit = useCallback(
    (id: string, text: string) => {
      const edit = edits.find((entry) => entry.page === pageIndex && entry.id === id);
      // A saved box left unchanged is the page's to draw at once: held here
      // until the page painted other bytes, it was drawn over the page's own
      // copy of it for up to 90 s after it was left.
      if (edit && !paintedIds?.has(id) && !authoring.createdBoxHandingOff?.(id)) {
        const pageHost = layerRef.current?.closest<HTMLElement>(".pdf-viewer__page") ?? null;
        setAwaitingPaint((current) => [
          ...current.filter((entry) => entry.edit.id !== id),
          { edit: { ...edit, text }, source: pageHost?.dataset.pdfPaintedSource ?? null, since: Date.now() },
        ]);
      }
      void onCreatedBoxCommit(id, text);
    },
    [authoring, edits, onCreatedBoxCommit, pageIndex, paintedIds],
  );
  const before = useCallback(
    (id: string) => edits.find((edit) => edit.page === pageIndex && edit.id === id),
    [edits, pageIndex],
  );
  const handleEditBox = useCallback(
    (edit: PdfTextBoxEdit, options?: PdfTextBoxEditEmitOptions) => {
      // A new box's first words (not an input method's composition, which
      // goes on in the box): the host may hand the box over to the native
      // editor now, once this key has settled in it.
      if (edit.created && !edit.deleted && !options?.transient && (edit.text ?? "").trim() &&
        !(before(edit.id)?.text ?? "").trim() && authoring.onCreatedBoxFirstText) {
        const firstText = authoring.onCreatedBoxFirstText;
        window.setTimeout(() => firstText(edit.id), 0);
      }
      if (!onTextBoxHistory || options?.transient) {
        // The box in the place the list has it (textBoxChangeQueue.ts): put
        // at the end, a box that grew by a line went behind every other box
        // of the list, and was written there.
        onEditsChange((current) => pdfTextBoxListWithBox(current, edit, edit));
        return;
      }
      onTextBoxHistory({
        page: edit.page,
        changes: [{ id: edit.id, before: before(edit.id), after: edit }],
        foldKey: options?.fold ? `${options.fold}:${edit.page}:${edit.id}` : undefined,
      });
    },
    [authoring.onCreatedBoxFirstText, before, onEditsChange, onTextBoxHistory],
  );
  const handleCreateBox = useCallback(
    (xFrac: number, yFrac: number, size?: Readonly<{ width: number; height: number }>) => {
      const tableSize = pdfArmedTableSize(createKind);
      if (tableSize) {
        onCreateTable?.(xFrac, yFrac, tableSize.rows, tableSize.columns);
        onPlaced();
        return;
      }
      const chartLeaf = pdfArmedChartLeaf(createKind);
      if (chartLeaf) {
        onCreateChart?.(xFrac, yFrac, chartLeaf.family, chartLeaf.subtype);
        onPlaced();
        return;
      }
      const smartArtLayout = pdfArmedSmartArtLayout(createKind);
      if (smartArtLayout) {
        onCreateSmartArt?.(xFrac, yFrac, smartArtLayout);
        onPlaced();
        return;
      }
      const id = `new-${pageIndex}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const wordArt = createKind.startsWith("wordart:")
        ? OFFICE_WORDART_GALLERY_RECIPES.find((recipe) => recipe.id === createKind.slice("wordart:".length))
        : undefined;
      const paint = wordArt ? pdfTextBoxTextPaint(wordArt.paint) : null;
      const created = createTextBox(xFrac, yFrac, {
        page: pageIndex,
        id,
        ...(paint
          ? {
              text: t("presentation.wordArtGallery.placeholder"),
              fontSize: PDF_WORDART_FONT_SIZE_PT / (documentHeight || 792),
              width: 0.5,
              height: (PDF_WORDART_FONT_SIZE_PT * 1.25) / (documentHeight || 792),
            }
          : {}),
        // Drawn by a drag: the box takes the size drawn (Word's text box).
        ...(size ? { width: size.width, height: size.height } : {}),
      });
      const box = createKind === "formula" ? { ...created, kind: "formula" as const, latex: "" }
        : paint ? { ...created, textPaint: paint } : created;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[pdf-reader-text-box] create", { id, pageIndex, viaHistory: Boolean(onTextBoxHistory), edits: edits.length });
      }
      setPlacing(id);
      setFocusBoxRequest({ id, nonce: Date.now() });
      if (onTextBoxHistory) onTextBoxHistory({ page: pageIndex, changes: [{ id, after: box }] });
      else onEditsChange((current) => [...current, box]);
    },
    [createKind, documentHeight, edits.length, onCreateChart, onCreateSmartArt, onCreateTable, onEditsChange, onPlaced, onTextBoxHistory, pageIndex, t],
  );
  useEffect(() => {
    if (!placing) return;
    if (!boxes.some((box) => box.id === placing)) return;
    setPlacing(null);
    onPlaced();
  }, [boxes, onPlaced, placing]);
  const handleDeleteBox = useCallback(
    (id: string) => {
      const was = before(id);
      if (onTextBoxHistory && was) {
        onTextBoxHistory({ page: pageIndex, changes: [{ id, before: was }] });
        return;
      }
      onEditsChange((current) => current.filter((e) => !(e.page === pageIndex && e.id === id)));
    },
    [before, onEditsChange, onTextBoxHistory, pageIndex],
  );
  // The overlay's boxes by their own ids, at their place in the page's stack.
  const boxStackRanks = useMemo(() => {
    if (!stackRanks) return undefined;
    const ranks = new Map<string, number>();
    for (const box of boxes) {
      const rank = stackRanks.get(`textbox:${box.id}`);
      if (rank !== undefined) ranks.set(box.id, rank);
    }
    return ranks;
  }, [boxes, stackRanks]);
  // The page around the boxes is the layer's only while a box is being typed
  // (selected): the press that leaves the box ends its typing and goes no
  // further. A box the layer merely holds -- handed on and waiting for the
  // page to paint it, or kept as a draft after a save that was refused --
  // takes the pointer on itself alone. Holding any box, the layer lay over
  // the whole page and took every press: the pen drew nothing and no text
  // could be selected, without a word, for as long as the draft was kept
  
  const typing = selectedBoxId !== null && boxes.some((box) => box.id === selectedBoxId);
  // That leaving press, to its end: the box is no longer selected by the
  // time the button comes up, and the click of a press the layer took
  // belongs to the layer too, not to what the page shows under it.
  const [leavingPress, setLeavingPress] = useState(false);
  useEffect(() => {
    if (!leavingPress) return;
    let timer: number | null = null;
    // After the click, which the browser sends with the release.
    const release = () => { timer ??= window.setTimeout(() => setLeavingPress(false), 0); };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [leavingPress]);
  if (!addMode && boxes.length === 0 && !placing && paintedTargets.length === 0) return null;
  return (
    <div
      ref={layerRef}
      className={`pdf-viewer__text-box-layer${addMode ? " pdf-viewer__text-box-layer--placing" : ""}${
        boxes.length > 0 ? " pdf-viewer__text-box-layer--holding" : ""
      }${typing || leavingPress ? " pdf-viewer__text-box-layer--typing" : ""}`}
      data-testid="pdf-reader-text-box-layer"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && typing) setLeavingPress(true);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {paintedTargets.map((edit) => (
        <div
          key={edit.id}
          role="button"
          tabIndex={0}
          aria-label={edit.text.slice(0, 80) || t("pdf.textbox.label")}
          // Framed in 编辑内容 like the page's own lines (styles/pdf-viewer.css).
          className="pdf-viewer__native-source-stamp-target pdf-viewer__painted-text-box-target"
          data-testid="pdf-painted-text-box-target"
          data-text-box-id={edit.id}
          style={{
            position: "absolute",
            left: `${edit.x * 100}%`,
            top: `${edit.y * 100}%`,
            width: `${edit.width * 100}%`,
            height: `${edit.height * 100}%`,
            pointerEvents: addMode ? "none" : "auto",
            cursor: "text",
            // The page paints the box; this only takes the click.
            background: "transparent",
            ...(stackRanks?.has(`textbox:${edit.id}`)
              ? { zIndex: 1 + 2 * stackRanks.get(`textbox:${edit.id}`)! }
              : {}),
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            openPaintedBox(edit.id);
            setFocusBoxRequest({ id: edit.id, nonce: Date.now() });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            openPaintedBox(edit.id);
            setFocusBoxRequest({ id: edit.id, nonce: Date.now() });
          }}
        />
      ))}
      {[...covers].map(([id, cover]) => (
        <div
          key={`cover-${id}`}
          aria-hidden
          data-testid="pdf-reader-text-box-cover"
          data-text-box-id={id}
          style={{
            position: "absolute",
            // A pixel past the frame: glyphs overshoot their box a little.
            left: `calc(${cover.rect.x * 100}% - 1px)`,
            top: `calc(${cover.rect.y * 100}% - 1px)`,
            width: `calc(${cover.rect.width * 100}% + 2px)`,
            height: `calc(${cover.rect.height * 100}% + 2px)`,
            background: cover.color,
            pointerEvents: "none",
            ...(stackRanks?.has(`textbox:${id}`) ? { zIndex: 1 + 2 * stackRanks.get(`textbox:${id}`)! } : {}),
          }}
        />
      ))}
      <PdfTextBoxOverlay
        boxes={boxes}
        stackRanks={boxStackRanks}
        page={pageIndex}
        pageWidth={cssWidth}
        pageHeight={cssHeight}
        documentPageHeight={documentHeight}
        editsById={editsById}
        onEditBox={handleEditBox}
        active
        addMode={addMode && writable}
        onCreateBox={handleCreateBox}
        onDeleteBox={handleDeleteBox}
        onCreatedBoxCommit={handleCreatedBoxCommit}
        onSelectionChange={handleSelectionChange}
        contextCommand={authoring.contextCommand ?? null}
        showDeleteButton
        disabled={!writable}
        focusBoxRequest={focusBoxRequest}
      />
    </div>
  );
}

export function PdfViewerPages({ viewport }: { viewport: PdfViewerPagesModel }) {
  // Each page's annotation stack, worked out again only when what it reads
  // changes (a page of hundreds of shapes is re-rendered on every pointer
  // move of a drag; the order is not).
  const annotationStackRanksCacheRef = useRef(
    new Map<number, Readonly<{ inputs: readonly unknown[]; ranks: ReadonlyMap<string, number> }>>(),
  );
  const annotationStackRanksFor = (
    pageNumber: number,
    inputs: readonly unknown[],
    rank: () => ReadonlyMap<string, number>,
  ): ReadonlyMap<string, number> => {
    const cached = annotationStackRanksCacheRef.current.get(pageNumber);
    if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) {
      return cached.ranks;
    }
    const ranks = rank();
    annotationStackRanksCacheRef.current.set(pageNumber, { inputs, ranks });
    return ranks;
  };
  const {
    annotationContextWritable,
    onNativeSourceInkDelete,
    onNativeSourceInkTransform,
    managedSignatureAppearanceReady,
    managedStampAppearanceReady,
    managedShapeAppearanceReady,
    onNativeSourceTextMarkupSelect,
    onNativeSourceTextNoteSelect,
    managedTextMarkupAppearanceReady,
    dataItemId,
    documentDecorationsNativeAppearanceReady,
    onNativeFileAttachmentMove,
    onNativeFileAttachmentDelete,
    nativeFileAttachmentBusy,
    nativeFileAttachmentDisabledReason,
    resolveNativeImageOverlayUrl,
    onNativeVectorGeometryCommit,
    onNativeImageActivate,
    nativePictureSelectable = false,
    renderNativePictureLayer,
    openNativeImageTargetMenu,
    nativePictureSelected = false,
    clearNativePictureSelection,
    onNativeVectorDeleteCommit,
    onNativeVectorGeometryCommitAll,
    nativeVectorGeometryBusy,
    nativeVectorWriteSettling,
    nativeVectorGeometryDisabledReason,
    onNativeVectorStyleCommit,
    t,
    locale,
    renderLifecycleV2,
    matchedSourceRiskSnapshot,
    pdfDoc,
    heldPageFrames,
    heldReplacedPages,
    pages,
    loading,
    scale,
    formFieldContextBaseTabRef,
    currentPage,
    currentVisibleOrdinal,
    fullPageBand,
    setReaderContextMenu,
    pageTextEditTargetAt,
    onPageTextDoubleClick,
    setFindOpen,
    findActiveIndex,
    findHighlightsByPage,
    renderedNativeSourceTextMarkups,
    renderedNativeSourceTextNotes,
    setEditingHighlight,
    commentMentions,
    noteMode,
    addTextMode,
    addTextKind,
    textBoxAuthoring,
    tableAuthoring,
    tableSelection,
    onTableSelectionChange,
    chartAuthoring,
    annotationStackOrderByPage,
    chartSelectedId,
    onChartSelectionChange,
    chartPreview,
    onAddTextPlaced,
    attachMode,
    placedAttachments,
    activeNoteId,
    pendingNote,
    noteSaving,
    drawMode,
    inkColor,
    inkWidth,
    drawingStroke,
    inkWet,
    wetInkHost,
    inkPageOverlay,
    liveInkAwareness,
    signMode,
    setSignMode,
    signSaving,
    signatureReturnFocusRef,
    setSignatureComposerMode,
    signatureComposerMode,
    pendingSignature,
    setPendingSignature,
    signDraft,
    setSignDraft,
    resetSignDraft,
    armedStamp,
    stampSaving,
    nativeSourceStampSaving,
    nativeSourceFreeTextSaving,
    redactMode,
    redactSaving,
    redactionDrafts,
    drawingRedaction,
    shapeMode,
    shapeKind,
    polygonDraft,
    shapeColor,
    shapeWidth,
    shapeLineStyle,
    shapeLineStart,
    shapeLineEnd,
    shapeFillColor,
    shapeFillOpacity,
    renderedVisualMaskOutputAuthority,
    shapeSaving,
    nativeSourceShapeSaving,
    drawingShape,
    selectedPlaced,
    nativeSourceInkSaving,
    linkMode,
    linkSaving,
    managedLinkUpsertRef,
    nativeSourceLinkTransformRef,
    drawingLink,
    selectedLinkContext,
    snapshotMode,
    drawingSnapshot,
    snapshotLatex,
    measureMode,
    measureKind,
    measurePts,
    measurementSaving,
    printPreflightTriggerRef,
    effectiveDocumentDecorations,
    linkAnnotations,
    setFocusedFormField,
    focusedFormField,
    formValues,
    formMode,
    flattening,
    rasterOutputAuthorityBlocked,
    viewMode,
    lineNumbersVisible,
    lineNumbersByPage,
    canvasReadFilter,
    navCanBack,
    navCanForward,
    sameDocumentReloading,
    panMode,
    spacePanHeld,
    panning,
    presentationActive,
    scrollContainerRef,
    viewerRootRef,
    panSuppressClickRef,
    pageRefs,
    visibleItemRefs,
    findInputRef,
    renderTasksRef,
    textLayerTasksRef,
    renderPipelinesRef,
    pageProxiesRef,
    pageRenderEpochsRef,
    renderedPagesRef,
    activeTextSourceHandoff,
    semanticAppearanceInspectionBindingRef,
    nativeVectorSelectionRoutesByPage,
    selectedNativeVectorSelection,
    setSelectedNativeVectorSelection,
    nativeVectorVertexEditing,
    nativeVectorVertexDrag,
    setNativeVectorVertexDrag,
    nativeVectorVertexDragRef,
    nativeImageTargetsByPage,
    nativeVectorUserSelectionEpochRef,
    visibleVectorsByPageRef,
    nativeVectorDragGhost,
    setNativeVectorDragGhost,
    nativeVectorDragGhostRef,
    placedTurnFromRef,
    previewNativeVectorGesture,
    previewNativeVectorRotation,
    nativeVectorTurnedFrameFor,
    previewPlacedObjectGesture,
    previewPlacedObjectRotation,
    previewNativeVectorGroupGesture,
    previewNativeVectorGroupRotation,
    settleCanvasObjectGesture,
    previewLiftedGesture,
    previewLiftedRotation,
    nativeVectorFrameFlipRef,
    parkedCanvasObjectLifts,
    placedLiftWritingRef,
    placedObjectSavingRef,
    placedDeleteHoldRef,
    staleNativeVectorRoutesByPage,
    setExtraNativeVectorSelections,
    extraNativeVectorSelections,
    selectedNativeVectorKeys,
    openNativeVectorTargetMenu,
    activateNativeVectorTarget,
    activateNativeImageTarget,
    provisionalNativeVectorRouteRef,
    semanticAppearanceBindingIsCurrent,
    ocrRunsByPage,
    ocrReviewByPage,
    ocrAnnotationHydrationReady,
    ocrCandidatePages,
    ocrPendingPages,
    ocrFailedPages,
    ocrPreflightLoadingPage,
    ocrPreflightTriggerRef,
    pendingOcrReview,
    ocrReviewBusy,
    pdfOcrServerSourceAuthority,
    resolvedPageRotation,
    prewarmNativeVectorTarget,
    prewarmPlacedObjectLayers,
    visiblePages,
    visiblePageItems,
    visiblePageCount,
    visibleOrdinalForOriginal,
    previousVisibleOrdinal,
    nextVisibleOrdinal,
    goToPage,
    goToVisibleOrdinal,
    handleNavBack,
    handleNavForward,
    handleLinkNavigate,
    requestGoToPageInput,
    onImageFieldPick,
    imageFieldBusy,
    clearPlacedAnnotationSelection,
    handleMeasurementTransform,
    handleMeasurementDelete,
    selectPlacedAnnotation,
    capturePdfOcrDocumentAuthority,
    requestOcrPreflight,
    openOcrReview,
    handleNoteSave,
    handleNoteDelete,
    handleNoteSelect,
    handleNoteClose,
    handleToggleNoteResolved,
    handleNoteAddReply,
    handlePagePlaceNote,
    handlePagePlaceAttachment,
    handleMovePlacedAttachment,
    handleDeletePlacedAttachment,
    handlePagePlaceSignature,
    handleSignatureDelete,
    handleSignatureCancel,
    handleSignatureConfirm,
    handleStampDelete,
    handlePagePlaceStamp,
    handleInkPointerDown,
    handleInkPointerMove,
    finishStroke,
    saveRedactionDraft,
    discardRedactionDraft,
    handleRedactionDelete,
    handleRedactionPointerDown,
    handleRedactionPointerMove,
    finishRedaction,
    finishPolygon,
    finishMeasurement,
    handleShapeDelete,
    handleShapeTransform,
    handleNativeSourceShapeTransform,
    handleNativeSourceShapeDelete,
    handleNativeSourceStampTransform,
    handleNativeSourceStampDelete,
    handleNativeSourceFreeTextTransform,
    handleNativeSourceFreeTextDelete,
    handleSignatureTransform,
    handleStampTransform,
    handleRedactionTransform,
    handleNoteMove,
    handleNativeSourceInkDelete,
    selectLinkContext,
    editSelectedLinkContext,
    handleSelectedLinkTransform,
    deleteSelectedLinkContext,
    handleShapePointerDown,
    handlePolygonClick,
    handleShapePointerMove,
    finishShape,
    eraseTool,
    splitPageMode,
    handleLinkPointerDown,
    handleLinkPointerMove,
    finishLink,
    handleSnapshotPointerDown,
    handleSnapshotPointerMove,
    openSnapshotLatex,
    openSnapshotText,
    closeSnapshotLatex,
    openTextTranslation,
    finishSnapshot,
    handleMeasureClick,
    measureScale,
    highlightsByPage,
    notesByPage,
    inksByPage,
    signaturesByPage,
    stampsByPage,
    nativeSourceStampsByPage,
    nativeSourceFreeTextsByPage,
    onNativeSourceFreeTextEdit,
    redactionsByPage,
    shapesByPage,
    nativeSourceShapesByPage,
    nativeSourceLinksByPage,
    linkOverlaysByPage,
    measurementsByPage,
    textBoxViewOverlaysByPage,
    nativeInkStrokesByPage,
    nativeSourceInkStrokesByPage,
    nativeImageOverlaysByPage,
    effectiveFormFields,
    visibleFormCapability,
    setFormValidationNotice,
    formRangeDrafts,
    formSessionOnlyValues,
    formChoiceDisplay,
    formInstanceId,
    multiStateCheckboxFieldNames,
    sourceFormValues,
    formFieldRoles,
    formFillRole,
    formMutationBlocked,
    lastFillFieldFocusRef,
    managedNativeShapeIdSet,
    managedNativeSignatureIdSet,
    managedNativeStampIdSet,
    handleResetForm,
    fieldCandidates,
    rejectedCandidates,
    setRejectedCandidates,
    existingTextFieldEditMode,
    selectedFormFieldContext,
    existingTextFieldEditBusy,
    existingFormFieldDeleteMode,
    readFormFieldContextDisabledReason,
    selectFormFieldContext,
    hasVisibleFormFieldForPropertyEdit,
    hasVisibleFormFieldForDelete,
    handleOpenExistingFormFieldDelete,
    handleOpenExistingFormFieldEditor,
    handleSelectedFormFieldTransform,
    executeReaderCommand,
    currentDownloadRuntimeDecision,
    printRuntimeDecision,
    currentDownloadCommand,
    printCommand,
    beginNativeFormFieldGesture,
    finishNativeFormFieldGesture,
    handleFormFieldChange,
    zoomIn,
    zoomOut,
    fitWidth,
    fitPage,
    panToolArmed,
    disarmPageTools,
    semanticEditSelectionActive,
    formWidgetEditSelectionAuthorized,
    semanticAppearanceSelectionEvidenceActive,
    semanticAppearanceRouteFor,
    handlePresentationToggle,
    speechHighlightTarget,
    speechHighlightRects,
    referenceIndex,
    referenceOverlaysByPage,
    handleReferenceJump,
    nativeVectorPageGeometryFor,
    commitNativeVectorWrite,
    nativeVectorMultiSelection,
    nativeVectorMultiSelected,
    nativeVectorGroupBounds,
    nativeVectorGroupCenter,
    nativeVectorRouteIsCurrent,
    nativeVectorRouteStaleReason,
    runOrQueueNativeVectorCommand,
    commitNativeVectorGroupTransform,
    nativeVectorMarquee,
  } = viewport;
  const smartArtPlaceholders = useOfficeSmartArtPlaceholders();
  // A placed object in another member's hand follows it here; this member's
  // own frame gestures go out (pdfLiveTransform).
  const pdfLive = usePdfLiveTransforms(viewport.liveTransformRoom);
  // This member's selection goes out on the same presence (pdfPeerSelections).
  usePdfSelectionPresence(viewport.liveTransformRoom, scrollContainerRef);
  // Notes the author leaves open show their text until the reader closes
  
  const [closedInitialNotes, setClosedInitialNotes] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // A placed annotation's lift is written by its own frame's commit (the
  // closure the frame last rendered with, kept by the object's key), one
  // save at a time: a move made while the last one saves stands where it
  // was let go and is written when that save lands (it was ignored: owner
  
  const placedLiftCommitRef = useRef(new Map<string, (box: PercentBox) => void>());
  const placedLiftWrittenRef = useRef(new Map<number, PercentBox>());
  const placedLiftNeedsWrite = (ghost: CanvasObjectGhostState | null | undefined): boolean => {
    const lift = ghost?.lift;
    if (!ghost || !lift || lift.kind !== "placed") return false;
    const written = placedLiftWrittenRef.current.get(lift.id) ?? lift.acked.rect;
    return !sameLiftBox(written, lift.pose.rect);
  };
  // A Delete, a turn, or a move no stage carried, that the frame took while
  // its object's own save ran is carried out when that save ends, after the
  // moves that wait (a Delete was dropped without a word and a turn went
  
  // taken back by a gesture begun on the object since, and one the save
  // outlasted by ten seconds is not carried out and says so. A turn or a
  // move is a gesture already made: it is written though the selection has
  // moved on (it went back without a word). One command waits per object.
  const placedFrameHandlersRef = useRef(
    new Map<string, { saving: boolean; onDelete?: () => void; onRotate?: (rotation: number) => void }>(),
  );
  const placedFrameCommandsRef = useRef(
    new Map<
      string,
      {
        at: number;
        command:
          | { kind: "delete" }
          | { kind: "turn"; rotation: number }
          | { kind: "move"; box: PercentBox };
      }
    >(),
  );
  // The turn of an object whose frame is no longer drawn, by the object as
  // the model now holds it (the frame's last closure may hold the box of
  // before the save that was waited for).
  const turnUnselectedPlacedObject = (key: string, rotation: number) => {
    const cut = key.indexOf(":");
    const kind = key.slice(0, cut);
    const id = key.slice(cut + 1);
    if (kind === "signature") {
      for (const pageSignatures of signaturesByPage.values()) {
        const signature = pageSignatures.find((entry) => entry.id === id);
        if (!signature) continue;
        void handleSignatureTransform(
          signature.id,
          {
            x: signature.x,
            y: signature.y,
            width: signature.width,
            height: signature.height,
          },
          rotation,
        );
        return;
      }
    } else if (kind === "measurement") {
      // A measurement turns about its own points: the box is not read.
      void handleMeasurementTransform(id, { x: 0, y: 0, width: 0, height: 0 }, rotation);
    }
  };
  useEffect(() => {
    if (placedObjectSavingRef.current) return;
    for (const ghost of [nativeVectorDragGhost, ...parkedCanvasObjectLifts]) {
      if (!ghost?.lift || !ghost.settled || !placedLiftNeedsWrite(ghost)) continue;
      const commit = placedLiftCommitRef.current.get(ghost.key);
      if (!commit) continue;
      placedLiftWrittenRef.current.set(ghost.lift.id, ghost.lift.pose.rect);
      commit(ghost.lift.pose.rect);
      return;
    }
    const commands = placedFrameCommandsRef.current;
    for (const [key, waiting] of [...commands]) {
      const selected =
        (selectedPlaced && key === `${selectedPlaced.kind}:${selectedPlaced.id}`) ||
        (selectedFormFieldContext && key === `formField:${selectedFormFieldContext.field.id}`);
      const frame = placedFrameHandlersRef.current.get(key);
      const command = waiting.command;
      if (command.kind === "delete") {
        if (!selected || !frame) {
          commands.delete(key);
        } else if (Date.now() - waiting.at > 10_000) {
          commands.delete(key);
          placedDeleteHoldRef.current?.notCarriedOut?.();
        } else if (!frame.saving) {
          commands.delete(key);
          frame.onDelete?.();
          return;
        }
        continue;
      }
      if (selected && frame) {
        if (frame.saving) continue;
        commands.delete(key);
        if (command.kind === "turn") frame.onRotate?.(command.rotation);
        else placedLiftCommitRef.current.get(key)?.(command.box);
        return;
      }
      // No frame is drawn for it now, and no placed object is saving.
      commands.delete(key);
      if (command.kind === "turn") turnUnselectedPlacedObject(key, command.rotation);
      else placedLiftCommitRef.current.get(key)?.(command.box);
      return;
    }
  });
  placedLiftWritingRef.current = (liftId: number) => {
    const ghost = [nativeVectorDragGhostRef.current, ...parkedCanvasObjectLifts].find(
      (entry) => entry?.lift?.id === liftId,
    );
    return placedLiftNeedsWrite(ghost);
  };
  // Draw with Touch off: a finger scrolls a draw-mode page; the pen inks.
  const drawWithTouch = useDrawWithTouch();
  // A finger fills forms: 16px editors on a coarse pointer (no iOS focus
  // zoom, whatever the switch says) and 44px toggles in Touch mode.
  const coarsePointer = useDevicePointerIsCoarse();
  const touchMode = useTouchMode();
  // A page wrapper attached or detached: its place in the page maps, and
  // (render lifecycle v2) its render work torn down once no wrapper of the
  // same page took its place.
  const attachPageWrapper = (pageNumber: number, itemIndex: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNumber, el);
      visibleItemRefs.current.set(itemIndex + 1, el);
    } else {
      const detached = pageRefs.current.get(pageNumber);
      pageRefs.current.delete(pageNumber);
      visibleItemRefs.current.delete(itemIndex + 1);
      if (renderLifecycleV2) {
        // Inline React ref callbacks receive a transient null
        // when their function identity changes. Defer one
        // microtask and tear down only if no replacement node
        // reclaimed this page number.
        void Promise.resolve().then(() => {
          if (pageRefs.current.has(pageNumber)) return;
          pageRenderEpochsRef.current.set(
            pageNumber,
            (pageRenderEpochsRef.current.get(pageNumber) ?? 0) +
              1,
          );
          cancelTrackedPdfTask(
            renderTasksRef.current,
            pageNumber,
          );
          cancelTrackedPdfTask(
            textLayerTasksRef.current,
            pageNumber,
          );
          const canvas =
            detached?.querySelector<HTMLCanvasElement>(
              "canvas[data-pdf-page]",
            );
          if (canvas) releasePdfCanvasBackingStore(canvas);
          renderedPagesRef.current.delete(pageNumber);
          const pageProxy =
            pageProxiesRef.current.get(pageNumber);
          if (pageProxy) {
            void cleanupPdfPageAfter(
              pageProxy,
              renderPipelinesRef.current.get(pageNumber),
            );
          }
        });
      }
    }
  };
  // Pages outside the band about the view are drawn as their paper only: the
  // wrapper with its canvas, locate tint and text layer (the parts the reader
  // paints and reads by hand), as the same element while nothing about it
  // changed, so a render of the reader does not rebuild them. Every render
  // used to rebuild all of a document's pages with all of their layers (a
  
  const lightPagesRef = useRef(new Map<number, { deps: string; element: ReactElement }>());
  const lightPageElement = (page: PageRecord, itemIndex: number, hidden: boolean): ReactElement => {
    const rotation = resolvedPageRotation(page.pageNumber);
    const rotated = rotation === 90 || rotation === 270;
    const width = (rotated ? page.height : page.width) * scale;
    const height = (rotated ? page.width : page.height) * scale;
    const filePageNumber = viewport.filePageNumberFor(page.pageNumber) ?? "";
    const className = pageWrapperClassName(false);
    const deps = [itemIndex, rotation, width, height, hidden, className, canvasReadFilter, filePageNumber, renderLifecycleV2].join("|");
    const cached = lightPagesRef.current.get(page.pageNumber);
    if (cached && cached.deps === deps) return cached.element;
    const pageNumber = page.pageNumber;
    const element = (
      <div
        key={pageNumber}
        ref={(el) => attachPageWrapper(pageNumber, itemIndex, el)}
        data-page-number={pageNumber}
        data-file-page-number={filePageNumber}
        data-pdf-render-rotation={rotation}
        data-visible-page-ordinal={itemIndex + 1}
        data-pdf-page-paper-only="true"
        className={className}
        style={{ width, height, ...(hidden ? { display: "none" } : null) }}
      >
        <canvas
          key="pdf-page-canvas"
          data-pdf-page={pageNumber}
          style={canvasReadFilter === "none" ? undefined : { filter: canvasReadFilter }}
        />
        <span key="pdf-page-photos" className="pdf-viewer__page-photos" data-pdf-read-mode-photos aria-hidden />
        <span key="pdf-page-locate" className="pdf-viewer__page-locate" data-pdf-page-locate aria-hidden />
        <div key="pdf-page-text-layer" data-pdf-text-layer className="pdf-viewer__text-layer" />
      </div>
    );
    lightPagesRef.current.set(pageNumber, { deps, element });
    return element;
  };
  // The mode classes every page wrapper wears. A page away from the view has
  // no settle bar: its endless sweep, on every page not painted yet, cost
  // WebKit a style pass a frame and three thousand animation events in a
  // ten-second scroll of an 80-page PDF.
  const pageWrapperClassName = (settleBar = true) => `pdf-viewer__page${settleBar ? " office-settle-shimmer" : ""}${
                noteMode ? " pdf-viewer__page--note-mode" : ""
              }${addTextMode ? " pdf-viewer__page--add-text-mode" : ""}${
                drawMode ? " pdf-viewer__page--draw-mode" : ""}${
                drawMode && !drawWithTouch ? " pdf-viewer__page--draw-pen-only" : ""
              }${
                signMode || armedStamp ? " pdf-viewer__page--sign-mode" : ""
              }${redactMode ? " pdf-viewer__page--redact-mode" : ""}${
                shapeMode ? " pdf-viewer__page--shape-mode" : ""
              }${linkMode ? " pdf-viewer__page--link-mode" : ""}${
                snapshotMode ? " pdf-viewer__page--snapshot-mode" : ""
              }${measureMode ? " pdf-viewer__page--measure-mode" : ""}${
                eraseTool.armed ? " pdf-viewer__page--erase-mode" : ""
              }`;
  return (
    <div
      // PDF pages keep their ltr geometry under an rtl interface.
      dir="ltr"
      className={`pdf-viewer__pages${
        viewMode === "spread" ? " pdf-viewer__pages--spread" : ""
      }${
        // Grab cursor + selection suppression while a pan is available
        // (toggle armed with no page tool, or Space held); grabbing while
        // a drag is live.
        spacePanHeld || (panMode && !panToolArmed)
          ? " pdf-viewer__pages--pan"
          : ""
      }${panning ? " pdf-viewer__pages--panning" : ""}`}
      data-view-mode={viewMode}
      // The others' pointers are told on the page they are on
      // (lib/collaboration-windows/pointer-anchor).
      data-collab-pointer-surface=".pdf-viewer__page[data-page-number]"
      data-collab-pointer-number="data-page-number"
      aria-busy={loading}
      ref={scrollContainerRef}
      onContextMenu={(event) => {
        // A native browser menu over a page offers "Save image as…" for a
        // canvas the reader does not own and nothing about the document.
        // Presentation mode is the one place the page is not a document
        // surface, so leave the platform menu alone there.
        if (presentationActive) return;
        event.preventDefault();
        setReaderContextMenu({
          x: event.clientX,
          y: event.clientY,
          textAt: pageTextEditTargetAt(event.target, event.clientX, event.clientY),
        });
      }}
      onDoubleClick={onPageTextDoubleClick}
      onPointerDown={(e) => {
        // Click-away lets a picture selected in place go (its frame, tools
        // and the picture targets keep their own presses).
        if (
          nativePictureSelected &&
          !(e.target as Element | null)?.closest?.(
            "[data-pdf-native-picture-layer], [data-pdf-native-content-image-layer]",
          )
        ) {
          clearNativePictureSelection?.();
        }
        // Click-away deselects the placed-annotation frame. Presses on the
        // frame itself never bubble here (its drag stops propagation); the
        // closest() guard covers its delete button for safety.
        if (!selectedPlaced && !selectedNativeVectorSelection) return;
        const target = e.target as Element | null;
        if (target?.closest?.("[data-pdf-annotation-frame]")) return;
        if (
          target?.closest?.("[data-pdf-native-content-vector-layer]") &&
          
          !target.closest("[data-pdf-native-vector-blocked]")
        ) {
          return;
        }
        clearPlacedAnnotationSelection();
        if (selectedNativeVectorSelection) {
          // Clicked away: a write still saving selects nothing again.
          nativeVectorUserSelectionEpochRef.current += 1;
        }
        setSelectedNativeVectorSelection(null);
    setExtraNativeVectorSelections([]);
      }}
      onClickCapture={(e) => {
        // A real pan drag must not double as a click (link follow,
        // presentation advance). The flag is armed on pan end and cleared
        // on the very next pointerdown.
        if (panSuppressClickRef.current) {
          panSuppressClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        // Presentation mode: click pages forward, Shift+click back
        // (pdf.js convention). Interactive targets keep their own clicks.
        if (!presentationActive) return;
        const target = e.target as Element | null;
        if (target && isPanIgnoredTarget(target)) return;
        // A finger has no Shift: a tap on the left third goes back, as in
        
        const bounds = e.currentTarget.getBoundingClientRect();
        const tapBack =
          isCompatMouseFromTouch(e.nativeEvent) &&
          e.clientX < bounds.left + bounds.width / 3;
        const to =
          e.shiftKey || tapBack ? previousVisibleOrdinal : nextVisibleOrdinal;
        if (to != null) goToVisibleOrdinal(to);
      }}
    >
      {pdfDoc || activeTextSourceHandoff || sameDocumentReloading ? (
        visiblePageItems.flatMap((item, itemIndex) => {
          // Spread (facing-pages) mode lays two pages per row. We render the
          // same flat list but inject a zero-size, full-width line-break
          // BEFORE every page that starts a row (the left page of a pair) so
          // the pairing is deterministic at any zoom — `isSpreadRowStart` is
          // the single source of truth. flatMap flattens the [break?, node].
          const rowBreak =
            viewMode === "spread" &&
            itemIndex > 0 &&
            isSpreadRowStart(itemIndex, visiblePageItems.length) ? (
              <div
                key={`spread-break-${itemIndex}`}
                className="pdf-viewer__spread-break"
                aria-hidden
              />
            ) : null;
          if (item.kind === "inserted") {
            const visibleOrdinal = itemIndex + 1;
            const hidden =
              viewMode === "single" &&
              visibleOrdinal !== currentVisibleOrdinal;
            const copyOf = item.page.copyOfPage;
            return [
              rowBreak,
              <div
                key={`inserted-${item.page.id}`}
                ref={(el) => {
                  if (el) visibleItemRefs.current.set(visibleOrdinal, el);
                  else visibleItemRefs.current.delete(visibleOrdinal);
                }}
                data-inserted-page-id={item.page.id}
                data-visible-page-ordinal={visibleOrdinal}
                data-copy-of-page={copyOf ?? undefined}
                className={`pdf-viewer__page pdf-viewer__page--inserted${
                  copyOf ? " pdf-viewer__page--duplicate" : ""
                }`}
                style={{
                  width: item.page.width * scale,
                  height: item.page.height * scale,
                  background: "#fff",
                  boxShadow: "0 1px 8px rgba(15, 23, 42, 0.16)",
                  display: hidden ? "none" : "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.page.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a page drawn in this tab
                  <img
                    src={item.page.image}
                    alt=""
                    draggable={false}
                    data-testid="pdf-held-imported-page"
                    style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                  />
                ) : null}
                {copyOf ? (
                  <span
                    className="pdf-viewer__duplicate-label"
                    data-testid="pdf-duplicate-page-label"
                    style={{
                      color: "#64748b",
                      fontSize: 13,
                      textAlign: "center",
                      padding: 12,
                    }}
                  >
                    {t("pdfViewer.duplicatePageLabel", { page: copyOf })}
                  </span>
                ) : null}
              </div>,
            ];
          }
          const page = item.page;
          if (
            fullPageBand &&
            (itemIndex + 1 < fullPageBand.first || itemIndex + 1 > fullPageBand.last) &&
            !heldPageFrames?.has(page.pageNumber) &&
            !heldReplacedPages?.has(page.pageNumber)
          ) {
            return [
              rowBreak,
              lightPageElement(page, itemIndex, viewMode === "single" && itemIndex + 1 !== currentVisibleOrdinal),
            ];
          }
          const pageHighlights =
            highlightsByPage.get(page.pageNumber) ?? EMPTY_HIGHLIGHTS;
          const pageNativeSourceTextMarkups =
            renderedNativeSourceTextMarkups.get(page.pageNumber) ??
            EMPTY_RENDERED_NATIVE_TEXT_MARKUPS;
          const pageNativeSourceTextNotes =
            renderedNativeSourceTextNotes.get(page.pageNumber) ??
            EMPTY_RENDERED_NATIVE_TEXT_NOTES;
          const pageNotes = notesByPage.get(page.pageNumber) ?? EMPTY_NOTES;
          const pageInks = inksByPage.get(page.pageNumber) ?? EMPTY_INKS;
          const pageNativeInkStrokes =
            nativeInkStrokesByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_INK_STROKES;
          const pageNativeSourceInkStrokes =
            nativeSourceInkStrokesByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_SOURCE_INK_STROKES;
          const pageNativeImageOverlays =
            nativeImageOverlaysByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_IMAGE_OVERLAYS;
          const pageLinks =
            linkAnnotations.get(page.pageNumber) ?? EMPTY_LINKS;
          const pageFormFields =
            effectiveFormFields.get(page.pageNumber) ?? EMPTY_FORM_FIELDS;
          const pageFreshNativeVectorRoutes =
            semanticAppearanceSelectionEvidenceActive
              ? (nativeVectorSelectionRoutesByPage.get(page.pageNumber) ??
                EMPTY_NATIVE_VECTOR_SELECTION_ROUTES)
              : EMPTY_NATIVE_VECTOR_SELECTION_ROUTES;
          // While a save's revision is read, the shapes it did not touch stay
          // clickable on their previous routes (found again in the new ones).
          // (Offered whenever Edit Content is on: the session that proved
          // them is the one being replaced.)
          const pageStaleNativeVectorRoutes = semanticEditSelectionActive
            ? (staleNativeVectorRoutesByPage.get(page.pageNumber) ?? EMPTY_NATIVE_VECTOR_SELECTION_ROUTES)
            : EMPTY_NATIVE_VECTOR_SELECTION_ROUTES;
          // A tool that places or draws on the page is armed: its click lands
          // where it is made, over a shape or a picture too (WPS).
          const pagePlacingToolArmed = Boolean(addTextMode || noteMode || drawMode || signMode || armedStamp ||
            redactMode || shapeMode || linkMode || snapshotMode || measureMode || eraseTool.armed || attachMode);
          const pageNativeVectorSelectionRoutes =
            pageStaleNativeVectorRoutes.length === 0
              ? pageFreshNativeVectorRoutes
              : [
                  ...pageFreshNativeVectorRoutes,
                  ...pageStaleNativeVectorRoutes.filter(
                    (stale) =>
                      !pageFreshNativeVectorRoutes.some(
                        (fresh) => fresh.rendererOperatorIndex === stale.rendererOperatorIndex,
                      ),
                  ),
                ];
          const pageNativeImageTargets =
            semanticAppearanceSelectionEvidenceActive &&
            (onNativeImageActivate || nativePictureSelectable)
              ? (nativeImageTargetsByPage.get(page.pageNumber) ??
                EMPTY_NATIVE_IMAGE_TARGETS)
              : EMPTY_NATIVE_IMAGE_TARGETS;
          const pageDrawingStroke =
            drawingStroke && drawingStroke.page === page.pageNumber
              ? drawingStroke
              : null;
          const pagePendingNote =
            pendingNote && pendingNote.page === page.pageNumber
              ? pendingNote
              : null;
          const activeNote =
            activeNoteId != null
              ? (pageNotes.find((n) => n.id === activeNoteId) ?? null)
              : null;
          const pageSignatures =
            signaturesByPage.get(page.pageNumber) ?? EMPTY_SIGNATURES;
          const pagePendingSignature =
            pendingSignature && pendingSignature.page === page.pageNumber
              ? pendingSignature
              : null;
          const pageStamps =
            stampsByPage.get(page.pageNumber) ?? EMPTY_STAMPS;
          const pageNativeSourceStamps =
            nativeSourceStampsByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_SOURCE_STAMPS;
          const pageNativeSourceFreeTexts =
            nativeSourceFreeTextsByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_SOURCE_FREE_TEXTS;
          const pageRedactions =
            redactionsByPage.get(page.pageNumber) ?? EMPTY_REDACTIONS;
          // The live drag-rectangle for THIS page (preview before persist),
          // normalized into a top-left box so the preview matches the saved
          // box. Null when not drawing on this page.
          const pageDrawingRedaction =
            drawingRedaction && drawingRedaction.page === page.pageNumber
              ? normalizeRedactionDrag(
                  drawingRedaction.start,
                  drawingRedaction.current,
                )
              : null;
          const pageShapes =
            shapesByPage.get(page.pageNumber) ?? EMPTY_SHAPES;
          const pageNativeSourceShapes =
            nativeSourceShapesByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_SOURCE_SHAPES;
          // A tool that places by clicking the page (note, attachment,
          // signature, stamp) owns every click on it, inside an existing
          // shape too: the shape's hit box must not turn "add a note
          
          const placementToolArmed =
            noteMode || attachMode || signMode || Boolean(armedStamp);
          // The live shape geometry for THIS page (preview before persist),
          // normalized for the active kind so the preview matches the save.
          const pageDrawingShape =
            drawingShape && drawingShape.page === page.pageNumber
              ? normalizeShapeDrag(
                  drawingShape.kind,
                  drawingShape.start,
                  drawingShape.current,
                )
              : null;
          const pagePolygonDraft =
            polygonDraft?.page === page.pageNumber
              ? polygonDraft.points
              : null;
          const pageLinkOverlays =
            linkOverlaysByPage.get(page.pageNumber) ?? EMPTY_LINK_OVERLAYS;
          const pageNativeSourceLinks =
            nativeSourceLinksByPage.get(page.pageNumber) ??
            EMPTY_NATIVE_SOURCE_LINKS;
          const pageEditableLinkTargets = [
            ...pageLinkOverlays.map((overlay) => ({
              overlay,
              sourceId: null as string | null,
              sourceObjectRef: null as string | null,
            })),
            ...pageNativeSourceLinks.map((overlay) => ({
              overlay,
              sourceId: overlay.id,
              sourceObjectRef: overlay.nativeSource.objectRef,
            })),
          ];
          // A box made here and not yet painted is the authoring layer's to
          // draw (it holds its caret); drawn by the view layer as well it was
          // two copies of every word typed into it, a few pixels apart
          
          const pageTextBoxViewOverlays = filterAuthoredTextBoxViewOverlays(
            textBoxViewOverlaysByPage.get(page.pageNumber) ?? EMPTY_TEXT_BOX_VIEW_OVERLAYS,
            textBoxAuthoring?.edits,
            page.pageNumber - 1,
          );
          // The text boxes, tables and charts the reader draws itself, stacked
          // as the page's /Annots paints them (one made here and not yet
          // saved on top, as the writer appends it).
          const pageAnnotationStackRanks = annotationStackRanksFor(page.pageNumber, [
            annotationStackOrderByPage?.get(page.pageNumber),
            chartAuthoring?.charts,
            tableAuthoring?.tables,
            textBoxAuthoring?.edits,
            pageShapes,
            pageNativeSourceShapes,
            pageInks,
            pageNativeSourceInkStrokes,
            pageStamps,
            pageNativeSourceStamps,
            pageNativeSourceFreeTexts,
          ], () => pdfAnnotationStackRanks(
            annotationStackOrderByPage?.get(page.pageNumber),
            [
              ...(chartAuthoring?.charts ?? [])
                .filter((chart) => chart.page === page.pageNumber)
                .map((chart) => ({ kind: chart.kind === "smartart" ? "smartart" as const : "chart" as const, id: chart.id })),
              ...(tableAuthoring?.tables ?? [])
                .filter((table) => table.page === page.pageNumber)
                .map((table) => ({ kind: "table" as const, id: table.id })),
              ...(textBoxAuthoring?.edits ?? [])
                .filter((edit) => edit.page === page.pageNumber - 1 && edit.created && !edit.deleted)
                .map((edit) => ({ kind: "textbox" as const, id: edit.id })),
              ...pageShapes.map((shape) => ({ kind: "shape" as const, id: shape.id })),
              ...pageNativeSourceShapes.map((shape) => ({ key: `nshape:${shape.id}`, ref: shape.nativeSource.objectRef })),
              ...pageInks.map((stroke) => ({ kind: "ink" as const, id: stroke.id })),
              ...pageNativeSourceInkStrokes.map((stroke) => ({ key: `nink:${stroke.id}`, ref: stroke.nativeSource.objectRef })),
              ...pageStamps.map((stamp) => ({ kind: "stamp" as const, id: stamp.id })),
              ...pageNativeSourceStamps.map((stamp) => ({ key: `nstamp:${stamp.id}`, ref: stamp.nativeSource.objectRef })),
              ...pageNativeSourceFreeTexts.map((box) => ({ key: `nfreetext:${box.id}`, ref: box.nativeSource.objectRef })),
            ],
          ));
          // Where a click target of a shape, a stroke or a stamp stands in
          // the page's annotation stack (one with no place yet: in front).
          const annotationHitZ = (key: string) =>
            pdfAnnotationStackZIndex(pageAnnotationStackRanks.get(key) ?? pageAnnotationStackRanks.size);
          const annotationHitSvgStyle = (key: string): CSSProperties => ({
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: annotationHitZ(key),
          });
          const pageLineNumbers =
            lineNumbersByPage.get(page.pageNumber) ?? [];
          // Live link rect (preview before the destination editor opens),
          // normalized to a top-left box so the preview matches the saved one.
          const pageDrawingLink =
            drawingLink && drawingLink.page === page.pageNumber
              ? {
                  x: Math.min(drawingLink.start.x, drawingLink.current.x),
                  y: Math.min(drawingLink.start.y, drawingLink.current.y),
                  width: Math.abs(
                    drawingLink.current.x - drawingLink.start.x,
                  ),
                  height: Math.abs(
                    drawingLink.current.y - drawingLink.start.y,
                  ),
                }
              : null;
          // Live snapshot marquee for THIS page (preview before the crop).
          const pageDrawingSnapshot =
            drawingSnapshot && drawingSnapshot.page === page.pageNumber
              ? {
                  x: Math.min(
                    drawingSnapshot.start.x,
                    drawingSnapshot.current.x,
                  ),
                  y: Math.min(
                    drawingSnapshot.start.y,
                    drawingSnapshot.current.y,
                  ),
                  width: Math.abs(
                    drawingSnapshot.current.x - drawingSnapshot.start.x,
                  ),
                  height: Math.abs(
                    drawingSnapshot.current.y - drawingSnapshot.start.y,
                  ),
                }
              : null;
          // Released snapshot region on THIS page with the pending "copy
          // as LaTeX" offer chip / transcribe popover anchored to it.
          const pageSnapshotLatex =
            snapshotLatex && snapshotLatex.page === page.pageNumber
              ? {
                  mode: snapshotLatex.mode,
                  translate: snapshotLatex.translate,
                  imageB64: snapshotLatex.imageB64,
                  textAuthority: snapshotLatex.textAuthority,
                  textAvailable:
                    capturePdfOcrDocumentAuthority(page.pageNumber) !== null,
                  x: Math.min(
                    snapshotLatex.start.x,
                    snapshotLatex.current.x,
                  ),
                  y: Math.min(
                    snapshotLatex.start.y,
                    snapshotLatex.current.y,
                  ),
                  width: Math.abs(
                    snapshotLatex.current.x - snapshotLatex.start.x,
                  ),
                  height: Math.abs(
                    snapshotLatex.current.y - snapshotLatex.start.y,
                  ),
                }
              : null;
          const rotation = resolvedPageRotation(page.pageNumber);
          const rotated = rotation === 90 || rotation === 270;
          const displayedPageHeight =
            (rotated ? page.width : page.height) * scale;
          const displayedPageWidth =
            (rotated ? page.height : page.width) * scale;
          // A crop or size held for Save: the page keeps its own frame and
          // shows the held page through it (lib/pdf/held-page-frame).
          const heldFrame = heldPageFrames?.get(page.pageNumber) ?? null;
          const heldFrameLayout = heldFrame
            ? heldPageFrameLayout(heldFrame, displayedPageWidth, displayedPageHeight)
            : null;
          // The active measurement vertices on THIS page + its live readout.
          const pageMeasurePoints =
            measurePts && measurePts.page === page.pageNumber
              ? measurePts.points
              : null;
          // Clicks are captured in DISPLAYED-percent space, so feed the
          // displayed physical dimensions: a 90/270° rotation swaps the
          // page's width/height on screen.
          const pageMeasureResult = pageMeasurePoints
            ? measurePoints(
                measureKind,
                pageMeasurePoints,
                {
                  width: rotated ? page.height : page.width,
                  height: rotated ? page.width : page.height,
                },
                measureScale,
              )
            : null;
          const savedPageMeasurements = (
            measurementsByPage.get(page.pageNumber) ?? []
          ).map((measurement) => ({
            measurement,
            displayPoints: measurement.points.map((point) => {
              const displayed = rotateFractionPoint(
                { x: point.x / 100, y: point.y / 100 },
                rotation,
              );
              return { x: displayed.x * 100, y: displayed.y * 100 };
            }),
          }));
          // The selected placed annotation's move/resize frame on THIS
          // page (null when nothing is selected here). Deleting through
          // the frame routes to the SAME per-type delete handlers as the
          // legacy affordances.
          // The frames below move objects the page paints itself; this
          // makes the object follow its frame instead of staying put
          // until the write lands.
          // Where a placed object is while its frame is dragged and until
          // its write lands: overlays drawn by the reader follow this.
          const heldPlacedBox = (key: string, box: PercentBox): PercentBox =>
            nativeVectorDragGhost &&
            nativeVectorDragGhost.family === "placed" &&
            nativeVectorDragGhost.key === key &&
            nativeVectorDragGhost.pageNumber === page.pageNumber
              ? nativeVectorDragGhost.rect
              : // Another member's hand on it (pdfLiveTransform).
                pdfLive
                ? pdfLive.box(page.pageNumber, key, box)
                : box;
          // ...and how far its rotation handle has turned it meanwhile,
          // until `saved` (the object's own angle or points) holds it.
          const heldPlacedRotation = (
            key: string,
            saved: string,
            /** Where `saved` is remembered, when not under `key`. */
            slot: string = key,
          ): number => {
            if (
              !nativeVectorDragGhost ||
              nativeVectorDragGhost.family !== "placed" ||
              nativeVectorDragGhost.key !== key ||
              nativeVectorDragGhost.pageNumber !== page.pageNumber
            ) {
              // Another member turning it (pdfLiveTransform): the object
              // turns, this desk's own frame does not.
              return pdfLive && slot === key ? pdfLive.turn(page.pageNumber, key, saved) : 0;
            }
            if (nativeVectorDragGhost.rotation === 0) return 0;
            if (!nativeVectorDragGhost.settled) {
              placedTurnFromRef.current.set(slot, saved);
              return nativeVectorDragGhost.rotation;
            }
            const from = placedTurnFromRef.current.get(slot);
            return from === undefined || from === saved
              ? nativeVectorDragGhost.rotation
              : 0;
          };
          const heldShapeTransform = (shape: Parameters<typeof shapeBox>[0] & { id: string }) => {
            const from = shapeBox(shape);
            const to = heldPlacedBox(`shape:${shape.id}`, from);
            if (to === from) return undefined;
            // A line's box has no extent on one axis: move it, do not scale.
            const sx = from.width > 0 ? to.width / from.width : 1;
            const sy = from.height > 0 ? to.height / from.height : 1;
            return `translate(${to.x} ${to.y}) scale(${sx} ${sy}) translate(${-from.x} ${-from.y})`;
          };
          const forgetWaitingPlacedDelete = (key: string) => {
            if (placedFrameCommandsRef.current.get(key)?.command.kind === "delete") {
              placedFrameCommandsRef.current.delete(key);
            }
            const hold = placedDeleteHoldRef.current;
            if (hold?.waiting?.key === key) hold.waiting = null;
          };
          const withCanvasObjectGhost = (frame: ReactNode, key: string | null) => {
            if (!key || !isValidElement<PdfAnnotationFrameProps>(frame)) return frame;
            // The object lifted (dropped and not yet landed): its frame
            // stands at its pose, and takes the next gesture at once.
            const lifted =
              nativeVectorDragGhost?.lift?.kind === "placed" &&
              nativeVectorDragGhost.key === key &&
              nativeVectorDragGhost.pageNumber === page.pageNumber
                ? nativeVectorDragGhost.lift
                : null;
            const saving = Boolean(frame.props.busy);
            const shownRect = lifted ? lifted.pose.rect : frame.props.rect;
            placedLiftCommitRef.current.set(key, frame.props.onCommit);
            const onDelete = frame.props.onDelete;
            placedFrameHandlersRef.current.set(key, {
              saving,
              onDelete,
              onRotate: frame.props.onRotate,
            });
            return cloneElement(frame, {
              rect: shownRect,
              // Busy with this object's own save: the next gesture is
              // lifted and written after it, not ignored.
              busy: saving && !lifted,
              // Deleting waits for the save, and is carried out after it.
              ...(onDelete
                ? {
                    onDelete: () => {
                      if (placedFrameHandlersRef.current.get(key)?.saving ?? saving) {
                        placedFrameCommandsRef.current.set(key, { at: Date.now(), command: { kind: "delete" } });
                        // The viewer's own key listener leaves the selection.
                        if (placedDeleteHoldRef.current) placedDeleteHoldRef.current.frameHeldKey = key;
                        return;
                      }
                      onDelete();
                    },
                  }
                : {}),
              onShown: (shown: PercentBox) =>
                prewarmPlacedObjectLayers(page.pageNumber, key, shown),
              onPreview: (preview: PercentBox | null, start: PercentBox) => {
                if (preview) forgetWaitingPlacedDelete(key);
                previewPlacedObjectGesture(page.pageNumber, key, preview, start);
                // The others see the object go with the hand.
                pdfLive?.publish(page.pageNumber, key, preview);
              },
              onCommit: (box: PercentBox) => {
                if (nativeVectorDragGhostRef.current?.key !== key) {
                  // No stage could carry it: written as it stands, after
                  // the object's own save when one runs (it was dropped).
                  if (placedFrameHandlersRef.current.get(key)?.saving ?? saving) {
                    placedFrameCommandsRef.current.set(key, { at: Date.now(), command: { kind: "move", box } });
                    return;
                  }
                  frame.props.onCommit(box);
                  return;
                }
                // Lifted at the drop; the writer above writes it.
                settleCanvasObjectGesture(
                  page.pageNumber,
                  { kind: "fit", from: shownRect, to: box },
                  { kind: "placed", epoch: -1, write: false },
                );
              },
              ...canvasObjectRotationGhostProps(frame.props, key, saving),
            });
          };
          // A frame with a rotation handle turns the ghost with it; once
          // let go the frame keeps the committed angle until the write's
          // own model follows. The ghost turns relative to the angle the
          // page already paints the object at.
          const canvasObjectRotationGhostProps = (
            props: PdfAnnotationFrameProps,
            key: string,
            saving = false,
          ): Partial<PdfAnnotationFrameProps> => {
            const onRotate = props.onRotate;
            if (!onRotate) return {};
            const startRotation = props.rotation ?? 0;
            const frameTurn = heldPlacedRotation(
              key,
              `${startRotation}|${props.rect.x},${props.rect.y},${props.rect.width},${props.rect.height}`,
              `frame:${key}`,
            );
            const settledTurn =
              nativeVectorDragGhost?.settled && frameTurn !== 0
                ? frameTurn
                : null;
            return {
              rotation:
                settledTurn === null
                  ? props.rotation
                  : normalizeRotationDegrees(startRotation + settledTurn),
              onRotatePreview: (rotation: number | null, start: PercentBox) => {
                const turn =
                  rotation === null
                    ? null
                    : normalizeRotationDegrees(rotation - startRotation);
                if (turn !== null) forgetWaitingPlacedDelete(key);
                previewPlacedObjectRotation(page.pageNumber, key, turn, start);
                pdfLive?.publish(page.pageNumber, key, turn === null ? null : start, turn ?? 0);
              },
              onRotate: (rotation: number) => {
                const held = nativeVectorDragGhostRef.current;
                if (held?.key === key && !held.settled) {
                  settleCanvasObjectGesture(
                    page.pageNumber,
                    {
                      kind: "turn",
                      from: held.gesture?.from ?? held.origin,
                      degrees: normalizeRotationDegrees(rotation - startRotation),
                    },
                    { kind: "placed", epoch: -1, write: false },
                  );
                }
                // A turn let go during the object's own save stands as it
                // was let go and is written when that save ends (it went
                // back). The frame calls this as it was when the turn
                // began, so the save is read as it now is.
                const now = placedFrameHandlersRef.current.get(key);
                if (now?.saving ?? saving) {
                  placedFrameCommandsRef.current.set(key, { at: Date.now(), command: { kind: "turn", rotation } });
                  return;
                }
                (now?.onRotate ?? onRotate)(rotation);
              },
            };
          };
          let placedFrame: ReactNode = null;
          if (selectedPlaced?.kind === "shape") {
            const s = pageShapes.find((sh) => sh.id === selectedPlaced.id);
            if (s) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={shapeBox(s)}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={shapeSaving}
                  onCommit={(box) => void handleShapeTransform(s.id, box)}
                  onDelete={() => void handleShapeDelete(s.id)}
                />
              );
            }
          } else if (selectedPlaced?.kind === "nativeSourceShape") {
            const sourceShape = pageNativeSourceShapes.find(
              (shape) => shape.id === selectedPlaced.id,
            );
            if (sourceShape) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={shapeBox(sourceShape)}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={nativeSourceShapeSaving}
                  onCommit={(box) =>
                    void handleNativeSourceShapeTransform(
                      sourceShape.id,
                      box,
                    )
                  }
                  onDelete={() =>
                    void handleNativeSourceShapeDelete(sourceShape.id)
                  }
                />
              );
            }
          } else if (selectedPlaced?.kind === "signature") {
            const s = pageSignatures.find(
              (sg) => sg.id === selectedPlaced.id,
            );
            if (s) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={{
                    x: s.x,
                    y: s.y,
                    width: s.width,
                    height: s.height,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={signSaving}
                  onCommit={(box) =>
                    void handleSignatureTransform(s.id, box)
                  }
                  rotation={normalizeSignatureObjectRotation(
                    s.objectRotation,
                  )}
                  onRotate={(rotation) =>
                    void handleSignatureTransform(
                      s.id,
                      {
                        x: s.x,
                        y: s.y,
                        width: s.width,
                        height: s.height,
                      },
                      rotation,
                    )
                  }
                  onDelete={() => void handleSignatureDelete(s.id)}
                />
              );
            }
          } else if (selectedPlaced?.kind === "stamp") {
            const s = pageStamps.find((st) => st.id === selectedPlaced.id);
            if (s) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={{
                    x: s.x,
                    y: s.y,
                    width: s.width,
                    height: s.height,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={stampSaving}
                  onCommit={(box) => void handleStampTransform(s.id, box)}
                  onDelete={() => void handleStampDelete(s.id)}
                />
              );
            }
          } else if (selectedPlaced?.kind === "nativeSourceStamp") {
            const sourceStamp = pageNativeSourceStamps.find(
              (stamp) => stamp.id === selectedPlaced.id,
            );
            if (sourceStamp) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={{
                    x: sourceStamp.x,
                    y: sourceStamp.y,
                    width: sourceStamp.width,
                    height: sourceStamp.height,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={nativeSourceStampSaving}
                  onCommit={(box) =>
                    void handleNativeSourceStampTransform(
                      sourceStamp.id,
                      box,
                    )
                  }
                  onDelete={() =>
                    void handleNativeSourceStampDelete(sourceStamp.id)
                  }
                />
              );
            }
          } else if (selectedPlaced?.kind === "nativeSourceFreeText") {
            const freeText = pageNativeSourceFreeTexts.find(
              (box) => box.id === selectedPlaced.id,
            );
            if (freeText) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={{
                    x: freeText.x * 100,
                    y: freeText.y * 100,
                    width: freeText.width * 100,
                    height: freeText.height * 100,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={nativeSourceFreeTextSaving}
                  onCommit={(box) =>
                    void handleNativeSourceFreeTextTransform(freeText.id, box)
                  }
                  onDelete={() =>
                    void handleNativeSourceFreeTextDelete(freeText.id)
                  }
                  {...(onNativeSourceFreeTextEdit
                    ? { onEditContent: () => onNativeSourceFreeTextEdit(freeText.id) }
                    : {})}
                />
              );
            }
          } else if (selectedPlaced?.kind === "measurement") {
            const selectedMeasurement = savedPageMeasurements.find(
              ({ measurement }) => measurement.id === selectedPlaced.id,
            );
            const box = selectedMeasurement
              ? measurementPointBox(selectedMeasurement.displayPoints)
              : null;
            if (selectedMeasurement && box) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={box}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={measurementSaving}
                  onCommit={(next) =>
                    void handleMeasurementTransform(
                      selectedMeasurement.measurement.id,
                      next,
                    )
                  }
                  rotation={0}
                  onRotate={(rotationDegrees) =>
                    void handleMeasurementTransform(
                      selectedMeasurement.measurement.id,
                      box,
                      rotationDegrees,
                    )
                  }
                  onDelete={() =>
                    void handleMeasurementDelete(
                      selectedMeasurement.measurement.id,
                    )
                  }
                />
              );
            }
          } else if (selectedPlaced?.kind === "nativeInk") {
            const stroke = pageNativeSourceInkStrokes.find(
              (item) => item.id === selectedPlaced.id,
            );
            if (stroke) {
              const grouped = pageNativeSourceInkStrokes.filter(
                (item) =>
                  item.nativeSource.objectRef ===
                  stroke.nativeSource.objectRef,
              );
              const points = grouped.flatMap((item) => item.points);
              const xs = points.filter((_, index) => index % 2 === 0);
              const ys = points.filter((_, index) => index % 2 === 1);
              const box = {
                x: Math.min(...xs) * 100,
                y: Math.min(...ys) * 100,
                width: (Math.max(...xs) - Math.min(...xs)) * 100,
                height: (Math.max(...ys) - Math.min(...ys)) * 100,
              };
              placedFrame = (
                <PdfAnnotationFrame
                  rect={box}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={nativeSourceInkSaving}
                  onCommit={(next) =>
                    void onNativeSourceInkTransform?.(stroke.id, next)
                  }
                  onDelete={() => void handleNativeSourceInkDelete(stroke.id)}
                  testId="pdf-native-source-ink-selection-frame"
                />
              );
            }
          } else if (selectedPlaced?.kind === "redaction") {
            const r = pageRedactions.find(
              (rd) => rd.id === selectedPlaced.id,
            );
            if (r) {
              placedFrame = (
                <PdfAnnotationFrame
                  rect={{
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  busy={redactSaving}
                  onCommit={(box) =>
                    void handleRedactionTransform(r.id, box)
                  }
                  onDelete={() => void handleRedactionDelete(r.id)}
                />
              );
            }
          }
          const selectedFormFieldFrame =
            selectedFormFieldContext?.page === page.pageNumber &&
            selectedFormFieldContext.widgetGeometry !== null &&
            !selectedFormFieldContext.geometryDisabledReason &&
            (existingTextFieldEditMode ||
              selectedFormFieldContext.semanticRoute ||
              (formFieldContextBaseTabRef.current === "edit" &&
                !panMode &&
                !panToolArmed &&
                !formMode)) ? (
              <PdfAnnotationFrame
                rect={{
                  x: selectedFormFieldContext.field.percent.x,
                  y: selectedFormFieldContext.field.percent.y,
                  width: selectedFormFieldContext.field.percent.width,
                  height: selectedFormFieldContext.field.percent.height,
                }}
                pageWidth={displayedPageWidth}
                pageHeight={displayedPageHeight}
                minWidth={1}
                minHeight={1}
                busy={existingTextFieldEditBusy}
                onCommit={(box) =>
                  void handleSelectedFormFieldTransform(box)
                }
                onDelete={() => undefined}
                showDelete={false}
                testId="pdf-form-field-selection-frame"
              />
            ) : null;
          const selectedLinkFrame =
            linkMode &&
            selectedLinkContext?.overlay.page === page.pageNumber &&
            (selectedLinkContext.sourceId
              ? nativeSourceLinkTransformRef.current !== undefined
              : managedLinkUpsertRef.current !== undefined) ? (
              <PdfAnnotationFrame
                rect={{
                  x: selectedLinkContext.overlay.x,
                  y: selectedLinkContext.overlay.y,
                  width: selectedLinkContext.overlay.width,
                  height: selectedLinkContext.overlay.height,
                }}
                pageWidth={displayedPageWidth}
                pageHeight={displayedPageHeight}
                minWidth={0.5}
                minHeight={0.5}
                busy={linkSaving}
                onCommit={(box) => void handleSelectedLinkTransform(box)}
                onDelete={() => void deleteSelectedLinkContext()}
                testId="pdf-link-selection-frame"
              />
            ) : null;
          const selectedNativeVectorRoute =
            selectedNativeVectorSelection?.pageNumber === page.pageNumber &&
            pageNativeVectorSelectionRoutes.some((route) =>
              sameNativeVectorSelectionRoute(
                route,
                selectedNativeVectorSelection,
              ),
            )
              ? selectedNativeVectorSelection
              : null;
          const nativeVectorPageGeometry = nativeVectorPageGeometryFor(
            page.pageNumber,
            selectedNativeVectorRoute?.sourceSha256,
          );
          // The selected shape's frame, as WPS measures it: its whole path
          // (past the page edge too) grown by half its stroke. The frame,
          // the gesture's start and the ribbon's size all stand on it.
          const nativeVectorPagePointSize = nativeVectorPagePoints(
            nativeVectorPageGeometry,
            page.userUnit ?? 1,
          );
          const pageVisibleVectors = visibleVectorsByPageRef.current.get(page.pageNumber);
          const selectedNativeVectorFrameBox = selectedNativeVectorRoute
            ? nativeVectorFrameBounds(
                selectedNativeVectorRoute,
                pageVisibleVectors,
                nativeVectorPagePointSize,
              )
            : null;
          const selectedNativeVectorFrameStart: PercentBox | null =
            selectedNativeVectorFrameBox
              ? {
                  x: selectedNativeVectorFrameBox.x * 100,
                  y: selectedNativeVectorFrameBox.y * 100,
                  width: selectedNativeVectorFrameBox.width * 100,
                  height: selectedNativeVectorFrameBox.height * 100,
                }
              : null;
          /** Write the box a gesture left the shape in; `from` is the frame
           * the gesture started on (both page percent). */
          // The selected shape lifted (浮起): its frame stands where the lift
          // shows it, whatever revision the page or the selection is on,
          // and every gesture on it is lifted and queued for the lift's
          // writer -- none is held, refused or lost while a save is on its
          
          const selectedVectorLift =
            nativeVectorDragGhost?.lift?.kind === "vector" &&
            nativeVectorDragGhost.pageNumber === page.pageNumber &&
            nativeVectorDragGhost.lift.epoch === nativeVectorUserSelectionEpochRef.current
              ? nativeVectorDragGhost
              : null;
          // Lifted before its pixels were in hand (a key nudge, layers still
          // being rendered): the page still draws it where it last painted
          // it, and its frame stands there with it.
          const selectedVectorLiftHasPixels = Boolean(
            selectedVectorLift && (selectedVectorLift.layers || selectedVectorLift.model || selectedVectorLift.crop),
          );
          // A source vector's frame turns with it (PowerPoint, WPS): the
          // lift's own box at the angle it shows, not the box around it.
          const selectedVectorLiftPose = selectedVectorLift?.lift
            ? selectedVectorLiftHasPixels ? selectedVectorLift.lift.pose : selectedVectorLift.lift.drawn
            : null;
          const selectedVectorLiftFrame = selectedVectorLiftPose ? selectedVectorLiftPose.rect : null;
          // Not lifted: a slanted line, or a shape turned in this session,
          // stands in its own turned frame.
          const selectedNativeVectorTurnedFrame =
            !selectedVectorLiftPose && selectedNativeVectorRoute && !nativeVectorVertexEditing
              ? nativeVectorTurnedFrameFor(selectedNativeVectorRoute)
              : null;
          const selectedNativeVectorFrameTurn = selectedVectorLiftPose
            ? normalizeRotationDegrees((selectedVectorLift?.base ?? 0) + selectedVectorLiftPose.rotation)
            : selectedNativeVectorTurnedFrame
              ? normalizeRotationDegrees(selectedNativeVectorTurnedFrame.rotation)
              : 0;
          const selectedNativeVectorFrameTurned = Math.abs(selectedNativeVectorFrameTurn % 360) > 1e-6;
          /** The turn between where the frame stands and an angle it shows. */
          const relativeVectorTurn = (rotation: number) => {
            const turn = normalizeRotationDegrees(rotation - selectedNativeVectorFrameTurn);
            return turn > 180 ? turn - 360 : turn;
          };
          // A straight line lying along an axis wears WPS's line chrome: its
          // frame hugs its thickness, a dot at each end resizes it along its
          // length and a capsule at its middle takes its thickness (a drag
          // across it scales the line with its stroke into a bar, as WPS
          // does, and never slants it). A slanted line is a box with its
          // eight grips, scaled as a box. Moving an end anywhere is Edit
          // Points' job.
          const selectedNativeVectorLineAxis =
            selectedNativeVectorRoute && !nativeVectorVertexEditing
              ? nativeVectorStraightLineAxis(
                  selectedNativeVectorRoute,
                  pageVisibleVectors,
                  nativeVectorPagePointSize,
                )
              : null;
          const selectedNativeVectorFrameRect: PercentBox | null =
            selectedVectorLiftFrame ?? selectedNativeVectorTurnedFrame?.rect ?? selectedNativeVectorFrameStart;
          /** A gesture let go on the selected shape: lifted at its new pose
           * and queued for the lift's writer. */
          const liftNativeVectorGesture = (
            change:
              | { kind: "fit"; from: PercentBox; to: MirrorablePercentBox }
              | { kind: "turn"; from: PercentBox; degrees: number },
          ) => {
            const key = selectedVectorLift?.key ??
              (selectedNativeVectorRoute ? nativeVectorSelectionKey(selectedNativeVectorRoute) : null);
            if (!key) return;
            settleCanvasObjectGesture(page.pageNumber, change, {
              ...(selectedNativeVectorFrameTurned && !selectedVectorLift ? { base: selectedNativeVectorFrameTurn } : {}),
              kind: "vector",
              epoch: nativeVectorUserSelectionEpochRef.current,
              target: selectedVectorLift?.lift?.target ?? selectedNativeVectorRoute ?? null,
              write: true,
              key,
              family: "vector",
            });
          };
          // A dragged source vector is drawn by the page canvas, where it
          // was, until its stage can show it (the page's layers, or its
          // model, are still being rendered): its frame waits there with it.
          const nativeVectorContentHeldAt = (key: string): PercentBox | null => {
            const ghost = nativeVectorDragGhost;
            return ghost &&
              !ghost.lift &&
              ghost.family === "vector" &&
              ghost.key === key &&
              ghost.pageNumber === page.pageNumber &&
              !ghost.layers &&
              !ghost.model &&
              !ghost.crop
              ? ghost.origin
              : null;
          };
          if (
            selectedNativeVectorFrameRect && !selectedNativeVectorFrameTurned && !nativeVectorVertexEditing &&
            extraNativeVectorSelections.length === 0 && (selectedVectorLift || selectedNativeVectorRoute)
          ) {
            const frameRect = selectedNativeVectorFrameRect;
            const flipKey = selectedVectorLift?.key ??
              (selectedNativeVectorRoute ? nativeVectorSelectionKey(selectedNativeVectorRoute) : "");
            (nativeVectorFrameFlipRef as { current: unknown }).current = {
              key: flipKey,
              flip: (axis: "horizontal" | "vertical") => {
                const to: MirrorablePercentBox = axis === "horizontal"
                  ? { ...frameRect, mirrorX: true } : { ...frameRect, mirrorY: true };
                if (selectedVectorLift || !selectedNativeVectorRoute) {
                  previewLiftedGesture(page.pageNumber, to, frameRect);
                } else {
                  previewNativeVectorGesture(page.pageNumber, selectedNativeVectorRoute, to, frameRect,
                    nativeVectorPageGeometry);
                }
                liftNativeVectorGesture({ kind: "fit", from: frameRect, to });
                return true;
              },
            };
          } else if (
            selectedNativeVectorRoute &&
            nativeVectorFrameFlipRef.current?.key === nativeVectorSelectionKey(selectedNativeVectorRoute)
          ) {
            // A turned frame (or points being edited) is flipped by its write.
            (nativeVectorFrameFlipRef as { current: unknown }).current = null;
          }
          const selectedNativeVectorFrame =
            selectedNativeVectorFrameRect &&
            (selectedVectorLift ||
              (selectedNativeVectorRoute &&
                (nativeVectorPageGeometry || pageStaleNativeVectorRoutes.includes(selectedNativeVectorRoute)))) &&
            extraNativeVectorSelections.length === 0 &&
            onNativeVectorGeometryCommit ? (
              <div
                data-capability-id="PDF-EDT-OBJECT-01"
                data-control-id="PDFCTL.PAGE.VECTOR.GEOMETRY"
                data-disabled-reason={
                  nativeVectorGeometryDisabledReason ??
                  nativeVectorRouteStaleReason
                }
                data-lifted={selectedVectorLift ? "true" : undefined}
                style={{ display: "contents" }}
              >
                <PdfAnnotationFrame
                  rect={selectedNativeVectorFrameRect}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  minWidth={0.01}
                  minHeight={0.01}
                  lineAxis={
                    selectedNativeVectorFrameTurned
                      ? selectedNativeVectorRoute?.nativeKind === "line" ? "horizontal" : undefined
                      : selectedNativeVectorLineAxis ?? undefined
                  }
                  // A turned frame resizes along its own axes.
                  transformBox={
                    selectedNativeVectorFrameTurned
                      ? (start, mode, dx, dy) =>
                          transformTurnedVectorFrame(start, mode, dx, dy, {
                            rotation: selectedNativeVectorFrameTurn,
                            pageWidth: displayedPageWidth,
                            pageHeight: displayedPageHeight,
                            minSide: 4,
                          })
                      : undefined
                  }
                  // A shape may be taken past the page edge, as in WPS, with
                  // a strip of it left on the page; the page hides the rest.
                  pageKeep={nativeVectorPageKeep(nativeVectorPagePointSize)}
                  // Only a lasting refusal (a read-only page) keeps the frame
                  // still; a save on its way never does: the gesture is
                  // lifted and written after it.
                  busy={
                    !selectedVectorLift &&
                    Boolean(nativeVectorGeometryDisabledReason) &&
                    !nativeVectorGeometryBusy &&
                    !nativeVectorWriteSettling &&
                    nativeVectorRouteIsCurrent
                  }
                  // A handle pulled across the opposite edge mirrors the
                  // shape, as in WPS.
                  mirrorable
                  onPreview={(preview, start) => {
                    if (selectedVectorLift || !selectedNativeVectorRoute) {
                      previewLiftedGesture(page.pageNumber, preview, start);
                      return;
                    }
                    previewNativeVectorGesture(
                      page.pageNumber,
                      selectedNativeVectorRoute,
                      preview,
                      start,
                      nativeVectorPageGeometry,
                      selectedNativeVectorFrameTurned ? selectedNativeVectorFrameTurn : undefined,
                    );
                  }}
                  contentRect={
                    selectedNativeVectorRoute && !selectedVectorLift
                      ? nativeVectorContentHeldAt(nativeVectorSelectionKey(selectedNativeVectorRoute))
                      : null
                  }
                  onCommit={(box) =>
                    liftNativeVectorGesture({ kind: "fit", from: selectedNativeVectorFrameRect, to: box })
                  }
                  rotation={selectedNativeVectorFrameTurn}
                  // The shape's own pixels turn with the handle, by the
                  // turn from the angle the frame stands at.
                  onRotatePreview={(rotation, start) => {
                    const turn = rotation === null ? null : relativeVectorTurn(rotation);
                    if (selectedVectorLift || !selectedNativeVectorRoute) {
                      previewLiftedRotation(page.pageNumber, turn, start);
                      return;
                    }
                    previewNativeVectorRotation(
                      page.pageNumber,
                      selectedNativeVectorRoute,
                      turn,
                      start,
                      nativeVectorPageGeometry,
                      selectedNativeVectorFrameTurned ? selectedNativeVectorFrameTurn : undefined,
                    );
                  }}
                  onRotate={(rotationDegrees) => {
                    const degrees = relativeVectorTurn(rotationDegrees);
                    if (Math.abs(degrees) < 1e-6) return;
                    liftNativeVectorGesture({
                      kind: "turn",
                      from: selectedNativeVectorFrameRect,
                      degrees,
                    });
                  }}
                  onDelete={() => runOrQueueNativeVectorCommand((run) => run.remove())}
                  deleteLabel={t("pdfShape.delete")}
                  showDelete={Boolean(onNativeVectorDeleteCommit)}
                  autoFocus
                  // WPS frames every object in 编辑内容 alike: a red
                  // hairline, round corner dots and edge capsules.
                  gripStyle="wps"
                  testId="pdf-native-vector-selection-frame"
                />
              </div>
            ) : null;
          // Vertex editing: a handle on each anchor in place of the frame.
          const nativeVectorVertexAnchors =
            nativeVectorVertexEditing &&
            selectedNativeVectorRoute &&
            nativeVectorPageGeometry &&
            extraNativeVectorSelections.length === 0 &&
            onNativeVectorGeometryCommit
              ? nativeVectorDisplayAnchors(
                  selectedNativeVectorRoute,
                  visibleVectorsByPageRef.current.get(page.pageNumber),
                )
              : null;
          const nativeVectorVertexBusy =
            nativeVectorGeometryBusy ||
            !nativeVectorRouteIsCurrent ||
            Boolean(nativeVectorGeometryDisabledReason);
          const nativeVectorVertexLayer =
            nativeVectorVertexAnchors &&
            selectedNativeVectorRoute &&
            nativeVectorPageGeometry &&
            onNativeVectorGeometryCommit ? (
              <div
                data-capability-id="PDF-EDT-OBJECT-01"
                data-control-id="PDFCTL.PAGE.VECTOR.VERTEX"
                data-testid="pdf-native-vector-vertex-layer"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 6,
                  pointerEvents: "none",
                }}
              >
                {nativeVectorVertexAnchors.map((anchor, anchorIndex) => {
                  const dragging =
                    nativeVectorVertexDrag?.anchorIndex === anchorIndex
                      ? nativeVectorVertexDrag
                      : null;
                  const shown = dragging ?? anchor;
                  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
                    const drag = nativeVectorVertexDragRef.current;
                    if (!drag || drag.anchorIndex !== anchorIndex) return;
                    nativeVectorVertexDragRef.current = null;
                    setNativeVectorVertexDrag(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    if (
                      event.type === "pointercancel" ||
                      !drag.moved ||
                      Math.hypot(drag.x - anchor.x, drag.y - anchor.y) < 0.0005
                    ) {
                      return;
                    }
                    const binding = semanticAppearanceInspectionBindingRef.current;
                    const currentRoutes =
                      nativeVectorSelectionRoutesByPage.get(page.pageNumber) ??
                      EMPTY_NATIVE_VECTOR_SELECTION_ROUTES;
                    if (
                      !binding ||
                      !nativeVectorRouteIsCurrent ||
                      !semanticAppearanceBindingIsCurrent(binding) ||
                      binding.sourceSha256 !== selectedNativeVectorRoute.sourceSha256 ||
                      !currentRoutes.some((route) =>
                        sameNativeVectorSelectionRoute(route, selectedNativeVectorRoute),
                      )
                    ) {
                      return;
                    }
                    const to = { x: drag.x, y: drag.y };
                    void commitNativeVectorWrite(
                      selectedNativeVectorRoute,
                      () =>
                        onNativeVectorGeometryCommit({
                          route: selectedNativeVectorRoute,
                          pageGeometry: nativeVectorPageGeometry,
                          vertex: { anchorIndex, from: anchor, to },
                        }),
                      nativeVectorPointBounds(
                        nativeVectorVertexAnchors.map((point, index) =>
                          index === anchorIndex ? to : point,
                        ),
                      ),
                    );
                  };
                  return (
                    <button
                      key={anchorIndex}
                      type="button"
                      aria-label={
                        t("pdf.viewer.point", { value: anchorIndex + 1 })
                      }
                      className="pdf-viewer__native-vector-vertex"
                      data-testid="pdf-native-vector-vertex"
                      data-anchor-index={anchorIndex}
                      disabled={nativeVectorVertexBusy}
                      style={{
                        position: "absolute",
                        left: `${shown.x * 100}%`,
                        top: `${shown.y * 100}%`,
                        width: 9,
                        height: 9,
                        // The page window's button minimum (36 px) drew
                        // these points as tall ovals.
                        minWidth: 0,
                        minHeight: 0,
                        margin: 0,
                        padding: 0,
                        transform: "translate(-50%, -50%)",
                        border: "1.5px solid var(--primary, #2563eb)",
                        borderRadius: 1,
                        background: dragging ? "var(--primary, #2563eb)" : "#fff",
                        boxSizing: "border-box",
                        cursor: nativeVectorVertexBusy ? "default" : "move",
                        pointerEvents: "auto",
                        touchAction: "none",
                      }}
                      onPointerDown={(event) => {
                        if (nativeVectorVertexBusy || event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const layer = event.currentTarget.parentElement;
                        if (!layer) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        nativeVectorVertexDragRef.current = {
                          anchorIndex,
                          layerRect: layer.getBoundingClientRect(),
                          moved: false,
                          x: anchor.x,
                          y: anchor.y,
                        };
                      }}
                      onPointerMove={(event) => {
                        const drag = nativeVectorVertexDragRef.current;
                        if (!drag || drag.anchorIndex !== anchorIndex) return;
                        const rect = drag.layerRect;
                        if (rect.width <= 0 || rect.height <= 0) return;
                        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
                        drag.moved = true;
                        drag.x = x;
                        drag.y = y;
                        setNativeVectorVertexDrag({ anchorIndex, x, y });
                      }}
                      onPointerUp={finishDrag}
                      onPointerCancel={finishDrag}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    />
                  );
                })}
              </div>
            ) : null;
          // Several members: one frame around all of them. Dragging or
          // resizing it moves and scales every member by the frame's own
          // change; the rotation handle turns them about the group centre.
          const nativeVectorGroupFrame =
            selectedNativeVectorRoute &&
            nativeVectorPageGeometry &&
            nativeVectorMultiSelected &&
            nativeVectorGroupBounds &&
            nativeVectorGroupCenter &&
            onNativeVectorGeometryCommitAll ? (
              <div
                data-capability-id="PDF-EDT-OBJECT-01"
                data-control-id="PDFCTL.PAGE.VECTOR.GEOMETRY"
                data-disabled-reason={
                  nativeVectorGeometryDisabledReason ??
                  nativeVectorRouteStaleReason
                }
                style={{ display: "contents" }}
              >
                <PdfAnnotationFrame
                  rect={{
                    x: nativeVectorGroupBounds.x * 100,
                    y: nativeVectorGroupBounds.y * 100,
                    width: nativeVectorGroupBounds.width * 100,
                    height: nativeVectorGroupBounds.height * 100,
                  }}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  minWidth={0.01}
                  minHeight={0.01}
                  pageKeep={nativeVectorPageKeep(nativeVectorPagePointSize)}
                  busy={
                    nativeVectorGeometryBusy ||
                    !nativeVectorRouteIsCurrent ||
                    Boolean(nativeVectorGeometryDisabledReason)
                  }
                  // The members' own pixels follow the group's frame.
                  onPreview={(preview, start) =>
                    previewNativeVectorGroupGesture(
                      page.pageNumber,
                      nativeVectorMultiSelection,
                      preview,
                      start,
                      nativeVectorPageGeometry,
                    )
                  }
                  contentRect={nativeVectorContentHeldAt(
                    `group:${nativeVectorMultiSelection.map(nativeVectorSelectionKey).join("|")}`,
                  )}
                  onRotatePreview={(rotation, start) =>
                    previewNativeVectorGroupRotation(
                      page.pageNumber,
                      nativeVectorMultiSelection,
                      rotation,
                      start,
                      nativeVectorPageGeometry,
                    )
                  }
                  onCommit={(box) => {
                    const binding =
                      semanticAppearanceInspectionBindingRef.current;
                    if (
                      !binding ||
                      !nativeVectorRouteIsCurrent ||
                      !semanticAppearanceBindingIsCurrent(binding) ||
                      binding.sourceSha256 !==
                        selectedNativeVectorRoute.sourceSha256
                    ) {
                      // Nothing is written: the members go back now.
                      setNativeVectorDragGhost((current) =>
                        current?.key.startsWith("group:") ? null : current,
                      );
                      return;
                    }
                    // Held at the drop until the page repaints with the
                    // write; a refused write lets the members go back.
                    const held = nativeVectorDragGhostRef.current;
                    const groupKey = held?.key.startsWith("group:") ? held.key : null;
                    if (groupKey) {
                      setNativeVectorDragGhost((current) =>
                        current?.key === groupKey ? { ...current, rect: box, settled: true } : current,
                      );
                    }
                    const release = () =>
                      setNativeVectorDragGhost((current) =>
                        groupKey && current?.key === groupKey ? null : current,
                      );
                    void commitNativeVectorGroupTransform({
                      kind: "bounds",
                      fromBounds: nativeVectorGroupBounds,
                      toBounds: {
                        x: box.x / 100,
                        y: box.y / 100,
                        width: box.width / 100,
                        height: box.height / 100,
                      },
                    }).then((outcome) => {
                      if (!outcome) release();
                    }, release);
                  }}
                  rotation={0}
                  onRotate={(rotationDegrees) => {
                    const binding =
                      semanticAppearanceInspectionBindingRef.current;
                    if (
                      !binding ||
                      !nativeVectorRouteIsCurrent ||
                      !semanticAppearanceBindingIsCurrent(binding) ||
                      binding.sourceSha256 !==
                        selectedNativeVectorRoute.sourceSha256
                    ) {
                      setNativeVectorDragGhost((current) =>
                        current?.key.startsWith("group:") ? null : current,
                      );
                      return;
                    }
                    const held = nativeVectorDragGhostRef.current;
                    const groupKey = held?.key.startsWith("group:") ? held.key : null;
                    if (held && groupKey && !held.settled) {
                      setNativeVectorDragGhost((current) =>
                        current?.key === groupKey
                          ? { ...current, rect: held.origin, settled: true, rotation: rotationDegrees }
                          : current,
                      );
                    }
                    const release = () =>
                      setNativeVectorDragGhost((current) =>
                        groupKey && current?.key === groupKey ? null : current,
                      );
                    void commitNativeVectorGroupTransform({
                      kind: "rotation",
                      rotationDegrees,
                      center: nativeVectorGroupCenter,
                    }).then((outcome) => {
                      if (!outcome) release();
                    }, release);
                  }}
                  onDelete={() => runOrQueueNativeVectorCommand((run) => run.remove())}
                  deleteLabel={t("pdfShape.delete")}
                  showDelete={Boolean(onNativeVectorDeleteCommit)}
                  autoFocus
                  // WPS frames every object in 编辑内容 alike: a red
                  // hairline, round corner dots and edge capsules.
                  gripStyle="wps"
                  testId="pdf-native-vector-group-frame"
                />
              </div>
            ) : null;
          // Single-page mode keeps every page mounted (so search / find /
          // highlight pipelines and pageRefs stay intact) but only paints
          // the current page; the rest collapse out of the flow.
          const hidden =
            viewMode === "single" &&
            itemIndex + 1 !== currentVisibleOrdinal;
          return [
            rowBreak,
            <div
              key={page.pageNumber}
              ref={(el) => attachPageWrapper(page.pageNumber, itemIndex, el)}
              data-page-number={page.pageNumber}
              data-file-page-number={viewport.filePageNumberFor(page.pageNumber) ?? ""}
              data-pdf-render-rotation={rotation}
              data-visible-page-ordinal={itemIndex + 1}
              className={pageWrapperClassName()}
              data-pdf-held-page-frame={heldFrameLayout ? "true" : undefined}
              style={{
                width: (rotated ? page.height : page.width) * scale,
                height: (rotated ? page.width : page.height) * scale,
                ...(heldFrameLayout
                  ? {
                      ...heldFrameLayout.style,
                      isolation: "isolate" as const,
                      ...(heldFrameLayout.extends ? { overflow: "visible" as const } : null),
                    }
                  : null),
                ...(hidden ? { display: "none" } : null),
                ...(linkMode || snapshotMode || measureMode || eraseTool.armed
                  ? { cursor: "crosshair" }
                  : null),
              }}
              onClick={(e) => {
                handlePagePlaceNote(page.pageNumber, e);
                handlePagePlaceAttachment(page.pageNumber, e);
                handlePagePlaceSignature(page.pageNumber, e);
                handlePagePlaceStamp(page.pageNumber, e);
                handleMeasureClick(page.pageNumber, e);
                handlePolygonClick(page.pageNumber, e);
                // A finger's double tap ends a polygon or a measurement, as a
                
                if (
                  (shapeMode && shapeKind === "polygon") || measureMode
                ) {
                  if (isDoubleTap(e.nativeEvent, `pdf-page:${page.pageNumber}`)) {
                    if (shapeMode && shapeKind === "polygon") {
                      void finishPolygon();
                    } else {
                      finishMeasurement();
                    }
                  }
                }
              }}
              onDoubleClick={() => {
                if (shapeMode && shapeKind === "polygon") {
                  void finishPolygon();
                  return;
                }
                // Double-click finishes the active measurement.
                if (measureMode) finishMeasurement();
              }}
              onPointerDown={(e) => {
                // The Edit Content marquee starts only on an empty part of
                // the page with no tool armed.
                nativeVectorMarquee.pointerDown(page.pageNumber, e);
                // Each handler internally gates on its own mode, so calling
                // them all is safe (only the active mode reacts).
                handleInkPointerDown(page.pageNumber, e);
                handleRedactionPointerDown(page.pageNumber, e);
                handleShapePointerDown(page.pageNumber, e);
                handleLinkPointerDown(page.pageNumber, e);
                handleSnapshotPointerDown(page.pageNumber, e);
                eraseTool.handlePointerDown(page.pageNumber, e);
              }}
              onPointerMove={(e) => {
                nativeVectorMarquee.pointerMove(page.pageNumber, e);
                handleInkPointerMove(page.pageNumber, e);
                handleRedactionPointerMove(page.pageNumber, e);
                handleShapePointerMove(page.pageNumber, e);
                handleLinkPointerMove(page.pageNumber, e);
                handleSnapshotPointerMove(page.pageNumber, e);
                eraseTool.handlePointerMove(page.pageNumber, e);
              }}
              onPointerUp={(e) => {
                nativeVectorMarquee.finish(page.pageNumber, e);
                finishStroke(page.pageNumber, e);
                finishRedaction(page.pageNumber, e);
                finishShape(page.pageNumber, e);
                finishLink(page.pageNumber, e);
                finishSnapshot(page.pageNumber, e);
                eraseTool.finish(page.pageNumber, e);
              }}
              onPointerCancel={(e) => {
                nativeVectorMarquee.finish(page.pageNumber, e);
                finishStroke(page.pageNumber, e);
                finishRedaction(page.pageNumber, e);
                finishShape(page.pageNumber, e);
                finishLink(page.pageNumber, e);
                finishSnapshot(page.pageNumber, e);
                eraseTool.finish(page.pageNumber, e);
              }}
            >
              {/* The other members' selections on this page (pdfPeerSelections). */}
              <PdfPeerSelections
                awareness={viewport.liveTransformRoom?.awareness}
                pageId={viewport.liveTransformRoom?.pageId}
                pageNumber={page.pageNumber}
              />
              {heldReplacedPages?.get(page.pageNumber) ? (
                // The page that replaces this one, held for Save: shown over
                // it (and taking its input) until the saved file has it.
                <div
                  data-testid="pdf-held-replaced-page"
                  style={{ position: "absolute", inset: 0, zIndex: 40, background: "#fff" }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn in this tab */}
                  <img
                    src={heldReplacedPages.get(page.pageNumber)!.image}
                    alt=""
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                  />
                </div>
              ) : null}
              {heldFrameLayout && heldFrame ? (
                <HeldPageFrameBackdrop
                  layout={heldFrameLayout}
                  pdfDoc={pdfDoc}
                  pageNumber={page.pageNumber}
                  rotation={rotation}
                  scale={scale}
                  drawBeyond={heldFrame.drawBeyond}
                />
              ) : null}
              <canvas
                key="pdf-page-canvas"
                data-pdf-page={page.pageNumber}
                // Night / invert / sepia read filter applies to the page
                // BITMAP only; the SVG annotation overlays below are
                // siblings and keep their own colors. "none" for normal mode.
                style={
                  canvasReadFilter === "none"
                    ? undefined
                    : { filter: canvasReadFilter }
                  }
              />
              {/* The page's photos in their own colours over the dark
                  mode's filter (lib/pdf/read-mode-photos.ts). */}
              <span
                key="pdf-page-photos"
                className="pdf-viewer__page-photos"
                data-pdf-read-mode-photos
                aria-hidden
              />
              {/* The locate tint (lib/page-locate.ts) over the canvas. */}
              <span
                key="pdf-page-locate"
                className="pdf-viewer__page-locate"
                data-pdf-page-locate
                aria-hidden
              />
              {pageNativeVectorSelectionRoutes.length > 0 ? (
                <PdfNativeVectorTargetLayer
                  routes={pageNativeVectorSelectionRoutes}
                  selectedKeys={selectedNativeVectorKeys}
                  label={
                    t("pdf.viewer.selectNativePdfVector")
                  }
                  onActivate={activateNativeVectorTarget}
                  onContextMenu={openNativeVectorTargetMenu}
                  onRest={prewarmNativeVectorTarget}
                  items={pageVisibleVectors}
                  blockedLabel={t("pdf.viewer.nativeVectorClippedNotEditable")}
                  placing={pagePlacingToolArmed}
                />
              ) : null}
              {pageNativeImageTargets.length > 0 ? (
                <PdfNativeImageTargetLayer
                  targets={pageNativeImageTargets}
                  label={t("pdf.viewer.selectPdfImage")}
                  onActivate={activateNativeImageTarget}
                  onImageContextMenu={openNativeImageTargetMenu}
                  vectorRoutes={pageNativeVectorSelectionRoutes}
                  selectedVectorKeys={selectedNativeVectorKeys}
                  placing={pagePlacingToolArmed}
                  vectorLabel={t("pdf.viewer.selectNativePdfVector")}
                  onActivateVector={activateNativeVectorTarget}
                  onVectorContextMenu={openNativeVectorTargetMenu}
                  onVectorRest={prewarmNativeVectorTarget}
                />
              ) : null}
              {renderNativePictureLayer?.(
                page.pageNumber,
                displayedPageWidth,
                displayedPageHeight,
              ) ?? null}
              {!documentDecorationsNativeAppearanceReady ? (
                <PdfDecorationOverlay
                  decorations={effectiveDocumentDecorations}
                  page={visibleOrdinalForOriginal(page.pageNumber)}
                  pageCount={visiblePageCount}
                  pageWidth={displayedPageWidth}
                  pageHeight={displayedPageHeight}
                  scale={scale}
                  resolveWatermarkImageUrl={resolveNativeImageOverlayUrl}
                />
              ) : null}
              <div
                data-pdf-highlight-layer
                className="pdf-viewer__highlight-layer"
              >
                {pageNativeImageOverlays.length > 0 &&
                resolveNativeImageOverlayUrl ? (
                  <div
                    data-pdf-native-image-layer
                    className="pdf-viewer__native-image-layer"
                    data-testid="pdf-native-image-layer"
                    aria-hidden
                  >
                    {pageNativeImageOverlays.map((overlay) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={overlay.id ?? overlay.dataItemId}
                        data-testid="pdf-native-image-overlay"
                        data-overlay-id={overlay.id}
                        src={resolveNativeImageOverlayUrl(
                          overlay.dataItemId,
                        )}
                        alt=""
                        draggable={false}
                        style={{
                          left: `${Math.min(100, Math.max(0, overlay.x * 100))}%`,
                          top: `${Math.min(100, Math.max(0, overlay.y * 100))}%`,
                          width: `${Math.min(100, Math.max(0, overlay.width * 100))}%`,
                          height: `${Math.min(100, Math.max(0, overlay.height * 100))}%`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                {onNativeSourceTextMarkupSelect
                  ? pageNativeSourceTextMarkups.map((markup) => {
                      const semanticRoute =
                        markup.nativeSource.subtype === "Highlight" ||
                        markup.nativeSource.subtype === "Underline"
                          ? semanticAppearanceRouteFor(
                              page.pageNumber,
                              markup.nativeSource.objectRef,
                              markup.nativeSource.subtype,
                              "native-text-markup",
                            )
                          : null;
                      return (
                      <button
                        key={markup.id}
                        type="button"
                        className="pdf-viewer__native-text-markup-target"
                        data-testid="pdf-native-text-markup-target"
                        data-native-text-markup-subtype={
                          markup.nativeSource.subtype
                        }
                          data-semantic-appearance-surface={
                            semanticRoute?.surface
                          }
                        aria-label={`${markup.nativeSource.subtype}${
                          markup.text
                            ? `: ${
                                markup.text.length > 80
                                  ? `${markup.text.slice(0, 80)}…`
                                  : markup.text
                              }`
                            : ""
                        }`}
                          title={markup.text || markup.nativeSource.subtype}
                        style={{
                          left: `${markup.percent.x}%`,
                          top: `${markup.percent.y}%`,
                          width: `${markup.percent.width}%`,
                          height: `${markup.percent.height}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNativeSourceTextMarkupSelect(markup.id);
                        }}
                      />
                      );
                    })
                  : null}
                {pageHighlights.map((h) =>
                  h.rects.map((r, idx) => {
                    // A slanted quad paints (and takes clicks) inside
                    // its own four vertices, never its bounding box
                    
                    const quad = h.quads?.[idx];
                    const quadLayout = quad
                      ? highlightQuadLayout(
                          quad,
                          h.markupStyle ?? "highlight",
                        )
                      : null;
                    const box = quadLayout?.bounds ?? r;
                    // The wash it lays on the page, which a line edited
                    // under it carries over its words (draft-highlight-tint).
                    const wash = pdfHighlightWashAttributes({
                      color: h.color,
                      markupStyle: h.markupStyle,
                      drawnByPage: managedTextMarkupAppearanceReady && Boolean(h.nativeMarkup),
                      rect: r,
                      quad: quadLayout ? quad : null,
                    });
                    return (
                    <button
                      key={`${h.id}-${idx}`}
                      type="button"
                      className="pdf-viewer__highlight-rect"
                      data-highlight-quad={quadLayout ? "true" : undefined}
                      {...(wash ?? {})}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                        ...(quadLayout
                          ? {
                              background: "transparent",
                              clipPath: quadLayout.clipPath,
                            }
                          : highlightMarkupRectStyle(
                              h.color,
                              h.markupStyle ?? "highlight",
                            )),
                        ...(managedTextMarkupAppearanceReady &&
                        h.nativeMarkup
                          ? { opacity: 0 }
                          : {}),
                      }}
                      data-native-text-markup={
                        h.nativeMarkup ? h.nativeMarkup.subtype : undefined
                      }
                      title={
                        h.note ||
                        (h.text.length > 80
                          ? `${h.text.slice(0, 80)}…`
                          : h.text)
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingHighlight(h);
                      }}
                    >
                      {quadLayout ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            overflow: "visible",
                            pointerEvents: "none",
                          }}
                        >
                          {quadLayout.paint.kind === "fill" ? (
                            <polygon
                              points={quadLayout.paint.points}
                              fill={h.color}
                            />
                          ) : (
                            <polyline
                              points={quadLayout.paint.points}
                              fill="none"
                              stroke={h.color}
                              strokeWidth={1.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                        </svg>
                      ) : null}
                    </button>
                    );
                  }),
                )}
              </div>
              <svg
                data-pdf-ink-layer
                className="pdf-viewer__ink-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  // The layer never intercepts pointer events on its own
                  // (drawing is handled on the page wrapper); individual
                  // stroke paths opt back in for delete-on-click.
                  pointerEvents: "none",
                }}
                aria-hidden={
                  pageInks.length === 0 &&
                  pageNativeInkStrokes.length === 0 &&
                  pageNativeSourceInkStrokes.length === 0
                }
              >
                {pageNativeInkStrokes.map((stroke, index) => {
                  const d = nativeInkPathD(stroke.points);
                  if (!d) return null;
                  return (
                    <path
                      key={`native-${stroke.id ?? index}`}
                      d={d}
                      fill="none"
                      stroke={
                        isInkColor(stroke.color)
                          ? stroke.color
                          : DEFAULT_INK_COLOR
                      }
                      strokeWidth={nativeInkWidthToPercent(
                        stroke.width,
                        page,
                      )}
                      strokeOpacity={nativeInkStrokeOpacity(stroke)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      data-testid="pdf-native-ink-stroke"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })}
                {pageInks.map((stroke) => {
                  // The stroke's paint; its click target is in the page's
                  // annotation stack, at its place in the /Annots order.
                  const selected =
                    selectedPlaced?.kind === "ink" &&
                    selectedPlaced.id === stroke.id;
                  const paint = readerInkPaint(stroke.points, stroke.width, stroke.color, page);
                  return (
                    <path
                      key={stroke.id}
                      d={paint.d}
                      fill={paint.fill}
                      stroke={paint.stroke}
                      strokeWidth={paint.strokeWidth}
                      data-ink-pressure={paint.pressure ? "true" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      data-testid="pdf-ink-stroke-paint"
                      aria-hidden
                      style={{
                        pointerEvents: "none",
                        filter: selected
                          ? "drop-shadow(0 0 1.5px rgba(37, 99, 235, 0.95))"
                          : undefined,
                      }}
                    />
                  );
                })}
                {wetInkHost ? <g ref={wetInkHost(page.pageNumber)} data-pdf-wet-ink-layer="" /> : null}
                {(inkWet ?? []).map((stroke) => {
                  if (stroke.page !== page.pageNumber) return null;
                  const paint = readerInkPaint(stroke.points, stroke.width, stroke.color, page);
                  return (
                    <path
                      key={`wet-${stroke.key}`}
                      d={paint.d}
                      fill={paint.fill}
                      stroke={paint.stroke}
                      strokeWidth={paint.strokeWidth}
                      data-ink-pressure={paint.pressure ? "true" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      data-testid="pdf-ink-stroke-wet"
                      aria-hidden
                    />
                  );
                })}
                {liveInkAwareness ? (
                  <PdfPeerReaderInk
                    awareness={liveInkAwareness}
                    pageNumber={page.pageNumber}
                    page={page}
                    settledKey={`${pageInks.length}:${pageInks.at(-1)?.id ?? ""}:${pageNativeInkStrokes.length}`}
                  />
                ) : null}
                {pageDrawingStroke
                  ? (() => {
                      const paint = readerInkPaint(
                        pageDrawingStroke.points,
                        inkWidth,
                        inkColor,
                        page,
                      );
                      return (
                        <path
                          d={paint.d}
                          fill={paint.fill}
                          stroke={paint.stroke}
                          strokeWidth={paint.strokeWidth}
                          data-ink-pressure={paint.pressure ? "true" : undefined}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          data-testid="pdf-ink-stroke-pending"
                          aria-hidden
                        />
                      );
                    })()
                  : null}
              </svg>
              {inkPageOverlay?.(page.pageNumber)}
              <svg
                data-pdf-shape-layer
                className="pdf-viewer__shape-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ pointerEvents: "none" }}
                aria-hidden={
                  pageShapes.length === 0 &&
                  pageNativeSourceShapes.length === 0
                }
              >
                {pageNativeSourceShapes.map((shape) => {
                  
                  // every source shape's click target is in the page's
                  // annotation stack, at its place in the /Annots order.
                  if (!shape.nativeSource.flags?.noZoom) return null;
                  const display = nativeShapeDisplayGeometry(shape, scale);
                  return (
                    <g key={shape.id} aria-hidden data-testid="pdf-native-source-shape-paint" style={{ pointerEvents: "none" }}>
                      {renderShapeSvg(display, shape.color, shape.width)}
                    </g>
                  );
                })}
                {pageShapes.map((shape) => (
                  // The shape's paint; its click target is in the page's
                  // annotation stack, at its place in the /Annots order.
                  <g
                    key={shape.id}
                    aria-hidden
                    data-testid="pdf-shape-paint"
                    transform={heldShapeTransform(shape)}
                    style={{
                      pointerEvents: "none",
                      ...(managedShapeAppearanceReady &&
                      managedNativeShapeIdSet.has(shape.id) &&
                      !pdfLive?.active(page.pageNumber, `shape:${shape.id}`)
                        ? { opacity: 0 }
                        : null),
                    }}
                  >
                    {renderShapeSvg(shape, shape.color, shape.width)}
                  </g>
                ))}
                {pageDrawingShape ? (
                  <g data-testid="pdf-shape-pending" aria-hidden>
                    {renderShapeSvg(
                      {
                        kind: drawingShape?.kind ?? shapeKind,
                        x1: pageDrawingShape.x1,
                        y1: pageDrawingShape.y1,
                        x2: pageDrawingShape.x2,
                        y2: pageDrawingShape.y2,
                        // Preview the chosen fill so the in-progress drag
                        // looks like what will be saved/baked.
                        fillColor: shapeFillColor,
                        fillOpacity: shapeFillOpacity,
                        lineStyle: shapeLineStyle,
                        lineStart: shapeLineStart,
                        lineEnd: shapeLineEnd,
                      },
                      shapeColor,
                      shapeWidth,
                    )}
                  </g>
                ) : null}
                {pagePolygonDraft ? (
                  <g data-testid="pdf-polygon-pending" aria-hidden>
                    <polyline
                      points={pagePolygonDraft
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill="none"
                      stroke={shapeColor}
                      strokeWidth={shapeWidth}
                      strokeDasharray={shapeLineDashPattern(
                        shapeLineStyle,
                        shapeWidth,
                      )?.dashArray.join(" ")}
                      strokeLinecap={
                        shapeLineDashPattern(shapeLineStyle, shapeWidth)
                          ?.lineCap ?? "round"
                      }
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {pagePolygonDraft.map((point, index) => (
                      <circle
                        key={`${point.x}:${point.y}:${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={Math.max(0.35, shapeWidth * 0.45)}
                        fill={shapeColor}
                      />
                    ))}
                  </g>
                ) : null}
              </svg>
              {(
                findHighlightsByPage.get(page.pageNumber) ??
                EMPTY_FIND_HIGHLIGHTS
              ).map((rect, rectIndex) => {
                const active = rect.matchIndex === findActiveIndex;
                return (
                  <div
                    key={`${rect.matchIndex}:${rectIndex}`}
                    className={`${
                      active
                        ? "pdf-viewer__find-highlight pdf-viewer__find-highlight--active"
                        : "pdf-viewer__find-highlight"
                    }${rect.textBox ? " pdf-viewer__find-highlight--textbox" : ""}`}
                    data-testid="pdf-find-highlight"
                    data-active={active ? "true" : "false"}
                    aria-hidden
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                    }}
                  />
                );
              })}
              {speechHighlightTarget?.page === page.pageNumber
                ? speechHighlightRects.map((rect, rectIndex) => (
                    <div
                      key={`speech:${speechHighlightTarget.chunkIndex}:${rectIndex}`}
                      className="pdf-viewer__speech-highlight"
                      data-testid="pdf-read-aloud-highlight"
                      data-chunk-index={speechHighlightTarget.chunkIndex}
                      data-granularity={speechHighlightTarget.granularity}
                      data-range-start={speechHighlightTarget.start}
                      data-range-end={speechHighlightTarget.end}
                      aria-hidden
                      style={{
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.width}%`,
                        height: `${rect.height}%`,
                      }}
                    />
                  ))
                : null}
              {/* Reference links are reading-mode affordances: while any
                  page-pointer tool is armed the pointer belongs to that
                  tool, so the clickable mention overlays step aside
                  instead of stealing the click. */}
              {(noteMode ||
              drawMode ||
              formMode ||
              signMode ||
              redactMode ||
              shapeMode ||
              linkMode ||
              snapshotMode ||
              measureMode ||
              panMode ||
              armedStamp != null
                ? EMPTY_REFERENCE_OVERLAYS
                : (referenceOverlaysByPage.get(page.pageNumber) ??
                  EMPTY_REFERENCE_OVERLAYS)
              ).map((rect, rectIndex) => {
                const target = referenceIndex?.targets.get(rect.refKey);
                const targetPageNumber =
                  target != null
                    ? (visiblePages[target.pageIndex]?.pageNumber ?? null)
                    : null;
                return (
                  <button
                    key={`${rect.refKey}:${rectIndex}`}
                    type="button"
                    className="pdf-viewer__ref-link"
                    data-testid="pdf-reference-link"
                    data-ref-key={rect.refKey}
                    title={
                      targetPageNumber != null
                        ? t("pdfViewer.referenceJump", {
                            label: rect.label,
                            page: targetPageNumber,
                          })
                        : rect.label
                    }
                    aria-label={
                      targetPageNumber != null
                        ? t("pdfViewer.referenceJump", {
                            label: rect.label,
                            page: targetPageNumber,
                          })
                        : rect.label
                    }
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReferenceJump(rect.refKey);
                    }}
                  />
                );
              })}
              {pageLinks.length > 0 ? (
                <div
                  data-pdf-link-layer
                  className="pdf-viewer__link-layer"
                  data-testid="pdf-link-layer"
                >
                  {pageLinks.map((link) => {
                    const style = {
                      left: `${link.percent.x}%`,
                      top: `${link.percent.y}%`,
                      width: `${link.percent.width}%`,
                      height: `${link.percent.height}%`,
                    } as const;
                    // A link with QuadPoints is only those regions: the gaps
                    
                    const quadRegions = linkQuadRegions(
                      link.percent,
                      link.quadPercents,
                    );
                    const regionClass = quadRegions
                      ? "pdf-viewer__link-region pdf-viewer__link-region--quads"
                      : "pdf-viewer__link-region";
                    // External link: a real anchor with a sanitized
                    // http/https href, opened safely in a new tab.
                    if (link.url) {
                      return (
                        <a
                          key={link.id}
                          className={regionClass}
                          href={link.url}
                          // A link region is clicked, not dragged away
                          // (lib/native-drag-guard).
                          draggable={false}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={
                            link.label ? `${link.label}\n${link.url}` : link.url
                          }
                          aria-label={
                            link.label ??
                            t("pdfViewer.linkExternal", {
                              url: link.url,
                            })
                          }
                          data-testid="pdf-link-external"
                          style={style}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {quadRegions}
                        </a>
                      );
                    }
                    // Internal link: navigate to the resolved destination.
                    return (
                      <button
                        key={link.id}
                        type="button"
                        className={regionClass}
                        title={link.label ?? t("pdfViewer.linkInternal")}
                        aria-label={link.label ?? t("pdfViewer.linkInternal")}
                        data-testid="pdf-link-internal"
                        style={style}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleLinkNavigate(link, page.pageNumber);
                        }}
                      >
                        {quadRegions}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {/* MRNote-created and safely imported native links share one
                  editable hotspot layer and the same destination dialog. */}
              {pageEditableLinkTargets.length > 0 ? (
                <div
                  data-pdf-user-link-layer
                  className="pdf-viewer__user-link-layer"
                  data-testid="pdf-user-link-layer"
                >
                  {pageEditableLinkTargets.map(
                    ({ overlay, sourceId, sourceObjectRef }) => {
                    const selected =
                      selectedLinkContext?.overlay.id === overlay.id &&
                      selectedLinkContext.sourceId === sourceId;
                      const semanticRoute = sourceObjectRef
                        ? semanticAppearanceRouteFor(
                            page.pageNumber,
                            sourceObjectRef,
                            "Link",
                            "native-link",
                          )
                        : null;
                    // While reading, a source link's QuadPoints are its
                    // only clickable areas; editing selects the whole box.
                    const readingQuads =
                      sourceId && !linkMode && !semanticEditSelectionActive
                        ? linkQuadRegions(
                            overlay,
                            (overlay as { quads?: LinkQuadPercent[] }).quads,
                          )
                        : null;
                    // While reading, a link draws nothing until pointed at
                    // (WPS): every link of a file was framed and tinted at
                    // rest, a column of pills over a paper's footnote marks
                    
                    const reading =
                      !linkMode && !semanticEditSelectionActive && !selected;
                    const style = {
                      position: "absolute" as const,
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      width: `${overlay.width}%`,
                      height: `${overlay.height}%`,
                      ...(readingQuads ? { pointerEvents: "none" as const } : {}),
                      ...(reading
                        ? {}
                        : {
                            border: selected
                              ? "2px solid var(--console-accent-strong, #0a7d72)"
                              : "1px solid rgba(10, 125, 114, 0.7)",
                            background: selected
                              ? "color-mix(in srgb, var(--console-accent-strong, #0a7d72) 20%, transparent)"
                              : "color-mix(in srgb, var(--console-accent-strong, #0a7d72) 12%, transparent)",
                          }),
                      cursor: "pointer",
                      boxSizing: "border-box" as const,
                    };
                    return (
                      <button
                        key={`${sourceId ? "source" : "managed"}:${overlay.id}`}
                        type="button"
                        className="pdf-viewer__user-link-region"
                        // While reading, the reader's own link is the
                        // one keyboard stop for a source link; this
                        // editable hotspot over it joins the tab order
                        
                        tabIndex={
                          sourceId && !linkMode && !semanticEditSelectionActive
                            ? -1
                            : undefined
                        }
                        data-testid={
                          sourceId
                            ? "pdf-native-source-link-region"
                            : "pdf-user-link-region"
                        }
                        data-native-source={sourceId ? "true" : undefined}
                        data-link-reading={reading ? "true" : undefined}
                          data-semantic-appearance-surface={
                            semanticRoute?.surface
                          }
                        data-link-context-selected={
                          selected ? "true" : undefined
                        }
                        style={style}
                        title={
                          linkMode
                            ? t("pdfViewer.linkRegionEdit")
                            : (overlay.url ?? t("pdfViewer.linkInternal"))
                        }
                        aria-label={
                          (overlay as { label?: string }).label ??
                          (overlay.url
                            ? t("pdfViewer.linkExternal", {
                                url: overlay.url,
                              })
                            : t("pdfViewer.linkInternal"))
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                            if (semanticRoute) {
                              selectLinkContext(
                                overlay,
                                sourceId,
                                e.currentTarget,
                                semanticRoute,
                              );
                              return;
                            }
                          if (linkMode) {
                            selectLinkContext(
                              overlay,
                              sourceId,
                              e.currentTarget,
                            );
                            // a finger's double tap edits it, as a
                            
                            if (isDoubleTap(e.nativeEvent, overlay)) {
                              editSelectedLinkContext();
                            }
                            return;
                          }
                          if (overlay.url) {
                            window.open(
                              overlay.url,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          } else if (overlay.goToPage != null) {
                            goToPage(overlay.goToPage);
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (!linkMode) return;
                          e.preventDefault();
                          e.stopPropagation();
                          selectLinkContext(
                            overlay,
                            sourceId,
                            e.currentTarget,
                          );
                          editSelectedLinkContext();
                        }}
                      >
                        {readingQuads}
                      </button>
                    );
                    },
                  )}
                </div>
              ) : null}
              {/* Live link rect while dragging in link mode. */}
              {pageDrawingLink &&
              pageDrawingLink.width > 0 &&
              pageDrawingLink.height > 0 ? (
                <div
                  data-testid="pdf-link-draft-rect"
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${pageDrawingLink.x}%`,
                    top: `${pageDrawingLink.y}%`,
                    width: `${pageDrawingLink.width}%`,
                    height: `${pageDrawingLink.height}%`,
                    border: "1.5px dashed rgba(10, 125, 114, 0.9)",
                    background:
                      "color-mix(in srgb, var(--console-accent-strong, var(--console-accent-strong, #0a7d72)) 10%, transparent)",
                    pointerEvents: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : null}
              {pageFormFields.length > 0 ? (
                <div
                  data-pdf-form-layer
                  onFocusCapture={(event) => {
                    const id = (event.target as HTMLElement)
                      .getAttribute?.("data-pdf-fill-field-id");
                    if (id) lastFillFieldFocusRef.current = id;
                  }}
                  onBlurCapture={(event) => {
                    // Leaving the form on purpose ends the resume; a
                    // control disabled by a save blurs with no target.
                    const next = event.relatedTarget as HTMLElement | null;
                    if (
                      next &&
                      !next.getAttribute?.("data-pdf-fill-field-id")
                    ) {
                      lastFillFieldFocusRef.current = null;
                    }
                  }}
                  className={`pdf-viewer__form-layer${
                    formMode || semanticEditSelectionActive
                      ? " is-active"
                      : ""
                  }`}
                  data-testid="pdf-form-layer"
                  data-form-document-widget-count={
                    visibleFormCapability.widgetCount
                  }
                  data-form-widget-count={
                    pageFormFields.filter(
                      (field) =>
                        field.visibility !== "hidden" &&
                        field.visibility !== "printOnly",
                    ).length
                  }
                  data-form-value-fill={
                    visibleFormCapability.fillableWidgetCount > 0
                      ? "native-current-document"
                      : "unavailable"
                  }
                  data-form-property-edit={
                    hasVisibleFormFieldForPropertyEdit
                      ? "derivative-copy"
                      : "unavailable"
                  }
                  data-form-structure-edit={
                    hasVisibleFormFieldForDelete
                      ? "derivative-copy"
                      : "unavailable"
                  }
                  aria-hidden={
                    !formMode && !semanticEditSelectionActive
                  }
                >
                  {pageFormFields.map((field) => {
                    const stored = Object.hasOwn(formValues, field.name)
                      ? formValues[field.name]
                      : sourceFormValues[field.name];
                    const fieldRole = formFieldRoles.get(field.id) ?? null;
                    // Filled as another role, the field is that role's to
                    // fill: shown, marked in its colour, locked.
                    const roleLocked = !pdfFormFieldFillableAs(fieldRole, formFillRole);
                    const disabled =
                      field.readOnly ||
                      // A rich text value (/RV) is shown and preserved;
                      // typing into it would save plain text beside a
                      
                      field.richText === true ||
                      !formMode ||
                      formMutationBlocked ||
                      roleLocked;
                    // A Hidden / NoView / Print-only widget of any type
                    // stays in the field tree for save and print but gets
                    // no control on the display surface: nothing to see,
                    
                    if (
                      field.visibility === "printOnly" ||
                      field.visibility === "hidden"
                    ) {
                      return null;
                    }
                    const style = {
                      left: `${field.percent.x}%`,
                      top: `${field.percent.y}%`,
                      width: `${field.percent.width}%`,
                      height: `${field.percent.height}%`,
                      // Outside fill mode, expose only the PDF's native
                      // widget appearance. Property/delete authoring uses
                      // its own visible trigger even though fill is off.
                      opacity:
                        !existingTextFieldEditMode &&
                        !existingFormFieldDeleteMode &&
                        disabled
                          ? 0
                          : 1,
                    } as const;
                    const fieldAccessibleName =
                      field.alternateName ?? field.name;
                    // A check box / radio button takes a finger's 44px
                    
                    const toggleHitStyle = touchToggleHitStyle(
                      (field.percent.width / 100) * page.width * scale,
                      (field.percent.height / 100) * page.height * scale,
                      touchMode,
                    );
                    // Why a field the PDF lets you fill is shown
                    
                    const fieldReadOnlyNotice =
                      field.readOnlyReason === "value-too-long"
                        ? t("pdfViewer.formFieldValueTooLongReadOnly")
                        : field.readOnlyReason === "name-too-long"
                          ? t("pdfViewer.formFieldNameTooLongReadOnly")
                          : field.readOnlyReason === "options-too-many"
                            ? t("pdfViewer.formFieldOptionsTooManyReadOnly")
                            : field.readOnlyReason === "file-select"
                              ? t("pdfViewer.formFieldFileSelectReadOnly")
                              : null;
                    const fieldTitle = fieldReadOnlyNotice
                      ? `${fieldAccessibleName} · ${fieldReadOnlyNotice}`
                      : fieldAccessibleName;
                    const semanticKind =
                      semanticAppearanceKindForFormField(field);
                    const semanticRoute = semanticKind
                      ? semanticAppearanceRouteFor(
                          page.pageNumber,
                          field.id,
                          semanticKind,
                          "form-field",
                        )
                      : null;
                    if (existingFormFieldDeleteMode) {
                      const deleteLabel = t("pdf.viewer.deleteFormField2", { fieldAccessibleName });
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className="pdf-viewer__form-field"
                          data-testid="pdf-form-field-delete-trigger"
                          data-field-name={field.name}
                          style={{
                            ...style,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            overflow: "hidden",
                            boxSizing: "border-box",
                            border:
                              "1.5px dashed var(--destructive, #dc2626)",
                            background:
                              "color-mix(in srgb, var(--destructive, #dc2626) 10%, white)",
                            color: "var(--destructive, #dc2626)",
                            minHeight: 0,
                            minWidth: 0,
                            borderRadius: 2,
                            cursor: "pointer",
                            zIndex: 4,
                          }}
                          aria-label={deleteLabel}
                          title={deleteLabel}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenExistingFormFieldDelete(
                              field,
                              page.pageNumber,
                              event.currentTarget,
                            );
                          }}
                        >
                          <Trash2 size={12} aria-hidden />
                          <span className="truncate text-[10px]">
                            {fieldAccessibleName}
                          </span>
                        </button>
                      );
                    }
                    if (existingTextFieldEditMode) {
                      const fieldReason =
                        readFormFieldContextDisabledReason(field);
                      const selected =
                        selectedFormFieldContext?.page ===
                          page.pageNumber &&
                        selectedFormFieldContext.field.id === field.id;
                      const selectLabel = t("pdf.viewer.selectFormField", { fieldAccessibleName });
                      const title = fieldReason
                        ? `${selectLabel}. ${fieldReason}`
                        : `${selectLabel}. ${
                            t("pdf.viewer.doubleClickOpenFullProperties")
                          }`;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className="pdf-viewer__form-field"
                          data-testid="pdf-form-field-edit-trigger"
                          data-field-id={field.id}
                          data-field-name={field.name}
                          data-field-context-supported={
                            fieldReason ? "false" : "true"
                          }
                          data-field-context-selected={
                            selected ? "true" : undefined
                          }
                          style={{
                            ...style,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            overflow: "hidden",
                            boxSizing: "border-box",
                            // The page canvas already paints the widget's
                            // own appearance; the trigger is only a
                            // selectable outline over it, never a fill or
                            // a label that would hide the control.
                            border: selected
                              ? "2px solid var(--console-accent-strong, #0a7d72)"
                              : fieldReason
                                ? "1.5px dashed var(--muted-foreground, #64748b)"
                                : "1.5px dashed var(--console-accent-strong, #0a7d72)",
                            background: "transparent",
                            color: "transparent",
                            padding: 0,
                            // The page window gives every button a
                            // 36px touch height and an 8px radius; the
                            // trigger is the widget's own box, no more.
                            minHeight: 0,
                            minWidth: 0,
                            borderRadius: 2,
                            cursor: "pointer",
                            zIndex: 3,
                          }}
                          aria-label={selectLabel}
                          aria-pressed={selected}
                          title={title}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectFormFieldContext(
                              field,
                              page.pageNumber,
                              event.currentTarget,
                            );
                            // a finger's double tap opens the field's
                            
                            if (
                              !fieldReason &&
                              isDoubleTap(event.nativeEvent, field)
                            ) {
                              handleOpenExistingFormFieldEditor(
                                field,
                                page.pageNumber,
                                event.currentTarget,
                              );
                            }
                          }}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            selectFormFieldContext(
                              field,
                              page.pageNumber,
                              event.currentTarget,
                            );
                            if (!fieldReason) {
                              handleOpenExistingFormFieldEditor(
                                field,
                                page.pageNumber,
                                event.currentTarget,
                              );
                            }
                          }}
                        />
                      );
                    }
                    const geometrySelectable = Boolean(
                      semanticEditSelectionActive &&
                        nativePdfFormWidgetExpectedIdentity(
                          field.id,
                          page.pageNumber,
                        ),
                    );
                    if (
                      (semanticRoute || geometrySelectable) &&
                      formWidgetEditSelectionAuthorized
                    ) {
                      const shared =
                        semanticRoute?.ownerDisposition ===
                        "shared-appearance-preserve-only";
                      const selectLabel = t("pdf.viewer.selectFormField", { fieldAccessibleName });
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className="pdf-viewer__form-field"
                          data-testid={
                            semanticRoute
                              ? "pdf-semantic-form-field-select"
                              : "pdf-form-widget-geometry-select"
                          }
                          data-semantic-appearance-surface={
                            semanticRoute ? "form-field" : undefined
                          }
                          data-semantic-owner-disposition={
                            semanticRoute?.ownerDisposition
                          }
                          style={{
                            ...style,
                            opacity: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            overflow: "hidden",
                            boxSizing: "border-box",
                            // Outline only: the widget appearance under
                            // it stays visible and small controls are not
                            // covered by a truncated field name.
                            border: shared
                              ? "1.5px dashed var(--muted-foreground, #64748b)"
                              : "1.5px dashed var(--console-accent-strong, #0a7d72)",
                            background: "transparent",
                            color: "transparent",
                            padding: 0,
                            // The page window gives every button a
                            // 36px touch height and an 8px radius; the
                            // trigger is the widget's own box, no more.
                            minHeight: 0,
                            minWidth: 0,
                            borderRadius: 2,
                            cursor: "pointer",
                            zIndex: 3,
                          }}
                          aria-label={selectLabel}
                          title={selectLabel}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectFormFieldContext(
                              field,
                              page.pageNumber,
                              event.currentTarget,
                              semanticRoute ?? undefined,
                            );
                          }}
                        />
                      );
                    }
                    // Checkbox.
                    if (field.type === "checkbox") {
                      // A multi-state field (one widget per on-state) is
                      // checked only where the value is this widget's own
                      // state, and toggling writes that state or Off;
                      
                      const multiState =
                        multiStateCheckboxFieldNames.has(field.name) &&
                        typeof field.exportValue === "string" &&
                        field.exportValue !== "";
                      const checked = multiState
                        ? stored === field.exportValue
                        : stored === true;
                      return (
                        <input
                          key={field.id}
                          type="checkbox"
                          className="pdf-viewer__form-field pdf-viewer__form-checkbox"
                          data-testid="pdf-form-field"
                          data-pdf-fill-field-id={field.id}
                          data-field-type="checkbox"
                          data-field-state={
                            multiState ? field.exportValue! : undefined
                          }
                          style={{ ...style, ...toggleHitStyle }}
                          checked={checked}
                          disabled={disabled}
                          required={field.required}
                          aria-required={field.required}
                          aria-label={
                            multiState
                              ? `${fieldAccessibleName}: ${field.exportValue}`
                              : fieldAccessibleName
                          }
                          title={fieldTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleFormFieldChange(
                              field,
                              multiState
                                ? e.target.checked
                                  ? field.exportValue!
                                  : ""
                                : e.target.checked,
                              page.pageNumber,
                            )
                          }
                        />
                      );
                    }
                    // Radio member: checked when the group's value equals
                    // this member's export value.
                    if (field.type === "radio") {
                      const exportValue = field.exportValue ?? "";
                      const radioChecked =
                        stored === exportValue && exportValue !== "";
                      // RadiosInUnison: every widget with this export
                      // value is the same option. One native radio per
                      // option carries the group's keyboard order; the
                      // other widgets are the same option's copies and
                      // report the same state (a native radio in the
                      // same group could not: the browser lets only one
                      
                      const unisonPrimary = field.radiosInUnison
                        ? pageFormFields.find(
                            (candidate) =>
                              candidate.type === "radio" &&
                              candidate.name === field.name &&
                              (candidate.exportValue ?? "") === exportValue,
                          )
                        : undefined;
                      if (unisonPrimary && unisonPrimary.id !== field.id) {
                        return (
                          <button
                            key={field.id}
                            type="button"
                            role="radio"
                            className="pdf-viewer__form-field pdf-viewer__form-radio pdf-viewer__form-radio--unison"
                            data-testid="pdf-form-field"
                            data-pdf-fill-field-id={field.id}
                            data-field-type="radio"
                            data-field-unison-of={unisonPrimary.id}
                            style={{
                              ...style,
                              appearance: "none",
                              padding: 0,
                              ...toggleHitStyle,
                            }}
                            aria-checked={radioChecked}
                            aria-label={`${fieldAccessibleName}: ${exportValue}`}
                            title={fieldTitle}
                            tabIndex={-1}
                            disabled={disabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (disabled || exportValue === "") return;
                              if (radioChecked) {
                                if (!field.noToggleToOff) {
                                  handleFormFieldChange(field, "", page.pageNumber);
                                }
                                return;
                              }
                              handleFormFieldChange(field, exportValue, page.pageNumber);
                            }}
                          />
                        );
                      }
                      return (
                        <input
                          key={field.id}
                          type="radio"
                          className="pdf-viewer__form-field pdf-viewer__form-radio"
                          data-testid="pdf-form-field"
                          data-pdf-fill-field-id={field.id}
                          data-field-type="radio"
                          style={{ ...style, ...toggleHitStyle }}
                          name={`pdf-form-${formInstanceId}-${field.name}`}
                          value={exportValue}
                          checked={radioChecked}
                          disabled={disabled}
                          required={field.required}
                          aria-label={`${fieldAccessibleName}: ${exportValue}`}
                          title={fieldTitle}
                          onKeyDown={(event) => {
                            // Space on the checked member clears the group
                            // (a PDF radio group without NoToggleToOff lets
                            // it): the key is taken here, before the browser
                            // turns it into a click it then "re-checks" the
                            // radio after -- the mouse could clear the
                            // group, the keyboard could not (user audit
                            // C-0013). Arrow keys keep moving the choice.
                            if (
                              event.key !== " " ||
                              disabled ||
                              field.noToggleToOff ||
                              exportValue === "" ||
                              stored !== exportValue
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            handleFormFieldChange(field, "", page.pageNumber);
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            // Native HTML radios cannot normally clear the
                            // active member. PDF radio groups can when the
                            // field does not set NoToggleToOff; click and
                            // keyboard Space both arrive through onClick.
                            // The click's default action is not cancelled:
                            // a cancelled activation makes the browser put
                            // the radio's previous (checked) state back
                            // after the handlers ran, undoing the clear the
                            // controlled value had just rendered, so the
                            
                            // value "" renders it unchecked instead.
                            if (
                              !disabled &&
                              !field.noToggleToOff &&
                              exportValue !== "" &&
                              stored === exportValue
                            ) {
                              handleFormFieldChange(
                                field,
                                "",
                                page.pageNumber,
                              );
                            }
                          }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleFormFieldChange(
                                field,
                                exportValue,
                                page.pageNumber,
                              );
                            }
                          }}
                        />
                      );
                    }
                    // Choice (combo / list box).
                    if (field.type === "choice") {
                      const choiceValue =
                        typeof stored === "string" ? stored : "";
                      const choiceDisplay = formChoiceDisplay[field.name];
                      const selectedOption = findAcroFieldOption(
                        field.options,
                        choiceValue,
                        typeof choiceDisplay === "string" ? choiceDisplay : null,
                      );
                      if (field.editable) {
                        // The box shows the chosen option's label, never
                        // its export code; typing a label picks that
                        // option, any other text is the field's own
                        
                        const editableShown =
                          selectedOption && selectedOption.label !== ""
                            ? selectedOption.label
                            : choiceValue;
                        const choiceListId = `pdf-form-options-${field.id.replace(
                          /[^A-Za-z0-9_-]/g,
                          "-",
                        )}`;
                        return (
                          <Fragment key={field.id}>
                            <input
                              type="text"
                              list={
                                field.options.length > 0
                                  ? choiceListId
                                  : undefined
                              }
                              className="pdf-viewer__form-field pdf-viewer__form-choice"
                              data-testid="pdf-form-field"
                              data-pdf-fill-field-id={field.id}
                              data-field-type="choice"
                              data-field-editable="true"
                              style={style}
                              value={editableShown}
                              disabled={disabled}
                              required={field.required}
                              maxLength={ACROFORM_MAX_TEXT}
                              autoComplete="off"
                              aria-autocomplete="list"
                              aria-required={field.required}
                              aria-label={fieldAccessibleName}
                              title={fieldTitle}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => {
                                setFocusedFormField(field.name);
                                beginNativeFormFieldGesture(field.name);
                              }}
                              onBlur={() => {
                                setFocusedFormField((current) =>
                                  current === field.name ? null : current,
                                );
                                finishNativeFormFieldGesture(field.name);
                              }}
                              onChange={(e) => {
                                const typed = e.target.value;
                                const byLabel = field.options.find(
                                  (opt) => opt.label === typed,
                                );
                                if (byLabel) {
                                  handleFormFieldChange(
                                    field,
                                    byLabel.value,
                                    page.pageNumber,
                                    byLabel.label,
                                  );
                                  return;
                                }
                                handleFormFieldChange(
                                  field,
                                  typed,
                                  page.pageNumber,
                                );
                              }}
                            />
                            {field.options.length > 0 ? (
                              <datalist id={choiceListId}>
                                {field.options.map((opt) => (
                                  <option key={opt.index} value={opt.label} />
                                ))}
                              </datalist>
                            ) : null}
                          </Fragment>
                        );
                      }
                      if (field.multiSelect) {
                        const selectedValues = Array.isArray(stored)
                          ? stored
                          : stored === undefined &&
                              Array.isArray(field.initialValue)
                            ? field.initialValue
                            : [];
                        // Each stored value names one /Opt row; a label
                        // recorded with it picks that row among rows that
                        // share the value, else the first unused one.
                        const labelHints = Array.isArray(choiceDisplay)
                          ? [...choiceDisplay]
                          : [];
                        const usedIndexes = new Set<number>();
                        const selectedIndexes = selectedValues.flatMap((value) => {
                          const candidates = field.options.filter(
                            (opt) => opt.value === value && !usedIndexes.has(opt.index),
                          );
                          const hintAt = labelHints.findIndex((label) =>
                            candidates.some((opt) => opt.label === label),
                          );
                          const chosen =
                            hintAt >= 0
                              ? candidates.find((opt) => opt.label === labelHints[hintAt])
                              : candidates[0];
                          if (hintAt >= 0) labelHints.splice(hintAt, 1);
                          if (!chosen) return [];
                          usedIndexes.add(chosen.index);
                          return [String(chosen.index)];
                        });
                        return (
                          <select
                            key={field.id}
                            multiple
                            className="pdf-viewer__form-field pdf-viewer__form-choice"
                            data-testid="pdf-form-field"
                            data-pdf-fill-field-id={field.id}
                            data-field-type="choice"
                            data-field-multiselect="true"
                            // A live list box is transparent until it has
                            // the caret (the page paints the selected rows);
                            // the stylesheet owns that, so no inline opacity.
                            style={disabled ? style : { ...style, opacity: undefined }}
                            value={selectedIndexes}
                            disabled={disabled}
                            required={field.required}
                            aria-required={field.required}
                            aria-label={fieldAccessibleName}
                            title={fieldTitle}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const chosen = Array.from(
                                e.currentTarget.selectedOptions,
                                (option) => field.options[Number(option.value)],
                              ).filter((opt): opt is AcroFieldOption => Boolean(opt));
                              handleFormFieldChange(
                                field,
                                chosen.map((opt) => opt.value),
                                page.pageNumber,
                                chosen.map((opt) => opt.label),
                              );
                            }}
                          >
                            {field.options.map((opt) => (
                              <option key={opt.index} value={String(opt.index)}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        );
                      }
                      // A /Ch field without the Combo flag is a list box
                      // that shows its rows in place (one selection at a
                      // time); only a combo box is a dropdown.
                      const listBox = !field.combo;
                      return (
                        <select
                          key={field.id}
                          className="pdf-viewer__form-field pdf-viewer__form-choice"
                          data-testid="pdf-form-field"
                          data-pdf-fill-field-id={field.id}
                          data-field-type="choice"
                          data-field-listbox={listBox ? "true" : undefined}
                          size={listBox ? Math.max(2, field.options.length) : undefined}
                          style={listBox && !disabled ? { ...style, opacity: undefined } : style}
                          // Rows are addressed by their /Opt index: two
                          // rows may share an export value, and a row may
                          // export the empty string (a clear choice that
                          // is not the "no selection" placeholder).
                          value={selectedOption ? String(selectedOption.index) : ""}
                          disabled={disabled}
                          required={field.required}
                          aria-required={field.required}
                          aria-label={fieldAccessibleName}
                          title={fieldTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const chosen =
                              e.target.value === ""
                                ? undefined
                                : field.options[Number(e.target.value)];
                            if (chosen) {
                              handleFormFieldChange(
                                field,
                                chosen.value,
                                page.pageNumber,
                                chosen.label,
                              );
                              return;
                            }
                            handleFormFieldChange(field, "", page.pageNumber);
                          }}
                        >
                          {listBox ? null : (
                            <option value="">
                              {t("pdfForm.choicePlaceholder")}
                            </option>
                          )}
                          {field.options.map((opt) => (
                            <option key={opt.index} value={String(opt.index)}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    // Push buttons stay fail-closed unless pdf.js proves a
                    // supported native action. Reset-all, named Print,
                    // navigation, view, SaveAs, GoToPage, and bounded web
                    // link commands route
                    // through existing guarded viewer commands; arbitrary
                    // PDF JavaScript or imported actions never execute.
                    if (
                      field.type === "resetButton" ||
                      field.type === "printButton" ||
                      field.type === "navigationButton" ||
                      field.type === "viewButton" ||
                      field.type === "saveButton" ||
                      field.type === "goToPageButton" ||
                      field.type === "webLinkButton"
                    ) {
                      const isPrintButton = field.type === "printButton";
                      const isNavigationButton =
                        field.type === "navigationButton";
                      const isViewButton = field.type === "viewButton";
                      const isSaveButton = field.type === "saveButton";
                      const isGoToPageButton =
                        field.type === "goToPageButton";
                      const isWebLinkButton =
                        field.type === "webLinkButton";
                      const webLinkUrl = isWebLinkButton
                        ? sanitizeLinkUrl(field.buttonUrl)
                        : null;
                      const navigationAction = isNavigationButton
                        ? field.buttonAction
                        : undefined;
                      const viewAction = isViewButton
                        ? field.buttonAction
                        : undefined;
                      const navigationLabel =
                        navigationAction === "FirstPage"
                          ? t("pdf.viewer.firstPage")
                          : navigationAction === "PrevPage"
                            ? t("pdf.viewer.previousPage")
                            : navigationAction === "NextPage"
                              ? t("pdf.viewer.nextPage")
                              : navigationAction === "LastPage"
                                ? t("pdf.viewer.lastPage")
                                : navigationAction === "GoBack"
                                  ? t("pdf.viewer.previousView")
                                  : navigationAction === "GoForward"
                                    ? t("pdf.viewer.nextView")
                                    : t("pdf.viewer.pageNavigation");
                      const viewLabel =
                        viewAction === "Find"
                          ? t("pdf.viewer.find")
                          : viewAction === "FullScreen"
                            ? t("pdf.viewer.fullScreen")
                            : viewAction === "ZoomIn"
                              ? t("pdf.viewer.zoomIn")
                              : viewAction === "ZoomOut"
                                ? t("pdf.viewer.zoomOut")
                                : viewAction === "FitPage"
                                  ? t("pdf.viewer.fitPage")
                                  : viewAction === "FitWidth"
                                    ? t("pdf.viewer.fitWidth")
                                    : t("pdf.viewer.viewCommand");
                      // What the button does, in the reader's words: the
                      // visible text where the PDF draws no face, and the
                      // name when the author gave none.
                      const actionKindLabel =
                        isPrintButton
                          ? t("pdf.formField.actionPrint")
                          : isNavigationButton
                            ? navigationLabel
                            : isViewButton
                              ? viewLabel
                              : isSaveButton
                                ? t("pdf.formField.actionSaveAs")
                                : isGoToPageButton
                                  ? t("pdf.formField.actionGoToPage")
                                  : isWebLinkButton
                                    ? t("pdf.formField.actionOpenWebsite")
                                    : t("pdf.formField.actionResetForm");
                      // The author's /TU names the button; it is never
                      
                      const actionLabel = field.buttonLabel || actionKindLabel;
                      const navigationUnavailable =
                        navigationAction === "FirstPage" ||
                        navigationAction === "PrevPage"
                          ? currentPage <= 1
                          : navigationAction === "NextPage" ||
                              navigationAction === "LastPage"
                            ? currentPage >= pages.length
                            : navigationAction === "GoBack"
                              ? !navCanBack
                              : navigationAction === "GoForward"
                                ? !navCanForward
                                : true;
                      const viewUnavailable =
                        viewAction === "ZoomIn"
                          ? scale >= MAX_SCALE
                          : viewAction === "ZoomOut"
                            ? scale <= MIN_SCALE
                            : viewAction === "FullScreen"
                              ? !presentationActive &&
                                (typeof document === "undefined" ||
                                  typeof viewerRootRef.current
                                    ?.requestFullscreen !== "function")
                              : viewAction === "Find" ||
                                  viewAction === "FitPage" ||
                                  viewAction === "FitWidth"
                                ? false
                                : true;
                      const actionDisabled = isPrintButton
                        ? disabled || !printCommand.enabled
                        : isNavigationButton
                          ? disabled ||
                            !navigationAction ||
                            pages.length === 0 ||
                            navigationUnavailable
                          : isViewButton
                            ? field.readOnly ||
                              !formMode ||
                              loading ||
                              !viewAction ||
                              viewUnavailable
                            : isSaveButton
                              ? field.readOnly ||
                                !formMode ||
                                !currentDownloadCommand.enabled
                              : isGoToPageButton
                                ? field.readOnly ||
                                  !formMode ||
                                  loading ||
                                  visiblePageItems.length === 0
                                : isWebLinkButton
                                  ? field.readOnly ||
                                    !formMode ||
                                    loading ||
                                    !webLinkUrl
                          : disabled || loading || flattening;
                      const actionDisabledReason =
                        isPrintButton && !printCommand.enabled
                          ? printCommand.reasonLabel
                          : isNavigationButton && !navigationAction
                            ? t("pdf.viewer.unsupportedPageNavigationAction")
                            : isNavigationButton && navigationUnavailable
                              ? navigationAction === "FirstPage" ||
                                navigationAction === "PrevPage"
                                ? t("pdf.viewer.alreadyFirstPage2")
                                : navigationAction === "NextPage" ||
                                    navigationAction === "LastPage"
                                  ? t("pdf.viewer.alreadyLastPage")
                                  : navigationAction === "GoBack"
                                    ? t("pdf.viewer.noPreviousViewHistory")
                                    : t("pdf.viewer.noNextViewHistory")
                              : isViewButton && field.readOnly
                                ? t("pdf.viewer.viewButtonReadOnly")
                                : isViewButton && !formMode
                                  ? t("pdf.viewer.enterFormFillingModeFirst")
                                  : isViewButton && loading
                                    ? t("document.capability.unavailable")
                                  : isViewButton && !viewAction
                                    ? t("pdf.viewer.unsupportedViewAction")
                                    : isViewButton && viewUnavailable
                                      ? viewAction === "ZoomIn"
                                        ? t("pdf.viewer.maximumZoomReached")
                                        : viewAction === "ZoomOut"
                                          ? t("pdf.viewer.minimumZoomReached")
                                          : t("pdf.viewer.fullScreenNotSupportedBrowser")
                              : isSaveButton && field.readOnly
                                          ? t("pdf.viewer.saveButtonReadOnly")
                                : isSaveButton && !formMode
                                            ? t("pdf.viewer.enterFormFillingModeFirst")
                                  : isSaveButton &&
                                      !currentDownloadCommand.enabled
                                    ? currentDownloadCommand.reasonLabel
                                              : isGoToPageButton &&
                                                  field.readOnly
                                                ? t("pdf.viewer.goPageButtonReadOnly")
                                                : isGoToPageButton &&
                                                    !formMode
                                                  ? t("pdf.viewer.enterFormFillingModeFirst")
                                  : isGoToPageButton &&
                                      (loading ||
                                                        visiblePageItems.length ===
                                                          0)
                                                    ? t(
                                                        "document.capability.unavailable",
                                                      )
                                                    : isWebLinkButton &&
                                                        field.readOnly
                                                      ? t("pdf.viewer.webLinkButtonReadOnly")
                                                      : isWebLinkButton &&
                                                          !formMode
                                                        ? t("pdf.viewer.webLinkNeedsFormMode")
                                                        : isWebLinkButton &&
                                                            loading
                                                          ? t(
                                                              "document.capability.unavailable",
                                                            )
                                                          : isWebLinkButton &&
                                                              !webLinkUrl
                                      ? t("pdf.viewer.webLinkInvalid")
                              : undefined;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className={
                            field.sourceFace
                              ? "pdf-viewer__form-field pdf-viewer__sign-field pdf-viewer__sign-field--source-face"
                              : "pdf-viewer__form-field pdf-viewer__sign-field"
                          }
                          data-source-face={field.sourceFace ? "true" : undefined}
                          data-testid={
                            isPrintButton
                              ? "pdf-print-form-field"
                              : isNavigationButton
                                ? "pdf-navigation-form-field"
                                : isViewButton
                                  ? "pdf-view-command-form-field"
                                  : isSaveButton
                                    ? "pdf-save-as-form-field"
                                    : isGoToPageButton
                                      ? "pdf-go-to-page-form-field"
                                      : isWebLinkButton
                                        ? "pdf-web-link-form-field"
                                : "pdf-reset-form-field"
                          }
                          data-field-type={field.type}
                          style={style}
                          disabled={actionDisabled}
                          aria-label={`${actionLabel}: ${field.name}`}
                          title={
                            actionDisabledReason
                              ? `${actionLabel}: ${actionDisabledReason}`
                              : `${actionLabel}: ${field.name}`
                          }
                          data-disabled-reason={
                            actionDisabledReason ?? undefined
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            if (actionDisabled) return;
                            if (isPrintButton) {
                              printPreflightTriggerRef.current =
                                event.currentTarget;
                              void executeReaderCommand(
                                PDF_READER_PRINT_COMMAND,
                                printRuntimeDecision,
                              );
                            } else if (isSaveButton) {
                              void executeReaderCommand(
                                PDF_READER_DOWNLOAD_CURRENT_COMMAND,
                                currentDownloadRuntimeDecision,
                              );
                            } else if (isGoToPageButton) {
                              requestGoToPageInput();
                            } else if (isWebLinkButton && webLinkUrl) {
                              window.open(
                                webLinkUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            } else if (isViewButton) {
                              if (viewAction === "Find") {
                                setFindOpen(true);
                                window.setTimeout(() => {
                                  findInputRef.current?.focus();
                                  findInputRef.current?.select();
                                }, 0);
                              } else if (viewAction === "FullScreen") {
                                handlePresentationToggle();
                              } else if (viewAction === "ZoomIn") {
                                zoomIn();
                              } else if (viewAction === "ZoomOut") {
                                zoomOut();
                              } else if (viewAction === "FitPage") {
                                fitPage();
                              } else if (viewAction === "FitWidth") {
                                fitWidth();
                              }
                            } else if (isNavigationButton) {
                              if (navigationAction === "GoBack") {
                                handleNavBack();
                              } else if (navigationAction === "GoForward") {
                                handleNavForward();
                              } else {
                                const targetPage =
                                  navigationAction === "FirstPage"
                                    ? 1
                                    : navigationAction === "PrevPage"
                                      ? currentPage - 1
                                      : navigationAction === "NextPage"
                                        ? currentPage + 1
                                        : navigationAction === "LastPage"
                                          ? pages.length
                                          : null;
                                if (targetPage !== null) {
                                  goToPage(targetPage);
                                }
                              }
                            } else {
                              void handleResetForm(field.resetScope);
                            }
                          }}
                        >
                          {isPrintButton ? (
                            <Printer size={14} aria-hidden />
                          ) : isSaveButton ? (
                            <Save size={14} aria-hidden />
                          ) : isGoToPageButton ? (
                            <Hash size={14} aria-hidden />
                          ) : isWebLinkButton ? (
                            <ExternalLink size={14} aria-hidden />
                          ) : viewAction === "Find" ? (
                            <Search size={14} aria-hidden />
                          ) : viewAction === "FullScreen" ? (
                            <Presentation size={14} aria-hidden />
                          ) : viewAction === "ZoomIn" ? (
                            <ZoomIn size={14} aria-hidden />
                          ) : viewAction === "ZoomOut" ? (
                            <ZoomOut size={14} aria-hidden />
                          ) : viewAction === "FitPage" ? (
                            <Scaling size={14} aria-hidden />
                          ) : viewAction === "FitWidth" ? (
                            <Maximize2 size={14} aria-hidden />
                          ) : navigationAction === "FirstPage" ? (
                            <ChevronsLeft size={14} aria-hidden />
                          ) : navigationAction === "PrevPage" ? (
                            <ChevronLeft size={14} aria-hidden />
                          ) : navigationAction === "NextPage" ? (
                            <ChevronRight size={14} aria-hidden />
                          ) : navigationAction === "LastPage" ? (
                            <ChevronsRight size={14} aria-hidden />
                          ) : navigationAction === "GoBack" ? (
                            <CornerUpLeft size={14} aria-hidden />
                          ) : navigationAction === "GoForward" ? (
                            <CornerUpRight size={14} aria-hidden />
                          ) : isViewButton ? (
                            <Search size={14} aria-hidden />
                          ) : isNavigationButton ? (
                            <ChevronsRight size={14} aria-hidden />
                          ) : (
                            <RotateCcw size={14} aria-hidden />
                          )}
                          {/* The author's caption (/MK /CA) as WPS draws it;
                              what the button does when it has none. */}
                          <span>{field.buttonCaption || actionKindLabel}</span>
                        </button>
                      );
                    }
                    // 图片字段 (Acrobat's Image Field): its face is the PDF's
                    // own (the picture, or an empty frame), drawn below; the
                    // button over it chooses the picture, Delete takes it off.
                    if (field.type === "imageField") {
                      const busy = imageFieldBusy === field.name;
                      const pickDisabled =
                        disabled || field.readOnly || !onImageFieldPick || busy;
                      const pickReason = field.readOnly
                        ? t("pdf.formField.imageFieldReadOnly")
                        : !formMode
                          ? t("pdf.viewer.enterFormFillingModeFirst")
                          : !onImageFieldPick
                            ? t("pdf.viewer.fieldKindCannotYetWritten")
                            : undefined;
                      const label = t("pdf.formField.imageFieldChoose", {
                        name: fieldAccessibleName,
                      });
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className="pdf-viewer__form-field pdf-viewer__image-field"
                          data-testid="pdf-image-form-field"
                          data-field-type="imageField"
                          data-busy={busy ? "true" : undefined}
                          style={style}
                          disabled={pickDisabled}
                          aria-label={`${label}${field.required ? t("pdf.viewer.required") : ""}`}
                          aria-keyshortcuts="Delete"
                          title={pickReason ? `${label}: ${pickReason}` : `${label} · ${t("pdf.formField.imageFieldClearHint")}`}
                          data-disabled-reason={pickReason}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (pickDisabled) return;
                            onImageFieldPick?.(field, page.pageNumber, "choose");
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === "Delete" || event.key === "Backspace") && !pickDisabled) {
                              event.preventDefault();
                              event.stopPropagation();
                              onImageFieldPick?.(field, page.pageNumber, "clear");
                            }
                          }}
                        />
                      );
                    }
                    // Signature field (`Sig` widget): no form-fill value;
                    // render a "Sign here" affordance that opens the visual
                    // signature composer sized to this field's rect. The
                    // actual signature is stored as a separate
                    // `pdf_signatures` annotation (not in the values map).
                    if (field.type === "signature") {
                      const alreadySigned = pageSignatures.some(
                        (s) =>
                          Math.abs(s.x - field.percent.x) < 1 &&
                          Math.abs(s.y - field.percent.y) < 1,
                      );
                      return (
                        <button
                          key={field.id}
                          type="button"
                          className="pdf-viewer__form-field pdf-viewer__sign-field"
                          data-testid="pdf-sign-field"
                          data-field-type="signature"
                          style={style}
                          disabled={disabled || alreadySigned}
                          aria-label={`${t("pdfSign.fieldLabel", {
                            name: fieldAccessibleName,
                          })}${
                            field.required
                              ? t("pdf.viewer.required")
                              : ""
                          }`}
                          title={t("pdfSign.fieldLabel", {
                            name: fieldAccessibleName,
                          })}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (disabled || alreadySigned) return;
                            signatureReturnFocusRef.current =
                              e.currentTarget;
                            disarmPageTools("sign");
                            setSignMode(false);
                            setSignatureComposerMode("draw");
                            resetSignDraft("draw");
                            setPendingSignature({
                              page: page.pageNumber,
                              x: field.percent.x,
                              y: field.percent.y,
                              width: field.percent.width,
                              height: field.percent.height,
                            });
                          }}
                        >
                          <Signature size={14} aria-hidden />
                          <span>{t("pdfSign.signHere")}</span>
                        </button>
                      );
                    }
                    const rawText =
                      field.password &&
                      Object.hasOwn(formSessionOnlyValues, field.name)
                        ? formSessionOnlyValues[field.name]!
                        : typeof stored === "string"
                          ? stored
                          : "";
                    // Malformed native files can carry incompatible flags.
                    // Password remains the safer rendering authority; comb
                    // then wins over multiline only when maxLen is usable.
                    const combActive =
                      field.comb &&
                      field.maxLen !== null &&
                      !field.password;
                    const formatSpec =
                      !field.password && field.formatScript
                        ? parseFormatScript(field.formatScript)
                        : null;
                    const textValue =
                      formatSpec &&
                      rawText !== "" &&
                      focusedFormField !== field.name
                        ? formatWithSpec(rawText, formatSpec, locale)
                        : rawText;
                    // The page is laid out in user units (UserUnit scales
                    // a point on the page), and its text follows /Rotate:
                    // the live editor sets its size and direction the same
                    // way, so entering a field changes nothing the eye sees.
                    const pageUnit = page.userUnit ?? 1;
                    const pointPx = scale * pageUnit;
                    const fieldHeightPx =
                      (field.percent.height / 100) * page.height * scale;
                    const borderPx =
                      field.borderWidth !== null ? field.borderWidth * pointPx : 1;
                    // /DA size 0 is auto-size: the text as large as the box
                    // allows (pdf.js LINE_FACTOR 1.35), a multi-line field
                    // starting from 12 pt as readers do.
                    const autoFontPx = field.autoFontSize
                      ? Math.max(
                          4 * pointPx,
                          field.multiLine
                            ? Math.min(12 * pointPx, (fieldHeightPx - 2 * borderPx - 2) / 1.35)
                            : (fieldHeightPx - 2 * borderPx - 2) / 1.35,
                        )
                      : null;
                    // The widget's own /MK /R turns its text back: a field
                    
                    const textTurn =
                      (((page.nativeRotation - (field.widgetRotation ?? 0)) % 360) + 360) % 360;
                    const rotatedTextStyle =
                      textTurn === 90
                        ? { writingMode: "vertical-rl" as const, textOrientation: "sideways" as const }
                        : textTurn === 270
                          ? { writingMode: "sideways-lr" as never }
                          : textTurn === 180
                            ? { transform: "rotate(180deg)" }
                            : {};
                    const textFieldStyle = {
                      ...style,
                      textAlign: field.alignment,
                      ...rotatedTextStyle,
                      ...(field.fontFamily ? { fontFamily: field.fontFamily } : {}),
                      ...(autoFontPx !== null ? { fontSize: `${autoFontPx}px` } : {}),
                      ...(field.textColor
                        ? { color: field.textColor }
                        : {}),
                      ...(field.backgroundColor
                        ? { backgroundColor: field.backgroundColor }
                        : {}),
                      ...(field.borderColor
                        ? { borderColor: field.borderColor }
                        : {}),
                      ...(field.borderWidth !== null
                        ? {
                            borderStyle: "solid" as const,
                            borderWidth: `${field.borderWidth * pointPx}px`,
                          }
                        : {}),
                      ...(field.fontSize !== null
                        ? { fontSize: `${field.fontSize * pointPx}px` }
                        : {}),
                      ...(!field.scrollable
                        ? { overflow: "hidden" as const }
                        : {}),
                    };
                    const combCellCount = combActive ? field.maxLen! : 0;
                    const combFieldWidthPx =
                      (field.percent.width / 100) * page.width * scale;
                    const combFontPx =
                      autoFontPx ??
                      (field.fontSize !== null ? field.fontSize * pointPx : 12);
                    const combCellPx =
                      combCellCount > 0 ? combFieldWidthPx / combCellCount : 0;
                    // An average proportional glyph is about 0.6 em wide;
                    // spacing the hidden text to the cell pitch keeps the
                    // caret and the selection inside the right cell.
                    const combLetterSpacingPx = Math.max(
                      0,
                      combCellPx - combFontPx * 0.6,
                    );
                    const applyTextFieldChange = (
                      target: HTMLInputElement | HTMLTextAreaElement,
                    ) => {
                      // What the field showed before this edit: a held
                      // draft, else the stored text.
                      const shownText = formRangeDrafts[field.name] ?? rawText;
                      // A keystroke the field's own input rule refuses
                      
                      if (
                        field.keystrokeRule &&
                        !keystrokePartialOk(field.keystrokeRule, target.value)
                      ) {
                        target.value = shownText;
                        return;
                      }
                      if (
                        !pdfTextFieldTakesEdit(target, shownText, {
                          scrollable: field.scrollable,
                          combActive,
                        })
                      ) {
                        target.value = shownText;
                        target.scrollLeft = 0;
                        target.scrollTop = 0;
                        return;
                      }
                      handleFormFieldChange(
                        field,
                        target.value,
                        page.pageNumber,
                      );
                    };
                    const keepTextFieldViewportFixed = (
                      target: HTMLInputElement | HTMLTextAreaElement,
                    ) => {
                      if (field.scrollable) return;
                      target.scrollLeft = 0;
                      target.scrollTop = 0;
                    };
                    if (field.multiLine && !field.password && !combActive) {
                      return (
                        <textarea
                          key={field.id}
                          className="pdf-viewer__form-field pdf-viewer__form-text pdf-viewer__form-textarea"
                          data-testid="pdf-form-field"
                          data-pdf-fill-field-id={field.id}
                          data-field-type="text"
                          data-field-scrollable={
                            field.scrollable ? "true" : "false"
                          }
                          data-field-alignment={field.alignment}
                          data-field-font-size={field.fontSize ?? "auto"}
                          data-field-text-color={
                            field.textColor ?? "default"
                          }
                          data-field-background-color={
                            field.backgroundColor ?? "default"
                          }
                          data-field-border-color={
                            field.borderColor ?? "default"
                          }
                          data-field-border-width={
                            field.borderWidth ?? "default"
                          }
                          data-field-visibility={field.visibility}
                          style={touchTextFieldStyle(textFieldStyle, combFontPx, coarsePointer)}
                          value={formRangeDrafts[field.name] ?? textValue}
                          aria-invalid={
                            Object.hasOwn(formRangeDrafts, field.name) || undefined
                          }
                          disabled={disabled}
                          required={field.required}
                          maxLength={acroFormTextInputMaxLength(field.maxLen)}
                          spellCheck={field.spellCheck}
                          aria-required={field.required}
                          aria-label={fieldAccessibleName}
                          title={fieldTitle}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={() => {
                            setFocusedFormField(field.name);
                            beginNativeFormFieldGesture(field.name);
                          }}
                          onBlur={() => {
                            setFocusedFormField((current) =>
                              current === field.name ? null : current,
                            );
                            // A number still outside the field's range
                            // when the field is left is refused now; the
                            // draft stays on screen to be corrected.
                            if (
                              (field.rangeValidation || field.keystrokeRule) &&
                              Object.hasOwn(formRangeDrafts, field.name)
                            ) {
                              setFormValidationNotice({
                                fieldName: field.name,
                                ...(field.rangeValidation
                                  ? { range: field.rangeValidation }
                                  : {}),
                                ...(field.keystrokeRule
                                  ? { keystroke: field.keystrokeRule }
                                  : {}),
                              });
                            }
                            finishNativeFormFieldGesture(field.name);
                          }}
                          onScroll={(event) =>
                            keepTextFieldViewportFixed(event.currentTarget)
                          }
                          onChange={(event) =>
                            applyTextFieldChange(event.currentTarget)
                          }
                        />
                      );
                    }
                    const combCells =
                      combActive && focusedFormField === field.name ? (
                        <div
                          key={`${field.id}:comb`}
                          className="pdf-viewer__form-comb-cells"
                          data-testid="pdf-form-comb-cells"
                          aria-hidden="true"
                          style={{
                            ...style,
                            // The shared style only carries the box; the
                            // input gets its `position` from its class.
                            // Without one here the cells were laid out in
                            // normal flow, at the page's top left, while
                            
                            position: "absolute",
                            boxSizing: "border-box",
                            margin: 0,
                            display: "grid",
                            gridTemplateColumns: `repeat(${combCellCount}, 1fr)`,
                            alignItems: "center",
                            pointerEvents: "none",
                            opacity: 1,
                            fontSize: `${combFontPx}px`,
                            ...(field.fontFamily
                              ? { fontFamily: field.fontFamily }
                              : {}),
                            color: field.textColor ?? "#0f172a",
                            zIndex: 1,
                          }}
                        >
                          {Array.from(textValue)
                            .slice(0, combCellCount)
                            .map((character, cellIndex) => (
                              <span
                                key={cellIndex}
                                className="pdf-viewer__form-comb-cell"
                                style={{ textAlign: "center", overflow: "hidden" }}
                              >
                                {field.password ? "•" : character}
                              </span>
                            ))}
                        </div>
                      ) : null;
                    return (
                      <Fragment key={field.id}>
                      <input
                        key={field.id}
                        type={field.password ? "password" : "text"}
                        // A number or percent field brings up the decimal
                        
                        inputMode={
                          formatSpec && formatSpec.kind !== "date"
                            ? "decimal"
                            : undefined
                        }
                        className="pdf-viewer__form-field pdf-viewer__form-text"
                        data-testid="pdf-form-field"
                        data-pdf-fill-field-id={field.id}
                        data-field-type="text"
                        data-field-password={
                          field.password ? "true" : undefined
                        }
                        data-field-session-only={
                          field.password ? "true" : undefined
                        }
                        data-field-comb={combActive ? "true" : undefined}
                        data-field-scrollable={
                          field.scrollable ? "true" : "false"
                        }
                        data-field-alignment={field.alignment}
                        data-field-font-size={field.fontSize ?? "auto"}
                        data-field-text-color={field.textColor ?? "default"}
                        data-field-background-color={
                          field.backgroundColor ?? "default"
                        }
                        data-field-border-color={
                          field.borderColor ?? "default"
                        }
                        data-field-border-width={
                          field.borderWidth ?? "default"
                        }
                        data-field-visibility={field.visibility}
                        style={touchTextFieldStyle(
                          combActive
                            ? {
                                ...textFieldStyle,
                                backgroundImage:
                                  "linear-gradient(to right, transparent calc(100% - 1px), color-mix(in srgb, currentColor 22%, transparent) calc(100% - 1px))",
                                backgroundSize: `${100 / field.maxLen!}% 100%`,
                                backgroundRepeat: "repeat-x",
                                fontVariantNumeric: "tabular-nums",
                                // The input keeps the caret and the
                                // selection; the characters themselves
                                // are drawn per cell by the overlay
                                // below, so a proportional face never
                                // bunches them in the first cells
                                
                                // caret near its cell.
                                color: "transparent",
                                caretColor: field.textColor ?? "#0f172a",
                                letterSpacing: `${combLetterSpacingPx}px`,
                              }
                            : field.password
                              ? Object.assign({}, textFieldStyle, {
                                  // The control paints a password field
                                  // itself, masked (pdf-viewer.css).
                                  "--pdf-form-password-color":
                                    field.textColor ?? "#000",
                                  "--pdf-form-password-border":
                                    field.borderColor ?? "transparent",
                                  "--pdf-form-password-background":
                                    field.backgroundColor ?? "transparent",
                                })
                              : textFieldStyle,
                          combFontPx,
                          coarsePointer,
                        )}
                        value={formRangeDrafts[field.name] ?? textValue}
                        aria-invalid={
                          Object.hasOwn(formRangeDrafts, field.name) || undefined
                        }
                        disabled={disabled}
                        required={field.required}
                        maxLength={acroFormTextInputMaxLength(field.maxLen)}
                        autoComplete={field.password ? "off" : undefined}
                        spellCheck={!field.password && field.spellCheck}
                        aria-required={field.required}
                        aria-label={fieldAccessibleName}
                        title={
                          field.password
                            ? t("pdfViewer.formPasswordSessionOnly")
                            : fieldTitle
                        }
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => {
                          setFocusedFormField(field.name);
                          beginNativeFormFieldGesture(field.name);
                        }}
                        onBlur={() => {
                          setFocusedFormField((current) =>
                            current === field.name ? null : current,
                          );
                          // An entry the field's range or input rule does
                          // not accept yet is refused when the field is
                          // left; the draft stays to be corrected
                          
                          if (
                            (field.rangeValidation || field.keystrokeRule) &&
                            Object.hasOwn(formRangeDrafts, field.name)
                          ) {
                            setFormValidationNotice({
                              fieldName: field.name,
                              ...(field.rangeValidation
                                ? { range: field.rangeValidation }
                                : {}),
                              ...(field.keystrokeRule
                                ? { keystroke: field.keystrokeRule }
                                : {}),
                            });
                          }
                          finishNativeFormFieldGesture(field.name);
                        }}
                        onScroll={(event) =>
                          keepTextFieldViewportFixed(event.currentTarget)
                        }
                        onChange={(event) =>
                          applyTextFieldChange(event.currentTarget)
                        }
                      />
                      {combCells}
                      </Fragment>
                    );
                  })}
                  {/* The form's roles while it is filled: each field marked
                      in its role's colour (ONLYOFFICE colours them so), one
                      another role fills tinted and named. */}
                  {formMode && formFieldRoles.size > 0
                    ? pageFormFields.map((field) => {
                        const role = formFieldRoles.get(field.id);
                        if (!role || field.visibility === "printOnly" || field.visibility === "hidden") return null;
                        const locked = !pdfFormFieldFillableAs(role, formFillRole);
                        return (
                          <span
                            key={`role-${field.id}`}
                            aria-hidden="true"
                            title={locked ? t("pdfForm.roleLockedField", { role: role.name }) : role.name}
                            data-testid="pdf-form-field-role-marker"
                            data-role={role.name}
                            data-locked={locked ? "true" : undefined}
                            style={{
                              position: "absolute",
                              left: `${field.percent.x}%`,
                              top: `${field.percent.y}%`,
                              width: `${field.percent.width}%`,
                              height: `${field.percent.height}%`,
                              boxSizing: "border-box",
                              border: `2px solid ${role.color}`,
                              background: locked ? `${role.color}1F` : undefined,
                              pointerEvents: locked ? "auto" : "none",
                              cursor: locked ? "not-allowed" : undefined,
                            }}
                          />
                        );
                      })
                    : null}
                </div>
              ) : null}
              {fieldCandidates && fieldCandidates.length > 0 ? (
                <div
                  className="pdf-viewer__detect-layer"
                  data-testid="pdf-detect-layer"
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                  }}
                >
                  {fieldCandidates
                    .filter((c) => c.page === page.pageNumber)
                    .map((c) => {
                      const rejected = rejectedCandidates.has(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          data-testid="pdf-detect-candidate"
                          data-candidate-name={c.name}
                          data-candidate-kind={c.kind}
                          aria-pressed={!rejected}
                          title={`${c.name} · ${c.reason}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectedCandidates((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.name)) next.delete(c.name);
                              else next.add(c.name);
                              return next;
                            });
                          }}
                          style={{
                            position: "absolute",
                            left: `${c.x * 100}%`,
                            top: `${c.y * 100}%`,
                            width: `${c.width * 100}%`,
                            height: `${c.height * 100}%`,
                            pointerEvents: "auto",
                            // Rejected candidates stay VISIBLE and struck
                            // through rather than disappearing, so undoing a
                            // mis-click does not mean re-running detection.
                            border: rejected
                              ? "1px dashed #9ca3af"
                              : "2px dashed #2563eb",
                            background: rejected
                              ? "transparent"
                              : "rgba(37, 99, 235, 0.12)",
                            borderRadius: c.kind === "checkbox" ? 2 : 3,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                      );
                    })}
                </div>
              ) : null}
              <div
                data-pdf-signature-layer
                className="pdf-viewer__signature-layer"
                data-testid="pdf-signature-layer"
              >
                {pageSignatures.map((sig) => {
                  const heldSignature = heldPlacedBox(`signature:${sig.id}`, sig);
                  const boxStyle = {
                    left: `${heldSignature.x}%`,
                    top: `${heldSignature.y}%`,
                    width: `${heldSignature.width}%`,
                    height: `${heldSignature.height}%`,
                  } as const;
                  return (
                    <button
                      type="button"
                      key={sig.id}
                      className="pdf-viewer__signature"
                      data-testid="pdf-signature"
                      data-signature-kind={sig.kind}
                      data-native-signature={
                        managedNativeSignatureIdSet.has(sig.id)
                          ? "true"
                          : undefined
                      }
                      aria-label={`${t("pdfSign.imageAlt")}. ${t("pdfSign.note")}`}
                      aria-pressed={
                        selectedPlaced?.kind === "signature" &&
                        selectedPlaced.id === sig.id
                      }
                      disabled={signSaving || !annotationContextWritable}
                      style={{
                        ...boxStyle,
                        cursor: annotationContextWritable
                          ? "pointer"
                          : "default",
                        // Once selected, the body belongs to the frame
                        // beneath (the move surface): the object's own
                        // hit box would otherwise sit over it (z 8 > 7)
                        // and a drag from inside could never start.
                        pointerEvents:
                          annotationContextWritable &&
                          !(
                            selectedPlaced?.kind === "signature" &&
                            selectedPlaced.id === sig.id
                          )
                            ? "auto"
                            : "none",
                        // The saved angle plus the turn in progress.
                        transform: (() => {
                          const saved = normalizeSignatureObjectRotation(
                            sig.objectRotation,
                          );
                          const angle =
                            saved +
                            heldPlacedRotation(
                              `signature:${sig.id}`,
                              String(saved),
                            );
                          return angle === 0
                            ? undefined
                            : `rotate(${angle}deg)`;
                        })(),
                        transformOrigin: "center center",
                        ...(managedSignatureAppearanceReady &&
                        managedNativeSignatureIdSet.has(sig.id) &&
                        !pdfLive?.active(page.pageNumber, `signature:${sig.id}`)
                          ? { opacity: 0 }
                          : null),
                      }}
                      onClick={(e) => {
                        // Select for move/resize (frame + handles).
                        e.stopPropagation();
                        selectPlacedAnnotation({
                          kind: "signature",
                          id: sig.id,
                        });
                      }}
                    >
                      {sig.kind !== "typed" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="pdf-viewer__signature-image"
                          src={sig.image}
                          alt={t("pdfSign.imageAlt")}
                          data-testid="pdf-signature-image"
                          draggable={false}
                        />
                      ) : (
                        // Plain text node in an allow-listed font — never
                        // innerHTML.
                        <span
                          className="pdf-viewer__signature-text"
                          data-testid="pdf-signature-text"
                          style={{
                            fontFamily: resolveSignatureFont(sig.font),
                          }}
                        >
                          {sig.text}
                        </span>
                      )}
                    </button>
                  );
                })}
                {pagePendingSignature ? (
                  <SignatureComposer
                    key={`sign-${page.pageNumber}-${pagePendingSignature.x}-${pagePendingSignature.y}`}
                    x={pagePendingSignature.x}
                    y={pagePendingSignature.y}
                    draft={signDraft}
                    initialMode={signatureComposerMode}
                    onChange={setSignDraft}
                    saving={signSaving}
                    onConfirm={(finalDraft) =>
                      void handleSignatureConfirm(finalDraft)
                    }
                    onCancel={handleSignatureCancel}
                  />
                ) : null}
              </div>
              <div
                data-pdf-stamp-layer
                // Reuse the signature layer's positioning/z-order CSS —
                // stamps live on the same visual layer as signatures.
                className="pdf-viewer__signature-layer"
                data-testid="pdf-stamp-layer"
              >
                {pageStamps.map((st) => {
                  // The stamp's paint; its click target (and delete button)
                  // is in the page's annotation stack, at its place in the
                  // /Annots order.
                  const presetEntry =
                    st.kind === "preset"
                      ? resolveStampPreset(st.preset)
                      : null;
                  const stampColor = stampAnnotationColor(st);
                  const held = heldPlacedBox(`stamp:${st.id}`, st);
                  return (
                    <div
                      key={st.id}
                      className="pdf-viewer__signature"
                      aria-hidden
                      data-testid="pdf-stamp-paint"
                      style={{
                        left: `${held.x}%`,
                        top: `${held.y}%`,
                        width: `${held.width}%`,
                        height: `${held.height}%`,
                        pointerEvents: "none",
                        ...(managedStampAppearanceReady &&
                        managedNativeStampIdSet.has(st.id) &&
                        !pdfLive?.active(page.pageNumber, `stamp:${st.id}`)
                          ? { opacity: 0 }
                          : null),
                      }}
                    >
                      {pdfStampContent(st, presetEntry?.text ?? "", stampColor, t("pdfStampTool.imageAlt"), false)}
                    </div>
                  );
                })}
              </div>
              <div
                data-pdf-redaction-layer
                className="pdf-viewer__redaction-layer"
                data-testid="pdf-redaction-layer"
              >
                {pageRedactions.map((red) => (
                  <div
                    key={red.id}
                    className="pdf-viewer__redaction pdf-viewer__redaction--marked"
                    data-testid="pdf-redaction"
                    style={{
                      position: "absolute",
                      ...(() => {
                        const held = heldPlacedBox(`redaction:${red.id}`, red);
                        return {
                          left: `${held.x}%`,
                          top: `${held.y}%`,
                          width: `${held.width}%`,
                          height: `${held.height}%`,
                        };
                      })(),
                      // Clickable to select/delete only while NOT in redact
                      // mode, so a drag never grabs an existing box.
                      pointerEvents:
                        !annotationContextWritable ||
                        redactMode ||
                        // Selected: the frame beneath takes the drag.
                        (selectedPlaced?.kind === "redaction" &&
                          selectedPlaced.id === red.id)
                          ? "none"
                          : "auto",
                      cursor:
                        !annotationContextWritable || redactMode
                          ? undefined
                          : "pointer",
                    }}
                    onClick={(e) => {
                      if (redactMode || redactSaving) return;
                      // Select for move/resize (frame + handles).
                      e.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "redaction",
                        id: red.id,
                      });
                    }}
                  >
                    {!redactMode ? (
                      <button
                        type="button"
                        className="pdf-viewer__redaction-delete"
                        aria-label={t("pdfRedact.delete")}
                        title={t("pdfRedact.delete")}
                        data-testid="pdf-redaction-delete"
                        disabled={
                          redactSaving || !annotationContextWritable
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRedactionDelete(red.id);
                        }}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))}
                {redactionDrafts
                  .filter((draft) => draft.page === page.pageNumber)
                  .map((draft) => (
                    <div
                      key={draft.id}
                      className={`pdf-viewer__redaction pdf-viewer__redaction--pending pdf-viewer__redaction--draft${
                        draft.status === "failed"
                          ? " pdf-viewer__redaction--failed"
                          : ""
                      }`}
                      data-testid="pdf-redaction-draft"
                      data-status={draft.status}
                      role={draft.status === "failed" ? "alert" : undefined}
                      title={
                        draft.status === "failed"
                          ? draft.reason
                            ? t("pdfRedact.markFailedReason", {
                                reason: draft.reason,
                              })
                            : t("pdfRedact.markFailed")
                          : t("pdfRedact.markSaving")
                      }
                      style={{
                        position: "absolute",
                        left: `${draft.box.x}%`,
                        top: `${draft.box.y}%`,
                        width: `${draft.box.width}%`,
                        height: `${draft.box.height}%`,
                        pointerEvents:
                          draft.status === "failed" ? "auto" : "none",
                      }}
                    >
                      {draft.status === "failed" ? (
                        <div className="pdf-viewer__redaction-draft-bar">
                          <span data-testid="pdf-redaction-draft-reason">
                            {draft.reason
                              ? t("pdfRedact.markFailedReason", {
                                  reason: draft.reason,
                                })
                              : t("pdfRedact.markFailed")}
                          </span>
                          <button
                            type="button"
                            data-testid="pdf-redaction-draft-retry"
                            disabled={
                              redactSaving || !annotationContextWritable
                            }
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void saveRedactionDraft(draft.id);
                            }}
                          >
                            {t("pdfRedact.markRetry")}
                          </button>
                          <button
                            type="button"
                            data-testid="pdf-redaction-draft-discard"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              discardRedactionDraft(draft.id);
                            }}
                          >
                            {t("pdfRedact.markDiscard")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                {pageDrawingRedaction ? (
                  <div
                    className="pdf-viewer__redaction pdf-viewer__redaction--pending"
                    data-testid="pdf-redaction-pending"
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${pageDrawingRedaction.x}%`,
                      top: `${pageDrawingRedaction.y}%`,
                      width: `${pageDrawingRedaction.width}%`,
                      height: `${pageDrawingRedaction.height}%`,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </div>
              <PdfTextBoxViewLayer
                overlays={pageTextBoxViewOverlays}
                displayedPageHeight={displayedPageHeight}
                displayedPageWidth={displayedPageWidth}
                pixelsPerPoint={scale}
              />
              {nativeVectorMarquee.live?.page === page.pageNumber ? (
                <NativeVectorMarqueeBox initial={nativeVectorMarquee.live} followRef={nativeVectorMarquee.followRef} />
              ) : null}
              {/* Snapshot marquee preview (Acrobat "Take a Snapshot"). The
                  released rect is cropped from the canvas + copied — this is
                  just the live selection outline. */}
              {pageDrawingSnapshot && drawingSnapshot?.outline ? (
                <svg
                  className="pdf-viewer__snapshot-marquee"
                  data-testid="pdf-snapshot-marquee"
                  data-snapshot-shape="freeform"
                  aria-hidden
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 5,
                    overflow: "visible",
                  }}
                >
                  <polygon
                    points={drawingSnapshot.outline
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    fill="rgba(37, 99, 235, 0.12)"
                    stroke="#2563eb"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : pageDrawingSnapshot ? (
                <div
                  className="pdf-viewer__snapshot-marquee"
                  data-testid="pdf-snapshot-marquee"
                  data-snapshot-shape={drawingSnapshot?.shape ?? "rect"}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${pageDrawingSnapshot.x}%`,
                    top: `${pageDrawingSnapshot.y}%`,
                    width: `${pageDrawingSnapshot.width}%`,
                    height: `${pageDrawingSnapshot.height}%`,
                    border: "1.5px dashed #2563eb",
                    borderRadius:
                      drawingSnapshot?.shape === "ellipse"
                        ? "50%"
                        : drawingSnapshot?.shape === "rounded"
                          ? `${SNAPSHOT_ROUNDED_RADIUS_CSS}px`
                          : undefined,
                    background: "rgba(37, 99, 235, 0.12)",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
              ) : null}
              <PdfEraseOverlay
                page={page.pageNumber}
                size={
                  page.width > 0 && page.height > 0
                    ? rotated
                      ? { width: page.height, height: page.width }
                      : { width: page.width, height: page.height }
                    : null
                }
                tool={eraseTool}
              />
              <PdfSplitPageOverlay page={page.pageNumber} mode={splitPageMode} />
              {/* Released snapshot region: a faint outline anchoring the
                  ADDITIONAL "copy as LaTeX" action (Mathpix-style snip) —
                  the image was already copied by the release handler. */}
              {pageSnapshotLatex &&
              !rasterOutputAuthorityBlocked &&
              snapshotLatex &&
              visualMaskOutputAuthorityMatches(
                snapshotLatex.outputAuthority,
                renderedVisualMaskOutputAuthority,
              ) ? (
                null
              ) : null}
              {savedPageMeasurements.map(
                ({ measurement, displayPoints: committedPoints }) => {
                  // While its frame is dragged (and until the write
                  // lands) the measurement is drawn where the frame is.
                  const committedBox = measurementPointBox(committedPoints);
                  const heldBox = committedBox
                    ? heldPlacedBox(`measurement:${measurement.id}`, committedBox)
                    : null;
                  const heldTurn = heldPlacedRotation(
                    `measurement:${measurement.id}`,
                    JSON.stringify(measurement.points),
                  );
                  const turnedPoints =
                    heldTurn !== 0
                      ? rotateMeasurePoints(
                          committedPoints,
                          {
                            width: displayedPageWidth,
                            height: displayedPageHeight,
                          },
                          heldTurn,
                        )
                      : null;
                  const displayPoints = turnedPoints
                    ? turnedPoints
                    : committedBox && heldBox && heldBox !== committedBox
                      ? committedPoints.map((point) => ({
                          ...point,
                          x:
                            heldBox.x +
                            (committedBox.width > 0
                              ? ((point.x - committedBox.x) * heldBox.width) /
                                committedBox.width
                              : point.x - committedBox.x),
                          y:
                            heldBox.y +
                            (committedBox.height > 0
                              ? ((point.y - committedBox.y) * heldBox.height) /
                                committedBox.height
                              : point.y - committedBox.y),
                        }))
                      : committedPoints;
                  const labelPoint =
                    displayPoints[displayPoints.length - 1];
                  const selectionBox = measurementPointBox(displayPoints);
                  if (!labelPoint || !selectionBox) return null;
                  const pathPoints =
                    measurement.mode === "distance"
                      ? displayPoints
                      : [...displayPoints, displayPoints[0]];
                  return (
                    <div
                      aria-label={measurement.label}
                      data-pdf-measurement
                      data-testid="pdf-saved-measurement"
                      key={measurement.id}
                      role="group"
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        zIndex: 5,
                      }}
                    >
                      <button
                        type="button"
                        aria-label={measurement.label}
                        aria-pressed={
                          selectedPlaced?.kind === "measurement" &&
                          selectedPlaced.id === measurement.id
                        }
                        data-testid="pdf-measurement-select"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectPlacedAnnotation({
                            kind: "measurement",
                            id: measurement.id,
                          });
                        }}
                        style={{
                          position: "absolute",
                          left: `${selectionBox.x}%`,
                          top: `${selectionBox.y}%`,
                          width: `${selectionBox.width}%`,
                          height: `${selectionBox.height}%`,
                          minWidth: 12,
                          minHeight: 12,
                          border: 0,
                          padding: 0,
                          background: "transparent",
                          cursor: annotationContextWritable
                            ? "pointer"
                            : "default",
                          pointerEvents: annotationContextWritable
                            ? "auto"
                            : "none",
                        }}
                      />
                      <svg
                        aria-hidden
                        height="100%"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                        width="100%"
                      >
                        <polyline
                          fill={
                            measurement.mode === "area"
                              ? "rgba(37, 99, 235, 0.12)"
                              : "none"
                          }
                          points={pathPoints
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          stroke={measurement.color ?? "#2563eb"}
                          strokeWidth={0.4}
                          vectorEffect="non-scaling-stroke"
                        />
                        {displayPoints.map((point, index) => (
                          <circle
                            cx={point.x}
                            cy={point.y}
                            fill={measurement.color ?? "#2563eb"}
                            key={index}
                            r={0.7}
                          />
                        ))}
                      </svg>
                      <span
                        style={{
                          position: "absolute",
                          left: `${labelPoint.x}%`,
                          top: `${labelPoint.y}%`,
                          transform: "translate(-50%, calc(-100% - 4px))",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(17, 24, 39, 0.85)",
                          color: "#fff",
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {measurement.label}
                      </span>
                    </div>
                  );
                },
              )}
              {/* Active measure draft: vertices, path and live readout. */}
              {pageMeasurePoints && pageMeasurePoints.length > 0 ? (
                <svg
                  className="pdf-viewer__measure-layer"
                  data-testid="pdf-measure-layer"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                >
                  <polyline
                    points={pageMeasurePoints
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill={
                      measureKind === "area"
                        ? "rgba(37, 99, 235, 0.12)"
                        : "none"
                    }
                    stroke="#2563eb"
                    strokeWidth={0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                  {measureKind !== "distance" &&
                  pageMeasurePoints.length >= 2 ? (
                    <line
                      x1={pageMeasurePoints[pageMeasurePoints.length - 1].x}
                      y1={pageMeasurePoints[pageMeasurePoints.length - 1].y}
                      x2={pageMeasurePoints[0].x}
                      y2={pageMeasurePoints[0].y}
                      stroke="#2563eb"
                      strokeWidth={0.4}
                      strokeDasharray="1 1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {pageMeasurePoints.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={0.7}
                      fill="#2563eb"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              ) : null}
              {pageMeasureResult ? (
                <div
                  className="pdf-viewer__measure-readout"
                  data-testid="pdf-measure-readout"
                  style={{
                    position: "absolute",
                    left: 8,
                    top: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(17, 24, 39, 0.85)",
                    color: "#fff",
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    pointerEvents: "none",
                    zIndex: 6,
                  }}
                >
                  {pageMeasureResult.label}
                </div>
              ) : null}
              {/* The reader's own annotation layers share one stack, each object
                  at its place in the page's /Annots (styles/pdf-viewer.css). */}
              <div className="pdf-viewer__annotation-stack" data-testid="pdf-annotation-stack">
              {/* The click targets of the page's shapes, ink and stamps (its
                  own and those made here), each at its place in the page's
                  /Annots order among the text boxes, tables and charts: a
                  click where they overlap goes to the one a reader paints in
                  front. Their paint stays on its own layers. */}
              <div className="pdf-viewer__annotation-hits" data-testid="pdf-annotation-hits">
                {pageNativeSourceShapes.map((shape) => {
                  // A NoZoom shape keeps its point size on screen at any
                  // zoom; the canvas leaves it unpainted and it is drawn
                  
                  const display = nativeShapeDisplayGeometry(shape, scale);
                  const fixedOnScreen = Boolean(shape.nativeSource.flags?.noZoom);
                  const box = shapeBox(display);
                  const semanticRoute =
                    shape.nativeSource.subtype === "Square"
                      ? semanticAppearanceRouteFor(
                          page.pageNumber,
                          shape.nativeSource.objectRef,
                          "Square",
                          "native-shape",
                        )
                      : null;
                  return (
                    <svg
                      key={`nshape:${shape.id}`}
                      className="pdf-viewer__annotation-hit"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={annotationHitSvgStyle(`nshape:${shape.id}`)}
                    >
                    <g
                      key={shape.id}
                      role="button"
                      tabIndex={annotationContextWritable ? 0 : -1}
                      aria-disabled={!annotationContextWritable}
                      aria-label={t("pdfShape.select")}
                      className="pdf-viewer__native-source-shape-target"
                      data-testid="pdf-native-source-shape"
                      data-native-source-ref={shape.nativeSource.objectRef}
                      data-native-shape-nozoom={fixedOnScreen ? "true" : undefined}
                      data-semantic-appearance-surface={
                        semanticRoute?.surface
                      }
                      style={{
                        pointerEvents:
                          !annotationContextWritable ||
                          shapeMode ||
                          placementToolArmed ||
                          nativeSourceShapeSaving
                            ? "none"
                            : "all",
                        cursor: annotationContextWritable
                          ? shapeMode
                            ? "crosshair"
                            : "pointer"
                          : "default",
                      }}
                      onClick={(event) => {
                        if (
                          shapeMode ||
                          placementToolArmed ||
                          nativeSourceShapeSaving
                        ) {
                          return;
                        }
                        event.stopPropagation();
                        selectPlacedAnnotation({
                          kind: "nativeSourceShape",
                          id: shape.id,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        selectPlacedAnnotation({
                          kind: "nativeSourceShape",
                          id: shape.id,
                        });
                      }}
                    >
                      {/* Its NoZoom paint is the shape layer's; this copy only
                          takes the click. */}
                      {fixedOnScreen ? (
                        <g opacity={0}>{renderShapeSvg(display, shape.color, shape.width)}</g>
                      ) : null}
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        fill="transparent"
                        stroke="transparent"
                        
                        // else keeps a visible minimum on screen.
                        strokeWidth={shape.width === 0 ? 0 : Math.max(0.4, shape.width)}
                        vectorEffect="non-scaling-stroke"
                      />
                      <title>{t("pdfShape.select")}</title>
                    </g>
                    </svg>
                  );
                })}
                {pageShapes.map((shape) => (
                  <svg
                    key={`shape:${shape.id}`}
                    className="pdf-viewer__annotation-hit"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={annotationHitSvgStyle(`shape:${shape.id}`)}
                  >
                  <g
                    key={shape.id}
                    data-testid="pdf-shape"
                    transform={heldShapeTransform(shape)}
                    data-native-shape={
                      managedNativeShapeIdSet.has(shape.id)
                        ? "true"
                        : undefined
                    }
                    style={{
                      // Clickable to SELECT (move/resize/delete frame) only
                      // while NOT in shape mode (so a drawing drag never
                      // grabs an existing shape) and not while a
                      // save/delete is already in flight.
                      pointerEvents:
                        !annotationContextWritable ||
                        shapeMode ||
                        placementToolArmed ||
                        shapeSaving
                          ? "none"
                          : managedShapeAppearanceReady &&
                              managedNativeShapeIdSet.has(shape.id)
                            ? "all"
                            : "all",
                      cursor: annotationContextWritable
                        ? shapeMode
                          ? "crosshair"
                          : "pointer"
                        : "default",
                      // The click target only: the shape's paint is the
                      // shape layer's (pdf-shape-paint).
                      opacity: 0,
                    }}
                    onClick={(e) => {
                      if (shapeMode || placementToolArmed || shapeSaving) {
                        return;
                      }
                      e.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "shape",
                        id: shape.id,
                      });
                    }}
                  >
                    {(() => {
                      const box = shapeBox(shape);
                      const hitWidth = Math.max(box.width, 1);
                      const hitHeight = Math.max(box.height, 1);
                      return (
                        <rect
                          data-testid="pdf-shape-hit-target"
                          x={box.x - (hitWidth - box.width) / 2}
                          y={box.y - (hitHeight - box.height) / 2}
                          width={hitWidth}
                          height={hitHeight}
                          fill="transparent"
                          stroke="transparent"
                          pointerEvents="all"
                        />
                      );
                    })()}
                    {renderShapeSvg(shape, shape.color, shape.width)}
                    <title>{t("pdfShape.select")}</title>
                  </g>
                  </svg>
                ))}
                {pageNativeSourceInkStrokes.map((stroke, index) => {
                  const d = nativeInkPathD(stroke.points);
                  if (!d) return null;
                  const selected =
                    selectedPlaced?.kind === "nativeInk" &&
                    selectedPlaced.id === stroke.id;
                  const select = () =>
                    selectPlacedAnnotation({
                      kind: "nativeInk",
                      id: stroke.id,
                    });
                  return (
                    <svg
                      key={`nink:${stroke.id}`}
                      className="pdf-viewer__annotation-hit pdf-viewer__annotation-hit--ink"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={annotationHitSvgStyle(`nink:${stroke.id}`)}
                    >
                    <path
                      key={`native-source-${stroke.id ?? index}`}
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(
                        1.2,
                        nativeInkWidthToPercent(stroke.width, page),
                      )}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pdf-viewer__native-source-ink-target"
                      data-testid="pdf-native-source-ink-target"
                      role="button"
                      tabIndex={
                        onNativeSourceInkDelete ||
                        onNativeSourceInkTransform
                          ? 0
                          : -1
                      }
                      aria-label={
                        t("pdf.viewer.originalPdfInk")
                      }
                      aria-pressed={selected}
                      style={{
                        pointerEvents:
                          onNativeSourceInkDelete ||
                          onNativeSourceInkTransform
                          ? "stroke"
                          : "none",
                        cursor:
                          onNativeSourceInkDelete ||
                          onNativeSourceInkTransform
                          ? "pointer"
                          : "default",
                        outline: selected
                          ? "2px solid rgba(37, 99, 235, 0.85)"
                          : undefined,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        select();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        select();
                      }}
                    />
                    </svg>
                  );
                })}
                {pageInks.map((stroke) => {
                  const selected =
                    selectedPlaced?.kind === "ink" &&
                    selectedPlaced.id === stroke.id;
                  const select = () =>
                    selectPlacedAnnotation({
                      kind: "ink",
                      id: stroke.id,
                    });
                  const paint = readerInkPaint(stroke.points, stroke.width, stroke.color, page);
                  return (
                    <svg
                      key={`ink:${stroke.id}`}
                      className="pdf-viewer__annotation-hit pdf-viewer__annotation-hit--ink"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={annotationHitSvgStyle(`ink:${stroke.id}`)}
                    >
                    <path
                      key={stroke.id}
                      d={paint.d}
                      // The click target only: the stroke's paint is the
                      // ink layer's (pdf-ink-stroke-paint).
                      fill={paint.fill === "none" ? "none" : "transparent"}
                      stroke={paint.stroke === "none" ? "none" : "transparent"}
                      strokeWidth={paint.strokeWidth}
                      data-ink-pressure={paint.pressure ? "true" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      data-testid="pdf-ink-stroke"
                      role="button"
                      tabIndex={drawMode ? -1 : 0}
                      aria-label={
                        t("pdf.viewer.selectInkAnnotation")
                      }
                      aria-pressed={selected}
                      data-selected={selected ? "true" : undefined}
                      style={{
                        // Selection is non-destructive. Delete remains an
                        // explicit contextual/keyboard command.
                        // A pressure stroke is a filled outline: its
                        // fill is what takes the click.
                        pointerEvents: drawMode
                          ? "none"
                          : paint.pressure
                            ? "visiblePainted"
                            : "stroke",
                        cursor: drawMode ? "crosshair" : "pointer",
                      }}
                      onClick={(event) => {
                        if (drawMode) return;
                        event.stopPropagation();
                        select();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        select();
                      }}
                    >
                      <title>
                        {t("pdf.viewer.selectInkAnnotation")}
                      </title>
                    </path>
                    </svg>
                  );
                })}
                {pageNativeSourceFreeTexts.map((box) => (
                  <div
                    key={box.id}
                    role="button"
                    tabIndex={annotationContextWritable ? 0 : -1}
                    aria-disabled={!annotationContextWritable}
                    aria-label={box.text.slice(0, 80) || t("pdf.textbox.label")}
                    className="pdf-viewer__native-source-stamp-target pdf-viewer__annotation-hit"
                    data-testid="pdf-native-source-free-text"
                    data-native-source-ref={box.nativeSource.objectRef}
                    style={{
                      position: "absolute",
                      zIndex: annotationHitZ(`nfreetext:${box.id}`),
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      pointerEvents:
                        !annotationContextWritable ||
                        armedStamp ||
                        nativeSourceFreeTextSaving ||
                        // Selected: the frame beneath takes the drag.
                        (selectedPlaced?.kind === "nativeSourceFreeText" &&
                          selectedPlaced.id === box.id)
                          ? "none"
                          : "all",
                      cursor: annotationContextWritable ? "move" : "default",
                      // The page paints the box; this one only takes the
                      // click (anywhere in it, as WPS takes a text box).
                      background: "transparent",
                    }}
                    onClick={(event) => {
                      if (armedStamp || nativeSourceFreeTextSaving) return;
                      event.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "nativeSourceFreeText",
                        id: box.id,
                      });
                    }}
                    onDoubleClick={(event) => {
                      if (armedStamp || nativeSourceFreeTextSaving || !onNativeSourceFreeTextEdit) return;
                      event.stopPropagation();
                      // Its text is edited, as WPS takes a double-click on a
                      // text box comment.
                      onNativeSourceFreeTextEdit(box.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "nativeSourceFreeText",
                        id: box.id,
                      });
                    }}
                  />
                ))}
                {pageNativeSourceStamps.map((stamp) => (
                  <div
                    key={stamp.id}
                    role="button"
                    tabIndex={annotationContextWritable ? 0 : -1}
                    aria-disabled={!annotationContextWritable}
                    aria-label={t("pdfStampTool.modeToggle")}
                    className="pdf-viewer__native-source-stamp-target pdf-viewer__annotation-hit"
                    data-testid="pdf-native-source-stamp"
                    data-native-source-ref={stamp.nativeSource.objectRef}
                    style={{
                      position: "absolute",
                      zIndex: annotationHitZ(`nstamp:${stamp.id}`),
                      left: `${stamp.x}%`,
                      top: `${stamp.y}%`,
                      width: `${stamp.width}%`,
                      height: `${stamp.height}%`,
                      pointerEvents:
                        !annotationContextWritable ||
                        armedStamp ||
                        nativeSourceStampSaving ||
                        // Selected: the frame beneath takes the drag.
                        (selectedPlaced?.kind === "nativeSourceStamp" &&
                          selectedPlaced.id === stamp.id)
                          ? "none"
                          : "all",
                      cursor: annotationContextWritable
                        ? armedStamp
                          ? "crosshair"
                          : "pointer"
                        : "default",
                      // The page paints the stamp; this box only takes
                      // the click and shows its frame on hover (see
                      // pdf-viewer.css), never a second stamp.
                      background: "transparent",
                    }}
                    onClick={(event) => {
                      if (armedStamp || nativeSourceStampSaving) return;
                      event.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "nativeSourceStamp",
                        id: stamp.id,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ")
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      selectPlacedAnnotation({
                        kind: "nativeSourceStamp",
                        id: stamp.id,
                      });
                    }}
                  />
                ))}
                {pageStamps.map((st) => {
                  const presetEntry =
                    st.kind === "preset"
                      ? resolveStampPreset(st.preset)
                      : null;
                  const stampColor = stampAnnotationColor(st);
                  return (
                    <div
                      key={st.id}
                      className="pdf-viewer__signature pdf-viewer__annotation-hit"
                      data-testid="pdf-stamp"
                      data-stamp-kind={st.kind}
                      data-native-stamp={
                        managedNativeStampIdSet.has(st.id)
                          ? "true"
                          : undefined
                      }
                      style={{
                        ...(() => {
                          const held = heldPlacedBox(`stamp:${st.id}`, st);
                          return {
                            left: `${held.x}%`,
                            top: `${held.y}%`,
                            width: `${held.width}%`,
                            height: `${held.height}%`,
                          };
                        })(),
                        cursor: annotationContextWritable
                          ? "pointer"
                          : "default",
                        pointerEvents:
                          annotationContextWritable &&
                          !(
                            selectedPlaced?.kind === "stamp" &&
                            selectedPlaced.id === st.id
                          )
                            ? "auto"
                            : "none",
                        // Above the stamps and shapes made before it, below
                        // those made after (the page's /Annots order).
                        zIndex: annotationHitZ(`stamp:${st.id}`),
                      }}
                      onClick={(e) => {
                        // Select for move/resize (frame + handles).
                        e.stopPropagation();
                        selectPlacedAnnotation({
                          kind: "stamp",
                          id: st.id,
                        });
                      }}
                    >
                      {pdfStampContent(st, presetEntry?.text ?? "", stampColor, t("pdfStampTool.imageAlt"), true)}
                      <button
                        type="button"
                        className="pdf-viewer__signature-delete"
                        aria-label={t("pdfStampTool.delete")}
                        title={t("pdfStampTool.delete")}
                        data-testid="pdf-stamp-delete"
                        disabled={stampSaving || !annotationContextWritable}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStampDelete(st.id);
                        }}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
              {chartAuthoring ? (
                <PdfChartLayer
                  stackRanks={pageAnnotationStackRanks}
                  charts={chartAuthoring.charts.filter((chart) => chart.page === page.pageNumber)}
                  cssWidth={(rotated ? page.height : page.width) * scale}
                  cssHeight={(rotated ? page.width : page.height) * scale}
                  pageWidth={rotated ? page.height : page.width}
                  pageHeight={rotated ? page.width : page.height}
                  paintedDirectives={chartAuthoring.paintedDirectives}
                  themeAccents={chartAuthoring.themeAccents}
                  fileDrawnIds={chartAuthoring.fileDrawnIds}
                  writable={chartAuthoring.writable}
                  selectedId={chartSelectedId && chartAuthoring.charts.some((chart) =>
                    chart.id === chartSelectedId && chart.page === page.pageNumber) ? chartSelectedId : null}
                  onSelectionChange={(id) => onChartSelectionChange?.(id)}
                  onChange={(chart) => void chartAuthoring.onUpsert(chart)}
                  onDelete={(chart) => void chartAuthoring.onDelete(chart)}
                  preview={chartPreview}
                  t={t}
                />
              ) : null}
              {tableAuthoring ? (
                <PdfTableLayer
                  stackRanks={pageAnnotationStackRanks}
                  tables={tableAuthoring.tables.filter((table) => table.page === page.pageNumber)}
                  cssWidth={(rotated ? page.height : page.width) * scale}
                  cssHeight={(rotated ? page.width : page.height) * scale}
                  pxPerPoint={scale}
                  paintedDirectives={tableAuthoring.paintedDirectives}
                  writable={tableAuthoring.writable}
                  selection={tableSelection && tableAuthoring.tables.some((table) =>
                    table.id === tableSelection.tableId && table.page === page.pageNumber) ? tableSelection : null}
                  onSelectionChange={(next) => onTableSelectionChange?.(next)}
                  onChange={(table) => void tableAuthoring.onUpsert(table)}
                  onDelete={(table) => void tableAuthoring.onDelete(table)}
                  t={t}
                />
              ) : null}
              {textBoxAuthoring ? (
                <PdfReaderTextBoxLayer
                  stackRanks={pageAnnotationStackRanks}
                  authoring={textBoxAuthoring}
                  pageIndex={page.pageNumber - 1}
                  cssWidth={(rotated ? page.height : page.width) * scale}
                  cssHeight={(rotated ? page.width : page.height) * scale}
                  documentHeight={rotated ? page.width : page.height}
                  addMode={addTextMode}
                  createKind={addTextKind}
                  onPlaced={onAddTextPlaced}
                  onCreateTable={tableAuthoring?.writable ? (x, y, rows, columns) => {
                    const width = (rotated ? page.height : page.width);
                    const height = (rotated ? page.width : page.height);
                    const table = createPdfTable({
                      id: `table-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                      page: page.pageNumber,
                      x: Math.min(x, 0.95),
                      y: Math.min(y, 0.95),
                      rows,
                      columns,
                      pageAspect: width / height,
                      fontSize: 10.5 / height,
                    });
                    void tableAuthoring.onUpsert(table);
                    onTableSelectionChange?.({ tableId: table.id, row: 0, column: 0 });
                  } : undefined}
                  onCreateChart={chartAuthoring?.writable ? (x, y, family, subtype) => {
                    const width = (rotated ? page.height : page.width);
                    const height = (rotated ? page.width : page.height);
                    // PowerPoint's inserted chart: 5:3, half the page wide.
                    const frameWidth = Math.min(0.55, 1 - Math.min(x, 0.9));
                    const frameHeight = Math.min(1 - Math.min(y, 0.9), frameWidth * width / height * 0.6);
                    const chart = {
                      id: `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                      page: page.pageNumber,
                      x: Math.min(x, 0.9),
                      y: Math.min(y, 0.9),
                      width: frameWidth,
                      height: frameHeight,
                      attrs: createPresentationChartV2Leaf(family as ChartFamily, subtype as ChartSubtype,
                        t("toolbar.chartSampleTitle")) as unknown as Record<string, unknown>,
                      svg: null,
                    };
                    void chartAuthoring.onUpsert(chart);
                    onChartSelectionChange?.(chart.id);
                  } : undefined}
                  onCreateSmartArt={chartAuthoring?.writable ? (x, y, layoutId) => {
                    const width = (rotated ? page.height : page.width);
                    const height = (rotated ? page.width : page.height);
                    void pdfSmartArtInsertRecord({ layoutId, placeholders: smartArtPlaceholders, page: page.pageNumber,
                      x, y, pageWidthPt: width, pageHeightPt: height })
                      .then((made) => {
                        if (!made.ok) {
                          // Never truncated into another diagram: said instead.
                          toast({
                            title: made.reason === "too-many-members"
                              ? t("toolbar.smartartLayoutTooManyShapes", { count: made.memberCount ?? 0, max: DOCUMENT_SHAPE_MAX_GROUP_MEMBERS })
                              : t("toolbar.smartartLayoutCannotInsertedAsNative"),
                            variant: "destructive",
                          });
                          return;
                        }
                        void chartAuthoring.onUpsert(made.record);
                        onChartSelectionChange?.(made.record.id);
                      })
                      .catch(() => toast({ title: t("toolbar.smartartLayoutCannotInsertedAsNative"), variant: "destructive" }));
                  } : undefined}
                  t={t}
                />
              ) : null}
              </div>
              <div data-pdf-note-layer className="pdf-viewer__note-layer">
                {onNativeSourceTextNoteSelect
                  ? pageNativeSourceTextNotes.map((note) => {
                      const semanticRoute = semanticAppearanceRouteFor(
                        page.pageNumber,
                        note.nativeSource.objectRef,
                        "Text",
                        "native-note",
                      );
                      return (
                      <button
                        key={note.id}
                        type="button"
                        className="pdf-viewer__native-text-note-target"
                        data-testid="pdf-native-text-note-target"
                          data-semantic-appearance-surface={
                            semanticRoute?.surface
                          }
                        aria-label={`${t("pdfNote.title")}${
                          note.text
                            ? `: ${
                                note.text.length > 80
                                  ? `${note.text.slice(0, 80)}…`
                                  : note.text
                              }`
                            : ""
                        }`}
                        title={note.text || t("pdfNote.title")}
                        style={{
                          left: `${note.percent.x}%`,
                          top: `${note.percent.y}%`,
                          width: `${note.percent.width}%`,
                          height: `${note.percent.height}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNativeSourceTextNoteSelect(note.id);
                        }}
                      >
                        {note.nativeSource.hasAppearance === false ? (
                          // No /AP in the source: readers draw the
                          // standard icon for /Name in the /C colour,
                          
                          <svg
                            className="pdf-viewer__native-text-note-icon"
                            data-testid="pdf-native-text-note-icon"
                            data-native-note-icon={note.nativeSource.icon ?? "Note"}
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              d="M3 3.5A1.5 1.5 0 0 1 4.5 2h11A1.5 1.5 0 0 1 17 3.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V14H4.5A1.5 1.5 0 0 1 3 12.5v-9z"
                              fill={note.nativeSource.color ?? "#ffd400"}
                              stroke="#1f2937"
                              strokeWidth="1"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M6.5 6h7M6.5 9h5"
                              stroke="#1f2937"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : null}
                      </button>
                      );
                    })
                  : null}
                {pageNativeSourceTextNotes
                  .filter(
                    (note) =>
                      note.initiallyOpen && !closedInitialNotes.has(note.id),
                  )
                  .map((note) => (
                    <div
                      key={`open:${note.id}`}
                      className="pdf-viewer__native-text-note-open"
                      data-testid="pdf-native-text-note-open"
                      role="note"
                      aria-label={t("pdfNote.title")}
                      style={{
                        left: `${Math.min(note.percent.x + note.percent.width, 70)}%`,
                        top: `${note.percent.y}%`,
                      }}
                    >
                      <div className="pdf-viewer__native-text-note-open-head">
                        <span>{note.author || t("pdfNote.title")}</span>
                        <button
                          type="button"
                          aria-label={t("common.close")}
                          data-testid="pdf-native-text-note-open-close"
                          onClick={(event) => {
                            event.stopPropagation();
                            setClosedInitialNotes((current) =>
                              new Set(current).add(note.id),
                            );
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <p>{note.text}</p>
                    </div>
                  ))}
                {placedAttachments
                  .filter(
                    (attachment) => attachment.page === page.pageNumber,
                  )
                  .map((attachment) => {
                    const displayedPoint = rotateFractionPoint(
                      {
                        x: attachment.x / 100,
                        y: attachment.y / 100,
                      },
                      resolvedPageRotation(page.pageNumber),
                    );
                    return (
                      <PdfNoteMarker
                      key={attachment.id}
                      x={displayedPoint.x * 100}
                      y={displayedPoint.y * 100}
                      color="#4a70db"
                      label={attachment.name}
                      active={
                        selectedPlaced?.kind === "fileAttachment" &&
                        selectedPlaced.id === attachment.id
                      }
                      pageWidth={displayedPageWidth}
                      pageHeight={displayedPageHeight}
                      draggable={
                        !nativeFileAttachmentBusy &&
                        !nativeFileAttachmentDisabledReason &&
                        Boolean(onNativeFileAttachmentMove) &&
                        !drawMode &&
                        !redactMode &&
                        !shapeMode &&
                        !signMode &&
                        !noteMode &&
                        !linkMode &&
                        !snapshotMode &&
                        !measureMode
                      }
                      centered
                      testId="pdf-attachment-marker"
                      icon={pdfFileAttachmentIcon(attachment.icon)}
                      onSelect={() =>
                        selectPlacedAnnotation({
                          kind: "fileAttachment",
                          id: attachment.id,
                        })
                      }
                      onMove={(point) =>
                        handleMovePlacedAttachment(attachment.id, point)
                      }
                      onDelete={
                        onNativeFileAttachmentDelete
                            ? () =>
                                handleDeletePlacedAttachment(attachment.id)
                          : undefined
                      }
                      />
                    );
                  })}
                {pageNotes.map((n) => (
                  <PdfNoteMarker
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    color={n.color}
                    label={notePreview(n.text) || t("pdfNote.empty")}
                    active={activeNoteId === n.id}
                    pageWidth={displayedPageWidth}
                    pageHeight={displayedPageHeight}
                    // Drag-move only while no drawing/placement tool owns
                    // the page surface and no note save is in flight.
                    draggable={
                      !noteSaving &&
                      !drawMode &&
                      !redactMode &&
                      !shapeMode &&
                      !signMode &&
                      !noteMode &&
                      !linkMode &&
                      !snapshotMode &&
                      !measureMode
                    }
                    onSelect={() => {
                      handleNoteSelect(n.id);
                    }}
                    onMove={(point) => handleNoteMove(n.id, point)}
                  />
                ))}
                {pagePendingNote ? (
                  <span
                    className="pdf-viewer__note-marker pdf-viewer__note-marker--pending"
                    data-testid="pdf-note-marker-pending"
                    aria-hidden
                    style={{
                      left: `${pagePendingNote.x}%`,
                      top: `${pagePendingNote.y}%`,
                      color: pagePendingNote.color,
                    }}
                  >
                    <PdfNoteGlyph color={pagePendingNote.color} />
                  </span>
                ) : null}
                {pagePendingNote ? (
                  <NoteEditPopover
                    key={`pending-${page.pageNumber}-${pagePendingNote.x}-${pagePendingNote.y}`}
                    x={pagePendingNote.x}
                    y={pagePendingNote.y}
                    text=""
                    color={pagePendingNote.color}
                    isNew
                    mentions={commentMentions}
                    saving={noteSaving}
                    onSave={(next) => void handleNoteSave(next)}
                    onDelete={handleNoteClose}
                    onClose={handleNoteClose}
                  />
                ) : activeNote ? (
                  <NoteEditPopover
                    key={activeNote.id}
                    x={activeNote.x}
                    y={activeNote.y}
                    text={activeNote.text}
                    color={activeNote.color}
                    mentions={commentMentions}
                    saving={noteSaving}
                    deleting={noteSaving}
                    onSave={(next) => void handleNoteSave(next)}
                    onDelete={() => void handleNoteDelete()}
                    onClose={handleNoteClose}
                    resolved={activeNote.resolved}
                    onToggleResolved={() =>
                      void handleToggleNoteResolved(activeNote.id)
                    }
                    authorName={activeNote.author?.displayName}
                    replies={activeNote.replies}
                    replySaving={noteSaving}
                    onAddReply={(text) =>
                      void handleNoteAddReply(activeNote.id, text)
                    }
                  />
                ) : null}
              </div>
              {[...parkedCanvasObjectLifts, nativeVectorDragGhost].map((ghost) => {
                if (!ghost || ghost.pageNumber !== page.pageNumber) return null;
                const model = ghost.model;
                const mount = (canvas: HTMLCanvasElement) => (node: HTMLDivElement | null) => {
                  if (!node || canvas.parentElement === node) return;
                  Object.assign(canvas.style, {
                    display: "block",
                    width: "100%",
                    height: "100%",
                  });
                  node.replaceChildren(canvas);
                };
                // The drag stage: one canvas the size of the page canvas,
                // exactly over it, that never moves. With the model it
                // holds the page without the object where it started,
                // the object where it now is and what lies over its
                // start; before the model, the object's plain crop where
                // its frame is. Each pointer move repaints it in one
                // call, so nothing shown has a box that can fall behind
                // its pixels and the text that stands still stays put.
                // A lifted object's stage stays until it lands; one the
                // user has left (parked) stands under the one in hand.
                if (!model && !ghost.layers && !(ghost.family === "vector" && ghost.crop)) {
                  return null;
                }
                const parked = ghost !== nativeVectorDragGhost;
                return (
                  <div
                    key={ghost.lift ? `lift:${ghost.lift.id}` : "stage"}
                    aria-hidden="true"
                    className="pdf-viewer__native-vector-drag-ghost"
                    data-testid={parked ? "pdf-native-vector-parked-lift" : "pdf-native-vector-drag-ghost"}
                    data-stage="true"
                    data-ghost-source={ghost.layers ? "layers" : model ? "model" : "crop"}
                    data-settled={ghost.settled ? "true" : undefined}
                    data-lifted={ghost.lift ? "true" : undefined}
                    data-rotation={ghost.rotation % 360 === 0 ? undefined : ghost.rotation}
                    ref={mount(ghost.canvas)}
                    style={{ left: 0, top: 0, width: "100%", height: "100%" }}
                  />
                );
              })}
              {withCanvasObjectGhost(
                placedFrame,
                selectedPlaced
                  ? `${selectedPlaced.kind}:${selectedPlaced.id}`
                  : null,
              )}
              {withCanvasObjectGhost(
                selectedFormFieldFrame,
                selectedFormFieldContext
                  ? `formField:${selectedFormFieldContext.field.id}`
                  : null,
              )}
              {selectedLinkFrame}
              {nativeVectorVertexLayer ?? selectedNativeVectorFrame}
              {nativeVectorGroupFrame}
              {lineNumbersVisible && pageLineNumbers.length > 0 ? (
                <div
                  aria-label={t("toolbar.lineNumbers")}
                  data-page-number={page.pageNumber}
                  data-testid="pdf-line-number-layer"
                  role="list"
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    pointerEvents: "none",
                    zIndex: 6,
                  }}
                >
                  {pdfLineNumberLabels(
                    pageLineNumbers,
                    displayedPageHeight,
                    pdfLineNumberFontSize(scale),
                  ).map((line) => (
                    <span
                      aria-label={`${t("toolbar.lineNumbers")} ${line.number}`}
                      data-testid="pdf-line-number"
                      key={line.number}
                      role="listitem"
                      style={{
                        position: "absolute",
                        left: 3,
                        top: `${line.topPercent}%`,
                        transform: "translateY(-50%)",
                        minWidth: 18,
                        padding: "1px 4px",
                        borderRadius: 4,
                        background: "rgba(248, 250, 252, 0.9)",
                        boxShadow: "0 0 0 1px rgba(100, 116, 139, 0.18)",
                        color: "#475569",
                        // Scaled with the page; one overlapping the label
                        // above is left out (user audit PDF 0041).
                        fontSize: pdfLineNumberFontSize(scale),
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.2,
                        textAlign: "right",
                      }}
                    >
                      {line.number}
                    </span>
                  ))}
                </div>
              ) : null}
              <div key="pdf-page-text-layer" data-pdf-text-layer className="pdf-viewer__text-layer" />
              {dataItemId &&
              pdfOcrServerSourceAuthority !== null &&
              pdfOcrServerSourceAuthority.derived !== true &&
              ocrAnnotationHydrationReady &&
              capturePdfOcrDocumentAuthority(page.pageNumber) !== null &&
              (ocrCandidatePages.has(page.pageNumber) ||
                ocrReviewByPage.get(page.pageNumber)?.status ===
                  "pending_review" ||
                ocrReviewByPage.get(page.pageNumber)?.status ===
                  "rejected") &&
              !ocrRunsByPage.has(page.pageNumber) && false ? (
                // Scanned page (pdf.js text layer rendered empty) with no
                // stored OCR runs yet: offer explicit, user-triggered OCR.
                <button
                  type="button"
                  // A small page (a 140×40 label at 100%) was covered by the
                  // pill and its pictures could not be clicked (user audit
                  // PDF 0153): on one it shrinks to a corner badge.
                  className={`pdf-viewer__ocr-affordance${
                    (rotated ? page.width : page.height) * scale < 160 ||
                    (rotated ? page.height : page.width) * scale < 320
                      ? " pdf-viewer__ocr-affordance--compact"
                      : ""
                  }`}
                  data-testid="pdf-ocr-affordance"
                  disabled={
                    matchedSourceRiskSnapshot === null ||
                    ocrPendingPages.has(page.pageNumber) ||
                    ocrPreflightLoadingPage === page.pageNumber ||
                    (ocrReviewBusy &&
                      pendingOcrReview?.authority.pageNumber ===
                        page.pageNumber)
                  }
                  title={
                    ocrReviewByPage.get(page.pageNumber)?.status ===
                    "pending_review"
                      ? t("pdfViewer.ocrReviewTitle")
                      : t("pdfViewer.ocrRecognizeTitle")
                  }
                  onClick={(e) => {
                    // The page wrapper's own click handlers place
                    // notes/signatures — never let the OCR button trigger
                    // those.
                    e.stopPropagation();
                    ocrPreflightTriggerRef.current = e.currentTarget;
                    if (
                      ocrReviewByPage.get(page.pageNumber)?.status ===
                      "pending_review"
                    ) {
                      openOcrReview(page.pageNumber);
                    } else {
                      void requestOcrPreflight(page.pageNumber);
                    }
                  }}
                >
                  {ocrPendingPages.has(page.pageNumber)
                    ? t("pdfViewer.ocrRunning")
                    : ocrReviewByPage.get(page.pageNumber)?.status ===
                        "pending_review"
                      ? t("pdfViewer.ocrReview")
                      : ocrReviewByPage.get(page.pageNumber)?.status ===
                            "rejected" ||
                          ocrFailedPages.has(page.pageNumber)
                        ? t("pdfViewer.ocrRetry")
                        : t("pdfViewer.ocrRecognize")}
                </button>
              ) : null}
            </div>,
          ];
        })
      ) : null}
    </div>
  );
}
