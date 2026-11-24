/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PX } from "../../../../lib/office-units";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { normalizeFloatAnchor, type FloatAnchor } from "../../../../lib/office-float-anchor";
import type { FloatPaint } from "../../../../lib/office-float-anchor-edit";
import { documentInkStrokeStyle, isDocumentInkShapeAttrs } from "../../../../lib/document-ink";
import { DOCUMENT_SHAPE_DEFAULT_RELATIVE_HEIGHT } from "../../../../lib/document-shapes";

import {
  documentFloatAnchorTarget,
  documentInkClientPath,
  documentInkRelandPieces,
  type DocumentInkClientPoint,
} from "./documentInk";
import { floatPaintOf } from "./floatingTextBoxLayout";
import { isOverlayBlock } from "./paged/overlayOnlyChange";


/** One object moved: where it is in the document, and how far it went on screen. */
export interface DocumentFloatMove {
  readonly pos: number;
  readonly dxClient: number;
  readonly dyClient: number;
  /** Its size is unchanged (a move, not a scale): a stroke can be landed again from its drawing. */
  readonly sizeKept?: boolean;
  /** What the float pass measured for it, when the caller holds its own reading (a text box's frame). */
  readonly paint?: FloatPaint;
}

interface BodyBlock {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

function bodyBlocks(doc: ProseMirrorNode): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "pageBlock") return true;
    if (parent && (parent.type.name === "doc" || parent.type.name === "pageBlock")) blocks.push({ pos, node });
    return false;
  });
  return blocks;
}

/** The docx paragraph index a source anchor names: the paragraph's own or an object's in it. */
function sourceParagraph(node: ProseMirrorNode, own: boolean): number | null {
  const source = node.attrs?.source as { sourceAnchor?: unknown; hostAnchor?: unknown } | null | undefined;
  if (!own && typeof source?.hostAnchor === "string") {
    const moved = /#p\[(\d+)\]$/.exec(source.hostAnchor);
    return moved ? Number(moved[1]) : null;
  }
  const anchor = source?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  const match = own ? /#p\[(\d+)\](?:\/seg\[\d+\])?$/.exec(anchor) : /#p\[(\d+)\]\/(?!seg\[)/.exec(anchor);
  return match ? Number(match[1]) : null;
}

/**
 * The block the object at `index` is anchored to: the first block after it
 * that is not itself a float (a drawing stands before its paragraph), or the
 * block before it when an imported source names that one.
 */
function hostOf(blocks: readonly BodyBlock[], index: number): number | null {
  const own = sourceParagraph(blocks[index]!.node, false);
  if (own !== null) {
    for (let at = index - 1; at >= 0; at -= 1) {
      if (isOverlayBlock(blocks[at]!.node)) continue;
      if (sourceParagraph(blocks[at]!.node, true) === own) return blocks[at]!.pos;
      break;
    }
  }
  for (let at = index + 1; at < blocks.length; at += 1) {
    if (!isOverlayBlock(blocks[at]!.node)) return blocks[at]!.pos;
  }
  return null;
}

/** A body paragraph of the Word file: its source anchor (`…#p[N]`, a split segment's paragraph) and N. */
function fileParagraphAnchor(node: ProseMirrorNode): { anchor: string; index: number } | null {
  const anchor = (node.attrs?.source as { sourceAnchor?: unknown } | null | undefined)?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  const match = /^(word\/document\.xml#p\[(\d+)\])(?:\/seg\[\d+\])?$/.exec(anchor);
  return match ? { anchor: match[1]!, index: Number(match[2]) } : null;
}

function lockedAnchor(node: ProseMirrorNode, anchor: FloatAnchor): boolean {
  if (anchor.locked) return true;
  const source = node.attrs?.source as { lockAnchor?: unknown } | null | undefined;
  return source?.lockAnchor === true;
}

/** The object's box on screen as it is drawn now (its top-left corner and size), or null. */
function drawnBox(
  view: EditorView,
  pos: number,
  node: ProseMirrorNode,
  given?: FloatPaint,
): (DocumentInkClientPoint & { width: number; height: number }) | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  // A shape is read from its canvas, where it is drawn: the float pass
  // parks an In Front Of / Behind Text shape's stage at its origins and the
  // shape's own margins carry its offsets, so the pass's reading of the
  // wrapper is the ORIGIN, not the shape. Taken as the corner, a picture on
  // a handwriting page dragged up 150px was re-anchored from its paragraph's
  // top instead of its own place -- onto the page before, its offset lost,
  
  if (node.type.name === "documentShape" || isDocumentInkShapeAttrs(node.attrs)) {
    const canvas = dom.querySelector<HTMLElement>("[data-document-shape-canvas]");
    const rect = canvas?.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0)
      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      : null;
  }
  const paint = given ?? floatPaintOf(dom);
  const sheet = dom.closest<HTMLElement>("article[data-page-sheet]");
  if (!paint || !sheet) return null;
  const rect = sheet.getBoundingClientRect();
  return {
    x: rect.left + paint.leftPx * paint.scaleX,
    y: rect.top + paint.topPx * paint.scaleY,
    width: paint.widthPx * paint.scaleX,
    height: paint.heightPx * paint.scaleY,
  };
}

