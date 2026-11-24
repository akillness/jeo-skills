/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import { editsStayInsideTextblocks, plainTextEdits } from "./textblockOnlyEdits";
import { imeReplayingAppendTransaction } from "./imeCompositionGuard";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import { AttrStep, Mapping, ReplaceAroundStep } from "@tiptap/pm/transform";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import styles from "./sourceHardBreakTail.module.css";

type Segment = {
  base: string;
  index: number;
  count: number;
  breakBefore: "page" | "column" | null;
  nonPrintingEmptyTail: boolean;
  styleId: unknown;
  styleName: unknown;
};

/**
 * A piece of a source paragraph a page or column break splits. Its layout
 * (`sourceHardBreakTailPositions`, `sourceHardBreakPiecePositions`) is read
 * only where the source does not state `w:splitPgBreakAndParaMark`, which
 * moves the mark after a paragraph's last page break. `anyMark` reads the
 * pieces where it does too: they are still one `w:p`, whose properties are
 * the whole paragraph's (corpus R465-D20, R466-D19).
 */
function sourceSegment(node: ProseMirrorNode, anyMark = false): Segment | null {
  if (node.type.name !== "paragraph" && node.type.name !== "heading") return null;
  const source = node.attrs.source;
  const marker = source?.hardBreakSegment;
  if (!source || source.adapter !== "docx" || source.nodeType !== "paragraph" ||
      !marker || marker.version !== 1 ||
      (anyMark ? typeof marker.splitParagraphMark !== "boolean" : marker.splitParagraphMark !== false) ||
      !Number.isSafeInteger(marker.index) || !Number.isSafeInteger(marker.count) ||
      marker.index < 0 || marker.count < 2 || marker.index >= marker.count ||
      typeof marker.nonPrintingEmptyTail !== "boolean") return null;
  const match = typeof source.sourceAnchor === "string"
    ? /^(word\/document\.xml#p\[\d+\])(?:\/seg\[([1-9]\d*)\])?$/.exec(source.sourceAnchor) : null;
  if (!match || Number(match[2] ?? 0) !== marker.index ||
      (marker.index === 0 ? marker.breakBefore !== null : !["page", "column"].includes(marker.breakBefore))) return null;
  if (marker.nonPrintingEmptyTail && (marker.index !== marker.count - 1 || marker.breakBefore !== "page")) return null;
  return { base: match[1], index: marker.index, count: marker.count, breakBefore: marker.breakBefore,
    nonPrintingEmptyTail: marker.nonPrintingEmptyTail, styleId: source.styleId, styleName: source.styleName };
}

function paragraphMarkup(node: ProseMirrorNode): ProseMirrorNode {
  const attrs = { ...node.attrs };
  // The paragraph mark's own run formatting is the last piece's alone (it
  // holds the mark): a tail stating the mark's proofing language while its
  // first piece states none is still the same paragraph (corpus R73-D22:
  // every break paragraph drew its mark as a bordered blank line on the
  // next page, which Word does not draw).
  // The empty paragraph's size the mark gives (`paragraphFontSize`) is the
  // mark's too (corpus R280-D19: a tail stating 12 pt after a head stating
  // none drew its line at the top of page 2 and pushed the floating table
  // there 13.8 pt down).
  // So is the mark's own tracked revision (`trackParagraphMark`): Enter
  // pressed with Track Changes on inserts the mark the last piece holds
  // (corpus R417-D03 p[329]: an inserted page break and mark after a table,
  // Word 2010 mode; the tail drew its 14 pt line and 10 pt after at the top
  // of page 45, and the P2.Q1 table's last row went to page 46).
  for (const key of ["source", "block_id", "anchor_id", "toc_anchor_id", "paragraphMarkMarks", "paragraphFontSize"]) delete attrs[key];
  if (!breakTailMarkRevisionOff()) delete attrs.trackParagraphMark;
  return node.type.create(attrs, null, node.marks);
}

/** Harness switch (`window.__docsBreakTailMarkRevisionOff = true`): a piece
 * whose paragraph mark is a tracked revision is not the same paragraph as
 * the others, as before (A/B). */
function breakTailMarkRevisionOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsBreakTailMarkRevisionOff?: boolean }).__docsBreakTailMarkRevisionOff === true;
}

