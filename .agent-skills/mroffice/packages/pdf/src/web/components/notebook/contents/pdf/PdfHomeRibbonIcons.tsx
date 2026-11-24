/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, SVGProps } from "react";

import { OfficeIconGlyph } from "@mrnote/core/web/components/office-ribbon/icons/officeIconGlyphs.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import officeIconStyles from "@mrnote/core/web/components/office-ribbon/icons/officeSemanticIcon.module.css";

export const PDF_HOME_RIBBON_ICON_NAMES = [
  "hand",
  "select",
  "convertEditable",
  "convertSpreadsheet",
  "convertPresentation",
  "convertImage",
  "convertText",
  "convertCad",
  "convertImageOnly",
  "splitMerge",
  "splitPages",
  "mergePages",
  "play",
  "readMode",
  "lineNumbers",
  "zoomOut",
  "zoomIn",
  "actualSize",
  "fitPage",
  "fitWidth",
  "navBack",
  "navForward",
  "firstPage",
  "previousPage",
  "nextPage",
  "lastPage",
  "rotateDocument",
  "layers",
  "singlePage",
  "doublePage",
  "continuousReading",
  "reflow",
  "editContent",
  "translateDocument",
  "translateSelection",
  "screenshot",
  "screenshotRect",
  "screenshotEllipse",
  "screenshotRounded",
  "screenshotFreeform",
  "screenshotScreen",
  "snapshotLatex",
  "compress",
  "documentEncrypt",
  "verifySignatures",
] as const;

export type PdfHomeRibbonIconName =
  (typeof PDF_HOME_RIBBON_ICON_NAMES)[number];

interface PdfHomeRibbonIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: PdfHomeRibbonIconName;
  size?: number;
}

/**
 * Hand and Select are not PDF commands; they are the pointer modes every
 * editor with a canvas offers, and the registry draws them. Taking the shared
 * glyph here also settles the Insert tab, which reaches these two through
 * PdfInsertPointerIcon rather than drawing its own.
 *
 * The shell below is kept rather than returning <OfficeSemanticIcon> outright:
 * data-pdf-home-icon is how the viewer's tests find these two, and the caller's
 * own SVG props have to survive.
 */
const PDF_HOME_SEMANTIC_ICON_IDS = {
  hand: "edit.hand",
  select: "edit.select",
} as const satisfies Partial<
  Record<PdfHomeRibbonIconName, OfficeSemanticIconId>
>;