/** The anchor restated against the new block's (and page's) origins; null when an axis cannot be. */
function restatedAnchor(
  view: EditorView,
  pos: number,
  anchor: FloatAnchor,
  at: DocumentInkClientPoint,
  target: NonNullable<ReturnType<typeof documentFloatAnchorTarget>>,
  given?: FloatPaint,
): FloatAnchor | null {
  const dom = view.nodeDOM(pos);
  const paint = given ?? (dom instanceof HTMLElement ? floatPaintOf(dom) : null);
  const sheet = target.sheet?.getBoundingClientRect() ?? null;
  const h = anchor.horizontal.relativeFrom;
  const v = anchor.vertical.relativeFrom;
  let leftPx: number | null = null;
  if (h === "column" || h === "character") leftPx = (at.x - target.columnLeftClient) / (target.scaleX || 1);
  else if (paint && sheet) leftPx = (at.x - sheet.left) / (target.scaleX || 1) - paint.originsH[h];
  let topPx: number | null = null;
  if (v === "paragraph" || v === "line") topPx = (at.y - target.blockTopClient) / (target.scaleY || 1);
  else if (paint && sheet) topPx = (at.y - sheet.top) / (target.scaleY || 1) - paint.originsV[v];
  if (leftPx === null || topPx === null || !Number.isFinite(leftPx) || !Number.isFinite(topPx)) return null;
  return {
    ...anchor,
    // An aligned axis becomes an offset, as Word makes a moved object's position absolute.
    horizontal: { relativeFrom: h, offsetEmu: Math.round(leftPx * EMU_PER_PX) },
    vertical: { relativeFrom: v, offsetEmu: Math.round(topPx * EMU_PER_PX) },
    simplePos: false,
  };
}

/**
 * Re-anchor the objects `moves` names after a move written into `tr`
 * (built on `view.state`, offsets only, so the positions are the same): each
 * one now over another block is moved before it and its offsets restated;
 * an ink stroke is landed again, cut at a seam it crosses. Returns where each
 * moved object now stands (positions in `tr.doc`), by its old position.
 */
