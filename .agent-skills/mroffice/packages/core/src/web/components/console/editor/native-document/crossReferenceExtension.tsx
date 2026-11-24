"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { refreshWhenEditPauses } from "./editPausedViews";
import { reactNodeViewWithLivePosition } from "../extensions/reactNodeViewPosition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "../../../../../host/next-intl";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { imeSafeAppendTransaction } from "./imeCompositionGuard";
import { findHeadingPos } from "../extensions/TableOfContents";
import {
  collectHeadingsFromDoc,
  sanitizeAnchorId,
  sanitizeFieldResultText,
} from "./tableOfContents";
import {
  CAPTION_NODE_NAME,
  captionDisplayLabel,
  captionPrefix,
  collectCaptionsFromDoc,
  type DocCaption,
} from "./captions";
import type { Editor } from "@tiptap/core";
import { bookmarkRangesFor } from "./bookmarkExtension";
import { COMMENT_MARK_NAME } from "./comments";
import {
  findFieldCaption,
  isFieldCaptionId,
  liveSeqFieldText,
} from "./fieldCaptions";
import {
  crossRefResultText,
  defaultCrossRefReferenceTo,
  normalizeCrossRefIncludePosition,
  normalizeCrossRefReferenceTo,
  type CrossRefPositionWords,
  type CrossRefReferenceTo,
  type CrossRefTargetFacts,
} from "./crossReferenceModes";
import { computeHeadingNumbers } from "./headingNumbering";
import {
  BOOKMARK_MARK_NAME,
  isHiddenReferenceBookmarkName,
  newHiddenReferenceBookmarkName,
  sanitizeBookmarkName,
} from "./bookmarks";
import {
  collectFootnoteRefOrder,
  findFootnoteRefPos,
} from "./footnoteExtension";
import {
  noteMarkerLabelFor,
  noteStreamOf,
  resolveFootnoteMode,
  sanitizeFootnoteId,
} from "./footnotes";
import {
  formatListOrdinal,
  normalizeListStyleType,
  numFmtForLevel,
} from "./listNumbering";
import { documentPageNumberLabel } from "./documentPageNumbers";
import { documentNoteSettings } from "./noteSectionSettings";
import { pageSplitSeamText } from "./paged/pageSplitSeam";

/**
 * Document CROSS-REFERENCES to headings (Word/WPS parity) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds ONE inline ATOM node ("crossRef") —
 * a clickable internal link dropped at the caret that points at a HEADING and
 * displays a SNAPSHOT of that heading's text. Carries:
 *   - `targetAnchorId`: the heading's stable anchor id (see headingAnchors.ts /
 *     tableOfContents.ts). Funnelled through `sanitizeAnchorId` on every edge so
 *     a forged/imported value can never break out of the `data-target-anchor-id`
 *     attribute or smuggle markup / a fragment-navigation exploit.
 *   - `label`: a snapshot of the heading's text at insertion time, used for
 *     display, for the non-Word HTML rendering, and (on export) for the REF
 *     field's cached result run. Sanitized via `sanitizeFieldResultText`.
 *
 * The node rides through the document schema's open `content`/`attrs`
 * passthrough (see lib/native-page-schemas → documentNodeSchema accepts any node
 * type), so EXISTING documents — which carry none — still validate and load
 * unchanged. There is no flag: the feature is purely opt-in per user action
 * (Insert cross-reference); a document with no cross-references behaves exactly
 * as before.
 *
 * LIVE label: the NodeView derives its DISPLAYED text from the live target on
 * every document update (heading text / caption number+label), so renaming a
 * heading or inserting a figure re-labels every reference immediately — no
 * Word-style manual "update fields" (F9) step. The stored `label` attr remains
 * a SNAPSHOT taken at insertion (refreshed only when the user re-picks): it is
 * the fallback display when the target has been deleted, and the cached result
 * run the docx export writes into the REF field — Word then recomputes on
 * update, exactly like its own stale cached fields.
 *
 * SECURITY: the node renders ONLY a sanitized `data-target-anchor-id` attribute
 * + a fixed class, and the label is rendered as TEXT (React/TipTap escape it).
 * All values pass through the sanitizers in ./tableOfContents on every edge.
 */

/** The inline node name for a cross-reference. */
export const CROSS_REF_NODE_NAME = "crossRef";

/**
 * What a cross-reference targets: a heading (the original/default path) or a
 * captioned figure/table. The id-resolution mechanism is shared (an anchor id
 * looked up by index against the SAME pure collector the editor renders from);
 * `targetType` only selects WHICH collection to resolve against, so a heading
 * and a caption can both be reached by the same node shape.
 */
export type CrossRefTargetType =
  | "heading"
  | "figure"
  | "table"
  | "equation"
  | "bookmark"
  | "footnote"
  | "endnote";

const CROSS_REF_TARGET_TYPES = new Set<string>([
  "heading",
  "figure",
  "table",
  "equation",
  "bookmark",
  "footnote",
  "endnote",
]);

function isNoteCrossRefTarget(
  value: CrossRefTargetType,
): value is "footnote" | "endnote" {
  return value === "footnote" || value === "endnote";
}

function normalizeCrossRefTargetId(
  value: unknown,
  targetType: CrossRefTargetType,
): string {
  if (targetType === "bookmark") return sanitizeBookmarkName(value);
  if (isNoteCrossRefTarget(targetType)) return sanitizeFootnoteId(value) ?? "";
  return sanitizeAnchorId(value);
}

/**
 * Coerce an arbitrary value into a whitelisted cross-reference target type,
 * defaulting to "heading" (the pre-existing behavior) for any unknown/garbage
 * value so an old document — which carries no `targetType` — keeps targeting
 * headings exactly as before.
 */
