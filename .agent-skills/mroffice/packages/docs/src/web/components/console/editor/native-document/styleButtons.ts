/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ChainedCommands, Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { inheritedBoldValue } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { inheritedItalicValue } from "@mrnote/core/web/components/console/editor/native-document/italicExtension.ts";
import { applyDocumentParagraphTypography } from "@mrnote/core/web/components/console/editor/documentStyleGallery.ts";
import {
  ensureStableNamedStyleIds,
  type NamedStyleDefinition,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { normalizeLineHeight } from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import { setSelectedTextBlockTypePreservingAttrs } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { formatPainterSourceAt } from "./formatPainter";
import { readPreciseIndents } from "@mrnote/core/web/components/console/editor/native-document/preciseIndent.ts";
import { PARAGRAPH_MARK_MARKS_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paragraphMarkTyping.ts";
import {
  blankParagraphMarkSpecs,
  dropCustomStyleToggleMarks,
  isImportedNamedStyleDefinition,
  namedStyleMarkSpecs,
  removeNamedStyle,
  resolveNamedStyle,
  upsertNamedStyle,
} from "@mrnote/core/web/components/console/editor/native-document/paragraphStyles.ts";

/**
 * Home > Styles gallery buttons for the document's own (named) styles. The
 * ribbon and the AI's editor commands both call these; `chain` makes a fresh
 * command chain on the selection to style.
 */

type StyleChain = ChainedCommands & { [name: string]: (...args: never[]) => StyleChain };

/**
 * The old paragraph style's bold and italic leave with it. An imported run
 * whose bold or italic came from its paragraph style carries a bare mark
 * (no `value`: the reader's effective format), where a direct format states
 * `value: true`. Applying Normal over "Audit Inherited Bold" kept the style's
 * bold on the words (WUA 150); Word draws them regular, and keeps only the
 * direct bold. Runs inside each paragraph the selection touches, before the
 * paragraph takes its new style. Mutates `tr`.
 */
function dropOldStyleToggleMarks(tr: Transaction): void {
  const { from, to } = tr.selection;
  const docAttrs = tr.doc.attrs as Record<string, unknown>;
  const toggles = [
    ["bold", inheritedBoldValue],
    ["italic", inheritedItalicValue],
  ] as const;
  const removals: Array<{ from: number; to: number; mark: import("@tiptap/pm/model").Mark }> = [];
  tr.doc.nodesBetween(from, Math.max(from, to), (node, pos) => {
    if (!node.isTextblock) return true;
    const styled = toggles.filter(([, inherited]) => inherited(docAttrs, node, []) === true);
    if (!styled.length) return false;
    node.forEach((child, offset) => {
      if (!child.isText) return;
      for (const [name] of styled) {
        const mark = child.marks.find((entry) => entry.type.name === name && entry.attrs.value === undefined);
        if (mark) removals.push({ from: pos + 1 + offset, to: pos + 1 + offset + child.nodeSize, mark });
      }
    });
    return false;
  });
  for (const removal of removals) tr.removeMark(removal.from, removal.to, removal.mark);
  // …and so do the bold and italic one of the document's own styles put on
  // the words (WUA 150).
  dropCustomStyleToggleMarks(tr, from, to);
}

/** Apply one of the document's named styles to the selection. */
export function applyNamedStyleButton(
  editor: Editor,
  chain: () => ChainedCommands,
  stored: NamedStyleDefinition,
): boolean {
  // A native Word paragraph style supplies inherited/effective formatting
  // through its exact pStyle identity. Applying it must not flatten the
  // definition into direct marks or erase the user's direct overrides.
  if (isImportedNamedStyleDefinition(stored)) {
    if (stored.styleType === "character") {
      return (chain() as StyleChain).setDocxParagraphStyle(stored.styleId as never).run();
    }
    return (chain()
      .command(({ tr }) => {
        dropOldStyleToggleMarks(tr);
        return true;
      }) as StyleChain)
      .setDocxParagraphStyle(stored.styleId as never)
      .run();
  }
  // Word's "Style based on" (effective formatting) and a character
  // style, which formats the selected runs only.
  const definition = resolveNamedStyle(
    ensureStableNamedStyleIds((editor.state.doc.attrs as { namedStyles?: unknown }).namedStyles),
    stored,
  );
  if (stored.styleType === "character") {
    const runs = chain();
    if (definition.fontFamily) runs.setFontFamily(definition.fontFamily);
    if (definition.fontSize) runs.setFontSize(definition.fontSize);
    if (definition.textColor) runs.setTextColor(definition.textColor);
    if (definition.bold) runs.setMark("bold");
    if (definition.italic) runs.setMark("italic");
    if (definition.underline) runs.setMark("underline");
    return runs.run();
  }
  setSelectedTextBlockTypePreservingAttrs(editor, "paragraph");
  const chainable = chain() as StyleChain;
  chainable.command(({ tr }) => {
    dropOldStyleToggleMarks(tr);
    return true;
  });
  chainable.unsetBlockquote();
  chainable.unsetCharacterStyle();
  chainable.unsetFontFamily();
  chainable.unsetFontSize();
  chainable.unsetTextColor();
  chainable.unsetTextAlign();
  chainable.unsetLineHeight();
  chainable.setSpaceBefore(null as never);
  chainable.setSpaceAfter(null as never);
  chainable.setParagraphIndents({ indentLeftPt: null, indentRightPt: null, firstLineIndentPt: null } as never);
  if (definition.fontFamily) chainable.setFontFamily(definition.fontFamily as never);
  if (definition.fontSize) chainable.setFontSize(definition.fontSize as never);
  if (definition.textColor) chainable.setTextColor(definition.textColor as never);
  if (definition.bold) chainable.setMark("bold");
  if (definition.italic) chainable.setMark("italic");
  if (definition.underline) chainable.setMark("underline");
  if (definition.linkedCharacterStyleId) {
    chainable.setCharacterStyle(definition.linkedCharacterStyleId as never);
  }
  if (definition.textAlign) chainable.setTextAlign(definition.textAlign as never);
  if (definition.spaceBeforePt !== undefined) chainable.setSpaceBefore(definition.spaceBeforePt as never);
  if (definition.spaceAfterPt !== undefined) chainable.setSpaceAfter(definition.spaceAfterPt as never);
  if (definition.lineHeight) chainable.setLineHeight(definition.lineHeight as never);
  chainable.setParagraphIndents({
    indentLeftPt: definition.indentLeftPt ?? null,
    indentRightPt: definition.indentRightPt ?? null,
    firstLineIndentPt: definition.firstLineIndentPt ?? null,
  } as never);
  chainable.setCustomParagraphStyle(definition.name as never, definition.styleId as never);
  chainable.command(({ tr }) => applyDocumentParagraphTypography(tr, definition));
  // A blank paragraph has no run to carry the style's formatting: its mark
  // does, so text typed there later is in the style (WUA 186).
  chainable.command(({ tr }) => {
    const specs = namedStyleMarkSpecs(definition).filter((spec) => tr.doc.type.schema.marks[spec.type]);
    const stored = tr.storedMarks;
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (node.content.size === 0 && PARAGRAPH_MARK_MARKS_ATTR in node.attrs) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [PARAGRAPH_MARK_MARKS_ATTR]: blankParagraphMarkSpecs(node.attrs[PARAGRAPH_MARK_MARKS_ATTR], specs),
        });
      }
      return false;
    });
    if (stored && tr.storedMarks !== stored) tr.setStoredMarks(stored);
    return true;
  });
  return chainable.run();
}

