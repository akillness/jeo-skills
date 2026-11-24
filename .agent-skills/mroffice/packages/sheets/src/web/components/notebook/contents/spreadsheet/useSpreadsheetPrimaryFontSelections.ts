"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { nativeFontSizeCss } from "@mrnote/core/web/lib/spreadsheet/native-font-size.ts";
import { useMemo } from "react";
import { cellVerticalScript, cellUnderlineKind } from "@mrnote/core/web/lib/spreadsheet/cell-text-effects.ts";
import { cellStyleGalleryWithCustom, cellStyleGalleryForTheme, namedCellStyleMatchStates } from "../../../../lib/spreadsheet/cell-styles";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { SPREADSHEET_DEFAULT_FONT_SIZE } from "./spreadsheetCellCss";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type SelectionObservations } from "../../../../lib/spreadsheet/selection-observations";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";

/** What useSpreadsheetPrimaryFontSelections reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPrimaryFontSelectionsInputs {
  gridColumnCount: number;
  gridRowCount: number;
  selectionObservations: SelectionObservations;
  selRect: GridRect;
  sheet: SheetModel;
  viewOptions: SpreadsheetViewOptions;
  workbookThemePaletteId: string;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPrimaryFontSelections({
  gridColumnCount,
  gridRowCount,
  selectionObservations,
  selRect,
  sheet,
  viewOptions,
  workbookThemePaletteId,
}: SpreadsheetPrimaryFontSelectionsInputs) {
  const primaryFontSelection = useMemo(() => {
    if (
      !Number.isSafeInteger(selRect.r1) ||
      !Number.isSafeInteger(selRect.r2) ||
      !Number.isSafeInteger(selRect.c1) ||
      !Number.isSafeInteger(selRect.c2) ||
      selRect.r1 < 0 ||
      selRect.c1 < 0 ||
      selRect.r2 < selRect.r1 ||
      selRect.c2 < selRect.c1 ||
      selRect.r2 >= gridRowCount ||
      selRect.c2 >= gridColumnCount
    ) {
      return null;
    }

    const families = new Set<string | undefined>();
    const sizes = new Set<number>();
    const boldValues = new Set<boolean>();
    const italicValues = new Set<boolean>();
    // The full kind, so Format Cells reads Single and Single Accounting as
    // different underlines (a selection of both is mixed there).
    const underlineVariants = new Set<
      "none" | "single" | "double" | "singleAccounting" | "doubleAccounting"
    >();
    const strikethroughValues = new Set<boolean>();
    const verticalScriptValues = new Set<"superscript" | "subscript" | "none">();
    const observedStyles = new Set<unknown>();
    const observe = (style: SpreadsheetCell["style"] | undefined) => {
      if (observedStyles.has(style)) return;
      observedStyles.add(style);
      verticalScriptValues.add(cellVerticalScript(style) ?? "none");
      families.add(
        typeof style?.fontFamily === "string" && style.fontFamily !== ""
          ? style.fontFamily
          : undefined,
      );
      sizes.add(
        typeof style?.fontSize === "number" &&
          Number.isFinite(style.fontSize) &&
          style.fontSize > 0
          ? nativeFontSizeCss(style.fontSize, style.nativeFontSize) ?? style.fontSize
          : SPREADSHEET_DEFAULT_FONT_SIZE,
      );
      boldValues.add(style?.bold === true);
      italicValues.add(style?.italic === true);
      underlineVariants.add(cellUnderlineKind(style) ?? "none");
      strikethroughValues.add(style?.strikethrough === true);
    };
    const agreement = <T,>(values: ReadonlySet<T>) =>
      Object.freeze({
        value: values.values().next().value as T,
        mixed: values.size > 1,
      });
    const summary = () =>
      Object.freeze({
        fontFamily: agreement(families),
        fontSize: agreement(sizes),
        bold: agreement(boldValues),
        italic: agreement(italicValues),
        underline: agreement(underlineVariants),
        strikethrough: agreement(strikethroughValues),
        verticalScript: agreement(verticalScriptValues),
      });
    for (const style of selectionObservations.styles) observe(style as SpreadsheetCell["style"]);
    return summary();
  }, [selectionObservations, selRect, sheet.cells, gridColumnCount, gridRowCount]);
  const workbookCustomCellStyles = viewOptions.customCellStyles;
  const cellStyleGallery = useMemo(
    () =>
      cellStyleGalleryWithCustom(
        cellStyleGalleryForTheme(workbookThemePaletteId),
        workbookCustomCellStyles ?? [],
      ),
    [workbookThemePaletteId, workbookCustomCellStyles],
  );
  const cellStyleGalleryGroups = cellStyleGallery.groups;
  const cellStyleGalleryStyles = cellStyleGallery.styles;
  // Cell Styles is a gallery of semantic predicates over the whole range. A
  // style tile is checked only when every selected cell already carries that
  // style's owned fields; partial agreement is indeterminate. The scan mirrors
  // the bounded dense/sparse authority used by Font/Alignment so a full-sheet
  // selection never walks millions of empty coordinates. Loose native-page
  // style data fails closed before either physical gallery can write.
  const primaryCellStyleSelection = useMemo(() => {
    if (
      !Number.isSafeInteger(selRect.r1) ||
      !Number.isSafeInteger(selRect.r2) ||
      !Number.isSafeInteger(selRect.c1) ||
      !Number.isSafeInteger(selRect.c2) ||
      selRect.r1 < 0 ||
      selRect.c1 < 0 ||
      selRect.r2 < selRect.r1 ||
      selRect.c2 < selRect.c1 ||
      selRect.r2 >= gridRowCount ||
      selRect.c2 >= gridColumnCount
    ) {
      return null;
    }

    const states = new Map<string, Set<boolean>>(
      cellStyleGalleryStyles.map((style) => [style.id, new Set<boolean>()]),
    );
    let malformed = false;
    const observedStyles = new Set<unknown>();
    const observe = (rawStyle: unknown) => {
      // The gallery asks whether a style occurs, never how often it occurs.
      // Thousands of default/shared styles therefore require one comparison.
      if (observedStyles.has(rawStyle)) return;
      observedStyles.add(rawStyle);
      const matches = namedCellStyleMatchStates(
        rawStyle,
        cellStyleGalleryStyles,
      );
      if (!matches) {
        malformed = true;
        return;
      }
      for (const style of cellStyleGalleryStyles) {
        states.get(style.id)?.add(matches[style.id] === true);
      }
    };
    const summary = () =>
      Object.freeze(
        Object.fromEntries(
          cellStyleGalleryStyles.map((style) => {
            const values = states.get(style.id) ?? new Set<boolean>();
            return [
              style.id,
              Object.freeze({
                value: values.values().next().value === true,
                mixed: values.size > 1,
              }),
            ];
          }),
        ) as Record<string, { value: boolean; mixed: boolean }>,
      );
    for (const style of selectionObservations.styles) observe(style);
    return malformed ? null : summary();
  }, [selectionObservations,
    cellStyleGalleryStyles,
    selRect,
    sheet.cells,
    gridColumnCount,
    gridRowCount,
  ]);
  return {
    cellStyleGalleryGroups,
    cellStyleGalleryStyles,
    primaryCellStyleSelection,
    primaryFontSelection,
  };
}