export function normalizeCrossRefTargetType(
  value: unknown,
): CrossRefTargetType {
  return typeof value === "string" && CROSS_REF_TARGET_TYPES.has(value)
    ? (value as CrossRefTargetType)
    : "heading";
}

/** Old documents and foreign producers default to Word's hyperlink behavior. */
export function normalizeCrossRefHyperlink(value: unknown): boolean {
  return value !== false && value !== "false";
}

/**
 * Resolve the ProseMirror position of a cross-reference's TARGET by type:
 *   - "heading": the existing `findHeadingPos` (unchanged path).
 *   - "figure"/"table": the caption node whose live anchor id matches, found by
 *     index against the SAME `collectCaptions` derivation the caption NodeView
 *     uses — so the jump target always lines up with the displayed number, even
 *     for de-duplicated ids. Returns the caption node's position, or null.
 * Returns null on any miss (a stale/deleted target) so the caller no-ops rather
 * than throwing.
 */
export function findCrossRefTargetPos(
  doc: ProseMirrorNode,
  targetType: CrossRefTargetType,
  anchorId: string,
): number | null {
  // An imported caption (a paragraph with a SEQ field) is found by its block.
  if (isFieldCaptionId(anchorId)) return findFieldCaption(doc, anchorId)?.pos ?? null;
  if (targetType === "heading") return findHeadingPos(doc, anchorId);
  if (targetType === "bookmark") {
    return bookmarkRangesFor(doc, anchorId)[0]?.from ?? null;
  }
  if (isNoteCrossRefTarget(targetType)) {
    const noteId = sanitizeFootnoteId(anchorId);
    if (!noteId) return null;
    const mode = resolveFootnoteMode(doc.attrs?.footnoteMode);
    if (noteStreamOf(noteId, mode) !== targetType) return null;
    return findFootnoteRefPos(doc, noteId);
  }
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === CAPTION_NODE_NAME) positions.push(pos);
    return true;
  });
  const ids = collectCaptionsFromDoc(doc).map((c) => c.id);
  const index = ids.indexOf(anchorId);
  if (index < 0 || index >= positions.length) return null;
  return positions[index];
}

/**
 * The LIVE display text for a cross-reference, derived from its target's
 * current state — or null when the target no longer resolves (deleted heading /
 * caption, or a heading moved outside the referencable level range), in which
 * case the caller falls back to the stored snapshot label.
 *
 *   - "heading": the heading's current text, from the SAME
 *     `collectHeadingsFromDoc` derivation the TOC/outline/picker render from
 *     (default level range — matching `findHeadingPos`'s default, so a
 *     reference always displays the target it would jump to).
 *   - "figure"/"table": the caption's current "Figure N: label" display text
 *     via `captionDisplayLabel` — the exact string the picker offered — so a
 *     figure inserted BEFORE the target renumbers the reference text live.
 *
 * Resolution is by anchor id only (not kind), mirroring
 * {@link findCrossRefTargetPos}: ids are document-unique across kinds, and the
 * displayed text must always describe the node the click jumps to. PURE.
 */
export function liveCrossRefLabel(
  doc: ProseMirrorNode,
  targetType: CrossRefTargetType,
  anchorId: string,
): string | null {
  if (!anchorId) return null;
  if (targetType === "heading") {
    const heading = collectHeadingsFromDoc(doc).find((h) => h.id === anchorId);
    return heading ? heading.text : null;
  }
  if (targetType === "bookmark") {
    const ranges = bookmarkRangesFor(doc, anchorId);
    if (ranges.length === 0) return null;
    // A bookmarked caption includes its SEQ field: the field's live number
    // is part of the text ("Figure 2"), not an empty leaf.
    const leafText = (leaf: ProseMirrorNode): string => {
      if (leaf.type.name !== "documentField") return "";
      let position = -1;
      doc.descendants((node, pos) => {
        if (node === leaf) position = pos;
        return position < 0;
      });
      return (
        (position >= 0
          ? liveSeqFieldText(doc, position, leaf.attrs?.format)
          : null) ??
        (typeof leaf.attrs?.cachedValue === "string" ? leaf.attrs.cachedValue : "")
      );
    };
    // Ranges the page edge cut apart (one paragraph split over two pages)
    // join as the one text they are; truly separate ranges keep a space
    
    const text = ranges
      .map((range, index) => {
        const piece = doc.textBetween(range.from, range.to, " ", leafText);
        if (index === 0) return piece;
        const seam = pageSplitSeamText(doc, ranges[index - 1]!.to, range.from);
        return (seam ?? " ") + piece;
      })
      .join("");
    return sanitizeFieldResultText(text) || sanitizeBookmarkName(anchorId) || null;
  }
  if (isNoteCrossRefTarget(targetType)) {
    const noteId = sanitizeFootnoteId(anchorId);
    if (!noteId) return null;
    const mode = resolveFootnoteMode(doc.attrs?.footnoteMode);
    if (noteStreamOf(noteId, mode) !== targetType) return null;
    return noteMarkerLabelFor(
      collectFootnoteRefOrder(doc),
      noteId,
      mode,
      documentNoteSettings((doc.attrs ?? {}) as Record<string, unknown>),
    );
  }
  const caption = isFieldCaptionId(anchorId)
    ? findFieldCaption(doc, anchorId)
    : collectCaptionsFromDoc(doc).find((c) => c.id === anchorId);
  return caption ? captionDisplayLabel(caption) : null;
}

/**
 * The structural 1-based page a document position falls on: the pageBlock
 * that holds it in the paged editor, otherwise the explicit page breaks before
 * it. The same reading the Table of Contents and captions use for their page
 * numbers, so a PAGEREF shows what the TOC shows. PURE.
 */
