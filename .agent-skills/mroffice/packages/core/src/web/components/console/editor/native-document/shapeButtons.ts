/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Shape Format and Layout ▸ Arrange logic for shapes and text boxes, shared
 * by the document toolbar and the editor-command catalog: the selected
 * shape, its preset, fill and outline, style, text format, wrap, alignment,
 * position, rotation, flip, size and stacking order.
 */

import { type OfficeShapeStyleRecipe } from "../../../../lib/office-shape-style-catalog";
import { documentShapeStylePatch } from "../../../../lib/document-shape-style-adapter";
import { pickOfficePictureFill, type OfficePictureFillSource } from "../../../../lib/office-picture-fill";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { documentSmartArtPreparedMemberId, documentSmartArtPreparedNode } from "./documentSmartArtPrepared";
import { documentSmartArtHostColorTheme } from "./documentSmartArtOpenConversion";
import type { SmartArtColorTheme } from "../../../../lib/office-smartart/colors";
import { NodeSelection } from "@tiptap/pm/state";
import { documentShapeAspectRatioLockPatch, documentShapeAlignPatch, documentShapeExactRotationPatch, documentShapeFlipPatch, documentShapeFormatPatch, documentShapeGroupIsEditable, documentShapeIsPreservedNativeSmartArt, documentShapeSmartArtIdentity, normalizeDocumentShapeAltText, documentShapeLinkedTextBoxPatches, documentShapePositionPatch, documentShapePaintPatch, documentShapeGroupMemberPatch, documentShapePresetPatch, documentShapeRotationPatch, documentShapeSizeEmuPatch, documentShapeSizePatch, documentShapeStackReorderPatches, documentShapeReroutedConnectorMembers, documentPictureStackHeight, documentShapeRelativeHeight, documentStackPatchAttrs, nextDocumentFloatingHeight, normalizeDocumentShapeAttrs, resolveDocumentShapeStack, type DocumentShapeAttrs, type DocumentShapeAttrsInput, type DocumentShapeGroupMember, type DocumentShapePictureFill, type DocumentShapeAlignAction, type DocumentShapeFlipAxis, type DocumentShapePositionAction, type DocumentShapePaintRequest, type DocumentShapeFormatRequest, type DocumentShapePreset, type DocumentShapeRotationAction, type DocumentShapeSizeAxis, type DocumentShapeZOrderAction } from "../../../../lib/document-shapes";
import { DOCUMENT_SHAPE_EDIT_POINTS_EVENT, documentShapeEditPointsAvailable, documentShapeMultiSelection, documentShapePickedGroupMember, type DocumentShapeEditPointsDetail } from "./documentShapeExtension";
import { documentGroupMembersReorderable, documentGroupMembersStepped, type DocumentGroupStep } from "../../../../lib/document-shape-group-tree";
import { applyFloatingStackZOrder, floatingStackZOrderAtBoundary } from "./floatingStackOrder";
import { convertInlineDrawingToBlock } from "../extensions/objectPlacement";
import { normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import {
  documentShapeAnchorForWrapMode as floatAnchorForWrapMode,
  documentShapeOutOfLineAnchor as floatAnchorOutOfLine,
} from "../../../../lib/document-shape-anchor";
import {
  floatAnchorAtPosition,
  floatAnchorMovesWithText,
  floatAnchorWithMoveWithText,
  floatPaintFor,
  floatPositionPresetOf,
  floatWrapChoiceOf,
  type FloatPositionPreset,
} from "../../../../lib/office-float-anchor-edit";
import { floatPaintOf } from "./floatingTextBoxLayout";
import {
  smartArtSlotPictureFormatOf,
  type SmartArtSlotPictureFormat,
} from "../../../../lib/office-smartart/slot-picture-format";
import { INLINE_SHAPE_NODE_NAME, isShapeNode } from "./documentObjectNodes";
import {
  documentSmartArtMemberTransformPatch,
  readDocumentSmartArtDiagram,
  sameDocumentSmartArtDiagram,
  type DocumentSmartArtDiagram,
  type DocumentSmartArtPatch,
} from "../../../../lib/office-smartart/document-design-model";

export interface LiveDocumentShapeTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly attrs: DocumentShapeAttrs;
}

/** Resolve the exact native-shape NodeSelection owned by object commands. */
export function liveDocumentShapeTarget(editor: Editor): LiveDocumentShapeTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  if (!isShapeNode(selection.node) || doc.nodeAt(selection.from) !== selection.node) {
    return null;
  }
  // A file's diagram not converted yet: the command works on its conversion, and
  // writes it with the change, in one transaction (`documentSmartArtPrepared`).
  const node = documentSmartArtPreparedNode(selection.node) ?? selection.node;
  const attrs = normalizeDocumentShapeAttrs(node.attrs);
  if (attrs.groupMembers && !documentShapeGroupIsEditable(attrs)) return null;
  return {
    pos: selection.from,
    node,
    attrs,
  };
}

/** Commit one authenticated native-shape patch and retain the atom selection. */
export function commitLiveDocumentShapePatch(
  editor: Editor,
  target: LiveDocumentShapeTarget,
  patch: Readonly<Partial<DocumentShapeAttrs>>,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;

  // Re-authenticate the live NodeSelection immediately before dispatch. A
  // menu action must never land on a different atom after a concurrent edit.
  const current = liveDocumentShapeTarget(editor);
  if (
    !current ||
    current.pos !== target.pos ||
    current.node !== target.node
  ) {
    return false;
  }

  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      { ...target.node.attrs, ...patch },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, target.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/**
 * Shape Format > Edit Shape > Edit Points on the selected Docs shape: its node
 * view enters the shared vertex editor (`lib/office-drawing-overlays`).
 */
export function startLiveDocumentShapeEditPoints(editor: Editor): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || !editor.isEditable || !documentShapeEditPointsAvailable(target.attrs)) return false;
  window.dispatchEvent(
    new CustomEvent<DocumentShapeEditPointsDetail>(DOCUMENT_SHAPE_EDIT_POINTS_EVENT, {
      detail: { position: target.pos },
    }),
  );
  return true;
}

