/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";

import { OfficeIconGlyph } from "../../../office-ribbon/icons/officeIconGlyphs";
import type { OfficeSemanticIconId } from "../../../office-ribbon/icons/officeIconRegistry";
import officeIconStyles from "../../../office-ribbon/icons/officeSemanticIcon.module.css";
import type { ConditionalRuleTypeId } from "../../../../lib/spreadsheet/conditional-rule-draft";
import type { GoToSpecialOption } from "../../../../lib/spreadsheet/go-to-special";
import type { PivotAgg } from "../../../../lib/spreadsheet/pivot";
import type { PasteArithmeticOp, PasteSpecialPasteMode } from "../../../../lib/spreadsheet/paste-special";

import { SpreadsheetDataIcon, type SpreadsheetDataIconName } from "./SpreadsheetDataRibbonIcons";
import { SpreadsheetFormulaIcon, type SpreadsheetFormulaIconName } from "./SpreadsheetFormulaRibbonIcons";
import {
  SpreadsheetHomeFillDirectionIcon,
  SpreadsheetHomeIcon,
  type SpreadsheetHomeIconName,
} from "./SpreadsheetHomeRibbonIcons";

/*
 * The pictures on a spreadsheet dialog's option buttons and choices: the
 * commands inside a dialog (Add, Delete, Copy, Move Up, Options…) and the
 * alternatives a dialog offers (shift cells right, paste values, a linear
 * series…). They are drawn in the ribbon's glyph language (paper, hairline
 * ink, one accent) and take the dialog's accent from .office-dialog, so a
 * dialog reads as part of the same ribbon it was opened from.
 */

const SEMANTIC = {
  add: "action.add",
  edit: "notebook.edit",
  delete: "edit.delete",
  copy: "edit.duplicate",
  moveUp: "nav.arrow.up",
  moveDown: "nav.arrow.down",
  back: "nav.arrow.left",
  next: "nav.arrow.right",
  options: "app.sliders",
  reset: "action.reset",
  print: "file.print",
  printPreview: "scan.search",
  clear: "format.clear",
  linkRemove: "link.remove",
  link: "link.insert",
  switchRowColumn: "chart.switchRowColumn",
  hiddenCells: "view.hide",
  visibleCells: "view.show",
  show: "view.show",
  help: "help.search",
  selectAll: "selection.checkbox",
  deselectAll: "selection.marquee",
  bold: "text.bold",
  italic: "text.italic",
  underline: "text.underline",
  sum: "math.sigma",
  count: "symbol.hash",
  max: "nav.arrow.toTop",
  min: "nav.arrow.toBottom",
  target: "goal.target",
  comments: "review.comment",
  objects: "shape.insert",
  array: "code.braces",
  date: "calendar.date",
  dateDay: "calendar.date",
  dateWeekday: "work.briefcase",
  dateMonth: "calendar.range",
  dateYear: "calendar.schedule",
  merge: "data.merge",
  summary: "list.numbered",
  save: "file.save",
  load: "data.refreshAll",
  orientationPortrait: "page.orientation.portrait",
  orientationLandscape: "page.orientation.landscape",
  chartCombo: "chart.type.combo",
  chartColumn: "chart.type.column",
  chartLine: "chart.type.line",
  chartBar: "chart.type.bar",
  chartPie: "chart.type.pie",
  chartScatter: "chart.type.scatter",
  chartOther: "chart.type.other",
  addStep: "list.add",
  numberFormat: "symbol.hash",
  findOptions: "app.sliders",
  sortAscending: "table.sortAscending",
  criteria: "data.filter",
  scripts: "code.terminal",
  stepInto: "media.next",
  record: "media.record",
  step: "media.next",
  continue: "media.play",
  stop: "media.stop",
  ignoreOnce: "nav.arrow.right",
  ignoreAll: "nav.chevrons.right",
  addToDictionary: "book.bookmarked",
  replace: "edit.replace",
  autoCorrect: "ai.wand",
  undo: "edit.undo",
  sortDescending: "table.sortDescending",
} as const satisfies Record<string, OfficeSemanticIconId>;

