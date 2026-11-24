"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Selection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  adjustCropEdge,
  pictureAspectRatioCropRect,
  type CropRect,
  type PictureCropAspectRatioId,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { EMU_PER_PX } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { fitDrawingWithinPageBox } from "@mrnote/core/web/lib/paged-layout/drawingPageFit.ts";
import {
  loadOfficeImageNaturalSize,
  officeCropRectPercents,
  officePictureFitCrop,
  type OfficePixelSize,
} from "@mrnote/core/web/lib/office-picture-fit.ts";
import {
  MAX_IMAGE_CROP_PERCENT,
  MIN_IMAGE_CROP_PERCENT,
  normalizeImageCropPercent,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";

export const DOCUMENT_IMAGE_CROP_HANDLES = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
] as const;

export type DocumentImageCropHandle =
  (typeof DOCUMENT_IMAGE_CROP_HANDLES)[number];

export interface DocumentImageCropInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface DocumentImageCropTarget {
  readonly editor: Editor;
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

interface DocumentImageCropPluginState {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

type DocumentImageCropMeta = "enter" | "exit";

export const documentImageCropPluginKey =
  new PluginKey<DocumentImageCropPluginState | null>("documentImageCrop");

function imageVisualFormattingEditable(node: ProseMirrorNode): boolean {
  const attrs = node.attrs as Record<string, unknown>;
  return (
    attrs.pictureVisualFormattingEditable === true ||
    (attrs.pictureVisualFormattingEditable == null &&
      attrs.officeImage !== true)
  );
}

function exactImageSelection(
  state: EditorState,
): DocumentImageCropPluginState | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (
    !isPictureNode(node) ||
    state.doc.nodeAt(selection.from) !== node ||
    !imageVisualFormattingEditable(node)
  ) {
    return null;
  }
  return { pos: selection.from, node };
}

export function createDocumentImageCropPlugin(): Plugin<DocumentImageCropPluginState | null> {
  return new Plugin<DocumentImageCropPluginState | null>({
    key: documentImageCropPluginKey,
    state: {
      init: () => null,
      apply: (transaction, current, _oldState, newState) => {
        const request = transaction.getMeta(documentImageCropPluginKey) as
          DocumentImageCropMeta | undefined;
        if (request === "exit") return null;
        const selected = exactImageSelection(newState);
        if (request === "enter") return selected;
        if (!current || !selected) return null;
        const mappedPos = transaction.mapping.map(current.pos, 1);
        return selected.pos === mappedPos ? selected : null;
      },
    },
    props: {
      decorations: (state) => {
        const target = documentImageCropPluginKey.getState(state);
        if (!target || state.doc.nodeAt(target.pos) !== target.node) {
          return DecorationSet.empty;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(target.pos, target.pos + target.node.nodeSize, {
            "data-picture-crop-mode": "true",
          }),
        ]);
      },
      handleKeyDown: (view, event) => {
        if (
          event.key !== "Escape" ||
          documentImageCropPluginKey.getState(view.state) === null
        ) {
          return false;
        }
        view.dispatch(
          view.state.tr
            .setMeta(documentImageCropPluginKey, "exit")
            .setMeta("addToHistory", false),
        );
        return true;
      },
    },
  });
}

export function isDocumentImageCropActive(state: EditorState): boolean {
  return documentImageCropPluginKey.getState(state) !== null;
}

export function enterDocumentImageCrop(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const selected = exactImageSelection(editor.state);
  if (!selected) return false;
  const current = documentImageCropPluginKey.getState(editor.state);
  if (current?.pos === selected.pos && current.node === selected.node)
    return true;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(documentImageCropPluginKey, "enter")
      .setMeta("addToHistory", false),
  );
  return isDocumentImageCropActive(editor.state);
}

export function exitDocumentImageCrop(editor: Editor): boolean {
  if (editor.isDestroyed || !isDocumentImageCropActive(editor.state)) {
    return false;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(documentImageCropPluginKey, "exit")
      .setMeta("addToHistory", false),
  );
  return true;
}

export function readDocumentImageCropTarget(
  editor: Editor,
): DocumentImageCropTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const selected = exactImageSelection(editor.state);
  const active = documentImageCropPluginKey.getState(editor.state);
  if (
    !selected ||
    !active ||
    active.pos !== selected.pos ||
    active.node !== selected.node
  ) {
    return null;
  }
  return {
    editor,
    doc: editor.state.doc,
    selection: editor.state.selection,
    pos: selected.pos,
    node: selected.node,
  };
}

