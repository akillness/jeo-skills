/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A floating object goes where its anchor paragraph goes, as in Word.
 *
 * The page draws a floating object (a picture, shape or text box with a
 * float anchor) as a block of its own beside the paragraph it is anchored
 * to; in the file it is a run of that paragraph. ProseMirror treats the
 * block as any other, so an edit that never touched the object could take
 * it, and one that took the paragraph could leave it behind:
 *
 * 1. A selection covering a whole paragraph -- from its start through its
 *    mark -- that is deleted or cut takes the floating objects anchored to
 *    it (a cut puts them on the clipboard with the paragraph, and a paste
 *    puts them back with it). Left behind, the save re-anchored them to the
 *    next paragraph (corpus R491-D05: a cover's page background picture,
 *    anchored to the title line, ended in the next paragraph when the title
 *    was moved).
 * 2. A join (Backspace at a paragraph's start, Delete at its end, or a
 *    selection deleted across two paragraphs) removes a paragraph mark only:
 *    no object goes. The objects of the paragraph whose mark went are
 *    anchored to the merged paragraph. Backspace at the start of a paragraph
 *    with an object's block before it deleted the object and joined nothing.
 * 3. A selection that covers part of a paragraph leaves its anchors alone.
 *
 * Word's model (Microsoft Support, "Anchor a picture"): the anchor is a
 * place in the paragraph's text; an object moves with its paragraph and is
 * deleted only with it. Suggesting (Track Changes) keeps its own deletion
 * rules and is left to them.
 */