function glyph(name: PdfHomeRibbonIconName) {
  switch (name) {
    case "hand":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M8.1 11.1V5.2a1.35 1.35 0 0 1 2.7 0v4.2-5.7a1.35 1.35 0 0 1 2.7 0v5.7-4.8a1.35 1.35 0 0 1 2.7 0v5.5-3.4a1.35 1.35 0 0 1 2.7 0v6.5c0 4.6-2.8 7.2-7.1 7.2h-.9c-2.7 0-4.3-1.3-5.7-3.4L3.4 14.2a1.5 1.5 0 0 1 2.4-1.8z"
          />
          <path
            className="docs-home-icon__ink"
            d="M8.1 11.1V5.2a1.35 1.35 0 0 1 2.7 0v4.2-5.7a1.35 1.35 0 0 1 2.7 0v5.7-4.8a1.35 1.35 0 0 1 2.7 0v5.5-3.4a1.35 1.35 0 0 1 2.7 0v6.5c0 4.6-2.8 7.2-7.1 7.2h-.9c-2.7 0-4.3-1.3-5.7-3.4L3.4 14.2a1.5 1.5 0 0 1 2.4-1.8z"
          />
          <path className="docs-home-icon__ink-soft" d="M10.8 9.4v2M13.5 9.4v2M16.2 10.1v1.8" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M7.2 17.1h10.7v3.1H8.8z"
          />
          <path className="docs-home-icon__accent" d="M7.2 17.1h10.7" />
        </>
      );
    case "select":
      return (
        <>
          <path
            className="docs-home-icon__accent-soft"
            d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"
          />
          <path
            className="docs-home-icon__paper"
            d="m7.1 6.1 10.2 7-4.2 1.1-2.2 4.1z"
          />
          <path
            className="docs-home-icon__ink"
            d="m7.1 6.1 10.2 7-4.2 1.1-2.2 4.1z"
          />
          <path className="docs-home-icon__accent" d="m13.2 14.3 3.2 4.2" />
          <circle className="docs-home-icon__accent-fill" cx="7.1" cy="6.1" r="1.25" />
        </>
      );
    case "convertEditable":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.5 2.8h9.2l3.8 3.8v13.8h-13z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.7 2.8v3.8h3.8M6.4 9.3h6.8M6.4 12.2h5.2M6.4 15.1h4"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M13.1 12.4h7.4v8.1h-7.4z"
          />
          <path
            className="docs-home-icon__accent"
            d="M13.1 12.4h7.4v8.1h-7.4zM15 10.1l2.2 2.3 2.3-2.3"
          />
          <path
            className="docs-home-icon__accent-text"
            d="m14.5 14.6 1.1 3.6 1.6-2.5 1.5 2.5 1.1-3.6"
          />
        </>
      );
    case "convertSpreadsheet":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.6 10.3h9.1v10.1h-9.1z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.6 10.3h9.1v10.1h-9.1zM11.6 13.7h9.1M11.6 17.1h9.1M14.6 10.3v10.1M17.7 10.3v10.1"
          />
          <path
            className="docs-home-icon__accent-text"
            d="m6.8 18 2-2 2 2M8.8 16v5"
          />
        </>
      );
    case "convertPresentation":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.4 10.4h9.4v7.1h-9.4z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.4 10.4h9.4v7.1h-9.4zM14 19.8h4.2M16.1 17.5v2.3"
          />
          <path
            className="docs-home-icon__accent-text"
            d="M13.2 12.4h5.8M13.2 14.2h3.7"
          />
          <path className="docs-home-icon__accent" d="m7 18 2-2 2 2M9 16v5" />
        </>
      );
    case "convertImage":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.2 10.2h9.7v8.3h-9.7z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.2 10.2h9.7v8.3h-9.7zM12.4 17l2.6-2.7 1.7 1.6 1.4-1.3 1.6 2.4"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="18.4"
            cy="12.5"
            r="1.05"
          />
          <path className="docs-home-icon__accent" d="m7 18 2-2 2 2M9 16v5" />
        </>
      );
    case "convertText":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.2 10.2h9.7v8.3h-9.7z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.2 10.2h9.7v8.3h-9.7zM12.4 12.3h2.1M13.45 12.3v3.8M15.2 12.3l2.2 3.8M17.4 12.3l-2.2 3.8M18.1 12.3h1.8M19 12.3v3.8"
          />
          <path className="docs-home-icon__accent" d="m7 18 2-2 2 2M9 16v5" />
        </>
      );
    case "convertCad":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.2 10.2h9.7v8.3h-9.7z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.2 10.2h9.7v8.3h-9.7zM12.5 16.5l2.9-4.3 3.7 4.3M13.6 14.9h4.2M12.2 19.8h8M13 19v1.6M19.2 19v1.6"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="15.4"
            cy="12.2"
            r="0.85"
          />
          <path className="docs-home-icon__accent" d="m7 18 2-2 2 2M9 16v5" />
        </>
      );
    case "convertImageOnly":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.3 2.8h8.8l3.5 3.5v13.9H3.3z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.1 2.8v3.5h3.5M6.1 9.2h5.3M6.1 12h3.8M6.1 14.8h3"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.2 10.2h9.7v8.3h-9.7z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.2 10.2h9.7v8.3h-9.7zM12.5 16.9l2.5-2.7 1.8 1.7 1.3-1.2 1.6 2.2"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="18.3"
            cy="12.5"
            r="1"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="M12.7 19.7h7.1M13.5 18.9v1.6M15.3 18.9v1.6M17.1 18.9v1.6M18.9 18.9v1.6"
          />
          <path className="docs-home-icon__accent" d="m7 18 2-2 2 2M9 16v5" />
        </>
      );
    case "splitMerge":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.2 3.1h7.6v7.7H3.2zM13.2 13.2h7.6v7.7h-7.6z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M5.3 5.5h3.4M5.3 7.7h3.4M15.3 15.6h3.4M15.3 17.8h3.4"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.2 3.8h2.9v16.4h-2.9z"
          />
          <path
            className="docs-home-icon__accent"
            d="M12.6 4.2v5.4M10.4 7.5l2.2 2.2 2.2-2.2M12.6 19.8v-5.4M10.4 16.5l2.2-2.2 2.2 2.2"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="12.6"
            cy="12"
            r="1.15"
          />
        </>
      );
    case "splitPages":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.4 3h7.5v18H3.4zM13.1 3h7.5v18h-7.5z" />
          <path className="docs-home-icon__ink-soft" d="M5.5 7h3.3M5.5 10h3.3M15.2 7h3.3M15.2 10h3.3" />
          <path className="docs-home-icon__accent" d="M12 4.5v15M9.7 7 12 4.7 14.3 7M9.7 17 12 19.3l2.3-2.3" />
        </>
      );
    case "mergePages":
      return (
        <>
          <path className="docs-home-icon__paper" d="M2.9 3h7.5v18H2.9zM13.6 3h7.5v18h-7.5z" />
          <path className="docs-home-icon__ink-soft" d="M5 7h3.3M5 10h3.3M15.7 7H19M15.7 10H19" />
          <path className="docs-home-icon__accent-soft-fill" d="M8.8 8.1h6.4v7.8H8.8z" />
          <path className="docs-home-icon__accent" d="m8.4 9.6 2.4 2.4-2.4 2.4M15.6 9.6 13.2 12l2.4 2.4" />
        </>
      );
    case "play":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.2 3.4h17.6v12.7H3.2z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3.2 6.1h17.6M9.1 20.5h5.8M12 16.1v4.4"
          />
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="12"
            cy="11"
            r="4.15"
          />
          <circle
            className="docs-home-icon__accent"
            cx="12"
            cy="11"
            r="4.15"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m10.8 8.8 3.5 2.2-3.5 2.2z"
          />
          <circle
            className="docs-home-icon__ink-fill"
            cx="5"
            cy="4.75"
            r="0.45"
          />
          <circle
            className="docs-home-icon__ink-fill"
            cx="6.6"
            cy="4.75"
            r="0.45"
          />
        </>
      );
    case "readMode":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8A7.1 7.1 0 0 1 12 3.2z"
          />
          <path
            className="docs-home-icon__ink"
            d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8A7.1 7.1 0 0 1 12 3.2z"
          />
          <path className="docs-home-icon__accent" d="M15.8 5.2v3.2M14.2 6.8h3.2" />
          <circle className="docs-home-icon__accent-fill" cx="18.7" cy="10.6" r="1.2" />
        </>
      );
    case "lineNumbers":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M7 3.5h12v17H7z"
          />
          <path
            className="docs-home-icon__ink"
            d="M7 3.5h12v17H7zM11.5 8h4.7M11.5 12h4.7M11.5 16h4.7"
          />
          <path
            className="docs-home-icon__accent"
            d="M4.1 7.1h1.4v2M4.1 9.1h2M4.1 12.1h1.4l-1.4 2h1.5M4 17h1.6l-1.6 2h1.6"
          />
        </>
      );
    case "zoomOut":
      return (
        <>
          <circle
            className="docs-home-icon__paper"
            cx="10.1"
            cy="10.1"
            r="6.15"
          />
          <circle
            className="docs-home-icon__ink"
            cx="10.1"
            cy="10.1"
            r="6.15"
          />
          <path className="docs-home-icon__ink" d="m14.6 14.6 5.2 5.2" />
          <path className="docs-home-icon__accent" d="M6.9 10.1h6.4" />
        </>
      );
    case "zoomIn":
      return (
        <>
          <circle
            className="docs-home-icon__paper"
            cx="10.1"
            cy="10.1"
            r="6.15"
          />
          <circle
            className="docs-home-icon__ink"
            cx="10.1"
            cy="10.1"
            r="6.15"
          />
          <path className="docs-home-icon__ink" d="m14.6 14.6 5.2 5.2" />
          <path className="docs-home-icon__accent" d="M6.9 10.1h6.4M10.1 6.9v6.4" />
        </>
      );
    case "actualSize":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.2 5.2h17.6v13.6H3.2z" />
          <path className="docs-home-icon__ink" d="M3.2 5.2h17.6v13.6H3.2z" />
          <path className="docs-home-icon__accent" d="M6.2 8.1v7.8M5.1 9.2l1.1-1.1 1.1 1.1M5.1 14.8l1.1 1.1 1.1-1.1M10 9.4h1.8v5.2H10M14.2 9.4h1.8v5.2h-1.8" />
        </>
      );
    case "fitPage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M6.2 3h11.6v18H6.2z" />
          <path className="docs-home-icon__ink-soft" d="M8.6 6.4h6.8M8.6 9.2h6.8M8.6 12h4.7" />
          <path className="docs-home-icon__accent" d="M3.2 8V3.2H8M16 3.2h4.8V8M20.8 16v4.8H16M8 20.8H3.2V16" />
        </>
      );
    case "fitWidth":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.1 4.3h15.8v15.4H4.1z" />
          <path className="docs-home-icon__ink-soft" d="M7.1 8h9.8M7.1 11h9.8M7.1 14h6.4" />
          <path className="docs-home-icon__accent" d="M2.8 12h5M4.9 9.9 2.8 12l2.1 2.1M21.2 12h-5M19.1 9.9l2.1 2.1-2.1 2.1" />
        </>
      );
    case "navBack":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M7.2 6.1h7.1a5.7 5.7 0 0 1 5.7 5.7v5.7"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M3.2 6.1 8.6 2.8v6.6z"
          />
          <path className="docs-home-icon__accent" d="m8.6 2.8-5.4 3.3 5.4 3.3" />
        </>
      );
    case "navForward":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M16.8 6.1H9.7A5.7 5.7 0 0 0 4 11.8v5.7"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="m20.8 6.1-5.4-3.3v6.6z"
          />
          <path className="docs-home-icon__accent" d="m15.4 2.8 5.4 3.3-5.4 3.3" />
        </>
      );
    case "firstPage":
      return (
        <>
          <path className="docs-home-icon__ink" d="M5 4.2v15.6" />
          <path className="docs-home-icon__ink" d="m17 5.2-6.8 6.8 6.8 6.8" />
        </>
      );
    case "previousPage":
      return (
        <path className="docs-home-icon__ink" d="m15.8 5.2-6.8 6.8 6.8 6.8" />
      );
    case "nextPage":
      return (
        <path className="docs-home-icon__ink" d="m8.2 5.2 6.8 6.8-6.8 6.8" />
      );
    case "lastPage":
      return (
        <>
          <path className="docs-home-icon__ink" d="m7 5.2 6.8 6.8L7 18.8" />
          <path className="docs-home-icon__ink" d="M19 4.2v15.6" />
        </>
      );
    case "rotateDocument":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M5.2 2.8h8.6l4 4v13.7H5.2z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M13.8 2.8v4h4M8 8.9h5.9M8 11.6h4.2"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M8.1 13.5h10.5v7.1H8.1z"
          />
          <path
            className="docs-home-icon__accent"
            d="M17.7 15.4a4.3 4.3 0 1 0 .2 3.3M17.7 15.4v-3M17.7 15.4h-3"
          />
        </>
      );
    case "layers":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="m12 3.2 8.2 4.4L12 12 3.8 7.6z"
          />
          <path
            className="docs-home-icon__ink"
            d="m12 3.2 8.2 4.4L12 12 3.8 7.6z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="m4.3 11.1 7.7 4.1 7.7-4.1M4.3 14.8l7.7 4.1 7.7-4.1"
          />
          <path className="docs-home-icon__accent" d="M4.3 18.5 12 22l7.7-3.5" />
        </>
      );
    case "singlePage":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M6.4 2.7h11.2v18.6H6.4z"
          />
          <path
            className="docs-home-icon__ink"
            d="M6.4 2.7h11.2v18.6H6.4z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M8.8 6.3h6.4M8.8 9.1h6.4M8.8 11.9h4.5"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M8.2 15.1h7.6v3.6H8.2z"
          />
          <path className="docs-home-icon__accent" d="M8.2 15.1h7.6v3.6H8.2z" />
        </>
      );
    case "doublePage":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M2.8 4h8.1v16H2.8zM13.1 4h8.1v16h-8.1z"
          />
          <path
            className="docs-home-icon__ink"
            d="M2.8 4h8.1v16H2.8zM13.1 4h8.1v16h-8.1z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M4.8 7h4M4.8 9.5h4M15.1 7h4M15.1 9.5h4"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M4.5 13.1h4.7v3.7H4.5zM14.8 13.1h4.7v3.7h-4.7z"
          />
          <path
            className="docs-home-icon__accent"
            d="M10.9 5.6h2.2M10.9 18.4h2.2"
          />
        </>
      );
    case "reflow":
      // One column of text lines, the reading view's.
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 2.8h14v18.4H5z" />
          <path className="docs-home-icon__ink" d="M5 2.8h14v18.4H5z" />
          <path className="docs-home-icon__ink-soft" d="M8 7h8M8 10h8M8 13h8M8 16h5" />
        </>
      );
    case "continuousReading":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.2 2.8h13.1v5.1H3.2zM3.2 9.5h13.1v5.1H3.2zM3.2 16.2h13.1v5.1H3.2z"
          />
          <path
            className="docs-home-icon__ink"
            d="M3.2 2.8h13.1v5.1H3.2zM3.2 9.5h13.1v5.1H3.2zM3.2 16.2h13.1v5.1H3.2z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M5.2 5.3h6.9M5.2 12h6.9M5.2 18.7h6.9"
          />
          <path
            className="docs-home-icon__accent"
            d="M19.7 4v14.5M17.5 16.4l2.2 2.2 2.2-2.2"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="19.7"
            cy="4"
            r="1.15"
          />
        </>
      );
    case "editContent":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4.6 2.8h9.2l4 4v14.4H4.6z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M13.8 2.8v4h4M7.6 7.2h3.5M7.6 18.4h7.2"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="M7.2 9.4h7.9v6.5H7.2z"
            strokeDasharray="1.6 1.4"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.2 10.8v3.7M9.8 10.8h2.8M9.8 14.5h2.8"
          />
          <path className="docs-home-icon__ink" d="M18.9 11.7v7.1" />
          <path
            className="docs-home-icon__ink-soft"
            d="M17.6 11.7h2.6M17.6 18.8h2.6"
          />
        </>
      );
    case "translateDocument":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.6 2.8h8.7l3.7 3.7v13.9H3.6z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.3 2.8v3.7H16M6.4 9.2h6.6M6.4 12h4.8M6.4 14.8h3.4"
          />
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="17.2"
            cy="16.7"
            r="4.1"
          />
          <path
            className="docs-home-icon__accent"
            d="M13.1 16.7h8.2M17.2 12.6c1.1 1.1 1.7 2.4 1.7 4.1s-.6 3-1.7 4.1M17.2 12.6c-1.1 1.1-1.7 2.4-1.7 4.1s.6 3 1.7 4.1"
          />
          <path className="docs-home-icon__ink" d="M7.4 6.2h3.8M9.3 5.1v2.2" />
        </>
      );
    case "translateSelection":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.7 3.1h10.2l3.2 3.2v14H3.7z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M13.9 3.1v3.2h3.2M6.4 8.7h7.7M6.4 11.4h6.2M6.4 14.1h4.5"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="M5.7 7.6h9.2v5H5.7z"
            strokeDasharray="1.5 1.25"
          />
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="17.6"
            cy="17.2"
            r="4"
          />
          <path
            className="docs-home-icon__accent"
            d="M13.6 17.2h8M17.6 13.2c1.05 1.05 1.6 2.35 1.6 4s-.55 2.95-1.6 4M17.6 13.2c-1.05 1.05-1.6 2.35-1.6 4s.55 2.95 1.6 4"
          />
          <path className="docs-home-icon__ink" d="M7.1 9.4h5.9M9.2 8.4v2" />
        </>
      );
    case "screenshot":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4 7.2h3l1.3-2h7.4l1.3 2h3v11.1H4z"
          />
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="12"
            cy="12.7"
            r="3.3"
          />
          <circle
            className="docs-home-icon__accent"
            cx="12"
            cy="12.7"
            r="3.3"
          />
          <path
            className="docs-home-icon__accent"
            d="M2.8 5.2V2.8h2.4M18.8 2.8h2.4v2.4M21.2 18.8v2.4h-2.4M5.2 21.2H2.8v-2.4"
          />
          <circle className="docs-home-icon__ink-fill" cx="17.4" cy="9.5" r=".7" />
        </>
      );
    case "screenshotRect":
    case "screenshotEllipse":
    case "screenshotRounded":
    case "screenshotFreeform": {
      const outline =
        name === "screenshotRect"
          ? "M4.2 5.6h15.6v12.8H4.2z"
          : name === "screenshotEllipse"
            ? "M12 5.6c4.3 0 7.8 2.87 7.8 6.4s-3.5 6.4-7.8 6.4-7.8-2.87-7.8-6.4 3.5-6.4 7.8-6.4z"
            : name === "screenshotRounded"
              ? "M7.4 5.6h9.2a3.2 3.2 0 0 1 3.2 3.2v6.4a3.2 3.2 0 0 1-3.2 3.2H7.4a3.2 3.2 0 0 1-3.2-3.2V8.8a3.2 3.2 0 0 1 3.2-3.2z"
              : "M5 8.2 9.6 4.8l6.6 1.6 3.6 5.2-2.6 6.2-6.8 1.4-4.8-4.4z";
      return (
        <>
          <path className="docs-home-icon__accent-soft-fill" d={outline} />
          <path
            className="docs-home-icon__accent"
            d={outline}
            strokeDasharray="2.2 1.6"
          />
          <path className="docs-home-icon__ink" d="m15.6 15.4 4.6 4.6M17.2 20.4h3.2v-3.2" />
        </>
      );
    }
    case "screenshotScreen":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.2 4.4h17.6v11.6H3.2z" />
          <path className="docs-home-icon__ink-soft" d="M9.2 19.6h5.6M12 16v3.6" />
          <path
            className="docs-home-icon__accent"
            d="M5.6 6.8h12.8v6.8H5.6z"
            strokeDasharray="2.2 1.6"
          />
          <circle className="docs-home-icon__accent-fill" cx="12" cy="10.2" r="1.5" />
        </>
      );
    case "snapshotLatex":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.6 6.5h16.8v12.2H3.6z" />
          <path className="docs-home-icon__ink-soft" d="M6.1 9.2h4.2M6.1 12h3.1" />
          <path className="docs-home-icon__accent" d="m11.8 9.1 2.2 3.1-2.2 3.1M18.1 9.1l-2.2 3.1 2.2 3.1M2.8 5.2V2.8h2.4M18.8 2.8h2.4v2.4M21.2 18.8v2.4h-2.4M5.2 21.2H2.8v-2.4" />
        </>
      );
    case "compress":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4.4 2.8h9l4.1 4.1v14.3H4.4z"
          />
          <path className="docs-home-icon__ink-soft" d="M13.4 2.8v4.1h4.1M7.3 8.8h5.5M7.3 11.5h4.2" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M8.1 13.8h8.8v6.1H8.1z"
          />
          <path
            className="docs-home-icon__accent"
            d="M8.1 16.8h3.1M10 14.9l1.8 1.9-1.8 1.9M16.9 16.8h-3.1M15 14.9l-1.8 1.9 1.8 1.9"
          />
        </>
      );
    case "documentEncrypt":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.8 2.8h9.1l3.8 3.8v13.8H3.8z"
          />
          <path className="docs-home-icon__ink-soft" d="M12.9 2.8v3.8h3.8M6.7 9h6.5M6.7 11.8h4.6" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M11.3 13.1h9.1v7.5h-9.1z"
          />
          <path
            className="docs-home-icon__accent"
            d="M11.3 13.1h9.1v7.5h-9.1zM13.5 13.1v-1.4a2.4 2.4 0 0 1 4.8 0v1.4"
          />
          <circle className="docs-home-icon__accent-fill" cx="15.8" cy="16.5" r="1" />
          <path className="docs-home-icon__accent" d="M15.8 17.4v1.3" />
        </>
      );
    case "verifySignatures":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3.8 2.8h9.1l3.8 3.8v13.8H3.8z"
          />
          <path className="docs-home-icon__ink-soft" d="M12.9 2.8v3.8h3.8M6.7 9h6.5M6.7 11.8h4.6" />
          <path className="docs-home-icon__ink" d="M6.4 16.2c1-1.4 1.9-1.4 2.4 0 .5 1.3 1.2 1.3 2-.3" />
          <circle className="docs-home-icon__accent-soft-fill" cx="16.6" cy="16.6" r="4.4" />
          <circle className="docs-home-icon__accent" cx="16.6" cy="16.6" r="4.4" />
          <path className="docs-home-icon__accent" d="M14.7 16.7l1.3 1.3 2.6-2.7" />
        </>
      );
  }

  const exhaustiveName: never = name;
  return exhaustiveName;
}

/** PDF-owned, two-tone Home ribbon glyphs on the shared 24px Office grid. */
export function PdfHomeRibbonIcon({
  name,
  size = 24,
  className,
  style,
  ...props
}: PdfHomeRibbonIconProps) {
  const semanticId = PDF_HOME_SEMANTIC_ICON_IDS[
    name as keyof typeof PDF_HOME_SEMANTIC_ICON_IDS
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
      data-pdf-home-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.25}
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