/** The paragraph formatting a new or updated style takes from the selection. */
export interface NamedStyleParagraphAspects {
  textAlign: string;
  spaceBefore: number;
  spaceAfter: number;
  lineHeight: string | null;
  indentLeftPt: number | null;
  indentRightPt: number | null;
  firstLineIndentPt: number | null;
}

/** Word's Create New Style from Formatting / Update to Match Selection: the
 *  selection's text formatting and its paragraph's formatting. */
export function captureNamedStyleAspects(
  state: EditorState,
  paragraph: NamedStyleParagraphAspects,
): Omit<NamedStyleDefinition, "name"> {
  const $from = state.selection.$from;
  const marks = state.selection.empty
    ? $from.marks()
    : ($from.marksAcross(state.selection.$to) ?? $from.marks());
  const aspects: Omit<NamedStyleDefinition, "name"> = {};
  for (const mark of marks) {
    if (mark.type.name === "bold") aspects.bold = mark.attrs.value !== false;
    if (mark.type.name === "italic") aspects.italic = true;
    if (mark.type.name === "underline") aspects.underline = true;
    if (mark.type.name === "fontFamily" && typeof mark.attrs.family === "string") {
      aspects.fontFamily = mark.attrs.family;
    }
    if (mark.type.name === "fontSize" && typeof mark.attrs.size === "string") {
      aspects.fontSize = mark.attrs.size;
    }
    if (mark.type.name === "textColor" && typeof mark.attrs.color === "string") {
      aspects.textColor = mark.attrs.color;
    }
  }
  if (paragraph.textAlign !== "left") aspects.textAlign = paragraph.textAlign as NamedStyleDefinition["textAlign"];
  if (paragraph.spaceBefore > 0) aspects.spaceBeforePt = paragraph.spaceBefore;
  if (paragraph.spaceAfter > 0) aspects.spaceAfterPt = paragraph.spaceAfter;
  if (paragraph.lineHeight) aspects.lineHeight = paragraph.lineHeight as NamedStyleDefinition["lineHeight"];
  if (paragraph.indentLeftPt !== null) aspects.indentLeftPt = paragraph.indentLeftPt;
  if (paragraph.indentRightPt !== null) aspects.indentRightPt = paragraph.indentRightPt;
  if (paragraph.firstLineIndentPt !== null) aspects.firstLineIndentPt = paragraph.firstLineIndentPt;
  return aspects;
}

