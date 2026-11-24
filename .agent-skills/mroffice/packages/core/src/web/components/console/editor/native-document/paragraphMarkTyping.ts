/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  IME_COMPOSITION_SETTLED_META,
  imeSafeAppendTransaction,
} from "./imeCompositionGuard";

/**
 * Text typed into a paragraph that holds none takes the paragraph mark's
 * formatting in Word (ECMA-376 17.3.1.29): the paragraph's style chain plus
 * the mark's own `w:pPr/w:rPr`. The import hands that formatting to a blank
 * paragraph as `paragraphMarkMarks`, the marks the imported file's own runs
 * would carry in that formatting, and the save writes the typed run with the
 * mark's run properties when the typed text still has exactly those marks.
 *
 * The editor side, three parts:
 *  - a caret in such a blank paragraph types with those marks (stored marks,
 *    so the toolbar shows the formatting typing will get, as Word does);
 *  - text that still arrives there without marks (inserted by a transaction
 *    that also moved the caret, or pasted as plain text) takes them;
 *  - once the paragraph holds text it is no longer a blank line: its blank
 *    state (`paragraphMarkMarks`, and `paragraphFontSize`, the height of that
 *    one empty line) ends, exactly as a projection of the saved file reads it.
 *    Should the paragraph become blank again in this session, the blank
 *    state it had comes back, so typing and deleting changes nothing.
 */
export const PARAGRAPH_MARK_MARKS_ATTR = "paragraphMarkMarks";
const BLANK_LINE_SIZE_ATTR = "paragraphFontSize";
const MAX_MARKS = 64;

/**
 * The projection's layout-blank rule reads text with Python's `str.strip()`:
 * a paragraph holding only these characters is still one blank line.
 */
const BLANK_LINE_TEXT =
  /^[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/;

type MarkJson = { type: string; attrs?: Record<string, unknown> };

export function normalizeParagraphMarkMarks(raw: unknown): MarkJson[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MARKS) return null;
  const marks: MarkJson[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const { type, attrs } = entry as Record<string, unknown>;
    if (typeof type !== "string" || !type) return null;
    if (attrs !== undefined && (!attrs || typeof attrs !== "object" || Array.isArray(attrs))) {
      return null;
    }
    marks.push(attrs === undefined ? { type } : { type, attrs: attrs as Record<string, unknown> });
  }
  return marks;
}

/** The marks, or null when any of them is not one this editor has. */
function blankParagraphMarks(schema: Schema, raw: unknown): readonly Mark[] | null {
  const value = normalizeParagraphMarkMarks(raw);
  if (!value) return null;
  try {
    return value.reduce<readonly Mark[]>(
      (set, json) => schema.markFromJSON(json).addToSet(set),
      Mark.none,
    );
  } catch {
    return null;
  }
}

/**
 * Inline nodes the projection does not count as a line's content: a break,
 * a bookmark or permission point, Word's page-break hint.
 */
const NO_CONTENT_INLINE = new Set(["hardBreak", "bookmarkPoint", "rangePermission", "sourcePageBreak"]);

function isBlankLine(block: ProseMirrorNode): boolean {
  if (!BLANK_LINE_TEXT.test(block.textContent)) return false;
  // An inline atom shows content of its own though it adds no text here: a
  // field's result, a picture, an equation (FIXQUEUE W39, corpus R397-D23
  // walk: a table of authorities inserted into a blank cell paragraph kept
  // its blank-line size, which a projection of the saved file never reads).
  let blank = true;
  block.forEach((child) => {
    if (!blank || child.isText || NO_CONTENT_INLINE.has(child.type.name)) return;
    if (child.type.name === "documentField" && !String(child.attrs.cachedValue ?? "").trim()) return;
    blank = false;
  });
  return blank;
}

type Remembered = { pos: number; blockId: string; attrs: Record<string, unknown> };
type Touched = { pos: number; heldText: boolean };

const paragraphMarkTypingKey = new PluginKey<Remembered[]>("paragraphMarkTyping");
const REMEMBER_META = "paragraphMarkTypingRemember";
const BLOCK_ID_ATTR = "block_id";

/**
 * Every textblock the steps of these transactions touched, at its position in
 * the last document, with whether it held text before the first step that
 * touched it.
 */
function touchedTextblocks(transactions: readonly Transaction[]): Map<number, boolean> {
  let touched: Touched[] = [];
  for (const tr of transactions) {
    touched = touched.flatMap((entry) => {
      const mapped = tr.mapping.mapResult(entry.pos, 1);
      return mapped.deleted ? [] : [{ ...entry, pos: mapped.pos }];
    });
    if (!tr.docChanged || tr.getMeta("y-sync$") !== undefined) continue;
    tr.steps.forEach((step, index) => {
      const doc = tr.docs[index];
      const rest = tr.mapping.slice(index);
      step.getMap().forEach((oldStart, oldEnd) => {
        for (const at of [oldStart, oldEnd]) {
          if (at < 0 || at > doc.content.size) continue;
          const $at = doc.resolve(at);
          if ($at.depth === 0 || !$at.parent.isTextblock) continue;
          const mapped = rest.mapResult($at.before(), 1);
          if (mapped.deleted) continue;
          touched.push({ pos: mapped.pos, heldText: $at.parent.textContent.length > 0 });
        }
      });
    });
  }
  const byPos = new Map<number, boolean>();
  for (const entry of touched) {
    if (!byPos.has(entry.pos)) byPos.set(entry.pos, entry.heldText);
  }
  return byPos;
}

