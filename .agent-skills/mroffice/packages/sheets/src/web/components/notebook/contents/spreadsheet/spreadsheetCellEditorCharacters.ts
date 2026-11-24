/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Excel formats the characters selected in the cell being edited: double-click
 * a cell, select "AB", choose a font, a size, a colour or Bold, and only "AB"
 * changes (Range.Characters; Microsoft Support, "Format text or numbers as
 * superscript or subscript": "Select characters in a cell ... that you'd like
 * to format"). A formula has no character formatting, so its entry is left to
 * the whole-cell command.
 *
 * The Home tab's font commands ask `formatSpreadsheetCellEditorCharacters`
 * first: with an entry open it formats that entry's selection (a caret sets
 * the format the next typed characters take) and returns true; with none it
 * returns null and the command formats the selected cells as before.
 *
 * `spreadsheetFormatPreviewAdapter` is the sheet's Live Preview: the selected
 * characters of a rich entry, or the selected cells as drawn.
 */

import { isShapeTextFieldFormatting } from "@mrnote/core/web/lib/document-shape-text-field-commands.ts";
import type { PresentationCellTextElement } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import {
  officeFormatPreviewCss,
  officeIsPreviewField,
  officePreviewElements,
  officePreviewFieldRange,
  officePreviewTextRange,
  officeComposePreviewRestores,
  officePreviewEquationElements,
  officeTextOffsetsRange,
  type OfficeFormatPreviewAdapter,
  type OfficeFormatPreviewCssOptions,
  type OfficeFormatPreviewPatch,
  type OfficeFormatPreviewRestore,
  officePreviewShapeTextField,
} from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";
import { officeReturnFocusAfterTextFormat } from "@mrnote/core/web/lib/office-inactive-selection.ts";
import type { RunStyle as CellRunStyle } from "@mrnote/core/web/lib/spreadsheet/cell-rich-text.ts";
import type { SpreadsheetRichDraftIntent } from "./SpreadsheetDraftInput";
import { spreadsheetCellEditorAt } from "./spreadsheetCellLookup";
import { SPREADSHEET_DEFAULT_FONT_PT, spreadsheetPtToPx, updateCellStyle, type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";

/** The run fields a Home font command writes on characters. */
export type SpreadsheetCharacterFormat = Partial<
  Pick<
    CellRunStyle,
    "bold" | "italic" | "underline" | "underlineStyle" | "strike" | "fontFamily" | "fontSize" | "color"
  >
>;

/** The open cell entry: an input, a text area or the rich editor. */
export type SpreadsheetCellEditorHost = HTMLElement &
  Partial<Pick<PresentationCellTextElement, "formatCharacters" | "characterState">> & {
    value?: string;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  };

export type SpreadsheetCharacterState = (
  key: keyof SpreadsheetCharacterFormat,
) => { value: unknown; mixed: boolean };

/**
 * A character format worked out from the selection's state. `perRun` marks
 * one a rich entry works out for each run from that run's own format (Grow /
 * Shrink Font), where a toggle is decided once for the whole selection.
 */
export type SpreadsheetCharacterFormatBuilder = ((
  state: SpreadsheetCharacterState,
) => SpreadsheetCharacterFormat | null) & { readonly perRun?: true };

/** The cell entry open at (row, col) in `root`, or null. */
export function spreadsheetCellEditorHost(
  root: ParentNode | null | undefined,
  editing: { readonly row: number; readonly col: number } | null | undefined,
): SpreadsheetCellEditorHost | null {
  if (!root || !editing) return null;
  return spreadsheetCellEditorAt<SpreadsheetCellEditorHost>(root, `${editing.row}:${editing.col}`, '[data-editing="true"]');
}

function hostIsRich(host: SpreadsheetCellEditorHost): boolean {
  return (
    typeof host.formatCharacters === "function" &&
    typeof host.characterState === "function"
  );
}

/** A formula's text takes no character format. */
function hostIsFormula(host: SpreadsheetCellEditorHost): boolean {
  return String(host.value ?? "").trimStart().startsWith("=");
}

/** The selection's state in a rich entry, characters without a format of
 * their own reading as the cell's font. */
function richCharacterState(
  host: SpreadsheetCellEditorHost,
  inherited: SpreadsheetCharacterFormat,
): SpreadsheetCharacterState {
  return (key) => {
    const current = host.characterState!(key);
    return {
      value: current.value ?? inherited[key],
      mixed: current.mixed,
    };
  };
}

/**
 * What Home's Bold / Italic / Underline / Double Underline / Strikethrough
 * show while an entry is open: Excel lights them for the characters at the
 * insertion point or selected, not for the cell. A mixed selection lights
 * none (a click turns the format on for all of it). Null for a plain entry,
 * whose characters all wear the cell's own font.
 */
export interface SpreadsheetCharacterPressed {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: "none" | "single" | "double";
  /** The characters' size in px, or null when they differ (the box goes
   * blank, as Excel's does over a mixed selection). */
  fontSize: number | null;
  /** The characters' font: null when they differ, undefined when they wear
   * the cell's own. */
  fontFamily: string | null | undefined;
}

export function spreadsheetCellEditorCharacterPressed(
  host: SpreadsheetCellEditorHost | null,
  inherited: SpreadsheetCharacterFormat,
): SpreadsheetCharacterPressed | null {
  if (!host?.isConnected || !hostIsRich(host) || hostIsFormula(host)) return null;
  const state = richCharacterState(host, inherited);
  const on = (key: "bold" | "italic" | "strike") => {
    const current = state(key);
    return !current.mixed && current.value === true;
  };
  const underline = state("underline");
  const kind = state("underlineStyle");
  const size = state("fontSize");
  const family = state("fontFamily");
  return {
    bold: on("bold"),
    italic: on("italic"),
    strike: on("strike"),
    underline:
      underline.mixed || underline.value !== true || kind.mixed
        ? "none"
        : kind.value === "double"
          ? "double"
          : "single",
    fontSize: !size.mixed && typeof size.value === "number" && Number.isFinite(size.value) ? size.value : null,
    fontFamily: family.mixed ? null : typeof family.value === "string" && family.value ? family.value : undefined,
  };
}

/**
 * Formats the characters selected in the open entry. `format` is the patch,
 * or builds it from the selection's current state (a toggle, Grow Font).
 * Returns null when no text entry is open (the caller formats cells).
 */
export function formatSpreadsheetCellEditorCharacters(options: {
  host: SpreadsheetCellEditorHost | null;
  format: SpreadsheetCharacterFormat | SpreadsheetCharacterFormatBuilder;
  /** The cell's own font, which characters without a format of their own show. */
  inherited: SpreadsheetCharacterFormat;
  /** Turns a plain entry rich at its selection with a first format. */
  turnRich: (intent: Omit<SpreadsheetRichDraftIntent, "nonce" | "format"> & {
    format: SpreadsheetCharacterFormat;
  }) => void;
}): boolean | null {
  const { host, format, inherited, turnRich } = options;
  if (!host?.isConnected || hostIsFormula(host)) return null;
  if (hostIsRich(host)) {
    if (typeof format === "function" && format.perRun) {
      // Each run from its own format (characters without one read as the
      // cell's font): 9 and 20 pt characters grow to 10 and 22.
      return host.formatCharacters!((drawn) =>
        format((key) => ({
          value: (drawn as Record<string, unknown>)[key] ?? inherited[key],
          mixed: false,
        })) ?? {},
      );
    }
    const state = richCharacterState(host, inherited);
    const patch = typeof format === "function" ? format(state) : format;
    if (!patch || Object.keys(patch).length === 0) return false;
    return host.formatCharacters!(patch);
  }
  const start = host.selectionStart ?? 0;
  const end = host.selectionEnd ?? start;
  const state: SpreadsheetCharacterState = (key) => ({
    value: inherited[key],
    mixed: false,
  });
  const patch = typeof format === "function" ? format(state) : format;
  if (!patch || Object.keys(patch).length === 0) return false;
  turnRich({ start: Math.min(start, end), end: Math.max(start, end), format: patch });
  return true;
}

/**
 * After a character format chosen from a menu (the font list closes once it
 * is done and leaves the focus on the page), the entry gets the keyboard
 * back at its selection, as Excel returns to the cell being edited. A focus
 * the user has since put anywhere else is left alone.
 */
export function returnFocusToSpreadsheetCellEditor(
  getHost: () => SpreadsheetCellEditorHost | null,
): void {
  officeReturnFocusAfterTextFormat(
    getHost as () => (SpreadsheetCellEditorHost & {
      setSelectionRange?: (start: number, end: number) => void;
    }) | null,
  );
}

/** Bold / Italic / Strikethrough: on unless every selected character has it. */
export function spreadsheetCharacterToggle(
  key: "bold" | "italic" | "strike",
): (state: SpreadsheetCharacterState) => SpreadsheetCharacterFormat {
  return (state) => {
    const current = state(key);
    return { [key]: !(current.value === true && !current.mixed) };
  };
}

/** Underline / Double Underline: the variant, or off when it is already on. */
export function spreadsheetCharacterUnderline(
  variant: "single" | "double",
): (state: SpreadsheetCharacterState) => SpreadsheetCharacterFormat {
  return (state) => {
    const underline = state("underline");
    const style = state("underlineStyle");
    const on =
      underline.value === true &&
      !underline.mixed &&
      !style.mixed &&
      (variant === "double" ? style.value === "double" : style.value !== "double");
    if (on) return { underline: false, underlineStyle: undefined };
    return variant === "double"
      ? { underline: true, underlineStyle: "double" }
      : { underline: true, underlineStyle: undefined };
  };
}

/**
 * Grow / Shrink Font on characters: one step along `ladderPt` (px in, px
 * out), each run of a rich entry from its own size, as Office's Grow Font
 * steps words of mixed sizes (a plain entry's characters share one).
 */
export function spreadsheetCharacterFontStep(
  direction: 1 | -1,
  options: {
    ladderPt: readonly number[];
    defaultPx: number;
    pxToPt: (px: number) => number;
    ptToPx: (pt: number) => number;
  },
): SpreadsheetCharacterFormatBuilder {
  return Object.assign((state: SpreadsheetCharacterState) => {
    const raw = state("fontSize").value;
    const currentPx = typeof raw === "number" && Number.isFinite(raw) ? raw : options.defaultPx;
    const currentPt = options.pxToPt(currentPx);
    const ladder = options.ladderPt;
    const next =
      direction > 0
        ? ladder.find((pt) => pt > currentPt + 1e-6)
        : [...ladder].reverse().find((pt) => pt < currentPt - 1e-6);
    if (next === undefined) return null;
    return { fontSize: options.ptToPx(next) };
  }, { perRun: true as const });
}

/**
 * The sheet's Live Preview. With an entry open and characters selected, the
 * preview shows on those characters only: a rich entry styles them in place,
 * a plain input or text area gets a mirror of its text laid over it
 * (`officePreviewFieldRange`), as the font command would turn it rich at
 * that selection. A caret has no characters, so nothing is previewed.
 * Otherwise the selected cells as drawn (bounded) take the look.
 */
/**
 * Live Preview on the selected drawings Home's font commands act on (the
 * size, colour and font they would give the whole label): a shape's words
 * through its text body, an equation box's equation -- drawn, or open in
 * place -- on its container alone, so the equation's own parts keep their
 * proportions (officePreviewEquationElements).
 */
function previewShapes(
  root: HTMLElement,
  ids: readonly string[],
  css: Record<string, string>,
): OfficeFormatPreviewRestore | null {
  const words: Element[] = [];
  const equations: Element[] = [];
  for (const id of ids) {
    const host = root.querySelector(`[data-spreadsheet-object-id="${CSS.escape(id)}"]`);
    if (!host) continue;
    const equation = host.querySelector("[data-spreadsheet-equation-box-editor], [data-spreadsheet-shape-equation]");
    if (equation) {
      equations.push(equation);
      continue;
    }
    for (const body of host.querySelectorAll("[data-spreadsheet-shape-text-body]")) words.push(body);
  }
  return officeComposePreviewRestores([
    officePreviewElements(words, css),
    officePreviewEquationElements(equations, css),
  ]);
}

type ShapeTextFieldSelection = {
  selectionStart?: number;
  selectionEnd?: number;
  setSelectionRange?: (start: number, end: number) => void;
};


/** The cell formats some Home commands write, whole, for their previews. */
export const SPREADSHEET_DOUBLE_UNDERLINE_PREVIEW = Object.freeze({ cellStyle: Object.freeze({ underline: true, underlineStyle: "double" }) });
export const SPREADSHEET_NO_UNDERLINE_PREVIEW = Object.freeze({ cellStyle: Object.freeze({ underline: undefined, underlineStyle: undefined }) });

/** More selected cells than this keep their rows under a font preview. */
export const SPREADSHEET_FONT_PREVIEW_MEASURED_CELLS = 5_000;

/**
 * The style a hovered font asks of a selected cell, for what changes how its
 * text is laid out: the grid draws those as the press does. A colour or a line
 * lays nothing out, and restyles the drawn text.
 */
export function spreadsheetFontPreviewCellStyle(
  patch: OfficeFormatPreviewPatch,
  nativeGrid: boolean,
): NonNullable<SpreadsheetCell["style"]> | null {
  const style: NonNullable<SpreadsheetCell["style"]> = {
    ...(patch.cellStyle as NonNullable<SpreadsheetCell["style"]> | undefined),
    // The Fill Color command's field: the cell fills, not its words' band.
    ...(patch.highlight ? { backgroundColor: patch.highlight } : {}),
  };
  // The Home size command's value: the default size is no size of its own
  // outside a native grid.
  if (patch.fontSizePt !== undefined) {
    style.fontSize = !nativeGrid && patch.fontSizePt === SPREADSHEET_DEFAULT_FONT_PT ? undefined : spreadsheetPtToPx(patch.fontSizePt);
  }
  if (patch.fontFamily) style.fontFamily = patch.fontFamily;
  if (patch.bold !== undefined) style.bold = patch.bold;
  if (patch.italic !== undefined) style.italic = patch.italic;
  return Object.keys(style).length > 0 ? style : null;
}

/** A cell as a press of that style would leave it, runs and all. */
export function spreadsheetCellInPreviewFont(
  cell: SpreadsheetCell,
  row: number,
  col: number,
  style: NonNullable<SpreadsheetCell["style"]>,
): SpreadsheetCell {
  const key = `${row}:${col}`;
  return updateCellStyle({ cells: { [key]: cell }, rowCount: row + 1, columnCount: col + 1 }, row, col, style).cells[key] ?? cell;
}

export function spreadsheetFormatPreviewAdapter(context: {
  root: () => HTMLElement | null;
  editing: () => { readonly row: number; readonly col: number } | null;
  selection: () => { r1: number; r2: number; c1: number; c2: number } | null;
  /** The drawings Home's font commands act on now (selected shapes), if any. */
  shapes?: () => readonly string[] | null;
  cssOptions?: () => OfficeFormatPreviewCssOptions;
}): OfficeFormatPreviewAdapter {
  return (patch) => {
    const root = context.root();
    if (!root) return null;
    const css = officeFormatPreviewCss(patch, context.cssOptions?.());
    const editing = context.editing();
    if (editing) {
      const host = spreadsheetCellEditorHost(root, editing);
      if (!host || hostIsFormula(host)) return null;
      const start = host.selectionStart ?? 0;
      const end = host.selectionEnd ?? start;
      if (end <= start) return null;
      if (!hostIsRich(host)) {
        return officeIsPreviewField(host) ? officePreviewFieldRange(host, start, end, css) : null;
      }
      const range = officeTextOffsetsRange(host, start, end);
      return range ? officePreviewTextRange(range, css) : null;
    }
    // A shape's words being typed (the shared field): Home acts on its
    // highlighted characters, so they preview, and a caret previews nothing,
    
    const active = root.ownerDocument.activeElement;
    if (active && root.contains(active)) {
      for (let node: Element | null = active; node && node !== root; node = node.parentElement) {
        if (isShapeTextFieldFormatting(node)) {
          return officePreviewShapeTextField(node as unknown as HTMLElement & ShapeTextFieldSelection, css);
        }
      }
    }
    const shapeIds = context.shapes?.() ?? null;
    if (shapeIds && shapeIds.length > 0) return previewShapes(root, shapeIds, css);
    const rect = context.selection();
    if (!rect) return null;
    const targets: Element[] = [];
    for (const element of root.querySelectorAll<HTMLElement>("[data-cell]")) {
      // An input whose text another layer draws stays transparent.
      if (element.getAttribute("data-cell-text") === "layered") continue;
      if (element.getAttribute("data-testid") === "spreadsheet-formula") continue;
      const [row, col] = (element.getAttribute("data-cell") ?? "").split(":").map(Number);
      if (
        Number.isInteger(row) && Number.isInteger(col) &&
        row! >= rect.r1 && row! <= rect.r2 && col! >= rect.c1 && col! <= rect.c2
      ) {
        targets.push(element);
      }
    }
    // A wrapped cell's text stands on a layer of its own, its input transparent
    // under it: a size hovered on it changed nothing to see, and the press did.
    for (const element of root.querySelectorAll<HTMLElement>("[data-cell-layer]")) {
      const [row, col] = (element.getAttribute("data-cell-layer") ?? "").split(":").map(Number);
      if (row! >= rect.r1 && row! <= rect.r2 && col! >= rect.c1 && col! <= rect.c2) targets.push(element);
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-testid^="spreadsheet-richtext-"]')) {
      const match = /^spreadsheet-richtext-(\d+)-(\d+)$/.exec(element.getAttribute("data-testid") ?? "");
      if (!match) continue;
      const row = Number(match[1]);
      const col = Number(match[2]);
      if (row >= rect.r1 && row <= rect.r2 && col >= rect.c1 && col <= rect.c2) targets.push(element);
    }
    return officePreviewElements(targets, css);
  };
}
