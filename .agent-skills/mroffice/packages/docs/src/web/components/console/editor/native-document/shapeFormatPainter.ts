/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Painter between SHAPES in Docs: a shape, a group member or one
 * SmartArt shape selected inside its graphic is the source; a click on
 * another shape (or SmartArt shape) paints it.
 *
 * Microsoft Support, "Use the Format Painter": the painter copies all of the
 * formatting of one object to another and works best with drawing objects
 * such as AutoShapes; it copies VISUAL formatting -- fill, line, effects and
 * the text's character formatting -- never the object's data, so geometry
 * (the preset, Change Shape), size and a SmartArt shape's identity stay the
 * target's own. Painting one SmartArt shape is formatting that one shape, so
 * it states the paint as the author's (`smartArtAuthorPaint`, through the
 * member writer) and a hand-set text size as such (`smartArtAuthorTextSize`):
 * a relayout keeps them and Reset Graphic clears them, as for Shape Fill.
 *
 * The whole graphic is no shape's format to pick up (its fill is the
 * graphic's background): the painter waits for one shape to be selected.
 */
import type { Editor } from "@tiptap/core";

import { isOfficeShapePreset, officeShapeDefinition } from "@mrnote/core/web/lib/office-shape-catalog.ts";
import type { DocumentShapeAttrs } from "@mrnote/core/web/lib/document-shapes.ts";

import {
  commitLiveDocumentShapeLeafPatch,
  liveDocumentShapeMemberId,
  liveDocumentShapeTarget,
} from "@mrnote/core/web/components/console/editor/native-document/shapeButtons.ts";

/** The shape's paint: fill, line and effects. */
const PAINT_KEYS = [
  "fill",
  "fillGradient",
  "fillPattern",
  "fillTransparency",
  "outline",
  "outlineWidthPt",
  "outlineStyle",
  "outlineDash",
  "outlineCompound",
  "outlineCap",
  "outlineJoin",
  "outlineTransparency",
  "outlineGradient",
  "effect",
  "shapeShadow",
  "shapeEffects",
] as const;

/** The character formatting of its words. */
const TEXT_KEYS = [
  "textFontFamily",
  "textFontSizePt",
  "textBold",
  "textItalic",
  "textUnderline",
  "textStrike",
  "textFill",
] as const;

export interface DocumentShapeFormatPayload {
  /** Where it was picked up, so a click on the source itself paints nothing. */
  readonly source: { readonly pos: number; readonly memberId: string | null };
  /** Each copied field, `null` where the source states none (it is removed). */
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * The selected shape's format, `"graphic"` when the whole SmartArt graphic is
 * selected (no one shape to pick up), or `null` when no shape is selected.
 */
export function captureDocumentShapeFormat(
  editor: Editor,
): DocumentShapeFormatPayload | "graphic" | null {
  const target = liveDocumentShapeTarget(editor);
  if (!target || target.attrs.inkTool) return null;
  const memberId = liveDocumentShapeMemberId(editor, target);
  if (target.attrs.groupMembers?.length && !memberId) {
    return target.attrs.smartArtKind ? "graphic" : null;
  }
  const source = (
    memberId
      ? target.attrs.groupMembers!.find((member) => member.memberId === memberId)
      : target.attrs
  ) as Readonly<Record<string, unknown>> | undefined;
  if (!source || source.kind === "picture" || source.kind === "chart") return null;
  const fields: Record<string, unknown> = {};
  for (const key of [...PAINT_KEYS, ...TEXT_KEYS]) fields[key] = source[key] ?? null;
  return { source: { pos: target.pos, memberId }, fields };
}

/** Paint the selected shape (or SmartArt shape) with `payload`; one Undo step. */
/**
 * Has the click selected a shape the brush can paint: a shape or SmartArt
 * shape other than the source (not the whole graphic, not the source again)?
 */
export function documentShapeFormatTargetReady(
  editor: Editor,
  payload: DocumentShapeFormatPayload,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || target.attrs.inkTool) return false;
  const memberId = liveDocumentShapeMemberId(editor, target);
  if (target.attrs.groupMembers?.length && !memberId) return false;
  return !(target.pos === payload.source.pos && memberId === payload.source.memberId);
}

export function applyDocumentShapeFormat(
  editor: Editor,
  payload: DocumentShapeFormatPayload,
): boolean {
  const target = liveDocumentShapeTarget(editor);
  if (!target || target.attrs.inkTool) return false;
  const memberId = liveDocumentShapeMemberId(editor, target);
  // The whole graphic, or the source itself, is not a target.
  if (target.attrs.groupMembers?.length && !memberId) return false;
  if (target.pos === payload.source.pos && memberId === payload.source.memberId) return false;
  const member = memberId
    ? target.attrs.groupMembers!.find((candidate) => candidate.memberId === memberId)
    : null;
  if (member && (member.kind === "picture" || member.kind === "chart" || member.kind === "connector")) {
    return false;
  }
  return commitLiveDocumentShapeLeafPatch(editor, (leaf) => {
    const preset = (leaf as { preset?: unknown } | null | undefined)?.preset;
    const lineLike =
      isOfficeShapePreset(preset) && officeShapeDefinition(preset).lineLike === true;
    const patch: Record<string, unknown> = {};
    for (const key of PAINT_KEYS) patch[key] = payload.fields[key];
    // A line carries no words to format.
    if (!lineLike) {
      for (const key of TEXT_KEYS) patch[key] = payload.fields[key];
      // The words take the source's character formatting whole, as Word
      // replaces the target's: per-run overrides go with it.
      patch.textRuns = null;
      if (
        member?.smartArtRole &&
        member.smartArtRole !== "connector" &&
        typeof payload.fields.textFontSizePt === "number"
      ) {
        patch.smartArtAuthorTextSize = true;
      }
    }
    return patch as Partial<DocumentShapeAttrs>;
  });
}