function blankStateParagraphs(doc: ProseMirrorNode, into: Map<number, boolean>): void {
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.attrs[PARAGRAPH_MARK_MARKS_ATTR] != null && !into.has(pos)) into.set(pos, true);
    return false;
  });
}

export function paragraphMarkTypingPlugin(): Plugin<Remembered[]> {
  return new Plugin<Remembered[]>({
    key: paragraphMarkTypingKey,
    state: {
      init: () => [],
      apply(tr, remembered, _oldState, newState) {
        const change = tr.getMeta(REMEMBER_META) as
          | { add: Remembered[]; drop: number[] }
          | undefined;
        const kept = remembered.flatMap((entry) => {
          const mapped = tr.mapping.mapResult(entry.pos, 1);
          if (mapped.deleted || change?.drop.includes(mapped.pos)) return [];
          const node = newState.doc.nodeAt(mapped.pos);
          if (
            !node?.isTextblock ||
            node.attrs[BLOCK_ID_ATTR] !== entry.blockId ||
            // Undo (or anything else) gave the paragraph its blank state back.
            node.attrs[PARAGRAPH_MARK_MARKS_ATTR] != null
          ) {
            return [];
          }
          return [{ ...entry, pos: mapped.pos }];
        });
        return change ? [...kept, ...change.add] : kept;
      },
    },
    appendTransaction: imeSafeAppendTransaction((transactions, oldState, newState) => {
      const settled = transactions.some(
        (item) => item.getMeta(IME_COMPOSITION_SETTLED_META) !== undefined,
      );
      const tr = newState.tr;
      const add: Remembered[] = [];
      const drop: number[] = [];
      const touched = transactions.some((item) => item.docChanged)
        ? touchedTextblocks(transactions)
        : new Map<number, boolean>();
      // The settled wake-up of an IME carries no steps: read the document.
      if (settled) blankStateParagraphs(newState.doc, touched);
      const remembered = paragraphMarkTypingKey.getState(newState) ?? [];
      // An explicit empty typing style (formatting cleared) is the user's.
      const typingStyleCleared = oldState.storedMarks?.length === 0;
      for (const [pos, heldText] of touched) {
        const block = tr.doc.nodeAt(pos);
        if (!block?.isTextblock) continue;
        const raw = block.attrs[PARAGRAPH_MARK_MARKS_ATTR];
        if (raw == null) {
          // Blank again: the blank line it was comes back.
          const entry = remembered.find((item) => item.pos === pos);
          if (entry && block.attrs[BLOCK_ID_ATTR] === entry.blockId && isBlankLine(block)) {
            tr.setNodeMarkup(pos, undefined, { ...block.attrs, ...entry.attrs });
            drop.push(pos);
          }
          continue;
        }
        const marks = heldText || typingStyleCleared
          ? null
          : blankParagraphMarks(newState.schema, raw);
        if (marks) {
          // Text that reached the blank paragraph without the caret's marks
          // (the caret moved in the same transaction, plain-text paste): the
          // paragraph mark's formatting, as Word gives it.
          block.forEach((child, offset) => {
            if (!child.isText || child.marks.length) return;
            const from = pos + 1 + offset;
            for (const mark of marks) tr.addMark(from, from + child.nodeSize, mark);
          });
        }
        if (isBlankLine(block)) continue;
        const blockId = block.attrs[BLOCK_ID_ATTR];
        if (typeof blockId === "string" && blockId) {
          add.push({
            pos,
            blockId,
            attrs: {
              [PARAGRAPH_MARK_MARKS_ATTR]: raw,
              [BLANK_LINE_SIZE_ATTR]: block.attrs[BLANK_LINE_SIZE_ATTR] ?? null,
            },
          });
        }
        tr.setNodeMarkup(pos, undefined, {
          ...block.attrs,
          [PARAGRAPH_MARK_MARKS_ATTR]: null,
          [BLANK_LINE_SIZE_ATTR]: null,
        });
      }
      // Ending a blank state is not a formatting change: typing keeps the
      // style it had.
      if (tr.docChanged && newState.storedMarks) tr.setStoredMarks(newState.storedMarks);
      if (add.length || drop.length) tr.setMeta(REMEMBER_META, { add, drop });

      // A caret in a blank paragraph types in its paragraph mark's formatting.
      let typingStyle = false;
      const { selection } = tr;
      if (
        newState.storedMarks === null &&
        selection instanceof TextSelection &&
        selection.empty &&
        selection.$from.parent.isTextblock &&
        selection.$from.parent.textContent.length === 0 &&
        transactions.some((item) => item.selectionSet || item.docChanged)
      ) {
        const marks = blankParagraphMarks(
          newState.schema,
          selection.$from.parent.attrs[PARAGRAPH_MARK_MARKS_ATTR],
        );
        if (marks) {
          tr.setStoredMarks(marks);
          typingStyle = true;
        }
      }
      return tr.docChanged || typingStyle ? tr : null;
    }),
  });
}