/** Where a document's pages turn, read once per document version: each reference
 * on the page asks on every update. */
const pageTurnsByDoc = new WeakMap<ProseMirrorNode, { first: number; before: number[]; atOrBefore: number[] }>();

function pageTurnsOf(doc: ProseMirrorNode): { first: number; before: number[]; atOrBefore: number[] } {
  const known = pageTurnsByDoc.get(doc);
  if (known) return known;
  let hasPageBlocks = false;
  doc.descendants((node) => {
    if (node.type.name === "pageBlock") hasPageBlocks = true;
    return !hasPageBlocks;
  });
  const before: number[] = [];
  const atOrBefore: number[] = [];
  doc.descendants((node, nodePos) => {
    if (node.type.name === "pageBlock") {
      before.push(nodePos);
      return true;
    }
    if (hasPageBlocks) return true;
    if (node.type.name === "pageBreak" || node.type.name === "sourcePageBreak") before.push(nodePos);
    if (node.type.name !== "sourcePageBreak" && node.attrs?.sourcePageBreakBefore === true) atOrBefore.push(nodePos);
    return true;
  });
  const turns = { first: hasPageBlocks ? 0 : 1, before, atOrBefore };
  pageTurnsByDoc.set(doc, turns);
  return turns;
}

/** How many of the ascending `positions` are below `limit`. */
function positionsBelow(positions: readonly number[], limit: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (positions[middle]! < limit) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function structuralPageAt(doc: ProseMirrorNode, pos: number): number {
  const turns = pageTurnsOf(doc);
  return Math.max(1, turns.first + positionsBelow(turns.before, pos) + positionsBelow(turns.atOrBefore, pos + 1));
}

/**
 * Live dotted heading number of the heading that starts at `headingPos`, or
 * "" when heading numbering is off or no heading starts there. Word's default
 * heading list writes every level's text with its parents ("1.2.3"), so the
 * relative (\r), no-context (\n) and full-context (\w) results coincide.
 */
function headingNumberAt(doc: ProseMirrorNode, headingPos: number): string {
  if (doc.attrs?.headingNumbering !== true) {
    // Without document-wide heading numbering a heading can still be
    // numbered by the Home ribbon's numbered list (it sits in an ordered
    // list item); its "1." is the paragraph number Word's \r reference
    
    return orderedListOrdinalAt(doc, headingPos);
  }
  const levels: number[] = [];
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    levels.push(Number(node.attrs?.level));
    positions.push(pos);
    return false;
  });
  const numbers = computeHeadingNumbers(levels.map((level) => ({ level })));
  const index = positions.indexOf(headingPos);
  return index >= 0 ? numbers[index] ?? "" : "";
}

/**
 * The number a block draws as the first block of an ordered-list item at
 * `pos` (list start plus its index, in the list's number style), or "".
 */
function orderedListOrdinalAt(doc: ProseMirrorNode, pos: number): string {
  return orderedListNumbersAt(doc, pos).own;
}

/**
 * The numbers of the ordered-list item whose first block starts at `pos`:
 * its own ("b"), and with every ordered ancestor item before it ("1.b", Word's
 * full context). Each level is drawn in the list's format for that depth.
 */
function orderedListNumbersAt(
  doc: ProseMirrorNode,
  pos: number,
): { own: string; fullContext: string } {
  const none = { own: "", fullContext: "" };
  if (pos < 0 || pos > doc.content.size) return none;
  const $pos = doc.resolve(pos);
  const item = $pos.parent;
  const list = $pos.depth >= 1 ? $pos.node($pos.depth - 1) : null;
  if (
    !list ||
    item.type.name !== "listItem" ||
    list.type.name !== "orderedList" ||
    $pos.nodeAfter !== item.firstChild
  ) {
    return none;
  }
  // Outermost first: [list depth, index of the item in it].
  const chain: Array<{ list: ProseMirrorNode; index: number }> = [];
  for (let depth = $pos.depth - 1; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "orderedList") {
      chain.unshift({ list: node, index: $pos.index(depth) });
    } else if (node.type.name !== "listItem") {
      break;
    }
  }
  const parts = chain.map(({ list: level, index }, depth) => {
    const start = Number(level.attrs?.start ?? 1);
    // The list's scheme ("upper-alpha") names an OOXML numFmt per level.
    return formatListOrdinal(
      numFmtForLevel(normalizeListStyleType(level.attrs?.listStyleType), depth),
      (Number.isFinite(start) ? start : 1) + index,
    );
  });
  return {
    own: parts[parts.length - 1] ?? "",
    fullContext: parts.join("."),
  };
}

/** One paragraph Word's Cross-reference dialog lists under "Numbered item". */
export interface NumberedItemTarget {
  /** The block's stable id (`block_id`), or its position when it has none. */
  id: string;
  /** "1.b" — the number with its context, as the list shows the item. */
  number: string;
  text: string;
}

function numberedItemId(node: ProseMirrorNode, pos: number): string {
  const blockId = node.attrs?.block_id;
  return typeof blockId === "string" && blockId ? blockId : `pos:${pos}`;
}

/** Every numbered paragraph with words in it, in document order. PURE. */
export function collectNumberedItems(doc: ProseMirrorNode): NumberedItemTarget[] {
  const items: NumberedItemTarget[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const numbers = orderedListNumbersAt(doc, pos);
    if (numbers.own && node.textContent.trim()) {
      items.push({
        id: numberedItemId(node, pos),
        number: numbers.fullContext,
        text: node.textContent.replace(/\s+/g, " ").trim().slice(0, 300),
      });
    }
    return false;
  });
  return items;
}

