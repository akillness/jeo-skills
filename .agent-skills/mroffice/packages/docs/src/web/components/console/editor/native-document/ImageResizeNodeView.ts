/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Drag-to-resize NodeView for the native-document image (Word / Google-Docs
 * corner-drag parity). Kept as a RAW ProseMirror NodeView (not React) because
 * the live preview is pure imperative DOM — we mutate the wrapper's pixel size
 * on every mousemove and commit ONE transaction on mouseup — which a React
 * reconciler would only get in the way of. It also mirrors the established
 * raw-PM NodeView already used for this image node, while the heavier React
 * NodeViews (whiteboard, math, etc.) stay reserved for nodes with React
 * content.
 *
 * The resize MATH lives in the pure, exported {@link resizeImageFromHandle} so
 * it is deterministically unit-testable with no DOM. The factory below is just
 * the DOM wiring (handles, selection, drag listeners) around that math.
 *
 * SIZE SOURCE OF TRUTH: a drag writes the numeric `width` / `height` (px) plus
 * their EMU twins `widthEmu` / `heightEmu` (= px * EMU_PER_PX) — the exact attrs
 * the server's Word writer reads first (widthEmu/heightEmu, then
 * width/height*9525). It also CLEARS the user-facing `widthPercent` preset so
 * the two never fight (an explicit drag is an absolute size, like Word). The
 * float / align attrs (`dataFloat` / `dataAlign`) are untouched, so wrap/align
 * keep applying via imageNodeViewWrapperAttributes. No second source of truth.
 *
 * ADDITIVE / byte-stable: nothing is written until a real drag commits, so an
 * image that is never resized serializes and exports byte-for-byte as before.
 */

import { SHEET_DORMANT_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetDormancy.ts";
import { PICTURE_LINE_EXTENT_ATTR } from "@mrnote/core/web/components/console/editor/native-document/inlinePicturePastLine.ts";
import { EMU_PER_PX } from "@mrnote/core/web/lib/office-units.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import {
  documentPictureDisplaySrc,
  documentPictureHomeKnown,
  onDocumentPictureReferencesRegistered,
} from "@mrnote/core/web/lib/document-picture-references.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import { officeArtisticEffectCss } from "@mrnote/core/web/lib/office-artistic-effects.ts";
import { beginObjectDragGesture } from "@mrnote/core/web/lib/object-drag-gesture.ts";
import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
} from "@mrnote/core/web/lib/pointer-capability.ts";
import { apiGet } from "@mrnote/core/web/lib/api.ts";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import chromeStyles from "./ImageSelectionChrome.module.css";
import { documentViewScale } from "@mrnote/core/web/components/console/editor/native-document/documentObjectResize.ts";
import { closeHistory } from "@tiptap/pm/history";
import {
  clampImageWidthPercentFree,
  documentPictureGeometry,
  documentPictureGeometryOverride,
  imageNodeViewWrapperAttributes,
  normalizeImageBorderColor,
  normalizeImageBorderStyle,
  normalizeImageBorderWidth,
  normalizeImageFlip,
  imagePictureStyleOutline,
  normalizeImagePictureStyle,
  normalizeImageRotation,
  sanitizeImageAltText,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";
import {
  commitDocumentImageCrop,
  documentImageCropDrawing,
  documentImageCropFrameSize,
  documentImageCropFromHandle,
  documentImageCropFromMove,
  documentImageCropInsets,
  documentImageCropped,
  documentImageCropSourceSize,
  DOCUMENT_IMAGE_CROP_HANDLES,
  exitDocumentImageCrop,
  readDocumentImageCropTarget,
  type DocumentImageCropHandle,
  type DocumentImageCropInsets,
} from "./documentImageCrop";
import {
  fitDrawingWithinPageBox,
  isInlineImagePageFitEligible,
  type DrawingPageFitResult,
  type DrawingSize,
} from "@mrnote/core/web/lib/paged-layout/drawingPageFit.ts";
import { buildNewPictureFit, isNewPictureAt } from "./newPictureFit";
import { UNEQUAL_COLUMN_FLOW_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/unequalColumnProjection.ts";
import { createDocumentPictureStyleLayer } from "./DocumentPictureStyleLayer";
import { officePictureGeometryPath } from "@mrnote/core/web/lib/office-picture-geometry.ts";
import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import { FLOAT_PAGE_ROOM_ATTR } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { PICTURE_FLOAT_CSS_ATTR } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import {
  beginDocumentLiveGesture,
  reapplyDocumentLiveFrame,
  registerDocumentLiveTarget,
  type DocumentLiveGesture,
} from "@mrnote/core/web/components/console/editor/native-document/documentLiveTransform.ts";
import { shortestTurn, type LiveTransformFrame } from "@mrnote/core/web/lib/collab/live-transform.ts";
import { normalizeLinkTitle } from "@mrnote/core/web/components/console/editor/native-document/linkPlaces.ts";
import { pictureFloatDataAttributes } from "@mrnote/core/web/components/console/editor/native-document/pictureFloat.ts";
import { normalizePictureLinkHref } from "@mrnote/core/web/components/console/editor/native-document/pictureLink.ts";
import { resolveInternalLinkTarget, scrollTocHeadingIntoView } from "./tocNavigationExtension";
import {
  imageFilterCss,
  isNativeImageRecolorMode,
  normalizeImageOpacity,
  resolveImageEffects,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import { inlinePictureLayoutRoom, pictureShadowFilter } from "./pictureLayoutEffects";
import { pictureLegacyLookStyle } from "./pictureLegacyLook";
import { normalizePicture3d, pictureEffectsCss } from "./pictureEffects";
import {
  officePictureThreeDPaint,
  officeShapeEffectsFilterRegion,
  type OfficeShapeEffectPrimitive,
} from "@mrnote/core/web/lib/office-shape-effects-paint.ts";
import { officePictureEffectsCss, officeSoftEdgeMaskImage } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { normalizeOfficeShadowEffect } from "@mrnote/core/web/lib/office-shadow-effects.ts";
import type { CSSProperties } from "react";
import { pictureDisplayLookCss } from "./pictureDisplayLook";
import { isPictureRecolorPreset, pictureRecolorFilterCss } from "./pictureRecolorFilter";
import { syncDraftPicturePending } from "./draftPicturePending";
import { startFloatingDrawingDrag } from "./floatDrawingDrag";
import { moveLiveDocumentDrawingBy } from "@mrnote/core/web/components/console/editor/native-document/chartPlacement.ts";
import { officeFrameAxesDelta } from "@mrnote/core/web/lib/office-object-frame.ts";
import { contentSkipped, whenContentShown } from "./paged/sheetSkipState";

/** EMU per CSS pixel at 96 dpi (Word's 9525). */
export { EMU_PER_PX };

/** Smallest on-screen image edge a drag may produce (keeps a grab target). */
export const MIN_IMAGE_PX = 16;

/** On the wrapper of a picture stored with both a width and a height. */
const PICTURE_FIXED_SIZE_ATTR = "data-picture-fixed-size";
/** An in-line picture its Exactly line clips (note-editor.css). */
const EXACT_LINE_PICTURE_ATTR = "data-exact-line-picture";

/** `window.__docsExactLinePictureOff = true`: an in-line picture on an
 * Exactly line raises the line to its own height, as before (A/B). */
function exactLinePictureOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsExactLinePictureOff?: boolean }).__docsExactLinePictureOff === true;
}

export interface ImageRuntimeStatusLabels {
  readonly loading: string;
  readonly failed: string;
  readonly resize: Readonly<Record<ImageResizeHandle, string>>;
  readonly crop: Readonly<Record<DocumentImageCropHandle, string>>;
  readonly rotate: string;
  /** Word's "Ctrl+Click to follow link" under a linked picture's ScreenTip. */
  readonly followLink: string;
  /** The caption of a picture an AI run is still drawing on a live draft. */
  readonly drawing?: string;
}

/** The eight resize handles. Corners are aspect-locked; edges resize one axis. */
export const IMAGE_RESIZE_HANDLES = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
] as const;

export type ImageResizeHandle = (typeof IMAGE_RESIZE_HANDLES)[number];

/** Does this handle move the right / bottom edge (drag grows with +dx / +dy)? */
function growsRight(handle: ImageResizeHandle): boolean {
  return handle === "ne" || handle === "e" || handle === "se";
}
function growsDown(handle: ImageResizeHandle): boolean {
  return handle === "sw" || handle === "s" || handle === "se";
}
/** A pure-horizontal edge handle ("w"/"e") changes width only. */
function isHorizontalEdge(handle: ImageResizeHandle): boolean {
  return handle === "e" || handle === "w";
}
/** A pure-vertical edge handle ("n"/"s") changes height only. */
function isVerticalEdge(handle: ImageResizeHandle): boolean {
  return handle === "n" || handle === "s";
}

export interface ResizeImageInput {
  /** Wrapper width (px) at drag start. */
  startWidth: number;
  /** Wrapper height (px) at drag start. */
  startHeight: number;
  /** Pointer delta from drag start (px). */
  dx: number;
  dy: number;
  handle: ImageResizeHandle;
  /**
   * Aspect ratio to preserve on corner drags, expressed as height / width.
   * When omitted/invalid it is derived from startHeight / startWidth.
   */
  ratio?: number;
  /** When true, corner drags break aspect (free resize). Default false. */
  free?: boolean;
  /** When true, an axis dragged past its opposite edge mirrors the picture
   * (`flipX` / `flipY`) instead of flooring at the minimum, as Word does.
   * Default false (the keyboard steps and older callers floor). */
  throughZero?: boolean;
  /** Upper bound for width (px) — the editor content width. Optional. */
  maxWidth?: number;
  /** Upper bound for height (px) — the current page content height. */
  maxHeight?: number;
}

export interface ResizeImageResult {
  /** New width (px), integer, clamped to [MIN_IMAGE_PX, maxWidth]. */
  width: number;
  /** New height (px), integer, >= MIN_IMAGE_PX. */
  height: number;
  /** width * EMU_PER_PX (kept in lockstep for the DOCX exporter). */
  widthEmu: number;
  /** height * EMU_PER_PX. */
  heightEmu: number;
  /** With `throughZero`: the drag crossed the opposite vertical edge, so the
   * picture is mirrored on x (its own flag toggles). Otherwise false. */
  flipX: boolean;
  /** With `throughZero`: the drag crossed the opposite horizontal edge. */
  flipY: boolean;
}

function finitePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * PURE resize math. Given the start size, a pointer delta and the active
 * handle, returns the new clamped width/height (px) and their EMU twins.
 *
 *   - Corner handles preserve the start aspect ratio (height = width * ratio),
 *     unless `free` is set (shift-drag), in which case width and height move
 *     independently with their own deltas.
 *   - Edge handles change a SINGLE dimension only (Word side-handle behaviour):
 *     left/right edges adjust width and leave height at its start value;
 *     top/bottom edges adjust height and leave width at its start value.
 *   - Width is clamped to [MIN_IMAGE_PX, maxWidth]; height to >= MIN_IMAGE_PX.
 *     An aspect-locked corner re-derives the height after the width clamp so
 *     the ratio holds at the bound. Never returns NaN/negative.
 */
export function resizeImageFromHandle(
  input: ResizeImageInput,
): ResizeImageResult {
  const startWidth = Math.max(
    MIN_IMAGE_PX,
    finitePositive(input.startWidth) ?? MIN_IMAGE_PX,
  );
  const startHeight = Math.max(
    MIN_IMAGE_PX,
    finitePositive(input.startHeight) ?? MIN_IMAGE_PX,
  );
  const ratio =
    finitePositive(input.ratio) ?? (startHeight / startWidth || 1);
  const dx = Number.isFinite(input.dx) ? input.dx : 0;
  const dy = Number.isFinite(input.dy) ? input.dy : 0;
  const { handle } = input;
  const maxWidth = finitePositive(input.maxWidth);
  const maxHeight = finitePositive(input.maxHeight);

  // Signed contribution of each pointer axis to its dimension for this handle.
  const widthDelta = growsRight(handle) ? dx : -dx;
  const heightDelta = growsDown(handle) ? dy : -dy;

  let width: number;
  let height: number;
  // Word mirrors a picture when a handle is dragged past the opposite side
  // in the same gesture: an axis whose extent the drag carried below zero is
  // the mirror, its size the distance past the edge (`throughZero`); without
  // it the extent floors at the minimum as before.
  let flipX = false;
  let flipY = false;
  const extent = (raw: number, axis: "x" | "y"): number => {
    if (!input.throughZero || raw >= 0) return raw;
    if (axis === "x") flipX = true;
    else flipY = true;
    return -raw;
  };

  if (isHorizontalEdge(handle)) {
    // Left/right edge: width only, height frozen at its start value.
    width = extent(startWidth + widthDelta, "x");
    height = startHeight;
  } else if (isVerticalEdge(handle)) {
    // Top/bottom edge: height only, width frozen at its start value.
    height = extent(startHeight + heightDelta, "y");
    width = startWidth;
  } else if (input.free) {
    // Free corner (shift-drag): break aspect, each axis its own delta.
    width = extent(startWidth + widthDelta, "x");
    height = extent(startHeight + heightDelta, "y");
  } else {
    // Aspect-locked corner: drive width by the pointer, height from the ratio
    // (the pointer's own vertical travel says whether that axis crossed).
    width = extent(startWidth + widthDelta, "x");
    extent(startHeight + heightDelta, "y");
    height = width * ratio;
  }

  // Clamp width, then re-derive the aspect-locked corner's height so the ratio
  // holds at the bound (corners with no `free`); edges keep their frozen axis.
  const lockedCorner =
    !input.free && !isHorizontalEdge(handle) && !isVerticalEdge(handle);
  width = Math.max(MIN_IMAGE_PX, width);
  if (maxWidth !== null)
    width = Math.min(width, Math.max(MIN_IMAGE_PX, maxWidth));
  if (lockedCorner) {
    if (maxHeight !== null) {
      width = Math.min(
        width,
        Math.max(MIN_IMAGE_PX, maxHeight / ratio),
      );
    }
    height = width * ratio;
  }
  height = Math.max(MIN_IMAGE_PX, height);
  // Word edge handles alter one axis only. Do not rewrite a frozen oversized
  // height on a horizontal drag; its page projection still fits safely.
  if (!isHorizontalEdge(handle) && maxHeight !== null) {
    height = Math.min(height, Math.max(MIN_IMAGE_PX, maxHeight));
  }

  const w = Math.round(width);
  const h = Math.round(height);
  return {
    width: w,
    height: h,
    widthEmu: w * EMU_PER_PX,
    heightEmu: h * EMU_PER_PX,
    flipX,
    flipY,
  };
}

