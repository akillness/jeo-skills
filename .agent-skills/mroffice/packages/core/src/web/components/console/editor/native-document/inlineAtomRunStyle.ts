/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  Mapping,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  type Step,
  type StepMap,
} from "@tiptap/pm/transform";

import { normalizeDocumentShapeRunStyle } from "../../../../lib/document-shape-text-runs";
import {
  fontSizeToPx,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeTextColor,
} from "../extensions/TextStyling";

import { imeSafeAppendTransaction } from "./imeCompositionGuard";
import { trustReadOnlyDocumentMutation } from "./readOnlyTransactionAuthority";
import {
  carriesInlineAtomRunStyle,
  RUN_STYLE_INLINE_ATOM_NAMES,
} from "./inlineAtomText";





























export const INLINE_ATOM_RUN_STYLE_ATTR = "runStyle";

/** Set on the plugin's own transactions. */
export const INLINE_ATOM_RUN_STYLE_META = "inlineAtomRunStyleMirror";

export type InlineAtomRunStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  /** Font > Superscript / Subscript (`w:vertAlign`): an EndNote citation's
   * result raised small above the line (corpus R366-D13). */
  superscript?: boolean;
  subscript?: boolean;
};

/** The editor marks that carry the run-style vocabulary. */
const VOCABULARY_MARKS: ReadonlySet<string> = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "fontSize",
  "fontFamily",
  "textColor",
  "superscript",
  "subscript",
]);




const BASELINE_MARKS: ReadonlySet<string> = new Set(["superscript", "subscript"]);

/** `window.__docsAtomBaselineOff = true` draws a field's result on the line
 * whatever its runStyle states (the reading before), for an A/B of one build. */
function atomBaselineOff(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { __docsAtomBaselineOff?: boolean }).__docsAtomBaselineOff === true;
}

const MAX_ENCODED_RUN_STYLE = 1024;

/** The atom's run style in canonical form, `null` for none. */
export function normalizeInlineAtomRunStyle(value: unknown): InlineAtomRunStyle | null {
  if (value === null || value === undefined) return null;
  const style = normalizeDocumentShapeRunStyle(value);
  return style ? (style as InlineAtomRunStyle) : null;
}

/** What the atom's marks state, in the run-style vocabulary. */
export function inlineAtomRunStyleFromMarks(marks: readonly Mark[]): InlineAtomRunStyle | null {
  const raw: Record<string, unknown> = {};
  for (const mark of marks) {
    const attrs = mark.attrs as Record<string, unknown>;
    switch (mark.type.name) {
      case "bold":
      case "italic":
        // undefined/true: on; false: Word's explicit off; null: inherit.
        if (attrs.value === false) raw[mark.type.name] = false;
        else if (attrs.value !== null) raw[mark.type.name] = true;
        break;
      case "underline":
      case "strike":
        raw[mark.type.name] = true;
        break;
      case "fontSize": {
        const px = fontSizeToPx(normalizeFontSize(attrs.size));
        if (px !== null) raw.fontSize = px;
        break;
      }
      case "fontFamily": {
        const family = normalizeFontFamily(attrs.family);
        if (family) raw.fontFamily = family;
        break;
      }
      case "textColor": {
        const color = normalizeTextColor(attrs.color);
        if (color) raw.color = color;
        break;
      }
      case "superscript":
      case "subscript":
        if (!atomBaselineOff()) raw[mark.type.name] = true;
        break;
    }
  }
  return normalizeInlineAtomRunStyle(raw);
}

function stateMarks(schema: Schema, style: InlineAtomRunStyle): Mark[] {
  const out: Mark[] = [];
  const add = (name: string, attrs?: Record<string, unknown>) => {
    const type = schema.marks[name];
    if (type) out.push(type.create(attrs));
  };
  // A runStyle's "on" is the atom's look -- its own w:b / w:i or its style's
  // (the reading states both, corpus R93-D24) -- so the mark is the plain one
  // a text run of that look carries, not a stated override: text typed right
  // after the atom takes these marks, and an override "on" is written as the
  // run's own w:i even where the paragraph's style gives it (corpus R492-D79
  // E60: words typed after a caption's SEQ number gained a direct italic in the
  // italic Caption style). `false` stays Word's explicit off.
  if (style.bold !== undefined) add("bold", style.bold ? undefined : { value: false });
  if (style.italic !== undefined) add("italic", style.italic ? undefined : { value: false });
  if (style.underline === true) add("underline");
  if (style.strike === true) add("strike");
  if (style.fontSize !== undefined) {
    const size = normalizeFontSize(`${style.fontSize}px`);
    if (size) add("fontSize", { size });
  }
  if (style.fontFamily !== undefined) {
    const family = normalizeFontFamily(style.fontFamily);
    if (family) add("fontFamily", { family });
  }
  if (style.color !== undefined) {
    const color = normalizeTextColor(style.color);
    if (color) add("textColor", { color });
  }
  if (!atomBaselineOff()) {
    if (style.superscript === true) add("superscript");
    else if (style.subscript === true) add("subscript");
  }
  return out;
}