/** A block drawn from an object inside the source paragraph `base`. */
function objectOfSourceParagraph(node: ProseMirrorNode, base: string): boolean {
  if (node.type.name === "paragraph" || node.type.name === "heading") return false;
  const source = node.attrs.source;
  return Boolean(source && source.adapter === "docx" && typeof source.sourceAnchor === "string" &&
    source.sourceAnchor.startsWith(`${base}/`));
}

const LIST_NODES = new Set(["orderedList", "bulletList"]);

/** Current flow only: provenance is retained, never used as write authority.
 * A numbered paragraph's pieces stand in lists: each piece is read from its
 * list item, and a tail that is its list's one item and paragraph is the
 * list (corpus R158-D19: "Following submission" + page break, numbered;
 * Word draws neither the mark's line nor a number on the next page, where
 * the page drew a "9." line). */
export function sourceHardBreakTailPositions(doc: ProseMirrorNode): number[] {
  const flow: Array<{ node: ProseMirrorNode; pos: number; block: number | null }> = [];
  function collect(parent: ProseMirrorNode, start: number) {
    parent.forEach((node, offset) => {
      const pos = start + offset;
      if (node.type.name === "pageBlock") collect(node, pos + 1);
      else if (LIST_NODES.has(node.type.name)) {
        const lone = node.childCount === 1 && node.firstChild!.childCount === 1;
        node.forEach((item, itemOffset) => {
          const itemPos = pos + 1 + itemOffset;
          item.forEach((child, childOffset) => {
            flow.push({ node: child, pos: itemPos + 1 + childOffset, block: lone ? pos : null });
          });
        });
      } else flow.push({ node, pos, block: pos });
    });
  }
  collect(doc, 0);
  const result: number[] = [];
  for (let end = 0; end < flow.length; end++) {
    const tail = flow[end];
    const marker = sourceSegment(tail.node);
    if (!marker?.nonPrintingEmptyTail || tail.node.content.size !== 0 || marker.count > flow.length) continue;
    const start = end - 2 * (marker.count - 1);
    if (start < 0) continue;
    if (sourceSegment(flow[start].node)?.index !== 0) {
      // A first piece holding only an object Word anchors there (R87-D17: a
      // VML text box, then the page break): the page draws the object as
      // its own block and keeps no empty paragraph for the piece, so the
      // tail follows the object and its break directly. Word still draws
      // no line for the paragraph mark after the break (the chapter title
      // under it opens the page).
      if (marker.count === 2 && objectOfSourceParagraph(flow[start].node, marker.base) &&
          flow[end - 1].node.type.name === "pageBreak" && tail.block !== null) result.push(tail.block);
      continue;
    }
    const markup = paragraphMarkup(flow[start].node);
    let valid = true;
    for (let index = 0; index < marker.count; index++) {
      const candidate = flow[start + 2 * index].node;
      const part = sourceSegment(candidate);
      if (!part || part.base !== marker.base || part.count !== marker.count || part.index !== index ||
          part.styleId !== marker.styleId || part.styleName !== marker.styleName ||
          !paragraphMarkup(candidate).sameMarkup(markup)) { valid = false; break; }
      if (index > 0 && flow[start + 2 * index - 1].node.type.name !==
          (part.breakBefore === "page" ? "pageBreak" : "columnBreak")) { valid = false; break; }
    }
    if (valid && tail.block !== null) result.push(tail.block);
  }
  return result;
}

/**
 * Whether `node` is a Word paragraph's empty tail after a page break inside
 * it (the paragraph mark standing after `<w:br w:type="page"/>`), or a list
 * holding only that tail (a numbered paragraph's). Read from the node alone,
 * for the page ledger: at the end of the document Word opens no page for it.
 */
export function isNonPrintingEmptyTailBlock(node: ProseMirrorNode): boolean {
  let tail = node;
  if (LIST_NODES.has(node.type.name)) {
    if (node.childCount !== 1 || node.firstChild!.childCount !== 1) return false;
    tail = node.firstChild!.firstChild!;
  }
  return tail.content.size === 0 && sourceSegment(tail)?.nonPrintingEmptyTail === true;
}

