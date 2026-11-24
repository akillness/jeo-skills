/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode, SVGProps } from "react";

import { OfficeBorderPresetIcon } from "../../../office-ribbon/OfficeBorderPresetIcon";
import { OfficeIconGlyph } from "../../../office-ribbon/icons/officeIconGlyphs";
import type { OfficeSemanticIconId } from "../../../office-ribbon/icons/officeIconRegistry";
import officeIconStyles from "../../../office-ribbon/icons/officeSemanticIcon.module.css";
import type { NumberFormatMenuIconId } from "../../../../lib/spreadsheet/number-format-gallery";

/**
 * Spreadsheet-only Home-ribbon glyphs, drawn on the SAME conventions as the
 * document editor's DocumentHomeRibbonIcons: a 24px grid, 1px strokes, and
 * semantic part classes (`docs-home-icon__ink` / `__accent` / `__muted`)
 * coloured entirely by CSS — which is what retints them green inside the
 * spreadsheet ribbon's scope, exactly as the user asked ("docs 的图标是蓝色
 * 主题的，换成绿色主题的用在表格上").
 *
 * These spreadsheet-only commands have no docs counterpart (a document has no
 * in-cell vertical alignment, accounting style, or decimal-place command), so
 * they get their own glyphs rather than borrowed ones with the wrong meaning.
 * Everything docs DOES have keeps using DocsHomeIcon.
 */

export const SPREADSHEET_HOME_ICON_NAMES = [
  "bold",
  "italic",
  "strikethrough",
  "cellAlignTop",
  "cellAlignMiddle",
  "cellAlignBottom",
  "orientationText",
  "wrapText",
  "mergeCells",
  "mergeCenter",
  "mergeAcross",
  "unmergeCells",
  "underlineSingle",
  "underlineDouble",
  "phoneticGuide",
  "fillColor",
  "conditionalFormatting",
  "cfHighlightRules",
  "cfTopBottomRules",
  "cfDataBars",
  "cfColorScales",
  "cfIconSets",
  "cfNewRule",
  "formatAsTable",
  "cellStyles",
  "insertCells",
  "deleteCells",
  "formatCells",
  "autoSum",
  "fill",
  "fillSeries",
  "fillJustify",
  "flashFill",
  "clear",
  "clearAll",
  "clearFormats",
  "clearContents",
  "clearComments",
  "clearHyperlinks",
  "removeHyperlinks",
  "sortFilter",
  "findSelect",
  "find",
  "replace",
  "goTo",
  "goToSpecial",
  "selectObjects",
  "selectionPane",
  "hideUnhide",
  "moveCopySheet",
  "sensitivity",
  "analyzeData",
  "addIns",
  "accountingNumber",
  "percentStyle",
  "commaStyle",
  "increaseDecimals",
  "decreaseDecimals",
] as const;

export type SpreadsheetHomeIconName =
  (typeof SPREADSHEET_HOME_ICON_NAMES)[number];

interface SpreadsheetHomeIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: SpreadsheetHomeIconName;
  size?: number;
}

/**
 * Commands the spreadsheet shares with the other editors take the registry's
 * drawing of them, so Bold in a workbook is the same Bold as in a document.
 * The green stays: the ribbon binds --mrai-office-icon-accent to its own
 * --docs-home-icon-accent, so a shared glyph is retinted here exactly like the
 * local ones described above.
 *
 * `fill` is deliberately not on this table. Excel's Home > Fill pours a value
 * down a range; the registry's shape.fill is a paint bucket for a shape's
 * colour. Same word, different command.
 */
const SPREADSHEET_HOME_SEMANTIC_ICON_IDS = {
  bold: "text.bold",
  italic: "text.italic",
  strikethrough: "text.strikethrough",
  clear: "format.clear",
  find: "edit.find",
  replace: "edit.replace",
  selectionPane: "object.selectionPane",
} as const satisfies Partial<
  Record<SpreadsheetHomeIconName, OfficeSemanticIconId>
>;

/** Text lines pinned top/middle/bottom inside a faint cell frame. */
function CellLines({ position }: { position: "top" | "middle" | "bottom" }) {
  const ys =
    position === "top"
      ? [7.4, 10.6]
      : position === "middle"
        ? [10.4, 13.6]
        : [13.4, 16.6];
  return (
    <>
      <rect
        className="docs-home-icon__muted"
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="1.6"
      />
      <g className="docs-home-icon__ink">
        <path d={`M7 ${ys[0]}h10`} />
        <path d={`M7 ${ys[1]}h6.5`} />
      </g>
    </>
  );
}