/**
 * The SmartArt picture slot selected inside the selected graphic, when it
 * holds a picture: Word's Picture Format reaches it (Crop > Fill / Fit,
 * Picture Styles, Reset Picture).
 */
export function liveDocumentSmartArtSlotPicture(editor: Editor): {
  readonly target: LiveDocumentShapeTarget;
  readonly memberId: string;
  readonly src: string;
  readonly widthEmu: number;
  readonly heightEmu: number;
  readonly format: SmartArtSlotPictureFormat;
} | null {
  const target = liveDocumentShapeTarget(editor);
  if (!target?.attrs.smartArtKind) return null;
  const memberId = liveDocumentShapeMemberId(editor, target);
  const member = memberId
    ? target.attrs.groupMembers?.find((candidate) => candidate.memberId === memberId)
    : null;
  if (!member || member.smartArtPicturePlaceholder !== true || typeof member.src !== "string") {
    return null;
  }
  return {
    target,
    memberId: member.memberId,
    src: member.src,
    widthEmu: member.widthEmu,
    heightEmu: member.heightEmu,
    format: smartArtSlotPictureFormatOf(member),
  };
}

/** Write one slot picture's Picture Format (one Undo step); `{}` is Reset Picture. */
export function setLiveDocumentSmartArtSlotPictureFormat(
  editor: Editor,
  memberId: string,
  format: SmartArtSlotPictureFormat,
): boolean {
  const slot = liveDocumentSmartArtSlotPicture(editor);
  if (!slot || slot.memberId !== memberId || !editor.isEditable) return false;
  const patch = documentShapeGroupMemberPatch(slot.target.node.attrs, memberId, () =>
    ({
      smartArtPictureCrop: format.crop ?? null,
      smartArtPictureStyle: format.style ?? null,
    }) as unknown as Partial<DocumentShapeAttrs>,
  );
  return patch ? commitLiveDocumentShapePatch(editor, slot.target, patch) : false;
}