function attrsDimensionPx(
  attrs: Record<string, unknown>,
  pxKey: "width" | "height",
  emuKey: "widthEmu" | "heightEmu",
): number | null {
  const px = finitePositive(Number(attrs[pxKey]));
  if (px !== null) return px;
  const emu = finitePositive(Number(attrs[emuKey]));
  return emu === null ? null : emu / EMU_PER_PX;
}

/**
 * Resolve the image's authored size and apply the page-box fit rule. Pure,
 * and it leaves attrs untouched: the result is a page projection, not an
 * edit to the picture's stored geometry.
 *
 * Word has two rules (measured in Word 16.86, Letter, 1 in margins). A
 * picture being INSERTED is stored fitted to the text area in both
 * directions; a picture that states no size here is one whose fitted size
 * has not been stored yet (newPictureFit stores it once the image loads), so
 * it is drawn fitted both ways. A picture whose STORED size is taller than
 * the text area is not scaled: it opens a page of its own at full size and
 * the paper's edge ends it (inline pictures 9.5, 12 and 20 in tall stayed
 * 684, 864 and 1440 pt). Wider is the same (Word 16.86, probe t-pic-wide,
 * Letter, 468 pt of text: pictures stored 520 and 700 pt wide stayed so, from
 * the paragraph's indent whatever its alignment, on past the margin and the
 * paper; corpus R282-D05's 468 pt picture with 7.5 pt of effect extent each
 * side kept 483 pt). A stated size is kept.
 */
export function imagePageProjectionSize(
  attrs: Record<string, unknown>,
  intrinsic: DrawingSize | null,
  pageBox: DrawingSize,
): DrawingPageFitResult | null {
  const explicitWidth = attrsDimensionPx(attrs, "width", "widthEmu");
  const explicitHeight = attrsDimensionPx(attrs, "height", "heightEmu");
  const intrinsicRatio =
    intrinsic &&
    finitePositive(intrinsic.width) !== null &&
    finitePositive(intrinsic.height) !== null
      ? intrinsic.height / intrinsic.width
      : null;
  const explicitRatio =
    explicitWidth !== null && explicitHeight !== null
      ? explicitHeight / explicitWidth
      : null;
  const ratio = explicitRatio ?? intrinsicRatio;
  const widthPercent = clampImageWidthPercentFree(attrs.widthPercent);

  let width: number | null = explicitWidth;
  let height: number | null = explicitHeight;
  if (widthPercent !== null) {
    width = (pageBox.width * widthPercent) / 100;
    height = ratio === null ? null : width * ratio;
  } else if (width === null && height === null && intrinsic) {
    width = intrinsic.width;
    height = intrinsic.height;
  } else if (width === null && height !== null && ratio !== null) {
    width = height / ratio;
  } else if (height === null && width !== null && ratio !== null) {
    height = width * ratio;
  }

  if (width === null || height === null) return null;
  const statedSize = widthPercent === null && (explicitWidth !== null || explicitHeight !== null);
  return fitDrawingWithinPageBox(
    { width, height },
    statedSize ? { width: Math.max(pageBox.width, width), height: Math.max(pageBox.height, height) } : pageBox,
  );
}

/** Current sheet's content box. Export uses the same dimensions in EMUs; the
 * screen path reads each section-decorated sheet independently. On a
 * newspaper-column page this is the whole text area, not the picture's
 * column: Word keeps an inline picture at its size, lets it run on under the
 * next column and covers it with that column's content (the paginator's
 * projection applies that rule). */
function pageContentBoxForImage(wrapper: HTMLElement): DrawingSize | null {
  const sheet = wrapper.closest<HTMLElement>(
    "article[data-page-sheet]",
  );
  if (!sheet) return null;
  const style = getComputedStyle(sheet);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const renderedWidth = sheet.clientWidth || sheet.getBoundingClientRect().width;
  const pageHeight =
    Number.parseFloat(style.minHeight) ||
    Number.parseFloat(style.getPropertyValue("--page-height-px"));
  const width = Math.max(0, renderedWidth - paddingLeft - paddingRight);
  const height = Math.max(0, pageHeight - paddingTop - paddingBottom);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The paragraph a Word "In Line with Text" picture stands in, when that
 * paragraph is a sheet's own block. */
function inlinePictureHost(node: ProseMirrorNode, wrapper: HTMLElement): HTMLElement | null {
  const parent = wrapper.parentElement;
  return node.isInline &&
    parent instanceof HTMLElement &&
    parent.parentElement?.matches("article[data-page-sheet]") === true
    ? parent
    : null;
}

/** The width text has in an element: its content box. */
function contentBoxWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    element.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  );
}

/**
 * The width of the text in the table cell a picture stands in (its own
 * paragraph's, else the cell's), or null outside a table. Word's Insert
 * Picture fits a picture to it, measured in Word 16.86: a 180 x 90 pt
 * picture put into a 72 pt fixed column is stored 71 x 35.5, into a 144 pt
 * column with 18 pt cell margins 108 x 54 (the column less its margins).
 */
function pictureCellTextWidth(wrapper: HTMLElement): number | null {
  const cell = wrapper.closest<HTMLElement>("td, th");
  if (!cell || !cell.closest("article[data-page-sheet]")) return null;
  const paragraph = wrapper.parentElement?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6");
  const host = paragraph && cell.contains(paragraph) ? paragraph : cell;
  const width = contentBoxWidth(host);
  return width > 0 ? width : null;
}

/**
 * The text area a picture of the page's flow stands in: the sheet's content
 * box, as wide as its own (possibly indented) paragraph for a picture among
 * a paragraph's words, or as the text in its table cell. Null off a sheet.
 */
function pictureTextArea(node: ProseMirrorNode, wrapper: HTMLElement): DrawingSize | null {
  const sheetBox = pageContentBoxForImage(wrapper);
  if (!sheetBox) return null;
  const cellWidth = pictureCellTextWidth(wrapper);
  if (cellWidth !== null) {
    return { width: Math.min(cellWidth, sheetBox.width), height: sheetBox.height };
  }
  // A picture whose document states its size keeps it in an indented
  // paragraph: Word lets it run on past the right margin (R31-D01, a 389pt
  // screenshot after a 150pt indent, drawn whole to the paper's edge). Only
  // Insert Picture fits a new picture to its paragraph.
  const attrs = node.attrs as Record<string, unknown>;
  const statedSize =
    clampImageWidthPercentFree(attrs.widthPercent) === null &&
    (attrsDimensionPx(attrs, "width", "widthEmu") !== null || attrsDimensionPx(attrs, "height", "heightEmu") !== null);
  if (statedSize) return sheetBox;
  const inlineHost = inlinePictureHost(node, wrapper);
  // In a newspaper column the paragraph is as wide as its track; Word does
  // not fit the picture to that (see pageContentBoxForImage).
  const columned = inlineHost?.parentElement?.hasAttribute(UNEQUAL_COLUMN_FLOW_ATTR) === true;
  if (inlineHost && !columned) {
    const hostWidth = contentBoxWidth(inlineHost);
    if (hostWidth > 0 && hostWidth < sheetBox.width) {
      return { width: hostWidth, height: sheetBox.height };
    }
  }
  return sheetBox;
}

function inlineImagePageFrame(
  node: ProseMirrorNode,
  wrapper: HTMLElement,
  img: HTMLImageElement,
): DrawingSize | null {
  const parent = wrapper.parentElement;
  const attrs = node.attrs as Record<string, unknown>;
  // A Word "In Line with Text" picture among a paragraph's runs fits the same
  // physical page box, narrowed to its (possibly indented) paragraph.
  const inlineHost = inlinePictureHost(node, wrapper);
  if (
    !(parent instanceof HTMLElement) ||
    (!inlineHost && !parent.matches("article[data-page-sheet]")) ||
    !isInlineImagePageFitEligible(
      attrs.dataFloat,
      attrs.officeDrawingKind,
    )
  ) {
    return null;
  }
  const pageBox = pictureTextArea(node, wrapper);
  if (!pageBox) return null;
  const imageStyle = getComputedStyle(img);
  const frame = {
    width: Math.max(
      0,
      pageBox.width -
        (Number.parseFloat(imageStyle.marginLeft) || 0) -
        (Number.parseFloat(imageStyle.marginRight) || 0),
    ),
    height: Math.max(
      0,
      pageBox.height -
        (Number.parseFloat(imageStyle.marginTop) || 0) -
        (Number.parseFloat(imageStyle.marginBottom) || 0),
    ),
  };
  return frame.width > 0 && frame.height > 0 ? frame : null;
}

/**
 * Refresh one top-level inline image's DOM-only page projection. Safe to call
 * from both the NodeView lifecycle and immediately before pagination
 * measurement. The authored node attrs and inline image styles are untouched;
 * CSS variables win only while the runtime marker is present.
 */
export function refreshInlineImagePageProjection(
  node: ProseMirrorNode,
  wrapper: HTMLElement,
): boolean {
  // A sleeping sheet's pictures stand as they were measured: asking wakes the
  // sheet, and every pass woke every sheet with a picture (WebKit: a page of
  // typing laid out and painted all of them; paged/sheetDormancy).
  if (wrapper.closest(`article[${SHEET_DORMANT_ATTR}]`)) return wrapper.hasAttribute("data-page-fit-inline-image");
  // Read everything first, then write only what changed: this runs for every
  // picture of every projected sheet each pass, and clearing the marker
  // before measuring the page box forced a style and layout recalc per
  // picture (WebKit, the 296-page book: ~28 s of forced reads).
  const fit = inlineImagePageFit(node, wrapper);
  const lineExtent = fit ? null : inlinePictureLineExtentPx(node, wrapper);
  const pastLine = lineExtent !== null && lineExtent > contentBoxWidth(inlinePictureHost(node, wrapper)!);
  const apply = (name: string, value: string | null) => {
    if (value === null) {
      if (wrapper.hasAttribute(name)) wrapper.removeAttribute(name);
    } else if (wrapper.getAttribute(name) !== value) {
      wrapper.setAttribute(name, value);
    }
  };
  const applyVar = (name: string, value: string | null) => {
    if (value === null) {
      if (wrapper.style.getPropertyValue(name)) wrapper.style.removeProperty(name);
    } else if (wrapper.style.getPropertyValue(name) !== value) {
      wrapper.style.setProperty(name, value);
    }
  };
  apply("data-page-fit-inline-image", fit ? "true" : null);
  apply("data-picture-past-line", pastLine ? "true" : null);
  // The picture's extent on its line, for a projector that lays its paragraph
  // out at another width (an unequal column's track) to judge it there.
  apply(PICTURE_LINE_EXTENT_ATTR, lineExtent !== null ? String(Math.round(lineExtent * 100) / 100) : null);
  apply("data-page-fit-scale", fit ? fit.scale.toFixed(6) : null);
  applyVar("--page-fit-image-width", fit ? `${fit.width}px` : null);
  applyVar("--page-fit-image-height", fit ? `${fit.height}px` : null);
  return fit !== null;
}

/** Whether an inline picture and its effect extent stand wider than their
 * paragraph's line. Nothing more fits on that line: what the editor draws after
 * the picture took a line of its own, and the page ran a line long under every
 * such picture (note-editor.css; corpus R282-D05: 27 px). */
function inlinePictureLineExtentPx(node: ProseMirrorNode, wrapper: HTMLElement): number | null {
  if (!isPictureNode(node)) return null;
  const host = inlinePictureHost(node, wrapper);
  const width = attrsDimensionPx(node.attrs as Record<string, unknown>, "width", "widthEmu");
  if (!host || width === null) return null;
  const room = (side: string) => Number.parseFloat(wrapper.style.getPropertyValue(`--picture-room-${side}`)) || 0;
  return width + room("left") + room("right");
}


/** The page fit an inline picture takes, read without writing (null when it
 * takes none). */