function glyph(name: SpreadsheetHomeIconName) {
  switch (name) {
    case "bold":
      return (
        <text
          className="docs-home-icon__type-text"
          x="4.5"
          y="19.2"
          fontFamily="Arial, sans-serif"
          fontSize="19"
          fontWeight="800"
        >
          B
        </text>
      );
    case "italic":
      return (
        <text
          className="docs-home-icon__type-text"
          x="7"
          y="19"
          fontFamily="Georgia, serif"
          fontSize="20"
          fontStyle="italic"
          fontWeight="600"
        >
          I
        </text>
      );
    case "strikethrough":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3.2"
            y="17.8"
            fontFamily="Arial, sans-serif"
            fontSize="14.5"
            fontWeight="600"
          >
            ab
          </text>
          <path className="docs-home-icon__accent" d="M2.5 12h19" />
        </>
      );
    case "cellAlignTop":
      return <CellLines position="top" />;
    case "cellAlignMiddle":
      return <CellLines position="middle" />;
    case "cellAlignBottom":
      return <CellLines position="bottom" />;
    case "orientationText":
      return (
        <>
          <g className="docs-home-icon__ink" transform="rotate(-28 12 12)">
            <path d="M5 15.5 9.4 5h1.9l4.5 10.5M6.8 11.2h7.1" />
          </g>
          <path
            className="docs-home-icon__accent"
            d="M4.2 18.5h15.6m0 0-2.4-2.2m2.4 2.2-2.4 2.2"
          />
        </>
      );
    case "wrapText":
      return (
        // raised 1.35 so the drawing's middle is the canvas's
        <g transform="translate(0 -1.35)">
          <g className="docs-home-icon__ink">
            <path d="M4 6.5h16" />
            <path d="M4 17.5h7" />
          </g>
          {/* The wrapping line: runs right, turns down and comes back. */}
          <g className="docs-home-icon__accent">
            <path d="M4 12h13a3 3 0 0 1 0 6h-2.2" />
            <path d="m16.6 15.8-2.4 2.2 2.4 2.2" />
          </g>
        </g>
      );
    case "mergeCells":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4.5"
            width="17"
            height="15"
            rx="1.6"
          />
          {/* The seam being merged away, and the two arrows meeting on it. */}
          <path
            className="docs-home-icon__ink-soft"
            d="M12 4.5v3.2M12 16.3v3.2"
          />
          <g className="docs-home-icon__accent">
            <path d="M6.2 12h4.4m0 0-1.8-1.8M10.6 12l-1.8 1.8" />
            <path d="M17.8 12h-4.4m0 0 1.8-1.8M13.4 12l1.8 1.8" />
          </g>
        </>
      );
    case "mergeCenter":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4.5"
            width="17"
            height="15"
            rx="1.6"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12 4.5v3.2M12 16.3v3.2"
          />
          <path
            className="docs-home-icon__accent"
            d="M6.2 12h4m0 0-1.7-1.7m1.7 1.7-1.7 1.7M17.8 12h-4m0 0 1.7-1.7M13.8 12l1.7 1.7"
          />
          <path className="docs-home-icon__ink" d="M9.1 9h5.8m-4.2 6h2.6" />
        </>
      );
    case "mergeAcross":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1.5"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.5 12h17M12 4v3M12 9v6M12 17v3"
          />
          <path
            className="docs-home-icon__accent"
            d="M6 8h4m0 0-1.6-1.6M10 8 8.4 9.6M18 8h-4m0 0 1.6-1.6M14 8l1.6 1.6M6 16h4m0 0-1.6-1.6M10 16l-1.6 1.6M18 16h-4m0 0 1.6-1.6M14 16l1.6 1.6"
          />
        </>
      );
    case "unmergeCells":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4.5"
            width="17"
            height="15"
            rx="1.6"
          />
          <path className="docs-home-icon__ink-soft" d="M12 4.5v15" />
          <path
            className="docs-home-icon__danger"
            d="M10.2 12H5.8m0 0 1.8-1.8M5.8 12l1.8 1.8M13.8 12h4.4m0 0-1.8-1.8m1.8 1.8-1.8 1.8"
          />
        </>
      );
    case "underlineSingle":
      return (
        <>
          <path className="docs-home-icon__ink" d="M7 4v6.1a5 5 0 0 0 10 0V4" />
          <path className="docs-home-icon__accent" d="M5 20h14" />
        </>
      );
    case "underlineDouble":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M7 3.5v6.1a5 5 0 0 0 10 0V3.5"
          />
          <path className="docs-home-icon__accent" d="M5 18h14M5 21h14" />
        </>
      );
    case "phoneticGuide":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="5"
            y="18"
            fontSize="13"
            fontWeight="650"
          >
            A
          </text>
          <path
            className="docs-home-icon__accent"
            d="M4.5 5.5h3m2 0h3m2 0h3m-12 3h12"
          />
          <path className="docs-home-icon__ink-soft" d="M13 11.5h6M16 9v8.5" />
        </>
      );
    case "fillColor":
      return (
        // raised 1.1 so the bucket and its colour bar centre on the canvas
        <g transform="translate(0 -1.1)">
          <path
            className="docs-home-icon__ink"
            d="m7.2 4.2 8.6 8.6-5.5 5.5a2.1 2.1 0 0 1-3 0l-2.6-2.6a2.1 2.1 0 0 1 0-3l5.5-5.5"
          />
          <path
            className="docs-home-icon__accent"
            d="m4.9 12.5 6.5 6.5M13.1 5.1l-1.7 1.7"
          />
          <path className="docs-home-icon__accent-fill" d="M4 21h16v1H4z" />
        </g>
      );
    case "conditionalFormatting":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M9.2 3.5v17m5.6-17v17M3.5 9.2h17m-17 5.6h17"
          />
          <path
            className="docs-home-icon__danger"
            d="M4.8 4.8h3.1v3.1H4.8zM10.5 10.5h3.1v3.1h-3.1z"
          />
          <path
            className="docs-home-icon__accent"
            d="M16.1 16.1h3.1v3.1h-3.1z"
          />
        </>
      );
    // Conditional Formatting's gallery categories, each drawn as what the
    // rule does to a cell rather than as one repeated grid.
    case "cfHighlightRules":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="4.5"
            width="17"
            height="15"
            rx="1"
          />
          <path className="docs-home-icon__ink-soft" d="M3.5 12h17M12 4.5v15" />
          <path fill="#f9c5c7" stroke="none" d="M4.6 5.6h6.3v5.3H4.6z" />
          <path className="docs-home-icon__danger" d="M6.2 8.2h3.2" />
          <path
            className="docs-home-icon__ink"
            d="m13.8 8.6 2.4-1.8m-2.4 1.8 2.4 1.8M14.4 15.8h4"
          />
        </>
      );
    case "cfTopBottomRules":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="M4.6 4.6h14.8v4.2H4.6z"
          />
          <path className="docs-home-icon__ink-soft" d="M3.5 9.4h17m-17 5.4h17" />
          <path
            className="docs-home-icon__ink"
            d="M8.2 12.1h7.6M8.2 17.6h5.2"
          />
          <path fill="#ffffff" stroke="none" d="m12 5.2 1.8 2.9h-3.6z" />
        </>
      );
    case "cfDataBars":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="M5 5.6h13v3H5zM5 10.5h8.4v3H5zM5 15.4h4.6v3H5z"
          />
        </>
      );
    case "cfColorScales":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path fill="#4fba7c" stroke="none" d="M4.6 4.6h14.8v4.6H4.6z" />
          <path fill="#ead07b" stroke="none" d="M4.6 9.7h14.8v4.6H4.6z" />
          <path fill="#e56173" stroke="none" d="M4.6 14.8h14.8v4.6H4.6z" />
          <path className="docs-home-icon__ink-soft" d="M12 4.6v14.8" />
        </>
      );
    case "cfIconSets":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <circle fill="#4fba7c" stroke="none" cx="8" cy="7.2" r="1.9" />
          <circle fill="#f2c037" stroke="none" cx="8" cy="12" r="1.9" />
          <circle fill="#e56173" stroke="none" cx="8" cy="16.8" r="1.9" />
          <path
            className="docs-home-icon__ink-soft"
            d="M12 7.2h5.6M12 12h5.6M12 16.8h5.6"
          />
        </>
      );
    case "cfNewRule":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3.5"
            width="14"
            height="14"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.5 8.2h14m-14 4.6h14M10.5 3.5v14"
          />
          <path fill="#f9c5c7" stroke="none" d="M4.6 4.6h4.8v2.6H4.6z" />
          <path
            className="docs-home-icon__accent"
            d="M18 14.5v6m-3-3h6"
          />
        </>
      );
    case "formatAsTable":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="4"
            width="15"
            height="15.5"
            rx="1"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="M4.5 5h13v3.4h-13z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M9 4v15.5m4.5-15.5v15.5M3.5 12h15m-15 3.8h15"
          />
          <path
            className="docs-home-icon__accent"
            d="m15.5 18.8 3.9-7.4 1.8.9-3.9 7.4-2.2 1.2.4-2.1Z"
          />
        </>
      );
    case "cellStyles":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M9.2 3.5v17m5.6-17v17M3.5 9.2h17m-17 5.6h17"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="M4.5 10.2h15v3.6h-15z"
          />
          <path className="docs-home-icon__accent" d="m16.8 18.3 3.1-5.8" />
        </>
      );
    case "insertCells":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="6.5"
            y="4"
            width="14"
            height="16"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M11.2 4v16m4.6-16v16M6.5 9.3h14m-14 5.4h14"
          />
          <path className="docs-home-icon__accent" d="M3.5 8v8M.5 12h6" />
        </>
      );
    case "deleteCells":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="3.5"
            y="4"
            width="14"
            height="16"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M8.2 4v16m4.6-16v16M3.5 9.3h14m-14 5.4h14"
          />
          <path
            className="docs-home-icon__danger"
            d="m16.3 15.8 4.2 4.2m0-4.2-4.2 4.2"
          />
        </>
      );
    case "formatCells":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M9.7 3.5v17m4.6-17v17M5 9h14m-14 5.5h14"
          />
          <path
            className="docs-home-icon__accent"
            d="M2.5 12h19m-19 0 2-2m-2 2 2 2m17-2-2-2m2 2-2 2"
          />
        </>
      );
    case "autoSum":
      return (
        <path
          className="docs-home-icon__ink"
          d="M18.5 4.5h-13l6.2 7.5-6.2 7.5h13"
        />
      );
    case "fill":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="4"
            y="3.5"
            width="16"
            height="17"
            rx="1"
          />
          <path className="docs-home-icon__ink-soft" d="M4 9h16M4 14.5h16" />
          <path
            className="docs-home-icon__accent"
            d="M12 5.4v11.4m0 0-3-3m3 3 3-3"
          />
        </>
      );
    case "fillSeries":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3"
            y="9"
            fontSize="6.5"
            fontWeight="700"
          >
            1
          </text>
          <text
            className="docs-home-icon__type-text"
            x="9"
            y="14"
            fontSize="6.5"
            fontWeight="700"
          >
            2
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="15"
            y="19"
            fontSize="6.5"
            fontWeight="700"
          >
            3
          </text>
          <path
            className="docs-home-icon__accent"
            d="M5 16.5 17.5 6m0 0h-4m4 0v4"
          />
        </>
      );
    case "fillJustify":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4 5.5h16M4 9.5h12M4 13.5h16M4 17.5h12"
          />
          <path
            className="docs-home-icon__accent"
            d="M18.5 8v10m0 0-2.2-2.2m2.2 2.2 2.2-2.2"
          />
        </>
      );
    case "flashFill":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.5 9h17M3.5 14.5h17M9 4v16M14.5 4v16"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m13.2 3.2-4.4 9h3.5l-1.5 8.6 5-10h-3.4l.8-7.6Z"
          />
          <path
            className="docs-home-icon__accent"
            d="m13.2 3.2-4.4 9h3.5l-1.5 8.6 5-10h-3.4l.8-7.6Z"
          />
        </>
      );
    case "clear":
      return (
        <>
          <path
            className="docs-home-icon__magenta-fill"
            d="m5.2 14.6 7.9-8.8a2 2 0 0 1 2.8-.2l2.4 2.2a2 2 0 0 1 .2 2.8l-7.9 8.8H7.9l-2.7-2.5v-2.3Z"
          />
          <path
            className="docs-home-icon__ink"
            d="m5.2 14.6 7.9-8.8a2 2 0 0 1 2.8-.2l2.4 2.2a2 2 0 0 1 .2 2.8l-7.9 8.8H7.9l-2.7-2.5v-2.3Zm4.1-4.5 5.4 4.8M4 20.5h16"
          />
        </>
      );
    case "clearAll":
      return (
        <>
          <path
            className="docs-home-icon__magenta-fill"
            d="m4.8 14.2 8-8.8a2 2 0 0 1 2.8-.2l3 2.7a2 2 0 0 1 .2 2.8l-8 8.8H7.6l-2.8-2.6v-2.7Z"
          />
          <path
            className="docs-home-icon__ink"
            d="m4.8 14.2 8-8.8a2 2 0 0 1 2.8-.2l3 2.7a2 2 0 0 1 .2 2.8l-8 8.8H7.6l-2.8-2.6v-2.7ZM3.5 21h17"
          />
          <path className="docs-home-icon__danger" d="m8 8 8 8m0-8-8 8" />
        </>
      );
    case "clearFormats":
      return (
        <>
          {/* The "A" is drawn, not set as <text>: a text node leaked into the
              menu item's text ("A 清除规则", XLS-A015). */}
          <path
            className="docs-home-icon__ink"
            d="M4.6 17 8.3 6.8h.4L12.4 17M6 13.4h5"
          />
          <path
            className="docs-home-icon__magenta"
            d="m12.5 15 5.5-6 3 2.7-5.5 6H13l-1.5-1.4 1-1.3Z"
          />
          <path className="docs-home-icon__accent" d="M3.5 20.5h17" />
        </>
      );
    case "clearContents":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1"
          />
          <path className="docs-home-icon__ink-soft" d="M3.5 9h17M9 4v16" />
          <path className="docs-home-icon__danger" d="m12.5 12 5 5m0-5-5 5" />
        </>
      );
    case "clearComments":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4.5 5.5h15v10h-8l-4.5 4v-4H4.5z"
          />
          <path className="docs-home-icon__ink-soft" d="M8 9h8M8 12h5" />
          <path className="docs-home-icon__danger" d="m15.5 15.5 5 5m0-5-5 5" />
        </>
      );
    case "clearHyperlinks":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="m9.5 14.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M14.5 9.5l1-1a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"
          />
          <path className="docs-home-icon__danger" d="m8 16 8-8" />
        </>
      );
    case "removeHyperlinks":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="m9.5 14.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M14.5 9.5l1-1a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"
          />
          <path className="docs-home-icon__danger" d="m4 4 16 16" />
          <path className="docs-home-icon__accent" d="M5 22h14" />
        </>
      );
    case "sortFilter":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3"
            y="9"
            fontSize="7.2"
            fontWeight="700"
          >
            A
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="3"
            y="18.5"
            fontSize="7.2"
            fontWeight="700"
          >
            Z
          </text>
          <path
            className="docs-home-icon__ink"
            d="M10 5h5.8l-3.4 4.1v5.1l-2.4 1.5V9.1L6.6 5H10Zm7.5.5v13m0 0-2.5-2.7m2.5 2.7 2.5-2.7"
          />
        </>
      );
    case "findSelect":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="10" cy="10" r="5.8" />
          <path className="docs-home-icon__ink" d="m14.2 14.2 5.4 5.4" />
          <path
            className="docs-home-icon__accent"
            d="M7.6 8h4.8M7.6 10.5h4.8M7.6 13h2.8"
          />
        </>
      );
    case "find":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="10" cy="10" r="5.8" />
          <path className="docs-home-icon__ink" d="m14.2 14.2 5.4 5.4" />
          <path className="docs-home-icon__accent" d="M7.3 10h5.4" />
        </>
      );
    case "replace":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M5 8a7 7 0 0 1 12-2m2-2v5h-5M19 16a7 7 0 0 1-12 2m-2 2v-5h5"
          />
          <path className="docs-home-icon__accent" d="M9 12h6" />
        </>
      );
    case "goTo":
      return (
        <>
          <circle className="docs-home-icon__muted" cx="12" cy="12" r="8.5" />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="3" />
          <path
            className="docs-home-icon__ink"
            d="M12 2v4m0 12v4M2 12h4m12 0h4"
          />
        </>
      );
    case "goToSpecial":
      return (
        <>
          <circle className="docs-home-icon__muted" cx="12" cy="12" r="8.5" />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="3" />
          <path
            className="docs-home-icon__ink"
            d="M12 2v4m0 12v4M2 12h4m12 0h4"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m18.5 3 .7 1.8L21 5.5l-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
          />
        </>
      );
    case "selectObjects":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M5 4.5h5v5H5zM14 14.5h5v5h-5z"
          />
          <path className="docs-home-icon__accent" d="m8 11 3 3m2-6 3 3" />
          <path
            className="docs-home-icon__ink-soft"
            d="M14 4.5h5v5M5 14.5v5h5"
          />
        </>
      );
    case "selectionPane":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M14 4v16M16.5 8h2M16.5 12h2M16.5 16h2"
          />
          <rect
            className="docs-home-icon__accent"
            x="6"
            y="8"
            width="5"
            height="6"
            rx=".8"
          />
        </>
      );
    case "hideUnhide":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z"
          />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="2.8" />
          <path className="docs-home-icon__danger" d="m4 4 16 16" />
        </>
      );
    case "moveCopySheet":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="4"
            y="6"
            width="12"
            height="14"
            rx="1"
          />
          <path className="docs-home-icon__ink-soft" d="M8 3h12v14" />
          <path
            className="docs-home-icon__accent"
            d="M7 12h12m0 0-3-3m3 3-3 3"
          />
        </>
      );
    case "sensitivity":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M12 3.5 19 6v5.7c0 4.1-2.8 7.3-7 8.8-4.2-1.5-7-4.7-7-8.8V6l7-2.5Z"
          />
          <path className="docs-home-icon__accent" d="M12 8v5m0 3h.01" />
        </>
      );
    case "analyzeData":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M4 19V11m5 8V6m5 13v-5m5 5V4"
          />
          <path className="docs-home-icon__accent" d="m3.5 9 5-4 5 5 6-7" />
          <path
            className="docs-home-icon__accent-fill"
            d="m18.5 2 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
          />
        </>
      );
    case "addIns":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4.5 4.5h6.2v6.2H4.5zM13.3 4.5h6.2v6.2h-6.2zM4.5 13.3h6.2v6.2H4.5z"
          />
          <path
            className="docs-home-icon__accent"
            d="M16.4 13.1v6.6M13.1 16.4h6.6"
          />
          <path
            className="docs-home-icon__ink"
            d="M4.5 4.5h6.2v6.2H4.5zM13.3 4.5h6.2v6.2h-6.2zM4.5 13.3h6.2v6.2H4.5z"
          />
        </>
      );
    case "accountingNumber":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1.5"
          />
          <text
            className="docs-home-icon__type-text"
            x="6"
            y="14.5"
            fontSize="10.5"
            fontWeight="700"
          >
            $
          </text>
          <path
            className="docs-home-icon__ink-soft"
            d="M13 8h4.5M13 11.8h4.5M13 15.6h4.5"
          />
          <path className="docs-home-icon__accent" d="M5.5 18h13" />
        </>
      );
    case "percentStyle":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="7.5" cy="7.5" r="2.6" />
          <circle
            className="docs-home-icon__accent"
            cx="16.5"
            cy="16.5"
            r="2.6"
          />
          <path className="docs-home-icon__ink" d="M17.8 5.2 6.2 18.8" />
        </>
      );
    case "commaStyle":
      return (
        <>
          {/* Excel's Comma Style face: the comma itself (XLS-A007), raised
              2.45 so the comma's middle is the canvas's. */}
          <path
            className="docs-home-icon__ink"
            d="M10.2 9.2h4.4v4.5c0 2.9-1.5 4.9-4.2 6l-.7-1.4c1.4-.7 2.2-1.7 2.4-3.1h-1.9z"
            fill="currentColor"
            stroke="none"
            transform="translate(0 -2.45)"
          />
        </>
      );
    case "increaseDecimals":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="2.2"
            y="10"
            fontSize="7.2"
            fontWeight="700"
          >
            .0
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="13"
            y="18.8"
            fontSize="7.2"
            fontWeight="700"
          >
            .00
          </text>
          <path
            className="docs-home-icon__accent"
            d="M6 14h9m0 0-2.5-2.5M15 14l-2.5 2.5"
          />
        </>
      );
    case "decreaseDecimals":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="12"
            y="10"
            fontSize="7.2"
            fontWeight="700"
          >
            .00
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="2.2"
            y="18.8"
            fontSize="7.2"
            fontWeight="700"
          >
            .0
          </text>
          <path
            className="docs-home-icon__accent"
            d="M18 14H9m0 0 2.5-2.5M9 14l2.5 2.5"
          />
        </>
      );
  }
  const exhaustive: never = name;
  return exhaustive;
}

interface SpreadsheetHomeAuxIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children"
> {
  size?: number;
}

function SpreadsheetHomeAuxIcon({
  children,
  className,
  dataName,
  size = 16,
  ...props
}: SpreadsheetHomeAuxIconProps & {
  children: ReactNode;
  dataName: string;
}) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={`docs-home-icon${className ? ` ${className}` : ""}`}
      data-spreadsheet-home-menu-icon={dataName}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

/** A rotation preview whose text angle is the menu item's real command value. */
export function SpreadsheetHomeOrientationPresetIcon({
  angle,
  ...props
}: SpreadsheetHomeAuxIconProps & { angle: number }) {
  const safeAngle = Number.isFinite(angle)
    ? Math.max(-90, Math.min(90, angle))
    : 0;
  return (
    <SpreadsheetHomeAuxIcon dataName={`orientation-${safeAngle}`} {...props}>
      <g
        className="docs-home-icon__ink"
        transform={`rotate(${-safeAngle} 12 12)`}
      >
        <path d="M6 16 10.2 6h1.7l4.2 10M7.6 12h6.8" />
      </g>
      <path className="docs-home-icon__accent" d="M3.5 20h17" />
    </SpreadsheetHomeAuxIcon>
  );
}

/** Directional Fill leaves share one grid but carry distinct arrow geometry. */
export function SpreadsheetHomeFillDirectionIcon({
  direction,
  ...props
}: SpreadsheetHomeAuxIconProps & {
  direction: "down" | "right" | "up" | "left" | "across";
}) {
  const arrow = {
    down: "M12 5v13m0 0-3-3m3 3 3-3",
    up: "M12 19V6m0 0-3 3m3-3 3 3",
    right: "M5 12h13m0 0-3-3m3 3-3 3",
    left: "M19 12H6m0 0 3-3m-3 3 3 3",
    across: "M5 12h13m0 0-3-3m3 3-3 3",
  }[direction];
  return (
    <SpreadsheetHomeAuxIcon dataName={`fill-${direction}`} {...props}>
      {direction === "across" ? (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="13"
            height="13"
            rx="1"
          />
          <path className="docs-home-icon__ink-soft" d="M7 7h13v13H7" />
        </>
      ) : (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.5 9h17M3.5 15h17M9 3.5v17M15 3.5v17"
          />
        </>
      )}
      <path className="docs-home-icon__accent" d={arrow} />
    </SpreadsheetHomeAuxIcon>
  );
}