export function documentImageCropInsets(
  attrs: Readonly<Record<string, unknown>>,
): DocumentImageCropInsets {
  return {
    top: normalizeImageCropPercent(attrs.pictureCropTop),
    right: normalizeImageCropPercent(attrs.pictureCropRight),
    bottom: normalizeImageCropPercent(attrs.pictureCropBottom),
    left: normalizeImageCropPercent(attrs.pictureCropLeft),
  };
}

function cropRectFromInsets(insets: DocumentImageCropInsets): CropRect {
  return {
    x: insets.left / 100,
    y: insets.top / 100,
    w: Math.max(0.01, 1 - (insets.left + insets.right) / 100),
    h: Math.max(0.01, 1 - (insets.top + insets.bottom) / 100),
  };
}

function cropInsetsFromRect(rect: CropRect): DocumentImageCropInsets {
  return {
    top: normalizeImageCropPercent(rect.y * 100),
    right: normalizeImageCropPercent((1 - rect.x - rect.w) * 100),
    bottom: normalizeImageCropPercent((1 - rect.y - rect.h) * 100),
    left: normalizeImageCropPercent(rect.x * 100),
  };
}

// ---------------------------------------------------------------------------
// Drawing a cropped picture, and cropping it (Word semantics)
//
// ECMA-376 `pic:blipFill` = `a:blip` + `a:srcRect` + `a:stretch/a:fillRect`:
// srcRect names "the portion of the blip used for the fill", each edge an
// inset percentage of the SOURCE, and stretch fills the shape's bounding box
// (`wp:extent`, this model's `width`/`height`) with that portion. So the
// frame is the VISIBLE picture and the kept source region is scaled to fill
// it; the whole source is drawn at frame / kept-fraction on each axis, offset
// by the left/top inset. The exporter writes and the importer reads exactly
// that, and the node view draws it so (never the whole source squashed into
// the frame).
//
// Microsoft Support, "Crop a picture in Office": in crop mode black crop
// handles sit on the edges and corners of the picture; dragging a side handle
// inward crops that side, a corner crops the two adjacent sides, dragging
// outward uncrops. The cropped-away part stays visible, dimmed, outside the
// frame, and the picture can be dragged to reposition it under the frame. A
// handle moves the frame's edge while the source stays put at its scale, so a
// crop changes the frame size by the kept fraction (outcrop beyond the
// source's edge is a negative srcRect, which these 0-45 % insets cannot hold).
// Esc or a click outside the picture ends cropping; the cropped parts stay in
// the file. Reset Picture keeps the crop; Reset Picture & Size removes it.
// ---------------------------------------------------------------------------

export const NO_DOCUMENT_IMAGE_CROP: DocumentImageCropInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export function documentImageCropped(insets: DocumentImageCropInsets): boolean {
  // An outset edge is negative: any edge off zero changes the drawing.
  return insets.top !== 0 || insets.right !== 0 || insets.bottom !== 0 || insets.left !== 0;
}

/** Kept fraction of the source on one axis (the 45 % edges leave >= 10 %). */
function keptFraction(near: number, far: number): number {
  return Math.max(0.01, 1 - (near + far) / 100);
}

const round6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export interface DocumentImageCropDrawing {
  /**
   * The whole source's box in fractions of the frame: x/y <= 0 is where its
   * top-left sits left of / above the frame's, w/h >= 1 its size.
   */
  readonly source: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  /** background-size / background-position drawing the kept region into the frame box. */
  readonly backgroundSize: string;
  readonly backgroundPosition: string;
  /**
   * A transform (origin 0 0) that takes a raster stretched over the frame box
   * to the whole source at its drawn scale and place (crop mode).
   */
  readonly sourceTransform: string;
}