const HOLDS_SOURCE_SEGMENT = new SheetFact((node) => sourceSegment(node) !== null);
const HOLDS_ANY_SOURCE_SEGMENT = new SheetFact((node) => sourceSegment(node, true) !== null);

/**
 * The pieces of paragraphs a page break inside them split, as Word lays them
 * out (Word 16.86, corpus R04-D09: six paragraphs each opening with a page
 * break, 6 pages):
 * - `leads`: an empty first piece, the line holding only the leading page
 *   (or column) break. Word draws it at the foot of the page before, under the text,
 *   without the paragraph's space before, and it never opens a page of its
 *   own. Laid out as a line of its own with that space, it took a page.
 * - `continuations`: the text after a page break inside the paragraph. It
 *   goes on at the top of the next page without the paragraph's space
 *   before: that space is the paragraph's first line's.
 */
export function sourceHardBreakPiecePositions(doc: ProseMirrorNode): { leads: number[]; continuations: number[] } {
  if (!HOLDS_SOURCE_SEGMENT.inDoc(doc)) return { leads: [], continuations: [] };
  const flow: Array<{ node: ProseMirrorNode; pos: number }> = [];
  function collect(parent: ProseMirrorNode, start: number) {
    parent.forEach((node, offset) => {
      const pos = start + offset;
      if (node.type.name === "pageBlock") collect(node, pos + 1);
      else flow.push({ node, pos });
    });
  }
  collect(doc, 0);
  const leads: number[] = [];
  const continuations: number[] = [];
  flow.forEach(({ node, pos }, index) => {
    const marker = sourceSegment(node);
    if (!marker) return;
    const breakAfter = flow[index + 1]?.node.type.name;
    if (marker.index === 0 && node.content.size === 0 && (breakAfter === "pageBreak" || breakAfter === "columnBreak")) {
      const kind = breakAfter === "pageBreak" ? "page" : "column";
      // Only before text of its own paragraph: a paragraph holding nothing
      // but the break keeps its line (its tail is the non-printing one).
      const after = flow[index + 2]?.node;
      const next = after ? sourceSegment(after) : null;
      if (next && next.base === marker.base && next.index === 1 && next.breakBefore === kind &&
          !next.nonPrintingEmptyTail && after!.content.size > 0) leads.push(pos);
      // A line holding only the break keeps no space before either (Word
      // 16.86, corpus R73-D22: a paragraph of a page break alone, and one
      // of a column break before an empty piece, stand right under the line
      // above them in Word; with their 60 pt before they took a column).
      else continuations.push(pos);
    } else if (marker.index >= 1 && marker.breakBefore !== null && !marker.nonPrintingEmptyTail &&
        flow[index - 1]?.node.type.name === (marker.breakBefore === "page" ? "pageBreak" : "columnBreak")) {
      continuations.push(pos);
    }
  });
  return { leads, continuations };
}

/**
 * Attributes of a piece that are not the paragraph's properties: its own
 * identity and provenance, the paragraph mark's formatting and its revision
 * (held by the last piece), the break Word puts before the paragraph's first
 * line, a drop cap (its own frame on the first letter), and comment anchors.
 * A tracked paragraph format revision is the whole paragraph's, as Word keeps
 * one `w:pPrChange` in the `w:p`: Track Changes records it on the piece the
 * command changed, and it is handed on with the properties it records.
 */
const PIECE_OWN_ATTRS = new Set([
  "source", "block_id", "anchor_id", "toc_anchor_id", "commentThreadIds",
  "paragraphMarkMarks", "paragraphFontSize", "pageBreakBefore",
  "dropCap", "dropCapLines", "dropCapPosition", "dropCapDistancePt",
  "trackParagraphMark", "wordHorizontalRule",
]);

type Piece = { node: ProseMirrorNode; pos: number };

/** The flow pieces of split source paragraphs stand in: page blocks and
 * lists are looked through, as for the tails. */