export type SpreadsheetHomeBorderPreset =
  | "bottom"
  | "top"
  | "left"
  | "right"
  | "none"
  | "all"
  | "outside"
  | "thickBox"
  | "bottomDouble"
  | "thickBottom"
  | "topAndBottom"
  | "topAndThickBottom"
  | "topAndDoubleBottom";

/**
 * Border menu previews draw the edges the preset sets on a faint 2x2 cell
 * grid -- the shared Office border glyph Docs and the deck use -- so Outside
 * and All Borders, a thin and a thick bottom, read apart at a glance (the
 * sheet's own drawing put every edge on a solid box of the same weight).
 */
export function SpreadsheetHomeBorderPresetIcon({
  preset,
  size = 16,
  className,
}: Pick<SpreadsheetHomeAuxIconProps, "size" | "className"> & {
  preset: SpreadsheetHomeBorderPreset;
}) {
  return <OfficeBorderPresetIcon preset={preset} size={size} className={className} />;
}

export function SpreadsheetHomeIcon({
  name,
  size = 18,
  className,
  style,
  ...props
}: SpreadsheetHomeIconProps) {
  const semanticId = SPREADSHEET_HOME_SEMANTIC_ICON_IDS[
    name as keyof typeof SPREADSHEET_HOME_SEMANTIC_ICON_IDS
  ] as OfficeSemanticIconId | undefined;

  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={[
        "docs-home-icon",
        semanticId ? officeIconStyles.root : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-office-icon-mirror={semanticId ? "none" : undefined}
      data-office-icon-state={semanticId ? "default" : undefined}
      data-office-semantic-icon={semanticId}
      data-spreadsheet-home-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      style={
        semanticId
          ? ({ ...style, "--office-icon-size": `${size}px` } as CSSProperties)
          : style
      }
      viewBox="0 0 24 24"
      width={size}
    >
      {semanticId ? (
        <g data-office-icon-glyph={semanticId}>
          <OfficeIconGlyph semanticId={semanticId} />
        </g>
      ) : (
        glyph(name)
      )}
    </svg>
  );
}

interface SpreadsheetNumberFormatMenuIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: NumberFormatMenuIconId;
  size?: number;
}