/**
 * The bookmark a cross-reference to this numbered paragraph addresses,
 * creating Word's hidden one around the paragraph's words when it has none.
 * Returns the bookmark name, or null when the item is gone. The selection is
 * left where it is (the reference goes there next).
 */
export function ensureNumberedItemBookmark(
  editor: Editor,
  itemId: string,
): string | null {
  const { state } = editor;
  const markType = state.schema.marks[BOOKMARK_MARK_NAME];
  if (!markType) return null;
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  state.doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    if (numberedItemId(node, pos) === itemId && orderedListNumbersAt(state.doc, pos).own) {
      found = { node, pos };
    }
    return false;
  });
  const target = found as { node: ProseMirrorNode; pos: number } | null;
  if (!target || target.node.content.size === 0) return null;
  const from = target.pos + 1;
  const to = target.pos + target.node.nodeSize - 1;
  // A hidden bookmark that already spans exactly this paragraph is reused,
  // as Word reuses its _Ref bookmark for a second reference.
  const used = new Set<string>();
  let existing: string | null = null;
  state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name !== BOOKMARK_MARK_NAME) continue;
      const name = sanitizeBookmarkName(mark.attrs.name);
      if (name) used.add(name);
    }
    return true;
  });
  for (const name of used) {
    if (!isHiddenReferenceBookmarkName(name)) continue;
    const ranges = bookmarkRangesFor(state.doc, name);
    if (ranges.length === 1 && ranges[0].from === from && ranges[0].to === to) {
      existing = name;
      break;
    }
  }
  if (existing) return existing;
  const name = newHiddenReferenceBookmarkName(used);
  try {
    editor.view.dispatch(state.tr.addMark(from, to, markType.create({ name })));
  } catch {
    return null;
  }
  return bookmarkRangesFor(editor.state.doc, name).length > 0 ? name : null;
}

/**
 * The position before the first block of the list item enclosing `pos`
 * (the block that draws the item's number), or null outside a list item.
 */
function enclosingListBlockPos(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const parent = $pos.node(depth - 1);
    if (
      $pos.node(depth).isTextblock &&
      parent.type.name === "listItem" &&
      $pos.index(depth - 1) === 0
    ) {
      return $pos.before(depth);
    }
  }
  return null;
}

/** The start position of the heading enclosing `pos`, if any. */
function enclosingHeadingPos(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "heading") return $pos.before(depth);
  }
  const after = $pos.nodeAfter;
  return after?.type.name === "heading" ? pos : null;
}

function captionFacts(
  doc: ProseMirrorNode,
  caption: DocCaption,
  targetPos: number,
): CrossRefTargetFacts {
  return {
    text: captionDisplayLabel(caption),
    labelNumber: captionPrefix(caption.kind, caption.number, caption),
    captionText: caption.label,
    pageNumber: caption.pageNumber ?? structuralPageAt(doc, targetPos),
    pageLabel: printedPageLabel(doc, caption.pageNumber ?? structuralPageAt(doc, targetPos)),
    targetPos,
  };
}

/**
 * The label the document prints for a structural page: its page-number
 * start and format (Page Number Format...), as the sheets' PAGE fields show.
 */
function printedPageLabel(doc: ProseMirrorNode, page: number): string {
  // The section's own page numbering (Format Page Numbers: Start at 10).
  return documentPageNumberLabel(doc, page);
}

/**
 * Resolve everything Word's field result needs about a target (text, number,
 * page, position), or null when the target no longer resolves. PURE.
 */
/** One reading of a target per document version, however many references name it. */
const targetFactsByDoc = new WeakMap<ProseMirrorNode, Map<string, CrossRefTargetFacts | null>>();

export function crossRefTargetFacts(
  doc: ProseMirrorNode,
  targetType: CrossRefTargetType,
  anchorId: string,
): CrossRefTargetFacts | null {
  let known = targetFactsByDoc.get(doc);
  if (!known) {
    known = new Map();
    targetFactsByDoc.set(doc, known);
  }
  const key = `${targetType}\u0000${anchorId}`;
  const held = known.get(key);
  if (held !== undefined) return held;
  const facts = readCrossRefTargetFacts(doc, targetType, anchorId);
  known.set(key, facts);
  return facts;
}

function readCrossRefTargetFacts(
  doc: ProseMirrorNode,
  targetType: CrossRefTargetType,
  anchorId: string,
): CrossRefTargetFacts | null {
  const targetPos = findCrossRefTargetPos(doc, targetType, anchorId);
  if (targetPos === null) return null;
  const text = liveCrossRefLabel(doc, targetType, anchorId);
  if (text === null) return null;
  if (
    targetType === "figure" ||
    targetType === "table" ||
    targetType === "equation"
  ) {
    // An imported caption (a SEQ paragraph) is a caption target of its own:
    // its label and number, its text and its page, as a caption block's.
    const caption = isFieldCaptionId(anchorId)
      ? findFieldCaption(doc, anchorId)
      : collectCaptionsFromDoc(doc).find((c) => c.id === anchorId);
    return caption ? captionFacts(doc, caption, targetPos) : null;
  }
  const headingPos =
    targetType === "heading" ? targetPos : enclosingHeadingPos(doc, targetPos);
  // Word's "Paragraph number" for a bookmark on an ordinary numbered
  
  const listBlockPos =
    headingPos === null && targetType === "bookmark"
      ? enclosingListBlockPos(doc, targetPos)
      : null;
  return {
    text,
    number:
      targetType === "footnote" || targetType === "endnote"
        ? undefined
        : headingPos !== null
          ? headingNumberAt(doc, headingPos)
          : listBlockPos !== null
            ? orderedListOrdinalAt(doc, listBlockPos)
            : "",
    numberFullContext:
      listBlockPos !== null
        ? orderedListNumbersAt(doc, listBlockPos).fullContext
        : undefined,
    pageNumber: structuralPageAt(doc, targetPos),
    pageLabel: printedPageLabel(doc, structuralPageAt(doc, targetPos)),
    targetPos,
  };
}

