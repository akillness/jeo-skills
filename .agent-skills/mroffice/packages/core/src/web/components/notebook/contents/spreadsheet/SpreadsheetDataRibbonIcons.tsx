/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, SVGProps } from "react";

import { OfficeIconGlyph } from "../../../office-ribbon/icons/officeIconGlyphs";
import type { OfficeSemanticIconId } from "../../../office-ribbon/icons/officeIconRegistry";
import officeIconStyles from "../../../office-ribbon/icons/officeSemanticIcon.module.css";

/**
 * Spreadsheet-owned Data / Review / View glyphs.
 *
 * The secondary tabs share one 24px construction grid and the same semantic
 * colour roles as the mature Home/Page Layout icon sets.  Geometry is drawn
 * locally (rather than composed from font glyphs) so Safari, Chromium and
 * forced-colour mode keep identical proportions.
 */
export const SPREADSHEET_DATA_ICON_NAMES = [
  "sortAscending",
  "sortDescending",
  "sortDialog",
  "filter",
  "clearFilter",
  "reapplyFilter",
  "advancedFilter",
  "getData",
  "fromTextCsv",
  "fromPowerBi",
  "fromTableRange",
  "query",
  "workbookLinks",
  "textToColumns",
  "flashFill",
  "removeDuplicates",
  "validation",
  "analyze",
  "group",
  "ungroup",
  "newComment",
  "showComments",
  "previousComment",
  "nextComment",
  "deleteComment",
  "versionHistory",
  "spelling",
  "accessibility",
  "performance",
  "statistics",
  "protect",
  "notes",
  "sheetViews",
  "exitView",
  "keepView",
  "newView",
  "viewOptions",
  "headings",
  "gridlines",
  "formulaBar",
  "focusCell",
  "focusCellColor",
  "zoom100",
  "newWindow",
  "freezePanes",
  "freezeAtSelection",
  "freezeRows",
  "freezeColumns",
  "unfreezePanes",
  "fullScreen",
] as const;

export type SpreadsheetDataIconName =
  (typeof SPREADSHEET_DATA_ICON_NAMES)[number];

interface SpreadsheetDataIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: SpreadsheetDataIconName;
  size?: number;
}

/**
 * Review commands belong to every editor, so they take the registry's drawing
 * rather than a spreadsheet-only copy of it.
 *
 * Three neighbours stay local on purpose. sortAscending and sortDescending
 * carry the A-over-Z and Z-over-A letters Excel puts on them, which the
 * registry's plain line-and-arrow pair drops. deleteComment loses its deletion
 * mark entirely in review.comment.delete, leaving a bubble that reads as "add".
 */
const SPREADSHEET_DATA_SEMANTIC_ICON_IDS = {
  accessibility: "review.accessibility",
  protect: "review.protect",
  removeDuplicates: "table.removeDuplicates",
} as const satisfies Partial<
  Record<SpreadsheetDataIconName, OfficeSemanticIconId>
>;

/** A six-armed snowflake centred at (cx, cy), 2.2 units of reach: the mark
 * Excel puts on its freeze commands. */
function freezeSnowflake(cx: number, cy: number) {
  const arms = [0, 60, 120].map((degrees) => {
    const radians = (degrees * Math.PI) / 180;
    const dx = Math.cos(radians) * 2.2;
    const dy = Math.sin(radians) * 2.2;
    return `M${(cx - dx).toFixed(2)} ${(cy - dy).toFixed(2)}L${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`;
  });
  return <path className="docs-home-icon__accent" d={arms.join("")} strokeWidth="1.1" />;
}

function sheetGrid({ accent = false }: { accent?: boolean } = {}) {
  const className = accent
    ? "docs-home-icon__accent"
    : "docs-home-icon__ink-soft";
  return (
    <>
      <rect className="docs-home-icon__paper" x="3" y="4" width="18" height="16" rx="1.4" />
      <path className={className} d="M3 9h18M3 14h18M9 4v16M15 4v16" />
    </>
  );
}

function commentBubble() {
  return (
    <path
      className="docs-home-icon__paper"
      d="M4 4.5h15.5v11H10l-4.5 4v-4H4z"
    />
  );
}