function inlineImagePageFit(
  node: ProseMirrorNode,
  wrapper: HTMLElement,
): { width: number; height: number; scale: number } | null {
  if (!isPictureNode(node)) return null;
  const attrs = node.attrs as Record<string, unknown>;
  // The direct-child caller already excludes imageRow. Keep the DOM guard for
  // NodeView lifecycle calls, and reject every non-empty/raw anchor value.
  if (
    !isInlineImagePageFitEligible(
      attrs.dataFloat,
      attrs.officeDrawingKind,
    ) ||
    wrapper.closest(".note-editor-image-row")
  ) {
    return null;
  }
  const img = wrapper.querySelector<HTMLImageElement>(":scope > img");
  if (!img) return null;
  const frame = inlineImagePageFrame(node, wrapper, img);
  if (!frame) return null;
  const intrinsic =
    img.naturalWidth > 0 && img.naturalHeight > 0
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : null;
  const projection = imagePageProjectionSize(attrs, intrinsic, frame);
  if (!projection?.fitted) return null;
  // Floor both axes so rounding can never put a drawing one CSS pixel past
  // the physical content edge. Only runtime CSS variables receive the fit.
  return {
    width: Math.max(1, Math.floor(projection.width)),
    height: Math.max(1, Math.floor(projection.height)),
    scale: projection.scale,
  };
}

// ---------------------------------------------------------------------------
// DOM wiring (raw ProseMirror NodeView). SSR-safe: only ever constructed inside
// the browser editor view, and all DOM access is guarded by that.
// ---------------------------------------------------------------------------

interface NodeViewArgs {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: (() => number | undefined) | boolean;
}

interface AttachmentImageUrlPayload {
  url: string;
}

function safeRuntimeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/** Best-effort natural ratio (h/w) of the rendered image, fallback to 1. */
/** The rotate-cw glyph the shared React rotation grip draws. */
function rotateGripIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "9");
  svg.setAttribute("height", "9");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of [
    "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
    "M21 3v5h-5",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function ratioFor(img: HTMLImageElement, wrapperRect: DOMRect): number {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw > 0 && nh > 0) return nh / nw;
  if (wrapperRect.width > 0 && wrapperRect.height > 0) {
    return wrapperRect.height / wrapperRect.width;
  }
  return 1;
}

/**
 * Build the raw PM NodeView for one image node. Exported so the extension's
 * `addNodeView` is a one-liner and so the wiring can be smoke-tested in jsdom.
 */
