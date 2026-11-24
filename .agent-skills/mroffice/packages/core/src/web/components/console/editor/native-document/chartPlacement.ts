/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Layout Options on a Docs chart: Position, Wrap Text (with Move with
 * Text / Fix Position on Page), Bring Forward / Send Backward, Align, a drag.
 *
 * A Word chart floats exactly as a picture does, so a floating chart carries
 * the picture's `floatAnchor` (`wp:anchor`) and every choice here restates it
 * through `office-float-anchor-edit`; the float pass places it and the save
 * writes the same anchor (chart_host_patchback / document_docx_charts). A
 * chart floated by the earlier coarse host layout (`documentChart.layout`,
 * left/centre/right of the column) is read as the anchor that layout wrote
 * and leaves the host on its first change.
 */

import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import { reanchorMovedDocumentFloats } from "./floatReanchor";

import { nextDocumentFloatingHeight, type resolveDocumentShapeStack } from "../../../../lib/document-shapes";
import { EMU_PER_PX, normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import {
  floatAnchorAligned,
  floatAnchorAtPosition,
  floatAnchorMovedBy,
  floatAnchorMovesWithText,
  floatAnchorOutOfLine,
  floatAnchorWithMoveWithText,
  floatAnchorWithWrap,
  floatPositionPresetOf,
  floatWrapChoiceOf,
  type FloatPositionPreset,
  type FloatWrapChoice,
} from "../../../../lib/office-float-anchor-edit";

import { convertInlineDrawingToBlock } from "../extensions/objectPlacement";
import {
  DEFAULT_DOCUMENT_CHART_SIZE,
  documentChartSize,
  normalizeDocumentChartHost,
} from "../extensions/documentChartHost";
import { commitLiveDocumentChartAttrs, liveDocumentChartTarget } from "./chartButtons";
import { BLOCK_PICTURE_NODE_NAME, INLINE_PICTURE_NODE_NAME } from "./documentObjectNodes";
import { pictureFloatAnchor } from "./pictureFloat";
import { floatPaintOf, inLineDrawingColumnOffsetPx } from "./floatingTextBoxLayout";
import { applyFloatingStackZOrder, floatingStackZOrderAtBoundary } from "./floatingStackOrder";

export type DocumentChartPlacementCommand =
  | { readonly kind: "inline" }
  | { readonly kind: "wrap"; readonly wrap: FloatWrapChoice }
  | { readonly kind: "position"; readonly preset: FloatPositionPreset }
  | { readonly kind: "moveWithText"; readonly value: boolean }
  | { readonly kind: "align"; readonly align: "left" | "center" | "right" | "top" | "middle" | "bottom" }
  | { readonly kind: "order"; readonly step: "forward" | "backward" | "front" | "back" };

/** What the Arrange group shows for a chart. */
export interface DocumentChartPlacementState {
  readonly wrap: FloatWrapChoice | "inline";
  readonly preset: FloatPositionPreset | null;
  /** Null for a chart in line (the choice does not apply). */
  readonly moveWithText: boolean | null;
  readonly canBringForward: boolean;
  readonly canSendBackward: boolean;
}

/**
 * The anchor a chart floats by: its own `floatAnchor`, or the one the coarse
 * host layout wrote (column-aligned, top of its paragraph, Word's defaults).
 * Null for a chart in line with its text.
 */
export function documentChartAnchor(attrs: Readonly<Record<string, unknown>>): FloatAnchor | null {
  const size = documentChartSize(attrs as Record<string, unknown>) ?? DEFAULT_DOCUMENT_CHART_SIZE;
  const own = normalizeFloatAnchor(attrs.floatAnchor);
  if (own) return { ...own, widthEmu: size.widthEmu, heightEmu: size.heightEmu };
  let layout;
  try {
    layout = normalizeDocumentChartHost(attrs.documentChart)?.layout;
  } catch {
    layout = undefined;
  }
  if (!layout || layout.mode !== "floating") return null;
  const overlay = layout.wrap === "behindText" || layout.wrap === "inFrontOfText";
  const base = floatAnchorOutOfLine({
    widthEmu: size.widthEmu,
    heightEmu: size.heightEmu,
    columnOffsetEmu: 0,
    paragraphOffsetEmu: 0,
    relativeHeight: layout.relativeHeight,
    wrap: layout.wrap === "square" ? "square" : layout.wrap,
  });
  return {
    ...base,
    horizontal: { relativeFrom: "column", align: layout.horizontal },
    vertical: { relativeFrom: "paragraph", align: "top" },
    distLEmu: overlay ? 0 : base.distLEmu,
    distREmu: overlay ? 0 : base.distREmu,
  };
}

export function documentChartPlacementState(
  doc: Parameters<typeof resolveDocumentShapeStack>[0],
  attrs: Readonly<Record<string, unknown>>,
  /** The chart's position: the floating stack knows its members by it. */
  pos: number | null = null,
): DocumentChartPlacementState {
  return placementStateOf(doc, documentChartAnchor(attrs), pos);
}

function placementStateOf(
  doc: Parameters<typeof resolveDocumentShapeStack>[0],
  anchor: FloatAnchor | null,
  pos: number | null,
): DocumentChartPlacementState {
  if (!anchor) {
    return { wrap: "inline", preset: null, moveWithText: null, canBringForward: false, canSendBackward: false };
  }
  // The one stack's planner, as every member's (`floatingStackOrder`).
  return {
    wrap: floatWrapChoiceOf(anchor),
    preset: floatPositionPresetOf(anchor),
    moveWithText: floatAnchorMovesWithText(anchor),
    canBringForward: pos !== null && !floatingStackZOrderAtBoundary(doc, [pos], "bringForward"),
    canSendBackward: pos !== null && !floatingStackZOrderAtBoundary(doc, [pos], "sendBackward"),
  };
}

/**
 * One floating drawing the Layout Options act on: a chart, or a picture (the
 * picture's anchor is the one `pictureFloat` places it by -- its own
 * `floatAnchor`, else the one a float chosen in the editor is written with).
 */
interface LiveDrawingTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly kind: "chart" | "picture";
}