function glyph(name: SpreadsheetDataIconName) {
  switch (name) {
    case "sortAscending":
    case "sortDescending": {
      const descending = name === "sortDescending";
      return (
        <>
          <text className="docs-home-icon__type-text" x="3" y="9" fontSize="7.2" fontWeight="750">
            {descending ? "Z" : "A"}
          </text>
          <text className="docs-home-icon__accent-text" x="3" y="19" fontSize="7.2" fontWeight="750">
            {descending ? "A" : "Z"}
          </text>
          <path className="docs-home-icon__ink" d="M14.5 4.5v15m0 0-3-3m3 3 3-3" />
          <path className="docs-home-icon__ink-soft" d="M19 6h2M19 10h2M19 14h2" />
        </>
      );
    }
    case "sortDialog":
      return (
        <>
          <path className="docs-home-icon__ink" d="M3.5 5h7M3.5 9h5.5M3.5 13h4" />
          <path className="docs-home-icon__accent-soft-fill" d="M12.5 4h8v16h-8z" />
          <path className="docs-home-icon__accent" d="M14.5 7h4M14.5 11h2.7M14.5 15h1.5" />
          <path className="docs-home-icon__ink" d="M5 17.5h5.5" />
        </>
      );
    case "filter":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 4.5h17L14 12v6l-4 2v-8Z" />
          <path className="docs-home-icon__accent" d="M7 8h10" />
        </>
      );
    case "clearFilter":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3.5 4.5h13L12 10v5l-3 1.5V10Z" />
          <path className="docs-home-icon__danger" d="m15 14 5 5m0-5-5 5" />
        </>
      );
    case "reapplyFilter":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3.5 4.5H14L10.5 9v5l-3 1.5V9Z" />
          <path className="docs-home-icon__accent" d="M14 10.5a5 5 0 1 1-1.1 7.5m1.1-7.5v3.7m0-3.7h-3.7" />
        </>
      );
    case "advancedFilter":
      return (
        <>
          <path className="docs-home-icon__ink" d="M3.5 4.5h12L11 10v5l-3 1.5V10Z" />
          <path className="docs-home-icon__accent" d="M16.5 11v9m-3-6h6m-6 3h6" />
        </>
      );
    case "getData":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 5h16v15H4z" />
          <path className="docs-home-icon__muted" d="M4 9h16M9.3 9v11M14.7 9v11" />
          <path className="docs-home-icon__accent" d="M12 2.5v10m0-10-3 3m3-3 3 3" />
        </>
      );
    // Get Data menu. From Text/CSV: a text file whose comma-separated rows
    // flow down into the sheet. From Power BI: a chart reached over a link,
    // drawn generically rather than as anyone's mark.
    case "fromTextCsv":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 3h9l5 5v6H5z" />
          <path className="docs-home-icon__ink-soft" d="M14 3v5h5M8 9h2.5M12 9h2.5M8 12h2.5M12 12h2.5" />
          <path className="docs-home-icon__ink" d="M11 9.4v.8M15 9.4v.8M11 12.4v.8" strokeWidth="1.4" />
          <path className="docs-home-icon__accent-soft-fill" d="M3 16h18v5H3z" />
          <path className="docs-home-icon__accent" d="M3 16h18v5H3zM9 16v5M15 16v5" />
          <path className="docs-home-icon__accent" d="M12 12.5v3m0 0-1.6-1.6M12 15.5l1.6-1.6" strokeWidth="1.4" />
        </>
      );
    case "fromPowerBi":
      return (
        <>
          <path className="docs-home-icon__accent-soft-fill" d="M9.5 11h3v9h-3zM14.5 6h3v14h-3z" />
          <path className="docs-home-icon__accent" d="M4.5 15h3v5h-3zM9.5 11h3v9h-3zM14.5 6h3v14h-3z" />
          <path className="docs-home-icon__ink-soft" d="M3.5 20.5h17" />
          <path className="docs-home-icon__warm" d="M4 4.5h4a2 2 0 0 1 2 2v0M8 2.5l2 2-2 2" />
        </>
      );
    case "fromTableRange":
      return (
        <>
          <rect className="docs-home-icon__paper" x="5" y="4" width="16" height="17" rx="2" />
          <path className="docs-home-icon__accent-soft-fill" d="M7 4.5h12a1.5 1.5 0 0 1 1.5 1.5v3.5h-15V6A1.5 1.5 0 0 1 7 4.5Z" />
          <path className="docs-home-icon__ink-soft" d="M5 10h16M5 15.5h16M10.5 10v11M15.8 4v17" />
          <circle cx="6" cy="6" r="5.5" fill="#fff" stroke="none" />
          <circle className="docs-home-icon__accent-fill" cx="6" cy="6" r="4.5" />
          <path d="M6 3.6v4.8m-2-2 2 2 2-2" stroke="#fff" />
        </>
      );
    case "query":
      return (
        <>
          <ellipse className="docs-home-icon__paper" cx="8.2" cy="6" rx="4.8" ry="2.5" />
          <path className="docs-home-icon__ink-soft" d="M3.4 6v8c0 1.4 2.1 2.5 4.8 2.5 1.1 0 2.1-.2 2.9-.5M3.4 10c0 1.4 2.1 2.5 4.8 2.5 1.2 0 2.3-.2 3.1-.6" />
          <path className="docs-home-icon__accent" d="M13 10.5h7.5v8H13zM15.3 13h3M15.3 16h3" />
        </>
      );
    case "workbookLinks":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 4h8.5v12H3.5zM12 8h8.5v12H12z" />
          <path className="docs-home-icon__accent" d="M8.5 13.5h7m-2.5-2 2.5 2-2.5 2" />
        </>
      );
    case "textToColumns":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3 5h7M3 9h7M3 13h7M3 17h7" />
          <path className="docs-home-icon__accent" d="M12 3.5v17M15 5h6M15 9h6M15 13h6M15 17h6" />
          <path className="docs-home-icon__warm" d="m8.5 19 3.5-2.5 3.5 2.5" />
        </>
      );
    case "flashFill":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__warm-fill" d="m13.2 2.5-4.3 8h3L10.8 18l4.8-9h-3.2z" />
        </>
      );
    case "removeDuplicates":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3" y="5" width="10" height="14" rx="1" />
          <rect className="docs-home-icon__muted" x="8" y="3" width="10" height="14" rx="1" />
          <circle className="docs-home-icon__danger" cx="18" cy="17.5" r="3.2" />
          <path className="docs-home-icon__danger" d="M16.2 17.5h3.6" />
        </>
      );
    case "validation":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3.5h11v17H4z" />
          <path className="docs-home-icon__ink-soft" d="M7 8h5M7 12h5M7 16h5" />
          <path className="docs-home-icon__accent" d="m15.3 11.8 2.1 2.1 3.6-4" />
          <path className="docs-home-icon__danger" d="m16 18 4-4m0 4-4-4" opacity=".72" />
        </>
      );
    case "analyze":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 19.5V5M4 19.5h16" />
          <path className="docs-home-icon__accent" d="m6.5 16 4-4 3 2 5-7" />
          <path className="docs-home-icon__warm-fill" d="m18.5 3 .65 1.85L21 5.5l-1.85.65L18.5 8l-.65-1.85L16 5.5l1.85-.65z" />
        </>
      );
    case "group":
    case "ungroup": {
      const add = name === "group";
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
          <circle className={add ? "docs-home-icon__accent-soft-fill" : "docs-home-icon__danger"} cx="12" cy="12" r="4.2" />
          <path className={add ? "docs-home-icon__accent" : "docs-home-icon__danger"} d={add ? "M9.8 12h4.4M12 9.8v4.4" : "M9.8 12h4.4"} />
        </>
      );
    }
    case "newComment":
      return (
        <>
          {commentBubble()}
          <circle className="docs-home-icon__accent-soft-fill" cx="18" cy="6" r="4" />
          <path className="docs-home-icon__accent" d="M18 3.8v4.4M15.8 6h4.4" />
        </>
      );
    case "showComments":
      return (
        <>
          {commentBubble()}
          <path className="docs-home-icon__accent" d="M8 8h8M8 11.5h6" />
        </>
      );
    case "previousComment":
    case "nextComment": {
      const next = name === "nextComment";
      return (
        <>
          {commentBubble()}
          <path className="docs-home-icon__accent" d={next ? "m10 8 4 3-4 3" : "m14 8-4 3 4 3"} />
        </>
      );
    }
    case "deleteComment":
      return (
        <>
          {commentBubble()}
          <path className="docs-home-icon__danger" d="m14.5 9 5 5m0-5-5 5" />
        </>
      );
    case "versionHistory":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="12" cy="12" r="8" />
          <path className="docs-home-icon__accent" d="M12 7.5V12l3 2M6.5 5.8H3.5v-3" />
          <path className="docs-home-icon__ink-soft" d="M4 7.5a9 9 0 0 1 2.5-2.6" />
        </>
      );
    case "spelling":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 17.5 9.2 4h2l5.2 13.5M6 13h8.5" />
          <path className="docs-home-icon__accent" d="m13.8 18 2.2 2 4-5" />
        </>
      );
    case "accessibility":
      return (
        <>
          <circle className="docs-home-icon__accent-fill" cx="12" cy="4.5" r="1.8" />
          <path className="docs-home-icon__ink" d="M4 8h16M12 8v5m0 0-4 7m4-7 4 7M7.5 8l1.5 5M16.5 8 15 13" />
        </>
      );
    case "performance":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 17a8 8 0 1 1 16 0" />
          <path className="docs-home-icon__accent" d="m12 14 5-6" />
          <circle className="docs-home-icon__warm-fill" cx="12" cy="14" r="1.5" />
          <path className="docs-home-icon__ink-soft" d="M7 17h10" />
        </>
      );
    case "statistics":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3.5h14v17H4z" />
          <path className="docs-home-icon__ink-soft" d="M7 7h8M7 10h8" />
          <path className="docs-home-icon__accent" d="M7 17v-3M11 17v-5M15 17v-8" />
        </>
      );
    case "protect":
      return (
        <>
          <path className="docs-home-icon__paper" d="M12 3.5 19 6v5.5c0 4.3-2.8 7.2-7 9-4.2-1.8-7-4.7-7-9V6z" />
          <rect className="docs-home-icon__accent-soft-fill" x="9" y="10.5" width="6" height="5" rx="1" />
          <path className="docs-home-icon__accent" d="M10.3 10.5V9.2a1.7 1.7 0 0 1 3.4 0v1.3" />
        </>
      );
    case "notes":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 3.5h14v13l-4 4H5z" />
          <path className="docs-home-icon__warm-fill" d="M15 16.5h4l-4 4z" />
          <path className="docs-home-icon__ink-soft" d="M8 8h8M8 11.5h6" />
        </>
      );
    case "sheetViews":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent-soft-fill" d="M4 12c2.2-3 4.9-4.5 8-4.5s5.8 1.5 8 4.5c-2.2 3-4.9 4.5-8 4.5S6.2 15 4 12Z" />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="2.2" />
        </>
      );
    case "exitView":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 4h9v16H4z" />
          <path className="docs-home-icon__danger" d="M10 12h11m0 0-3-3m3 3-3 3" />
        </>
      );
    case "keepView":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3.5h14l2 2v15H4z" />
          <path className="docs-home-icon__ink-soft" d="M7 3.5v6h9v-6M7 14h10v6.5" />
          <path className="docs-home-icon__accent" d="m13.5 16.5 1.6 1.6 3-3.4" />
        </>
      );
    case "newView":
      return (
        <>
          {sheetGrid()}
          <circle className="docs-home-icon__accent-soft-fill" cx="18" cy="6" r="4" />
          <path className="docs-home-icon__accent" d="M18 3.8v4.4M15.8 6h4.4" />
        </>
      );
    case "viewOptions":
      return (
        <>
          <path className="docs-home-icon__ink" d="M4 6h16M4 12h16M4 18h16" />
          <circle className="docs-home-icon__accent-soft-fill" cx="9" cy="6" r="2.2" />
          <circle className="docs-home-icon__accent-soft-fill" cx="15" cy="12" r="2.2" />
          <circle className="docs-home-icon__accent-soft-fill" cx="8" cy="18" r="2.2" />
        </>
      );
    case "headings":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent" d="M3 9h18M9 4v16" />
        </>
      );
    case "gridlines":
      return sheetGrid({ accent: true });
    case "formulaBar":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3" y="6" width="18" height="12" rx="1.4" />
          <path className="docs-home-icon__accent" d="m6 14 2.4-4 2.2 4M6.8 12.5h3M13 10h5M13 14h4" />
        </>
      );
    // Focus Cell (Excel View ▸ Show): the sheet with the active cell's whole
    // row and column tinted and the cell itself outlined heavier, which is
    // exactly what the command paints. The colour item is a painter's palette
    // whose wells carry the icon set's own colour roles.
    case "focusCell":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent-soft-fill" d="M3 9h18v5H3zM9 4h6v16H9z" />
          <path className="docs-home-icon__ink-soft" d="M3 9h18M3 14h18M9 4v16M15 4v16" />
          <rect className="docs-home-icon__accent" x="9" y="9" width="6" height="5" strokeWidth="1.6" />
        </>
      );
    case "focusCellColor":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M12 3.5c-4.8 0-8.5 3.6-8.5 8.1 0 4.6 3.7 8.4 8.3 8.4 1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7h1.7c2.3 0 4.2-1.8 4.2-4.1 0-3.7-3.8-6.4-8.5-6.4z"
          />
          <circle className="docs-home-icon__danger" cx="8" cy="12.5" r="1.5" />
          <circle className="docs-home-icon__warm-fill" cx="9.6" cy="8.2" r="1.5" />
          <circle className="docs-home-icon__accent-fill" cx="14.3" cy="7.4" r="1.5" />
          <circle className="docs-home-icon__magenta-fill" cx="17.6" cy="10.8" r="1.5" />
        </>
      );
    case "zoom100":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="10" cy="10" r="6.5" />
          <path className="docs-home-icon__ink" d="m14.8 14.8 5.2 5.2" />
          <text className="docs-home-icon__accent-text" x="5.3" y="12" fontSize="5.2" fontWeight="750">100</text>
        </>
      );
    case "newWindow":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3" y="5" width="13" height="13" rx="1" />
          <rect className="docs-home-icon__muted" x="8" y="3" width="13" height="13" rx="1" />
          <path className="docs-home-icon__accent" d="M13.5 11.5H20m0 0-2.5-2.5m2.5 2.5L17.5 14" />
        </>
      );
    case "freezePanes":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent" d="M9 4v16M3 9h18" />
          <path className="docs-home-icon__warm" d="M18.5 12v7M16 14.5h5M16.7 12.7l3.6 3.6M20.3 12.7l-3.6 3.6" />
        </>
      );
    // The Freeze Panes menu, as Excel for the web draws it: a sheet whose
    // frozen band is tinted and edged in the accent, with a small snowflake
    // in the frozen corner. The unfreeze icon is the same sheet thawed.
    case "freezeAtSelection":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent-soft-fill" d="M3 4h6v5H3zM9 4h12v5H9zM3 9h6v11H3z" />
          <path className="docs-home-icon__accent" d="M9 4v16M3 9h18" strokeWidth="1.4" />
          {freezeSnowflake(6, 6.5)}
        </>
      );
    case "freezeRows":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent-soft-fill" d="M3 4h18v5H3z" />
          <path className="docs-home-icon__accent" d="M3 9h18" strokeWidth="1.4" />
          {freezeSnowflake(6, 6.5)}
        </>
      );
    case "freezeColumns":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__accent-soft-fill" d="M3 4h6v16H3z" />
          <path className="docs-home-icon__accent" d="M9 4v16" strokeWidth="1.4" />
          {freezeSnowflake(6, 6.5)}
        </>
      );
    case "unfreezePanes":
      return (
        <>
          {sheetGrid()}
          <path className="docs-home-icon__warm" d="M16.5 12.5l4 4M20.5 12.5l-4 4M18.5 11.5v6M15.5 14.5h6" opacity="0.45" />
          <path className="docs-home-icon__ink-soft" d="M5 18.5c1.2-1 2.2-1 3.4 0s2.2 1 3.4 0" />
        </>
      );
    case "fullScreen":
      return (
        <path className="docs-home-icon__accent" d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
      );
  }
  const exhaustive: never = name;
  return exhaustive;
}

export function SpreadsheetDataIcon({
  name,
  size = 18,
  className,
  style,
  ...props
}: SpreadsheetDataIconProps) {
  const semanticId = SPREADSHEET_DATA_SEMANTIC_ICON_IDS[
    name as keyof typeof SPREADSHEET_DATA_SEMANTIC_ICON_IDS
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
      data-spreadsheet-data-icon={name}
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
