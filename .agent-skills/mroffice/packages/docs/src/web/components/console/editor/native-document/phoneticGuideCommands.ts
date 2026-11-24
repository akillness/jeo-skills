"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The editor half of Word's Phonetic Guide dialog: which text the dialog
 * works on, and the one transaction its OK / Remove All commit.
 *
 * Word takes the selection, or with nothing selected the word at the
 * insertion point, and lists it as Base text / Ruby text rows (see
 * rubyProperties.ts for the row model and the `w:rubyPr` mapping). OK
 * rewrites that range as one `ruby` node per row with a reading and plain
 * text for every other row, in one undo step. The range stays inside one
 * paragraph and may hold only text and existing guides: a picture, a field
 * or a break in it would not survive being rewritten as readings, so the
 * dialog is not offered there.
 */

import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  Mark,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";

import {
  MAX_RUBY_BASE_LENGTH,
  MAX_RUBY_TEXT_LENGTH,
  RUBY_NODE_NAME,
  sanitizeRubyText,
} from "./rubyAnnotationExtension";
import {
  phoneticGuideSegmentsFromText,
  readDocumentRubyProperties,
  type DocumentRubyProperties,
  type PhoneticGuideSegment,
} from "./rubyProperties";

/** The longest selection the dialog lists (characters of base text). */
export const MAX_PHONETIC_GUIDE_TEXT_LENGTH = 300;

export interface PhoneticGuideTarget {
  readonly doc: ProseMirrorNode;
  readonly from: number;
  readonly to: number;
  /** The rows (and the whitespace between them) the dialog opens with. */
  readonly segments: readonly PhoneticGuideSegment[];
  /** The first existing guide's properties, else all not stated. */
  readonly properties: DocumentRubyProperties;
  /** Whether the range holds at least one guide (Remove All has work). */
  readonly hasGuides: boolean;
  /** The marks of each base character, so plain text keeps its formatting. */
  readonly marksByOffset: readonly (readonly Mark[])[];
}

interface FlatPiece {
  readonly kind: "text" | "ruby";
  readonly text: string;
  readonly rt: string;
  readonly from: number;
  readonly to: number;
  readonly marks: readonly Mark[];
  readonly node: ProseMirrorNode;
}

/** The textblock's inline content, or null when it holds anything else. */
function flatPieces(
  parent: ProseMirrorNode,
  parentStart: number,
  from: number,
  to: number,
): FlatPiece[] | null {
  const pieces: FlatPiece[] = [];
  let ok = true;
  parent.forEach((child, offset) => {
    if (!ok) return;
    const start = parentStart + offset;
    const end = start + child.nodeSize;
    if (end <= from || start >= to) return;
    if (child.isText) {
      const sliceFrom = Math.max(from, start) - start;
      const sliceTo = Math.min(to, end) - start;
      pieces.push({
        kind: "text",
        text: (child.text ?? "").slice(sliceFrom, sliceTo),
        rt: "",
        from: start + sliceFrom,
        to: start + sliceTo,
        marks: child.marks,
        node: child,
      });
      return;
    }
    if (child.type.name === RUBY_NODE_NAME) {
      pieces.push({
        kind: "ruby",
        text: sanitizeRubyText(child.attrs.base, MAX_RUBY_BASE_LENGTH),
        rt: sanitizeRubyText(child.attrs.rt, MAX_RUBY_TEXT_LENGTH),
        from: start,
        to: end,
        // A guide carries its base text's marks (bold, a link) on the node:
        // read them back, or OK on an unchanged guide rewrote it plain
        
        marks: child.marks,
        node: child,
      });
      return;
    }
    ok = false;
  });
  return ok ? pieces : null;
}

function segmentsFromPieces(pieces: readonly FlatPiece[]): PhoneticGuideSegment[] {
  const segments: PhoneticGuideSegment[] = [];
  let text = "";
  const flush = () => {
    if (text) segments.push(...phoneticGuideSegmentsFromText(text));
    text = "";
  };
  for (const piece of pieces) {
    if (piece.kind === "text") {
      text += piece.text;
      continue;
    }
    flush();
    segments.push({ kind: "row", base: piece.text, ruby: piece.rt });
  }
  flush();
  return segments;
}








const CARET_WORD_WINDOW = MAX_PHONETIC_GUIDE_TEXT_LENGTH + 1;

