/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ChainedCommands } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  DOUBLE_STRIKE_MARK,
  normalizeFontFamily,
  normalizeTextColor,
} from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import {
  OPEN_TYPE_FEATURES_MARK,
  TEXT_EFFECTS_MARK,
  type OpenTypeFeatureAttributes,
  type TextEffectAttributes,
  type TextEffectPresetValue,
} from "@mrnote/core/web/components/console/editor/extensions/TextEffects.ts";
import {
  fontDialogStyleMarks,
  type FontDialogStyle,
  type FontDialogUnderline,
} from "@mrnote/core/web/components/console/editor/native-document/DocumentFontDialogFontPage.tsx";
import { HIDDEN_TEXT_MARK } from "./hiddenTextExtension";
import {
  EMPHASIS_DOTS_MARK_NAME,
  type EmphasisDotStyle,
} from "./emphasisDotsExtension";
import { TEXT_POSITION_MARK_NAME } from "./textPositionExtension";

/**
 * Home > Font buttons whose logic is more than one editor command. The ribbon
 * and the AI's editor commands (lib/editor-commands/document) both call these
 * on a chain whose selection is the text to format; nothing here reads the
 * person's selection, a dialog's state or the DOM.
 */

/** A chain whose extension commands are typed loosely: these functions only
 *  queue commands every document editor registers. */
type FontChain = ChainedCommands & Record<string, (...args: never[]) => FontChain>;

function loose(chain: ChainedCommands): FontChain {
  return chain as FontChain;
}

/**
 * The Font box: one family for the Latin and the East Asian slots of the
 * selected runs (Word's w:ascii/w:hAnsi and w:eastAsia), or both cleared back
 * to the document default when `family` is null. Returns the chain, not run.
 */
export function queueFontFamily(chain: ChainedCommands, family: string | null): ChainedCommands {
  const normalized = family ? normalizeFontFamily(family) : null;
  const queued = loose(chain);
  if (!normalized) return queued.unsetFontFamily().unsetCjkFont();
  return queued.setFontFamily(normalized as never).setCjkFont(normalized as never);
}

/**
 * The OK of Word's Font dialog: only the fields given are written, each the
 * way the dialog writes it. Strike/double strike, small/all caps and
 * superscript/subscript exclude each other. Returns the chain, not run.
 */
export interface FontDialogChanges {
  /** Latin text font; null returns it to the document default. */
  family?: string | null;
  /** Asian text font; null makes it follow the Latin font. */
  cjkFamily?: string | null;
  style?: FontDialogStyle;
  /** CSS pixel size as the editor stores it ("16px"); null unsets it. */
  sizePx?: string | null;
  /** #rrggbb; null is Automatic. */
  color?: string | null;
  /** Automatic written as Word's direct `w:color auto`: the runs would
   *  otherwise take back a style's own colour (wordAutoTextColor.ts). */
  colorAutomaticDirect?: boolean;
  underline?: FontDialogUnderline;
  /** #rrggbb; null is Automatic. Ignored when the underline is "none". */
  underlineColor?: string | null;
  strike?: "none" | "single" | "double";
  caps?: "none" | "small" | "all";
  hidden?: boolean;
  script?: "none" | "superscript" | "subscript";
  /** Character spacing in points; null removes it. */
  spacingPt?: number | null;
  /** Character scale in percent; null removes it. */
  scalePercent?: number | null;
  /** Kerning for fonts of at least this size, in half points; null turns kerning off. */
  kerningHalfPoints?: number | null;
  /** A Text Effects preset, or "custom" with the effects in `textEffects`. */
  textEffectPreset?: TextEffectPresetValue | "custom";
  textEffects?: TextEffectAttributes;
  openType?: OpenTypeFeatureAttributes;
  /** Font > Advanced > Position in half-points (raised > 0); null is Normal. */
  positionHalfPoints?: number | null;
  /** Word's Emphasis mark (w:em); "none" removes it. */
  emphasis?: EmphasisDotStyle | "none";
}