/** The selected chart or picture the Layout Options act on. */
function liveDrawingTarget(editor: Editor): LiveDrawingTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const chart = liveDocumentChartTarget(editor);
  if (chart) return chart.valid ? { pos: chart.pos, node: chart.node, kind: "chart" } : null;
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const name = selection.node.type.name;
  if (name !== BLOCK_PICTURE_NODE_NAME && name !== INLINE_PICTURE_NODE_NAME) return null;
  return { pos: selection.from, node: selection.node, kind: "picture" };
}

function drawingAnchor(target: LiveDrawingTarget): FloatAnchor | null {
  return target.kind === "chart"
    ? documentChartAnchor(target.node.attrs)
    : pictureFloatAnchor(target.node.attrs, target.node.isInline ? "inline" : "block");
}

/** The element the float pass places for this drawing, if drawn. */
function drawingWrapper(editor: Editor, target: LiveDrawingTarget): HTMLElement | null {
  const dom = editor.view.nodeDOM(target.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const selector = target.kind === "chart" ? ".chart-block-wrapper" : ".note-editor-image-resizable";
  return dom.matches(selector) ? dom : dom.querySelector<HTMLElement>(selector);
}

function drawingSize(target: LiveDrawingTarget): { widthEmu: number; heightEmu: number } {
  if (target.kind === "chart") {
    return documentChartSize(target.node.attrs as Record<string, unknown>) ?? DEFAULT_DOCUMENT_CHART_SIZE;
  }
  const attrs = target.node.attrs as Record<string, unknown>;
  const emu = (emuValue: unknown, px: unknown) =>
    typeof emuValue === "number" && emuValue > 0
      ? Math.round(emuValue)
      : Number(px) > 0
        ? Math.round(Number(px) * EMU_PER_PX)
        : 914_400;
  return { widthEmu: emu(attrs.widthEmu, attrs.width), heightEmu: emu(attrs.heightEmu, attrs.height) };
}

/** The drawing's attrs with this anchor, the coarser spellings retired. */
function attrsWithAnchor(target: LiveDrawingTarget, anchor: FloatAnchor | null): Record<string, unknown> {
  const attrs: Record<string, unknown> = { ...target.node.attrs };
  if (target.kind === "chart") {
    let host;
    try {
      host = normalizeDocumentChartHost(attrs.documentChart);
    } catch {
      host = undefined;
    }
    if (host?.layout) {
      const { layout: _layout, ...rest } = host;
      attrs.documentChart = rest;
    }
    attrs.floatAnchor = anchor ?? undefined;
    return attrs;
  }
  // A picture: its whole anchor, as an imported one keeps it; the float
  // chosen in the editor (`dataFloat`) is that anchor's coarse spelling.
  attrs.floatAnchor = anchor;
  attrs.dataFloat = null;
  // A floating picture is placed by its anchor, never by its paragraph's
  // alignment; back in line it keeps the paragraph's.
  if (anchor) attrs.dataAlign = null;
  if (attrs.officeImage === true || attrs.officeDrawingKind != null) {
    attrs.officeDrawingKind = anchor ? "anchor" : "inline";
  }
  attrs.relativeHeight = anchor ? anchor.relativeHeight : null;
  return attrs;
}

function commitAnchor(editor: Editor, target: LiveDrawingTarget, anchor: FloatAnchor | null): boolean {
  if (anchor && target.node.isInline) {
    // Out of its line of text: the floating block drawing anchored to that
    // paragraph, as Word does.
    const converted = convertInlineDrawingToBlock(
      editor.view,
      target.pos,
      target.kind === "chart"
        ? { floatAnchor: anchor }
        : { floatAnchor: anchor, dataFloat: null, officeDrawingKind: "anchor", relativeHeight: anchor.relativeHeight },
    );
    if (converted) editor.view.focus();
    return converted;
  }
  if (target.kind === "chart") {
    const chart = liveDocumentChartTarget(editor);
    return chart ? commitLiveDocumentChartAttrs(editor, chart, attrsWithAnchor(target, anchor)) : false;
  }
  const current = editor.state.doc.nodeAt(target.pos);
  if (current !== target.node) return false;
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(target.pos, undefined, attrsWithAnchor(target, anchor), target.node.marks),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, target.pos)));
  editor.view.focus();
  return true;
}