export function setLiveDocumentShapePreset(
  editor: Editor,
  preset: DocumentShapePreset,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  // SmartArt Format > Change Shape on ONE shape of a graphic: that item's
  // shape takes the preset and keeps its words and formatting, and the page
  // says the shape is the author's (`smartArtAuthorShape`), so a relayout
  // draws it again, the DOCX writer puts it on the item's presentation point
  // and Reset Shape / Reset Graphic restore the layout's (Microsoft Support,
  // "Restore the default layout and color of your SmartArt graphic").
  const memberId = target.attrs.smartArtKind ? liveDocumentShapeMemberId(editor, target) : null;
  if (memberId) {
    const member = target.attrs.groupMembers?.find((candidate) => candidate.memberId === memberId);
    if (
      member?.smartArtRole !== "node" ||
      member.kind === "picture" ||
      member.smartArtPicturePlaceholder === true
    ) {
      return false;
    }
    const memberPatch = documentShapeGroupMemberPatch(target.node.attrs, memberId, (leaf) =>
      documentShapePresetPatch(leaf, preset)
        ? ({
            preset,
            customPath: null,
            adjustments: null,
            smartArtAuthorShape: preset,
          } as unknown as Partial<DocumentShapeAttrs>)
        : null,
    );
    return memberPatch ? commitLiveDocumentShapePatch(editor, target, memberPatch) : false;
  }
  const patch = documentShapePresetPatch(target.node.attrs, preset);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

/**
 * The shape selected INSIDE the selected group, when there is one: the node
 * view keeps it (`data-member-selected` on its root), the same way a slide's
 * selection carries the member. Paint and format then go to that member, as
 * they do on a slide or a worksheet, instead of being refused for the group.
 */
export function liveDocumentShapeMemberId(
  editor: Editor,
  target: LiveDocumentShapeTarget,
): string | null {
  if (!target.attrs.groupMembers?.length) return null;
  const dom = editor.view.nodeDOM(target.pos);
  const memberId =
    dom instanceof HTMLElement ? dom.dataset.memberSelected ?? null : null;
  if (!memberId) return null;
  if (target.attrs.groupMembers.some((member) => member.memberId === memberId)) return memberId;
  // A shape of the file's drawing: its own member in the conversion.
  const file = editor.state.doc.nodeAt(target.pos);
  return file && documentSmartArtPreparedNode(file) === target.node
    ? documentSmartArtPreparedMemberId(file, target.node, memberId)
    : null;
}

/** The member fields whose change makes a SmartArt shape's paint the author's. */
const SMARTART_AUTHOR_PAINT_KEYS: ReadonlySet<string> = new Set([
  "fill",
  "fillGradient",
  "fillPattern",
  "fillPicture",
  "fillTransparency",
  "outline",
  "outlineWidthPt",
  "outlineStyle",
  "outlineDash",
  "outlineGradient",
  "outlineTransparency",
]);

/**
 * Write one Shape Format change to the live shape: to the shape selected
 * inside a group or SmartArt graphic when there is one (through the member
 * patch), otherwise to the selected shape itself.
 */
export function commitLiveDocumentShapeLeafPatch(
  editor: Editor,
  patchLeaf: (
    leaf: DocumentShapeAttrsInput,
  ) => Readonly<Partial<DocumentShapeAttrs>> | null,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const memberId = liveDocumentShapeMemberId(editor, target);
  // One SmartArt shape's fill, line or effects formatted on its own are the
  // AUTHOR's (`smartArtAuthorPaint`), as the slide's and the worksheet's
  // writers state it: a relayout (Add Shape, Change Colors' re-spread) keeps
  // them, the export writes them on the item's point, Reset Graphic clears
  // them. Only a node owns paint of its own.
  const smartArtNode =
    memberId && target.attrs.smartArtKind
      ? target.attrs.groupMembers?.find((member) => member.memberId === memberId)?.smartArtRole === "node"
      : false;
  const patch = memberId
    ? documentShapeGroupMemberPatch(target.node.attrs, memberId, (leaf) => {
        const own = patchLeaf(leaf);
        return own && smartArtNode && Object.keys(own).some((key) => SMARTART_AUTHOR_PAINT_KEYS.has(key))
          ? ({ ...own, smartArtAuthorPaint: true } as Readonly<Partial<DocumentShapeAttrs>>)
          : own;
      })
    : patchLeaf(target.node.attrs);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

export function setLiveDocumentShapePaint(
  editor: Editor,
  request: DocumentShapePaintRequest,
): boolean {
  return commitLiveDocumentShapeLeafPatch(editor, (leaf) =>
    documentShapePaintPatch(leaf, request),
  );
}

/**
 * A Shape Styles pick lands where Shape Fill does: on the shape selected
 * inside the graphic, as PowerPoint and Excel apply it (Microsoft Support,
 * "Change the color of a shape, shape border, or entire SmartArt graphic").
 */
export function setLiveDocumentShapeStyle(
  editor: Editor,
  recipe: OfficeShapeStyleRecipe,
): boolean {
  return commitLiveDocumentShapeLeafPatch(editor, () =>
    documentShapeStylePatch(recipe),
  );
}








export function liveShapeTextTarget(editor: Editor): LiveDocumentShapeTarget | null {
  const target = liveDocumentShapeTarget(editor);
  if (!target || target.attrs.inkTool) return null;
  return target;
}

/**
 * The selected object Home's Font and Paragraph groups act on, in the
 * contract the three editors share (`lib/office-home-object-target`): a
 * shape, text box, group or SmartArt graphic (its words, every member's
 * when the graphic is selected, one member's when a member is), or a chart
 * (its chart-level text, `c:chartSpace/c:txPr`). Its state shows "mixed"
 * where the members disagree; `apply` commits one command as one Undo step.
 */

/**
 * Shape Fill > Picture... and Format Shape > Fill > Picture or texture fill:
 * the picked picture fills the selected shape, stretched over it, as one
 * Format Shape write. The shape must still be the selected one once the
 * picture is read; `onUnreadable` says when the file could not be used.
 */
export function pickLiveDocumentShapeFillPicture(
  editor: Editor,
  onUnreadable: () => void,
  source: OfficePictureFillSource = "file",
): void {
  const target = liveDocumentShapeTarget(editor);
  if (!target || target.attrs.groupMembers?.length || target.attrs.inkTool) return;
  pickOfficePictureFill((src, tile) => {
    if (!src) {
      onUnreadable();
      return;
    }
    const live = liveDocumentShapeTarget(editor);
    if (!live || live.pos !== target.pos || live.node !== target.node) return;
    // A new picture keeps the fill's options (tile, offsets, Transparency),
    // as Office's Picture source does; a texture is tiled as Office tiles it.
    const current = live.attrs.fillPicture;
    if (tile) {
      const picture: DocumentShapePictureFill = {
        src,
        tile,
        ...(current?.transparency !== undefined ? { transparency: current.transparency } : {}),
        ...(current?.rotWithShape !== undefined ? { rotWithShape: current.rotWithShape } : {}),
      };
      setLiveDocumentShapeFormat(editor, { fillPicture: picture });
      return;
    }
    setLiveDocumentShapeFormat(editor, {
      fillPicture: current ? { ...current, src } : { src, stretch: true },
    });
  }, source);
}

export function setLiveDocumentShapeFormat(
  editor: Editor,
  request: DocumentShapeFormatRequest,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  // A group's Alt Text is the GROUP's, whichever shape inside it is selected:
  // Word keeps a SmartArt graphic's on the drawing, set from its border and
  // never from one of its shapes (Microsoft Support, "Add alternative text to
  // a shape, picture, chart, SmartArt graphic, or other object"), and that is
  // the one the DOCX writer puts on `wp:docPr`. A preserved Office diagram's
  // drawing is the package's, so its Alt Text is not written from here.
  if (
    target.attrs.groupMembers?.length &&
    Object.keys(request).length > 0 &&
    Object.keys(request).every((key) => key === "altText" || key === "decorative")
  ) {
    if (documentShapeIsPreservedNativeSmartArt(target.attrs)) return false;
    // "Mark as decorative" on the whole group: no description rides with it.
    const decorative = Object.hasOwn(request, "decorative")
      ? request.decorative === true
      : target.attrs.decorative === true;
    const altText = decorative
      ? ""
      : normalizeDocumentShapeAltText(request.altText ?? target.attrs.altText);
    return altText === target.attrs.altText &&
      decorative === (target.attrs.decorative === true)
      ? false
      : commitLiveDocumentShapePatch(editor, target, {
          altText,
          decorative: decorative || undefined,
        });
  }
  const memberId = liveDocumentShapeMemberId(editor, target);
  const requestKeys = Object.keys(request);
  if (
    !memberId &&
    target.attrs.groupMembers?.length &&
    requestKeys.length > 0 &&
    requestKeys.every((key) => GROUP_TEXT_PAINT_KEYS.has(key))
  ) {
    // Word: a WordArt style, text fill, outline or effect chosen with the
    // whole SmartArt graphic (or group) selected goes on the words of every
    // shape in it. A member that carries no text (a connector) takes none.
    let attrs: DocumentShapeAttrsInput = target.node.attrs;
    let changed = false;
    for (const member of target.attrs.groupMembers) {
      const patch = documentShapeGroupMemberPatch(attrs, member.memberId, (leaf) =>
        documentShapeFormatPatch(leaf, request),
      );
      if (!patch) continue;
      attrs = { ...attrs, ...patch };
      changed = true;
    }
    const groupMembers = (attrs as { groupMembers?: DocumentShapeAttrs["groupMembers"] }).groupMembers;
    // Every member already wears it: nothing to commit, as a single shape.
    if (!changed || JSON.stringify(groupMembers) === JSON.stringify(target.node.attrs.groupMembers)) {
      return false;
    }
    return commitLiveDocumentShapePatch(editor, target, { groupMembers });
  }
  const patch = memberId
    ? documentShapeGroupMemberPatch(target.node.attrs, memberId, (leaf) =>
        documentShapeFormatPatch(leaf, request),
      )
    : documentShapeFormatPatch(target.node.attrs, request);
  if (!patch) return false;
  // A floating shape is laid out by its anchor's wrap element (Word's
  // wp:wrapSquare / wrapTopAndBottom / wrapNone + behindDoc), not by
  // `wrapMode`: Top and Bottom left the text beside the box because only
  // `wrapMode` changed (live Word audit WUA 022).
  const nextWrap = (patch as { wrapMode?: DocumentShapeAttrs["wrapMode"] }).wrapMode;
  const anchor = target.node.attrs.floatAnchor;
  // The commit takes any shape attrs: the node's float anchor (an attr
  // outside DocumentShapeAttrs) or a stacking height is added here.
  let anchored: Readonly<Partial<DocumentShapeAttrs> & { floatAnchor?: Record<string, unknown> }> = patch;
  if (!memberId && nextWrap && nextWrap !== "inline") {
    if (anchor && typeof anchor === "object") {
      anchored = { ...patch, floatAnchor: floatAnchorForWrapMode(anchor as Record<string, unknown>, nextWrap) };
    } else if (target.node.attrs.wrapMode === "inline") {
      // Taken out of the line: the shape floats at once, where Word puts it
      // (Word 16.86, In Line with Text -> a wrap): from the column and the
      // paragraph where it stood, Square's distances, above every other
      // floating drawing. The save writes the same `wp:anchor`.
      const relativeHeight =
        documentShapeRelativeHeight(target.node.attrs.relativeHeight) ??
        nextDocumentFloatingHeight(editor.state.doc);
      anchored = {
        ...patch,
        relativeHeight,
        floatAnchor: floatAnchorOutOfLine(target.node.attrs, nextWrap, relativeHeight),
      };
    }
  }
  return commitLiveDocumentShapePatch(editor, target, anchored);
}

/** The text's paint keys a whole group passes on to its members' words. */
const GROUP_TEXT_PAINT_KEYS = new Set([
  "textPaint",
  "textFill",
  "textOutline",
  "textOutlineWidthPt",
  "textEffect",
]);

/**
 * Wrap Text on the selected shape. "In Line with Text" drops the position and
 * the floating stack order (Word writes `wp:inline` with neither). Any other
 * wrap on a shape that shares its line with text (`inlineDocumentShape`)
 * makes it the floating block shape anchored to that paragraph, as Word does.
 */
export function setLiveDocumentShapeWrap(
  editor: Editor,
  wrapMode: DocumentShapeAttrs["wrapMode"],
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  if (target.node.type.name === INLINE_SHAPE_NODE_NAME) {
    if (wrapMode === "inline") return false;
    // Out of its line of text: a floating shape anchored to that paragraph,
    // laid out by Word's anchor at once (as a block shape taken out of the
    // line, below).
    const relativeHeight = nextDocumentFloatingHeight(editor.state.doc);
    return convertInlineDrawingToBlock(editor.view, target.pos, {
      wrapMode,
      relativeHeight,
      floatAnchor: floatAnchorOutOfLine(target.node.attrs, wrapMode, relativeHeight),
    });
  }
  if (wrapMode === "inline") {
    // Back In Line with Text: the shape has no anchor any more (Word writes
    // a `wp:inline` with no position). A float anchor left on the node would
    // be taken up again, stale, by the next wrap out of the line.
    const inline: Readonly<Partial<DocumentShapeAttrs> & { floatAnchor?: null }> = {
      wrapMode: "inline",
      xEmu: 0,
      yEmu: 0,
      relativeHeight: undefined,
      floatAnchor: null,
    };
    return commitLiveDocumentShapePatch(editor, target, inline);
  }
  return setLiveDocumentShapeFormat(editor, { wrapMode });
}

export function setLiveDocumentShapeAlign(
  editor: Editor,
  action: DocumentShapeAlignAction,
  printableWidthPx: number,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const patch = documentShapeAlignPatch(
    target.node.attrs,
    action,
    printableWidthPx,
  );
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

export function linkLiveDocumentTextBoxes(
  editor: Editor,
  targetPos: number,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const source = liveDocumentShapeTarget(editor);
  const targetNode = editor.state.doc.nodeAt(targetPos);
  if (!source || targetNode?.type.name !== "documentShape") return false;
  let maximumStoryId = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "documentShape") return true;
    const attrs = normalizeDocumentShapeAttrs(node.attrs);
    maximumStoryId = Math.max(
      maximumStoryId,
      attrs.linkedTextBoxStoryId ?? 0,
    );
    return true;
  });
  const patches = documentShapeLinkedTextBoxPatches(
    { pos: source.pos, attrs: source.node.attrs },
    { pos: targetPos, attrs: targetNode.attrs },
    Math.min(0xffff, maximumStoryId + 1),
  );
  if (!patches) return false;
  let transaction = closeHistory(editor.state.tr);
  for (const item of patches) {
    const node = transaction.doc.nodeAt(item.pos);
    if (node?.type.name !== "documentShape") return false;
    transaction = transaction.setNodeMarkup(
      item.pos,
      undefined,
      { ...node.attrs, ...item.patch },
      node.marks,
    );
  }
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, source.pos),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/** Position commands are native-shape only; image placement remains separate. */
export function setLiveDocumentShapePosition(
  editor: Editor,
  action: DocumentShapePositionAction,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const patch = documentShapePositionPatch(target.node.attrs, action);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}