/** The word around a collapsed caret, as Word's dialog takes it. */
function caretWordRange(
  parent: ProseMirrorNode,
  parentStart: number,
  caret: number,
): { from: number; to: number } | null {
  const low = caret - CARET_WORD_WINDOW;
  const high = caret + CARET_WORD_WINDOW;
  // Whether text was left out before or after the window.
  let cutBefore = false;
  let cutAfter = false;
  // A map from each flattened character to its document position; a guide
  // contributes its whole base at its own position so it is never split.
  const chars: { char: string; from: number; to: number }[] = [];
  parent.forEach((child, offset) => {
    const start = parentStart + offset;
    if (start + child.nodeSize <= low) { cutBefore = true; return; }
    if (start >= high) { cutAfter = true; return; }
    if (child.isText) {
      let at = start;
      for (const char of child.text ?? "") {
        const from = at;
        at += char.length;
        if (at <= low) { cutBefore = true; continue; }
        if (from >= high) { cutAfter = true; break; }
        chars.push({ char, from, to: at });
      }
    } else if (child.type.name === RUBY_NODE_NAME) {
      const base = sanitizeRubyText(child.attrs.base, MAX_RUBY_BASE_LENGTH);
      for (const char of Array.from(base)) {
        chars.push({ char, from: start, to: start + child.nodeSize });
      }
    } else {
      chars.push({ char: "￼", from: start, to: start + child.nodeSize });
    }
  });
  if (chars.length === 0) return null;
  const text = chars.map((entry) => entry.char).join("");
  // Offsets into `text` (UTF-16) back to the entry that holds them.
  const entryAt: number[] = [];
  chars.forEach((entry, index) => {
    for (let unit = 0; unit < entry.char.length; unit += 1) entryAt.push(index);
  });
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const words: { start: number; end: number }[] = [];
  if (typeof Segmenter === "function") {
    for (const part of new Segmenter(undefined, { granularity: "word" }).segment(
      text,
    )) {
      if (part.isWordLike) {
        words.push({ start: part.index, end: part.index + part.segment.length });
      }
    }
  } else {
    const re = /[^\s￼]+/gu;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      words.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  for (const word of words) {
    const first = chars[entryAt[word.start]];
    const last = chars[entryAt[word.end - 1]];
    if (!first || !last) continue;
    if (first.from <= caret && caret <= last.to) {
      // Running into a cut edge: longer than the dialog takes.
      if ((cutBefore && word.start === 0) || (cutAfter && word.end === text.length)) return null;
      if (text.slice(word.start, word.end).includes("￼")) return null;
      return { from: first.from, to: last.to };
    }
  }
  return null;
}

/**
 * The text the Phonetic Guide dialog works on for the current selection, or
 * null when it cannot open there.
 */
export function readPhoneticGuideTarget(
  state: EditorState,
): PhoneticGuideTarget | null {
  const { selection, doc } = state;
  let from = selection.from;
  let to = selection.to;
  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const parentStart = $from.start();
  const parentEnd = parentStart + parent.content.size;
  if (to > parentEnd) return null;
  if (
    !(selection instanceof NodeSelection) &&
    selection.empty
  ) {
    const word = caretWordRange(parent, parentStart, from);
    if (!word) return null;
    from = word.from;
    to = word.to;
  }
  if (from >= to) return null;
  // A partly selected guide is taken whole: its base is one group.
  let pieces = flatPieces(parent, parentStart, from, to);
  if (!pieces || pieces.length === 0) return null;
  from = Math.min(from, pieces[0].from);
  to = Math.max(to, pieces[pieces.length - 1].to);
  pieces = flatPieces(parent, parentStart, from, to);
  if (!pieces || pieces.length === 0) return null;
  const segments = segmentsFromPieces(pieces);
  const total = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
  if (
    total === 0 ||
    total > MAX_PHONETIC_GUIDE_TEXT_LENGTH ||
    !segments.some((segment) => segment.kind === "row")
  ) {
    return null;
  }
  const firstGuide = pieces.find((piece) => piece.kind === "ruby");
  const marksByOffset: (readonly Mark[])[] = [];
  for (const piece of pieces) {
    for (let unit = 0; unit < piece.text.length; unit += 1) {
      marksByOffset.push(piece.marks);
    }
  }
  return {
    doc,
    from,
    to,
    segments,
    properties: readDocumentRubyProperties(
      firstGuide ? (firstGuide.node.attrs as Record<string, unknown>) : null,
    ),
    hasGuides: Boolean(firstGuide),
    marksByOffset,
  };
}

function textNode(
  state: EditorState,
  text: string,
  marks: readonly Mark[] | undefined,
): ProseMirrorNode {
  return state.schema.text(text, marks ? [...marks] : undefined);
}

/**
 * `text`, which starts at `offset` of the target, as text nodes that keep
 * each character's own marks (a bold B inside ABC stays bold): one node per
 * run of characters that carry the same marks.
 */
function textRuns(
  state: EditorState,
  text: string,
  offset: number,
  marksByOffset: readonly (readonly Mark[])[],
): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  let runStart = 0;
  for (let index = 1; index <= text.length; index += 1) {
    const before = marksByOffset[offset + index - 1] ?? [];
    const here = index < text.length ? (marksByOffset[offset + index] ?? []) : null;
    if (here && Mark.sameSet([...before], [...here])) continue;
    nodes.push(textNode(state, text.slice(runStart, index), before));
    runStart = index;
  }
  return nodes;
}