/**
 * The style gallery's Update button (Word's Update Style to Match Selection),
 * or a new style of that name: the style takes `aspects`. Returns the chain
 * that writes the palette, not run; null for an empty name.
 */
export function queueSaveNamedStyle(
  chain: ChainedCommands,
  existing: readonly NamedStyleDefinition[],
  name: string,
  aspects: Omit<NamedStyleDefinition, "name">,
): ChainedCommands | null {
  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return null;
  const current = existing.find((style) => style.name === trimmed);
  const next = upsertNamedStyle([...existing], { ...current, name: trimmed, ...aspects });
  return (chain as StyleChain).setNamedStyles(next as never);
}

/** The style gallery's Delete button: the style goes and its paragraphs
 *  return to Normal. Returns the chain, not run. */
export function queueDeleteNamedStyle(
  chain: ChainedCommands,
  existing: readonly NamedStyleDefinition[],
  name: string,
): ChainedCommands {
  const definition = existing.find((style) => style.name === name);
  const pending = chain as StyleChain;
  if (definition?.styleId) {
    pending.clearCustomParagraphStyleReferences(definition.styleId as never, definition.name as never);
  }
  pending.setNamedStyles(removeNamedStyle([...existing], name) as never);
  return pending;
}

/** The selection's paragraph as {@link captureNamedStyleAspects} reads it,
 *  straight from the document (the ribbon passes its own snapshot). */
export function namedStyleParagraphAspectsAt(editor: Editor): NamedStyleParagraphAspects {
  const source = formatPainterSourceAt(editor);
  const spacing = (value: unknown) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  };
  const indents = readPreciseIndents(source.attrs);
  return {
    textAlign: source.textAlign,
    spaceBefore: spacing(source.attrs.spaceBefore),
    spaceAfter: spacing(source.attrs.spaceAfter),
    lineHeight: normalizeLineHeight(source.attrs.lineHeight),
    indentLeftPt: indents.left,
    indentRightPt: indents.right,
    firstLineIndentPt: indents.firstLine,
  };
}
