/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A text block's text between two positions, as `doc.textBetween(from, to, "",
 * leafText)` reads it, from one walk of the block.
 *
 * textBetween walks each level's children from the first to find the ones in
 * range: the document's sheets, the sheet's blocks, the paragraph's runs. The
 * auto line spacing pass asks it four or five times for each run of a
 * paragraph (the run's text, whether a run of spaces is alone on its line,
 * the character before a break): R461-D71's code listings (~3,500 runs a
 * paragraph) spent 5.7 s of a print's layout in textBetween there. Inside a
 * text block every character, and every leaf, stands at one position, and
 * textBetween(from, to) is those at from <= position < to in order: the block
 * is read once, and a range is a search and a slice.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface BlockTextReader {
  /** `doc.textBetween(from, to, "", leafText)`, for a range inside the block's content. */
  between(from: number, to: number, leafText: (leaf: ProseMirrorNode) => string): string;
  /** `doc.textBetween(from, to, "", "")`: a leaf reads as its spec's leafText, or nothing. */
  plain(from: number, to: number): string;
}

const specLeafText = (leaf: ProseMirrorNode): string => {
  const read = leaf.type.spec.leafText;
  return read ? read(leaf) : "";
};

export function blockTextReader(block: ProseMirrorNode, contentStart: number): BlockTextReader {
  const positions: number[] = [];
  const leafAt: number[] = [];
  const leaves: ProseMirrorNode[] = [];
  let text = "";
  block.descendants((node, offset) => {
    const pos = contentStart + offset;
    if (node.isText) {
      const own = node.text ?? "";
      for (let index = 0; index < own.length; index += 1) positions.push(pos + index);
      text += own;
    } else if (node.isLeaf) {
      leafAt.push(positions.length);
      leaves.push(node);
      positions.push(pos);
      text += "\u0001";
    }
    return true;
  });
  const end = contentStart + block.content.size;
  /** The index of the first character at or after `pos`. */
  const indexAt = (pos: number): number => {
    let low = 0, high = positions.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (positions[middle]! < pos) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const between = (from: number, to: number, leafText: (leaf: ProseMirrorNode) => string): string => {
    if (from < contentStart || to > end) throw new RangeError(`blockTextReader: ${from}-${to} outside ${contentStart}-${end}`);
    if (to <= from) return "";
    const first = indexAt(from), last = indexAt(to);
    let leaf = firstLeafFrom(first);
    if (leaf >= leafAt.length || leafAt[leaf]! >= last) return text.slice(first, last);
    let out = "", at = first;
    for (; leaf < leafAt.length && leafAt[leaf]! < last; leaf += 1) {
      out += text.slice(at, leafAt[leaf]) + leafText(leaves[leaf]!);
      at = leafAt[leaf]! + 1;
    }
    return out + text.slice(at, last);
  };
  /** The first leaf at or after character `index`. */
  const firstLeafFrom = (index: number): number => {
    let low = 0, high = leafAt.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (leafAt[middle]! < index) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return { between, plain: (from, to) => between(from, to, specLeafText) };
}