/**
 * The atom's marks with the vocabulary marks replaced by what `style` states.
 * A value no editor mark can hold (a size outside the Font Size range) stays
 * in the attribute only.
 */
export function inlineAtomMarksFromRunStyle(
  schema: Schema,
  style: InlineAtomRunStyle | null,
  current: readonly Mark[],
  parent: ProseMirrorNode,
): readonly Mark[] {
  let marks: readonly Mark[] = current.filter(
    (mark) => !VOCABULARY_MARKS.has(mark.type.name) || BASELINE_MARKS.has(mark.type.name),
  );
  if (!style) return marks;
  for (const mark of stateMarks(schema, style)) {
    if (parent.type.allowsMarkType(mark.type)) marks = mark.addToSet(marks);
  }
  return marks;
}

export function inlineAtomRunStylesEqual(
  left: InlineAtomRunStyle | null,
  right: InlineAtomRunStyle | null,
): boolean {
  if (left === null || right === null) return left === right;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key as keyof InlineAtomRunStyle] !== right[key as keyof InlineAtomRunStyle]) {
      return false;
    }
  }
  return true;
}

function storedStyleIsCanonical(value: unknown, style: InlineAtomRunStyle | null): boolean {
  if (value === null || value === undefined) return style === null;
  return (
    style !== null &&
    typeof value === "object" &&
    inlineAtomRunStylesEqual(value as InlineAtomRunStyle, style) &&
    Object.keys(value).length === Object.keys(style).length
  );
}

function stepIsVocabularyMarkStep(step: Step): boolean {
  if (
    step instanceof AddMarkStep ||
    step instanceof RemoveMarkStep ||
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep
  ) {
    return VOCABULARY_MARKS.has(step.mark.type.name);
  }
  return false;
}

/** The ranges of the step's result document a step wrote to. */
function stepRanges(step: Step): Array<[number, number]> {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    return [[step.from, step.to]];
  }
  if (
    step instanceof AddNodeMarkStep ||
    step instanceof RemoveNodeMarkStep ||
    step instanceof AttrStep
  ) {
    return [[step.pos, step.pos + 1]];
  }
  const ranges: Array<[number, number]> = [];
  step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    if (newEnd > newStart) ranges.push([newStart, newEnd]);
  });
  return ranges;
}

type Direction = "marks" | "attrs";

/**
 * Every text-bearing atom the transactions wrote to, at its position in
 * `doc`, with the direction its two representations reconcile in.
 */
function touchedAtoms(
  transactions: readonly Transaction[],
  doc: ProseMirrorNode,
): Map<number, Direction> {
  const steps: Step[] = [];
  const maps: StepMap[] = [];
  for (const transaction of transactions) {
    transaction.steps.forEach((step, index) => {
      steps.push(step);
      maps.push(transaction.mapping.maps[index]);
    });
  }
  const touched = new Map<number, Direction>();
  const size = doc.content.size;
  steps.forEach((step, index) => {
    const direction: Direction = stepIsVocabularyMarkStep(step) ? "marks" : "attrs";
    const later = new Mapping(maps.slice(index + 1));
    for (const [rawFrom, rawTo] of stepRanges(step)) {
      const from = Math.max(0, later.map(rawFrom, -1));
      const to = Math.min(size, later.map(rawTo, 1));
      if (to <= from) continue;
      doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return true;
        if (carriesInlineAtomRunStyle(node) && touched.get(pos) !== "marks") {
          touched.set(pos, direction);
        }
        return false;
      });
    }
  });
  return touched;
}

/**
 * The transaction that makes every touched atom's marks and `runStyle` say
 * the same thing, or `null` when they already do.
 */
export function reconcileInlineAtomRunStyles(
  transactions: readonly Transaction[],
  tr: Transaction,
): Transaction | null {
  return reconcileAtoms(tr, touchedAtoms(transactions, tr.doc));
}