function liveSmartArtTurnScope(
  editor: Editor,
  target: LiveDocumentShapeTarget,
): { kind: "graphic" } | { kind: "member"; memberId: string } | null {
  if (typeof target.attrs.smartArtKind !== "string" || !target.attrs.groupMembers?.length) return null;
  const memberId = liveDocumentShapeMemberId(editor, target);
  return memberId ? { kind: "member", memberId } : { kind: "graphic" };
}

/** The whole SmartArt graphic is selected (not one of its shapes). */
export function liveDocumentSmartArtGraphicSelected(editor: Editor): boolean {
  const target = liveDocumentShapeTarget(editor);
  return target !== null && liveSmartArtTurnScope(editor, target)?.kind === "graphic";
}








export function setLiveDocumentSmartArtGraphicFill(editor: Editor, color: string | null): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || liveSmartArtTurnScope(editor, target)?.kind !== "graphic") return false;
  if (!documentShapeGroupIsEditable(target.attrs)) return false;
  const fill = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : color ? null : "none";
  if (!fill || fill === target.attrs.fill) return false;
  return commitLiveDocumentShapePatch(editor, target, { fill });
}










export function setLiveDocumentSmartArtGraphicFormat(
  editor: Editor,
  change: {
    readonly outline?: string | null;
    readonly outlineWidthPt?: number;
    readonly effect?: "shadow" | "reflection" | "glow" | "softEdge" | null;
  },
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || liveSmartArtTurnScope(editor, target)?.kind !== "graphic") return false;
  if (!documentShapeGroupIsEditable(target.attrs)) return false;
  const patch: Partial<DocumentShapeAttrs> = {};
  if (change.outline !== undefined) {
    const outline = change.outline && /^#[0-9a-f]{6}$/i.test(change.outline) ? change.outline.toLowerCase() : change.outline ? null : "none";
    if (!outline) return false;
    patch.outline = outline;
    // A line given to a graphic with none takes Office's default weight.
    if (outline !== "none" && !(target.attrs.outlineWidthPt > 0)) patch.outlineWidthPt = 0.75;
  }
  if (change.outlineWidthPt !== undefined) {
    if (!(change.outlineWidthPt >= 0)) return false;
    patch.outlineWidthPt = change.outlineWidthPt;
    if (change.outlineWidthPt > 0 && (target.attrs.outline === "none" || !target.attrs.outline)) patch.outline = "#000000";
    if (change.outlineWidthPt === 0) patch.outline = "none";
  }
  if (change.effect !== undefined) patch.effect = change.effect ?? "none";
  if (Object.entries(patch).every(([key, value]) => (target.attrs as unknown as Record<string, unknown>)[key] === value)) return false;
  return commitLiveDocumentShapePatch(editor, target, patch);
}

