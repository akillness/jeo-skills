/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { IndentCharacterUnits } from "@mrnote/core/web/components/console/editor/native-document/preciseIndent.ts";
import type { ChainedCommands } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { ParagraphTextAlignment } from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import type { TocOutlineLevelValue } from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";

/**
 * Home > Paragraph buttons whose logic is more than one editor command. The
 * ribbon and the AI's editor commands (lib/editor-commands/document) both
 * call these on a chain whose selection is the paragraphs to format.
 */

export type ParagraphDialogAlignment = "left" | "center" | "right" | "justify" | "distribute";

/** Line spacing as the Paragraph dialog sets it. */
export type ParagraphDialogLineSpacing =
  /** At least / Exactly a number of points. */
  | { rule: "atLeast" | "exact"; points: string | number }
  /** A multiple of single spacing ("1", "1.5", "2", "1.15" ...); null is the default. */
  | { rule: "multiple"; multiple: string | null };

/**
 * The OK of Word's Paragraph dialog: only the fields given are written, in
 * ONE undo step. Indents are points; a negative first-line indent hangs.
 */
export interface ParagraphDialogChanges {
  align?: ParagraphDialogAlignment;
  /** All three indents at once (a dialog opened without a record of its fields). */
  indents?: { left: number | null; right: number | null; firstLine: number | null };
  indentLeftPt?: number | null;
  indentRightPt?: number | null;
  /** Positive: first line; negative: hanging; null: none. */
  firstLineIndentPt?: number | null;
  /**
   * A first line stated in characters (Word's w:firstLineChars, the
   * paragraph's own text size): replaces `firstLineIndentPt`.
   */
  textIndent?: number | null;
  /** Left / right / hanging indents stated in characters (w:leftChars...). */
  indentCharacterUnits?: IndentCharacterUnits | null;
  /** Points as typed; null (or "") removes the paragraph's own value. */
  spaceBefore?: string | number | null;
  spaceAfter?: string | number | null;
  outlineLevel?: TocOutlineLevelValue;
  pageBreakBefore?: boolean;
  lineSpacing?: ParagraphDialogLineSpacing;
  widowControl?: boolean;
  contextualSpacing?: boolean;
  keepNext?: boolean;
  keepLines?: boolean;
  suppressLineNumbers?: boolean;
  suppressAutoHyphens?: boolean;
  snapToGrid?: boolean | null;
  wordWrap?: boolean | null;
  kinsoku?: boolean | null;
  overflowPunct?: boolean | null;
  topLinePunct?: boolean | null;
  textAlignment?: ParagraphTextAlignment | null;
  adjustRightInd?: boolean | null;
  mirrorIndents?: boolean | null;
  autoSpaceDE?: boolean | null;
  autoSpaceDN?: boolean | null;
}

function spacingValue(value: string | number | null): string | number | null {
  return value === null || (typeof value === "string" && value.trim() === "") ? null : value;
}

export function queueParagraphDialogChanges(
  chain: ChainedCommands,
  changes: ParagraphDialogChanges,
): ChainedCommands {
  if (changes.align !== undefined) chain.setTextAlign(changes.align);
  if (changes.indents !== undefined) {
    chain.setParagraphIndents({
      indentLeftPt: changes.indents.left,
      indentRightPt: changes.indents.right,
      firstLineIndentPt: changes.indents.firstLine,
    });
  }
  if (changes.indentLeftPt !== undefined) chain.setIndentLeftPt(changes.indentLeftPt);
  if (changes.indentRightPt !== undefined) chain.setIndentRightPt(changes.indentRightPt);
  if (changes.firstLineIndentPt !== undefined) chain.setFirstLineIndentPt(changes.firstLineIndentPt);
  // After the points: setFirstLineIndentPt clears the character first line.
  if (changes.textIndent !== undefined) chain.setTextIndent(changes.textIndent);
  if (changes.indentCharacterUnits !== undefined) {
    chain.setIndentCharacterUnits(changes.indentCharacterUnits);
  }
  if (changes.spaceBefore !== undefined) chain.setSpaceBefore(spacingValue(changes.spaceBefore));
  if (changes.spaceAfter !== undefined) chain.setSpaceAfter(spacingValue(changes.spaceAfter));
  // An unchanged "Body Text" is the paragraph's default, not an override:
  
  if (changes.outlineLevel !== undefined) chain.setTocOutlineLevel(changes.outlineLevel);
  if (changes.pageBreakBefore !== undefined) chain.setPageBreakBefore(changes.pageBreakBefore);
  const spacing = changes.lineSpacing;
  if (spacing !== undefined) {
    if (spacing.rule !== "multiple") {
      chain.setAbsoluteLineHeight(spacing.points, spacing.rule);
    } else if (spacing.multiple === null) {
      chain.unsetLineHeight();
    } else {
      chain.setLineHeight(spacing.multiple);
    }
  }
  if (changes.widowControl !== undefined) chain.setWidowControl(changes.widowControl);
  if (changes.contextualSpacing !== undefined) chain.setContextualSpacing(changes.contextualSpacing);
  if (changes.keepNext !== undefined) chain.setKeepNext(changes.keepNext);
  if (changes.keepLines !== undefined) chain.setKeepLines(changes.keepLines);
  if (changes.suppressLineNumbers !== undefined) chain.setSuppressLineNumbers(changes.suppressLineNumbers);
  if (changes.suppressAutoHyphens !== undefined) chain.setSuppressAutoHyphens(changes.suppressAutoHyphens);
  if (changes.snapToGrid !== undefined) chain.setSnapToGrid(changes.snapToGrid);
  if (changes.wordWrap !== undefined) chain.setWordWrap(changes.wordWrap);
  if (changes.kinsoku !== undefined) chain.setKinsoku(changes.kinsoku);
  if (changes.overflowPunct !== undefined) chain.setOverflowPunctuation(changes.overflowPunct);
  if (changes.topLinePunct !== undefined) chain.setTopLinePunctuation(changes.topLinePunct);
  if (changes.textAlignment !== undefined) chain.setParagraphTextAlignment(changes.textAlignment);
  if (changes.adjustRightInd !== undefined) chain.setAdjustRightIndent(changes.adjustRightInd);
  if (changes.mirrorIndents !== undefined) chain.setMirrorIndents(changes.mirrorIndents);
  if (changes.autoSpaceDE !== undefined) chain.setAutoSpaceDE(changes.autoSpaceDE);
  if (changes.autoSpaceDN !== undefined) chain.setAutoSpaceDN(changes.autoSpaceDN);
  return chain;
}

/**
 * Home > Paragraph Shading: one colour behind the whole of every selected
 * paragraph (null: No Color), its own Undo step.
 */
export function queueParagraphShading(chain: ChainedCommands, color: string | null): ChainedCommands {
  return chain
    .command(({ tr }) => {
      closeHistory(tr);
      return true;
    })
    .setParagraphShading(color);
}
