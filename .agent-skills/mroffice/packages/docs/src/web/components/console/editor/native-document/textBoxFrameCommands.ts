/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Shape Format on a selected Word text box (the `textBox` frame node): the
 * frame's fill and line, its words' direction and vertical alignment, Wrap
 * Text, the floating stack, and its size. Each is one transaction on the
 * frame node that keeps the box selected (one undo step, one collaborative
 * change); the words inside are untouched.
 */

import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { normalizeDocumentTextBoxOutline } from "@mrnote/core/web/lib/document-borders.ts";
import { nextDocumentFloatingHeight } from "@mrnote/core/web/lib/document-shapes.ts";
import {
  DOCUMENT_TEXT_BOX_DEFAULT_OUTLINE,
  DOCUMENT_TEXT_BOX_MAX_EDGE_EMU,
  DOCUMENT_TEXT_BOX_MIN_EDGE_EMU,
  documentTextBoxVertFor,
  documentTextBoxWrapPatch,
  documentTextBoxFrameIsEditable,
  type DocumentTextBoxWrap,
} from "@mrnote/core/web/lib/document-text-box-frame.ts";
import { EMU_PER_PX, normalizeFloatAnchor, normalizeFloatFrameBody } from "@mrnote/core/web/lib/office-float-anchor.ts";
import {
  floatAnchorAligned,
  floatAnchorAtPosition,
  floatAnchorMovesWithText,
  floatAnchorWithMoveWithText,
  floatPositionPresetOf,
  type FloatPositionPreset,
} from "@mrnote/core/web/lib/office-float-anchor-edit.ts";
import { TEXT_BOX_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import { floatPaintOf } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import { applyFloatingStackZOrder, floatingStackZOrderAtBoundary } from "@mrnote/core/web/components/console/editor/native-document/floatingStackOrder.ts";

export interface LiveTextBoxFrameTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** The selected text box frame (its border selected), or null. */
export function liveTextBoxFrameTarget(editor: Editor): LiveTextBoxFrameTarget | null {
  if (editor.isDestroyed) return null;
  const { selection, doc } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (node.type.name !== TEXT_BOX_NODE_NAME || doc.nodeAt(selection.from) !== node) return null;
  // Only a frame whose box the save writes back takes Shape Format.
  if (!documentTextBoxFrameIsEditable(node.attrs)) return null;
  return { pos: selection.from, node };
}

/** Commit `patch` (computed from the live attributes) on the selected frame. */
function patchFrame(
  editor: Editor,
  patch: (attrs: Record<string, unknown>, node: ProseMirrorNode) => Record<string, unknown> | null,
): boolean {
  if (!editor.isEditable) return false;
  const target = liveTextBoxFrameTarget(editor);
  if (!target) return false;
  const next = patch(target.node.attrs, target.node);
  if (!next) return false;
  const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, ...next });
  tr.setSelection(NodeSelection.create(tr.doc, target.pos));
  editor.view.dispatch(closeHistory(tr));
  return true;
}

/** Shape Fill: a colour, or No Fill (`null` / "none"). */
export function setLiveTextBoxFill(editor: Editor, color: string | null): boolean {
  return patchFrame(editor, () => ({
    textBoxFill: !color || color === "none" ? { color: "none" } : { color },
  }));
}

const OUTLINE_STYLE: Record<"solid" | "dashed" | "dotted", string> = {
  solid: "single",
  dashed: "dashed",
  dotted: "dotted",
};

export function textBoxOutlineStyleOf(value: unknown): "solid" | "dashed" | "dotted" {
  const line = normalizeDocumentTextBoxOutline(value);
  return line?.style === "dashed" ? "dashed" : line?.style === "dotted" ? "dotted" : "solid";
}

/** Shape Outline: colour (null is No Outline), weight or dash. */
export function setLiveTextBoxOutline(
  editor: Editor,
  change: { readonly color?: string | null; readonly weightPt?: number; readonly style?: "solid" | "dashed" | "dotted" },
): boolean {
  return patchFrame(editor, (attrs) => {
    if (change.color === null || change.color === "none") return { textBoxOutline: { style: "none" } };
    const current = normalizeDocumentTextBoxOutline(attrs.textBoxOutline);
    const visible = current && current.style !== "none" && current.style !== "nil" ? current : DOCUMENT_TEXT_BOX_DEFAULT_OUTLINE;
    return {
      textBoxOutline: {
        style: change.style ? OUTLINE_STYLE[change.style] : visible.style,
        sizePt: change.weightPt ?? visible.sizePt ?? 0.5,
        color: change.color ?? visible.color ?? "#000000",
      },
    };
  });
}