/** How a picture with these insets is drawn into its frame. */
export function documentImageCropDrawing(
  insets: DocumentImageCropInsets,
): DocumentImageCropDrawing {
  const keptX = keptFraction(insets.left, insets.right);
  const keptY = keptFraction(insets.top, insets.bottom);
  // A background-position percentage p aligns the image's p-point with the
  // box's: offset = (box - image) * p = -left * image when p = l / (l + r).
  // The same holds for outset edges (image smaller than the box): both the
  // difference and the offset change sign together.
  const alignX =
    insets.left + insets.right !== 0
      ? (insets.left / (insets.left + insets.right)) * 100
      : 0;
  const alignY =
    insets.top + insets.bottom !== 0
      ? (insets.top / (insets.top + insets.bottom)) * 100
      : 0;
  return {
    source: {
      x: round6(-insets.left / 100 / keptX),
      y: round6(-insets.top / 100 / keptY),
      w: round6(1 / keptX),
      h: round6(1 / keptY),
    },
    backgroundSize: `${round6(100 / keptX)}% ${round6(100 / keptY)}%`,
    backgroundPosition: `${round6(alignX)}% ${round6(alignY)}%`,
    sourceTransform: `scale(${round6(1 / keptX)}, ${round6(1 / keptY)}) translate(${round6(-insets.left)}%, ${round6(-insets.top)}%)`,
  };
}

/** The whole source's drawn size for a frame showing `insets` of it. */
export function documentImageCropSourceSize(
  frame: { readonly width: number; readonly height: number },
  insets: DocumentImageCropInsets,
): { width: number; height: number } {
  return {
    width: frame.width / keptFraction(insets.left, insets.right),
    height: frame.height / keptFraction(insets.top, insets.bottom),
  };
}

/** A picture frame as the node states it: px as drawn, and the EMU extent
 * the file keeps when the node has one. */
export interface DocumentImageCropFrame {
  readonly width: number;
  readonly height: number;
  readonly widthEmu?: unknown;
  readonly heightEmu?: unknown;
}

/** One frame edge in EMU: the stated extent when it is the one the px draw
 * (a finer value of the same size), else the px. */
function frameEdgeEmu(px: number, emu: unknown): number {
  const stated = Number(emu);
  return Number.isFinite(stated) && stated > 0 && Math.round(stated / EMU_PER_PX) === Math.round(px)
    ? stated
    : px * EMU_PER_PX;
}

/**
 * The frame that shows `to` of the source at the scale `frame` draws `from`
 * of it: a crop handle, the pane's crop edges and Reset move the frame's
 * edges over a source that keeps its scale. The extent is kept in whole EMU,
 * as the file keeps `wp:extent`, and the px it draws at follow from it
 * (whole CSS px, never below 1). Working in drawn px instead re-derived the
 * source's scale from a rounded frame on every step: fifty 1 % keyboard
 * steps took a 240 px picture to a 125 px half and a 250 px reset (WUA 026).
 */
export function documentImageCropFrameSize(
  frame: DocumentImageCropFrame,
  from: DocumentImageCropInsets,
  to: DocumentImageCropInsets,
): { width: number; height: number; widthEmu: number; heightEmu: number } {
  const edge = (px: number, emu: unknown, fromKept: number, toKept: number) => {
    const extent = Math.max(EMU_PER_PX, Math.round((frameEdgeEmu(px, emu) / fromKept) * toKept));
    return { px: Math.max(1, Math.round(extent / EMU_PER_PX)), emu: extent };
  };
  const width = edge(
    frame.width,
    frame.widthEmu,
    keptFraction(from.left, from.right),
    keptFraction(to.left, to.right),
  );
  const height = edge(
    frame.height,
    frame.heightEmu,
    keptFraction(from.top, from.bottom),
    keptFraction(to.top, to.bottom),
  );
  return { width: width.px, height: height.px, widthEmu: width.emu, heightEmu: height.emu };
}

/**
 * Drag the picture under its crop frame: the frame keeps its size and place,
 * the source moves by (dx, dy) of its drawn size. Each axis stops where an
 * inset would leave 0-45 %.
 */
export function documentImageCropFromMove(
  start: DocumentImageCropInsets,
  dx: number,
  dy: number,
  sourceWidth: number,
  sourceHeight: number,
): DocumentImageCropInsets {
  const shift = (
    near: number,
    far: number,
    delta: number,
    extent: number,
  ): [number, number] => {
    if (!Number.isFinite(delta) || !Number.isFinite(extent) || extent <= 0) {
      return [near, far];
    }
    const total = near + far;
    // An axis that is outset (Fit) keeps its outset as it is moved.
    const floor = Math.min(0, near, far);
    const next = Math.min(
      Math.min(MAX_IMAGE_CROP_PERCENT, total - floor),
      Math.max(Math.max(floor, total - MAX_IMAGE_CROP_PERCENT), near - (delta / extent) * 100),
    );
    const rounded = normalizeImageCropPercent(next);
    return [rounded, normalizeImageCropPercent(total - rounded)];
  };
  const [left, right] = shift(start.left, start.right, dx, sourceWidth);
  const [top, bottom] = shift(start.top, start.bottom, dy, sourceHeight);
  return { top, right, bottom, left };
}