/**
 * The text one cross-reference shows now — Word's field result for its
 * "Insert reference to" choice — or null when the target is gone (the caller
 * keeps the cached label). PURE.
 */
export function liveCrossRefDisplay(
  doc: ProseMirrorNode,
  referencePos: number,
  attrs: Record<string, unknown> | null | undefined,
  words?: CrossRefPositionWords,
): string | null {
  const targetType = normalizeCrossRefTargetType(attrs?.targetType);
  const anchorId = normalizeCrossRefTargetId(attrs?.targetAnchorId, targetType);
  if (!anchorId) return null;
  const referenceTo = normalizeCrossRefReferenceTo(
    attrs?.referenceTo,
    targetType,
  );
  const includePosition = normalizeCrossRefIncludePosition(
    attrs?.includePosition,
    referenceTo,
  );
  const facts = crossRefTargetFacts(doc, targetType, anchorId);
  if (!facts) return null;
  return crossRefResultText(
    referenceTo,
    includePosition,
    facts,
    { pos: referencePos, pageNumber: structuralPageAt(doc, referencePos) },
    words,
  );
}

/**
 * Window CustomEvent the toolbar's Insert-cross-reference button dispatches.
 * NoteEditor listens for it to open the heading picker (decoupling the thin
 * toolbar trigger from the picker UI). Mirrors INSERT_FOOTNOTE_EVENT /
 * INSERT_CITATION_EVENT.
 */
export const INSERT_CROSS_REFERENCE_EVENT = "mrnote:insert-cross-reference";
export interface OpenCrossReferencePickerDetail {
  opener?: HTMLElement | null;
}

/** Word's "Insert reference to" and "Include above/below" for one insert. */
export interface CrossRefInsertOptions {
  referenceTo?: CrossRefReferenceTo;
  includePosition?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentCrossReferences: {
      /**
       * Insert a cross-reference to the target with the given anchor id at the
       * caret, displaying `label` (a snapshot of the target's current text).
       * `targetType` selects whether the anchor resolves against headings
       * (default) or captioned figures/tables. No-op when the anchor id
       * sanitizes to empty (an unusable target). The label is sanitized (and
       * clamped) at the command edge.
       */
      addCrossReference: (
        targetAnchorId: string,
        label: string,
        targetType?: CrossRefTargetType,
        hyperlink?: boolean,
        options?: CrossRefInsertOptions,
      ) => ReturnType;
    };
  }
}

/**
 * The in-text cross-reference marker. Renders the target's LIVE text as a
 * clickable internal link; clicking scrolls the editor to the target (the same
 * jump the Table of Contents performs, via `findCrossRefTargetPos`). The live
 * text re-derives on every document update (rename a heading, insert a figure
 * before the target — the marker follows immediately; Word/LibreOffice both
 * wait for a manual field update), falling back to the stored snapshot label
 * when the target has been deleted. Both texts pass the sanitizers, and an
 * empty result falls back to a fixed placeholder so the marker is never
 * invisible / un-clickable.
 */
