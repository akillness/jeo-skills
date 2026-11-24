/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { SVGProps } from "react";

export const SPREADSHEET_FORMULA_ICON_NAMES = [
  "insertFunction",
  "autoSum",
  "financial",
  "logical",
  "text",
  "dateTime",
  "lookup",
  "mathTrig",
  "moreFunctions",
  "statistical",
  "engineering",
  "information",
  "web",
  "other",
  "names",
  "showFormulas",
  "trace",
  "tracePrecedents",
  "traceDependents",
  "removeArrows",
  "errorCheck",
  "evaluate",
  "calculationOptions",
  "calculateWorkbook",
  "calculateSheet",
] as const;

export type SpreadsheetFormulaIconName =
  (typeof SPREADSHEET_FORMULA_ICON_NAMES)[number];

interface SpreadsheetFormulaIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: SpreadsheetFormulaIconName;
  size?: number;
}

function glyph(name: SpreadsheetFormulaIconName) {
  switch (name) {
    case "insertFunction":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="1.7"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.5 9.2h17M9.2 3.5v17"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.4 16.8h1.2l2.1-8.2c.3-1.2 1-1.8 2.1-1.8.6 0 1.1.2 1.5.5M13 12.2h4.1"
          />
          <path
            className="docs-home-icon__ink"
            d="M5.2 13.1h2.7m-1.35-1.35v2.7"
          />
        </>
      );
    case "autoSum":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M18.7 4.5H6.1l6 7.5-6 7.5h12.6"
          />
          <path
            className="docs-home-icon__accent"
            d="M16 9.2h4.2M18.1 7.1v4.2"
          />
        </>
      );
    case "financial":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="4"
            y="4.5"
            width="16"
            height="15"
            rx="2"
          />
          <path className="docs-home-icon__ink-soft" d="M4 8.5h16" />
          <path
            className="docs-home-icon__accent"
            d="M14.8 11.1c-.5-.6-1.2-.9-2.1-.9-1.2 0-2 .6-2 1.5 0 2.5 4.5 1 4.5 3.5 0 .9-.8 1.6-2.1 1.6-.9 0-1.8-.3-2.5-1M12.9 8.8v9.3"
          />
        </>
      );
    case "logical":
      return (
        <>
          <circle className="docs-home-icon__muted" cx="7" cy="7" r="3" />
          <circle className="docs-home-icon__muted" cx="17" cy="17" r="3" />
          <path
            className="docs-home-icon__ink"
            d="M9.3 9.3l5.4 5.4M14.7 7H20M4 17h5.3"
          />
          <path
            className="docs-home-icon__accent"
            d="M17.4 4.6 20 7l-2.6 2.4M6.6 14.6 4 17l2.6 2.4"
          />
        </>
      );
    case "text":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4.5 6h15M12 6v13M7.8 19h8.4"
          />
          <path
            className="docs-home-icon__accent"
            d="M5.5 10.5h4M14.5 10.5h4"
          />
        </>
      );
    case "dateTime":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="5.5"
            width="17"
            height="15"
            rx="2"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M7 3.5v4M17 3.5v4M3.5 9.5h17"
          />
          <circle
            className="docs-home-icon__accent"
            cx="15.7"
            cy="15.1"
            r="2.8"
          />
          <path className="docs-home-icon__accent" d="M15.7 13.6v1.7l1.2.7" />
        </>
      );
    case "lookup":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="3.5"
            width="12"
            height="12"
            rx="1.5"
          />
          <path className="docs-home-icon__ink-soft" d="M3.5 8h12M8 3.5v12" />
          <circle
            className="docs-home-icon__accent"
            cx="16.4"
            cy="16.4"
            r="3.2"
          />
          <path className="docs-home-icon__accent" d="m18.8 18.8 2 2" />
        </>
      );
    case "mathTrig":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4 18.5 9.2 5.5h2.2l5.2 13M6.2 13h8.2"
          />
          <path
            className="docs-home-icon__accent"
            d="M16.7 6.4a3.1 3.1 0 1 1 0 4.4"
          />
        </>
      );
    case "moreFunctions":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M5 6.5h14M5 12h14M5 17.5h8"
          />
          <circle
            className="docs-home-icon__accent"
            cx="18.5"
            cy="17.5"
            r="1"
            fill="currentColor"
            stroke="none"
          />
        </>
      );
    // The four categories below live only inside the More Functions menu, so
    // they are drawn for a 16 px menu row first: the Cupertino menu surface
    // flattens every stroke to 1 px and drops the semantic colours, which means
    // each glyph has to survive as a flat monochrome silhouette.
    case "statistical":
      // A normal distribution measured off its axis, partitioned at the two
      // inflection points — the shape Excel's Statistical functions work on
      // (NORM.DIST, STDEV, CONFIDENCE, PERCENTILE). Deliberately NOT the
      // histogram-under-a-curve of chart.type.statistical: that one names a
      // chart family, this one names a function shelf.
      return (
        <>
          <path className="docs-home-icon__ink" d="M3.2 18.4h17.6" />
          <path
            className="docs-home-icon__accent"
            d="M3.8 18.4c5.6 0 3.4-10.2 8.2-10.2s2.6 10.2 8.2 10.2"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M8.2 13.3v5.1M15.8 13.3v5.1"
          />
        </>
      );
    case "engineering":
      // A cogwheel: six square teeth on a fixed 9.6/6.5 radius pair with a hub.
      // Excel's Engineering shelf spans complex numbers, number-base and unit
      // conversion, bitwise work and Bessel/ERF — no one function is worth
      // drawing, so the icon names the discipline. Teeth are a closed toothed
      // rim rather than radial ticks so it cannot be mistaken for the
      // crosshair-in-a-circle of Go To Special.
      return (
        <>
          <path
            className="docs-home-icon__muted"
            d="M9.52 2.73A9.6 9.6 0 0 1 14.48 2.73L14.33 5.93A6.5 6.5 0 0 1 16.09 6.95L18.79 5.21A9.6 9.6 0 0 1 21.27 9.52L18.42 10.98A6.5 6.5 0 0 1 18.42 13.02L21.27 14.48A9.6 9.6 0 0 1 18.79 18.79L16.09 17.05A6.5 6.5 0 0 1 14.33 18.07L14.48 21.27A9.6 9.6 0 0 1 9.52 21.27L9.67 18.07A6.5 6.5 0 0 1 7.91 17.05L5.21 18.79A9.6 9.6 0 0 1 2.73 14.48L5.58 13.02A6.5 6.5 0 0 1 5.58 10.98L2.73 9.52A9.6 9.6 0 0 1 5.21 5.21L7.91 6.95A6.5 6.5 0 0 1 9.67 5.93Z"
          />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="3" />
        </>
      );
    case "information":
      // The universal information mark. Every function on this shelf answers
      // "what is this value?" — ISBLANK, ISNUMBER, TYPE, ERROR.TYPE, CELL,
      // INFO — so the icon asks the question rather than naming a value kind.
      // The dot sits above the stem, the inverse of the exclamation inside the
      // Error Checking triangle, and the container is a circle, not a triangle.
      return (
        <>
          <circle className="docs-home-icon__muted" cx="12" cy="12" r="8.6" />
          <path className="docs-home-icon__accent" d="M12 11.1v5.6" />
          <circle
            className="docs-home-icon__accent-fill"
            cx="12"
            cy="7.9"
            r="1.2"
            fill="currentColor"
            stroke="none"
          />
        </>
      );
    case "web":
      // A globe: the Web shelf's functions (ENCODEURL, FILTERXML, WEBSERVICE,
      // IMPORTRANGE) all deal in addresses and data from elsewhere. A meridian
      // and two parallels inside the rim, flat enough for a 16 px menu row.
      return (
        <>
          <circle className="docs-home-icon__muted" cx="12" cy="12" r="8.6" />
          <path className="docs-home-icon__accent" d="M12 3.4c-4.6 4.8-4.6 12.4 0 17.2M12 3.4c4.6 4.8 4.6 12.4 0 17.2" />
          <path className="docs-home-icon__ink-soft" d="M3.9 9.2h16.2M3.9 14.8h16.2" />
        </>
      );
    case "other":
      // "Other" is the residual shelf: every engine function that no named
      // category claimed is filed here so it stays discoverable. A folder of
      // unnamed items says that; the three dots are the folder's missing label,
      // not the "there is more" dot of the moreFunctions parent.
      return (
        <>
          <path
            className="docs-home-icon__muted"
            d="M3.4 7.6a1.7 1.7 0 0 1 1.7-1.7h3.9a1.2 1.2 0 0 1 .96.48l1.14 1.52h7.8a1.7 1.7 0 0 1 1.7 1.7v8.3a1.7 1.7 0 0 1-1.7 1.7H5.1a1.7 1.7 0 0 1-1.7-1.7Z"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="8.5"
            cy="13.8"
            r="1.2"
            fill="currentColor"
            stroke="none"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="12"
            cy="13.8"
            r="1.2"
            fill="currentColor"
            stroke="none"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="15.5"
            cy="13.8"
            r="1.2"
            fill="currentColor"
            stroke="none"
          />
        </>
      );
    case "names":
      return (
        <>
          <path
            className="docs-home-icon__muted"
            d="M4 5.5h10l6 6-8.5 8.5L4 12.5Z"
          />
          <circle className="docs-home-icon__accent" cx="8" cy="9.5" r="1.4" />
          <path className="docs-home-icon__ink" d="m12.2 12.2 3.4 3.4" />
        </>
      );
    case "showFormulas":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z"
          />
          <circle className="docs-home-icon__accent" cx="12" cy="12" r="2.4" />
          <path className="docs-home-icon__ink-soft" d="m6 4 12 16" />
        </>
      );
    case "trace":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="6"
            height="5"
            rx="1"
          />
          <rect
            className="docs-home-icon__muted"
            x="14.5"
            y="15"
            width="6"
            height="5"
            rx="1"
          />
          <path
            className="docs-home-icon__accent"
            d="M8.5 9.3c.8 4 4.2 2.2 6.5 5.7M12.8 13.2 15 15l-2.8.7"
          />
        </>
      );
    // Excel's auditing arrows run from a precedent (its dot) to the cell
    // that reads it. Trace Precedents draws the arrow INTO the selected cell
    // (dark), Trace Dependents OUT of it, Remove Arrows crosses the arrow out.
    case "tracePrecedents":
      return (
        <>
          <rect className="docs-home-icon__muted" x="3.5" y="4" width="6" height="5" rx="1" />
          <rect className="docs-home-icon__ink" x="14.5" y="15" width="6" height="5" rx="1" />
          <circle className="docs-home-icon__accent-fill" cx="6.5" cy="6.5" r="1.3" />
          <path className="docs-home-icon__accent" d="M6.5 6.5 15 15.2M15.2 11.9v3.5h-3.5" />
        </>
      );
    case "traceDependents":
      return (
        <>
          <rect className="docs-home-icon__ink" x="3.5" y="4" width="6" height="5" rx="1" />
          <rect className="docs-home-icon__muted" x="14.5" y="15" width="6" height="5" rx="1" />
          <circle className="docs-home-icon__accent-fill" cx="6.5" cy="6.5" r="1.3" />
          <path className="docs-home-icon__accent" d="M6.5 6.5 15 15.2M15.2 11.9v3.5h-3.5" />
        </>
      );
    case "removeArrows":
      return (
        <>
          <circle className="docs-home-icon__accent-soft" cx="4.8" cy="5.3" r="1.3" />
          <path className="docs-home-icon__ink-soft" d="M5 5.5 12.5 13M12.7 9.7v3.5H9.2" />
          <path className="docs-home-icon__accent" d="m14 14 6 6M20 14l-6 6" />
        </>
      );
    case "errorCheck":
      return (
        <>
          <path className="docs-home-icon__muted" d="M12 3.5 21 20H3Z" />
          <path className="docs-home-icon__accent" d="M12 8v5M12 16.5v.2" />
        </>
      );
    case "evaluate":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2"
          />
          <path className="docs-home-icon__ink-soft" d="M7 8h4M7 12h6M7 16h4" />
          <path className="docs-home-icon__accent" d="m15 10 4 2.5-4 2.5Z" />
        </>
      );
    case "calculationOptions":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="4"
            y="3.5"
            width="16"
            height="17"
            rx="2"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M7 7h10M8 11h2M14 11h2M8 15h2M14 15h2"
          />
          <path className="docs-home-icon__accent" d="M8 18h8" />
        </>
      );
    case "calculateWorkbook":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="4"
            width="13"
            height="16"
            rx="1.5"
          />
          <path className="docs-home-icon__ink-soft" d="M3.5 8h13M8 4v16" />
          <path
            className="docs-home-icon__accent"
            d="M17.2 11.5a4 4 0 1 1-1.1 6.9M17.2 11.5v3.2h-3.1"
          />
        </>
      );
    case "calculateSheet":
      return (
        <>
          <path className="docs-home-icon__muted" d="M5 3.5h10l4 4V20H5Z" />
          <path
            className="docs-home-icon__ink-soft"
            d="M15 3.5V8h4M8 11h8M8 14h5"
          />
          <path
            className="docs-home-icon__accent"
            d="M15.5 16.2a2.8 2.8 0 1 1-.7 2.7"
          />
        </>
      );
  }
  const exhaustive: never = name;
  return exhaustive;
}

/**
 * Spreadsheet-owned Formulas glyphs on the same 24 px geometry and semantic
 * color classes as the Home/Insert sets. The SVG scales to 16/20/24 px without
 * changing stroke authority, so formula bar, Ribbon, and dialog chrome share
 * one visual identity.
 */
export function SpreadsheetFormulaIcon({
  name,
  size = 20,
  className,
  ...props
}: SpreadsheetFormulaIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={`docs-home-icon${className ? ` ${className}` : ""}`}
      data-spreadsheet-formula-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.25}
      viewBox="0 0 24 24"
      width={size}
    >
      {glyph(name)}
    </svg>
  );
}