/** The anchor Word gives a drawing it takes out of the line: where it stands. */
function anchorOutOfLine(editor: Editor, target: LiveDrawingTarget, wrap: FloatWrapChoice): FloatAnchor {
  const size = drawingSize(target);
  const wrapper = drawingWrapper(editor, target);
  const columnOffsetPx = wrapper ? inLineDrawingColumnOffsetPx(wrapper) : null;
  return floatAnchorOutOfLine({
    widthEmu: size.widthEmu,
    heightEmu: size.heightEmu,
    columnOffsetEmu: Math.max(0, columnOffsetPx ?? 0) * EMU_PER_PX,
    paragraphOffsetEmu: 0,
    relativeHeight: nextDocumentFloatingHeight(editor.state.doc),
    wrap,
  });
}

/** What the Arrange group shows for the selected chart or picture. */
export function liveDocumentDrawingPlacementState(editor: Editor): DocumentChartPlacementState | null {
  const target = liveDrawingTarget(editor);
  if (!target) return null;
  return placementStateOf(editor.state.doc, drawingAnchor(target), target.pos);
}

/** One Layout Options choice on the selected chart or picture. */
export function setLiveDocumentDrawingPlacement(
  editor: Editor,
  command: DocumentChartPlacementCommand,
): boolean {
  const target = liveDrawingTarget(editor);
  if (!target) return false;
  const anchor = drawingAnchor(target);
  if (command.kind === "inline") {
    // In Line with Text: no anchor at all (Word writes `wp:inline`).
    return anchor ? commitAnchor(editor, target, null) : false;
  }
  if (command.kind === "wrap") {
    const next = anchor ? floatAnchorWithWrap(anchor, command.wrap) : anchorOutOfLine(editor, target, command.wrap);
    return commitAnchor(editor, target, next);
  }
  if (command.kind === "position") {
    const base = anchor ?? anchorOutOfLine(editor, target, "square");
    return commitAnchor(editor, target, floatAnchorAtPosition(base, command.preset));
  }
  if (!anchor) return false;
  if (command.kind === "align") {
    return commitAnchor(editor, target, floatAnchorAligned(anchor, command.align));
  }
  if (command.kind === "moveWithText") {
    const wrapper = drawingWrapper(editor, target);
    const paint = wrapper ? floatPaintOf(wrapper) : null;
    if (!paint) return false;
    return commitAnchor(editor, target, floatAnchorWithMoveWithText(anchor, paint, command.value));
  }
  // Bring Forward / Send Backward / to Front / to Back: the one stack's
  // planner, as every member's (`floatingStackOrder`).
  if (target.node.isInline || editor.state.doc.nodeAt(target.pos) !== target.node) return false;
  const action = ({ forward: "bringForward", front: "bringToFront", backward: "sendBackward", back: "sendToBack" } as const)[command.step];
  return applyFloatingStackZOrder(editor, [target.pos], action);
}

/** One Layout Options choice on the selected chart. */
export const setLiveDocumentChartPlacement = setLiveDocumentDrawingPlacement;

/**
 * A floating chart or picture dragged by `(dxPx, dyPx)` page px: its anchor's
 * offsets on the same origins (an aligned axis becomes an offset, as Word
 * makes a dragged object's position absolute).
 */