function CrossReferenceView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, node } = props;
  const targetType = normalizeCrossRefTargetType(node.attrs?.targetType);
  const targetAnchorId = normalizeCrossRefTargetId(
    node.attrs?.targetAnchorId,
    targetType,
  );
  const hyperlink = normalizeCrossRefHyperlink(node.attrs?.hyperlink);
  const label = sanitizeFieldResultText(node.attrs?.label);

  const referenceTo = normalizeCrossRefReferenceTo(
    node.attrs?.referenceTo,
    targetType,
  );
  const includePosition = normalizeCrossRefIncludePosition(
    node.attrs?.includePosition,
    referenceTo,
  );
  const { getPos } = props;
  const positionWords = useMemo<CrossRefPositionWords>(
    () => ({
      above: t("crossReference.positionAbove"),
      below: t("crossReference.positionBelow"),
      onPage: (page: number | string) =>
        t("crossReference.positionOnPage", { page }),
    }),
    [t],
  );

  // Live display text — Word's field result for the "Insert reference to"
  // choice; null while the target is unresolvable (deleted), in which case
  // the stored snapshot keeps the marker meaningful.
  const readLive = useCallback((): string | null => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    return liveCrossRefDisplay(
      editor.state.doc,
      typeof pos === "number" ? pos : 0,
      {
        targetType,
        targetAnchorId,
        referenceTo,
        includePosition,
      },
      positionWords,
    );
  }, [
    editor,
    getPos,
    includePosition,
    positionWords,
    referenceTo,
    targetAnchorId,
    targetType,
  ]);
  const [liveLabel, setLiveLabel] = useState<string | null>(() => readLive());
  // Once the target has resolved in this view, a later null means the
  // target is gone: show the missing-target text rather than reviving the
  // insert-time snapshot (which may be older than the text the reader just
  // saw). The snapshot stays the fallback for a document whose target was
  
  const resolvedOnceRef = useRef(liveLabel !== null);

  // Re-derive on every document update, committing state only when the derived
  // text actually changed so unrelated edits don't churn React (same pattern as
  // the caption prefix / TOC refresh).
  useEffect(() => {
    // What the reference stores follows its target in the edit that moved
    // the target (`crossRefStoredResultPlugin`); the view only shows it.
    const refresh = () => {
      let next: string | null = null;
      try {
        next = readLive();
      } catch {
        next = null;
      }
      if (next !== null) resolvedOnceRef.current = true;
      setLiveLabel((prev) => (prev === next ? prev : next));
    };
    refresh();
    const stopRefreshing = refreshWhenEditPauses(editor, "cross-references", refresh);
    return () => {
      stopRefreshing();
    };
  }, [editor, readLive]);

  const handleClick = useCallback(() => {
    if (!hyperlink) return;
    if (!targetAnchorId) return;
    const pos = findCrossRefTargetPos(
      editor.state.doc,
      targetType,
      targetAnchorId,
    );
    if (pos === null) return;
    // Mirror the TOC jump: caret at the target's start + scroll into view. (+1
    // lands inside a heading's text; a caption is an atom so +1 selects past it,
    // which still scrolls the caption into view.)
    const chain = editor.chain().focus();
    // A caption (and a note mark) is an atom: there is no text position
    // inside it, and a text selection one past it did not land, so a
    // caption's reference neither selected nor scrolled (WUA 146). It is
    // selected as the node it is, and brought into view.
    if (isNoteCrossRefTarget(targetType) || editor.state.doc.nodeAt(pos)?.isAtom) {
      chain.setNodeSelection(pos).scrollIntoView().run();
      const element = editor.view.nodeDOM(pos);
      if (element instanceof HTMLElement) element.scrollIntoView({ block: "center" });
    } else {
      chain
        .setTextSelection(targetType === "bookmark" ? pos : pos + 1)
        .scrollIntoView()
        .run();
    }
  }, [editor, hyperlink, targetAnchorId, targetType]);

  const displayText =
    liveLabel ?? (resolvedOnceRef.current ? "" : label);

  return (
    <NodeViewWrapper
      as="span"
      className="mrnote-cross-ref"
      data-type="cross-ref"
      data-target-anchor-id={targetAnchorId || undefined}
      data-cross-ref-target-type={targetType}
      data-cross-ref-reference-to={referenceTo}
      data-testid="cross-ref"
    >
      {hyperlink ? (
        // An inline link, not a <button>: a button is an atomic inline box
        // whose width is its longest unbreakable word, so a long reference
        // ran out of the text column and was clipped where the same text
        
        <span
          role="link"
          tabIndex={0}
          className="mrnote-cross-ref__link"
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            handleClick();
          }}
          contentEditable={false}
          data-cross-ref-target={targetAnchorId || undefined}
          title={t("crossReference.goToTarget")}
        >
          {displayText || t("crossReference.missingTarget")}
        </span>
      ) : (
        <span
          className="mrnote-cross-ref__text"
          contentEditable={false}
          data-cross-ref-target={targetAnchorId || undefined}
        >
          {displayText || t("crossReference.missingTarget")}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/**
 * The inline cross-reference ATOM node. parse/render funnel both attrs through
 * the ./tableOfContents sanitizers so a forged/imported value can never break
 * out of the DOM attribute surface or inject markup. The label is carried on a
 * `data-cross-ref-label` attribute (round-tripped through getHTML) and painted
 * by the NodeView. Mirrors FootnoteRef (inline atom) for registration shape.
 */
/**
 * Whether these changes can have taken a reference's target out or put it
 * back: they removed or put in more than plain text (a heading, a caption, a
 * note mark, a table holding one, a paragraph restyled) or bookmarked text,
 * or set an attribute. Typing and deleting plain text never do.
 */
function mayMoveReferenceTargets(transactions: readonly Transaction[]): boolean {
  const holdsTarget = (node: ProseMirrorNode) =>
    !node.isText ||
    node.marks.some((mark) => mark.type.name === BOOKMARK_MARK_NAME);
  for (const transaction of transactions) {
    for (let index = 0; index < transaction.steps.length; index += 1) {
      const step = transaction.steps[index];
      const json = step.toJSON() as { stepType?: string; mark?: { type?: string } };
      if (json.stepType === "attr") return true;
      // A bookmark set or taken off a run is a target appearing or leaving:
      // the step moves no position, so the map below never sees it.
      if ((json.stepType === "addMark" || json.stepType === "removeMark") &&
          json.mark?.type === BOOKMARK_MARK_NAME) return true;
      const before = transaction.docs[index];
      let found = false;
      step.getMap().forEach((from, to) => {
        if (found || to <= from) return;
        before.nodesBetween(from, to, (node, pos) => {
          if (found) return false;
          const inside = pos >= from && pos + node.nodeSize <= to;
          if ((inside || node.isText) && holdsTarget(node)) found = true;
          return !found;
        });
      });
      const content = (step as unknown as { slice?: { content?: ProseMirrorNode["content"] } }).slice?.content;
      content?.descendants((node) => {
        if (found) return false;
        if (holdsTarget(node)) found = true;
        return !found;
      });
      if (found) return true;
    }
  }
  return false;
}

/**
 * The field's stored result follows its target, in the edit that moved the
 * target: a target deleted leaves the missing-target text (an empty result),
 * as Word shows "Error! Reference source not found." once the field is
 * updated; a target that comes back (Undo, a cut text pasted again) stores
 * its text again, so the exported field has a result. Opening a document
 * never writes it.
 *
 * It is written in an appended transaction, part of the user's edit: the
 * shared room publishes that edit, its undo step undoes both, and the save
 * keeps it. Written from the node view afterwards, outside history, it was a
 * view-only normalization the room never published, so the reopened page
 * showed the deleted heading's old words as a working reference (WUA 054).
 */
/** A fragment with each cross-reference's stored result replaced, in order. */
function withCrossRefLabels(fragment: Fragment, labels: string[]): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === CROSS_REF_NODE_NAME) {
      const label = labels.shift();
      nodes.push(label === undefined ? node : node.type.create({ ...node.attrs, label }, null, node.marks));
    } else if (node.childCount) {
      nodes.push(node.copy(withCrossRefLabels(node.content, labels)));
    } else {
      nodes.push(node);
    }
  });
  return Fragment.from(nodes);
}

