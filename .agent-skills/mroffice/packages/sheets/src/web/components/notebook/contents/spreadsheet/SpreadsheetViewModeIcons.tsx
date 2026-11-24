/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { SVGProps } from "react";

export const SPREADSHEET_VIEW_MODE_ICON_NAMES = [
  "normal",
  "pageLayout",
  "pageBreakPreview",
  "macros",
  "macroView",
  "macroRecord",
] as const;

export type SpreadsheetViewModeIconName =
  (typeof SPREADSHEET_VIEW_MODE_ICON_NAMES)[number];

interface SpreadsheetViewModeIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: SpreadsheetViewModeIconName;
  size?: number;
}

function glyph(name: SpreadsheetViewModeIconName) {
  switch (name) {
    case "normal":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1.2"
          />
          <path
            className="docs-home-icon__muted"
            d="M3.5 9.3h17M3.5 14.7h17M9.2 4v16M14.8 4v16"
          />
          <rect
            className="docs-home-icon__accent-soft-fill"
            x="9.9"
            y="10"
            width="4.2"
            height="4"
            rx="0.45"
          />
        </>
      );
    case "pageLayout":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 2.8h14v18.4H5z" />
          <path
            className="docs-home-icon__muted"
            d="M7.5 5.4h9M7.5 18.6h9M8 8h8v8H8z"
          />
          <path className="docs-home-icon__accent" d="M9.8 10h4.4M9.8 12h4.4" />
        </>
      );
    case "macros":
      // Excel's View > Macros: a sheet of recorded steps with a run badge.
      // Each step is a bullet and its line; the accent play badge in the
      // corner says "run", ringed in paper so it reads as sitting on top.
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="3"
            width="14"
            height="16.5"
            rx="1.6"
          />
          <path
            className="docs-home-icon__accent"
            d="M6.4 7.2h.01M6.4 10.9h.01M6.4 14.6h.01"
            strokeWidth="1.9"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M9 7.2h5.6M9 10.9h4M9 14.6h2.2"
          />
          <circle
            className="docs-home-icon__paper"
            cx="17.2"
            cy="17.2"
            r="5.3"
            strokeWidth="0"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="17.2"
            cy="17.2"
            r="4.5"
          />
          <path
            d="M15.9 15v4.4l3.6-2.2z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="0.6"
          />
        </>
      );
    case "macroView":
      // View Macros: the list of saved macros, one of them ready to run.
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1.6"
          />
          <path
            d="M6.6 7v4l3.4-2z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.6"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12 9h5.6M6.8 13.4h10.8M6.8 16.6h7.4"
          />
        </>
      );
    case "macroRecord":
      // Record Macro: the recorder's ring with its red dot (red on every
      // surface: a recorder's dot is not themed).
      return (
        <>
          <circle className="docs-home-icon__ink" cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.8" fill="#d13438" stroke="none" />
        </>
      );
    case "pageBreakPreview":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="1.2"
          />
          <path
            className="docs-home-icon__muted"
            d="M3.5 8.7h17M9.2 4v16M14.8 4v16"
          />
          <path
            className="docs-home-icon__accent"
            d="M3.5 14.8h17M9.2 8.7v11"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M10 9.5h4v4.5h-4z"
          />
        </>
      );
  }
}

export function SpreadsheetViewModeIcon({
  name,
  size = 16,
  className,
  ...props
}: SpreadsheetViewModeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`docs-home-icon${className ? ` ${className}` : ""}`}
      data-spreadsheet-view-mode-icon={name}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {glyph(name)}
    </svg>
  );
}
