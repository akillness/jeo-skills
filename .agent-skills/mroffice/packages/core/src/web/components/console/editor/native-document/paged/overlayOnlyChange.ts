/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A document change that moves no line of text.
 *
 * An object drawn in front of or behind the text (an ink stroke, a shape, a
 * text box or a picture with no wrap) takes no room in the page: its block is
 * a zero-height anchor and the drawing is placed over the paper. Adding one,
 * moving one or removing one inside a page therefore leaves every page as it
 * was, and the work that reads the whole document after an edit (the page
 * ledger's pass, the page-span measurement, the layout-ready sampling) has
 * nothing to find. Each pen stroke is such a change; on a long document that
 * work was most of what a stroke cost.
 *
 * The first and the last block of a page are the exception: the page-edge
 * rules (space before dropped at the top, space after at the foot) are
 * written for whichever block stands there, so a change at a page's edge is
 * left to the ordinary path.
 */
import type { Node as PmNode } from "@tiptap/pm/model";

import { floatFlowMode, normalizeFloatAnchor } from "../../../../../lib/office-float-anchor";
import { documentShapeFloatMode } from "../floatingTextBoxLayout";
import { pictureFloatAnchor } from "../pictureFloat";
import { PAGE_BLOCK_NODE } from "./paginationProjectionKeys";

/** A top-level block whose drawing is out of the flow entirely. */
export function isOverlayBlock(node: PmNode): boolean {
  switch (node.type.name) {
    case "documentShape":
      return documentShapeFloatMode(node.attrs.wrapMode, node.attrs.floatAnchor) === "overlay";
    case "textBox": {
      const anchor = normalizeFloatAnchor(node.attrs.floatAnchor);
      return anchor !== null && floatFlowMode(anchor) === "overlay";
    }
    case "image": {
      const anchor = pictureFloatAnchor(node.attrs, node.isInline ? "inline" : "block");
      return anchor !== null && floatFlowMode(anchor) === "overlay";
    }
    default:
      return false;
  }
}

/** [from, to) of `doc` holds only overlay blocks standing inside one page,
 * none of them the page's first or last block once `outside` is counted. */
function onlyInteriorOverlays(doc: PmNode, from: number, to: number): boolean {
  if (from === to) {
    // Nothing of this document is in the change; where the other side's
    // blocks stand is checked on that side.
    return true;
  }
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  if ($from.depth !== 1 || $to.depth !== 1 || $from.parent !== $to.parent) return false;
  const sheet = $from.parent;
  if (sheet.type.name !== PAGE_BLOCK_NODE) return false;
  const first = $from.index();
  const end = $to.index();
  if (first < 1 || end > sheet.childCount - 1) return false;
  for (let index = first; index < end; index += 1) {
    if (!isOverlayBlock(sheet.child(index))) return false;
  }
  return true;
}

/**
 * Whether `after` differs from `before` only by overlay blocks added, changed
 * or removed strictly inside a page. False for no change at all, so a caller
 * can use it as "this edit needs no layout work".
 */
export function overlayOnlyDocChange(before: PmNode, after: PmNode): boolean {
  if (before === after) return false;
  const start = before.content.findDiffStart(after.content);
  if (start === null) return false;
  const end = before.content.findDiffEnd(after.content);
  if (!end) return false;
  let { a: endBefore, b: endAfter } = end;
  // Equal neighbours make the two scans overlap (a block added beside its
  // twin): widen the end past the start by the same amount on both sides.
  const overlap = start - Math.min(endBefore, endAfter);
  if (overlap > 0) {
    endBefore += overlap;
    endAfter += overlap;
  }
  if (endBefore === start && endAfter === start) return false;
  // An insertion or a removal at a page's edge changes which block is the
  // page's first or last: the side that holds the blocks says where they are,
  // and the other side must agree that the place is inside a page.
  if (!insidePage(before, start) || !insidePage(after, start)) return false;
  return onlyInteriorOverlays(before, start, endBefore) && onlyInteriorOverlays(after, start, endAfter);
}

/** `pos` stands between two blocks of one page, after its first block and
 * before its last. */
function insidePage(doc: PmNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  if ($pos.depth !== 1 || $pos.parent.type.name !== PAGE_BLOCK_NODE) return false;
  return $pos.index() >= 1;
}

const OVERLAY_SELECTOR = '[data-float-mode="overlay"]';

function inOverlay(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  return element?.closest(OVERLAY_SELECTOR) != null;
}

/**
 * A DOM mutation that belongs to an overlay block: something inside one
 * changed, or overlay blocks themselves were added to or removed from a
 * page. The counterpart of `overlayOnlyDocChange` for an observer that
 * watches the rendered document.
 */
export function mutationInsideOverlayBlock(record: MutationRecord): boolean {
  if (inOverlay(record.target)) return true;
  if (record.type !== "childList") return false;
  const moved = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  return moved.length > 0 && moved.every((node) => node instanceof Element && node.matches(OVERLAY_SELECTOR));
}