/** Text Direction and Align Text: `wps:bodyPr/@vert` and `@anchor`. */
export function setLiveTextBoxBody(
  editor: Editor,
  change: {
    readonly direction?: "horizontal" | "rotate90" | "rotate270" | "stacked";
    readonly align?: "top" | "middle" | "bottom";
  },
): boolean {
  return patchFrame(editor, (attrs) => {
    const body = normalizeFloatFrameBody(attrs.frameBody);
    return {
      frameBody: {
        ...body,
        ...(change.direction ? { vert: documentTextBoxVertFor(change.direction) } : {}),
        ...(change.align ? { anchor: change.align === "middle" ? "ctr" : change.align === "bottom" ? "b" : "t" } : {}),
      },
    };
  });
}

/** Wrap Text. */
export function setLiveTextBoxWrap(editor: Editor, wrap: DocumentTextBoxWrap): boolean {
  return patchFrame(editor, (attrs) =>
    documentTextBoxWrapPatch(attrs, wrap, nextDocumentFloatingHeight(editor.state.doc)),
  );
}

/** Bring Forward / Send Backward, and the two text-layer moves. */
export function setLiveTextBoxZOrder(
  editor: Editor,
  action: "bringForward" | "bringToFront" | "sendBackward" | "sendToBack" | "inFrontOfText" | "behindText",
): boolean {
  if (action !== "inFrontOfText" && action !== "behindText") {
    // The four stack moves: the one stack's planner, as a shape's.
    const target = editor.isEditable ? liveTextBoxFrameTarget(editor) : null;
    return target ? applyFloatingStackZOrder(editor, [target.pos], action) : false;
  }
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    if (!anchor) return null;
    const behind = action === "behindText";
    if (anchor.wrap.kind === "none" && anchor.behindDoc === behind) return null;
    return { floatAnchor: { ...anchor, wrap: { kind: "none" }, behindDoc: behind, distTEmu: 0, distBEmu: 0 } };
  });
}

/** Whether a stack move has anywhere to go. */
export function textBoxZOrderAtBoundary(
  editor: Editor,
  action: "bringForward" | "bringToFront" | "sendBackward" | "sendToBack",
): boolean {
  const target = liveTextBoxFrameTarget(editor);
  if (!target || !normalizeFloatAnchor(target.node.attrs.floatAnchor)) return true;
  return floatingStackZOrderAtBoundary(editor.state.doc, [target.pos], action);
}

/** The frame's size in EMU, anchored or in line. */
export function textBoxFrameSizeEmu(node: ProseMirrorNode): { widthEmu: number; heightEmu: number } | null {
  const anchor = normalizeFloatAnchor(node.attrs.floatAnchor);
  if (anchor) return { widthEmu: anchor.widthEmu, heightEmu: anchor.heightEmu };
  const extent = node.attrs.frameExtent as { widthEmu?: unknown; heightEmu?: unknown } | null;
  return typeof extent?.widthEmu === "number" && typeof extent.heightEmu === "number"
    ? { widthEmu: extent.widthEmu, heightEmu: extent.heightEmu }
    : null;
}

/** Size > Height / Width, in CSS px (the Size boxes' own conversion). */
export function setLiveTextBoxSize(editor: Editor, axis: "width" | "height", rawPx: string): boolean {
  const px = Number(rawPx.trim());
  if (rawPx.trim() === "" || !Number.isFinite(px)) return false;
  const emu = Math.min(DOCUMENT_TEXT_BOX_MAX_EDGE_EMU, Math.max(DOCUMENT_TEXT_BOX_MIN_EDGE_EMU, Math.round(px * EMU_PER_PX)));
  const key = axis === "width" ? "widthEmu" : "heightEmu";
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    if (anchor) return anchor[key] === emu ? null : { floatAnchor: { ...anchor, [key]: emu } };
    const extent = attrs.frameExtent as Record<string, unknown> | null;
    if (!extent) return null;
    return { frameExtent: { ...extent, [key]: emu } };
  });
}

/**
 * Insert > Equation with the box itself selected (not its words): the
 * equation goes into the box as its own new last line -- the rule the
 * slide's text boxes follow (`textBlockWithEquationAppended`) -- instead of
 * replacing the box. The caret is put in an empty last paragraph of the box
 * (an existing one, else a new one) so the ordinary equation insertion then
 * places a display equation there. False when no box is selected.
 */
export function enterSelectedTextBoxForEquation(editor: Editor): boolean {
  const target = liveTextBoxFrameTarget(editor);
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!target || !paragraph || !editor.isEditable) return false;
  const last = target.node.lastChild;
  const end = target.pos + target.node.nodeSize - 1;
  let tr = editor.state.tr;
  let caret: number;
  if (last && last.type === paragraph && last.content.size === 0) {
    caret = end - 1;
  } else {
    tr = tr.insert(end, paragraph.create());
    caret = end + 1;
  }
  tr.setSelection(TextSelection.create(tr.doc, caret));
  editor.view.dispatch(tr);
  return true;
}