import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { canJoin, ReplaceStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { normalizeFloatAnchor } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { pictureFloatAnchor } from "@mrnote/core/web/components/console/editor/native-document/pictureFloat.ts";
import { isSuggestingActive } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";

/** A top-level block the page draws for a floating object of a paragraph. */
export function isAnchoredFloatBlock(node: ProseMirrorNode): boolean {
  switch (node.type.name) {
    case "documentShape":
      return node.attrs.wrapMode !== "inline" && normalizeFloatAnchor(node.attrs.floatAnchor) !== null;
    case "textBox":
      return normalizeFloatAnchor(node.attrs.floatAnchor) !== null;
    case "image":
      return !node.isInline && pictureFloatAnchor(node.attrs as Record<string, unknown>, "block") !== null;
    default:
      return false;
  }
}

interface Block {
  readonly pos: number;
  readonly end: number;
  readonly node: ProseMirrorNode;
  /** The body container (`doc` or a `pageBlock`) holding it, by position. */
  readonly parent: number;
}

/** The body's blocks in order: the children of the document or of its page blocks. */
function bodyBlocks(doc: ProseMirrorNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((child, offset) => {
    if (child.type.name === "pageBlock") {
      child.forEach((inner, innerOffset) => {
        const pos = offset + 1 + innerOffset;
        blocks.push({ pos, end: pos + inner.nodeSize, node: inner, parent: offset });
      });
    } else {
      blocks.push({ pos: offset, end: offset + child.nodeSize, node: child, parent: -1 });
    }
  });
  return blocks;
}

type Source = { sourceAnchor?: unknown; hostAnchor?: unknown } | null | undefined;

/** The Word body paragraph (`…#p[N]`) a block is, or null. */
function ownParagraph(node: ProseMirrorNode): string | null {
  const anchor = (node.attrs?.source as Source)?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  return /^(word\/document\.xml#p\[\d+\])(?:\/seg\[\d+\])?$/.exec(anchor)?.[1] ?? null;
}

/** The Word body paragraph a floating object names as its anchor (its host, or the paragraph its run is in). */
function namedParagraph(node: ProseMirrorNode): string | null {
  const source = node.attrs?.source as Source;
  if (typeof source?.hostAnchor === "string") return /^(word\/document\.xml#p\[\d+\])$/.exec(source.hostAnchor)?.[1] ?? null;
  const anchor = source?.sourceAnchor;
  if (typeof anchor !== "string") return null;
  return /^(word\/document\.xml#p\[\d+\])\/(?!seg\[)/.exec(anchor)?.[1] ?? null;
}

/**
 * The block a floating object at `index` is anchored to, by index: the
 * paragraph before it when its source names that one (an imported object
 * stands after its paragraph), else the first block after it that is not a
 * floating object (a drawing stands before its paragraph) -- the page's own
 * rule (`floatReanchor`) and the save's (`_docx_stranded_float_hosts`).
 */
function hostIndex(blocks: readonly Block[], index: number): number | null {
  const named = namedParagraph(blocks[index]!.node);
  if (named !== null) {
    for (let at = index - 1; at >= 0; at -= 1) {
      if (isAnchoredFloatBlock(blocks[at]!.node)) continue;
      if (ownParagraph(blocks[at]!.node) === named) return at;
      break;
    }
  }
  for (let at = index + 1; at < blocks.length; at += 1) {
    if (!isAnchoredFloatBlock(blocks[at]!.node)) return at;
  }
  return null;
}

/** The text blocks a deletion of [from, to) takes whole (start through mark), by index. */
function wholeParagraphs(blocks: readonly Block[], from: number, to: number): Set<number> {
  const whole = new Set<number>();
  blocks.forEach((block, index) => {
    if (!block.node.isTextblock) return;
    // Inside the range, its opening and closing both, or from the very start
    // of its text through its closing (the mark): either way all of it goes.
    if ((from <= block.pos && block.end <= to) || (from === block.pos + 1 && to >= block.end)) whole.add(index);
  });
  return whole;
}

/** What a deletion of [from, to) of `doc` means for the floating objects: which go with it, which must stay. */
function floatsOfDeletion(doc: ProseMirrorNode, from: number, to: number) {
  const blocks = bodyBlocks(doc);
  const whole = wholeParagraphs(blocks, from, to);
  const go: Block[] = [];
  const stay: Block[] = [];
  blocks.forEach((block, index) => {
    if (!isAnchoredFloatBlock(block.node)) return;
    const inside = from <= block.pos && block.end <= to;
    const host = hostIndex(blocks, index);
    const hostGoes = host !== null && whole.has(host);
    if (hostGoes && !inside) go.push(block);
    else if (!hostGoes && inside && host !== null) stay.push(block);
  });
  return { go, stay };
}

/** The floating object restated for the paragraph it now stands by: anchored to it when that is another file paragraph. */
function anchoredTo(node: ProseMirrorNode, paragraph: ProseMirrorNode | null): ProseMirrorNode {
  const own = paragraph ? ownParagraph(paragraph) : null;
  const named = namedParagraph(node);
  if (!own || !named || own === named) return node;
  return node.type.create({ ...node.attrs, source: { ...(node.attrs.source as Record<string, unknown>), hostAnchor: own } }, node.content, node.marks);
}

/**
 * Put `nodes` (floating objects whose paragraph survives) back by the text
 * block at `pos` of `tr.doc`: after it when they name a file paragraph (as an
 * imported object stands), anchored to it; before it otherwise (a new object
 * is laid out from the block after it).
 */
function putBackBy(tr: Transaction, pos: number, nodes: readonly ProseMirrorNode[]): boolean {
  if (!nodes.length) return false;
  const $pos = tr.doc.resolve(Math.max(0, Math.min(pos, tr.doc.content.size)));
  let depth = $pos.depth;
  while (depth > 0 && !$pos.node(depth).isTextblock) depth -= 1;
  if (depth < 1) return false;
  const paragraph = $pos.node(depth);
  const parent = $pos.node(depth - 1);
  if (parent.type.name !== "pageBlock" && parent.type.name !== "doc") return false;
  const named = nodes.filter((node) => namedParagraph(node) !== null).map((node) => anchoredTo(node, paragraph));
  const fresh = nodes.filter((node) => namedParagraph(node) === null);
  const after = $pos.after(depth);
  const before = $pos.before(depth);
  if (named.length) tr.insert(after, named);
  if (fresh.length) tr.insert(before, fresh);
  return true;
}

const floatAnchorsKey = new PluginKey("floatAnchorsFollowParagraphs");

/** The step's deleted range, for a step that deletes. */
function deletedRange(step: unknown): { from: number; to: number } | null {
  // A wrap, lift or attribute change (ReplaceAroundStep) keeps the content.
  if (!(step instanceof ReplaceStep)) return null;
  const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
  if (from >= to) return null;
  // A node put back in its own place (an identity or attribute pass rewriting
  // a block) is no deletion of it.
  if (slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount > 0 && slice.content.firstChild!.isBlock) return null;
  return { from, to };
}

/** The transaction that makes `tr`'s deletions keep Word's anchors, or null. */
function anchorsAfter(transactions: readonly Transaction[], newState: EditorState): Transaction | null {
  const out = newState.tr;
  const maps = transactions.flatMap((tr) => tr.mapping.maps);
  let index = 0;
  const removals: Array<{ pos: number; size: number; node: ProseMirrorNode }> = [];
  const restores: Array<{ at: number; nodes: ProseMirrorNode[] }> = [];
  for (const tr of transactions) {
    tr.steps.forEach((step, own) => {
      const at = index + own;
      const range = deletedRange(step);
      const doc = tr.docs[own];
      if (!range || !doc) return;
      const { go, stay } = floatsOfDeletion(doc, range.from, range.to);
      const later = maps.slice(at + 1);
      for (const block of go) {
        let pos = block.pos;
        let gone = false;
        // Through this step and the rest: an object another step already took is gone.
        for (const map of [maps[at]!, ...later]) {
          const result = map.mapResult(pos, 1);
          if (result.deleted) { gone = true; break; }
          pos = result.pos;
        }
        if (!gone) removals.push({ pos, size: block.node.nodeSize, node: block.node });
      }
      if (stay.length) {
        // Where the deletion closed up: the text block the join left.
        let pos = maps[at]!.map(range.from, -1);
        for (const map of later) pos = map.map(pos, -1);
        restores.push({ at: pos, nodes: stay.map((block) => block.node) });
      }
    });
    index += tr.steps.length;
  }
  if (!removals.length && !restores.length) return null;
  // Removals from the end, each checked to still be that object.
  for (const removal of [...removals].sort((a, b) => b.pos - a.pos)) {
    const node = out.doc.nodeAt(removal.pos);
    if (node && node.type === removal.node.type && node.nodeSize === removal.size) out.delete(removal.pos, removal.pos + removal.size);
  }
  for (const restore of restores.sort((a, b) => b.at - a.at)) putBackBy(out, out.mapping.map(restore.at, -1), restore.nodes);
  return out.docChanged ? out : null;
}

/**
 * Backspace at the start of a paragraph (`dir` -1), or Delete at its end
 * (+1), with floating objects' blocks between it and the paragraph it joins:
 * the two paragraphs join and the objects stay, anchored to the merged
 * paragraph (case 2). Null when this is not that case.
 */
export function joinAcrossFloats(state: EditorState, dir: -1 | 1): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const $at = selection.$from;
  const block = $at.parent;
  if (!block.isTextblock || $at.depth < 1) return null;
  if (dir < 0 ? $at.parentOffset !== 0 : $at.parentOffset !== block.content.size) return null;
  const blocks = bodyBlocks(state.doc);
  const index = blocks.findIndex((entry) => entry.pos === $at.before());
  if (index < 0) return null;
  const floats: Block[] = [];
  let other = index + dir;
  while (other >= 0 && other < blocks.length && isAnchoredFloatBlock(blocks[other]!.node) && blocks[other]!.parent === blocks[index]!.parent) {
    floats.push(blocks[other]!);
    other += dir;
  }
  const partner = blocks[other];
  if (!floats.length || !partner || partner.parent !== blocks[index]!.parent || !partner.node.isTextblock) return null;
  const second = dir < 0 ? blocks[index]! : partner;
  const objects = (dir < 0 ? [...floats].reverse() : floats).map((entry) => entry.node);
  const tr = state.tr;
  const from = Math.min(...floats.map((entry) => entry.pos));
  const to = Math.max(...floats.map((entry) => entry.end));
  tr.delete(from, to);
  const joinAt = tr.mapping.map(second.pos);
  if (!canJoin(tr.doc, joinAt)) return null;
  tr.join(joinAt);
  const caret = joinAt - 1;
  const mark = tr.mapping.maps.length;
  putBackBy(tr, caret, objects);
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.slice(mark).map(caret)));
  return tr.scrollIntoView();
}

/**
 * The floating objects a paste put in [from, to) of `tr.doc` whose own
 * paragraph is no longer in the document (cut with it): anchored to the
 * paragraph the pasted words they came with now stand in, the text block
 * before them, as Word's anchor goes with the words. A copy whose paragraph
 * still stands is left as a copy.
 */
function anchorPastedFloats(tr: Transaction, from: number, to: number): void {
  const blocks = bodyBlocks(tr.doc);
  const paragraphs = new Set(blocks.map((block) => ownParagraph(block.node)).filter((own): own is string => own !== null));
  // The blocks the range touches, and the objects standing right after them.
  let last = -1;
  blocks.forEach((block, index) => {
    if (block.pos < to && block.end > from) last = index;
  });
  while (last >= 0 && last + 1 < blocks.length && isAnchoredFloatBlock(blocks[last + 1]!.node)) last += 1;
  blocks.forEach((block, index) => {
    if (index > last || block.end <= from || !isAnchoredFloatBlock(block.node)) return;
    const named = namedParagraph(block.node);
    if (!named || paragraphs.has(named)) return;
    let at = index - 1;
    while (at >= 0 && isAnchoredFloatBlock(blocks[at]!.node)) at -= 1;
    const host = at >= 0 && blocks[at]!.node.isTextblock ? ownParagraph(blocks[at]!.node) : null;
    if (!host) return;
    const node = block.node;
    tr.setNodeMarkup(tr.mapping.map(block.pos), undefined, {
      ...node.attrs,
      source: { ...(node.attrs.source as Record<string, unknown>), hostAnchor: host },
    }, node.marks);
  });
}

/** Where each join of two text blocks the transactions made now stands (in the last transaction's document). */
function joinPoints(transactions: readonly Transaction[]): number[] {
  const maps = transactions.flatMap((tr) => tr.mapping.maps);
  const points: number[] = [];
  let index = 0;
  for (const tr of transactions) {
    tr.steps.forEach((step, own) => {
      const range = deletedRange(step);
      const doc = tr.docs[own];
      if (!range || !doc || range.to > doc.content.size) return;
      const $from = doc.resolve(range.from);
      const $to = doc.resolve(range.to);
      if ($from.parent === $to.parent || !$from.parent.isTextblock || !$to.parent.isTextblock) return;
      let pos = range.from;
      for (const map of maps.slice(index + own)) pos = map.map(pos, -1);
      points.push(pos);
    });
    index += tr.steps.length;
  }
  return points;
}

/** The copied slice with the floating objects a whole paragraph of it takes, and without the ones it does not. */
function copiedWithAnchors(slice: Slice, view: EditorView): Slice {
  const { from, to, empty } = view.state.selection;
  if (empty) return slice;
  const { go, stay } = floatsOfDeletion(view.state.doc, from, to);
  if (!go.length && !stay.length) return slice;
  const dropped = new Set(stay.map((block) => block.node));
  const added = go.map((block) => block.node);
  let placed = false;
  const rewrite = (fragment: Fragment): Fragment => {
    const children: ProseMirrorNode[] = [];
    fragment.forEach((child) => {
      if (dropped.has(child)) return;
      if (child.type.name === "pageBlock") {
        children.push(child.copy(rewrite(child.content)));
        return;
      }
      children.push(child);
      if (!placed && child.isTextblock && added.length) {
        children.push(...added);
        placed = true;
      }
    });
    return Fragment.from(children);
  };
  const content = rewrite(slice.content);
  return new Slice(content, slice.openStart, slice.openEnd);
}

export const FloatAnchorsFollowParagraphs = Extension.create({
  name: "floatAnchorsFollowParagraphs",
  // Before the keymap's Backspace / Delete, which would delete the object's
  // block as the "node before" and join nothing.
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (dir: -1 | 1) => () => {
      const { state, view } = this.editor;
      if (isSuggestingActive(state)) return false;
      const tr = joinAcrossFloats(state, dir);
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    };
    return { Backspace: run(-1), Delete: run(1) };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: floatAnchorsKey,
        props: {
          transformCopied: (slice, view) => (isSuggestingActive(view.state) ? slice : copiedWithAnchors(slice, view)),
        },
        appendTransaction(transactions, oldState, newState) {
          // Another client's change (the room), Undo/Redo and this plugin's own already hold the objects as written.
          if (
            !transactions.some((tr) => tr.docChanged) ||
            isSuggestingActive(oldState) ||
            transactions.some(
              (tr) =>
                tr.getMeta("y-sync$") !== undefined ||
                tr.getMeta("history$") !== undefined ||
                tr.getMeta(floatAnchorsKey) !== undefined ||
                // A plugin's own pass (identities, pagination), not the user's edit.
                tr.getMeta("appendedTransaction") !== undefined ||
                tr.getMeta("addToHistory") === false,
            )
          ) {
            return null;
          }
          // Only an edit of the selection's text: a deletion the user made
          // through a range (Delete, Backspace, Cut, typing or pasting over
          // it, a drag). A command that removes an object itself, with the
          // object selected, is not an edit of a paragraph.
          const selection = oldState.selection;
          const edited =
            !selection.empty &&
            !(selection instanceof NodeSelection) &&
            transactions.some((tr) => tr.steps.some((step) => {
              const range = deletedRange(step);
              // ProseMirror deletes a range as whole nodes where it can: a
              // selection from a paragraph's start through its mark is the
              // deletion of that paragraph node, a little narrower than it.
              return range !== null && range.from < selection.to && range.to > selection.from;
            }));
          const tr = (edited ? anchorsAfter(transactions, newState) : null) ?? newState.tr;
          const pasted = transactions.some((each) => ["paste", "drop"].includes(each.getMeta("uiEvent") as string));
          if (pasted) {
            let from = selection.from;
            let to = selection.to;
            for (const each of transactions) {
              from = each.mapping.map(from, -1);
              to = each.mapping.map(to, 1);
            }
            anchorPastedFloats(tr, tr.mapping.map(from, -1), tr.mapping.map(to, 1));
          }
          // A join (one paragraph's mark gone, the next one's words on it):
          // the objects of the paragraph that went stay, anchored to the
          // merged one (a Backspace at a paragraph's start whose previous
          // paragraph has no object between them, the common case).
          for (const at of joinPoints(transactions)) anchorPastedFloats(tr, tr.mapping.map(at, -1), tr.mapping.map(at, 1));
          if (!tr.docChanged) return null;
          tr.setMeta(floatAnchorsKey, true);
          return tr;
        },
      }),
    ];
  },
});