export function reanchorMovedDocumentFloats(
  view: EditorView,
  tr: Transaction,
  moves: readonly DocumentFloatMove[],
): Map<number, number[]> {
  const placed = new Map<number, number[]>();
  for (const move of moves) placed.set(move.pos, [move.pos]);
  // Only offsets may have changed before this: positions must agree.
  if (!view.editable || tr.doc.content.size !== view.state.doc.content.size) return placed;
  const blocks = bodyBlocks(view.state.doc);
  const indexOf = new Map(blocks.map((block, index) => [block.pos, index]));
  const operations: Array<{ pos: number; size: number; inserts: Array<{ insertPos: number; nodes: ProseMirrorNode[] }> }> = [];
  for (const move of moves) {
    if (Math.abs(move.dxClient) < 0.5 && Math.abs(move.dyClient) < 0.5) continue;
    const index = indexOf.get(move.pos);
    const before = view.state.doc.nodeAt(move.pos);
    const after = tr.doc.nodeAt(move.pos);
    if (index === undefined || !before || !after || after.type !== before.type) continue;
    const anchor = normalizeFloatAnchor(after.attrs.floatAnchor);
    if (!anchor || lockedAnchor(after, anchor)) continue;
    // An object read from a Word file names its paragraph (its source, or
    // the host it was moved to); it is moved only onto another paragraph of
    // the file, which the DOCX writer moves its run into (float_hosts).
    const importedHost = sourceParagraph(after, false);
    const host = hostOf(blocks, index);
    const ink = isDocumentInkShapeAttrs(after.attrs);
    if (ink && move.sizeKept !== false && !(Number(after.attrs.rotation) || 0)) {
      const drawn = documentInkClientPath(view, move.pos);
      const style = documentInkStrokeStyle(after.attrs);
      if (!drawn || !style) continue;
      const points = drawn.map((point) => ({ ...point, x: point.x + move.dxClient, y: point.y + move.dyClient }));
      const relativeHeight = Number(after.attrs.relativeHeight) || DOCUMENT_SHAPE_DEFAULT_RELATIVE_HEIGHT;
      const pieces = documentInkRelandPieces(view, points, style, relativeHeight);
      if (pieces.length === 0) continue;
      // Still on its paragraph, in one piece: the move as written stands.
      if (pieces.length === 1 && pieces[0]!.nodes.length === 1 && pieces[0]!.insertPos === host) continue;
      operations.push({ pos: move.pos, size: after.nodeSize, inserts: pieces });
      continue;
    }
    const drawn = drawnBox(view, move.pos, before, move.paint);
    if (!drawn) continue;
    const at = { x: drawn.x + move.dxClient, y: drawn.y + move.dyClient };
    // Anchored on the page its centre is over (the page most of it is on),
    // to the paragraph there that holds its top edge, as Word's anchor
    // follows a moved object: by the corner alone, an object let go with its
    // corner just above a seam stayed on the page above, under the next
    // page's paper.
    let target = documentFloatAnchorTarget(view, { x: at.x + 1, y: at.y + 1 }, {
      x: at.x + drawn.width / 2,
      y: at.y + drawn.height / 2,
    });
    if (!target) continue;
    let insertAt = target.insertPos;
    let hostAnchor: string | null = null;
    if (importedHost !== null) {
      const block = view.state.doc.nodeAt(target.insertPos);
      const paragraph = block && !target.createParagraph ? fileParagraphAnchor(block) : null;
      if (!block || !paragraph || paragraph.index === importedHost) continue;
      // Measured from the paragraph's own top, as the page measures an
      // imported object's paragraph; it stands after that paragraph, as an
      // imported object does.
      const dom = view.nodeDOM(target.insertPos);
      if (!(dom instanceof HTMLElement)) continue;
      target = { ...target, blockTopClient: dom.getBoundingClientRect().top };
      insertAt = target.insertPos + block.nodeSize;
      hostAnchor = paragraph.anchor;
    } else if (target.insertPos === host) {
      continue;
    }
    const restated = restatedAnchor(view, move.pos, anchor, at, target, move.paint);
    if (!restated) continue;
    const attrs: Record<string, unknown> = { ...after.attrs, floatAnchor: restated };
    if (hostAnchor) attrs.source = { ...(after.attrs.source as Record<string, unknown>), hostAnchor };
    // A shape states its offsets twice, in its own box and in its anchor.
    if (after.type.name === "documentShape") {
      attrs.xEmu = restated.horizontal.offsetEmu;
      attrs.yEmu = restated.vertical.offsetEmu;
    }
    operations.push({
      pos: move.pos,
      size: after.nodeSize,
      inserts: [
        {
          insertPos: insertAt,
          // A page with no text block gets the paragraph the object anchors to.
          nodes: [
            after.type.create(attrs, after.content, after.marks),
            ...(target.createParagraph && tr.doc.type.schema.nodes.paragraph ? [tr.doc.type.schema.nodes.paragraph.create()] : []),
          ],
        },
      ],
    });
  }
  if (operations.length === 0) return placed;
  const mapFrom = tr.mapping.maps.length;
  for (const operation of [...operations].sort((a, b) => b.pos - a.pos)) {
    tr.delete(operation.pos, operation.pos + operation.size);
  }
  const deletions = tr.mapping.slice(mapFrom);
  const inserts = operations.flatMap((operation) =>
    operation.inserts.map((insert) => ({ from: operation.pos, at: deletions.map(insert.insertPos, -1), nodes: insert.nodes })),
  );
  for (const operation of operations) placed.set(operation.pos, []);
  // Later places first, so an earlier one does not move under a later insertion.
  inserts.sort((a, b) => b.at - a.at);
  const landed: Array<{ from: number; at: number; size: number }> = [];
  for (const insert of inserts) {
    tr.insert(insert.at, insert.nodes);
    const size = insert.nodes.reduce((sum, node) => sum + node.nodeSize, 0);
    // What was placed before (at later positions) moves down by this.
    for (const earlier of landed) if (earlier.at >= insert.at) earlier.at += size;
    let at = insert.at;
    for (const node of insert.nodes) {
      landed.push({ from: insert.from, at, size: node.nodeSize });
      at += node.nodeSize;
    }
  }
  for (const piece of landed) placed.get(piece.from)!.push(piece.at);
  // Objects that did not move keep their place, mapped through the change.
  for (const move of moves) {
    if (operations.some((operation) => operation.pos === move.pos)) continue;
    placed.set(move.pos, [tr.mapping.slice(mapFrom).map(move.pos, 1)]);
  }
  return placed;
}