/**
 * A copied cross-reference carries the result it shows. A reference moved
 * past its target shows "above" where it said "below", while its stored
 * result keeps what it was inserted with; Keep Text Only pasted that old
 * word (WUA 144). The copy takes what the page shows; a rich paste still
 * works its direction out again where it lands.
 */
export function crossRefCopiedResultPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("crossRefCopiedResult"),
    props: {
      transformCopied(slice, view) {
        const { from, to } = view.state.selection;
        const labels: string[] = [];
        view.state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name !== CROSS_REF_NODE_NAME) return true;
          // The words the page draws for it (its view's own language), else
          // its result worked out from the document.
          const shown = view.nodeDOM(pos)?.textContent?.trim();
          const live = shown || liveCrossRefDisplay(view.state.doc, pos, node.attrs);
          labels.push(live ? sanitizeFieldResultText(live) : (node.attrs.label ?? ""));
          return false;
        });
        if (!labels.length) return slice;
        return new Slice(withCrossRefLabels(slice.content, labels), slice.openStart, slice.openEnd);
      },
    },
  });
}

export function crossRefStoredResultPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("crossRefStoredResult"),
    // Skipped while an IME composes (`imeSafeAppendTransaction`): a
    // composition only types text, so a target cannot go with it.
    appendTransaction: imeSafeAppendTransaction((transactions, oldState, newState) => {
      if (
        !transactions.some(
          (transaction) => transaction.docChanged && transaction.getMeta("addToHistory") !== false,
        )
      ) {
        return null;
      }
      if (!mayMoveReferenceTargets(transactions)) return null;
      const references: Array<{ node: ProseMirrorNode; pos: number }> = [];
      newState.doc.descendants((node, pos) => {
        if (node.type.name === CROSS_REF_NODE_NAME) references.push({ node, pos });
        return true;
      });
      if (references.length === 0) return null;
      const resolvedIn = (doc: ProseMirrorNode, cache: Map<string, boolean>) =>
        (targetType: CrossRefTargetType, anchorId: string): boolean => {
          const key = `${targetType}\u0000${anchorId}`;
          let resolved = cache.get(key);
          if (resolved === undefined) {
            resolved = crossRefTargetFacts(doc, targetType, anchorId) !== null;
            cache.set(key, resolved);
          }
          return resolved;
        };
      const resolvesNow = resolvedIn(newState.doc, new Map());
      const resolvedBefore = resolvedIn(oldState.doc, new Map());
      const tr = newState.tr;
      let changed = false;
      for (const { node, pos } of references) {
        const targetType = normalizeCrossRefTargetType(node.attrs.targetType);
        const anchorId = normalizeCrossRefTargetId(node.attrs.targetAnchorId, targetType);
        if (!anchorId) continue;
        const now = resolvesNow(targetType, anchorId);
        const before = resolvedBefore(targetType, anchorId);
        if (now === before) continue;
        const stored = typeof node.attrs.label === "string" ? node.attrs.label : "";
        const next = !now
          ? ""
          : stored === ""
            ? sanitizeFieldResultText(liveCrossRefDisplay(newState.doc, pos, node.attrs) ?? "")
            : stored;
        if (next === stored) continue;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: next }, node.marks);
        changed = true;
      }
      return changed ? tr : null;
    }),
  });
}