function commit(
  editor: Editor,
  target: PhoneticGuideTarget,
  nodes: readonly ProseMirrorNode[],
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc
  ) {
    return false;
  }
  const fragment = Fragment.fromArray([...nodes]);
  let transaction = editor.state.tr.replaceWith(target.from, target.to, fragment);
  const end = target.from + fragment.size;
  transaction = closeHistory(transaction).setSelection(
    TextSelection.create(transaction.doc, end),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/**
 * OK: rewrite the target as the dialog's rows. The rows must spell exactly
 * the target's text (Group and Mono only regroup it); anything else fails
 * closed.
 */
export function applyPhoneticGuide(
  editor: Editor,
  target: PhoneticGuideTarget,
  segments: readonly PhoneticGuideSegment[],
  properties: DocumentRubyProperties,
): boolean {
  const state = editor.state;
  const rubyType = state.schema.nodes[RUBY_NODE_NAME];
  if (!rubyType) return false;
  const spelled = segments
    .map((segment) => (segment.kind === "row" ? segment.base : segment.text))
    .join("");
  const original = segmentsSpelling(target.segments);
  if (spelled !== original) return false;
  const nodes: ProseMirrorNode[] = [];
  let offset = 0;
  for (const segment of segments) {
    const text = segment.kind === "row" ? segment.base : segment.text;
    const start = offset;
    const marks = target.marksByOffset[start];
    offset += text.length;
    if (!text) continue;
    const reading =
      segment.kind === "row"
        ? sanitizeRubyText(segment.ruby, MAX_RUBY_TEXT_LENGTH)
        : "";
    const base =
      segment.kind === "row"
        ? sanitizeRubyText(segment.base, MAX_RUBY_BASE_LENGTH)
        : "";
    if (segment.kind === "row" && reading && base === segment.base) {
      // A guide is one inline node: it keeps the marks its base text began
      // with (a link, bold) rather than none.
      nodes.push(
        rubyType.create(
          {
            base,
            rt: reading,
            align: properties.align,
            fontSize: properties.fontSize,
            baseFontSize: properties.baseFontSize,
            offset: properties.offset,
            fontFamily: properties.fontFamily,
          },
          null,
          marks ? [...marks] : undefined,
        ),
      );
      continue;
    }
    nodes.push(...textRuns(state, text, start, target.marksByOffset));
  }
  return commit(editor, target, nodes);
}

/** Remove All: every guide in the target becomes its base text again. */
export function removePhoneticGuides(
  editor: Editor,
  target: PhoneticGuideTarget,
): boolean {
  if (!target.hasGuides) return false;
  const state = editor.state;
  const nodes: ProseMirrorNode[] = [];
  let offset = 0;
  for (const segment of target.segments) {
    const text = segment.kind === "row" ? segment.base : segment.text;
    const start = offset;
    offset += text.length;
    if (text) nodes.push(...textRuns(state, text, start, target.marksByOffset));
  }
  return commit(editor, target, nodes);
}

export function segmentsSpelling(
  segments: readonly PhoneticGuideSegment[],
): string {
  return segments
    .map((segment) => (segment.kind === "row" ? segment.base : segment.text))
    .join("");
}