const HOME = {
  colorScaleRule: "cfColorScales",
  highlightRule: "cfHighlightRules",
  topBottomRule: "cfTopBottomRules",
  conditionalFormats: "conditionalFormatting",
  autoFill: "flashFill",
} as const satisfies Record<string, SpreadsheetHomeIconName>;

const DATA = {
  dataValidation: "validation",
  sortOptions: "sortDialog",
} as const satisfies Record<string, SpreadsheetDataIconName>;

const FORMULA = {
  formulaRule: "insertFunction",
  formulas: "insertFunction",
  functionHelp: "insertFunction",
  precedents: "tracePrecedents",
  dependents: "traceDependents",
  errors: "errorCheck",
} as const satisfies Record<string, SpreadsheetFormulaIconName>;

const SHEET_GRID = (
  <>
    <rect className="docs-home-icon__paper" x="3.5" y="4.5" width="17" height="15" rx="1" />
    <path className="docs-home-icon__ink-soft" d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15" />
  </>
);
const CLIPBOARD = (
  <>
    <rect className="docs-home-icon__paper" x="3.5" y="5" width="12" height="15" rx="1.3" />
    <path className="docs-home-icon__paper" d="M7 3.5h5v3H7z" />
    <path className="docs-home-icon__ink-soft" d="M6 10h7M6 13h4.5" />
  </>
);
const BADGE = <rect className="docs-home-icon__paper" x="11.5" y="11.5" width="9.5" height="9.5" rx="1.6" />;
const TEXT_STYLE: CSSProperties = { fontFamily: "inherit", fontWeight: 700 };
function badgeText(text: string, size: number, italic = false): ReactNode {
  return (
    <text
      className="docs-home-icon__accent-text"
      x="16.25"
      y={16.25 + size * 0.36}
      fontSize={size}
      textAnchor="middle"
      style={{ ...TEXT_STYLE, fontStyle: italic ? "italic" : undefined, fontFamily: italic ? "Georgia, 'Times New Roman', serif" : "inherit" }}
    >
      {text}
    </text>
  );
}
const PAPER_SQUARE = <rect className="docs-home-icon__paper" x="4.5" y="4.5" width="15" height="15" rx="2" />;
const BELL = (
  <>
    <path className="docs-home-icon__ink-soft" d="M3.5 19.5h17" />
    <path className="docs-home-icon__accent" d="M4 19c4.2 0 4.6-12.5 8-12.5s3.8 12.5 8 12.5" />
  </>
);

