"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { NodeType } from "@tiptap/pm/model";
import {
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { findWrapping } from "@tiptap/pm/transform";

import { getAutoCorrectSettings } from "./autoCorrectSettings";
import { isAnyImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  listStyleTypeForDefinition,
  presetListDefinition,
  withNumberFormat,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { isListParagraphParent } from "@mrnote/core/web/components/console/editor/native-document/listParagraphSpacing.ts";



























/** The marker, directly followed by text that does not continue a number. */
const ENTER_NUMBER_MARKER = /^1([.)、])(?=[^\s\d])/u;

export interface EnterAutoNumberPlan {
  /** Position before the paragraph that starts with the marker. */
  paragraphPos: number;
  /** Length of the typed marker ("1." = 2). */
  markerLength: number;
  /** The character after the number: ".", ")" or "、". */
  suffix: string;
}

/**
 * The Enter about to be pressed in `state` numbers its paragraph (null when
 * it does not): a plain paragraph outside any list whose text starts with
 * "1." / "1)" / "1、" and text, the caret after that text's first character.
 */
export function planEnterAutoNumber(
  state: EditorState,
): EnterAutoNumberPlan | null {
  const { selection, schema } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (!schema.nodes.orderedList || !schema.nodes.listItem) return null;
  const $cursor = selection.$from;
  const paragraph = $cursor.parent;
  if (paragraph.type.name !== "paragraph" || $cursor.depth < 1) return null;
  if (isListParagraphParent($cursor.node($cursor.depth - 1))) return null;
  // The marker is typed text at the very start of the paragraph.
  if (!paragraph.firstChild?.isText) return null;
  const text = paragraph.textContent;
  const match = ENTER_NUMBER_MARKER.exec(text);
  if (!match || text.includes("\t")) return null;
  const markerLength = match[0].length;
  if ($cursor.parentOffset <= markerLength) return null;
  return {
    paragraphPos: $cursor.before(),
    markerLength,
    suffix: match[1],
  };
}

function orderedListAttrs(
  listType: NodeType,
  suffix: string,
): Record<string, unknown> | null {
  if (suffix === ".") return null;
  // "1)" and "1、" number as Word's typed format does: the list's own level
  // text, as Define New Number Format writes it.
  if (!("listDefinition" in (listType.spec.attrs ?? {}))) return null;
  const definition = withNumberFormat(presetListDefinition("decimal"), 0, {
    format: "decimal",
    prefix: "",
    suffix,
    align: "left",
  });
  return definition
    ? { listDefinition: definition, listStyleType: listStyleTypeForDefinition(definition) }
    : null;
}

/**
 * The conversion, on the state right after Enter split the planned paragraph:
 * remove the typed marker and make the paragraph and the new one (where the
 * caret now is) items 1 and 2 of a new numbered list. Null when the split did
 * not leave them as neighbours.
 */
export function enterAutoNumberTransaction(
  state: EditorState,
  plan: EnterAutoNumberPlan,
): Transaction | null {
  const { doc, selection, schema } = state;
  const listType = schema.nodes.orderedList;
  const first = doc.nodeAt(plan.paragraphPos);
  if (!listType || !first || first.type.name !== "paragraph") return null;
  if (!ENTER_NUMBER_MARKER.test(first.textContent)) return null;
  const secondPos = plan.paragraphPos + first.nodeSize;
  const $second = doc.resolve(secondPos);
  const second = $second.nodeAfter;
  if (!second || second.type.name !== "paragraph") return null;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (selection.from <= secondPos || selection.from >= secondPos + second.nodeSize) return null;

  const tr = state.tr;
  const contentStart = plan.paragraphPos + 1;
  tr.delete(contentStart, contentStart + plan.markerLength);
  const secondAfterDelete = tr.mapping.map(secondPos);
  const range = tr.doc
    .resolve(contentStart)
    .blockRange(tr.doc.resolve(secondAfterDelete + 1));
  const wrapping =
    range && findWrapping(range, listType, orderedListAttrs(listType, plan.suffix));
  if (!range || !wrapping) return null;
  tr.wrap(range, wrapping);
  // One item around both paragraphs; the item splits between them.
  tr.split(tr.mapping.slice(1).map(secondAfterDelete), 1);
  // Both are list paragraphs now, with List Paragraph's spacing as the
  // Numbering button gives it (an explicit "off" from older documents is
  // cleared, see listParagraphSpacing.ts).
  for (const pos of [plan.paragraphPos, secondPos]) {
    const at = tr.mapping.map(pos, 1);
    const node = tr.doc.nodeAt(at);
    if (node?.type.name === "paragraph" && node.attrs.contextualSpacing === false) {
      tr.setNodeAttribute(at, "contextualSpacing", null);
    }
  }
  return tr;
}

/** A suggestion popup (slash commands, links) owns Enter while it is open. */
function suggestionOpen(state: EditorState): boolean {
  return state.plugins.some((plugin) => {
    const value = plugin.getState(state) as { active?: unknown; range?: unknown } | undefined;
    return Boolean(value && typeof value === "object" && value.active === true && value.range);
  });
}

export const DocumentListAutoFormat = Extension.create({
  name: "documentListAutoFormat",
  // Ahead of the base keymap's and the page's Enter, which split the
  // paragraph this runs itself.
  priority: 101,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isEditable || isAnyImeCompositionActive()) return false;
        // Automatic numbered lists (AutoFormat As You Type).
        if (!getAutoCorrectSettings().automaticNumberedLists) return false;
        const plan = planEnterAutoNumber(editor.state);
        if (!plan || suggestionOpen(editor.state)) return false;
        // The Enter itself, as the base keymap runs it on a non-empty
        // paragraph: one step, grouped with the typing before it.
        if (!editor.commands.splitBlock()) return false;
        const tr = enterAutoNumberTransaction(editor.state, plan);
        // The AutoFormat is an Undo step of its own, as in Word.
        if (tr) editor.view.dispatch(closeHistory(tr));
        return true;
      },
    };
  },
});

export default DocumentListAutoFormat;