/** One SmartArt shape turned by `degrees` about its own centre, its words with it. */
function smartArtMemberTurnPatch(
  target: LiveDocumentShapeTarget,
  memberId: string,
  degrees: number,
): Partial<DocumentShapeAttrs> | null {
  const diagram = readDocumentSmartArtDiagram(target.node.attrs);
  if (!diagram || !Number.isFinite(degrees) || degrees === 0) return null;
  return documentSmartArtMemberTransformPatch(diagram, memberId, {
    kind: "rotate",
    pivotMemberId: memberId,
    degrees,
  }) as Partial<DocumentShapeAttrs> | null;
}

function smartArtMemberRotation(target: LiveDocumentShapeTarget, memberId: string): number {
  const member = target.attrs.groupMembers?.find((candidate) => candidate.memberId === memberId);
  const rotation = Number((member as { rotation?: unknown } | undefined)?.rotation);
  return Number.isFinite(rotation) ? rotation : 0;
}

/** Rotate the selected native shape through the same persisted model as drag. */
export function setLiveDocumentShapeRotation(
  editor: Editor,
  action: DocumentShapeRotationAction,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const smartArt = liveSmartArtTurnScope(editor, target);
  if (smartArt?.kind === "graphic") return false;
  if (smartArt?.kind === "member") {
    const turn = action === 0 ? -smartArtMemberRotation(target, smartArt.memberId) : action;
    const memberPatch = smartArtMemberTurnPatch(target, smartArt.memberId, turn);
    return memberPatch ? commitLiveDocumentShapePatch(editor, target, memberPatch) : false;
  }
  const patch = documentShapeRotationPatch(target.node.attrs, action);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

/** Mirror the selected shape geometry while preserving readable shape text. */
export function setLiveDocumentShapeFlip(
  editor: Editor,
  axis: DocumentShapeFlipAxis,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const smartArt = liveSmartArtTurnScope(editor, target);
  if (smartArt?.kind === "graphic") return false;
  if (smartArt?.kind === "member") {
    const memberPatch = documentShapeGroupMemberPatch(target.node.attrs, smartArt.memberId, (leaf) =>
      documentShapeFlipPatch(leaf, axis),
    );
    return memberPatch ? commitLiveDocumentShapePatch(editor, target, memberPatch) : false;
  }
  return commitLiveDocumentShapePatch(
    editor,
    target,
    documentShapeFlipPatch(target.node.attrs, axis),
  );
}

/** Set an exact native-shape angle through the persisted rotation authority. */
export function setLiveDocumentShapeExactRotation(
  editor: Editor,
  raw: string,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const smartArt = liveSmartArtTurnScope(editor, target);
  if (smartArt?.kind === "graphic") return false;
  if (smartArt?.kind === "member") {
    const wanted = Number(typeof raw === "string" ? raw.trim() : raw);
    if (!Number.isFinite(wanted) || (typeof raw === "string" && raw.trim() === "")) return false;
    const memberPatch = smartArtMemberTurnPatch(
      target,
      smartArt.memberId,
      wanted - smartArtMemberRotation(target, smartArt.memberId),
    );
    return memberPatch ? commitLiveDocumentShapePatch(editor, target, memberPatch) : false;
  }
  const patch = documentShapeExactRotationPatch(target.node.attrs, raw);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

/** Set one exact native-shape edge through the persisted DrawingML size. */
export function setLiveDocumentShapeSize(
  editor: Editor,
  axis: DocumentShapeSizeAxis,
  raw: string,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const patch = documentShapeSizePatch(target.node.attrs, axis, raw);
  return patch
    ? commitLiveDocumentShapePatch(editor, target, patch)
    : false;
}

export function documentShapePxToCentimeters(px: number): number {
  return Math.round(((px * 2.54) / 96) * 100) / 100;
}

export function documentShapeCentimetersToPx(raw: string): string {
  // A blank field is not the number 0: Number("") is 0, which turned an
  
  // The blank goes through as-is so the size patch's own guard keeps the
  // current value.
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const centimeters = Number(trimmed);
  return Number.isFinite(centimeters)
    ? String((centimeters * 96) / 2.54)
    : raw;
}

/** Toggle the authenticated native shape's persistent aspect-ratio lock. */
export function toggleLiveDocumentShapeAspectRatio(editor: Editor): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  return commitLiveDocumentShapePatch(
    editor,
    target,
    documentShapeAspectRatioLockPatch(target.node.attrs),
  );
}

/**
 * The selected member of the floating stack a z-order command may move: a
 * shape, or a picture floated in the editor that holds its own place
 * (`documentPictureStackHeight`); its position in the document.
 */
export function liveDocumentStackMemberPos(editor: Editor): number | null {
  const shape = liveDocumentShapeTarget(editor);
  if (shape) return shape.pos;
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (node.isInline || doc.nodeAt(selection.from) !== node) return null;
  // A picture floated in the editor, or an imported anchored picture or a
  // floating text box frame the page may reorder (its import saw the whole
  // stack), or a floating chart: any member `resolveDocumentShapeStack` counts.
  const anchorHeight =
    node.attrs.floatAnchor && typeof node.attrs.floatAnchor === "object"
      ? documentShapeRelativeHeight(
          (node.attrs.floatAnchor as { relativeHeight?: unknown }).relativeHeight,
        )
      : null;
  const member =
    ((node.type.name === "image" || node.type.name === "textBox") &&
      (documentPictureStackHeight(node.attrs) !== null ||
        (node.attrs.zOrderStackComplete === true && anchorHeight !== null))) ||
    (node.type.name === "chart" && anchorHeight !== null);
  return member ? selection.from : null;
}

/**
 * The members the z-order commands move: the Shift / Ctrl + clicked set when
 * there is one (with the member selected last), else the selected member.
 */
export function liveDocumentStackSelection(editor: Editor): readonly number[] {
  const targetPos = liveDocumentStackMemberPos(editor);
  if (targetPos === null) return [];
  const several = documentShapeMultiSelection(editor.state);
  if (several.length < 2) return [targetPos];
  return [...new Set([...several, targetPos])];
}

const GROUP_MEMBER_STEP: Record<DocumentShapeZOrderAction, DocumentGroupStep> = {
  bringToFront: "front",
  bringForward: "forward",
  sendBackward: "backward",
  sendToBack: "back",
};

/**
 * The group's members once the z-order command moved the object picked in
 * it, when one is (Microsoft Support, "Manage objects with the Selection
 * pane": "For an object that's in a group, you can only move it within the
 * group"): `undefined` when no object is picked (the command moves the
 * selection in the page's stack), null when the picked one cannot move that
 * way (at its group's edge, or a group whose order is not written here).
 */
function pickedGroupMemberZOrder(
  editor: Editor,
  action: DocumentShapeZOrderAction,
): { pos: number; node: ProseMirrorNode; groupMembers: DocumentShapeGroupMember[] } | null | undefined {
  const picked = documentShapePickedGroupMember(editor);
  if (!picked) return undefined;
  if (!documentGroupMembersReorderable(picked.node)) return null;
  const members = picked.node.attrs.groupMembers as readonly DocumentShapeGroupMember[];
  const groupMembers = documentGroupMembersStepped(members, picked.memberId, GROUP_MEMBER_STEP[action]);
  return groupMembers ? { pos: picked.pos, node: picked.node, groupMembers } : null;
}

/** Whether the z-order command has nothing to do on the selection. */
export function liveDocumentShapeZOrderAtBoundary(
  editor: Editor,
  action: DocumentShapeZOrderAction,
): boolean {
  if (editor.isDestroyed) return true;
  const member = pickedGroupMemberZOrder(editor, action);
  if (member !== undefined) return member === null;
  const positions = liveDocumentStackSelection(editor);
  return positions.length === 0 || floatingStackZOrderAtBoundary(editor.state.doc, positions, action);
}

/**
 * Reorder the complete representable floating stack (shapes and the pictures
 * floated in the editor) around the selected member in one Undo step.
 */
export function setLiveDocumentShapeZOrder(
  editor: Editor,
  action: DocumentShapeZOrderAction,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  // An object picked in its group moves among its group's objects only,
  // and stays picked; the group keeps its place in the page's stack.
  const member = pickedGroupMemberZOrder(editor, action);
  if (member !== undefined) {
    if (member === null) return false;
    const transaction = closeHistory(
      editor.state.tr.setNodeMarkup(member.pos, undefined, { ...member.node.attrs, groupMembers: member.groupMembers }, member.node.marks),
    );
    editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, member.pos)));
    return true;
  }
  const targetPos = liveDocumentStackMemberPos(editor);
  if (targetPos === null) return false;
  const positions = liveDocumentStackSelection(editor);
  // One member: it stays selected. Several: the set stays as it is.
  return applyFloatingStackZOrder(editor, positions, action, positions.length === 1 ? targetPos : null);
}