/** Drawings this dialog set needs that no ribbon carries. */
const LOCAL = {
  shiftRight: (
    <>
      <rect className="docs-home-icon__paper" x="2.5" y="6.5" width="11" height="11" rx="1" />
      <path className="docs-home-icon__ink-soft" d="M8 6.5v11M2.5 12h11" />
      <path className="docs-home-icon__accent-fill" d="M3.2 7.2h4.1v4.1H3.2z" />
      <path className="docs-home-icon__accent" d="M15.5 12h6m-2.5-2.5 2.5 2.5-2.5 2.5" />
    </>
  ),
  shiftDown: (
    <>
      <rect className="docs-home-icon__paper" x="6.5" y="2.5" width="11" height="11" rx="1" />
      <path className="docs-home-icon__ink-soft" d="M12 2.5v11M6.5 8h11" />
      <path className="docs-home-icon__accent-fill" d="M7.2 3.2h4.1v4.1H7.2z" />
      <path className="docs-home-icon__accent" d="M12 15.5v6m-2.5-2.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  shiftLeft: (
    <>
      <rect className="docs-home-icon__paper" x="10.5" y="6.5" width="11" height="11" rx="1" />
      <path className="docs-home-icon__ink-soft" d="M16 6.5v11M10.5 12h11" />
      <path className="docs-home-icon__accent" d="M8.5 12h-6m2.5-2.5L2.5 12 5 14.5" />
    </>
  ),
  shiftUp: (
    <>
      <rect className="docs-home-icon__paper" x="6.5" y="10.5" width="11" height="11" rx="1" />
      <path className="docs-home-icon__ink-soft" d="M12 10.5v11M6.5 16h11" />
      <path className="docs-home-icon__accent" d="M12 8.5v-6M9.5 5 12 2.5 14.5 5" />
    </>
  ),
  entireRow: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-fill" d="M4.2 10.2h15.6v3.6H4.2z" />
    </>
  ),
  entireColumn: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-fill" d="M9.9 5.2h4.2v13.6H9.9z" />
    </>
  ),
  newSheet: (
    <>
      <rect className="docs-home-icon__paper" x="2.5" y="4.5" width="14" height="13" rx="1" />
      <path className="docs-home-icon__ink-soft" d="M2.5 9h14M2.5 13.3h14M7.2 4.5v13M11.8 4.5v13" />
      <circle className="docs-home-icon__accent-fill" cx="17.5" cy="17.5" r="4.5" />
      <path stroke="#ffffff" strokeWidth="1.4" d="M17.5 15.2v4.6M15.2 17.5h4.6" />
    </>
  ),
  existingSheet: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-fill" d="M9.9 10.2h4.2v3.6H9.9z" />
      <path className="docs-home-icon__accent" d="M15.5 17.5 13 15m0 0v2.2m0-2.2h2.2" />
    </>
  ),
  seriesLinear: (
    <>
      <path className="docs-home-icon__ink-soft" d="M4 3.5v16.5h16.5" />
      <path className="docs-home-icon__accent" d="M6.5 17 18.5 6" />
      <circle className="docs-home-icon__accent-fill" cx="6.5" cy="17" r="1.5" />
      <circle className="docs-home-icon__accent-fill" cx="12.5" cy="11.5" r="1.5" />
      <circle className="docs-home-icon__accent-fill" cx="18.5" cy="6" r="1.5" />
    </>
  ),
  seriesGrowth: (
    <>
      <path className="docs-home-icon__ink-soft" d="M4 3.5v16.5h16.5" />
      <path className="docs-home-icon__accent" d="M6.5 17.5c6 0 9.5-2.5 12-11.5" />
      <circle className="docs-home-icon__accent-fill" cx="6.5" cy="17.5" r="1.5" />
      <circle className="docs-home-icon__accent-fill" cx="13" cy="15.3" r="1.5" />
      <circle className="docs-home-icon__accent-fill" cx="18.5" cy="6" r="1.5" />
    </>
  ),
  opNone: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__muted" d="M8 16 16 8" />
    </>
  ),
  opAdd: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__accent" strokeWidth="1.4" data-stroke-emphasis="true" d="M12 8v8M8 12h8" />
    </>
  ),
  opSubtract: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="M8 12h8" />
    </>
  ),
  opMultiply: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  opDivide: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="M8 12h8" />
      <circle className="docs-home-icon__accent-fill" cx="12" cy="8.6" r="1.1" />
      <circle className="docs-home-icon__accent-fill" cx="12" cy="15.4" r="1.1" />
    </>
  ),
  constants: (
    <>
      <rect className="docs-home-icon__paper" x="3.5" y="6.5" width="17" height="11" rx="1.5" />
      <text className="docs-home-icon__accent-text" x="12" y="14.6" fontSize="7.5" textAnchor="middle" style={TEXT_STYLE}>
        123
      </text>
    </>
  ),
  blanks: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-soft-fill" d="M9.2 9.5h5.6v5H9.2z" />
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="M9.2 9.5h5.6v5H9.2z" />
    </>
  ),
  currentRegion: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-soft-fill" d="M4.2 5.2h10.4v9.1H4.2z" />
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="M3.5 4.5h11.3v10H3.5z" />
    </>
  ),
  rowDifferences: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-soft-fill" d="M4.2 10.2h15.6v3.6H4.2z" />
      <path className="docs-home-icon__accent-fill" d="M15.4 10.2h4.4v3.6h-4.4z" />
    </>
  ),
  columnDifferences: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-soft-fill" d="M9.9 5.2h4.2v13.6H9.9z" />
      <path className="docs-home-icon__accent-fill" d="M9.9 15.1h4.2v3.7H9.9z" />
    </>
  ),
  lastCell: (
    <>
      {SHEET_GRID}
      <path className="docs-home-icon__accent-fill" d="M15.4 15.1h4.4v3.7h-4.4z" />
    </>
  ),
  averageRule: (
    <>
      <rect className="docs-home-icon__paper" x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path className="docs-home-icon__accent-fill" d="M6 19.4V9h2.6v10.4zM10.7 19.4v-6.6h2.6v6.6zM15.4 19.4V7h2.6v12.4z" />
      <path className="docs-home-icon__warm" strokeDasharray="1.8 1.3" d="M4.6 11.4h14.8" />
    </>
  ),
  duplicateRule: (
    <>
      {SHEET_GRID}
      <path fill="#f9c5c7" stroke="none" d="M4.2 5.2h4.4v3.7H4.2zM9.9 15.1h4.2v3.7H9.9z" />
      <path className="docs-home-icon__danger" d="M5.2 7.1h2.4M10.8 17h2.4" />
    </>
  ),
  average: (
    <>
      <path className="docs-home-icon__ink-soft" d="M3.5 20h17" />
      <path className="docs-home-icon__accent-fill" d="M5 20v-9h3v9zM10.5 20v-5.5h3V20zM16 20V6.5h3V20z" />
      <path className="docs-home-icon__warm" strokeDasharray="1.8 1.3" d="M3.8 12.4h16.4" />
    </>
  ),
  stdDev: (
    <>
      {BELL}
      <path className="docs-home-icon__ink-soft" strokeDasharray="1.4 1.2" d="M8.6 9.5v10M15.4 9.5v10" />
    </>
  ),
  variance: (
    <>
      {BELL}
      <path className="docs-home-icon__accent" d="M8.5 16h7M10 14.5 8.5 16l1.5 1.5M14 14.5l1.5 1.5-1.5 1.5" />
    </>
  ),
  delimited: (
    <>
      <rect className="docs-home-icon__paper" x="3" y="6" width="18" height="12" rx="1.5" />
      <path className="docs-home-icon__ink-soft" d="M5.5 10h3M10.5 10h3M15.5 10h3M5.5 14h3M10.5 14h3M15.5 14h3" />
      <path className="docs-home-icon__accent" d="M9.5 10.8l-.4 1M14.5 10.8l-.4 1M9.5 14.8l-.4 1M14.5 14.8l-.4 1" />
    </>
  ),
  fixedWidth: (
    <>
      <rect className="docs-home-icon__paper" x="3" y="6" width="18" height="12" rx="1.5" />
      <path className="docs-home-icon__ink-soft" d="M5 10h14M5 14h14" />
      <path className="docs-home-icon__accent" d="M9.5 4v16M15 4v16" />
      <path className="docs-home-icon__accent-fill" d="M8 3h3l-1.5 1.8zM13.5 3h3L15 4.8z" />
    </>
  ),
  pasteAll: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__accent" d="M11.5 16.25h9.5M16.25 11.5v9.5" />
    </>
  ),
  pasteFormulas: (
    <>
      {CLIPBOARD}
      {BADGE}
      {badgeText("fx", 6.6, true)}
    </>
  ),
  pasteValues: (
    <>
      {CLIPBOARD}
      {BADGE}
      {badgeText("123", 4.8)}
    </>
  ),
  pasteFormats: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__accent" d="m19.4 13.2-3 3" />
      <path className="docs-home-icon__accent-fill" d="M13.4 19.6c.1-1.7 1.1-2.6 2.4-2.6.8.8.6 2-.3 2.5-.6.3-1.3.2-2.1.1z" />
    </>
  ),
  pasteComments: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__accent" d="M13.5 13.6h5.5v3.6h-2.8l-1.8 1.5v-1.5h-.9z" />
    </>
  ),
  pasteValidation: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="m13.8 16.4 1.7 1.7 3.2-3.5" />
    </>
  ),
  pasteTheme: (
    <>
      {CLIPBOARD}
      {BADGE}
      <circle className="docs-home-icon__accent-fill" cx="14.6" cy="14.6" r="1.3" />
      <circle fill="#e79a1c" stroke="none" cx="18" cy="14.6" r="1.3" />
      <circle fill="#b348a7" stroke="none" cx="14.6" cy="18" r="1.3" />
      <circle fill="#4fba7c" stroke="none" cx="18" cy="18" r="1.3" />
    </>
  ),
  pasteExceptBorders: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__accent-soft-fill" d="M13.6 13.6h5.3v5.3h-5.3z" />
      <path className="docs-home-icon__muted" strokeDasharray="1.3 1.1" d="M13.6 13.6h5.3v5.3h-5.3z" />
    </>
  ),
  pasteColumnWidths: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path className="docs-home-icon__ink-soft" d="M13 13v6.5M19.5 13v6.5" />
      <path className="docs-home-icon__accent" d="M14.4 16.25h3.7m-2.3-1.4-1.4 1.4 1.4 1.4m.9-2.8 1.4 1.4-1.4 1.4" />
    </>
  ),
  pasteFormulasNumberFormats: (
    <>
      {CLIPBOARD}
      {BADGE}
      {badgeText("fx%", 4.6, true)}
    </>
  ),
  pasteValuesNumberFormats: (
    <>
      {CLIPBOARD}
      {BADGE}
      {badgeText("1%", 5.4)}
    </>
  ),
  pasteMergeConditional: (
    <>
      {CLIPBOARD}
      {BADGE}
      <path fill="#4fba7c" stroke="none" d="M13 13h6.5v2.2H13z" />
      <path fill="#ead07b" stroke="none" d="M13 15.2h6.5v2.1H13z" />
      <path fill="#e56173" stroke="none" d="M13 17.3h6.5v2.2H13z" />
    </>
  ),
  fillFromAbove: null,
  product: (
    <>
      {PAPER_SQUARE}
      <path className="docs-home-icon__accent" data-stroke-emphasis="true" d="m9 9 6 6m0-6-6 6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type SpreadsheetDialogIconName =
  | keyof typeof SEMANTIC
  | keyof typeof HOME
  | keyof typeof DATA
  | keyof typeof FORMULA
  | keyof typeof LOCAL;

const ICON_CLASS = "office-dialog__icon";

/** One option button's or choice's picture, at the dialog's 16px. */
export function SpreadsheetDialogIcon({
  name,
  size = 16,
}: {
  name: SpreadsheetDialogIconName;
  size?: number;
}) {
  if (name in HOME) {
    return <SpreadsheetHomeIcon name={HOME[name as keyof typeof HOME]} size={size} className={ICON_CLASS} data-spreadsheet-dialog-icon={name} />;
  }
  if (name in DATA) {
    return <SpreadsheetDataIcon name={DATA[name as keyof typeof DATA]} size={size} className={ICON_CLASS} data-spreadsheet-dialog-icon={name} />;
  }
  if (name in FORMULA) {
    return <SpreadsheetFormulaIcon name={FORMULA[name as keyof typeof FORMULA]} size={size} className={ICON_CLASS} data-spreadsheet-dialog-icon={name} />;
  }
  if (name === "fillFromAbove") {
    return <SpreadsheetHomeFillDirectionIcon direction="down" size={size} className={ICON_CLASS} data-spreadsheet-dialog-icon={name} />;
  }
  const semanticId = (SEMANTIC as Record<string, OfficeSemanticIconId>)[name];
  return (
    <svg
      aria-hidden="true"
      className={["docs-home-icon", semanticId ? officeIconStyles.root : null, ICON_CLASS].filter(Boolean).join(" ")}
      data-office-icon-mirror={semanticId ? "none" : undefined}
      data-office-icon-state={semanticId ? "default" : undefined}
      data-office-semantic-icon={semanticId}
      data-spreadsheet-dialog-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      style={semanticId ? ({ "--office-icon-size": `${size}px` } as CSSProperties) : undefined}
      viewBox="0 0 24 24"
      width={size}
    >
      {semanticId ? (
        <g data-office-icon-glyph={semanticId}>
          <OfficeIconGlyph semanticId={semanticId} />
        </g>
      ) : (
        LOCAL[name as keyof typeof LOCAL]
      )}
    </svg>
  );
}

/** Paste Special's twelve Paste choices, each with what it carries over. */
export const PASTE_SPECIAL_MODE_ICON: Record<PasteSpecialPasteMode, SpreadsheetDialogIconName> = {
  all: "pasteAll",
  formulas: "pasteFormulas",
  values: "pasteValues",
  formats: "pasteFormats",
  comments: "pasteComments",
  validation: "pasteValidation",
  "all-source-theme": "pasteTheme",
  "all-except-borders": "pasteExceptBorders",
  "column-widths": "pasteColumnWidths",
  "formulas-number-formats": "pasteFormulasNumberFormats",
  "values-number-formats": "pasteValuesNumberFormats",
  "all-merge-conditional-formats": "pasteMergeConditional",
};

/** Paste Special's Operation choices: the operator each applies. */
export const PASTE_SPECIAL_OPERATION_ICON: Record<PasteArithmeticOp | "none", SpreadsheetDialogIconName> = {
  none: "opNone",
  add: "opAdd",
  subtract: "opSubtract",
  multiply: "opMultiply",
  divide: "opDivide",
};

/** Go To Special's choices: what each one finds. */
export const GO_TO_SPECIAL_ICON: Record<GoToSpecialOption, SpreadsheetDialogIconName> = {
  comments: "comments",
  constants: "constants",
  formulas: "formulas",
  errors: "errors",
  blanks: "blanks",
  currentRegion: "currentRegion",
  currentArray: "array",
  objects: "objects",
  rowDifferences: "rowDifferences",
  columnDifferences: "columnDifferences",
  precedents: "precedents",
  dependents: "dependents",
  lastCell: "lastCell",
  visible: "visibleCells",
  conditionalFormats: "conditionalFormats",
  validation: "dataValidation",
};

/** Series (Home ▸ Fill ▸ Series): direction, type and date unit. */
export const FILL_SERIES_ICON: Record<string, SpreadsheetDialogIconName> = {
  rows: "entireRow",
  columns: "entireColumn",
  linear: "seriesLinear",
  growth: "seriesGrowth",
  date: "date",
  autoFill: "autoFill",
  day: "dateDay",
  weekday: "dateWeekday",
  month: "dateMonth",
  year: "dateYear",
};

/** Value Field Settings' eleven summary functions. */
export const PIVOT_AGG_ICON: Record<PivotAgg, SpreadsheetDialogIconName> = {
  sum: "sum",
  count: "count",
  average: "average",
  max: "max",
  min: "min",
  product: "product",
  countNums: "constants",
  stdDev: "stdDev",
  stdDevp: "stdDev",
  var: "variance",
  varp: "variance",
};

/** New Formatting Rule's six rule types. */
export const CONDITIONAL_RULE_TYPE_ICON: Record<ConditionalRuleTypeId, SpreadsheetDialogIconName> = {
  allValues: "colorScaleRule",
  cellsThatContain: "highlightRule",
  topBottom: "topBottomRule",
  aboveBelowAverage: "averageRule",
  uniqueDuplicate: "duplicateRule",
  formula: "formulaRule",
};
