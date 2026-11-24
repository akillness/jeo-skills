"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { OfficeHomeCheckbox as BaseOfficeHomeCheckbox, OfficeHomeMenuTrigger as BaseOfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { RibbonValueCombobox as BaseRibbonValueCombobox } from "@mrnote/core/web/components/console/editor/ribbon/RibbonValueCombobox.tsx";
import { RibbonFontFamilyPicker as BaseRibbonFontFamilyPicker } from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import { SpreadsheetFormulaIcon, type SpreadsheetFormulaIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetFormulaRibbonIcons.tsx";
import { SpreadsheetRibbonAction as BaseSpreadsheetRibbonAction, SpreadsheetRibbonMenuAction as BaseSpreadsheetRibbonMenuAction, keepWorksheetKeyboardOnMenuClose, type SpreadsheetRibbonActionProps, type SpreadsheetRibbonMenuActionProps } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { useOfficeRibbonCommandGate } from "@mrnote/core/web/components/office-ribbon/officeRibbonCommandGate.tsx";
import { type FunctionCategory } from "../../../../lib/spreadsheet/function-catalog";
import { defineSpreadsheetRenderedControlOccurrences } from "../../../../lib/spreadsheet/feature-capabilities";
import { DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem, DropdownMenuItem as BaseDropdownMenuItem, DropdownMenuRadioItem as BaseDropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";

const SPREADSHEET_RENDERED_CONTROL_ID_BY_TEST_ID = {
  "spreadsheet-ribbon-home-paste": "XLSCTL.HOME.CLIPBOARD.PASTE_MENU",
  "spreadsheet-ribbon-home-paste-options":
    "XLSCTL.HOME.CLIPBOARD.PASTE_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-cut": "XLSCTL.HOME.CLIPBOARD.CUT",
  "spreadsheet-ribbon-home-copy": "XLSCTL.HOME.CLIPBOARD.COPY",
  "spreadsheet-ribbon-home-copy-options":
    "XLSCTL.HOME.CLIPBOARD.COPY_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-copy-plain": "XLSCTL.HOME.CLIPBOARD.COPY",
  "spreadsheet-ribbon-home-copy-as-picture":
    "XLSCTL.HOME.CLIPBOARD.COPY_AS_PICTURE",
  "spreadsheet-ribbon-home-format-painter":
    "XLSCTL.HOME.CLIPBOARD.FORMAT_PAINTER",
  "spreadsheet-ribbon-home-font-family": "XLSCTL.HOME.FONT.FAMILY",
  "spreadsheet-ribbon-home-font-size": "XLSCTL.HOME.FONT.SIZE",
  "spreadsheet-ribbon-home-grow-font": "XLSCTL.HOME.FONT.GROW",
  "spreadsheet-ribbon-home-shrink-font": "XLSCTL.HOME.FONT.SHRINK",
  "spreadsheet-ribbon-home-bold": "XLSCTL.HOME.FONT.BOLD",
  "spreadsheet-ribbon-home-italic": "XLSCTL.HOME.FONT.ITALIC",
  "spreadsheet-ribbon-home-strikethrough":
    "XLSCTL.HOME.FONT.STRIKETHROUGH",
  "spreadsheet-ribbon-home-underline":
    "XLSCTL.HOME.FONT.UNDERLINE.SINGLE",
  "spreadsheet-ribbon-home-borders": "XLSCTL.HOME.FONT.BORDER_MENU",
  "spreadsheet-ribbon-home-fill-color": "XLSCTL.HOME.FONT.FILL_MENU",
  "spreadsheet-ribbon-home-fill-color-options":
    "XLSCTL.HOME.FONT.FILL_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-text-color": "XLSCTL.HOME.FONT.COLOR_MENU",
  "spreadsheet-ribbon-home-text-color-options":
    "XLSCTL.HOME.FONT.COLOR_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-phonetic": "XLSCTL.HOME.FONT.PHONETIC_MENU",
  "spreadsheet-ribbon-home-align-top": "XLSCTL.HOME.ALIGN.TOP",
  "spreadsheet-ribbon-home-align-middle": "XLSCTL.HOME.ALIGN.MIDDLE",
  "spreadsheet-ribbon-home-align-bottom": "XLSCTL.HOME.ALIGN.BOTTOM",
  "spreadsheet-ribbon-home-orientation":
    "XLSCTL.HOME.ALIGN.ORIENTATION_MENU",
  "spreadsheet-ribbon-home-wrap": "XLSCTL.HOME.ALIGN.WRAP.TOGGLE",
  "spreadsheet-ribbon-home-align-left": "XLSCTL.HOME.ALIGN.LEFT",
  "spreadsheet-ribbon-home-align-center": "XLSCTL.HOME.ALIGN.CENTER",
  "spreadsheet-ribbon-home-align-right": "XLSCTL.HOME.ALIGN.RIGHT",
  "spreadsheet-ribbon-home-indent-decrease":
    "XLSCTL.HOME.ALIGN.INDENT_DECREASE",
  "spreadsheet-ribbon-home-indent-increase":
    "XLSCTL.HOME.ALIGN.INDENT_INCREASE",
  "spreadsheet-ribbon-home-merge": "XLSCTL.HOME.ALIGN.MERGE_MENU",
  "spreadsheet-ribbon-home-merge-options":
    "XLSCTL.HOME.ALIGN.MERGE_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-number-format":
    "XLSCTL.HOME.NUMBER.FORMAT_COMBO",
  "spreadsheet-ribbon-home-currency":
    "XLSCTL.HOME.NUMBER.ACCOUNTING_MENU",
  "spreadsheet-ribbon-home-accounting-options":
    "XLSCTL.HOME.NUMBER.ACCOUNTING_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-percent": "XLSCTL.HOME.NUMBER.PERCENT",
  "spreadsheet-ribbon-home-comma": "XLSCTL.HOME.NUMBER.COMMA",
  "spreadsheet-ribbon-home-decimals-more":
    "XLSCTL.HOME.NUMBER.DECIMAL_INCREASE",
  "spreadsheet-ribbon-home-decimals-less":
    "XLSCTL.HOME.NUMBER.DECIMAL_DECREASE",
  "spreadsheet-ribbon-conditional-format":
    "XLSCTL.HOME.STYLE.CONDITIONAL_MENU",
  "spreadsheet-ribbon-home-format-table": "XLSCTL.HOME.STYLE.TABLE_MENU",
  "spreadsheet-ribbon-home-cell-styles":
    "XLSCTL.HOME.STYLE.CELL_STYLE_MENU",
  "spreadsheet-ribbon-home-insert-menu": "XLSCTL.HOME.CELLS.INSERT_MENU",
  "spreadsheet-ribbon-home-delete-menu": "XLSCTL.HOME.CELLS.DELETE_MENU",
  "spreadsheet-ribbon-home-cells-format": "XLSCTL.HOME.CELLS.FORMAT_MENU",
  "spreadsheet-ribbon-home-autosum": "XLSCTL.HOME.EDIT.AUTOSUM_MENU",
  "spreadsheet-ribbon-home-autosum-options":
    "XLSCTL.HOME.EDIT.AUTOSUM_MENU.DISCLOSURE",
  "spreadsheet-ribbon-home-fill": "XLSCTL.HOME.EDIT.FILL_MENU",
  "spreadsheet-ribbon-home-clear": "XLSCTL.HOME.EDIT.CLEAR_MENU",
  "spreadsheet-ribbon-home-sort": "XLSCTL.HOME.EDIT.SORT_FILTER_MENU",
  "spreadsheet-ribbon-home-find": "XLSCTL.HOME.EDIT.FIND_SELECT_MENU",
  "spreadsheet-ribbon-home-sensitivity": "XLSCTL.HOME.EDIT.SENSITIVITY",
  "spreadsheet-ribbon-insert-table": "XLSCTL.INSERT.TABLE",
  "spreadsheet-ribbon-insert-forms": "XLSCTL.INSERT.FORMS",
  "spreadsheet-ribbon-insert-pivot": "XLSCTL.INSERT.PIVOT",
  "spreadsheet-ribbon-insert-shape": "XLSCTL.INSERT.SHAPES.MENU",
  "spreadsheet-ribbon-insert-recommended-chart":
    "XLSCTL.INSERT.CHART.RECOMMENDED_MENU",
  "spreadsheet-ribbon-insert-chart-column":
    "XLSCTL.INSERT.CHART.COLUMN_MENU",
  "spreadsheet-ribbon-insert-chart-line": "XLSCTL.INSERT.CHART.LINE_MENU",
  "spreadsheet-ribbon-insert-chart-scatter":
    "XLSCTL.INSERT.CHART.SCATTER_MENU",
  "spreadsheet-ribbon-insert-chart-pie": "XLSCTL.INSERT.CHART.PIE_MENU",
  "spreadsheet-ribbon-insert-chart-hierarchy":
    "XLSCTL.INSERT.CHART.HIERARCHY_MENU",
  "spreadsheet-ribbon-insert-chart-statistical":
    "XLSCTL.INSERT.CHART.STATISTICAL_MENU",
  "spreadsheet-ribbon-insert-chart-combo":
    "XLSCTL.INSERT.CHART.COMBO_MENU",
  "spreadsheet-ribbon-insert-chart-other":
    "XLSCTL.INSERT.CHART.OTHER_MENU",
  "spreadsheet-ribbon-insert-chart-map": "XLSCTL.INSERT.CHART.MAP",
  "spreadsheet-ribbon-insert-pivot-chart":
    "XLSCTL.INSERT.CHART.PIVOT_CHART",
  "spreadsheet-ribbon-insert-picture": "XLSCTL.INSERT.PICTURES.MENU",
  "spreadsheet-ribbon-insert-picture-menu":
    "XLSCTL.INSERT.PICTURES.MENU.DISCLOSURE",
  "spreadsheet-ribbon-insert-picture-in-cells":
    "XLSCTL.INSERT.PICTURES.PLACE_IN_CELLS",
  "spreadsheet-ribbon-insert-picture-over-cells":
    "XLSCTL.INSERT.PICTURES.OVER_CELLS.MENU",
  "spreadsheet-ribbon-insert-picture-device":
    "XLSCTL.INSERT.PICTURES.OVER_CELLS.DEVICE",
  "spreadsheet-ribbon-insert-picture-ai":
    "XLSCTL.INSERT.PICTURES.OVER_CELLS.AI_IMAGE",
  "spreadsheet-ribbon-insert-picture-online":
    "XLSCTL.INSERT.PICTURES.OVER_CELLS.ONLINE",
  "spreadsheet-ribbon-insert-checkbox": "XLSCTL.INSERT.CONTROL.CHECKBOX",
  "spreadsheet-ribbon-insert-slicer": "XLSCTL.INSERT.FILTER.SLICER",
  "spreadsheet-ribbon-insert-hyperlink": "XLSCTL.INSERT.HYPERLINK.DIALOG",
  "spreadsheet-ribbon-insert-comment": "XLSCTL.INSERT.NEW_COMMENT",
  "spreadsheet-ribbon-insert-text-box": "XLSCTL.INSERT.TEXTBOX.MENU",
  "spreadsheet-ribbon-insert-wordart": "XLSCTL.INSERT.WORDART.MENU",
  "spreadsheet-ribbon-insert-more": "XLSCTL.INSERT.MORE_MENU",
  "spreadsheet-ribbon-page-layout-themes": "XLSCTL.PAGE_LAYOUT.THEME",
  "spreadsheet-ribbon-page-layout-colors": "XLSCTL.PAGE_LAYOUT.COLORS",
  "spreadsheet-ribbon-page-layout-fonts": "XLSCTL.PAGE_LAYOUT.FONTS",
  "spreadsheet-ribbon-page-layout-effects": "XLSCTL.PAGE_LAYOUT.EFFECTS",
  "spreadsheet-ribbon-page-setup": "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.DIALOG",
  "spreadsheet-ribbon-page-layout-margins": "XLSCTL.PAGE_LAYOUT.MARGINS",
  "spreadsheet-ribbon-page-layout-orientation":
    "XLSCTL.PAGE_LAYOUT.ORIENTATION",
  "spreadsheet-ribbon-page-layout-size": "XLSCTL.PAGE_LAYOUT.SIZE",
  "spreadsheet-ribbon-page-layout-print-area": "XLSCTL.PAGE_LAYOUT.PRINT_AREA",
  "spreadsheet-ribbon-page-layout-print-area-options":
    "XLSCTL.PAGE_LAYOUT.PRINT_AREA.DISCLOSURE",
  "spreadsheet-ribbon-page-breaks": "XLSCTL.PAGE_LAYOUT.BREAKS",
  "spreadsheet-ribbon-page-layout-background": "XLSCTL.PAGE_LAYOUT.BACKGROUND",
  "spreadsheet-ribbon-page-layout-print-titles":
    "XLSCTL.PAGE_LAYOUT.PRINT_TITLES",
  "spreadsheet-ribbon-page-layout-scale-width":
    "XLSCTL.PAGE_LAYOUT.SCALE.WIDTH",
  "spreadsheet-ribbon-page-layout-scale-height":
    "XLSCTL.PAGE_LAYOUT.SCALE.HEIGHT",
  "spreadsheet-ribbon-page-layout-gridlines-view":
    "XLSCTL.PAGE_LAYOUT.GRIDLINES.VIEW",
  "spreadsheet-ribbon-page-layout-gridlines-print": "XLSCTL.PAGE_LAYOUT.GRIDLINES.PRINT",
  "spreadsheet-ribbon-page-layout-headings-view":
    "XLSCTL.PAGE_LAYOUT.HEADINGS.VIEW",
  "spreadsheet-ribbon-page-layout-headings-print":
    "XLSCTL.PAGE_LAYOUT.HEADINGS.PRINT",
  "spreadsheet-ribbon-insert-function": "XLSCTL.FORMULAS.INSERT_FUNCTION",
  "spreadsheet-ribbon-autosum": "XLSCTL.FORMULAS.AUTOSUM_MENU",
  "spreadsheet-ribbon-more-functions": "XLSCTL.FORMULAS.LIBRARY.MORE",
  "spreadsheet-ribbon-name-manager": "XLSCTL.FORMULAS.NAME.MANAGER",
  "spreadsheet-ribbon-show-formulas": "XLSCTL.FORMULAS.AUDIT.SHOW_FORMULAS",
  "spreadsheet-ribbon-calculation-options":
    "XLSCTL.FORMULAS.CALC.OPTIONS_MENU",
  "spreadsheet-ribbon-calculate-workbook":
    "XLSCTL.FORMULAS.CALC.CALCULATE_NOW",
  "spreadsheet-ribbon-calculate-sheet":
    "XLSCTL.FORMULAS.CALC.CALCULATE_SHEET",
  "spreadsheet-ribbon-home-paste-values":
    "XLSCTL.HOME.CLIPBOARD.PASTE.VALUES",
  "spreadsheet-ribbon-home-paste-formats":
    "XLSCTL.HOME.CLIPBOARD.PASTE.FORMATS",
  "spreadsheet-ribbon-home-paste-no-borders":
    "XLSCTL.HOME.CLIPBOARD.PASTE.NO_BORDERS",
  "spreadsheet-ribbon-home-paste-transpose":
    "XLSCTL.HOME.CLIPBOARD.PASTE.TRANSPOSE",
  "spreadsheet-ribbon-home-paste-link": "XLSCTL.HOME.CLIPBOARD.PASTE.LINK",
  "spreadsheet-ribbon-home-paste-picture":
    "XLSCTL.HOME.CLIPBOARD.PASTE.PICTURE",
  "spreadsheet-ribbon-home-underline-double":
    "XLSCTL.HOME.FONT.UNDERLINE.DOUBLE",
  "spreadsheet-ribbon-home-borders-more":
    "XLSCTL.HOME.FONT.BORDER_MORE",
  "spreadsheet-ribbon-home-merge-center":
    "XLSCTL.HOME.ALIGN.MERGE.CENTER",
  "spreadsheet-ribbon-home-merge-across":
    "XLSCTL.HOME.ALIGN.MERGE.ACROSS",
  "spreadsheet-ribbon-home-merge-cells": "XLSCTL.HOME.ALIGN.MERGE.CELLS",
  "spreadsheet-ribbon-home-unmerge": "XLSCTL.HOME.ALIGN.MERGE.UNMERGE",
  "spreadsheet-ribbon-number-format-more":
    "XLSCTL.HOME.NUMBER.FORMAT.MORE",
  "spreadsheet-ribbon-cf-highlight-rules":
    "XLSCTL.HOME.STYLE.CONDITIONAL.HIGHLIGHT_RULES",
  "spreadsheet-ribbon-cf-top-bottom-rules":
    "XLSCTL.HOME.STYLE.CONDITIONAL.TOP_BOTTOM_RULES",
  "spreadsheet-ribbon-cf-data-bars":
    "XLSCTL.HOME.STYLE.CONDITIONAL.DATA_BARS",
  "spreadsheet-ribbon-cf-color-scales":
    "XLSCTL.HOME.STYLE.CONDITIONAL.COLOR_SCALES",
  "spreadsheet-ribbon-cf-icon-sets":
    "XLSCTL.HOME.STYLE.CONDITIONAL.ICON_SETS",
  "spreadsheet-ribbon-cf-new-rule":
    "XLSCTL.HOME.STYLE.CONDITIONAL.NEW_RULE",
  "spreadsheet-ribbon-cf-clear-rules":
    "XLSCTL.HOME.STYLE.CONDITIONAL.CLEAR_RULES",
  "spreadsheet-ribbon-cf-clear-selection":
    "XLSCTL.HOME.STYLE.CONDITIONAL.CLEAR_SELECTION",
  "spreadsheet-ribbon-cf-clear-sheet":
    "XLSCTL.HOME.STYLE.CONDITIONAL.CLEAR_SHEET",
  "spreadsheet-ribbon-cf-manage-rules":
    "XLSCTL.HOME.STYLE.CONDITIONAL.MANAGE_RULES",
  "spreadsheet-ribbon-home-format-cells":
    "XLSCTL.HOME.CELLS.FORMAT.FORMAT_CELLS",
  "spreadsheet-ribbon-home-insert-shift-down":
    "XLSCTL.HOME.CELLS.INSERT.SHIFT_DOWN",
  "spreadsheet-ribbon-home-insert-shift-right":
    "XLSCTL.HOME.CELLS.INSERT.SHIFT_RIGHT",
  "spreadsheet-ribbon-home-insert-row": "XLSCTL.HOME.CELLS.INSERT.ROW",
  "spreadsheet-ribbon-home-insert-column":
    "XLSCTL.HOME.CELLS.INSERT.COLUMN",
  "spreadsheet-ribbon-home-insert-sheet":
    "XLSCTL.HOME.CELLS.INSERT.SHEET",
  "spreadsheet-ribbon-home-delete-shift-up":
    "XLSCTL.HOME.CELLS.DELETE.SHIFT_UP",
  "spreadsheet-ribbon-home-delete-shift-left":
    "XLSCTL.HOME.CELLS.DELETE.SHIFT_LEFT",
  "spreadsheet-ribbon-home-delete-row": "XLSCTL.HOME.CELLS.DELETE.ROW",
  "spreadsheet-ribbon-home-delete-column":
    "XLSCTL.HOME.CELLS.DELETE.COLUMN",
  "spreadsheet-ribbon-home-delete-sheet":
    "XLSCTL.HOME.CELLS.DELETE.SHEET",
  "spreadsheet-ribbon-home-find-find":
    "XLSCTL.HOME.EDIT.FIND_SELECT.FIND",
  "spreadsheet-ribbon-home-find-replace":
    "XLSCTL.HOME.EDIT.FIND_SELECT.REPLACE",
  "spreadsheet-ribbon-home-find-go-to":
    "XLSCTL.HOME.EDIT.FIND_SELECT.GO_TO",
  "spreadsheet-ribbon-go-to-special":
    "XLSCTL.HOME.EDIT.FIND_SELECT.GO_TO_SPECIAL",
  "spreadsheet-ribbon-home-find-select-objects":
    "XLSCTL.HOME.EDIT.FIND_SELECT.SELECT_OBJECTS",
  "spreadsheet-ribbon-home-find-selection-pane":
    "XLSCTL.HOME.EDIT.FIND_SELECT.SELECTION_PANE",
  "spreadsheet-ribbon-insert-recommended-pivot":
    "XLSCTL.INSERT.RECOMMENDED_PIVOT",
  "spreadsheet-ribbon-insert-smartart": "XLSCTL.INSERT.SMARTART.MENU",
  "spreadsheet-ribbon-insert-filter": "XLSCTL.INSERT.FILTER.AUTO_FILTER",
  "spreadsheet-ribbon-insert-camera": "XLSCTL.INSERT.CAMERA",
  "spreadsheet-ribbon-insert-sparkline": "XLSCTL.INSERT.SPARKLINE.MENU",
  "spreadsheet-ribbon-insert-symbol": "XLSCTL.INSERT.SYMBOL",
  "spreadsheet-ribbon-insert-radio": "XLSCTL.INSERT.CONTROL.RADIO",
  "spreadsheet-ribbon-insert-spinner": "XLSCTL.INSERT.CONTROL.SPINNER",
  "spreadsheet-ribbon-insert-slider": "XLSCTL.INSERT.CONTROL.SLIDER",
  "spreadsheet-ribbon-page-layout-margins-custom":
    "XLSCTL.PAGE_LAYOUT.MARGINS.CUSTOM",
  "spreadsheet-ribbon-page-layout-print-area-set":
    "XLSCTL.PAGE_LAYOUT.PRINT_AREA.SET",
  "spreadsheet-ribbon-page-layout-print-area-clear":
    "XLSCTL.PAGE_LAYOUT.PRINT_AREA.CLEAR",
  "spreadsheet-ribbon-page-layout-print-area-add":
    "XLSCTL.PAGE_LAYOUT.PRINT_AREA.ADD",
  "spreadsheet-ribbon-page-layout-print-area-edit":
    "XLSCTL.PAGE_LAYOUT.PRINT_AREA.EDIT",
  "spreadsheet-ribbon-page-break-insert":
    "XLSCTL.PAGE_LAYOUT.BREAKS.INSERT",
  "spreadsheet-ribbon-page-break-remove":
    "XLSCTL.PAGE_LAYOUT.BREAKS.REMOVE",
  "spreadsheet-ribbon-page-break-reset":
    "XLSCTL.PAGE_LAYOUT.BREAKS.RESET",
  "spreadsheet-ribbon-page-break-preview":
    "XLSCTL.PAGE_LAYOUT.BREAKS.PREVIEW",
  "spreadsheet-ribbon-more-functions-all":
    "XLSCTL.FORMULAS.LIBRARY.ALL_FUNCTIONS",
  "spreadsheet-ribbon-calculation-auto":
    "XLSCTL.FORMULAS.CALC.OPTIONS.AUTOMATIC",
  "spreadsheet-ribbon-calculation-manual":
    "XLSCTL.FORMULAS.CALC.OPTIONS.MANUAL",
  "spreadsheet-ribbon-calculation-date1904":
    "XLSCTL.FORMULAS.CALC.OPTIONS.DATE1904",
  "spreadsheet-ribbon-data-consolidate": "XLSCTL.DATA.TOOLS.CONSOLIDATE",
  "spreadsheet-ribbon-data-forecast-sheet": "XLSCTL.DATA.FORECAST.DIALOG",
  "spreadsheet-cell-transform-toggle": "XLSCTL.DATA.TRANSFORM.MENU",
  "spreadsheet-ribbon-view-focus-cell-options":
    "XLSCTL.VIEW.SHOW.FOCUS_CELL.DISCLOSURE",
  "spreadsheet-ribbon-freeze-panes-options":
    "XLSCTL.VIEW.WINDOW.FREEZE_PANES.DISCLOSURE",
} as const satisfies Readonly<Record<string, string>>;

export const SPREADSHEET_FORMULA_LIBRARY_ICON_BY_OCCURRENCE = {
  financial: "financial",
  logical: "logical",
  text: "text",
  "date-time": "dateTime",
  lookup: "lookup",
  math: "mathTrig",
} as const;

export const SPREADSHEET_FORMULA_LIBRARY_CATEGORY_BY_OCCURRENCE = {
  financial: "financial",
  logical: "logical",
  text: "text",
  "date-time": "dateTime",
  lookup: "lookup",
  math: "math",
} as const satisfies Readonly<Record<string, FunctionCategory>>;

// The categories Excel parks behind "More Functions" because the ribbon has no
// room for a button each. They are the same kind of shelf as the six buttons
// beside them, so the menu maps each one to a category glyph here instead of
// spelling an icon name at the call site — a category without a face cannot
// compile.
export const SPREADSHEET_MORE_FUNCTION_ICON_BY_CATEGORY = {
  statistical: "statistical",
  engineering: "engineering",
  information: "information",
  web: "web",
  other: "other",
} as const satisfies Readonly<
  Partial<Record<FunctionCategory, SpreadsheetFormulaIconName>>
>;

export const SPREADSHEET_MORE_FUNCTION_CATEGORIES = [
  "statistical",
  "engineering",
  "information",
  "web",
  "other",
] as const satisfies ReadonlyArray<
  keyof typeof SPREADSHEET_MORE_FUNCTION_ICON_BY_CATEGORY
>;

export type SpreadsheetFormulaLibraryOccurrenceId =
  keyof typeof SPREADSHEET_FORMULA_LIBRARY_ICON_BY_OCCURRENCE;

export function isSpreadsheetFormulaLibraryOccurrenceId(
  value: string,
): value is SpreadsheetFormulaLibraryOccurrenceId {
  return Object.prototype.hasOwnProperty.call(
    SPREADSHEET_FORMULA_LIBRARY_ICON_BY_OCCURRENCE,
    value,
  );
}

export const SPREADSHEET_FORMULA_LIBRARY_CONTROL_OCCURRENCES =
  defineSpreadsheetRenderedControlOccurrences([
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "financial",
      controlId: "XLSCTL.FORMULAS.LIBRARY.FINANCIAL",
      role: "semantic",
    },
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "logical",
      controlId: "XLSCTL.FORMULAS.LIBRARY.LOGICAL",
      role: "semantic",
    },
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "text",
      controlId: "XLSCTL.FORMULAS.LIBRARY.TEXT",
      role: "semantic",
    },
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "date-time",
      controlId: "XLSCTL.FORMULAS.LIBRARY.DATE_TIME",
      role: "semantic",
    },
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "lookup",
      controlId: "XLSCTL.FORMULAS.LIBRARY.LOOKUP_REFERENCE",
      role: "semantic",
    },
    {
      tab: "Formulas",
      surface: "formulas-ribbon-library",
      occurrenceId: "math",
      controlId: "XLSCTL.FORMULAS.LIBRARY.MATH_TRIG",
      role: "semantic",
    },
  ]);