/** Word's Position gallery on the selected text box: margin-aligned, Square. */
export function setLiveTextBoxPositionPreset(editor: Editor, preset: FloatPositionPreset): boolean {
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    return anchor ? { floatAnchor: floatAnchorAtPosition(anchor, preset) } : null;
  });
}

/** Align (to the margins) on the selected text box's one axis. */
export function setLiveTextBoxAlign(
  editor: Editor,
  align: "left" | "center" | "right" | "top" | "middle" | "bottom",
): boolean {
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    return anchor ? { floatAnchor: floatAnchorAligned(anchor, align) } : null;
  });
}

/** Move with Text / Fix Position on Page: the vertical origin only, the box
 * kept where it is on the page (as the float pass last measured it). */
export function setLiveTextBoxMoveWithText(editor: Editor, moveWithText: boolean): boolean {
  const target = liveTextBoxFrameTarget(editor);
  if (!target) return false;
  const dom = editor.view.nodeDOM(target.pos);
  const wrapper =
    dom instanceof HTMLElement
      ? dom.matches("div[data-text-box]")
        ? dom
        : dom.querySelector<HTMLElement>("div[data-text-box]")
      : null;
  const paint = wrapper ? floatPaintOf(wrapper) : null;
  if (!paint) return false;
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    if (!anchor) return null;
    const next = floatAnchorWithMoveWithText(anchor, paint, moveWithText);
    return next === anchor ? null : { floatAnchor: next };
  });
}

/** The selected text box's Position preset and Move with Text state. */
export function liveTextBoxPlacement(editor: Editor): {
  readonly preset: FloatPositionPreset | null;
  readonly moveWithText: boolean | null;
} {
  const target = liveTextBoxFrameTarget(editor);
  const anchor = target ? normalizeFloatAnchor(target.node.attrs.floatAnchor) : null;
  return anchor
    ? { preset: floatPositionPresetOf(anchor), moveWithText: floatAnchorMovesWithText(anchor) }
    : { preset: null, moveWithText: null };
}

/** The selected text box's anchor and what the float pass measured for it. */
/** The Layout dialog's Size tab on the selected text box. */
export function liveTextBoxSize(editor: Editor): { widthEmu: number; heightEmu: number; lockAspectRatio: boolean } | null {
  const target = liveTextBoxFrameTarget(editor);
  const anchor = target ? normalizeFloatAnchor(target.node.attrs.floatAnchor) : null;
  return anchor ? { widthEmu: anchor.widthEmu, heightEmu: anchor.heightEmu, lockAspectRatio: false } : null;
}

/** The Size tab's OK on the selected text box: both sides in one step. */
export function setLiveTextBoxExtent(editor: Editor, widthEmu: number, heightEmu: number): boolean {
  const clamp = (emu: number) =>
    Math.min(DOCUMENT_TEXT_BOX_MAX_EDGE_EMU, Math.max(DOCUMENT_TEXT_BOX_MIN_EDGE_EMU, Math.round(emu)));
  return patchFrame(editor, (attrs) => {
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    if (!anchor) return null;
    const next = { widthEmu: clamp(widthEmu), heightEmu: clamp(heightEmu) };
    return anchor.widthEmu === next.widthEmu && anchor.heightEmu === next.heightEmu
      ? null
      : { floatAnchor: { ...anchor, ...next } };
  });
}

export function liveTextBoxLayout(editor: Editor): { anchor: import("@mrnote/core/web/lib/office-float-anchor.ts").FloatAnchor; paint: ReturnType<typeof floatPaintOf> } | null {
  const target = liveTextBoxFrameTarget(editor);
  const anchor = target ? normalizeFloatAnchor(target.node.attrs.floatAnchor) : null;
  if (!target || !anchor) return null;
  const dom = editor.view.nodeDOM(target.pos);
  const wrapper =
    dom instanceof HTMLElement
      ? dom.matches("div[data-text-box]")
        ? dom
        : dom.querySelector<HTMLElement>("div[data-text-box]")
      : null;
  return { anchor, paint: wrapper ? floatPaintOf(wrapper) : null };
}

/** The Layout dialog's OK on the selected text box. */
export function setLiveTextBoxAnchor(editor: Editor, anchor: import("@mrnote/core/web/lib/office-float-anchor.ts").FloatAnchor): boolean {
  return patchFrame(editor, (attrs) => (normalizeFloatAnchor(attrs.floatAnchor) ? { floatAnchor: anchor } : null));
}
