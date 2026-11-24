"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import { type SpreadsheetThemeColor, validThemeColors, resolveThemeStyle } from "@mrnote/core/web/lib/spreadsheet/theme-colors.ts";
import { normalizeNumberFormatCode, numberFormatFamily, isCommaStyleNumberFormat } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { normalizeHexColor } from "@mrnote/core/web/lib/spreadsheet/color-palette.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { SPREADSHEET_DEFAULT_TEXT_COLOR } from "./spreadsheetWindowConstants";
import { type SelectionObservations } from "../../../../lib/spreadsheet/selection-observations";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";

/** What useSpreadsheetPrimarySelections reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPrimarySelectionsInputs {
  gridColumnCount: number;
  gridRowCount: number;
  selectionObservations: SelectionObservations;
  selRect: GridRect;
  sheet: SheetModel;
  workbookThemeColorId: string | undefined;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPrimarySelections({
  gridColumnCount,
  gridRowCount,
  selectionObservations,
  selRect,
  sheet,
  workbookThemeColorId,
}: SpreadsheetPrimarySelectionsInputs) {
  // The six primary alignment buttons and Wrap Text are predicates over the
  // whole range.
  // Tracking each predicate independently is important: in a left/right mixed
  // selection, Left and Right are indeterminate while Center is simply Off.
  // Runtime native-page styles are passthrough, so malformed style/alignment
  // custody must invalidate this authority before any range mutation can run.
  const primaryAlignmentSelection = useMemo(() => {
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

    const states = {
      top: new Set<boolean>(),
      middle: new Set<boolean>(),
      bottom: new Set<boolean>(),
      left: new Set<boolean>(),
      center: new Set<boolean>(),
      right: new Set<boolean>(),
      wrap: new Set<boolean>(),
    };
    let malformed = false;
    const observedStyles = new Set<unknown>();
    const observe = (rawStyle: unknown) => {
      if (observedStyles.has(rawStyle)) return;
      observedStyles.add(rawStyle);
      if (
        rawStyle !== undefined &&
        (rawStyle === null ||
          typeof rawStyle !== "object" ||
          Array.isArray(rawStyle) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(rawStyle)))
      ) {
        malformed = true;
        return;
      }
      const style = rawStyle as Record<string, unknown> | undefined;
      const horizontal =
        style && Object.prototype.hasOwnProperty.call(style, "textAlign")
          ? style.textAlign
          : undefined;
      const vertical =
        style && Object.prototype.hasOwnProperty.call(style, "verticalAlign")
          ? style.verticalAlign
          : undefined;
      const wrap =
        style && Object.prototype.hasOwnProperty.call(style, "wrapText")
          ? style.wrapText
          : undefined;
      if (
        (horizontal !== undefined &&
          horizontal !== "left" &&
          horizontal !== "center" &&
          horizontal !== "right") ||
        (vertical !== undefined &&
          vertical !== "top" &&
          vertical !== "middle" &&
          vertical !== "bottom") ||
        (wrap !== undefined && typeof wrap !== "boolean")
      ) {
        malformed = true;
        return;
      }
      states.left.add(horizontal === "left");
      states.center.add(horizontal === "center");
      states.right.add(horizontal === "right");
      states.top.add(vertical === "top");
      states.middle.add(vertical === "middle");
      states.bottom.add(vertical === "bottom");
      states.wrap.add(wrap === true);
    };
    const agreement = (values: ReadonlySet<boolean>) =>
      Object.freeze({
        value: values.values().next().value as boolean,
        mixed: values.size > 1,
      });
    const summary = () =>
      Object.freeze({
        top: agreement(states.top),
        middle: agreement(states.middle),
        bottom: agreement(states.bottom),
        left: agreement(states.left),
        center: agreement(states.center),
        right: agreement(states.right),
        wrap: agreement(states.wrap),
      });
    for (const style of selectionObservations.styles) observe(style);
    return malformed ? null : summary();
  }, [selectionObservations, selRect, sheet.cells, gridColumnCount, gridRowCount]);
  // Home > Number is one six-control family over the complete selection. The
  // combo needs exact-code consensus, while Accounting / Percent / Comma are
  // semantic predicates (two accounting symbols still agree that Accounting is
  // On). Keep the scan bounded like Font/Alignment and reject loose native-page
  // style custody before any of the six commands can mutate the worksheet.
  const primaryNumberFormatSelection = useMemo(() => {
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

    const formats = new Set<string>();
    const accounting = new Set<boolean>();
    const percentage = new Set<boolean>();
    const comma = new Set<boolean>();
    let malformed = false;
    const observedStyles = new Set<unknown>();
    const observe = (rawStyle: unknown) => {
      if (observedStyles.has(rawStyle)) return;
      observedStyles.add(rawStyle);
      if (
        rawStyle !== undefined &&
        (rawStyle === null ||
          typeof rawStyle !== "object" ||
          Array.isArray(rawStyle) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(rawStyle)))
      ) {
        malformed = true;
        return;
      }
      const style = rawStyle as Record<string, unknown> | undefined;
      const rawFormat =
        style && Object.prototype.hasOwnProperty.call(style, "numberFormat")
          ? style.numberFormat
          : undefined;
      const normalized = normalizeNumberFormatCode(rawFormat);
      const family = numberFormatFamily(rawFormat);
      const commaState = isCommaStyleNumberFormat(rawFormat);
      if (normalized === null || family === null || commaState === null) {
        malformed = true;
        return;
      }
      formats.add(normalized);
      accounting.add(family === "accounting");
      percentage.add(family === "percentage");
      comma.add(commaState);
    };
    const agreement = <T,>(values: ReadonlySet<T>) =>
      Object.freeze({
        value: values.values().next().value as T,
        mixed: values.size > 1,
      });
    const summary = () =>
      Object.freeze({
        format: agreement(formats),
        formats: Object.freeze([...formats]),
        accounting: agreement(accounting),
        percentage: agreement(percentage),
        comma: agreement(comma),
      });
    for (const style of selectionObservations.styles) observe(style);
    return malformed ? null : summary();
  }, [selectionObservations, selRect, sheet.cells, gridColumnCount, gridRowCount]);
  // Font Color and Fill Color describe the complete selection. A missing font
  // colour resolves to the workbook's default ink; a missing/empty background
  // is Excel's distinct "No Fill" state. The Home solid-fill swatch must never
  // flatten a native pattern or gradient, and loose runtime page data must not
  // let malformed colours acquire mutation authority.
  const primaryColorSelection = useMemo(() => {
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

    const textColors = new Set<string>();
    const fillColors = new Set<string | null>();
    const textBindings = new Map<string, SpreadsheetThemeColor | undefined>();
    const fillBindings = new Map<string, SpreadsheetThemeColor | undefined>();
    const observeBinding = (map: Map<string, SpreadsheetThemeColor | undefined>, ref?: SpreadsheetThemeColor) => map.set(ref ? `${ref.theme}:${ref.tint ?? 0}` : "literal", ref);
    let textMalformed = false;
    let fillMalformed = false;
    const observedStyles = new Set<unknown>();
    const observe = (rawStyle: unknown) => {
      if (observedStyles.has(rawStyle)) return;
      observedStyles.add(rawStyle);
      if (rawStyle === undefined) {
        observeBinding(textBindings);
        observeBinding(fillBindings);
        textColors.add(SPREADSHEET_DEFAULT_TEXT_COLOR);
        fillColors.add(null);
        return;
      }
      if (
        rawStyle === null ||
        typeof rawStyle !== "object" ||
        Array.isArray(rawStyle) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(rawStyle))
      ) {
        textMalformed = true;
        fillMalformed = true;
        return;
      }

      const bindings = validThemeColors(rawStyle);
      observeBinding(textBindings, bindings.color);
      observeBinding(fillBindings, bindings.backgroundColor);
      const style = resolveThemeStyle(rawStyle as Record<string, unknown>, workbookThemeColorId);
      const rawTextColor = Object.prototype.hasOwnProperty.call(style, "color")
        ? style.color
        : undefined;
      if (rawTextColor === undefined) {
        textColors.add(SPREADSHEET_DEFAULT_TEXT_COLOR);
      } else {
        const textColor = normalizeHexColor(rawTextColor);
        if (textColor) textColors.add(textColor);
        else textMalformed = true;
      }

      if (
        (Object.prototype.hasOwnProperty.call(style, "fillPattern") &&
          style.fillPattern !== undefined) ||
        (Object.prototype.hasOwnProperty.call(style, "gradientFill") &&
          style.gradientFill !== undefined)
      ) {
        fillMalformed = true;
      }
      const rawFillColor = Object.prototype.hasOwnProperty.call(
        style,
        "backgroundColor",
      )
        ? style.backgroundColor
        : undefined;
      if (rawFillColor === undefined || rawFillColor === "") {
        fillColors.add(null);
      } else {
        const fillColor = normalizeHexColor(rawFillColor);
        if (fillColor) fillColors.add(fillColor);
        else fillMalformed = true;
      }
    };
    const agreement = <T,>(values: ReadonlySet<T>) =>
      Object.freeze({
        value: values.values().next().value as T,
        mixed: values.size > 1,
      });
    const summary = () =>
      Object.freeze({
        text: textMalformed ? null : agreement(textColors),
        fill: fillMalformed ? null : agreement(fillColors),
        textBinding: textBindings.size === 1 ? textBindings.values().next().value : undefined,
        fillBinding: fillBindings.size === 1 ? fillBindings.values().next().value : undefined,
      });
    for (const style of selectionObservations.styles) observe(style);
    return summary();
  }, [selectionObservations, selRect, sheet.cells, gridColumnCount, gridRowCount, workbookThemeColorId]);
  return {
    primaryAlignmentSelection,
    primaryColorSelection,
    primaryNumberFormatSelection,
  };
}