function pieceFlow(doc: ProseMirrorNode): Piece[] {
  const flow: Piece[] = [];
  function collect(parent: ProseMirrorNode, start: number) {
    parent.forEach((node, offset) => {
      const pos = start + offset;
      if (node.type.name === "pageBlock") collect(node, pos + 1);
      else if (LIST_NODES.has(node.type.name)) {
        node.forEach((item, itemOffset) => {
          const itemPos = pos + 1 + itemOffset;
          item.forEach((child, childOffset) => flow.push({ node: child, pos: itemPos + 1 + childOffset }));
        });
      } else flow.push({ node, pos });
    });
  }
  collect(doc, 0);
  return flow;
}

/**
 * Each source paragraph whose pieces all stand, in order, with their own
 * breaks between them: its base anchor -> its pieces by index. A paragraph
 * whose pieces an edit has parted, joined or duplicated has none.
 */
export function sourceParagraphPieceGroups(doc: ProseMirrorNode): Map<string, Piece[]> {
  const groups = new Map<string, Piece[]>();
  if (!HOLDS_ANY_SOURCE_SEGMENT.inDoc(doc)) return groups;
  const flow = pieceFlow(doc);
  const ambiguous = new Set<string>();
  flow.forEach((entry, start) => {
    const head = sourceSegment(entry.node, true);
    if (!head || head.index !== 0) return;
    const pieces: Piece[] = [entry];
    for (let index = 1; index < head.count; index++) {
      const separator = flow[start + 2 * index - 1];
      const candidate = flow[start + 2 * index];
      const part = candidate ? sourceSegment(candidate.node, true) : null;
      if (!part || part.base !== head.base || part.count !== head.count || part.index !== index ||
          separator.node.type.name !== (part.breakBefore === "page" ? "pageBreak" : "columnBreak")) return;
      pieces.push(candidate);
    }
    if (groups.has(head.base)) ambiguous.add(head.base);
    groups.set(head.base, pieces);
  });
  for (const base of ambiguous) groups.delete(base);
  return groups;
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Where the batch set a node's attributes or type (`setNodeMarkup`,
 * `setNodeAttribute`, `setBlockType`), in the batch's final document. */
function retypedNodePositions(transactions: readonly Transaction[]): Set<number> {
  const steps = transactions.flatMap((tr) => tr.steps);
  const maps = transactions.flatMap((tr) => tr.mapping.maps);
  const positions = new Set<number>();
  steps.forEach((step, index) => {
    let at: number | null = null;
    if (step instanceof AttrStep) at = step.pos;
    else if (step instanceof ReplaceAroundStep) {
      const { from, to, gapFrom, gapTo, insert, structure } = step as unknown as {
        from: number; to: number; gapFrom: number; gapTo: number; insert: number; structure: boolean };
      if (structure && insert === 1 && gapFrom === from + 1 && gapTo === to - 1) at = from;
    }
    if (at !== null) positions.add(new Mapping(maps.slice(index + 1)).map(at));
  });
  return positions;
}

/**
 * Word's paragraph properties are the whole `w:p`'s: Borders, Shading,
 * alignment, indents, spacing or a style given to one piece of a paragraph
 * a page or column break splits are given to every piece of it, as Word
 * formats the whole paragraph wherever the caret is in it (corpus R460-D16
 * E46: a box given to the title after a column break framed half the
 * paragraph, and the export wrote the pieces as three paragraphs).
 * Read from the steps that set a piece's attributes or type, old document
 * against new, so a command, the ribbon and Undo all go through it; a piece
 * whose content an edit rebuilt hands nothing on.
 */
