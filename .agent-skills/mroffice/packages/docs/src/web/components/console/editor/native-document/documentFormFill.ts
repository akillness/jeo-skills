/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Filling in a form: moving field to field, clearing every field, and the
 * check a form's required fields pass before it is submitted.
 *
 * Word moves between a protected form's fields with Tab and Shift+Tab
 * (Restrict Editing > Filling in forms), selecting the next field's
 * contents; the Forms tab's Previous Field / Next Field do the same at any
 * time. Clear Fields empties every field back onto its placeholder (a check
 * box unchecked). Submit checks the required fields (`required`, MRAI's own
 * setting, `document_docx_form_fields.py`): an empty one -- a text, list or
 * date field showing its placeholder, an unchecked check box, an option
 * group with no option chosen -- is marked and the first is selected.
 */

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  CONTENT_CONTROL_MARK_NAME,
  isContentControlFillLocked,
  sanitizeControlKey,
} from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import {
  collectContentControlRanges,
  replaceControlText,
  setCheckboxOrOptionState,
  type ContentControlRange,
} from "./contentControlExtension";
import { effectiveDocumentProtection, isDocumentFormsProtected } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";

/** A control a form is filled in through (not a gallery block such as a
 *  manual table of contents, not a picture). */
export function isFormFieldRange(range: ContentControlRange): boolean {
  return !range.meta.docPartGallery && range.meta.controlType !== "picture";
}

export function formFieldRanges(doc: ProseMirrorNode): ContentControlRange[] {
  return collectContentControlRanges(doc).filter(isFormFieldRange);
}

/** The field after (or before) `pos`, wrapping round as Word's Tab does. */
export function adjacentFormField(
  doc: ProseMirrorNode,
  pos: number,
  direction: 1 | -1,
): ContentControlRange | null {
  const fields = formFieldRanges(doc).filter((range) => !isContentControlFillLocked(range.meta.lock));
  if (!fields.length) return null;
  const current = fields.findIndex((range) => range.from <= pos && pos <= range.to);
  if (current >= 0) return fields[(current + direction + fields.length) % fields.length]!;
  if (direction === 1) return fields.find((range) => range.from > pos) ?? fields[0]!;
  return [...fields].reverse().find((range) => range.to < pos) ?? fields[fields.length - 1]!;
}

/** Whether a field holds no answer. */
function fieldIsEmpty(doc: ProseMirrorNode, range: ContentControlRange): boolean {
  if (range.meta.controlType === "checkbox") return !range.meta.checked;
  if (range.meta.placeholder) return true;
  return doc.textBetween(range.from, range.to, "", "").trim() === "";
}

export interface MissingFormField {
  readonly from: number;
  readonly to: number;
  readonly key: string;
  readonly label: string;
}

/** The required fields with no answer, in document order. An option group
 *  counts once, at its first option, and is answered by any checked one. */
export function missingRequiredFormFields(doc: ProseMirrorNode): MissingFormField[] {
  const fields = formFieldRanges(doc);
  const answeredGroups = new Set(
    fields
      .filter((range) => range.meta.radioGroup && range.meta.checked)
      .map((range) => range.meta.radioGroup),
  );
  const groupRequired = new Set(
    fields.filter((range) => range.meta.radioGroup && range.meta.required).map((range) => range.meta.radioGroup),
  );
  const reportedGroups = new Set<string>();
  const out: MissingFormField[] = [];
  for (const range of fields) {
    const group = range.meta.radioGroup;
    if (group) {
      if (!groupRequired.has(group) || answeredGroups.has(group) || reportedGroups.has(group)) continue;
      reportedGroups.add(group);
    } else if (!range.meta.required || !fieldIsEmpty(doc, range)) {
      continue;
    }
    out.push({
      from: range.from,
      to: range.to,
      key: sanitizeControlKey(range.mark.attrs.controlKey) ?? `${range.from}`,
      label: range.meta.alias || range.meta.tag || group || doc.textBetween(range.from, range.to, " ", " ").trim(),
    });
  }
  return out;
}