export function createImageResizeNodeView(
  { node, editor, getPos }: NodeViewArgs,
  labels: ImageRuntimeStatusLabels,
): NodeView {
  const wrapper = document.createElement("span");
  wrapper.className = `note-editor-image-resizable ${chromeStyles.host}`;
  // "In Line with Text": the picture is a glyph of its line. Its bottom edge
  // sits on the text baseline (see `[data-inline-picture]` in note-editor.css).
  if (node.isInline) wrapper.dataset.inlinePicture = "true";
  const img = document.createElement("img");
  img.draggable = false;
  wrapper.appendChild(img);
  // Format Picture > 3-D Format: the shapes' SVG 3-D filter on the picture's
  // own alpha (officePictureThreeDPaint), the deck's and the sheet's frame's.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const threeDFilterId = `document-picture-3d-${Math.random().toString(36).slice(2, 10)}`;
  let threeDSvg: SVGSVGElement | null = null;
  const applyPicture3d = (value: unknown, widthPx: number, heightPx: number): string => {
    const effects = normalizePicture3d(value);
    const size = { width: Math.max(1, widthPx), height: Math.max(1, heightPx) };
    const paint = effects ? officePictureThreeDPaint(effects, size) : null;
    // Its 3-D Rotation: the camera's turn (X / Y / Z over the camera's own).
    // (A variable the stylesheet puts on the raster, so Crop mode's own
    // transform still wins while the picture is cropped.)
    const turn = (effects ? officePictureEffectsCss({ rotation3d: effects.rotation3d }, size)?.wrapper.transform : "") || "";
    if (turn) wrapper.style.setProperty("--picture-3d-transform", String(turn));
    else wrapper.style.removeProperty("--picture-3d-transform");
    if (!paint) {
      threeDSvg?.remove();
      threeDSvg = null;
      return "";
    }
    if (!threeDSvg) {
      threeDSvg = document.createElementNS(SVG_NS, "svg");
      threeDSvg.setAttribute("width", "0");
      threeDSvg.setAttribute("height", "0");
      threeDSvg.setAttribute("aria-hidden", "true");
      threeDSvg.style.position = "absolute";
      threeDSvg.style.overflow = "hidden";
      wrapper.appendChild(threeDSvg);
    }
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", threeDFilterId);
    filter.setAttribute("color-interpolation-filters", "sRGB");
    for (const [name, attribute] of Object.entries(officeShapeEffectsFilterRegion(paint))) {
      filter.setAttribute(name, String(attribute));
    }
    const build = (primitive: OfficeShapeEffectPrimitive): Element => {
      const node = document.createElementNS(SVG_NS, primitive.tag);
      for (const [name, attribute] of Object.entries(primitive.attrs)) node.setAttribute(name, String(attribute));
      for (const child of primitive.children ?? []) node.appendChild(build(child));
      return node;
    };
    for (const primitive of paint.primitives) filter.appendChild(build(primitive));
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.appendChild(filter);
    threeDSvg.replaceChildren(defs);
    return `url(#${threeDFilterId})`;
  };
  // Its Soft Edges (`a:softEdge`): the shared ramp (`officeSoftEdgeMaskImage`)
  // as the first filter on the raster, so its reflection, shadow and glow
  // draw the softened picture (a CSS mask here hid the reflection).
  const softEdgeFilterId = `document-picture-soft-edge-${Math.random().toString(36).slice(2, 10)}`;
  let softEdgeSvg: SVGSVGElement | null = null;
  let softEdgeKey = "";
  const applySoftEdge = (rampPx: number, widthPx: number, heightPx: number): string => {
    if (!(rampPx > 0)) {
      softEdgeSvg?.remove();
      softEdgeSvg = null;
      softEdgeKey = "";
      return "";
    }
    const size = { width: Math.max(1, widthPx), height: Math.max(1, heightPx) };
    const key = `${rampPx}:${size.width}:${size.height}`;
    if (!softEdgeSvg) {
      softEdgeSvg = document.createElementNS(SVG_NS, "svg");
      softEdgeSvg.setAttribute("width", "0");
      softEdgeSvg.setAttribute("height", "0");
      softEdgeSvg.setAttribute("aria-hidden", "true");
      softEdgeSvg.setAttribute("data-picture-soft-edge", "");
      softEdgeSvg.style.position = "absolute";
      softEdgeSvg.style.overflow = "hidden";
      wrapper.appendChild(softEdgeSvg);
    }
    if (key !== softEdgeKey) {
      softEdgeKey = key;
      const filter = document.createElementNS(SVG_NS, "filter");
      filter.setAttribute("id", softEdgeFilterId);
      for (const [name, value] of Object.entries({
        x: "0",
        y: "0",
        width: "1",
        height: "1",
        filterUnits: "objectBoundingBox",
        primitiveUnits: "objectBoundingBox",
        "color-interpolation-filters": "sRGB",
      })) {
        filter.setAttribute(name, value);
      }
      const ramp = document.createElementNS(SVG_NS, "feImage");
      for (const [name, value] of Object.entries({
        href: officeSoftEdgeMaskImage(size, rampPx),
        x: "0",
        y: "0",
        width: "1",
        height: "1",
        preserveAspectRatio: "none",
        result: "softEdgeRamp",
      })) {
        ramp.setAttribute(name, value);
      }
      const keep = document.createElementNS(SVG_NS, "feComposite");
      keep.setAttribute("in", "SourceGraphic");
      keep.setAttribute("in2", "softEdgeRamp");
      keep.setAttribute("operator", "in");
      filter.append(ramp, keep);
      const defs = document.createElementNS(SVG_NS, "defs");
      defs.appendChild(filter);
      softEdgeSvg.replaceChildren(defs);
    }
    return `url(#${softEdgeFilterId})`;
  };
  // Office Picture Style drawing (shared renderer), painted over the raster.
  const pictureStyleLayer = createDocumentPictureStyleLayer(wrapper, null);
  let pictureStylePreview: string | null = null;
  // The selection frame shapes, SmartArt and charts wear
  // (OfficeDrawingSelection); print and measurement clones drop it with the
  // rest of the selection chrome.
  // The selection chrome (frame, grips, rotation grip, crop box) in a box of
  // its own that IS the picture's box (the --picture-chrome-* offsets, see
  // ImageSelectionChrome.module.css). The wrapper carries no rank and no turn
  // -- a float's rank and the picture's rotation go on the raster and its
  // drawings -- so the wrapper is no stacking context and the chrome paints
  // over every float on the page, as a selected picture's handles do in Word.
  const chrome = document.createElement("span");
  chrome.className = chromeStyles.chrome;
  chrome.contentEditable = "false";
  chrome.dataset.documentSelectionChrome = "true";
  chrome.dataset.testid = "document-picture-selection-chrome";
  wrapper.appendChild(chrome);
  /** The picture's turn, as a variable the raster, its drawings and the
   * chrome each apply about the picture's centre. */
  const setPictureTurn = (degrees: number) => {
    if (degrees === 0) wrapper.style.removeProperty("--picture-rotate");
    else wrapper.style.setProperty("--picture-rotate", `${degrees}deg`);
  };
  const selectionFrame = document.createElement("span");
  selectionFrame.className = `${officeDrawingSelectionStyles.frame} ${chromeStyles.frame}`;
  selectionFrame.setAttribute("aria-hidden", "true");
  selectionFrame.contentEditable = "false";
  selectionFrame.dataset.documentSelectionChrome = "true";
  chrome.appendChild(selectionFrame);
  // The Picture Border, drawn by an element of its own that hugs the raster's
  // box (the same offsets the selection chrome uses). Drawn as the <img>'s
  
  // DrawingML applies the transparency to the raster only.
  const pictureBorder = document.createElement("span");
  pictureBorder.setAttribute("aria-hidden", "true");
  pictureBorder.contentEditable = "false";
  pictureBorder.dataset.pictureBorder = "true";
  Object.assign(pictureBorder.style, {
    display: "none",
    position: "absolute",
    top: "var(--picture-chrome-top, 0px)",
    right: "var(--picture-chrome-right, 0px)",
    bottom: "var(--picture-chrome-bottom, 0px)",
    left: "var(--picture-chrome-left, 0px)",
    boxSizing: "border-box",
    pointerEvents: "none",
  });
  wrapper.appendChild(pictureBorder);
  // A perspective shadow under the picture and an inner shadow over it
  // (`pictureShadowEffect`, officeShadowCss), on the picture's own box.
  const shadowLayer = (testId: string): HTMLSpanElement => {
    const layer = document.createElement("span");
    layer.setAttribute("aria-hidden", "true");
    layer.contentEditable = "false";
    layer.dataset.pictureShadowLayer = testId;
    layer.style.display = "none";
    wrapper.appendChild(layer);
    return layer;
  };
  const shadowUnderLayer = shadowLayer("under");
  const shadowOverLayer = shadowLayer("over");
  const applyShadowLayer = (layer: HTMLSpanElement, css: CSSProperties | undefined) => {
    layer.removeAttribute("style");
    const rest: Record<string, unknown> = { ...(css ?? {}) };
    delete rest.inset;
    Object.assign(layer.style, rest, {
      display: css ? "block" : "none",
      position: "absolute",
      top: "var(--picture-chrome-top, 0px)",
      right: "var(--picture-chrome-right, 0px)",
      bottom: "var(--picture-chrome-bottom, 0px)",
      left: "var(--picture-chrome-left, 0px)",
      pointerEvents: "none",
    });
  };
  // Where the picture sits in its wrapper, for the chrome to hug it (see
  // ImageSelectionChrome.module.css). Measured only while selected, when the
  // chrome shows; `apply` rewrites the wrapper's inline style, so it runs
  // again after every apply.
  const syncSelectionChromeBox = () => {
    // The rotation handle shows only where the rotation can be saved.
    wrapper.dataset.pictureRotatable =
      editor.isEditable && visualFormattingEditable(currentNode) ? "true" : "false";
    if (
      !wrapper.isConnected ||
      (!wrapper.classList.contains("is-selected") &&
        pictureBorder.style.display === "none" &&
        // A pending AI picture's frame hugs the raster the same way.
        wrapper.dataset.picturePending !== "true")
    ) {
      return;
    }
    const top = img.offsetTop;
    const left = img.offsetLeft;
    const bottom = Math.max(0, wrapper.clientHeight - top - img.offsetHeight);
    const right = Math.max(0, wrapper.clientWidth - left - img.offsetWidth);
    wrapper.style.setProperty("--picture-chrome-top", `${top}px`);
    wrapper.style.setProperty("--picture-chrome-right", `${right}px`);
    wrapper.style.setProperty("--picture-chrome-bottom", `${bottom}px`);
    wrapper.style.setProperty("--picture-chrome-left", `${left}px`);
  };
  // The picture's own box in layout px and its current proportions. The
  // wrapper's screen rect would add the wrapper's margins and, for a rotated
  // picture, its rotated bounds.
  const pictureBox = (): { width: number; height: number; ratio: number } => {
    if (img.offsetWidth > 0 && img.offsetHeight > 0) {
      return {
        width: img.offsetWidth,
        height: img.offsetHeight,
        ratio: img.offsetHeight / img.offsetWidth,
      };
    }
    const rect = wrapper.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      ratio:
        rect.width > 0 && rect.height > 0
          ? rect.height / rect.width
          : ratioFor(img, rect),
    };
  };
  // Screen pointer movement in the picture's own axes and layout px: undo the
  // page zoom, the picture's rotation and then its flips (CSS applies rotate
  // after scale), so a handle moves its own edge however the picture is
  // turned or mirrored.
  const pointerToPictureAxes = (target: ProseMirrorNode) => {
    const view = documentViewScale(editor.view.dom as HTMLElement);
    const scaleX = view.scaleX || 1;
    const scaleY = view.scaleY || 1;
    const frame = {
      rotation: normalizeImageRotation(target.attrs.pictureRotation),
      flipH: normalizeImageFlip(target.attrs.pictureFlipHorizontal),
      flipV: normalizeImageFlip(target.attrs.pictureFlipVertical),
    };
    return {
      scaleX,
      delta: (screenDx: number, screenDy: number) => {
        const local = officeFrameAxesDelta(frame, screenDx / scaleX, screenDy / scaleY);
        return { dx: local.x, dy: local.y };
      },
    };
  };
  // The same rule the ribbon's picture formatting commands follow: a picture
  // whose visual formatting the source cannot take back offers no rotation.
  const visualFormattingEditable = (target: ProseMirrorNode) =>
    target.attrs.pictureVisualFormattingEditable === true ||
    (target.attrs.pictureVisualFormattingEditable == null &&
      target.attrs.officeImage !== true);
  const runtimeStatus = document.createElement("span");
  runtimeStatus.className = "note-editor-image-runtime-status";
  runtimeStatus.dataset.testid = "image-runtime-status";
  runtimeStatus.contentEditable = "false";
  runtimeStatus.hidden = true;
  runtimeStatus.style.cssText =
    "position:absolute;left:50%;top:50%;z-index:2;max-width:calc(100% - 16px);transform:translate(-50%,-50%);border-radius:6px;background:rgba(15,23,42,.82);color:#fff;padding:4px 8px;font-size:12px;line-height:1.35;text-align:center;pointer-events:none;";
  wrapper.appendChild(runtimeStatus);
  let currentNode = node;
  let destroyed = false;
  let attachmentRequestGeneration = 0;
  let attachmentRequestController: AbortController | null = null;
  let currentAttachmentId: string | null = null;
  let resolvedAttachmentUrl: string | null = null;

  const clearRuntimeStatus = () => {
    runtimeStatus.hidden = true;
    runtimeStatus.textContent = "";
    runtimeStatus.removeAttribute("role");
  };
  const showRuntimeStatus = (kind: "loading" | "failed") => {
    runtimeStatus.textContent = labels[kind];
    runtimeStatus.setAttribute("role", kind === "failed" ? "alert" : "status");
    runtimeStatus.hidden = false;
  };

  // A cropped picture as Word draws it (see documentImageCrop.ts): the <img>
  // box stays the frame (width x height, so text flow, wrapping, pagination
  // and the selection chrome are unchanged), its own raster is moved out of
  // the box, and the box paints the source as its background, scaled so the
  // kept region fills it. Nothing is drawn outside the frame, the Picture
  // Border (the img outline) hugs the frame, and filters, transparency and
  // rounded corners apply as to any picture. Crop mode draws the whole
  // source instead (`--picture-crop-source-*`, note-editor.css).
  let cropBackgroundUrl = "";
  const syncCropBackground = () => {
    const url = wrapper.hasAttribute("data-picture-cropped")
      ? img.getAttribute("src") || img.currentSrc || ""
      : "";
    if (url === cropBackgroundUrl) return;
    cropBackgroundUrl = url;
    img.style.backgroundImage = url
      ? `url("${url.replace(/["\\\n\r\f]/g, (char) =>
          char === '"' || char === "\\"
            ? `\\${char}`
            : `\\${char.charCodeAt(0).toString(16)} `,
        )}")`
      : "";
  };
  const applyCropDrawing = (crop: DocumentImageCropInsets) => {
    const drawing = documentImageCropDrawing(crop);
    wrapper.style.setProperty(
      "--picture-crop-source-transform",
      drawing.sourceTransform,
    );
    wrapper.style.setProperty("--picture-crop-source-x", String(drawing.source.x));
    wrapper.style.setProperty("--picture-crop-source-y", String(drawing.source.y));
    wrapper.style.setProperty("--picture-crop-source-w", String(drawing.source.w));
    wrapper.style.setProperty("--picture-crop-source-h", String(drawing.source.h));
    const cropped = documentImageCropped(crop);
    if (cropped) wrapper.setAttribute("data-picture-cropped", "true");
    else wrapper.removeAttribute("data-picture-cropped");
    img.style.clipPath = "";
    img.style.objectFit = cropped ? "none" : "";
    img.style.objectPosition = cropped ? "-100000px -100000px" : "";
    img.style.backgroundRepeat = cropped ? "no-repeat" : "";
    img.style.backgroundSize = cropped ? drawing.backgroundSize : "";
    img.style.backgroundPosition = cropped ? drawing.backgroundPosition : "";
    // Browsers drop backgrounds from print unless told otherwise; this one
    // is the picture.
    img.style.setProperty("print-color-adjust", cropped ? "exact" : "");
    img.style.setProperty("-webkit-print-color-adjust", cropped ? "exact" : "");
    syncCropBackground();
  };

  // The crop handles' and the dimmed ring's place: the (previewed) frame in
  // percent of the whole source (`.note-editor-image-crop-box`).
  const applyCropPreview = (crop: DocumentImageCropInsets) => {
    wrapper.style.setProperty("--picture-crop-top", `${crop.top}%`);
    wrapper.style.setProperty("--picture-crop-right", `${crop.right}%`);
    wrapper.style.setProperty("--picture-crop-bottom", `${crop.bottom}%`);
    wrapper.style.setProperty("--picture-crop-left", `${crop.left}%`);
    wrapper.style.setProperty(
      "--picture-crop-center-x",
      `${crop.left + (100 - crop.left - crop.right) / 2}%`,
    );
    wrapper.style.setProperty(
      "--picture-crop-center-y",
      `${crop.top + (100 - crop.top - crop.bottom) / 2}%`,
    );
  };

  // Crop to Shape (lib/office-picture-geometry): the picture is drawn only
  // inside its preset shape, evaluated at the frame's drawn size so the shape
  // stretches with the picture as Word's does; the frame (layout, wrapping,
  // selection box and handles) stays the rectangle Word keeps. A plain
  // Picture Border then follows the shape's outline, centred on it as
  // DrawingML draws `a:ln`. Crop mode draws the whole source unclipped
  // (note-editor.css). Re-run whenever the drawn box changes size.
  let pictureGeometryKey = "";
  const syncPictureGeometry = () => {
    const attrs = currentNode.attrs as Record<string, unknown>;
    const geometry = documentPictureGeometry(attrs);
    const statedWidth = attrsDimensionPx(attrs, "width", "widthEmu") || 0;
    const statedHeight = attrsDimensionPx(attrs, "height", "heightEmu") || 0;
    // A picture without a shaped outline (a plain rectangle) draws no clip
    // path at any size: it needs no box read. Read at every node view's
    // creation, the box forced a whole-document layout per picture (WebKit,
    // the 296-page book: ~118 s).
    const shaped = Boolean(officePictureGeometryPath(geometry.preset, geometry.adjustments, statedWidth || 100, statedHeight || 100));
    const width = (shaped ? img.offsetWidth : 0) || statedWidth;
    const height = (shaped ? img.offsetHeight : 0) || statedHeight;
    const borderWidth = normalizeImagePictureStyle(attrs.pictureStyle)
      ? 0
      : normalizeImageBorderWidth(attrs.pictureBorderWidth);
    const borderStyle = normalizeImageBorderStyle(attrs.pictureBorderStyle);
    const borderColor = normalizeImageBorderColor(attrs.pictureBorderColor);
    const key = JSON.stringify([
      geometry,
      width,
      height,
      borderWidth,
      borderStyle,
      borderColor,
    ]);
    if (key === pictureGeometryKey) return;
    pictureGeometryKey = key;
    const d = officePictureGeometryPath(
      geometry.preset,
      geometry.adjustments,
      width,
      height,
    );
    img.style.clipPath = d ? `path(${JSON.stringify(d)})` : "";
    if (d) wrapper.setAttribute("data-picture-geometry", geometry.preset);
    else wrapper.removeAttribute("data-picture-geometry");
    pictureBorder.replaceChildren();
    if (!d || borderWidth === 0) {
      pictureBorder.removeAttribute("data-picture-border-shape");
      return;
    }
    pictureBorder.dataset.pictureBorderShape = "true";
    pictureBorder.style.border = "none";
    pictureBorder.style.margin = "0";
    const strokePx = ptToPx(borderWidth);
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("overflow", "visible");
    svg.style.display = "block";
    svg.style.overflow = "visible";
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", borderColor);
    path.setAttribute("stroke-width", String(strokePx));
    path.setAttribute("stroke-linejoin", "round");
    if (borderStyle !== "solid") {
      path.setAttribute(
        "stroke-dasharray",
        borderStyle === "dashed"
          ? `${strokePx * 3} ${strokePx * 2}`
          : `${strokePx} ${strokePx}`,
      );
    }
    svg.appendChild(path);
    pictureBorder.appendChild(svg);
  };

  const refreshPageProjection = (): boolean =>
    refreshInlineImagePageProjection(currentNode, wrapper);

  // Clicking the image selects its node so the handles appear. PM's own click
  // handling can replace the selection again, so re-assert after the click
  // cycle (macrotask) — same trick the prior NodeView used.
  const selectSelf = () => {
    if (!editor.isEditable) return;
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number") return;
    window.setTimeout(() => {
      try {
        editor.commands.setNodeSelection(pos);
      } catch {
        /* node moved/removed mid-click: nothing to select */
      }
    }, 0);
  };
  img.addEventListener("mousedown", selectSelf);
  img.addEventListener("click", selectSelf);
  // A linked picture follows its link as Word does: Ctrl/Cmd+Click while
  // editing, a plain click when the document is read-only. An address opens
  // in a new tab; a place in this document scrolls to it.
  img.addEventListener("click", (event) => {
    const href = normalizePictureLinkHref(currentNode.attrs.linkHref);
    if (!href) return;
    const follow = event.metaKey || event.ctrlKey || !editor.isEditable;
    if (!follow) return;
    event.preventDefault();
    event.stopPropagation();
    if (href.startsWith("#")) {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", href);
      const target = resolveInternalLinkTarget(editor.view.dom as HTMLElement, anchor);
      if (target) {
        scrollTocHeadingIntoView(target);
        const flash = target.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th") ?? target;
        flash.classList.add("toc-jump-flash");
        window.setTimeout(() => flash.classList.remove("toc-jump-flash"), 1200);
      }
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  });

  const px = (value: unknown): string | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0
      ? String(Math.round(numeric))
      : null;
  };

  // A token no page read so far names (the editor can draw a document's room
  // before its page is read): drawn again once its page is read, or it stays
  // blank or asks another page for it (corpus R281-D10: seven cell pictures).
  let stopWaitingForHome: (() => void) | null = null;
  const applyImageSource = (attrs: Record<string, unknown>) => {
    // A picture of an imported Word document is named by its digest; it is
    // drawn from the stored file (`document-picture-references`), fetched
    // when it nears the viewport: a document of hundreds of photographs does
    // not download all of them to open. Its box is reserved by its size.
    const fallback = documentPictureDisplaySrc(attrs.src);
    stopWaitingForHome?.();
    stopWaitingForHome = null;
    if (!documentPictureHomeKnown(attrs.src)) {
      stopWaitingForHome = onDocumentPictureReferencesRegistered(() => {
        if (destroyed || !documentPictureHomeKnown(currentNode.attrs.src)) return;
        applyImageSource(currentNode.attrs as Record<string, unknown>);
      });
    }
    if (fallback !== attrs.src && img.loading !== "lazy") {
      img.loading = "lazy";
      img.decoding = "async";
    }
    const attachmentId =
      typeof attrs.attachment_id === "string" && attrs.attachment_id.trim()
        ? attrs.attachment_id.trim()
        : null;
    if (!attachmentId) {
      attachmentRequestController?.abort();
      attachmentRequestController = null;
      currentAttachmentId = null;
      resolvedAttachmentUrl = null;
      attachmentRequestGeneration += 1;
      wrapper.removeAttribute("data-attachment-image-loading");
      wrapper.removeAttribute("data-attachment-image-error");
      clearRuntimeStatus();
      if (img.getAttribute("src") !== fallback)
        img.setAttribute("src", fallback);
      return;
    }

    if (currentAttachmentId === attachmentId) {
      const source = resolvedAttachmentUrl ?? fallback;
      if (source && img.getAttribute("src") !== source) {
        img.setAttribute("src", source);
      }
      return;
    }

    currentAttachmentId = attachmentId;
    resolvedAttachmentUrl = null;
    attachmentRequestController?.abort();
    const requestController = new AbortController();
    attachmentRequestController = requestController;
    const requestGeneration = ++attachmentRequestGeneration;
    wrapper.setAttribute("data-attachment-image-loading", "true");
    wrapper.removeAttribute("data-attachment-image-error");
    showRuntimeStatus("loading");
    if (fallback && img.getAttribute("src") !== fallback) {
      img.setAttribute("src", fallback);
    }
    void apiGet<AttachmentImageUrlPayload>(
      `/api/v1/attachments/${encodeURIComponent(attachmentId)}/url`,
      { signal: requestController.signal },
    )
      .then((payload) => {
        if (
          destroyed ||
          requestGeneration !== attachmentRequestGeneration ||
          currentAttachmentId !== attachmentId
        )
          return;
        const resolved = safeRuntimeImageUrl(payload.url);
        if (!resolved) throw new Error("Invalid attachment image URL");
        if (attachmentRequestController === requestController) {
          attachmentRequestController = null;
        }
        // The signed address is a different host (the file edge), which a
        // reader's network may not reach while the page's own origin loads
        
        // for a moment from the download address, then went blank on the
        // file edge's address, "loading" for good). It replaces the shown
        // picture only once it has loaded; otherwise the download address
        // stays.
        const probe = new Image();
        probe.decoding = "async";
        probe.onload = () => {
          if (
            destroyed ||
            requestGeneration !== attachmentRequestGeneration ||
            currentAttachmentId !== attachmentId
          )
            return;
          resolvedAttachmentUrl = resolved;
          img.setAttribute("src", resolved);
          wrapper.removeAttribute("data-attachment-image-error");
        };
        probe.onerror = () => {
          if (
            destroyed ||
            requestGeneration !== attachmentRequestGeneration ||
            currentAttachmentId !== attachmentId
          )
            return;
          // The download address is the picture then (already shown, or
          // still loading; its own error says when neither can be drawn).
          resolvedAttachmentUrl = fallback || null;
          if (img.complete && img.naturalWidth > 0) {
            wrapper.removeAttribute("data-attachment-image-loading");
            clearRuntimeStatus();
          } else if (img.complete) {
            wrapper.removeAttribute("data-attachment-image-loading");
            wrapper.setAttribute("data-attachment-image-error", "true");
            showRuntimeStatus("failed");
          }
        };
        probe.src = resolved;
      })
      .catch(() => {
        if (
          destroyed ||
          requestGeneration !== attachmentRequestGeneration ||
          currentAttachmentId !== attachmentId
        )
          return;
        wrapper.removeAttribute("data-attachment-image-loading");
        wrapper.setAttribute("data-attachment-image-error", "true");
        if (attachmentRequestController === requestController) {
          attachmentRequestController = null;
        }
        showRuntimeStatus("failed");
        // The persisted same-origin authenticated download URL remains a safe
        // fallback; no object URL or stale signed URL enters document JSON.
        if (fallback && img.getAttribute("src") !== fallback) {
          img.setAttribute("src", fallback);
        }
      });
  };

  // Another member's frame drawn over the picture (showLiveFrame, below):
  // the rest it was drawn from, re-read after every apply.
  let liveBase: { w: number; h: number; r: number; sized: boolean; turned: boolean } | null = null;
  const apply = (current: ProseMirrorNode): boolean => {
    currentNode = current;
    const attrs = current.attrs as Record<string, unknown>;
    applyImageSource(attrs);
    const alt = sanitizeImageAltText(attrs.alt);
    img.alt = alt ?? "";
    // The ScreenTip (or the address) with Word's follow hint; none unlinked.
    const linkHref = normalizePictureLinkHref(attrs.linkHref);
    if (linkHref) {
      const tip = normalizeLinkTitle(attrs.linkTitle) ?? linkHref;
      img.title = `${tip}\n${labels.followLink}`;
      img.setAttribute("data-link-href", linkHref);
      wrapper.setAttribute("data-picture-link", "true");
    } else {
      img.removeAttribute("title");
      img.removeAttribute("data-link-href");
      wrapper.removeAttribute("data-picture-link");
    }
    const wrapperAttrs = imageNodeViewWrapperAttributes(
      attrs.widthPercent,
      attrs.dataAlign,
      attrs.dataFloat,
    );
    // The placement helper owns only width/alignment/float. NodeView mechanics
    // stay explicit here so the serialized bare <img> can never inherit wrapper-
    // only declarations such as width:fit-content or position:relative.
    wrapper.style.cssText = wrapperAttrs.style ?? "";
    wrapper.style.position = "relative";
    wrapper.style.maxWidth = "100%";
    // A floating picture publishes its anchor for the page layout pass
    // (floatingTextBoxLayout), which places it on its sheet and wraps the
    // lines around it; the declarations that pass wrote come back here, so
    // this reset never un-places a picture between two layout frames.
    const floating = pictureFloatDataAttributes(current);
    if (floating) {
      wrapper.setAttribute("data-float-anchor", JSON.stringify(floating.anchor));
      if (!wrapper.dataset.floatMode) wrapper.dataset.floatMode = floating.mode;
      if (floating.host) wrapper.dataset.floatHostAnchor = floating.host;
      else delete wrapper.dataset.floatHostAnchor;
      const placed = wrapper.getAttribute(PICTURE_FLOAT_CSS_ATTR);
      if (placed) {
        for (const declaration of placed.split(";")) {
          const colon = declaration.indexOf(":");
          if (colon > 0) {
            wrapper.style.setProperty(declaration.slice(0, colon), declaration.slice(colon + 1));
          }
        }
      }
    } else {
      wrapper.removeAttribute("data-float-anchor");
      delete wrapper.dataset.floatMode;
      delete wrapper.dataset.floatHostAnchor;
      wrapper.removeAttribute(PICTURE_FLOAT_CSS_ATTR);
      wrapper.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
    }
    // Reflect the resolved align/float as data-* attributes so CSS + the
    // paginated/print clone can target the wrapper contract directly.
    if (wrapperAttrs["data-align"])
      wrapper.setAttribute("data-align", wrapperAttrs["data-align"]);
    else wrapper.removeAttribute("data-align");
    if (wrapperAttrs["data-float"])
      wrapper.setAttribute("data-float", wrapperAttrs["data-float"]);
    else wrapper.removeAttribute("data-float");
    if (attrs.sourcePageBreakBefore === true)
      wrapper.setAttribute("data-source-page-break-before", "true");
    else wrapper.removeAttribute("data-source-page-break-before");
    if (attrs.officeImage === true) {
      wrapper.setAttribute("data-office-image", "true");
      img.setAttribute("data-office-image", "true");
    } else {
      wrapper.removeAttribute("data-office-image");
      img.removeAttribute("data-office-image");
    }
    if (
      attrs.officeDrawingKind === "inline" ||
      attrs.officeDrawingKind === "anchor"
    ) {
      wrapper.setAttribute(
        "data-office-drawing-kind",
        attrs.officeDrawingKind,
      );
    } else {
      wrapper.removeAttribute("data-office-drawing-kind");
    }
    const hasPercent = clampImageWidthPercentFree(attrs.widthPercent) !== null;
    const widthPx = px(attrs.width);
    const heightPx = px(attrs.height);
    img.style.display = "block";
    if (hasPercent) {
      wrapper.removeAttribute(PICTURE_FIXED_SIZE_ATTR);
      // Percent preset: the wrapper carries `width:N%`; the img fills it.
      img.style.width = "100%";
      img.style.height = "auto";
      img.removeAttribute("width");
      img.removeAttribute("height");
    } else if (widthPx && heightPx) {
      // Explicit px size (Word EMU geometry / drag / AI-resize): BOTH axes are
      // authoritative. HTML width/height attributes alone lose to the global
      // `.note-editor-content img { height:auto }` rule. In a table cell
      // narrower than the picture the stylesheet keeps both (the cell's
      // edge clips it, as in Word) instead of squeezing its width (WUA 049).
      wrapper.setAttribute(PICTURE_FIXED_SIZE_ATTR, "true");
      img.style.width = `${widthPx}px`;
      img.style.height = `${heightPx}px`;
      img.setAttribute("width", widthPx);
      img.setAttribute("height", heightPx);
    } else {
      wrapper.removeAttribute(PICTURE_FIXED_SIZE_ATTR);
      // Only one (or no) px axis: drive the known axis via its attribute and
      // keep the other proportional via `auto`.
      img.style.width = "";
      img.style.height = "auto";
      if (widthPx) img.setAttribute("width", widthPx);
      else img.removeAttribute("width");
      if (heightPx) img.setAttribute("height", heightPx);
      else img.removeAttribute("height");
    }
    // An in-line picture on an Exactly line rises no higher than its
    // baseline and is cut to the line (note-editor.css): its stated height,
    // for the stylesheet. `window.__docsExactLinePictureOff = true` lets the
    // picture raise its line, as before (A/B).
    if (current.isInline && !hasPercent && widthPx && heightPx && !exactLinePictureOff()) {
      if (!wrapper.hasAttribute(EXACT_LINE_PICTURE_ATTR)) wrapper.setAttribute(EXACT_LINE_PICTURE_ATTR, "");
      if (wrapper.style.getPropertyValue("--picture-box-height") !== `${heightPx}px`) {
        wrapper.style.setProperty("--picture-box-height", `${heightPx}px`);
      }
    } else if (wrapper.hasAttribute(EXACT_LINE_PICTURE_ATTR)) {
      wrapper.removeAttribute(EXACT_LINE_PICTURE_ATTR);
      wrapper.style.removeProperty("--picture-box-height");
    }

    const crop = documentImageCropInsets(attrs);
    applyCropDrawing(crop);
    applyCropPreview(crop);

    // DrawingML picture transparency applies to the raster itself, not its
    // frame. Keep opacity on the <img> so Picture Border remains fully opaque.
    // A preserve-only picture's own colour look (pictureDisplayLook.ts).
    const displayLook = pictureDisplayLookCss(attrs.pictureDisplayLook, wrapper.ownerDocument);
    const opacity = displayLook.opacity ?? normalizeImageOpacity(attrs.pictureOpacity);
    img.style.opacity = opacity === 100 ? "" : String(opacity / 100);
    if (opacity === 100) img.removeAttribute("data-picture-opacity");
    else img.setAttribute("data-picture-opacity", String(opacity));
    const recolor = isNativeImageRecolorMode(attrs.pictureRecolor)
      ? attrs.pictureRecolor
      : "none";
    // Picture Format > Artistic Effects first, the colour adjustments after
    // it, as Office applies them; a file's own rendered bitmap draws as is.
    const drawnWidth = Number(attrs.width) || img.clientWidth;
    const drawnHeight = Number(attrs.height) || img.clientHeight;
    const pictureEffects = pictureEffectsCss(attrs as Record<string, unknown>, {
      width: Math.max(1, drawnWidth),
      height: Math.max(1, drawnHeight),
    });
    // Format Picture > Effects > Shadow (reading row 547): the shared model's
    // outer shadow as a drop shadow of the picture (or, scaled, its box
    // shadow), a perspective one on a layer under it, an inner one over it.
    const shadowEffect = normalizeOfficeShadowEffect(attrs.pictureShadowEffect);
    const shadowCss = shadowEffect
      ? officePictureEffectsCss({ shadow: shadowEffect }, { width: Math.max(1, drawnWidth), height: Math.max(1, drawnHeight) })
      : null;
    img.style.boxShadow = String(shadowCss?.wrapper.boxShadow ?? "");
    applyShadowLayer(shadowUnderLayer, shadowCss?.shadowUnder);
    applyShadowLayer(shadowOverLayer, shadowCss?.shadowOver);
    if (shadowCss?.shadowUnder) wrapper.style.isolation = "isolate";
    else if (wrapper.style.isolation === "isolate") wrapper.style.removeProperty("isolation");
    img.style.filter = [
      // Its soft edges, on the raster itself before everything drawn around it.
      applySoftEdge(pictureEffects.softEdgeRampPx, drawnWidth, drawnHeight),
      officeArtisticEffectCss(attrs.artisticEffect, attrs.artisticEffectRendered === true),
      displayLook.filter,
      // A Recolor preset (Sepia, Black and White, Dark / Light), before the
      // corrections as Office draws it, in the document's theme colours.
      pictureRecolorFilterCss(
        attrs.pictureRecolor,
        editor.state.doc.attrs as Record<string, unknown>,
        wrapper.ownerDocument,
      ),
      imageFilterCss(
        resolveImageEffects({
          recolor,
          saturation: attrs.pictureSaturation,
          brightness: attrs.pictureBrightness,
          contrast: attrs.pictureContrast,
        }),
      ) ?? "",
      // Its 3-D Format (bevel, depth, contour, material, lighting), lit as
      // Word lights it, before the effects around the picture.
      applyPicture3d(attrs.picture3d, Number(attrs.width) || img.clientWidth, Number(attrs.height) || img.clientHeight),
      // The picture's own shadow, drawn last: the shared model's
      // (`pictureShadowEffect`, reading row 547) from the picture's alpha,
      // else the older outer one (`pictureShadow`).
      shadowEffect ? (shadowCss?.wrapper.filter ?? "") : (pictureShadowFilter(attrs.pictureShadow) ?? ""),
      // Its glow (`a:glow`), around the drawn picture.
      pictureEffects.filter,
    ]
      .filter(Boolean)
      .join(" ");
    // Its reflection (`a:reflection`), mirroring the softened picture.
    img.style.setProperty("-webkit-box-reflect", pictureEffects.boxReflect || "");
    const recolorPreset = isPictureRecolorPreset(attrs.pictureRecolor) ? attrs.pictureRecolor : recolor;
    if (recolorPreset === "none") img.removeAttribute("data-picture-recolor");
    else img.setAttribute("data-picture-recolor", recolorPreset);
    // A legacy VML picture's Word 97 borders and picture fill
    // (pictureLegacyLook): drawn on the raster's own box, borders outside it.
    Object.assign(img.style, pictureLegacyLookStyle(attrs.pictureLegacyLook));

    const rotation = normalizeImageRotation(attrs.pictureRotation);
    setPictureTurn(rotation);
    if (rotation === 0) wrapper.removeAttribute("data-picture-rotation");
    else wrapper.setAttribute("data-picture-rotation", String(rotation));
    // A CSS rotation turns the drawing and leaves the layout box as it was.
    // Word lays an inline picture out at its extent - width and height
    // swapped when turned by about a quarter - plus its wp:effectExtent, and
    // writes the turned bounds as that extent when the user turns it
    // (pictureLayoutEffects). The stylesheet applies the room to pictures
    // in the flow only; a floating one is placed by its anchor.
    // A style previewed takes the room its press takes: the picture stood a
    // few pixels off where the press put it, and the text under it moved.
    const laidOutStyle = pictureStylePreview ?? attrs.pictureStyle;
    const reserveRotatedBounds = () => {
      const sides = ["top", "right", "bottom", "left"] as const;
      // A picture that is neither rotated nor drawn past its box reserves no
      // room whatever its size: decide that from its attributes before
      // reading its box. Read at every node view's creation, the box forced a
      // whole-document layout per picture (WebKit, the 296-page book: 470
      // reads, ~730 s).
      const nominal = inlinePictureLayoutRoom(
        Number(attrs.width) || 0,
        Number(attrs.height) || 0,
        rotation,
        attrs.pictureEffectExtent,
        laidOutStyle,
      );
      const sized = Number(attrs.width) > 0 && Number(attrs.height) > 0;
      const reservesNothing = sized
        ? sides.every((side) => nominal[side] === 0)
        : rotation === 0 && !attrs.pictureEffectExtent && !laidOutStyle;
      if (reservesNothing) {
        if (wrapper.hasAttribute("data-picture-layout-room")) wrapper.removeAttribute("data-picture-layout-room");
        for (const side of sides) {
          if (wrapper.style.getPropertyValue(`--picture-room-${side}`)) wrapper.style.removeProperty(`--picture-room-${side}`);
        }
        return;
      }
      // The drawn size is the stated one, scaled by the page fit when the
      // page fit it; the box is read only for a picture stating no size.
      const fit = Number.parseFloat(wrapper.getAttribute("data-page-fit-scale") ?? "");
      const scale = Number.isFinite(fit) && fit > 0 ? fit : 1;
      const width = sized ? Number(attrs.width) * scale : wrapper.offsetWidth;
      const height = sized ? Number(attrs.height) * scale : wrapper.offsetHeight;
      const room = inlinePictureLayoutRoom(width, height, rotation, attrs.pictureEffectExtent, laidOutStyle);
      if (sides.every((side) => room[side] === 0)) {
        wrapper.removeAttribute("data-picture-layout-room");
        for (const side of sides) wrapper.style.removeProperty(`--picture-room-${side}`);
        return;
      }
      wrapper.setAttribute("data-picture-layout-room", "true");
      for (const side of sides) {
        wrapper.style.setProperty(`--picture-room-${side}`, `${Math.round(room[side] * 100) / 100}px`);
      }
    };
    reserveRotatedBounds();
    if (wrapper.hasAttribute("data-picture-layout-room") && !img.complete) {
      img.addEventListener("load", reserveRotatedBounds, { once: true });
    }
    const flipHorizontal = normalizeImageFlip(attrs.pictureFlipHorizontal);
    const flipVertical = normalizeImageFlip(attrs.pictureFlipVertical);
    wrapper.style.scale =
      flipHorizontal || flipVertical
        ? `${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1}`
        : "";
    if (flipHorizontal) {
      wrapper.setAttribute("data-picture-flip-horizontal", "true");
    } else {
      wrapper.removeAttribute("data-picture-flip-horizontal");
    }
    if (flipVertical) {
      wrapper.setAttribute("data-picture-flip-vertical", "true");
    } else {
      wrapper.removeAttribute("data-picture-flip-vertical");
    }

    // A styled picture draws its Picture Border as the style's outline (the
    // style layer), never as a box border or outline around the raster.
    const borderWidth = normalizeImagePictureStyle(laidOutStyle)
      ? 0
      : normalizeImageBorderWidth(attrs.pictureBorderWidth);
    const borderStyle = normalizeImageBorderStyle(attrs.pictureBorderStyle);
    const borderColor = normalizeImageBorderColor(attrs.pictureBorderColor);
    wrapper.style.boxSizing = "border-box";
    // The wrapper keeps the border's width, so the layout is what it was, but
    // paints it clear: the line itself is the picture's outline, which hugs
    // the picture. A picture MRAI inserted keeps the content-image margin
    // inside its wrapper, and a border drawn on the wrapper stood 12px off
    // the picture above and below.
    wrapper.style.border =
      borderWidth === 0 ? "" : `${borderWidth}pt ${borderStyle} transparent`;
    img.style.outline = "";
    img.style.outlineOffset = "";
    pictureBorder.style.display = borderWidth === 0 ? "none" : "block";
    // The line sits outside the raster's box, as an outline did.
    pictureBorder.style.margin = borderWidth === 0 ? "" : `-${borderWidth}pt`;
    pictureBorder.style.border =
      borderWidth === 0 ? "" : `${borderWidth}pt ${borderStyle} ${borderColor}`;
    pictureGeometryKey = "";
    syncPictureGeometry();
    syncPictureStyleLayer();
    // A picture an AI run is still drawing: a painting-in-progress frame of
    // the reserved box, giving way when the picture lands. It hugs the
    // raster like the chrome does, so it goes before that measure.
    syncDraftPicturePending(wrapper, img, attrs, labels.drawing ?? "");
    syncSelectionChromeBox();
    const projected = refreshPageProjection();
    // Another member's hand on the picture is drawn again over what the
    // node just laid out (documentLiveTransform).
    liveBase = null;
    reapplyDocumentLiveFrame(wrapper);
    return projected;
  };
  // The style shown is the gallery's live preview when there is one, else the
  // picture's own `pictureStyle`. Size and crop follow the same attrs the
  // <img> is laid out from, so the drawing covers exactly the visible raster.
  function syncPictureStyleLayer() {
    const attrs = currentNode.attrs as Record<string, unknown>;
    const previewStyle = normalizeImagePictureStyle(pictureStylePreview);
    const styleId =
      previewStyle ?? normalizeImagePictureStyle(attrs.pictureStyle);
    // Previewing another style shows it as applying it would: fresh, with
    // the style's own outline.
    const outline = previewStyle ? null : imagePictureStyleOutline(attrs);
    const width =
      attrsDimensionPx(attrs, "width", "widthEmu") ?? (img.naturalWidth || 0);
    const height =
      attrsDimensionPx(attrs, "height", "heightEmu") ??
      (img.naturalHeight || 0);
    pictureStyleLayer.sync({
      styleId,
      src: img.currentSrc || img.getAttribute("src") || "",
      widthPx: width || 480,
      heightPx:
        height ||
        (width && img.naturalWidth
          ? (width * img.naturalHeight) / img.naturalWidth
          : 320),
      crop: documentImageCropInsets(attrs),
      photoFilter: img.style.filter,
      photoOpacity: img.style.opacity === "" ? 1 : Number(img.style.opacity),
      alt: img.alt,
      outline,
      // Crop to Shape over a style: the style's paint and effects in the
      // picture's own shape. A previewed style brings its own geometry.
      geometry: previewStyle ? null : documentPictureGeometryOverride(attrs),
    });
  }
  apply(node);

  // Word's Insert Picture stores a picture larger than the text area fitted
  // to it (newPictureFit): the picture's own size is known only now.
  const storeNewPictureSize = () => {
    if (!(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return;
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number" || !isNewPictureAt(editor.state, pos)) return;
    // Word fits the picture to the text area itself (600 x 1800 is stored
    // 216 x 648 pt on Letter with 1 in margins: the area's whole height),
    // whatever space the paragraph around it has. The space this editor
    // keeps above and below a picture is not taken off: a picture stored as
    // tall as the text area then stands on a page of its own, as it does in
    // Word, and its size in an exported file is the one Word would write.
    const textArea = pictureTextArea(currentNode, wrapper);
    // Not on a sheet yet: the first frame after it is attached asks again.
    if (!textArea) return;
    const settle = buildNewPictureFit(
      editor.state,
      pos,
      { width: img.naturalWidth, height: img.naturalHeight },
      textArea,
    );
    if (settle) editor.view.dispatch(settle);
  };
  const onImageLoad = () => {
    syncCropBackground();
    syncPictureStyleLayer();
    // A picture drawn is no longer loading, whichever address drew it (the
    // download address does not wait for the signed one).
    if (img.naturalWidth > 0 || currentAttachmentId === null || resolvedAttachmentUrl !== null) {
      wrapper.removeAttribute("data-attachment-image-loading");
      wrapper.removeAttribute("data-attachment-image-error");
      clearRuntimeStatus();
    }
    storeNewPictureSize();
    const changed = refreshPageProjection();
    if (changed) window.dispatchEvent(new Event("mrn-page-rebalance"));
  };
  const onImageError = () => {
    wrapper.removeAttribute("data-attachment-image-loading");
    wrapper.setAttribute("data-attachment-image-error", "true");
    showRuntimeStatus("failed");
  };
  // A picture on a sheet the browser is skipping (content-visibility, far
  // from the viewport) is fitted when the sheet is drawn again, or when the
  // page ledger projects that sheet to measure it (projectSheetsUnobserved):
  // reading its sheet's and its own boxes now laid the sheet out on the spot,
  // one sheet per picture, for every page nudge (the 296-page book: ~44
  // forced layouts a key typed, its 55 pictures on as many sheets).
  let stopWaitingForSheet: (() => void) | null = null;
  const onPageGeometryChange = () => {
    // A new picture whose size could not be stored when it loaded (the room
    // was not taking edits yet) is asked again when the page is laid out.
    storeNewPictureSize();
    const sheet = wrapper.closest<HTMLElement>("article[data-page-sheet]");
    if (sheet && contentSkipped(sheet)) {
      stopWaitingForSheet ??= whenContentShown(sheet, () => {
        stopWaitingForSheet = null;
        storeNewPictureSize();
        if (refreshPageProjection()) window.dispatchEvent(new Event("mrn-page-rebalance"));
      });
      return false;
    }
    return refreshPageProjection();
  };
  img.addEventListener("load", onImageLoad);
  // The border's offsets are measured from layout: again when the picture
  // first gets a box and whenever that box changes.
  const pictureBoxObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          syncSelectionChromeBox();
          syncPictureGeometry();
        });
  pictureBoxObserver?.observe(img);
  img.addEventListener("error", onImageError);
  window.addEventListener("mrn-page-rebalance", onPageGeometryChange);
  window.addEventListener("resize", onPageGeometryChange);
  // Construction happens before ProseMirror attaches the NodeView to its
  // section-decorated sheet. Re-evaluate once attached so explicit imported
  // geometry is fitted synchronously with the editor's first paint.
  let projectionRaf = window.requestAnimationFrame(() => {
    projectionRaf = 0;
    // A picture that loaded from the cache before it stood on its sheet.
    storeNewPictureSize();
    const changed = refreshPageProjection();
    if (changed) window.dispatchEvent(new Event("mrn-page-rebalance"));
  });

  // Teardown for an in-flight drag's window listeners, so destroy() can detach
  // them if the NodeView is recreated mid-drag (e.g. a setContent re-hydration
  // from a confirmed AI proposal) before mouseup fires.
  let activeDragCleanup: (() => void) | null = null;

  // Another member moving, sizing or turning this picture: drawn the way
  // this desk's own previews draw it (the raster's size, the turn, the
  // float's translate), over the node's state; the commit puts it back.
  const showLiveFrame = (frame: LiveTransformFrame | null) => {
    if (!frame) {
      if (liveBase) {
        liveBase = null;
        apply(currentNode);
      }
      return;
    }
    liveBase ??= {
      w: img.offsetWidth,
      h: img.offsetHeight,
      r: normalizeImageRotation(currentNode.attrs.pictureRotation),
      sized: false,
      turned: false,
    };
    const base = liveBase;
    if (base.sized || Math.abs(frame.w - base.w) > 0.5 || Math.abs(frame.h - base.h) > 0.5) {
      base.sized = true;
      img.style.width = `${frame.w}px`;
      img.style.height = `${frame.h}px`;
      if (wrapper.hasAttribute("data-page-fit-inline-image")) {
        wrapper.style.setProperty("--page-fit-image-width", `${frame.w}px`);
        wrapper.style.setProperty("--page-fit-image-height", `${frame.h}px`);
      }
    }
    if (base.turned || Math.abs(shortestTurn(base.r, frame.r)) > 0.1) {
      base.turned = true;
      setPictureTurn(frame.r);
    }
    wrapper.style.translate = frame.x || frame.y ? `${frame.x}px ${frame.y}px` : "";
  };
  const unregisterLiveTarget = registerDocumentLiveTarget(wrapper, {
    rest: () =>
      img.offsetWidth > 0 && img.offsetHeight > 0
        ? { w: img.offsetWidth, h: img.offsetHeight, r: normalizeImageRotation(currentNode.attrs.pictureRotation) }
        : null,
    show: showLiveFrame,
  });
  /** This desk's gesture on the picture, for the others (a no-op without a room). */
  const beginLive = (pos: number): DocumentLiveGesture => beginDocumentLiveGesture(editor.view, [pos]);

  /**
   * Follow a resize / rotate grip's gesture: a mouse through the window's
   * mousemove/mouseup (as before), a finger or a pen that cannot hover
   * through the shared object drag gesture — one pointer, captured, and a
   * pointercancel (the browser took the touch) puts the picture back.
   */
  const trackGripGesture = (
    start: MouseEvent,
    onMove: (move: MouseEvent) => void,
    onUp: () => void,
    onAbort?: () => void,
  ) => {
    if (start.type === "pointerdown" && isTouchLikePointer(start as PointerEvent)) {
      const gesture = beginObjectDragGesture(
        start as PointerEvent,
        {
          onMove: (move) => onMove(move),
          onEnd: () => onUp(),
          onCancel: () => {
            activeDragCleanup = null;
            apply(currentNode);
            onAbort?.();
          },
        },
        {
          element: start.currentTarget instanceof Element ? start.currentTarget : null,
          immediate: true,
          clickSlopPx: 1,
        },
      );
      activeDragCleanup = () => {
        activeDragCleanup = null;
        gesture.cancel();
      };
      return;
    }
    activeDragCleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      activeDragCleanup = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startHandleDrag = (handle: ImageResizeHandle, event: MouseEvent) => {
    if (!editor.isEditable) return;
    const startDoc = editor.state.doc;
    const startPos = typeof getPos === "function" ? getPos() : null;
    const startNode =
      typeof startPos === "number" ? startDoc.nodeAt(startPos) : null;
    if (
      typeof startPos !== "number" ||
      startNode !== currentNode ||
      !isPictureNode(startNode)
    ) {
      return;
    }
    activeDragCleanup?.();
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const box = pictureBox();
    const startWidth = box.width;
    const startHeight = box.height;
    const ratio = box.ratio;
    const aspectLocked = currentNode.attrs.pictureLockAspectRatio !== false;
    const toLocal = pointerToPictureAxes(currentNode);
    // Ordinary top-level inline images obey their physical page/column box.
    // Anchors and image-row children keep their existing Word-like resize
    // semantics and are not constrained by this inline pagination policy.
    const pageFrame = inlineImagePageFrame(currentNode, wrapper, img);
    const parentWidth = wrapper.parentElement?.getBoundingClientRect().width;
    const maxWidth =
      pageFrame?.width ??
      (parentWidth === undefined ? undefined : parentWidth / toLocal.scaleX);
    const maxHeight = pageFrame?.height;
    let last: ResizeImageResult | null = null;
    const live = beginLive(startPos);
    // A handle dragged past the opposite side mirrors the picture in the
    // same gesture, as Word flips it: the crossed axis toggles the picture's
    // own flag (a picture whose visual formatting the source cannot take
    // back floors at the minimum instead), and dragging back restores it.
    const mirrors = visualFormattingEditable(currentNode);
    const startFlip = {
      horizontal: normalizeImageFlip(currentNode.attrs.pictureFlipHorizontal),
      vertical: normalizeImageFlip(currentNode.attrs.pictureFlipVertical),
    };
    const flipOf = (result: ResizeImageResult) => ({
      horizontal: startFlip.horizontal !== result.flipX,
      vertical: startFlip.vertical !== result.flipY,
    });

    const compute = (move: MouseEvent): ResizeImageResult => {
      const local = toLocal.delta(move.clientX - startX, move.clientY - startY);
      return resizeImageFromHandle({
        startWidth,
        startHeight,
        dx: local.dx,
        dy: local.dy,
        handle,
        ratio,
        // Word: with Lock aspect ratio on, a corner keeps the picture's
        // proportions; with it off, a corner resizes freely and Shift keeps
        // them.
        free: aspectLocked ? false : !move.shiftKey,
        maxWidth,
        maxHeight,
        throughZero: mirrors,
      });
    };

    const onMove = (move: MouseEvent) => {
      if (
        !editor.isEditable ||
        editor.state.doc !== startDoc ||
        editor.state.doc.nodeAt(startPos) !== startNode
      ) {
        activeDragCleanup?.();
        apply(currentNode);
        live.end();
        return;
      }
      last = compute(move);
      // Live preview: pixel-size the img directly (override any percent width
      // so the preview tracks the pointer 1:1). Committed on mouseup.
      img.style.width = `${last.width}px`;
      img.style.height = `${last.height}px`;
      live.move([{ pos: startPos, w: last.width, h: last.height }]);
      // The mirror previews on the wrapper, as the picture's own flags paint.
      const flip = flipOf(last);
      wrapper.style.scale =
        flip.horizontal || flip.vertical
          ? `${flip.horizontal ? -1 : 1} ${flip.vertical ? -1 : 1}`
          : "";
      if (wrapper.hasAttribute("data-page-fit-inline-image")) {
        wrapper.style.setProperty(
          "--page-fit-image-width",
          `${last.width}px`,
        );
        wrapper.style.setProperty(
          "--page-fit-image-height",
          `${last.height}px`,
        );
      }
    };

    const onUp = () => {
      activeDragCleanup?.();
      if (
        !editor.isEditable ||
        editor.state.doc !== startDoc ||
        editor.state.doc.nodeAt(startPos) !== startNode
      ) {
        apply(currentNode);
        live.end();
        return;
      }
      // A handle click with no movement is a no-op (no mousemove fired): never
      // mutate the doc — keeps an un-dragged image byte-stable.
      const result = last;
      if (result === null) return;
      commitResize(result);
      live.end();
    };
    const commitResize = (result: ResizeImageResult) => {
      const { state, view } = editor;
      const flip = flipOf(result);
      const flipped =
        flip.horizontal !== startFlip.horizontal ||
        flip.vertical !== startFlip.vertical;
      // ONE transaction → ONE undo step. Drag writes px width/height + their
      // EMU twins and CLEARS the percent preset so the two never fight; a
      // drag through the opposite edge writes the mirror it showed.
      view.dispatch(
        state.tr.setNodeMarkup(startPos, undefined, {
          ...startNode.attrs,
          width: result.width,
          height: result.height,
          widthEmu: result.widthEmu,
          heightEmu: result.heightEmu,
          widthPercent: null,
          ...(flipped
            ? {
                pictureFlipHorizontal: flip.horizontal,
                pictureFlipVertical: flip.vertical,
              }
            : {}),
        }),
      );
    };

    trackGripGesture(event, onMove, onUp, live.end);
  };

  // Word's rotation handle: drag to turn the picture about its centre, Shift
  // for 15-degree steps. The picture turns live; on release one whole-degree
  // rotation is committed as its own undo step.
  const startRotateDrag = (event: MouseEvent) => {
    if (!editor.isEditable || event.button !== 0) return;
    const startDoc = editor.state.doc;
    const startPos = typeof getPos === "function" ? getPos() : null;
    const startNode =
      typeof startPos === "number" ? startDoc.nodeAt(startPos) : null;
    if (
      typeof startPos !== "number" ||
      startNode !== currentNode ||
      !isPictureNode(startNode) ||
      !visualFormattingEditable(startNode)
    ) {
      return;
    }
    activeDragCleanup?.();
    event.preventDefault();
    event.stopPropagation();
    // A rotation keeps the element's centre, so the rotated bounds share it.
    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(
      event.clientY - centerY,
      event.clientX - centerX,
    );
    const startRotation = normalizeImageRotation(
      startNode.attrs.pictureRotation,
    );
    let preview: number | null = null;
    const live = beginLive(startPos);

    const onMove = (move: MouseEvent) => {
      if (!editor.isEditable || editor.state.doc !== startDoc) {
        activeDragCleanup?.();
        apply(currentNode);
        live.end();
        return;
      }
      const angle = Math.atan2(move.clientY - centerY, move.clientX - centerX);
      const degrees = startRotation + ((angle - startAngle) * 180) / Math.PI;
      preview = normalizeImageRotation(
        move.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees),
      );
      setPictureTurn(preview);
      live.move([{ pos: startPos, r: preview }]);
    };

    const onUp = () => {
      activeDragCleanup?.();
      if (
        !editor.isEditable ||
        editor.state.doc !== startDoc ||
        editor.state.doc.nodeAt(startPos) !== startNode
      ) {
        apply(currentNode);
        live.end();
        return;
      }
      // A click with no movement, or a turn back to where it started, leaves
      // the picture's bytes alone.
      if (preview === null || preview === startRotation) {
        apply(currentNode);
        live.end();
        return;
      }
      commitTurn(preview);
      live.end();
    };
    const commitTurn = (preview: number) => {
      const { state, view } = editor;
      view.dispatch(
        closeHistory(
          state.tr.setNodeMarkup(startPos, undefined, {
            ...startNode.attrs,
            pictureRotation: preview,
          }),
        ),
      );
    };

    trackGripGesture(event, onMove, onUp, live.end);
  };

  // The laid-out frame (the <img> box, transform-free) and the frame the
  // picture's attrs author. They differ only while a page fit projects the
  // picture smaller; pointer math uses the first, the commit the second.
  const cropFrames = (target: ProseMirrorNode) => {
    const layout = { width: img.offsetWidth, height: img.offsetHeight };
    if (!(layout.width > 0 && layout.height > 0)) return null;
    const attrs = target.attrs as Record<string, unknown>;
    const width = attrsDimensionPx(attrs, "width", "widthEmu");
    const height = attrsDimensionPx(attrs, "height", "heightEmu");
    const authored =
      width !== null && height !== null && attrs.widthPercent == null
        ? { width, height, widthEmu: attrs.widthEmu, heightEmu: attrs.heightEmu }
        : layout;
    return { layout, authored };
  };

  // Word's crop handles: a handle moves its frame edge over a source that
  // stays put at its scale, so the committed frame shrinks or grows by the
  // kept fraction together with the crop (documentImageCropFrameSize). The
  // pointer is read in the picture's own axes (zoom, rotation and flips).
  const startCropHandleDrag = (
    handle: DocumentImageCropHandle,
    event: PointerEvent,
  ) => {
    if (
      (typeof event.button === "number" && event.button !== 0) ||
      !editor.isEditable
    ) {
      return;
    }
    if (wrapper.getAttribute("data-picture-crop-mode") !== "true") return;
    const target = readDocumentImageCropTarget(editor);
    const pos = typeof getPos === "function" ? getPos() : null;
    if (
      !target ||
      typeof pos !== "number" ||
      target.pos !== pos ||
      target.node !== currentNode
    ) {
      return;
    }
    const frames = cropFrames(target.node);
    if (!frames) return;
    activeDragCleanup?.();
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = documentImageCropInsets(target.node.attrs);
    const source = documentImageCropSourceSize(frames.layout, start);
    const toLocal = pointerToPictureAxes(target.node);
    let preview: DocumentImageCropInsets | null = null;

    const matchesPointer = (candidate: PointerEvent) =>
      pointerId === undefined || candidate.pointerId === pointerId;
    const onMove = (move: PointerEvent) => {
      if (!matchesPointer(move)) return;
      const local = toLocal.delta(move.clientX - startX, move.clientY - startY);
      preview = documentImageCropFromHandle(
        start,
        handle,
        local.dx,
        local.dy,
        source.width,
        source.height,
      );
      applyCropPreview(preview);
    };
    const cancel = () => {
      activeDragCleanup?.();
      apply(currentNode);
    };
    const onUp = (up: PointerEvent) => {
      if (!matchesPointer(up)) return;
      activeDragCleanup?.();
      if (
        !preview ||
        !commitDocumentImageCrop(
          editor,
          target,
          preview,
          documentImageCropFrameSize(frames.authored, start, preview),
        )
      ) {
        apply(currentNode);
      }
    };
    const onCancel = (cancelled: PointerEvent) => {
      if (matchesPointer(cancelled)) cancel();
    };
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      cancel();
      exitDocumentImageCrop(editor);
    };

    activeDragCleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      activeDragCleanup = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
  };

  // Word: in crop mode the picture can be dragged under its frame. The frame
  // keeps its size and place; the source (and its dimmed ring) follows the
  // pointer until an edge would leave the 0-45 % insets.
  const startCropMoveDrag = (event: PointerEvent) => {
    if (
      (typeof event.button === "number" && event.button !== 0) ||
      !editor.isEditable ||
      wrapper.getAttribute("data-picture-crop-mode") !== "true"
    ) {
      return;
    }
    const target = readDocumentImageCropTarget(editor);
    const pos = typeof getPos === "function" ? getPos() : null;
    if (
      !target ||
      typeof pos !== "number" ||
      target.pos !== pos ||
      target.node !== currentNode
    ) {
      return;
    }
    const frames = cropFrames(target.node);
    if (!frames) return;
    activeDragCleanup?.();
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = documentImageCropInsets(target.node.attrs);
    const source = documentImageCropSourceSize(frames.layout, start);
    const toLocal = pointerToPictureAxes(target.node);
    let preview: DocumentImageCropInsets | null = null;
    const matchesPointer = (candidate: PointerEvent) =>
      pointerId === undefined || candidate.pointerId === pointerId;
    const clearShift = () => {
      wrapper.style.removeProperty("--picture-crop-shift-x");
      wrapper.style.removeProperty("--picture-crop-shift-y");
    };
    const onMove = (move: PointerEvent) => {
      if (!matchesPointer(move)) return;
      const local = toLocal.delta(move.clientX - startX, move.clientY - startY);
      preview = documentImageCropFromMove(
        start,
        local.dx,
        local.dy,
        source.width,
        source.height,
      );
      // The source moves by what the clamped insets allow; the frame (hole
      // and handles, in percent of the moved source) stays where it is.
      wrapper.style.setProperty(
        "--picture-crop-shift-x",
        `${((start.left - preview.left) / 100) * source.width}px`,
      );
      wrapper.style.setProperty(
        "--picture-crop-shift-y",
        `${((start.top - preview.top) / 100) * source.height}px`,
      );
      applyCropPreview(preview);
    };
    const cancel = () => {
      activeDragCleanup?.();
      clearShift();
      apply(currentNode);
    };
    const onUp = (up: PointerEvent) => {
      if (!matchesPointer(up)) return;
      activeDragCleanup?.();
      clearShift();
      if (!preview || !commitDocumentImageCrop(editor, target, preview)) {
        apply(currentNode);
      }
    };
    const onCancel = (cancelled: PointerEvent) => {
      if (matchesPointer(cancelled)) cancel();
    };
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      cancel();
      exitDocumentImageCrop(editor);
    };
    activeDragCleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      activeDragCleanup = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
  };

  const nudgeResizeHandle = (
    handle: ImageResizeHandle,
    event: KeyboardEvent,
  ) => {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    if (!editor.isEditable) return;
    const box = pictureBox();
    if (box.width <= 0 || box.height <= 0) return;
    const aspectLocked = currentNode.attrs.pictureLockAspectRatio !== false;
    const step = event.shiftKey ? 10 : 1;
    let dx = horizontal
      ? event.key === "ArrowLeft"
        ? -step
        : step
      : 0;
    let dy = vertical ? (event.key === "ArrowUp" ? -step : step) : 0;
    const corner = !isHorizontalEdge(handle) && !isVerticalEdge(handle);
    if (corner && vertical && aspectLocked) {
      const grows =
        (handle.includes("n") && event.key === "ArrowUp") ||
        (handle.includes("s") && event.key === "ArrowDown");
      const desiredWidthDelta = (grows ? step : -step) / box.ratio;
      dx = growsRight(handle) ? desiredWidthDelta : -desiredWidthDelta;
      dy = 0;
    }
    const pageFrame = inlineImagePageFrame(currentNode, wrapper, img);
    const result = resizeImageFromHandle({
      startWidth: box.width,
      startHeight: box.height,
      dx,
      dy,
      handle,
      ratio: box.ratio,
      free: !aspectLocked,
      maxWidth:
        pageFrame?.width ??
        wrapper.parentElement?.getBoundingClientRect().width ??
        undefined,
      maxHeight: pageFrame?.height,
    });
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number") return;
    const { state, view } = editor;
    const current = state.doc.nodeAt(pos);
    if (!current || !isPictureNode(current)) return;
    event.preventDefault();
    event.stopPropagation();
    if (
      current.attrs.width === result.width &&
      current.attrs.height === result.height &&
      current.attrs.widthEmu === result.widthEmu &&
      current.attrs.heightEmu === result.heightEmu &&
      current.attrs.widthPercent == null
    ) {
      return;
    }
    view.dispatch(
      state.tr.setNodeMarkup(pos, undefined, {
        ...current.attrs,
        width: result.width,
        height: result.height,
        widthEmu: result.widthEmu,
        heightEmu: result.heightEmu,
        widthPercent: null,
      }),
    );
  };

  const nudgeCropHandle = (
    handle: DocumentImageCropHandle,
    event: KeyboardEvent,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      apply(currentNode);
      exitDocumentImageCrop(editor);
      return;
    }
    if (!editor.isEditable) return;
    const target = readDocumentImageCropTarget(editor);
    const pos = typeof getPos === "function" ? getPos() : null;
    if (!target || target.pos !== pos || target.node !== currentNode) return;
    const frames = cropFrames(target.node);
    if (!frames) return;
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (
      (!horizontal && !vertical) ||
      (horizontal && !handle.includes("w") && !handle.includes("e")) ||
      (vertical && !handle.includes("n") && !handle.includes("s"))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // One step is 1 % of the source on the arrow's axis, the frame following
    // as a drag moves it.
    const dx =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const start = documentImageCropInsets(target.node.attrs);
    const next = documentImageCropFromHandle(start, handle, dx, dy, 100, 100);
    if (
      !commitDocumentImageCrop(
        editor,
        target,
        next,
        documentImageCropFrameSize(frames.authored, start, next),
      )
    ) {
      apply(currentNode);
    }
  };

  const resizeHandleElements = new Map<ImageResizeHandle, HTMLElement>();
  for (const handle of IMAGE_RESIZE_HANDLES) {
    const el = document.createElement("span");
    // The shared grip paints the 8px white square with a 20px target, as on
    // shapes and charts; `note-editor-image-handle` keeps the show/hide and
    // crop-mode rules and lets print and measurement clones drop it.
    el.className = `note-editor-image-handle note-editor-image-handle--${handle} ${officeDrawingSelectionStyles.resize}`;
    el.dataset.officeDrawingHandle = handle;
    el.dataset.documentSelectionChrome = "true";
    el.style.setProperty("--office-drawing-grip-size", "20px");
    el.style.setProperty("--office-drawing-grip-edge", "-10px");
    el.setAttribute("data-testid", `image-resize-handle-${handle}`);
    el.setAttribute("aria-label", labels.resize[handle]);
    el.setAttribute("role", "button");
    el.tabIndex = -1;
    el.contentEditable = "false";
    el.addEventListener("mousedown", (event) => {
      // a tap's compatibility mousedown: the pointerdown below has it
      if (isCompatMouseFromTouch(event)) return;
      startHandleDrag(handle, event);
    });
    // A finger (or a pen that cannot hover) drags the grip with pointer
    // events: a touch sends no mousemove while it moves.
    el.addEventListener("pointerdown", (event) => {
      if (isTouchLikePointer(event)) startHandleDrag(handle, event);
    });
    el.addEventListener("keydown", (event) => nudgeResizeHandle(handle, event));
    chrome.appendChild(el);
    resizeHandleElements.set(handle, el);
  }

  // The rotation handle shapes wear (OfficeDrawingSelection), above the
  // picture's top edge; only a picture whose rotation can be saved offers it.
  const rotateGrip = document.createElement("span");
  rotateGrip.className = `${officeDrawingSelectionStyles.rotate} ${chromeStyles.rotate}`;
  rotateGrip.setAttribute("data-testid", "image-rotate-handle");
  rotateGrip.dataset.officeDrawingRotate = "true";
  rotateGrip.dataset.documentSelectionChrome = "true";
  rotateGrip.setAttribute("role", "button");
  rotateGrip.setAttribute("aria-label", labels.rotate);
  rotateGrip.title = labels.rotate;
  rotateGrip.tabIndex = -1;
  rotateGrip.contentEditable = "false";
  rotateGrip.append(rotateGripIcon());
  rotateGrip.addEventListener("mousedown", (event) => {
    if (isCompatMouseFromTouch(event)) return;
    startRotateDrag(event);
  });
  rotateGrip.addEventListener("pointerdown", (event) => {
    if (isTouchLikePointer(event)) startRotateDrag(event);
  });
  chrome.appendChild(rotateGrip);

  // Crop mode (Word): a box over the WHOLE source at its drawn scale and
  // place, with the part outside the frame dimmed and the black crop handles
  // on the frame's edges -- both placed in percent of the source by the
  // previewed insets. Dragging the box moves the picture under the frame.
  // Shown only in crop mode; print and measurement clones drop it.
  const cropBox = document.createElement("span");
  cropBox.className = "note-editor-image-crop-box";
  cropBox.dataset.testid = "image-crop-box";
  cropBox.dataset.documentSelectionChrome = "true";
  cropBox.contentEditable = "false";
  const cropDim = document.createElement("span");
  cropDim.className = "note-editor-image-crop-dim";
  cropDim.setAttribute("aria-hidden", "true");
  cropBox.appendChild(cropDim);
  cropBox.addEventListener("pointerdown", (event) => {
    if (event.target === cropBox || event.target === cropDim) {
      startCropMoveDrag(event);
    }
  });
  for (const handle of DOCUMENT_IMAGE_CROP_HANDLES) {
    const el = document.createElement("span");
    el.className = `note-editor-image-crop-handle note-editor-image-crop-handle--${handle}`;
    el.setAttribute("data-testid", `image-crop-handle-${handle}`);
    el.setAttribute("aria-label", labels.crop[handle]);
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.contentEditable = "false";
    el.addEventListener("pointerdown", (event) =>
      startCropHandleDrag(handle, event),
    );
    el.addEventListener("keydown", (event) => nudgeCropHandle(handle, event));
    cropBox.appendChild(el);
  }
  chrome.appendChild(cropBox);

  // A floating picture, selected, moves on its page when dragged by its body,
  // as Word moves it: its anchor's offsets on the same origins
  // (`chartPlacement.moveLiveDocumentDrawingBy`). The grips, the crop box and
  // a picture in line keep their own gestures.
  wrapper.addEventListener("pointerdown", (event) => {
    if (!wrapper.classList.contains("is-selected") || !editor.isEditable) return;
    if (!wrapper.hasAttribute("data-float-anchor") || wrapper.dataset.inlinePicture === "true") return;
    if (wrapper.getAttribute("data-picture-crop-mode") === "true") return;
    if ((event.target as Element | null)?.closest?.("[data-document-selection-chrome]")) return;
    const pos = typeof getPos === "function" ? getPos() : undefined;
    startFloatingDrawingDrag(
      event,
      wrapper,
      (dx, dy) => {
        moveLiveDocumentDrawingBy(editor, wrapper, dx, dy);
      },
      typeof pos === "number" ? beginLive(pos) : null,
    );
  });

  return {
    dom: wrapper,
    update: (updated, decorations: readonly Decoration[] = []) => {
      // One NodeView per placement: a block<->inline conversion replaces the
      // node type and must rebuild the DOM (block wrapper vs baseline run).
      if (updated.type !== node.type) return false;
      const previewSpec = decorations
        .map(
          (decoration) =>
            decoration.spec as { pictureStylePreview?: unknown } | undefined,
        )
        .find((spec) => typeof spec?.pictureStylePreview === "string");
      pictureStylePreview =
        (previewSpec?.pictureStylePreview as string | undefined) ?? null;
      apply(updated);
      // apply() writes the wrapper's style whole, and the editor patches a
      // decoration's style only when it changes: a style hovered took the
      // line's own decoration (the line spacing's) off the picture for good.
      for (const decoration of decorations) {
        const style = (decoration as unknown as { type?: { attrs?: { style?: unknown } } }).type?.attrs?.style;
        if (typeof style === "string" && style) wrapper.style.cssText += `;${style}`;
      }
      return true;
    },
    // The drag mutates wrapper/img styles live; PM must not re-parse those.
    ignoreMutation: () => true,
    selectNode: () => {
      wrapper.classList.add("is-selected");
      syncSelectionChromeBox();
      for (const handle of resizeHandleElements.values()) handle.tabIndex = 0;
    },
    deselectNode: () => {
      wrapper.classList.remove("is-selected");
      for (const handle of resizeHandleElements.values()) handle.tabIndex = -1;
    },
    // If the NodeView is destroyed mid-drag (setContent re-hydration), detach the
    // in-flight window mousemove/mouseup so they can't fire onMove/onUp later.
    destroy: () => {
      destroyed = true;
      stopWaitingForHome?.();
      stopWaitingForHome = null;
      unregisterLiveTarget();
      pictureStyleLayer.destroy();
      attachmentRequestGeneration += 1;
      attachmentRequestController?.abort();
      attachmentRequestController = null;
      activeDragCleanup?.();
      img.removeEventListener("load", onImageLoad);
      img.removeEventListener("error", onImageError);
      pictureBoxObserver?.disconnect();
      window.removeEventListener("mrn-page-rebalance", onPageGeometryChange);
      stopWaitingForSheet?.();
      stopWaitingForSheet = null;
      window.removeEventListener("resize", onPageGeometryChange);
      if (projectionRaf) {
        window.cancelAnimationFrame(projectionRaf);
        projectionRaf = 0;
      }
    },
  };
}
