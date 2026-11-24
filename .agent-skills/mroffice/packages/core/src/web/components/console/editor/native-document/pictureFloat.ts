/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A floating picture's anchor: the same `FloatAnchor` a text box or a shape
 * carries, so one resolver (`floatingTextBoxLayout`) places all three on the
 * page and the paged view wraps its lines around a picture the way Word's
 * Square / Tight / Top and Bottom / Behind Text / In Front of Text do.
 *
 * An imported picture keeps its package reading (`floatAnchor`, from
 * `wp:anchor`). A picture floated in the editor states only `dataFloat`; its
 * anchor is the one the DOCX writer gives it (`_anchor_docx_picture`): column
 * aligned left/right, top of its paragraph, square wrap with Word's default
 * distances (0 above/below, 0.125" beside), or a top-and-bottom band, or an
 * overlay with no distance at all. The live size always wins over a stored
 * extent: a resize is a resize.
 */

import { EMU_PER_PX } from "../../../../lib/office-units";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  floatFlowMode,
  normalizeFloatAnchor,
  type FloatAnchor,
  type FloatFlowMode,
} from "../../../../lib/office-float-anchor";

import { documentShapeRelativeHeight } from "../../../../lib/document-shapes";
import { floatHostParagraphAnchor } from "./floatingTextBoxLayout";

/** Word's default Square wrap distance beside the picture: 0.125 inch. */
const DEFAULT_SIDE_DIST_EMU = 114300;

export type PictureFloat = "left" | "right" | "topAndBottom" | "behindText" | "inFrontOfText";

const PICTURE_FLOATS: ReadonlySet<string> = new Set([
  "left",
  "right",
  "topAndBottom",
  "behindText",
  "inFrontOfText",
]);

export function normalizePictureFloat(value: unknown): PictureFloat | null {
  return typeof value === "string" && PICTURE_FLOATS.has(value) ? (value as PictureFloat) : null;
}

function positiveEmu(emu: unknown, px: unknown): number | null {
  const fromEmu = typeof emu === "number" && Number.isFinite(emu) && emu > 0 ? Math.round(emu) : null;
  if (fromEmu !== null) return fromEmu;
  const fromPx = Number(px);
  return Number.isFinite(fromPx) && fromPx > 0 ? Math.round(fromPx * EMU_PER_PX) : null;
}

/** The anchor the DOCX writer gives a picture floated in the editor. */
export function syntheticPictureFloatAnchor(
  float: PictureFloat,
  widthEmu: number,
  heightEmu: number,
  relativeHeight = 1,
): FloatAnchor {
  const overlay = float === "behindText" || float === "inFrontOfText";
  const band = float === "topAndBottom";
  return {
    version: 1,
    horizontal: {
      relativeFrom: "column",
      align: float === "left" ? "left" : float === "right" ? "right" : "center",
    },
    vertical: { relativeFrom: "paragraph", align: "top" },
    widthEmu,
    heightEmu,
    wrap: overlay
      ? { kind: "none" }
      : band
        ? { kind: "topAndBottom" }
        : { kind: "square", text: "bothSides" },
    behindDoc: float === "behindText",
    locked: false,
    layoutInCell: true,
    allowOverlap: true,
    hidden: false,
    relativeHeight,
    simplePos: false,
    distTEmu: 0,
    distBEmu: 0,
    distLEmu: overlay ? 0 : DEFAULT_SIDE_DIST_EMU,
    distREmu: overlay ? 0 : DEFAULT_SIDE_DIST_EMU,
    effectLEmu: 0,
    effectTEmu: 0,
    effectREmu: 0,
    effectBEmu: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
  };
}

/**
 * The anchor a picture is laid out with, or null for a picture in the flow
 * (in line, or a block picture with no float).
 */
export function pictureFloatAnchor(
  attrs: Record<string, unknown>,
  placement: "block" | "inline",
): FloatAnchor | null {
  if (placement === "inline") return null;
  const widthEmu = positiveEmu(attrs.widthEmu, attrs.width);
  const heightEmu = positiveEmu(attrs.heightEmu, attrs.height);
  const stored = normalizeFloatAnchor(attrs.floatAnchor);
  if (stored) {
    return {
      ...stored,
      widthEmu: widthEmu ?? stored.widthEmu,
      heightEmu: heightEmu ?? stored.heightEmu,
      groupTransform: undefined,
    };
  }
  const float = normalizePictureFloat(attrs.dataFloat);
  if (!float || widthEmu === null || heightEmu === null) return null;
  return syntheticPictureFloatAnchor(
    float,
    widthEmu,
    heightEmu,
    // Given when the picture was floated; a picture from before that states
    // none ranks at the bottom of the stack, as it always did.
    documentShapeRelativeHeight(attrs.relativeHeight) ?? 1,
  );
}

/** The data attributes the node view publishes for the layout pass. */
export function pictureFloatDataAttributes(
  node: ProseMirrorNode,
): { anchor: FloatAnchor; mode: FloatFlowMode; host: string | null } | null {
  const anchor = pictureFloatAnchor(node.attrs, node.isInline ? "inline" : "block");
  if (!anchor) return null;
  return {
    anchor,
    mode: floatFlowMode(anchor),
    host: floatHostParagraphAnchor(node.attrs.source),
  };
}
