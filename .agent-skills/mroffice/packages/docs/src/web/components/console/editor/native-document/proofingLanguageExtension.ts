"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import type {
  Mark as ProseMirrorMark,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

export const PROOFING_LANGUAGE_MARK = "proofingLanguage";

const LANGUAGE_TAG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/;

export interface ProofingLanguageValue {
  readonly val: string | null;
  readonly eastAsia: string | null;
  readonly bidi: string | null;
  readonly noProof: boolean;
}

export interface DocumentProofingLanguageTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
  readonly from: number;
  readonly to: number;
  /**
   * The selection's setting. A slot the runs disagree on reads as unset:
   * the language slots are null when `mixed`, noProof is false when
   * `noProofMixed`.
   */
  readonly value: ProofingLanguageValue | null;
  /** The runs are set in different languages (Word lists the language blank). */
  readonly mixed: boolean;
  



  readonly noProofMixed: boolean;
}

function normalizeLanguageTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 64 && LANGUAGE_TAG_RE.test(normalized)
    ? normalized
    : null;
}

export function normalizeProofingLanguageValue(
  value: Partial<ProofingLanguageValue> | null | undefined,
): ProofingLanguageValue {
  return {
    val: normalizeLanguageTag(value?.val),
    eastAsia: normalizeLanguageTag(value?.eastAsia),
    bidi: normalizeLanguageTag(value?.bidi),
    noProof: value?.noProof === true,
  };
}

function markValue(mark: ProseMirrorMark | null | undefined): ProofingLanguageValue {
  return normalizeProofingLanguageValue(
    mark
      ? {
          val: mark.attrs.val,
          eastAsia: mark.attrs.eastAsia,
          bidi: mark.attrs.bidi,
          noProof: mark.attrs.noProof,
        }
      : null,
  );
}

function sameLanguage(
  left: ProofingLanguageValue,
  right: ProofingLanguageValue,
): boolean {
  return (
    left.val === right.val &&
    left.eastAsia === right.eastAsia &&
    left.bidi === right.bidi
  );
}

function sameValue(
  left: ProofingLanguageValue,
  right: ProofingLanguageValue,
): boolean {
  return sameLanguage(left, right) && left.noProof === right.noProof;
}

function wordRangeAtCaret(editor: Editor): { from: number; to: number } | null {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) return null;
  const text = $from.parent.textBetween(
    0,
    $from.parent.content.size,
    "\ufffc",
    "\ufffc",
  );
  const offset = Math.min($from.parentOffset, text.length);
  const wordCharacter = /^[\p{L}\p{N}\p{M}_'-]$/u;
  // Walk whole code points: a supplementary-plane letter (U+20BB7 𠮷) is two
  // UTF-16 units, neither of which is a letter on its own.
  const codePointAfter = (index: number): string => {
    if (index >= text.length) return "";
    return String.fromCodePoint(text.codePointAt(index) ?? 0);
  };
  const codePointBefore = (index: number): string => {
    if (index <= 0) return "";
    const low = text.charCodeAt(index - 1);
    if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
      const high = text.charCodeAt(index - 2);
      if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
    }
    return text[index - 1] ?? "";
  };
  const isWord = (character: string) =>
    character !== "" && wordCharacter.test(character);
  let start = offset;
  let end = offset;
  while (isWord(codePointBefore(start))) start -= codePointBefore(start).length;
  while (isWord(codePointAfter(end))) end += codePointAfter(end).length;
  if (start >= end) return null;
  const parentStart = $from.start();
  return { from: parentStart + start, to: parentStart + end };
}

export function readDocumentProofingLanguageTarget(
  editor: Editor | null,
): DocumentProofingLanguageTarget | null {
  if (!editor?.isEditable) return null;
  const { state } = editor;
  const range = state.selection.empty
    ? wordRangeAtCaret(editor)
    : { from: state.selection.from, to: state.selection.to };
  const markType = state.schema.marks[PROOFING_LANGUAGE_MARK];
  if (!markType) return null;
  if (!range && state.selection.empty && state.selection.$from.parent.isTextblock) {
    // Word sets a language at a bare caret too (an empty line, a space):
    // what is typed there next is in it.
    const at = state.selection.from;
    const value = markValue(
      markType.isInSet(state.storedMarks ?? state.selection.$from.marks()),
    );
    return {
      doc: state.doc,
      selection: state.selection,
      from: at,
      to: at,
      value,
      mixed: false,
      noProofMixed: false,
    };
  }
  if (!range || range.from >= range.to) return null;

  let first: ProofingLanguageValue | null = null;
  let mixed = false;
  let noProofMixed = false;
  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText) return;
    const value = markValue(markType.isInSet(node.marks));
    if (first === null) {
      first = value;
      return;
    }
    if (!sameLanguage(first, value)) mixed = true;
    if (first.noProof !== value.noProof) noProofMixed = true;
  });
  const seen = first as ProofingLanguageValue | null;
  if (seen === null) return null;
  return {
    doc: state.doc,
    selection: state.selection,
    from: range.from,
    to: range.to,
    value: {
      val: mixed ? null : seen.val,
      eastAsia: mixed ? null : seen.eastAsia,
      bidi: mixed ? null : seen.bidi,
      noProof: noProofMixed ? false : seen.noProof,
    },
    mixed,
    noProofMixed,
  };
}