/**
 * The same for every atom of the document, the attribute stating the truth:
 * a document an editor is created with arrives in no transaction.
 */
export function reconcileDocumentInlineAtomRunStyles(tr: Transaction): Transaction | null {
  const atoms = new Map<number, Direction>();
  tr.doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    if (carriesInlineAtomRunStyle(node)) atoms.set(pos, "attrs");
    return false;
  });
  return reconcileAtoms(tr, atoms);
}

function reconcileAtoms(tr: Transaction, touched: Map<number, Direction>): Transaction | null {
  const doc = tr.doc;
  if (!touched.size) return null;
  for (const [pos, direction] of [...touched].sort((a, b) => a[0] - b[0])) {
    const node = tr.doc.nodeAt(pos);
    if (!node || !carriesInlineAtomRunStyle(node)) continue;
    const stored = node.attrs[INLINE_ATOM_RUN_STYLE_ATTR];
    const attrStyle = normalizeInlineAtomRunStyle(stored);
    const markStyle = inlineAtomRunStyleFromMarks(node.marks);
    if (direction === "marks" || attrStyle === null) {
      // The user's command changed the marks, or the atom has no attribute
      // yet: the attribute takes what the marks say.
      if (storedStyleIsCanonical(stored, markStyle)) continue;
      tr.setNodeAttribute(pos, INLINE_ATOM_RUN_STYLE_ATTR, markStyle);
      continue;
    }
    if (inlineAtomRunStylesEqual(markStyle, attrStyle)) continue;
    const parent = tr.doc.resolve(pos).parent;
    const marks = inlineAtomMarksFromRunStyle(doc.type.schema, attrStyle, node.marks, parent);
    if (!sameMarkSet(marks, node.marks)) {
      tr.setNodeMarkup(pos, undefined, node.attrs, marks);
    }
  }
  if (!tr.docChanged) return null;
  return tr.setMeta(INLINE_ATOM_RUN_STYLE_META, true);
}

function sameMarkSet(left: readonly Mark[], right: readonly Mark[]): boolean {
  return left.length === right.length && left.every((mark, index) => mark.eq(right[index]));
}

export const inlineAtomRunStyleKey = new PluginKey("inlineAtomRunStyle");

export const DocumentInlineAtomRunStyle = Extension.create({
  name: "documentInlineAtomRunStyle",
  onCreate({ editor }) {
    const tr = reconcileDocumentInlineAtomRunStyles(editor.state.tr);
    if (!tr) return;
    // A representation sync, not an edit: no Undo step, and a read-only
    // viewer still sees the atom drawn in its own format.
    trustReadOnlyDocumentMutation(tr, "layout-normalization");
    if (editor.state.storedMarks) tr.setStoredMarks(editor.state.storedMarks);
    editor.view.dispatch(tr);
  },
  addGlobalAttributes() {
    return [
      {
        types: [...RUN_STYLE_INLINE_ATOM_NAMES],
        attributes: {
          [INLINE_ATOM_RUN_STYLE_ATTR]: {
            default: null,
            // Rich copy and paste keep the atom's own formatting even where
            // the receiving editor does not read the mark spans around it.
            parseHTML: (element: HTMLElement) => {
              const encoded = element.getAttribute("data-run-style");
              if (!encoded || encoded.length > MAX_ENCODED_RUN_STYLE) return null;
              try {
                return normalizeInlineAtomRunStyle(JSON.parse(encoded));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const style = normalizeInlineAtomRunStyle(attrs[INLINE_ATOM_RUN_STYLE_ATTR]);
              return style ? { "data-run-style": JSON.stringify(style) } : {};
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: inlineAtomRunStyleKey,
        // Never while an IME composes (a mark write would redraw the
        // composing line). A composition inserts text, not atoms; an atom a
        // skipped batch did touch is reconciled the next time one touches it.
        // ProseMirror never hands a plugin its own appended transaction, so
        // the reconcile cannot feed itself.
        appendTransaction: imeSafeAppendTransaction((transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const tr = reconcileInlineAtomRunStyles(transactions, newState.tr);
          // A document loaded while the editor is read-only (a Word page's
          // first layout settling, a viewer): the sync is a representation's,
          // as onCreate's, and the read-only authority refused it untrusted --
          // the atoms kept their runStyle but drew without its marks (a bold
          // coloured REF field result drawn plain, its line measured
          
          if (tr && !editor.isEditable) trustReadOnlyDocumentMutation(tr, "layout-normalization");
          return tr;
        }),
      }),
    ];
  },
});
