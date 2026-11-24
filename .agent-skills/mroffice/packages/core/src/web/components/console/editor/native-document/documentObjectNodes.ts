/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One picture, one chart — two placements each.
 *
 * Word stores a picture or a chart as the same DrawingML object whether it
 * sits "In Line with Text" (`w:r/w:drawing/wp:inline`, a glyph-like run on the
 * text baseline) or on its own line as MRAI's historical block node. The editor
 * spells the two placements as two node types that share ONE attribute set and
 * ONE node view:
 *
 *   picture: `image` (block, may float/wrap)   ↔ `inlineImage` (inline atom)
 *   chart:   `chart` (block)                   ↔ `inlineChart` (inline atom)
 *   shape:   `documentShape` (block; SmartArt,
 *            shapes, groups, text boxes)      ↔ `inlineDocumentShape` (inline
 *            atom, In Line with Text only: `wp:inline` + `wps:wsp`/`wpg:wgp`)
 *   equation:`mathBlock` (`m:oMathPara`)       ↔ `inlineMath` (`m:oMath`)
 *
 * Every Picture / Chart ribbon command, gallery, dialog and exporter that means
 * "a picture" or "a chart" asks these predicates instead of comparing a node
 * name, so the inline variant is operated on exactly like the block one.
 * Import code keeps its own exact names on purpose (it only produces blocks).
 *
 * Pure: no editor/DOM imports, safe for `lib/` exporters and Node tests.
 */

export const BLOCK_PICTURE_NODE_NAME = "image";
export const INLINE_PICTURE_NODE_NAME = "inlineImage";
export const BLOCK_CHART_NODE_NAME = "chart";
export const INLINE_CHART_NODE_NAME = "inlineChart";
export const BLOCK_SHAPE_NODE_NAME = "documentShape";
export const INLINE_SHAPE_NODE_NAME = "inlineDocumentShape";

export const PICTURE_NODE_NAMES: ReadonlySet<string> = new Set([
  BLOCK_PICTURE_NODE_NAME,
  INLINE_PICTURE_NODE_NAME,
]);

export const CHART_NODE_NAMES: ReadonlySet<string> = new Set([
  BLOCK_CHART_NODE_NAME,
  INLINE_CHART_NODE_NAME,
]);

export const SHAPE_NODE_NAMES: ReadonlySet<string> = new Set([
  BLOCK_SHAPE_NODE_NAME,
  INLINE_SHAPE_NODE_NAME,
]);

/** Inline (run-level) drawing atoms that sit on a text line like a glyph. */
export const INLINE_DRAWING_NODE_NAMES: ReadonlySet<string> = new Set([
  INLINE_PICTURE_NODE_NAME,
  INLINE_CHART_NODE_NAME,
  INLINE_SHAPE_NODE_NAME,
]);

type NamedNode =
  | { readonly type: { readonly name: string } }
  | { readonly type: string }
  | null
  | undefined;

function nameOf(node: NamedNode | string): string | undefined {
  if (typeof node === "string") return node;
  if (!node) return undefined;
  const type = node.type;
  return typeof type === "string" ? type : type?.name;
}

/** A picture in either placement (ProseMirror node, JSON node or node name). */
export function isPictureNode(node: NamedNode | string): boolean {
  const name = nameOf(node);
  return name !== undefined && PICTURE_NODE_NAMES.has(name);
}

/** A chart in either placement (ProseMirror node, JSON node or node name). */
export function isChartNode(node: NamedNode | string): boolean {
  const name = nameOf(node);
  return name !== undefined && CHART_NODE_NAMES.has(name);
}

/**
 * A shape, SmartArt graphic, shape group or text box in either placement
 * (ProseMirror node, JSON node or node name).
 */
export function isShapeNode(node: NamedNode | string): boolean {
  const name = nameOf(node);
  return name !== undefined && SHAPE_NODE_NAMES.has(name);
}

/** An inline picture/chart/shape atom living inside a paragraph's runs. */
export function isInlineDrawingNode(node: NamedNode | string): boolean {
  const name = nameOf(node);
  return name !== undefined && INLINE_DRAWING_NODE_NAMES.has(name);
}