/** Every unlocked field emptied onto its placeholder, a check box unchecked. */
export function clearFormFieldsTransaction(state: EditorState): Transaction | null {
  const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
  if (!markType) return null;
  const tr = state.tr;
  const keys = formFieldRanges(state.doc)
    .filter((range) => !isContentControlFillLocked(range.meta.lock))
    .map((range) => sanitizeControlKey(range.mark.attrs.controlKey) ?? "");
  let changed = false;
  for (const key of keys) {
    // Found again in the document the previous field's change left.
    const range = formFieldRanges(tr.doc).find(
      (candidate) => (sanitizeControlKey(candidate.mark.attrs.controlKey) ?? "") === key,
    );
    if (!range) continue;
    if (range.meta.controlType === "checkbox") {
      if (!range.meta.checked) continue;
      setCheckboxOrOptionState(tr, markType, range, false);
      changed = true;
      continue;
    }
    if (range.meta.placeholder) continue;
    replaceControlText(tr, markType, range, "", range.meta.controlType === "date" ? { dateFullDate: "" } : {});
    changed = true;
  }
  return changed ? tr : null;
}

// ---------------------------------------------------------------------------
// The missing required fields, marked until each is filled.

export const formFillPluginKey = new PluginKey<DecorationSet>("documentFormFill");
const SET_MISSING = "documentFormFill:setMissing";

function missingDecorations(doc: ProseMirrorNode, missing: readonly MissingFormField[]): DecorationSet {
  return DecorationSet.create(
    doc,
    missing.map((field) =>
      Decoration.inline(field.from, field.to, {
        class: "mrnote-content-control--missing",
        "data-form-field-missing": "true",
      }),
    ),
  );
}

export interface FormFillCommandsStorage {
  readonly marked: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentFormFill: {
      /** Next Field / Previous Field: the field's contents selected. */
      goToFormField: (direction: 1 | -1) => ReturnType;
      /** Clear Fields: every field back onto its placeholder. */
      clearFormFields: () => ReturnType;
      /** Mark the required fields still empty (none: the marks go). */
      markMissingFormFields: (missing: readonly MissingFormField[]) => ReturnType;
    };
  }
}

function selectField(tr: Transaction, range: ContentControlRange): Transaction {
  const from = Math.min(range.from, tr.doc.content.size);
  const to = Math.min(range.to, tr.doc.content.size);
  return tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView();
}

export const DocumentFormFill = Extension.create({
  name: "documentFormFill",

  addCommands() {
    return {
      goToFormField:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const target = adjacentFormField(state.doc, direction === 1 ? state.selection.to : state.selection.from, direction);
          if (!target) return false;
          if (dispatch) dispatch(selectField(tr, target));
          return true;
        },
      clearFormFields:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false;
          const tr = clearFormFieldsTransaction(state);
          if (!tr) return false;
          if (dispatch) dispatch(tr.setMeta(SET_MISSING, []));
          return true;
        },
      markMissingFormFields:
        (missing) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(SET_MISSING, missing);
            tr.setMeta("addToHistory", false);
            if (missing[0]) {
              const first = missing[0];
              tr.setSelection(TextSelection.create(tr.doc, first.from, first.to)).scrollIntoView();
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    // Word: in a document protected for filling in forms, Tab and Shift+Tab
    // move between the fields.
    const move = (editor: Editor, direction: 1 | -1) =>
      isDocumentFormsProtected(effectiveDocumentProtection(editor.state.doc.attrs?.documentProtection)) &&
      editor.commands.goToFormField(direction);
    return {
      Tab: ({ editor }) => move(editor, 1),
      "Shift-Tab": ({ editor }) => move(editor, -1),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: formFillPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _old, state) {
            const missing = tr.getMeta(SET_MISSING) as readonly MissingFormField[] | undefined;
            if (missing) return missing.length ? missingDecorations(tr.doc, missing) : DecorationSet.empty;
            if (set === DecorationSet.empty || !tr.docChanged) return set.map(tr.mapping, tr.doc);
            // A field filled in loses its mark; the others keep theirs.
            const still = new Set(missingRequiredFormFields(state.doc).map((field) => `${field.from}:${field.to}`));
            const mapped = set.map(tr.mapping, tr.doc);
            return DecorationSet.create(
              tr.doc,
              mapped.find().filter((decoration) => still.has(`${decoration.from}:${decoration.to}`)),
            );
          },
        },
        props: {
          decorations: (state) => formFillPluginKey.getState(state),
        },
      }),
    ];
  },
});