/**
 * Pure crop-handle math shared by pointer and keyboard gestures. `dx`/`dy`
 * are in the picture's own axes and `width`/`height` are the WHOLE source's
 * drawn size (documentImageCropSourceSize), so a handle tracks the pointer.
 */
export function documentImageCropFromHandle(
  start: DocumentImageCropInsets,
  handle: DocumentImageCropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): DocumentImageCropInsets {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return start;
  }
  let rect = cropRectFromInsets(start);
  if (handle.includes("w")) rect = adjustCropEdge(rect, "left", dx / width);
  if (handle.includes("e")) rect = adjustCropEdge(rect, "right", dx / width);
  if (handle.includes("n")) rect = adjustCropEdge(rect, "top", dy / height);
  if (handle.includes("s")) rect = adjustCropEdge(rect, "bottom", dy / height);
  return cropInsetsFromRect(rect);
}

function sameCropInsets(
  left: DocumentImageCropInsets,
  right: DocumentImageCropInsets,
): boolean {
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

/**
 * Authenticate the frozen live target and commit all four edges atomically,
 * with the frame that keeps the source's scale when a gesture resized it.
 */
export function commitDocumentImageCrop(
  editor: Editor,
  target: DocumentImageCropTarget,
  requested: DocumentImageCropInsets,
  frame?: {
    readonly width: number;
    readonly height: number;
    readonly widthEmu?: number;
    readonly heightEmu?: number;
  },
): boolean {
  if (
    editor !== target.editor ||
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection
  ) {
    return false;
  }
  const current = readDocumentImageCropTarget(editor);
  if (
    !current ||
    current.pos !== target.pos ||
    current.node !== target.node ||
    current.doc.nodeAt(current.pos) !== current.node
  ) {
    return false;
  }
  const next = documentImageCropInsets({
    pictureCropTop: requested.top,
    pictureCropRight: requested.right,
    pictureCropBottom: requested.bottom,
    pictureCropLeft: requested.left,
  });
  const previous = documentImageCropInsets(current.node.attrs);
  if (sameCropInsets(previous, next)) return false;
  const size =
    frame &&
    Number.isFinite(frame.width) &&
    Number.isFinite(frame.height) &&
    frame.width > 0 &&
    frame.height > 0
      ? {
          width: frame.width,
          height: frame.height,
          widthEmu: frame.widthEmu ?? Math.round(frame.width * EMU_PER_PX),
          heightEmu: frame.heightEmu ?? Math.round(frame.height * EMU_PER_PX),
          // An explicit frame, as a resize drag writes it.
          widthPercent: null,
        }
      : {};

  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      current.pos,
      undefined,
      {
        ...current.node.attrs,
        ...size,
        pictureCropTop: next.top,
        pictureCropRight: next.right,
        pictureCropBottom: next.bottom,
        pictureCropLeft: next.left,
      },
      current.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, current.pos),
  );
  editor.view.dispatch(transaction);
  return true;
}

// ---------------------------------------------------------------------------
// Crop > Aspect Ratio / Fit (Word's Picture Format > Crop menu; Fill is the
// shared `office-picture-fit` command in DocumentToolbar)
//
// Word semantics (Microsoft Support, "Crop a picture" / "Crop a picture to
// fit in a shape"; ECMA-376 `a:srcRect` inside `pic:blipFill`, the frame is
// `wp:extent`): the picture's `width`/`height` are the frame the kept source
// region is drawn into, and the four `pictureCrop*` percentages are the
// `a:srcRect` insets of the SOURCE (0-45 % each in this model).
// - Aspect Ratio re-crops the kept source region to the chosen ratio around
//   its centre and resizes the frame by the same factors, so the picture keeps
//   its scale and the frame takes the ratio; cropping stays on to adjust it.
// - Fit shows the whole picture in its own proportions. Word keeps the frame
//   and letterboxes with a NEGATIVE srcRect, which these insets cannot state,
//   so Fit here drops the crop and fits the frame to the whole picture inside
//   the old frame (no bands).
// Every result an inset outside 0-45 % would need is refused, never clamped.
// ---------------------------------------------------------------------------