/**
 * Shape Format > Reorder Objects on the document's floating stack: the listed
 * members (front first, by position) take their new order in one Undo step,
 * every other floating object keeping its depth. `expectedDoc` is the document
 * the dialog listed; a changed document is refused.
 */
export function reorderLiveDocumentStack(
  editor: Editor,
  expectedDoc: ProseMirrorNode,
  frontFirst: readonly number[],
): boolean {
  if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== expectedDoc) return false;
  const patches = documentShapeStackReorderPatches(
    resolveDocumentShapeStack(editor.state.doc),
    frontFirst,
  );
  if (!patches?.length) return false;
  const selection = editor.state.selection;
  let transaction = editor.state.tr;
  for (const patch of patches) {
    const node = transaction.doc.nodeAt(patch.pos);
    const attrs = node ? documentStackPatchAttrs(node, patch.relativeHeight) : null;
    if (!node || !attrs) return false;
    transaction = transaction.setNodeMarkup(patch.pos, undefined, attrs, node.marks);
  }
  transaction = closeHistory(transaction);
  if (selection instanceof NodeSelection) {
    transaction = transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
  }
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/**
 * Shape Format > Edit Shape > Reroute Connectors on the selected group: its
 * glued connectors move to the closest connection sites of the shapes they
 * join (`documentShapeReroutedConnectorMembers`).
 */