const CrossReference = Node.create({
  name: CROSS_REF_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetAnchorId: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => {
          const type = normalizeCrossRefTargetType(
            element.getAttribute("data-cross-ref-target-type"),
          );
          return (
            normalizeCrossRefTargetId(
              element.getAttribute("data-target-anchor-id"),
              type,
            ) || null
          );
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const type = normalizeCrossRefTargetType(attrs.targetType);
          const id = normalizeCrossRefTargetId(attrs.targetAnchorId, type);
          return id ? { "data-target-anchor-id": id } : {};
        },
      },
      label: {
        default: "" as string,
        parseHTML: (element: HTMLElement) =>
          sanitizeFieldResultText(element.getAttribute("data-cross-ref-label")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const label = sanitizeFieldResultText(attrs.label);
          return label ? { "data-cross-ref-label": label } : {};
        },
      },
      targetType: {
        default: "heading" as CrossRefTargetType,
        parseHTML: (element: HTMLElement) =>
          normalizeCrossRefTargetType(
            element.getAttribute("data-cross-ref-target-type"),
          ),
        // Emit the attribute ONLY for a non-default (figure/table) target, so a
        // heading cross-reference — the pre-existing path — renders byte-for-byte
        // identical HTML to before this feature.
        renderHTML: (attrs: Record<string, unknown>) => {
          const type = normalizeCrossRefTargetType(attrs.targetType);
          return type === "heading"
            ? {}
            : { "data-cross-ref-target-type": type };
        },
      },
      hyperlink: {
        default: true as boolean,
        parseHTML: (element: HTMLElement) =>
          normalizeCrossRefHyperlink(
            element.getAttribute("data-cross-ref-hyperlink"),
          ),
        renderHTML: (attrs: Record<string, unknown>) =>
          normalizeCrossRefHyperlink(attrs.hyperlink)
            ? {}
            : { "data-cross-ref-hyperlink": "false" },
      },      // Word's "Insert reference to". null = the type's first choice (the
      // pre-existing behavior), so an old node renders and exports unchanged.
      referenceTo: {
        default: null as CrossRefReferenceTo | null,
        parseHTML: (element: HTMLElement) => {
          const type = normalizeCrossRefTargetType(
            element.getAttribute("data-cross-ref-target-type"),
          );
          const raw = element.getAttribute("data-cross-ref-reference-to");
          const value = normalizeCrossRefReferenceTo(raw, type);
          return raw && value !== defaultCrossRefReferenceTo(type)
            ? value
            : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const type = normalizeCrossRefTargetType(attrs.targetType);
          const value = normalizeCrossRefReferenceTo(attrs.referenceTo, type);
          return value === defaultCrossRefReferenceTo(type)
            ? {}
            : { "data-cross-ref-reference-to": value };
        },
      },
      // Word's "Include above/below" (the `\p` switch on a number / page).
      includePosition: {
        default: false as boolean,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-cross-ref-include-position") === "true",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.includePosition === true
            ? { "data-cross-ref-include-position": "true" }
            : {},
      },
    };
  },

  parseHTML() {
    // A high priority so a `crossRef` anchor wins over the generic `link` mark's
    // `a[href]` rule (both match the rendered `<a data-type="cross-ref" href=…>`).
    // Without this, a pasted/round-tripped cross-reference would degrade into a
    // plain link mark and lose its node identity.
    return [
      { tag: 'a[data-type="cross-ref"]', priority: 100 },
      { tag: 'span[data-type="cross-ref"]', priority: 100 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const label = sanitizeFieldResultText(
      (HTMLAttributes as { "data-cross-ref-label"?: unknown })[
        "data-cross-ref-label"
      ],
    );
    const targetType = normalizeCrossRefTargetType(
      (HTMLAttributes as { "data-cross-ref-target-type"?: unknown })[
        "data-cross-ref-target-type"
      ],
    );
    const id = normalizeCrossRefTargetId(
      (HTMLAttributes as { "data-target-anchor-id"?: unknown })[
        "data-target-anchor-id"
      ],
      targetType,
    );
    const hyperlink = normalizeCrossRefHyperlink(
      (HTMLAttributes as { "data-cross-ref-hyperlink"?: unknown })[
        "data-cross-ref-hyperlink"
      ],
    );
    const referenceToAttr = (
      HTMLAttributes as { "data-cross-ref-reference-to"?: unknown }
    )["data-cross-ref-reference-to"];
    const includePositionAttr =
      (HTMLAttributes as { "data-cross-ref-include-position"?: unknown })[
        "data-cross-ref-include-position"
      ] === "true";
    // Static serialization (HTML export path): a clickable internal link whose
    // href is the sanitized anchor fragment, text = the sanitized label. The
    // live editor NodeView re-paints + wires the in-app scroll jump. The
    // target-type attr is emitted ONLY for non-heading targets — a heading reference
    // (the pre-existing path) stays byte-for-byte identical.
    return [
      hyperlink ? "a" : "span",
      mergeAttributes(
        {},
        id
          ? {
              "data-target-anchor-id": id,
              ...(hyperlink
                ? {
                    href: isNoteCrossRefTarget(targetType)
                      ? `#note-ref-${id}`
                      : `#${id}`,
                  }
                : {}),
            }
          : {},
        label ? { "data-cross-ref-label": label } : {},
        targetType === "heading"
          ? {}
          : { "data-cross-ref-target-type": targetType },
        hyperlink ? {} : { "data-cross-ref-hyperlink": "false" },
        referenceToAttr ? { "data-cross-ref-reference-to": referenceToAttr } : {},
        includePositionAttr
          ? { "data-cross-ref-include-position": "true" }
          : {},
        // The reference's own formatting (inlineAtomRunStyle.ts), canonical
        // JSON its global attribute already rendered.
        typeof HTMLAttributes["data-run-style"] === "string"
          ? { "data-run-style": HTMLAttributes["data-run-style"] }
          : {},
        { "data-type": "cross-ref", class: "mrnote-cross-ref" },
      ),
      // Render the label as the link's TEXT child so non-Word viewers show it.
      label,
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(CrossReferenceView);
  },

  addProseMirrorPlugins() {
    return [crossRefStoredResultPlugin(), crossRefCopiedResultPlugin()];
  },

  addCommands() {
    return {
      addCrossReference:
        (
          targetAnchorId: string,
          label: string,
          targetType = "heading",
          hyperlink = true,
          options: CrossRefInsertOptions = {},
        ) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const refType = state.schema.nodes[CROSS_REF_NODE_NAME];
          if (!refType) return false;
          const normalizedTargetType = normalizeCrossRefTargetType(targetType);
          const id = normalizeCrossRefTargetId(
            targetAnchorId,
            normalizedTargetType,
          );
          if (!id) return false;
          const referenceTo = normalizeCrossRefReferenceTo(
            options.referenceTo,
            normalizedTargetType,
          );
          if (dispatch) {
            const node = refType.create({
              targetAnchorId: id,
              label: sanitizeFieldResultText(label),
              targetType: normalizedTargetType,
              hyperlink: normalizeCrossRefHyperlink(hyperlink),
              referenceTo:
                referenceTo === defaultCrossRefReferenceTo(normalizedTargetType)
                  ? null
                  : referenceTo,
              includePosition: normalizeCrossRefIncludePosition(
                options.includePosition,
                referenceTo,
              ),
            });
            // A Word comment range is a stretch of the line between its two
            // ends: a field put inside it is inside it. The reference wears
            // the comment marks of its place, as typed text and an inserted
            // field do; unmarked between two marked halves, the save read
            
            // E33, corpus R454-D53: non_contiguous_range).
            const { selection } = tr;
            const placeMarks =
              tr.storedMarks ??
              (selection.empty
                ? selection.$from.marks()
                : (selection.$from.marksAcross(selection.$to) ?? []));
            tr.replaceSelectionWith(
              node.mark(placeMarks.filter((mark) => mark.type.name === COMMENT_MARK_NAME)),
              false,
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export const DocumentCrossReferences = CrossReference;

export default DocumentCrossReferences;