export function SpreadsheetFormulaFunctionMenuItems({
  browseLabel,
  category,
  disabled,
  disabledReason,
  names,
  onBrowse,
  onSelectFunction,
  surface,
}: {
  browseLabel: string;
  category: FunctionCategory;
  disabled: boolean;
  disabledReason?: string;
  names: readonly string[];
  onBrowse: () => void;
  onSelectFunction: (name: string) => void;
  surface: string;
}) {
  return (
    <>
      {names.map((name) => (
        <DropdownMenuItem
          key={name}
          aria-label={disabledReason ? `${name}: ${disabledReason}` : name}
          data-control-id="XLSCTL.FORMULAS.INSERT_FUNCTION"
          data-control-occurrence-id={`${category}:${name}`}
          data-control-surface={surface}
          data-testid={`spreadsheet-ribbon-function-${category}-item-${name}`}
          disabled={disabled}
          title={disabledReason}
          onSelect={() => onSelectFunction(name)}
        >
          {name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        aria-label={
          disabledReason ? `${browseLabel}: ${disabledReason}` : browseLabel
        }
        data-control-id="XLSCTL.FORMULAS.INSERT_FUNCTION"
        data-control-occurrence-id={`${category}:browse`}
        data-control-surface={surface}
        data-testid={`spreadsheet-ribbon-function-${category}-browse`}
        disabled={disabled}
        title={disabledReason}
        onSelect={onBrowse}
      >
        <SpreadsheetFormulaIcon name="insertFunction" size={16} />
        <span>{browseLabel}</span>
      </DropdownMenuItem>
    </>
  );
}

const SPREADSHEET_REVIEW_COMMENT_CONTROL_OCCURRENCES =
  defineSpreadsheetRenderedControlOccurrences([
    {
      tab: "Review",
      surface: "review-comment-composer",
      occurrenceId: "post",
      controlId: "XLSCTL.REVIEW.COMMENT.POST",
      role: "semantic",
    },
    {
      tab: "Review",
      surface: "review-comment-composer",
      occurrenceId: "resolve-toggle",
      controlId: "XLSCTL.REVIEW.COMMENT.RESOLVE_TOGGLE",
      role: "semantic",
    },
  ]);

function spreadsheetReviewCommentOccurrenceProps(
  occurrenceId: "post" | "resolve-toggle",
) {
  const occurrence = SPREADSHEET_REVIEW_COMMENT_CONTROL_OCCURRENCES.find(
    (candidate) => candidate.occurrenceId === occurrenceId,
  );
  if (!occurrence) throw new Error(`Unknown Review comment occurrence ${occurrenceId}`);
  return {
    "data-control-id": occurrence.controlId,
    "data-control-surface": occurrence.surface,
    "data-control-occurrence-id": occurrence.occurrenceId,
  };
}

const SPREADSHEET_PAGE_SETUP_PRINT_CONTROL_OCCURRENCES =
  defineSpreadsheetRenderedControlOccurrences([
    ...[
      ["page-setup", "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.DIALOG"],
      ["margins", "XLSCTL.PAGE_LAYOUT.MARGINS"],
      ["margin-normal", "XLSCTL.PAGE_LAYOUT.MARGINS.APPLY"],
      ["margin-wide", "XLSCTL.PAGE_LAYOUT.MARGINS.APPLY"],
      ["margin-narrow", "XLSCTL.PAGE_LAYOUT.MARGINS.APPLY"],
      ["margin-current", "XLSCTL.PAGE_LAYOUT.MARGINS.APPLY"],
      ["margin-custom", "XLSCTL.PAGE_LAYOUT.MARGINS.CUSTOM"],
      ["orientation", "XLSCTL.PAGE_LAYOUT.ORIENTATION"],
      ["size", "XLSCTL.PAGE_LAYOUT.SIZE"],
      ["size-more", "XLSCTL.PAGE_LAYOUT.SIZE"],
      ["print-area", "XLSCTL.PAGE_LAYOUT.PRINT_AREA"],
      ["print-area-disclosure", "XLSCTL.PAGE_LAYOUT.PRINT_AREA.DISCLOSURE"],
      ["print-area-set", "XLSCTL.PAGE_LAYOUT.PRINT_AREA.SET"],
      ["print-area-clear", "XLSCTL.PAGE_LAYOUT.PRINT_AREA.CLEAR"],
      ["print-area-add", "XLSCTL.PAGE_LAYOUT.PRINT_AREA.ADD"],
      ["print-area-edit", "XLSCTL.PAGE_LAYOUT.PRINT_AREA.EDIT"],
      ["breaks", "XLSCTL.PAGE_LAYOUT.BREAKS"],
      ["break-insert", "XLSCTL.PAGE_LAYOUT.BREAKS.INSERT"],
      ["break-remove", "XLSCTL.PAGE_LAYOUT.BREAKS.REMOVE"],
      ["break-reset", "XLSCTL.PAGE_LAYOUT.BREAKS.RESET"],
      ["break-preview", "XLSCTL.PAGE_LAYOUT.BREAKS.PREVIEW"],
      ["print-titles", "XLSCTL.PAGE_LAYOUT.PRINT_TITLES"],
      ["scale-width", "XLSCTL.PAGE_LAYOUT.SCALE.WIDTH"],
      ["scale-height", "XLSCTL.PAGE_LAYOUT.SCALE.HEIGHT"],
    ].map(([occurrenceId, controlId]) => ({
      tab: "Page Layout" as const,
      surface: "page-layout-ribbon-page-setup",
      occurrenceId,
      controlId,
      role: "semantic" as const,
    })),
    {
      tab: "Page Layout",
      surface: "page-layout-ribbon-sheet-options",
      occurrenceId: "headings-print",
      controlId: "XLSCTL.PAGE_LAYOUT.HEADINGS.PRINT",
      role: "semantic",
    },
    {
      tab: "Page Layout",
      surface: "page-layout-ribbon-sheet-options",
      occurrenceId: "gridlines-print",
      controlId: "XLSCTL.PAGE_LAYOUT.GRIDLINES.PRINT",
      role: "semantic",
    },
    {
      tab: "Page Layout",
      surface: "page-setup-dialog",
      occurrenceId: "apply",
      controlId: "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.APPLY",
      role: "semantic",
    },
    {
      tab: "Page Layout",
      surface: "page-setup-dialog",
      occurrenceId: "clear",
      controlId: "XLSCTL.PAGE_LAYOUT.PAGE_SETUP.CLEAR",
      role: "semantic",
    },
  ]);

function spreadsheetPageSetupPrintOccurrence(
  surface: string,
  occurrenceId: string,
) {
  const occurrence = SPREADSHEET_PAGE_SETUP_PRINT_CONTROL_OCCURRENCES.find(
    (candidate) =>
      candidate.surface === surface &&
      candidate.occurrenceId === occurrenceId,
  );
  if (!occurrence?.controlId) {
    throw new Error("Unknown Page Setup rendered control occurrence");
  }
  return occurrence;
}

export function spreadsheetPageSetupPrintActionProps(
  surface: string,
  occurrenceId: string,
) {
  const occurrence = spreadsheetPageSetupPrintOccurrence(
    surface,
    occurrenceId,
  );
  return {
    controlId: occurrence.controlId,
    controlSurface: occurrence.surface,
    controlOccurrenceId: occurrence.occurrenceId,
  } as const;
}

export function spreadsheetPageSetupPrintDomProps(
  surface: string,
  occurrenceId: string,
) {
  const occurrence = spreadsheetPageSetupPrintOccurrence(
    surface,
    occurrenceId,
  );
  return {
    "data-control-id": occurrence.controlId,
    "data-control-surface": occurrence.surface,
    "data-control-occurrence-id": occurrence.occurrenceId,
  } as const;
}

export function renderedSpreadsheetControlId(testId?: string): string | undefined {
  if (!testId) return undefined;
  const fixed = SPREADSHEET_RENDERED_CONTROL_ID_BY_TEST_ID[
      testId as keyof typeof SPREADSHEET_RENDERED_CONTROL_ID_BY_TEST_ID
  ];
  if (fixed) return fixed;
  const suffixId = (value: string) =>
    value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const supportedHomeFillPrefix = "spreadsheet-ribbon-home-fill-";
  if (testId.startsWith(supportedHomeFillPrefix)) {
    const suffix = testId.slice(supportedHomeFillPrefix.length);
    if (
      [
        "down",
        "right",
        "up",
        "left",
        "across-worksheets",
        "series",
        "justify",
        "flash-fill",
      ].includes(suffix)
    ) {
      return `XLSCTL.HOME.EDIT.FILL.${suffixId(suffix)}`;
    }
  }
  const supportedHomeClearPrefix = "spreadsheet-ribbon-home-clear-";
  if (testId.startsWith(supportedHomeClearPrefix)) {
    const suffix = testId.slice(supportedHomeClearPrefix.length);
    return (
      {
        all: "XLSCTL.HOME.EDIT.CLEAR.CLEAR_ALL",
        formats: "XLSCTL.HOME.EDIT.CLEAR.CLEAR_FORMATS",
        contents: "XLSCTL.HOME.EDIT.CLEAR.CLEAR_CONTENTS",
        comments: "XLSCTL.HOME.EDIT.CLEAR.CLEAR_COMMENTS_NOTES",
        hyperlinks: "XLSCTL.HOME.EDIT.CLEAR.CLEAR_HYPERLINKS",
        "remove-hyperlinks": "XLSCTL.HOME.EDIT.CLEAR.REMOVE_HYPERLINKS",
      } as const
    )[suffix as
      | "all"
      | "formats"
      | "contents"
      | "comments"
      | "hyperlinks"
      | "remove-hyperlinks"];
  }
  const dynamicFamilies: ReadonlyArray<
    readonly [prefix: string, controlPrefix: string]
  > = [
    [
      "spreadsheet-ribbon-home-find-",
      "XLSCTL.HOME.EDIT.FIND_SELECT.",
    ],
    [
      "spreadsheet-ribbon-insert-sparkline-",
      "XLSCTL.INSERT.SPARKLINE.",
    ],
  ];
  for (const [prefix, controlPrefix] of dynamicFamilies) {
    if (testId.startsWith(prefix)) {
      return `${controlPrefix}${suffixId(testId.slice(prefix.length))}`;
    }
  }
  const chartTypeByTestId = {
    column: "CLUSTERED_COLUMN",
    "stacked-column": "STACKED_COLUMN",
    line: "LINE",
    area: "AREA",
    scatter: "XY_SCATTER",
    bubble: "BUBBLE",
    pie: "PIE",
    doughnut: "DOUGHNUT",
    bar: "CLUSTERED_BAR",
    histogram: "HISTOGRAM",
    "box-and-whisker": "BOX_WHISKER",
    pareto: "PARETO",
    combo: "COMBO_CLUSTERED_COLUMN_LINE",
    radar: "RADAR",
    waterfall: "WATERFALL",
    treemap: "TREEMAP",
    sunburst: "SUNBURST",
    stock: "STOCK_HLC",
  } as const;
  for (const prefix of ["spreadsheet-ribbon-insert-chart-"] as const) {
    if (testId.startsWith(prefix)) {
      const type = testId.slice(prefix.length);
      const chartType =
        chartTypeByTestId[type as keyof typeof chartTypeByTestId];
      if (chartType) return `XLSCTL.INSERT.CHART.TYPE.${chartType}`;
    }
  }
  const recommendedChartPrefix =
    "spreadsheet-ribbon-insert-recommended-chart-";
  if (testId.startsWith(recommendedChartPrefix)) {
    const type = testId.slice(recommendedChartPrefix.length);
    const chartType = chartTypeByTestId[type as keyof typeof chartTypeByTestId];
    if (chartType) {
      return "XLSCTL.INSERT.CHART.RECOMMENDED_MENU";
    }
  }
  return undefined;
}

function spreadsheetDropdownControlProps(
  testId: unknown,
  controlId: unknown,
): { "data-control-id"?: string } {
  const inferred =
    typeof testId === "string"
      ? renderedSpreadsheetControlId(testId)
      : undefined;
  const resolved = typeof controlId === "string" ? controlId : inferred;
  return resolved ? { "data-control-id": resolved } : {};
}

function spreadsheetDataAttribute(
  props: object,
  name: "data-testid" | "data-control-id",
): unknown {
  return (props as Record<string, unknown>)[name];
}

/**
 * A ribbon menu item the selection gate names (it cannot act on the selected
 * object) is disabled with the reason in its name and tooltip. The gate only
 * exists inside the ribbon, so context menus are untouched, and an item its
 * caller already disabled keeps its own reason.
 */
function useSpreadsheetMenuItemGate(props: {
  disabled?: boolean;
  "aria-label"?: string;
}): {
  disabled: true;
  title: string;
  "aria-label"?: string;
  "data-disabled-reason": string;
} | null {
  const testId = spreadsheetDataAttribute(props, "data-testid");
  const gated = useOfficeRibbonCommandGate(
    typeof testId === "string" ? testId : undefined,
    props.disabled,
    undefined,
  );
  if (props.disabled || !gated.disabled || !gated.disabledReason) return null;
  const reason = gated.disabledReason;
  return {
    disabled: true,
    title: reason,
    ...(props["aria-label"]
      ? { "aria-label": `${props["aria-label"]}: ${reason}` }
      : {}),
    "data-disabled-reason": reason,
  };
}

// Every menu of the sheet leaves a keyboard its command gave the
// worksheet where it is (keepWorksheetKeyboardOnMenuClose).
export const DropdownMenuContent = forwardRef<
  ElementRef<typeof RibbonDropdownMenuContent>,
  ComponentPropsWithoutRef<typeof RibbonDropdownMenuContent>
>(function SpreadsheetDropdownMenuContent(
  { onCloseAutoFocus, ...props },
  ref,
) {
  return (
    <RibbonDropdownMenuContent
      {...props}
      ref={ref}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        keepWorksheetKeyboardOnMenuClose(event);
      }}
    />
  );
});
DropdownMenuContent.displayName = "SpreadsheetDropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof BaseDropdownMenuItem>,
  ComponentPropsWithoutRef<typeof BaseDropdownMenuItem>
>(function SpreadsheetDropdownMenuItem(props, ref) {
  const gated = useSpreadsheetMenuItemGate(props);
  return (
    <BaseDropdownMenuItem
      {...props}
      {...(gated ?? {})}
      ref={ref}
      {...spreadsheetDropdownControlProps(
        spreadsheetDataAttribute(props, "data-testid"),
        spreadsheetDataAttribute(props, "data-control-id"),
      )}
    />
  );
});
DropdownMenuItem.displayName = "SpreadsheetDropdownMenuItem";

export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof BaseDropdownMenuCheckboxItem>,
  ComponentPropsWithoutRef<typeof BaseDropdownMenuCheckboxItem>
>(function SpreadsheetDropdownMenuCheckboxItem(props, ref) {
  const gated = useSpreadsheetMenuItemGate(props);
  return (
    <BaseDropdownMenuCheckboxItem
      {...props}
      {...(gated ?? {})}
      ref={ref}
      {...spreadsheetDropdownControlProps(
        spreadsheetDataAttribute(props, "data-testid"),
        spreadsheetDataAttribute(props, "data-control-id"),
      )}
    />
  );
});
DropdownMenuCheckboxItem.displayName = "SpreadsheetDropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof BaseDropdownMenuRadioItem>,
  ComponentPropsWithoutRef<typeof BaseDropdownMenuRadioItem>
>(function SpreadsheetDropdownMenuRadioItem(props, ref) {
  const gated = useSpreadsheetMenuItemGate(props);
  return (
    <BaseDropdownMenuRadioItem
      {...props}
      {...(gated ?? {})}
      ref={ref}
      {...spreadsheetDropdownControlProps(
        spreadsheetDataAttribute(props, "data-testid"),
        spreadsheetDataAttribute(props, "data-control-id"),
      )}
    />
  );
});
DropdownMenuRadioItem.displayName = "SpreadsheetDropdownMenuRadioItem";

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof BaseDropdownMenuSubTrigger>,
  ComponentPropsWithoutRef<typeof BaseDropdownMenuSubTrigger>
>(function SpreadsheetDropdownMenuSubTrigger(props, ref) {
  const gated = useSpreadsheetMenuItemGate(props);
  return (
    <BaseDropdownMenuSubTrigger
      {...props}
      {...(gated ?? {})}
      ref={ref}
      {...spreadsheetDropdownControlProps(
        spreadsheetDataAttribute(props, "data-testid"),
        spreadsheetDataAttribute(props, "data-control-id"),
      )}
    />
  );
});
DropdownMenuSubTrigger.displayName = "SpreadsheetDropdownMenuSubTrigger";

export const OfficeHomeMenuTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof BaseOfficeHomeMenuTrigger>
>(function SpreadsheetOfficeHomeMenuTrigger(props, ref) {
  const explicitControlId = spreadsheetDataAttribute(props, "data-control-id");
  const explicitTestId = spreadsheetDataAttribute(props, "data-testid");
  const pressed = props["aria-pressed"];
  return (
    <BaseOfficeHomeMenuTrigger
      {...props}
      ref={ref}
      controlId={
        props.controlId ?? (typeof explicitControlId === "string"
          ? explicitControlId : renderedSpreadsheetControlId(props.testId))
      }
      testId={props.testId ?? (typeof explicitTestId === "string" ? explicitTestId : undefined)}
      active={props.active ?? (pressed === "mixed" ? "mixed" : pressed === undefined ? undefined : pressed === true || pressed === "true")}
    />
  );
});
OfficeHomeMenuTrigger.displayName = "SpreadsheetOfficeHomeMenuTrigger";

export function OfficeHomeCheckbox(
  props: ComponentProps<typeof BaseOfficeHomeCheckbox>,
) {
  return (
    <BaseOfficeHomeCheckbox
      {...props}
      controlId={
        props.controlId ?? renderedSpreadsheetControlId(props.testId)
      }
    />
  );
}

export function RibbonFontFamilyPicker(
  props: ComponentProps<typeof BaseRibbonFontFamilyPicker>,
) {
  const controlId = renderedSpreadsheetControlId(props.testId);
  // The picker reads the selection gate by its test id itself.
  return (
    <BaseRibbonFontFamilyPicker
      {...props}
      controlId={controlId ? `${controlId}.DISCLOSURE` : undefined}
      controlSurface="home-ribbon-font-family"
      optionControlId={() => controlId}
      optionOccurrenceId={(option, sectionId) =>
        `${sectionId}:${option.id}`
      }
      variantControlId={() => controlId}
      variantOccurrenceId={(option, variant, sectionId) =>
        `variant:${sectionId}:${option.id}:${variant.id}`
      }
      entryOccurrenceId={(kind, id) => (id ? `${kind}:${id}` : kind)}
      auxiliaryControlId={() =>
        controlId ? `${controlId}.DISCLOSURE` : undefined
      }
    />
  );
}

export function RibbonValueCombobox(
  props: ComponentProps<typeof BaseRibbonValueCombobox>,
) {
  const controlId = renderedSpreadsheetControlId(props.testId);
  return (
    <BaseRibbonValueCombobox
      {...props}
      controlId={controlId}
      disclosureControlId={controlId}
      controlSurface={
        props.testId === "spreadsheet-ribbon-home-font-size"
          ? "home-ribbon-font-size"
          : "view-ribbon-zoom"
      }
      optionOccurrenceId={(option) => option.id ?? option.value}
      optionControlId={() => controlId}
    />
  );
}

type SpreadsheetRibbonActionWithOccurrenceProps =
  SpreadsheetRibbonActionProps & {
    controlOccurrenceId?: string;
    controlSurface?: string;
  };

export function SpreadsheetRibbonAction({
  controlOccurrenceId,
  controlSurface,
  ...props
}: SpreadsheetRibbonActionWithOccurrenceProps) {
  if (
    (controlOccurrenceId === undefined) !== (controlSurface === undefined)
  ) {
    throw new Error(
      "Spreadsheet ribbon occurrence identity requires both surface and occurrence",
    );
  }
  const controlId =
    props.controlId ?? renderedSpreadsheetControlId(props.testId);
  let buttonRef = props.buttonRef;
  if (controlOccurrenceId !== undefined && controlSurface !== undefined) {
    if (!controlId?.trim()) {
      throw new Error(
        "Spreadsheet ribbon semantic occurrence requires a nonblank control ID",
      );
    }
    const forwardedRef = props.buttonRef;
    buttonRef = (node: HTMLButtonElement | null) => {
      if (node) {
        node.dataset.controlId = controlId;
        node.dataset.controlOccurrenceId = controlOccurrenceId;
        node.dataset.controlSurface = controlSurface;
      }
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) {
        (forwardedRef as { current: HTMLButtonElement | null }).current = node;
      }
    };
  }
  return (
    <BaseSpreadsheetRibbonAction
      {...props}
      buttonRef={buttonRef}
      controlId={controlId}
    />
  );
}

type SpreadsheetRibbonMenuActionWithOccurrenceProps =
  SpreadsheetRibbonMenuActionProps & {
    controlOccurrenceId?: string;
    controlSurface?: string;
  };

export function SpreadsheetRibbonMenuAction({
  controlOccurrenceId,
  controlSurface,
  ...props
}: SpreadsheetRibbonMenuActionWithOccurrenceProps) {
  if (
    (controlOccurrenceId === undefined) !== (controlSurface === undefined)
  ) {
    throw new Error(
      "Spreadsheet ribbon menu occurrence requires both surface and occurrence",
    );
  }
  const controlId =
    props.controlId ?? renderedSpreadsheetControlId(props.testId);
  let triggerRef = props.triggerRef;
  if (controlOccurrenceId !== undefined && controlSurface !== undefined) {
    if (!controlId?.trim()) {
      throw new Error(
        "Spreadsheet ribbon menu occurrence requires a nonblank control ID",
      );
    }
    const forwardedRef = props.triggerRef;
    triggerRef = (node: HTMLButtonElement | null) => {
      if (node) {
        node.dataset.controlId = controlId;
        node.dataset.controlOccurrenceId = controlOccurrenceId;
        node.dataset.controlSurface = controlSurface;
      }
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) {
        (forwardedRef as { current: HTMLButtonElement | null }).current = node;
      }
    };
  }
  return (
    <BaseSpreadsheetRibbonMenuAction
      {...props}
      controlId={controlId}
      triggerRef={triggerRef}
    />
  );
}