function numberFormatMenuGlyph(name: NumberFormatMenuIconId): ReactNode {
  switch (name) {
    case "general":
      return (
        <>
          <circle data-tone="accent" cx="16" cy="10" r="7.2" />
          <path data-tone="ink" d="M16 5.5v5h4" />
          <text
            data-tone="ink-fill"
            x="5.2"
            y="28"
            fontSize="9.2"
            fontWeight="650"
          >
            1
          </text>
          <text
            data-tone="ink-fill"
            x="12.9"
            y="25.5"
            fontSize="7.8"
            fontWeight="650"
          >
            2
          </text>
          <text
            data-tone="ink-fill"
            x="20.8"
            y="28"
            fontSize="9.2"
            fontWeight="650"
          >
            3
          </text>
        </>
      );
    case "number":
      return (
        <text
          data-tone="ink-fill"
          x="3.5"
          y="25"
          fontSize="23"
          fontWeight="300"
        >
          12
        </text>
      );
    case "currency":
      return (
        <>
          <rect data-tone="ink" x="3.5" y="5" width="20" height="14" rx="2" />
          <path data-tone="ink" d="M7 8.3h4.8M7 15.7h4.8" />
          <circle data-tone="ink" cx="16.5" cy="12" r="3" />
          <circle data-tone="warm" cx="23.5" cy="20.5" r="5" />
          <path data-tone="warm" d="M20.6 19h5.8M20.6 22h5.8" />
        </>
      );
    case "accounting":
      return (
        <>
          <rect data-tone="ink" x="6" y="2.5" width="20" height="27" rx="3" />
          <rect data-tone="ink" x="9" y="5.5" width="14" height="5" rx=".8" />
          {[10, 16, 22].flatMap((x) =>
            [15.5, 21.5, 27].map((y) => (
              <circle
                key={`${x}-${y}`}
                data-tone="ink-fill"
                cx={x}
                cy={y}
                r="1.25"
              />
            )),
          )}
        </>
      );
    case "date":
    case "long-date":
      return (
        <>
          <rect data-tone="ink" x="3.5" y="5" width="25" height="23" rx="2.2" />
          <path data-tone="ink" d="M3.5 11h25M9 2.8v5M23 2.8v5" />
          <text
            data-tone="ink-fill"
            x={name === "date" ? "12.2" : "8.2"}
            y="24"
            fontSize={name === "date" ? "13" : "11"}
            fontWeight="500"
          >
            {name === "date" ? "1" : "1A"}
          </text>
        </>
      );
    case "time":
      return (
        <>
          <circle data-tone="ink" cx="16" cy="16" r="13" />
          <path data-tone="ink" d="M16 8.5V16l5 3" />
        </>
      );
    case "percentage":
      return (
        <>
          <circle data-tone="ink" cx="9" cy="9" r="4" />
          <circle data-tone="ink" cx="23" cy="23" r="4" />
          <path data-tone="ink" d="M25.5 5.5 6.5 26.5" />
        </>
      );
    case "fraction":
      return (
        <>
          <text
            data-tone="ink-fill"
            x="4"
            y="13"
            fontSize="14"
            fontWeight="450"
          >
            1
          </text>
          <path data-tone="ink" d="M24.5 4.5 7 27.5" />
          <text
            data-tone="ink-fill"
            x="21"
            y="28"
            fontSize="14"
            fontWeight="450"
          >
            2
          </text>
        </>
      );
    case "scientific":
      return (
        <>
          <text
            data-tone="ink-fill"
            x="2.5"
            y="25"
            fontSize="21"
            fontWeight="300"
          >
            10
          </text>
          <text
            data-tone="accent-fill"
            x="23"
            y="12"
            fontSize="9"
            fontWeight="700"
          >
            2
          </text>
        </>
      );
    case "text":
      return (
        <text data-tone="ink-fill" x="2" y="25" fontSize="22" fontWeight="300">
          ab
        </text>
      );
  }
}

/** Screenshot-faithful glyphs for the Home Number Format listbox. */
export function SpreadsheetNumberFormatMenuIcon({
  name,
  size = 32,
  className,
  ...props
}: SpreadsheetNumberFormatMenuIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={className}
      data-spreadsheet-number-format-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.45}
      viewBox="0 0 32 32"
      width={size}
    >
      {numberFormatMenuGlyph(name)}
    </svg>
  );
}