export function rerouteLiveDocumentShapeConnectors(editor: Editor): boolean {
  const target = liveDocumentShapeTarget(editor);
  const members = target?.attrs.groupMembers;
  if (!target || !members?.length) return false;
  const next = documentShapeReroutedConnectorMembers(members);
  return next ? commitLiveDocumentShapePatch(editor, target, { groupMembers: next }) : false;
}

// ---------------------------------------------------------------------------
// SmartArt Design on a document SmartArt (shared by the toolbar and the
// editor-command catalog).
// ---------------------------------------------------------------------------

/**
 * A SmartArt that lives in the document's OWN shape model: the `documentShape`
 * group the insert path builds and the docx import produces
 * (`lib/office-smartart/document-shapes`, `…/document-native-import`).
 *
 * `kind` is the catalog layout the group IS — the identity the SmartArt tab
 * recognises it by, carried on the node and through DOCX. `preserved` marks a
 * non-catalog Office diagram kept exactly as Office drew it: geometry-locked,
 * text-editable, and convertible into a catalog layout the author picks.
 */
export interface LiveDocumentShapeSmartArtTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly attrs: DocumentShapeAttrs;
  readonly kind: string | null;
  readonly preserved: boolean;
}

/**
 * The selected `documentShape` group, when it is a SmartArt: either a catalog
 * diagram (inserted, or imported from one of the 39 Office layouts) or a
 * preserved Office diagram MRAI does not own. Anything else — an ordinary
 * shape, an ordinary group — is not this tab's business.
 */
/** The file's own diagram in the selection, whether or not its conversion is ready. */
export function liveDocumentFileSmartArtNode(editor: Editor): ProseMirrorNode | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  return isShapeNode(node) && doc.nodeAt(selection.from) === node && documentShapeIsPreservedNativeSmartArt(node.attrs)
    ? node
    : null;
}

export function liveDocumentShapeSmartArtTarget(
  editor: Editor,
): LiveDocumentShapeSmartArtTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  if (!isShapeNode(selection.node) || doc.nodeAt(selection.from) !== selection.node) {
    return null;
  }
  const node = documentSmartArtPreparedNode(selection.node) ?? selection.node;
  const identity = documentShapeSmartArtIdentity(node.attrs);
  const preserved = documentShapeIsPreservedNativeSmartArt(node.attrs);
  if (!identity && !preserved) return null;
  return {
    pos: selection.from,
    node,
    attrs: normalizeDocumentShapeAttrs(node.attrs),
    kind: identity?.kind ?? null,
    preserved,
  };
}

/**
 * One SmartArt Design-tab command, committed onto the live diagram.
 *
 * `compute` never sees the diagram the ribbon last RENDERED: the node is
 * re-read and re-authenticated immediately before dispatch, so a command
 * cannot land on a different diagram after a concurrent edit, and it is handed
 * the live one. It returns the whole replacement member set or `null`, and a
 * `null` writes nothing at all — the tab's commands are fail-closed, never
 * partial. The write itself is `commitLiveDocumentShapePatch`'s own recipe
 * (one `setNodeMarkup`, history closed, the atom selection retained), which is
 * the path the insert and the 转换为可编辑 conversion already take, so the
 * whole command is ONE undo step like any other shape edit.
 */
export function commitLiveDocumentSmartArt(
  editor: Editor,
  expected: DocumentSmartArtDiagram,
  compute: (
    diagram: DocumentSmartArtDiagram,
    /** The theme a rebuild draws through (`documentSmartArtHostColorTheme`). */
    colorTheme: Partial<SmartArtColorTheme> | null,
  ) => DocumentSmartArtPatch | null,
  focusEditor = true,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveDocumentShapeSmartArtTarget(editor);
  if (
    !target ||
    target.preserved ||
    !sameDocumentSmartArtDiagram(target.node.attrs, expected)
  ) {
    return false;
  }
  const diagram = readDocumentSmartArtDiagram(target.node.attrs);
  const patch = diagram
    ? compute(diagram, documentSmartArtHostColorTheme(editor.state.doc.attrs, target.node.attrs))
    : null;
  if (!patch) return false;
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      { ...target.node.attrs, ...patch },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, target.pos),
  );
  editor.view.dispatch(transaction);
  // The outline commands keep the caret in the text pane they were typed in;
  // only the ribbon's own commands hand focus back to the page.
  if (focusEditor) editor.view.focus();
  return true;
}

/**
 * A floating shape's whole anchor: the file's origins, wrap and flags with the
 * shape's live offsets (`xEmu`/`yEmu`) on its offset axes -- the anchor Word
 * reads. Null for a shape in line with its text.
 */