export function queueFontDialogChanges(
  chain: ChainedCommands,
  changes: FontDialogChanges,
): ChainedCommands {
  const queued = loose(chain);
  if (changes.strike !== undefined) {
    queued.unsetMark("strike").unsetMark(DOUBLE_STRIKE_MARK);
    if (changes.strike === "double") queued.setMark(DOUBLE_STRIKE_MARK);
    else if (changes.strike === "single") queued.setMark("strike");
  }
  if (changes.hidden !== undefined) {
    queued.unsetMark(HIDDEN_TEXT_MARK);
    if (changes.hidden) queued.setMark(HIDDEN_TEXT_MARK);
  }
  if (changes.caps !== undefined) {
    queued.unsetMark("smallCaps").unsetMark("allCaps");
    if (changes.caps === "small") queued.setMark("smallCaps");
    else if (changes.caps === "all") queued.setMark("allCaps");
  }
  if (changes.spacingPt !== undefined) {
    if (changes.spacingPt === null) queued.unsetCharSpacing();
    else queued.setCharSpacing(changes.spacingPt as never);
  }
  if (changes.scalePercent !== undefined) {
    if (changes.scalePercent === null) queued.unsetCharScale();
    else queued.setCharScale(changes.scalePercent as never);
  }
  if (changes.kerningHalfPoints !== undefined) {
    if (changes.kerningHalfPoints === null) queued.unsetKerningThreshold();
    else queued.setKerningThreshold(changes.kerningHalfPoints as never);
  }
  if (changes.textEffectPreset !== undefined) {
    if (changes.textEffectPreset === "custom") {
      const effects = changes.textEffects;
      if (effects && Object.values(effects).some((value) => value !== "none")) {
        queued.setMark(TEXT_EFFECTS_MARK, { ...effects });
      } else if (effects) {
        queued.unsetMark(TEXT_EFFECTS_MARK);
      }
    } else {
      queued.setTextEffectPreset(changes.textEffectPreset as never);
    }
  }
  if (changes.openType !== undefined) {
    const features = changes.openType;
    if (
      features.numberStyle === "default" &&
      features.ligatures === "default" &&
      features.stylisticSet === "default" &&
      !features.contextualAlternates
    ) {
      queued.unsetOpenTypeFeatures();
    } else {
      queued.setMark(OPEN_TYPE_FEATURES_MARK, { ...features });
    }
  }
  if (changes.family !== undefined) {
    const family = changes.family ? normalizeFontFamily(changes.family) : null;
    if (family) queued.setFontFamily(family as never);
    else queued.unsetFontFamily();
  }
  if (changes.cjkFamily !== undefined) {
    const family = changes.cjkFamily ? normalizeFontFamily(changes.cjkFamily) : null;
    if (family) queued.setCjkFont(family as never);
    else queued.unsetCjkFont();
  }
  if (changes.style !== undefined) {
    // Regular is Word's off, not "no direct mark": where the style sets bold
    // (a heading) an explicit off is written, as the toolbar's toggle does;
    
    const marks = fontDialogStyleMarks(changes.style);
    if (marks.bold) queued.setBold();
    else queued.setBoldOff();
    if (marks.italic) queued.setItalic();
    else queued.setItalicOff();
  }
  if (changes.sizePx !== undefined) {
    if (changes.sizePx) queued.setFontSize(changes.sizePx as never);
    else queued.unsetFontSize();
  }
  if (changes.color !== undefined) {
    if (changes.color) queued.setTextColor(changes.color as never);
    else if (changes.colorAutomaticDirect) queued.setTextColorAutomatic();
    else queued.unsetTextColor();
  }
  if (changes.underline !== undefined) {
    if (changes.underline === "none") queued.unsetMark("underline");
    else queued.setMark("underline").setUnderlineStyle(changes.underline as never);
  }
  if (changes.underlineColor !== undefined && changes.underline !== "none") {
    queued.setUnderlineColor(changes.underlineColor as never);
  }
  if (changes.script !== undefined) {
    queued.unsetMark("superscript").unsetMark("subscript");
    if (changes.script === "superscript") queued.setMark("superscript");
    else if (changes.script === "subscript") queued.setMark("subscript");
  }
  if (changes.positionHalfPoints !== undefined) {
    queued.unsetMark(TEXT_POSITION_MARK_NAME);
    if (changes.positionHalfPoints) {
      queued.setMark(TEXT_POSITION_MARK_NAME, { halfPoints: changes.positionHalfPoints });
    }
  }
  if (changes.emphasis !== undefined) {
    queued.unsetMark(EMPHASIS_DOTS_MARK_NAME);
    if (changes.emphasis !== "none") {
      queued.setMark(EMPHASIS_DOTS_MARK_NAME, { style: changes.emphasis, placement: null });
    }
  }
  return queued;
}

/**
 * The Font dialog's Set As Default: the document defaults (Normal) that every
 * unstyled run inherits, the same attributes the Design tab's fonts set. Only
 * the fields given change. Returns whether anything was written to `tr`.
 */
export function setDocumentDefaultFont(
  tr: Transaction,
  defaults: { family?: string | null; sizePx?: string; color?: string | null },
): boolean {
  let changed = false;
  if (defaults.family !== undefined) {
    tr.setDocAttribute("defaultFontFamily", defaults.family ? normalizeFontFamily(defaults.family) : null);
    changed = true;
  }
  if (defaults.sizePx) {
    tr.setDocAttribute("defaultFontSize", defaults.sizePx);
    changed = true;
  }
  if (defaults.color !== undefined) {
    // Stored as the canonical lowercase #rrggbb every colour is, which the
    // document's export gate holds it to: a command given "#00B050" stored
    // it as given, and every full export of the page was refused (corpus
    // R483-D99 WALK1, invalid_native_value).
    const color = defaults.color === null ? null : normalizeTextColor(defaults.color);
    if (defaults.color === null || color !== null) {
      tr.setDocAttribute("defaultTextColor", color);
      changed = true;
    }
  }
  return changed;
}

/**
 * One mark's value over the selection as the Font dialog shows it: the value
 * every selected text run has, or `mixed` when they differ. An empty
 * selection reads the formatting typed text would take.
 */
export function selectionMarkValue<T>(
  state: EditorState,
  markName: string,
  read: (attrs: Record<string, unknown> | null) => T,
): { value: T; mixed: boolean } {
  const type = state.schema.marks[markName];
  const { from, to, empty, $from } = state.selection;
  if (!type || empty) {
    const marks = state.storedMarks ?? $from.marks();
    const mark = type ? marks.find((candidate) => candidate.type === type) : undefined;
    return { value: read(mark ? (mark.attrs as Record<string, unknown>) : null), mixed: false };
  }
  let first: { value: T; key: string } | null = null;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (mixed || !node.isText) return;
    const mark = node.marks.find((candidate) => candidate.type === type);
    const value = read(mark ? (mark.attrs as Record<string, unknown>) : null);
    const key = JSON.stringify(value);
    if (first === null) first = { value, key };
    else if (first.key !== key) mixed = true;
  });
  const found = first as { value: T; key: string } | null;
  return { value: found ? found.value : read(null), mixed };
}