export function sourceParagraphPieceFormatSync(
  transactions: readonly Transaction[], oldState: EditorState, newState: EditorState,
): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged && tr.getMeta("addToHistory") !== false && tr.getMeta("y-sync$") === undefined)) return null;
  if (editsStayInsideTextblocks(transactions) || !HOLDS_ANY_SOURCE_SEGMENT.inDoc(newState.doc)) return null;
  const touched = retypedNodePositions(transactions);
  if (!touched.size) return null;
  const before = sourceParagraphPieceGroups(oldState.doc);
  if (!before.size) return null;
  const tr = newState.tr;
  for (const [base, pieces] of sourceParagraphPieceGroups(newState.doc)) {
    const earlier = before.get(base);
    if (!earlier || earlier.length !== pieces.length || !pieces.some((piece) => touched.has(piece.pos))) continue;
    // What the edit set on its pieces, read in order.
    const changed = new Map<string, unknown>();
    let type: NodeType | null = null;
    for (let index = 0; index < pieces.length; index++) {
      const now = pieces[index].node;
      const old = earlier[index].node;
      if (!touched.has(pieces[index].pos)) continue;
      if (now.type !== old.type) type = now.type;
      for (const key of new Set([...Object.keys(old.attrs), ...Object.keys(now.attrs)])) {
        if (!PIECE_OWN_ATTRS.has(key) && !sameValue(old.attrs[key], now.attrs[key])) changed.set(key, now.attrs[key]);
      }
    }
    if (!changed.size && !type) continue;
    for (const piece of pieces) {
      const node = tr.doc.nodeAt(piece.pos);
      if (!node) continue;
      const nextType = type ?? node.type;
      if (nextType === node.type && [...changed].every(([key, value]) => sameValue(node.attrs[key], value))) continue;
      if (!nextType.validContent(node.content)) continue;
      // A piece standing where its new type may not (a list item's first
      // paragraph cannot become a heading) keeps its type.
      const $piece = tr.doc.resolve(piece.pos);
      const type_ = $piece.parent.canReplaceWith($piece.index(), $piece.index() + 1, nextType) ? nextType : node.type;
      if (type_ === node.type && [...changed].every(([key, value]) => sameValue(node.attrs[key], value))) continue;
      tr.setNodeMarkup(piece.pos, type_, { ...node.attrs, ...Object.fromEntries(changed) }, node.marks);
    }
  }
  return tr.docChanged ? tr : null;
}

type TailState = { positions: number[]; decorations: DecorationSet };
export const sourceHardBreakTailKey = new PluginKey<TailState>("sourceHardBreakTail");

function decorations(doc: ProseMirrorNode, positions: number[], caret: number | null): DecorationSet {
  const pieces = sourceHardBreakPiecePositions(doc);
  return DecorationSet.create(doc, [
    ...positions.map((pos) => {
      const node = doc.nodeAt(pos)!;
      // A tail standing as its own list: the list's number is not drawn either.
      const list = LIST_NODES.has(node.type.name) ? ` ${styles.nonPrintingTailList}` : "";
      return Decoration.node(pos, pos + node.nodeSize, {
        class: `${styles.nonPrintingTail}${list}${caret === pos + 1 ? ` ${styles.focusedCaret}` : ""}`,
        "data-mrnote-source-break-tail": "true",
      });
    }),
    // The empty line of a leading page break: no physical line of its own.
    ...pieces.leads.map((pos) => Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, {
      class: `${styles.nonPrintingTail}${caret === pos + 1 ? ` ${styles.focusedCaret}` : ""}`,
      "data-mrnote-source-break-lead": "true",
    })),
    ...pieces.continuations.map((pos) => Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, {
      class: styles.breakContinuation,
    })),
  ]);
}

export const SourceHardBreakTail = Extension.create({
  name: "sourceHardBreakTail",
  addProseMirrorPlugins() {
    return [new Plugin<TailState>({
      key: sourceHardBreakTailKey,
      state: {
        init: (_, state) => {
          const positions = sourceHardBreakTailPositions(state.doc);
          return { positions, decorations: decorations(state.doc, positions, state.selection.empty ? state.selection.from : null) };
        },
        // Equal-content document replacement still recreates its positions.
        apply: (tr, previous) => {
          if (!tr.docChanged && !tr.selectionSet) return previous;
          // Typing in a block that holds text moves the tails (empty blocks
          // and their source markers) without making or ending one.
          const positions = !tr.docChanged
            ? previous.positions
            : plainTextEdits(tr)
              ? previous.positions.map((position) => tr.mapping.map(position))
              : sourceHardBreakTailPositions(tr.doc);
          return { positions, decorations: decorations(tr.doc, positions, tr.selection.empty ? tr.selection.from : null) };
        },
      },
      props: { decorations: (state) => sourceHardBreakTailKey.getState(state)?.decorations ?? DecorationSet.empty },
    }), new Plugin({
      appendTransaction: imeReplayingAppendTransaction(sourceParagraphPieceFormatSync),
    })];
  },
});