export function setDocumentProofingLanguage(
  editor: Editor,
  target: DocumentProofingLanguageTarget,
  requested: Partial<ProofingLanguageValue> | null,
  options: {
    





    preserveLanguages?: boolean;
    



    preserveNoProof?: boolean;
  } = {},
): boolean {
  if (
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    !editor.state.selection.eq(target.selection) ||
    target.from < 0 ||
    target.to > editor.state.doc.content.size ||
    target.from > target.to
  ) {
    return false;
  }
  const markType = editor.state.schema.marks[PROOFING_LANGUAGE_MARK];
  if (!markType) return false;
  if (target.from === target.to) {
    // A caret: the language is the one the next typed text takes.
    const next = normalizeProofingLanguageValue(requested);
    const transaction = editor.state.tr.removeStoredMark(markType);
    if (next.val || next.eastAsia || next.bidi || next.noProof) {
      transaction.addStoredMark(markType.create(next));
    }
    editor.view.dispatch(transaction);
    return true;
  }
  if (options.preserveLanguages || options.preserveNoProof) {
    const requestedValue = normalizeProofingLanguageValue(requested);
    const transaction = editor.state.tr;
    editor.state.doc.nodesBetween(target.from, target.to, (node, pos) => {
      if (!node.isText) return true;
      const from = Math.max(pos, target.from);
      const to = Math.min(pos + node.nodeSize, target.to);
      if (from >= to) return false;
      const existing = node.marks.find((mark) => mark.type === markType);
      const current = markValue(existing);
      const language = options.preserveLanguages ? current : requestedValue;
      const value = {
        val: language.val,
        eastAsia: language.eastAsia,
        bidi: language.bidi,
        noProof: options.preserveNoProof ? current.noProof : requestedValue.noProof,
      };
      if (sameValue(current, value)) return false;
      transaction.removeMark(from, to, markType);
      if (value.val || value.eastAsia || value.bidi || value.noProof) {
        transaction.addMark(from, to, markType.create(value));
      }
      return false;
    });
    if (transaction.docChanged) editor.view.dispatch(transaction);
    return true;
  }
  const next = normalizeProofingLanguageValue(requested);
  if (!target.mixed && !target.noProofMixed && target.value && sameValue(target.value, next))
    return true;

  const transaction = editor.state.tr.removeMark(
    target.from,
    target.to,
    markType,
  );
  if (next.val || next.eastAsia || next.bidi || next.noProof) {
    transaction.addMark(target.from, target.to, markType.create(next));
  }
  editor.view.dispatch(transaction);
  return true;
}

export const DocumentProofingLanguage = Mark.create({
  name: PROOFING_LANGUAGE_MARK,

  addAttributes() {
    return {
      val: { default: null },
      eastAsia: { default: null },
      bidi: { default: null },
      noProof: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-proofing-language]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          return normalizeProofingLanguageValue({
            val: element.dataset.proofingLanguage || null,
            eastAsia: element.dataset.proofingLanguageEastAsia || null,
            bidi: element.dataset.proofingLanguageBidi || null,
            noProof: element.dataset.proofingNoProof === "true",
          });
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const value = normalizeProofingLanguageValue({
      val: HTMLAttributes.val,
      eastAsia: HTMLAttributes.eastAsia,
      bidi: HTMLAttributes.bidi,
      noProof: HTMLAttributes.noProof,
    });
    // Word's "Do not check spelling or grammar" silences the browser's
    // checker too. No `lang` attribute: nearly every imported run carries a
    // w:lang, and `lang` would move CJK glyph fallback and line breaking.
    return [
      "span",
      mergeAttributes({
        "data-proofing-language": value.val ?? "",
        "data-proofing-language-east-asia": value.eastAsia ?? "",
        "data-proofing-language-bidi": value.bidi ?? "",
        "data-proofing-no-proof": value.noProof ? "true" : "false",
        ...(value.noProof ? { spellcheck: "false" } : {}),
      }),
      0,
    ];
  },
});