function documentShapeWholeAnchor(attrs: Readonly<Record<string, unknown>>): FloatAnchor | null {
  const anchor = normalizeFloatAnchor(attrs.floatAnchor);
  if (!anchor || attrs.wrapMode === "inline") return null;
  const live = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0);
  return {
    ...anchor,
    horizontal: anchor.horizontal.align
      ? anchor.horizontal
      : { relativeFrom: anchor.horizontal.relativeFrom, offsetEmu: live(attrs.xEmu) },
    vertical: anchor.vertical.align
      ? anchor.vertical
      : { relativeFrom: anchor.vertical.relativeFrom, offsetEmu: live(attrs.yEmu) },
    groupTransform: undefined,
  };
}

/** The shape attrs a whole anchor states: the anchor, and its offsets as the
 * shape's own `xEmu`/`yEmu` (an aligned axis has none), and its wrap. */
function documentShapeAnchorPatch(anchor: FloatAnchor): Record<string, unknown> {
  return {
    floatAnchor: anchor,
    xEmu: anchor.horizontal.align ? 0 : Math.round(anchor.horizontal.offsetEmu ?? 0),
    yEmu: anchor.vertical.align ? 0 : Math.round(anchor.vertical.offsetEmu ?? 0),
    wrapMode: floatWrapChoiceOf(anchor),
  };
}

/**
 * The Position gallery on the selected shape (Word's "Position in Top Left
 * with Square Text Wrapping" and its siblings): margin-aligned on both axes,
 * Square. A shape in line with its text is first taken out of the line, as
 * Word does.
 */
export function setLiveDocumentShapePositionPreset(editor: Editor, preset: FloatPositionPreset): boolean {
  let target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  if (!documentShapeWholeAnchor(target.node.attrs)) {
    if (!setLiveDocumentShapeWrap(editor, "square")) return false;
    target = liveDocumentShapeTarget(editor);
    if (!target) return false;
  }
  const anchor = documentShapeWholeAnchor(target.node.attrs);
  if (!anchor) return false;
  return commitLiveDocumentShapePatch(editor, target, documentShapeAnchorPatch(floatAnchorAtPosition(anchor, preset)));
}

/** Move with Text / Fix Position on Page on the selected floating shape: the
 * vertical origin only, the shape kept where it is on the page. */
export function setLiveDocumentShapeMoveWithText(editor: Editor, moveWithText: boolean): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const anchor = documentShapeWholeAnchor(target.node.attrs);
  if (!anchor) return false;
  const dom = editor.view.nodeDOM(target.pos);
  const wrapper =
    dom instanceof HTMLElement
      ? dom.matches("figure[data-document-shape]")
        ? dom
        : dom.querySelector<HTMLElement>("figure[data-document-shape]")
      : null;
  const measured = wrapper ? floatPaintOf(wrapper) : null;
  if (!measured) return false;
  const next = floatAnchorWithMoveWithText(anchor, floatPaintFor(anchor, measured), moveWithText);
  if (next === anchor) return false;
  return commitLiveDocumentShapePatch(editor, target, documentShapeAnchorPatch(next));
}

/** Whether the selected floating shape moves with its text (null in line). */
export function liveDocumentShapeMovesWithText(editor: Editor): boolean | null {
  const target = liveDocumentShapeTarget(editor);
  const anchor = target ? documentShapeWholeAnchor(target.node.attrs) : null;
  return anchor ? floatAnchorMovesWithText(anchor) : null;
}

/** Which Position preset the selected shape stands at, if any. */
export function liveDocumentShapePositionPreset(editor: Editor): FloatPositionPreset | null {
  const target = liveDocumentShapeTarget(editor);
  const anchor = target ? documentShapeWholeAnchor(target.node.attrs) : null;
  return anchor ? floatPositionPresetOf(anchor) : null;
}

/** The selected floating shape's whole anchor and what the float pass
 * measured for it (the Layout dialog's reading). */
export function liveDocumentShapeLayout(editor: Editor): { anchor: FloatAnchor; paint: ReturnType<typeof floatPaintOf> } | null {
  const target = liveDocumentShapeTarget(editor);
  const anchor = target ? documentShapeWholeAnchor(target.node.attrs) : null;
  if (!target || !anchor) return null;
  const dom = editor.view.nodeDOM(target.pos);
  const wrapper =
    dom instanceof HTMLElement
      ? dom.matches("figure[data-document-shape]")
        ? dom
        : dom.querySelector<HTMLElement>("figure[data-document-shape]")
      : null;
  const measured = wrapper ? floatPaintOf(wrapper) : null;
  return { anchor, paint: measured ? floatPaintFor(anchor, measured) : null };
}

/** The Layout dialog's OK on the selected floating shape. */
/** The Layout dialog's Size tab on the selected shape. */
export function liveDocumentShapeSize(
  editor: Editor,
): { widthEmu: number; heightEmu: number; lockAspectRatio: boolean } | null {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return null;
  const attrs = normalizeDocumentShapeAttrs(target.node.attrs);
  return { widthEmu: attrs.widthEmu, heightEmu: attrs.heightEmu, lockAspectRatio: attrs.lockAspectRatio === true };
}

/** The Size tab's OK on the selected shape: both sides in one step. */
export function setLiveDocumentShapeExtent(editor: Editor, widthEmu: number, heightEmu: number): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target) return false;
  const width = documentShapeSizeEmuPatch(target.node.attrs, "width", Math.round(widthEmu), false);
  const both = documentShapeSizeEmuPatch({ ...target.node.attrs, ...width }, "height", Math.round(heightEmu), false);
  const patch = { ...width, ...both };
  return Object.keys(patch).length > 0 ? commitLiveDocumentShapePatch(editor, target, patch) : false;
}

export function setLiveDocumentShapeAnchor(editor: Editor, anchor: FloatAnchor): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || !documentShapeWholeAnchor(target.node.attrs)) return false;
  return commitLiveDocumentShapePatch(editor, target, documentShapeAnchorPatch(anchor));
}