export interface DocumentImageFrame {
  /** The picture's frame, CSS px. */
  readonly width: number;
  readonly height: number;
  /** The image's own pixel size (its proportions). */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface DocumentImageCropResult {
  readonly width: number;
  readonly height: number;
  readonly insets: DocumentImageCropInsets;
}

function validFrame(frame: DocumentImageFrame): boolean {
  return [frame.width, frame.height, frame.naturalWidth, frame.naturalHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  );
}

function insetsWithinModel(
  raw: DocumentImageCropInsets,
): DocumentImageCropInsets | null {
  const edges = [raw.top, raw.right, raw.bottom, raw.left];
  if (
    edges.some(
      (edge) =>
        !Number.isFinite(edge) ||
        edge < MIN_IMAGE_CROP_PERCENT - 1e-6 ||
        edge > MAX_IMAGE_CROP_PERCENT + 1e-6,
    )
  ) {
    return null;
  }
  return documentImageCropInsets({
    pictureCropTop: raw.top,
    pictureCropRight: raw.right,
    pictureCropBottom: raw.bottom,
    pictureCropLeft: raw.left,
  });
}

/** Crop > Aspect Ratio: the new frame and source insets, or null. */
export function documentImageAspectRatioCrop(
  current: DocumentImageCropInsets,
  frame: DocumentImageFrame,
  ratioId: PictureCropAspectRatioId,
  minimumPx = 1,
): DocumentImageCropResult | null {
  if (!validFrame(frame)) return null;
  const kept = cropRectFromInsets(current);
  // The ratio is the one the FRAME shows (Word: 1:1 gives a square box),
  // so the picture's proportions are the ones it is drawn at: the frame
  // over the part of the picture it keeps. For a picture drawn at its own
  // proportions that is its pixel size's ratio; for one stretched to
  // another shape, measuring by its pixels would keep the stretch.
  if (!(kept.w > 0) || !(kept.h > 0)) return null;
  const next = pictureAspectRatioCropRect(
    kept,
    frame.width / kept.w,
    frame.height / kept.h,
    ratioId,
  );
  if (!next) return null;
  const insets = insetsWithinModel({
    top: next.y * 100,
    right: (1 - next.x - next.w) * 100,
    bottom: (1 - next.y - next.h) * 100,
    left: next.x * 100,
  });
  const width = Math.round((frame.width * next.w) / kept.w);
  const height = Math.round((frame.height * next.h) / kept.h);
  if (!insets || width < minimumPx || height < minimumPx) return null;
  return { width, height, insets };
}












export function documentImageFitCrop(
  frame: DocumentImageFrame,
  minimumPx = 1,
): DocumentImageCropResult | null {
  if (!validFrame(frame)) return null;
  if (frame.width < minimumPx || frame.height < minimumPx) return null;
  const scale = Math.min(
    frame.width / frame.naturalWidth,
    frame.height / frame.naturalHeight,
  );
  // The frame in fractions of the picture as drawn: 1 on the axis that
  // fills it, more on the other; the surplus is split between both sides.
  const outset = (frameEdge: number, drawnEdge: number) =>
    drawnEdge > 0 ? -((frameEdge / drawnEdge - 1) / 2) * 100 : 0;
  const horizontal = outset(frame.width, frame.naturalWidth * scale);
  const vertical = outset(frame.height, frame.naturalHeight * scale);
  const insets = insetsWithinModel({
    top: vertical,
    right: horizontal,
    bottom: vertical,
    left: horizontal,
  });
  if (!insets) return null;
  return { width: frame.width, height: frame.height, insets };
}

/**
 * Crop > Fill: the frame keeps its size and the whole source is cropped to
 * the frame's aspect about its centre (the shared `office-picture-fit` math
 * the deck and the worksheet use), as the edges this model stores; null when
 * either size is unknown.
 */
export function documentImageFillCropInsets(
  natural: OfficePixelSize,
  frame: { readonly width: number; readonly height: number },
): DocumentImageCropInsets | null {
  const edges = officeCropRectPercents(
    officePictureFitCrop("fill", natural, frame),
  );
  if (!edges) return null;
  return {
    top: normalizeImageCropPercent(edges.top),
    right: normalizeImageCropPercent(edges.right),
    bottom: normalizeImageCropPercent(edges.bottom),
    left: normalizeImageCropPercent(edges.left),
  };
}

function storedFramePx(pxValue: unknown, emuValue: unknown): number | null {
  const px = Number(pxValue);
  if (Number.isFinite(px) && px > 0) return px;
  const emu = Number(emuValue);
  return Number.isFinite(emu) && emu > 0 ? emu / EMU_PER_PX : null;
}

/**
 * A picture's frame and proportions from what the document stores, without
 * a DOM (the headless crop commands). The frame is the stored `width` /
 * `height` px, else `widthEmu` / `heightEmu` (what the toolbar reads before
 * it measures); a picture sized only by `widthPercent` takes that share of
 * its section's page content width (`pageContentBox`: the page less its
 * margins) with the height its stored or natural aspect gives, and a picture
 * with no stored size its natural size -- both fitted inside the page content
 * box, as the paged layout draws them (`fitDrawingWithinPageBox`). `natural`
 * is the picture's own pixel size. Null when any of it cannot be known.
 */
export function documentImageFrameFromNode(
  attrs: Readonly<Record<string, unknown>>,
  natural: OfficePixelSize | null,
  pageContentBox: { readonly width: number; readonly height: number } | null,
): DocumentImageFrame | null {
  if (!natural || !(natural.width > 0) || !(natural.height > 0)) return null;
  const storedWidth = storedFramePx(attrs.width, attrs.widthEmu);
  const storedHeight = storedFramePx(attrs.height, attrs.heightEmu);
  const percent = Number(attrs.widthPercent);
  const byPercent =
    attrs.widthPercent != null &&
    Number.isFinite(percent) &&
    percent > 0 &&
    percent <= 100;
  let drawn: { width: number; height: number } | null = null;
  if (byPercent || (storedWidth === null && storedHeight === null)) {
    if (!pageContentBox) return null;
    const ratio =
      storedWidth !== null && storedHeight !== null
        ? storedHeight / storedWidth
        : natural.height / natural.width;
    const width = byPercent
      ? (pageContentBox.width * percent) / 100
      : natural.width;
    drawn = fitDrawingWithinPageBox({ width, height: width * ratio }, pageContentBox);
  } else if (storedWidth !== null && storedHeight !== null) {
    drawn = { width: storedWidth, height: storedHeight };
  } else if (storedWidth !== null) {
    drawn = { width: storedWidth, height: (storedWidth * natural.height) / natural.width };
  } else if (storedHeight !== null) {
    drawn = { width: (storedHeight * natural.width) / natural.height, height: storedHeight };
  }
  if (!drawn) return null;
  const frame = {
    width: drawn.width,
    height: drawn.height,
    naturalWidth: natural.width,
    naturalHeight: natural.height,
  };
  return validFrame(frame) ? frame : null;
}

/**
 * The selected picture's frame and proportions: the frame from its attrs (or
 * its laid-out <img>), its own pixel size from the decoded <img>, else from
 * decoding its source (the shared loader the Fill command uses).
 */
export async function readDocumentImageFrame(
  editor: Editor,
  pos: number,
  node: ProseMirrorNode,
): Promise<DocumentImageFrame | null> {
  const dom = editor.view.nodeDOM(pos);
  const img =
    dom instanceof HTMLImageElement
      ? dom
      : dom instanceof HTMLElement
        ? dom.querySelector("img")
        : null;
  const attrs = node.attrs as Record<string, unknown>;
  const px = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };
  const width = px(attrs.width) ?? (img ? px(img.offsetWidth) : null);
  const height = px(attrs.height) ?? (img ? px(img.offsetHeight) : null);
  if (width === null || height === null) return null;
  let naturalWidth = img ? px(img.naturalWidth) : null;
  let naturalHeight = img ? px(img.naturalHeight) : null;
  if (naturalWidth === null || naturalHeight === null) {
    const natural = await loadOfficeImageNaturalSize(attrs.src);
    naturalWidth = natural?.width ?? null;
    naturalHeight = natural?.height ?? null;
  }
  if (naturalWidth === null || naturalHeight === null) return null;
  return { width, height, naturalWidth, naturalHeight };
}