export function moveLiveDocumentDrawingBy(
  editor: Editor,
  wrapper: HTMLElement,
  dxPx: number,
  dyPx: number,
): boolean {
  const target = liveDrawingTarget(editor);
  if (!target) return false;
  const anchor = drawingAnchor(target);
  const paint = floatPaintOf(wrapper);
  if (!anchor || !paint || anchor.locked) return false;
  const moved = floatAnchorMovedBy(anchor, paint, dxPx, dyPx);
  if (target.node.isInline || editor.state.doc.nodeAt(target.pos) !== target.node) {
    return commitAnchor(editor, target, moved);
  }
  // Dropped over another paragraph or page, the drawing is anchored there,
  // as Word's anchor follows a moved object (floatReanchor), one Undo step.
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(target.pos, undefined, attrsWithAnchor(target, moved), target.node.marks),
  );
  if (!transaction.docChanged) return false;
  const placed = reanchorMovedDocumentFloats(editor.view, transaction, [
    { pos: target.pos, dxClient: dxPx * (paint.scaleX || 1), dyClient: dyPx * (paint.scaleY || 1), sizeKept: true },
  ]);
  const at = placed.get(target.pos)?.[0] ?? target.pos;
  if (transaction.doc.nodeAt(at)) transaction.setSelection(NodeSelection.create(transaction.doc, at));
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export const moveLiveDocumentChartBy = moveLiveDocumentDrawingBy;

/** The selected chart's or picture's whole anchor and what the float pass
 * measured for it (the Layout dialog's reading). Null in line. */
export function liveDocumentDrawingLayout(editor: Editor): { anchor: FloatAnchor; paint: ReturnType<typeof floatPaintOf> } | null {
  const target = liveDrawingTarget(editor);
  if (!target) return null;
  const anchor = drawingAnchor(target);
  if (!anchor) return null;
  const wrapper = drawingWrapper(editor, target);
  return { anchor, paint: wrapper ? floatPaintOf(wrapper) : null };
}

/** The Layout dialog's Size tab: the selected chart's or picture's size,
 * and whether its proportions are locked. */
export function liveDocumentDrawingSize(
  editor: Editor,
): { widthEmu: number; heightEmu: number; lockAspectRatio: boolean } | null {
  const target = liveDrawingTarget(editor);
  if (!target) return null;
  return {
    ...drawingSize(target),
    lockAspectRatio: target.kind === "picture" && target.node.attrs.pictureLockAspectRatio !== false,
  };
}

/** The Size tab's OK: both sides in one step, whatever the lock (the dialog
 * kept the proportions itself when asked to). */
export function setLiveDocumentDrawingExtent(editor: Editor, widthEmu: number, heightEmu: number): boolean {
  const target = liveDrawingTarget(editor);
  if (!target || !(widthEmu > 0) || !(heightEmu > 0)) return false;
  const size = drawingSize(target);
  if (size.widthEmu === Math.round(widthEmu) && size.heightEmu === Math.round(heightEmu)) return false;
  if (target.kind === "chart") {
    const chart = liveDocumentChartTarget(editor);
    if (!chart) return false;
    let host;
    try {
      const current = normalizeDocumentChartHost(chart.node.attrs.documentChart);
      host = normalizeDocumentChartHost({
        version: 1,
        size: { widthEmu: Math.round(widthEmu), heightEmu: Math.round(heightEmu) },
        ...(current?.layout ? { layout: current.layout } : {}),
        ...(current?.workbook ? { workbook: current.workbook } : {}),
      });
    } catch {
      return false;
    }
    return commitLiveDocumentChartAttrs(editor, chart, { ...chart.node.attrs, documentChart: host });
  }
  const width = Math.max(1, Math.round(widthEmu / EMU_PER_PX));
  const height = Math.max(1, Math.round(heightEmu / EMU_PER_PX));
  const stored = normalizeFloatAnchor(target.node.attrs.floatAnchor);
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      {
        ...target.node.attrs,
        width,
        height,
        widthEmu: Math.round(widthEmu),
        heightEmu: Math.round(heightEmu),
        widthPercent: null,
        ...(stored ? { floatAnchor: { ...stored, widthEmu: Math.round(widthEmu), heightEmu: Math.round(heightEmu) } } : {}),
      },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, target.pos)));
  editor.view.focus();
  return true;
}

/** The Layout dialog's OK on the selected chart or picture. */
export function setLiveDocumentDrawingAnchor(editor: Editor, anchor: FloatAnchor): boolean {
  const target = liveDrawingTarget(editor);
  return target ? commitAnchor(editor, target, anchor) : false;
}
