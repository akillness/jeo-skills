/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode, SVGProps } from "react";

import { OfficeSemanticIcon } from "../../office-ribbon/icons/OfficeSemanticIcon";
import type { OfficeSemanticIconId } from "../../office-ribbon/icons/officeIconRegistry";

/**
 * Purpose-built Word-style glyphs for the document Insert ribbon.
 *
 * Insert commands describe durable document objects rather than generic app
 * actions, so the icons deliberately preview the object being created.  They
 * share the Home ribbon's neutral/blue/warm palette and fixed 24 px optical
 * box; regular strokes are 1 px and emphasis strokes are 1.4 px in CSS.
 */
export const DOCS_INSERT_ICON_NAMES = [
  "coverPage",
  "blankPage",
  "pageBreak",
  "table",
  "pictures",
  "shapes",
  "icons",
  "model3d",
  "smartArt",
  "chart",
  "screenshot",
  "media",
  "link",
  "tableOfContents",
  "bookmark",
  "crossReference",
  "comment",
  "header",
  "footer",
  "pageNumber",
  // Word's Header & Footer options and its Page Number gallery positions.
  "differentFirstPage",
  "differentOddEvenPages",
  "pageNumberTop",
  "pageNumberBottom",
  "pageNumberMargins",
  "pageNumberCurrentPosition",
  "pageNumberFormat",
  "pageNumberRemove",
  "textBox",
  "wordArt",
  "dropCap",
  // Word's Drop Cap menu: None and In Margin beside Dropped.
  "dropCapNone",
  "dropCapInMargin",
  "quickParts",
  "field",
  "dateTime",
  "signatureLine",
  "object",
  "equation",
  "symbol",
  "number",
  "textFromFile",
  "emoji",
] as const;

export type DocsInsertIconName = (typeof DOCS_INSERT_ICON_NAMES)[number];

/** Frozen adapter boundary for the first shared semantic SVG pilot. */
export const DOCS_INSERT_SEMANTIC_ICON_IDS: Readonly<
  Partial<Record<DocsInsertIconName, OfficeSemanticIconId>>
> = Object.freeze({
  coverPage: "page.cover.insert",
  blankPage: "page.blank.insert",
  pageBreak: "page.break.insert",
  table: "table.insert",
  pictures: "image.insert",
  shapes: "shape.insert",
  icons: "icon.insert",
  smartArt: "diagram.smartArt.insert",
  chart: "chart.insert",
  link: "link.insert",
  comment: "comment.add",
  textBox: "textBox.insert",
  symbol: "symbol.insert",
});

export const DOCS_INSERT_ICON_STROKE_WIDTH = 1;
export const DOCS_INSERT_ICON_EMPHASIS_STROKE_WIDTH = 1.4;

interface DocsInsertIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: DocsInsertIconName;
  size?: number;
}

function PageOutline({ children }: { children?: ReactNode }) {
  return (
    <>
      <path className="docs-home-icon__paper" d="M5 2.8h9.3L19 7.5v13.7H5z" />
      <path className="docs-home-icon__ink-soft" d="M14.3 2.8v4.7H19" />
      {children}
    </>
  );
}

function glyph(name: DocsInsertIconName) {
  switch (name) {
    case "coverPage":
      return (
        <PageOutline>
          <path className="docs-home-icon__warm-fill" d="M7.6 9.1h8.8v3H7.6z" />
          <path className="docs-home-icon__ink-soft" d="M8 15.1h8M8 17.6h5.5" />
        </PageOutline>
      );
    case "blankPage":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__accent-soft"
            d="M8 10.2h8M8 13.4h8M8 16.6h5.2"
          />
        </PageOutline>
      );
    case "pageBreak":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M4 2.8h16v6.5H4zM4 14.7h16v6.5H4z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M2.8 12h18.4"
            strokeDasharray="2 2"
          />
          <path
            className="docs-home-icon__accent"
            d="m9.7 9.8 2.3 2.3 2.3-2.3"
          />
        </>
      );
    case "table":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.8"
            y="4"
            width="18.4"
            height="16"
            rx="1.2"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M3.4 4.6h17.2v4H3.4z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M3 8.6h18"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M8.9 4.2v15.6M15.1 4.2v15.6M3 14h18"
          />
        </>
      );
    case "pictures":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.7"
            y="4.2"
            width="18.6"
            height="15.6"
            rx="1.4"
          />
          <circle
            className="docs-home-icon__warm-fill"
            cx="16.6"
            cy="8.2"
            r="1.6"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="m4 17.9 5.1-5.4 3.1 3 2.2-2 5.6 4.4z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m3.8 18 5.3-5.5 3.1 3 2.2-2 5.8 4.5"
          />
        </>
      );
    case "shapes":
      return (
        <>
          <rect
            className="docs-home-icon__accent-soft"
            x="3"
            y="4"
            width="9.5"
            height="9.5"
            rx="1.2"
          />
          <circle
            className="docs-home-icon__warm-fill"
            cx="15.5"
            cy="15.5"
            r="5.2"
          />
          <path
            className="docs-home-icon__warm docs-insert-icon__emphasis"
            d="M15.5 10.3a5.2 5.2 0 1 1-3.4 9.1"
          />
        </>
      );
    case "icons":
      return (
        <>
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M12 2.8 14.2 8l5.6.5-4.2 3.7 1.3 5.5-4.9-2.9-4.9 2.9 1.3-5.5-4.2-3.7L9.8 8z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M12 2.8 14.2 8l5.6.5-4.2 3.7 1.3 5.5-4.9-2.9-4.9 2.9 1.3-5.5-4.2-3.7L9.8 8z"
          />
        </>
      );
    case "model3d":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="m12 2.8 8 4.5v9.4l-8 4.5-8-4.5V7.3z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m4.3 7.5 7.7 4.4 7.7-4.4M12 11.9v8.8"
          />
          <path className="docs-home-icon__warm" d="m8 5.1 8 4.6" />
        </>
      );
    case "smartArt":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.8"
            y="4"
            width="6.2"
            height="4.5"
            rx=".8"
          />
          <rect
            className="docs-home-icon__paper"
            x="15"
            y="15.5"
            width="6.2"
            height="4.5"
            rx=".8"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M9.5 6.2h4.8a3.5 3.5 0 0 1 3.5 3.5v2.5"
          />
          <path
            className="docs-home-icon__warm docs-insert-icon__emphasis"
            d="m15.3 11.4 2.5 2.5 2.5-2.5"
          />
        </>
      );
    case "chart":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M3.2 20.5V3.5M3.2 20.5h18"
          />
          <path className="docs-home-icon__accent-soft-fill" d="M6 13h3v6H6z" />
          <path className="docs-home-icon__warm-fill" d="M11 8h3v11h-3z" />
          <path className="docs-home-icon__magenta-fill" d="M16 4h3v15h-3z" />
        </>
      );
    case "screenshot":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"
          />
          <rect
            className="docs-home-icon__paper"
            x="5.5"
            y="7"
            width="13"
            height="10"
            rx="1.2"
          />
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="12"
            cy="12"
            r="3"
          />
          <circle
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            cx="12"
            cy="12"
            r="3"
          />
        </>
      );
    case "media":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.7"
            y="4.2"
            width="18.6"
            height="15.6"
            rx="1.4"
          />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="m10 8.5 6 3.5-6 3.5z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m10 8.5 6 3.5-6 3.5z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M6 4.5v3M18 4.5v3M6 16.5v3M18 16.5v3"
          />
        </>
      );
    case "link":
      return (
        <>
          <path
            className="docs-home-icon__ink docs-insert-icon__emphasis"
            d="m9.4 14.6-1.6 1.6a4 4 0 0 1-5.6-5.6l3.2-3.2A4 4 0 0 1 11 7"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m14.6 9.4 1.6-1.6a4 4 0 0 1 5.6 5.6l-3.2 3.2A4 4 0 0 1 13 17"
          />
          <path className="docs-home-icon__ink-soft" d="m8.5 15.5 7-7" />
        </>
      );
    case "tableOfContents":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M8 9h1.6M8 12.5h1.6M8 16h1.6"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M11.8 9h4.8M11.8 12.5h4.8M11.8 16h4.8"
          />
          <path className="docs-home-icon__warm" d="M7.8 19h8.8" />
        </PageOutline>
      );
    case "bookmark":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__warm-fill"
            d="M8 3h5v9.2l-2.5-1.7L8 12.2z"
          />
          <path
            className="docs-home-icon__warm docs-insert-icon__emphasis"
            d="M8 3h5v9.2l-2.5-1.7L8 12.2z"
          />
        </PageOutline>
      );
    case "crossReference":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M2.8 3.5h8.7v13H2.8zM12.5 7.5h8.7v13h-8.7z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M7.2 10h8.4m-2.1-2.1 2.1 2.1-2.1 2.1"
          />
          <path className="docs-home-icon__warm" d="M5 6.5h4M15 16h4" />
        </>
      );
    case "comment":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M3 4h18v13H10l-4.5 3v-3H3z"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M12 7v7M8.5 10.5h7"
          />
        </>
      );
    case "header":
    case "footer": {
      const header = name === "header";
      return (
        <PageOutline>
          <path
            className="docs-home-icon__warm-fill"
            d={header ? "M6 8h12v3H6z" : "M6 16h12v3H6z"}
          />
          <path
            className="docs-home-icon__ink-soft"
            d={header ? "M8 14h8M8 17h5" : "M8 10h8M8 13h5"}
          />
        </PageOutline>
      );
    }
    case "pageNumber":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M9 14.2h5.8M9 17h5.8M10.6 12.8l-.8 5.6M14 12.8l-.8 5.6"
          />
        </PageOutline>
      );
    // ── Word's Header & Footer options ───────────────────────────────────
    // Two sheets side by side: the option is about how the FIRST sheet (or the
    // odd/even pair) differs from the rest, which one sheet cannot show.
    case "differentFirstPage":
      return (
        <>
          <path className="docs-home-icon__paper" d="M2.6 4h8.4v16H2.6z" />
          <path
            className="docs-home-icon__warm-fill"
            d="M3.6 5.1h6.4v2.4H3.6z"
          />
          <path className="docs-home-icon__ink-soft" d="M4.3 10.4h5M4.3 13h5" />
          <path className="docs-home-icon__paper" d="M13 4h8.4v16H13z" />
          <path className="docs-home-icon__ink-soft" d="M14.7 10.4h5M14.7 13h5" />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M14 5.1h6.4"
          />
        </>
      );
    case "differentOddEvenPages":
      return (
        <>
          <path className="docs-home-icon__paper" d="M2.6 4h8.4v16H2.6z" />
          <path
            className="docs-home-icon__warm-fill"
            d="M3.6 16.5h4.2v2.4H3.6z"
          />
          <path className="docs-home-icon__ink-soft" d="M4.3 8h5M4.3 10.6h5" />
          <path className="docs-home-icon__paper" d="M13 4h8.4v16H13z" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M16.6 16.5h4.2v2.4h-4.2z"
          />
          <path className="docs-home-icon__ink-soft" d="M14.7 8h5M14.7 10.6h5" />
        </>
      );
    // ── Word's Page Number gallery positions ─────────────────────────────
    // Each one is the sheet with the numeral drawn where the field lands, so a
    // reader can pick the position without reading the label.
    case "pageNumberTop":
    case "pageNumberBottom": {
      const top = name === "pageNumberTop";
      return (
        <PageOutline>
          <path
            className="docs-home-icon__warm-fill"
            d={top ? "M6 8h12v3.4H6z" : "M6 15.6h12V19H6z"}
          />
          <text
            className="docs-home-icon__accent-text"
            x="11"
            y={top ? "11" : "18.6"}
            fontFamily="Arial, sans-serif"
            fontSize="4.4"
            fontWeight="700"
          >
            1
          </text>
          <path
            className="docs-home-icon__ink-soft"
            d={top ? "M8 14.4h8M8 17h5.4" : "M8 9.4h8M8 12h5.4"}
          />
        </PageOutline>
      );
    }
    case "pageNumberMargins":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__warm-fill"
            d="M14.6 10.2h3.4v4h-3.4z"
          />
          <text
            className="docs-home-icon__accent-text"
            x="15.5"
            y="13.4"
            fontFamily="Arial, sans-serif"
            fontSize="4.2"
            fontWeight="700"
          >
            1
          </text>
          <path
            className="docs-home-icon__ink-soft"
            d="M7.6 9.4h5M7.6 12h5M7.6 14.6h5M7.6 17.2h3.4"
          />
        </PageOutline>
      );
    case "pageNumberCurrentPosition":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__ink-soft"
            d="M7.6 9.4h8.4M7.6 17.2h8.4"
          />
          {/* The caret the field is inserted at. */}
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M11.4 11.4v4M10.2 11.4h2.4M10.2 15.4h2.4"
          />
          <text
            className="docs-home-icon__accent-text"
            x="13.2"
            y="15"
            fontFamily="Arial, sans-serif"
            fontSize="4.4"
            fontWeight="700"
          >
            1
          </text>
        </PageOutline>
      );
    case "pageNumberFormat":
      return (
        <PageOutline>
          <text
            className="docs-home-icon__accent-text"
            x="7.4"
            y="13.4"
            fontFamily="Arial, sans-serif"
            fontSize="4.6"
            fontWeight="700"
          >
            1
          </text>
          <text
            className="docs-home-icon__type-text"
            x="10.4"
            y="13.4"
            fontFamily="Georgia, serif"
            fontSize="4.6"
          >
            i
          </text>
          <text
            className="docs-home-icon__type-text"
            x="12.6"
            y="13.4"
            fontFamily="Arial, sans-serif"
            fontSize="4.6"
          >
            A
          </text>
          <path className="docs-home-icon__warm" d="M7.4 16.4h8.6" />
        </PageOutline>
      );
    case "pageNumberRemove":
      return (
        <PageOutline>
          <path
            className="docs-home-icon__ink-soft"
            d="M7.6 9.4h8.4M7.6 12h5.4"
          />
          <path
            className="docs-home-icon__danger docs-insert-icon__emphasis"
            d="m8.8 15 5.2 5.2m0-5.2L8.8 20.2"
          />
        </PageOutline>
      );
    case "textBox":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.8"
            y="4"
            width="18.4"
            height="16"
            rx="1.2"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m7.2 17 2.5-8h1.6l2.5 8M8.4 13.4h4.2"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M14.4 9h4M14.4 12h4M14.4 15h4"
          />
        </>
      );
    case "wordArt":
      return (
        <>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M3.6 20 9.2 4h2.2L17 20M6.5 13.5h7.6"
          />
          <path
            className="docs-home-icon__warm"
            d="M13.5 5.2c3.4 1.2 5.7 3.6 6.9 7.1"
          />
        </>
      );
    case "dropCap":
      return (
        <>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m3.2 20 4.2-15.8h2.1L13.7 20M5.2 13.3h6.5"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M13 6h8M13 10h8M13 14h8M13 18h6"
          />
        </>
      );
    case "dropCapNone":
      return (
        <path
          className="docs-home-icon__ink-soft"
          d="M3 6h18M3 10h18M3 14h18M3 18h12"
        />
      );
    case "dropCapInMargin":
      return (
        <>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="m1.6 16 3.2-11.8h1.6L9.6 16M3 11.1h5"
          />
          <path className="docs-home-icon__ink-soft" d="M11 4v16" />
          <path
            className="docs-home-icon__ink-soft"
            d="M13 6h8M13 10h8M13 14h8M13 18h6"
          />
        </>
      );
    case "number":
      return (
        <>
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M4 8.2 6.4 6.6V17M4.2 17h4.4"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12 7.8c.4-1 1.3-1.6 2.5-1.6 1.5 0 2.5.9 2.5 2.2 0 2.4-5 4.2-5 8.6h5.2"
          />
          <path className="docs-home-icon__warm" d="M19.2 6.6v10.4" />
        </>
      );
    case "textFromFile":
      return (
        <>
          <path
            className="docs-home-icon__paper"
            d="M5 3h9l5 5v13H5z"
          />
          <path className="docs-home-icon__ink-soft" d="M14 3v5h5" />
          <path
            className="docs-home-icon__ink-soft"
            d="M8 11h8M8 14h8M8 17h5"
          />
        </>
      );
    case "quickParts":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="3"
            y="3"
            width="8"
            height="8"
            rx="1"
          />
          <rect
            className="docs-home-icon__accent-soft-fill"
            x="13"
            y="3"
            width="8"
            height="8"
            rx="1"
          />
          <rect
            className="docs-home-icon__warm-fill"
            x="3"
            y="13"
            width="8"
            height="8"
            rx="1"
          />
          <rect
            className="docs-home-icon__paper"
            x="13"
            y="13"
            width="8"
            height="8"
            rx="1"
          />
        </>
      );
    case "field":
      return (
        <>
          <path
            className="docs-home-icon__ink-soft"
            d="M7 4H3v16h4M17 4h4v16h-4"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M9 17V7.5h6M9 12h5"
          />
        </>
      );
    case "dateTime":
      return (
        <>
          <rect
            className="docs-home-icon__paper"
            x="2.8"
            y="4.5"
            width="13.5"
            height="14.5"
            rx="1.2"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M3 8.5h13M6 2.8v3.5M13 2.8v3.5"
          />
          <circle
            className="docs-home-icon__warm-fill"
            cx="17.4"
            cy="16.4"
            r="4.2"
          />
          <path className="docs-home-icon__ink-soft" d="M17.4 13.8v2.8l1.8 1" />
        </>
      );
    case "signatureLine":
      return (
        <>
          <path
            className="docs-home-icon__ink docs-insert-icon__emphasis"
            d="M4.2 18.8h15.6M5.8 15.7l2.3-2.3 2.2 1.8 4.6-5.7 3.3 2.8"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M5.4 5.1 9 8.7M9 5.1 5.4 8.7"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M11.8 6.9h7M11.8 9.7h5"
          />
        </>
      );
    case "object":
      return (
        <PageOutline>
          <rect
            className="docs-home-icon__accent-soft-fill"
            x="8"
            y="10"
            width="8"
            height="7"
            rx="1"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M8 10h8v7H8zM10 12h4M10 14.5h3"
          />
        </PageOutline>
      );
    case "equation":
      return (
        <>
          <path
            className="docs-home-icon__ink docs-insert-icon__emphasis"
            d="M3 7h8M5 7v11M9 7v11M4 18h2M8 18h2"
          />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M14 7h7M17.5 3.5v7M14.5 16.5h6"
          />
        </>
      );
    case "symbol":
      return (
        <path
          className="docs-home-icon__accent docs-insert-icon__emphasis"
          d="M5 19h4v-2.2a7 7 0 1 1 6 0V19h4M8 19h8"
        />
      );
    case "emoji":
      return (
        <>
          <circle
            className="docs-home-icon__accent-soft-fill"
            cx="12"
            cy="12"
            r="8.6"
          />
          <circle
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            cx="12"
            cy="12"
            r="8.6"
          />
          <path
            className="docs-home-icon__ink docs-insert-icon__emphasis"
            d="M8.6 9.3h.1M15.3 9.3h.1M8.2 14.1c1 1.4 2.2 2.1 3.8 2.1s2.8-.7 3.8-2.1"
          />
          <path className="docs-home-icon__warm" d="M6.6 12.2h1M16.4 12.2h1" />
        </>
      );
  }
}

export function DocsInsertIcon({
  name,
  size = 24,
  className,
  ...props
}: DocsInsertIconProps) {
  const semanticId = DOCS_INSERT_SEMANTIC_ICON_IDS[name];
  if (semanticId) {
    return (
      <OfficeSemanticIcon
        semanticId={semanticId}
        size={size}
        className={["docs-insert-icon", className].filter(Boolean).join(" ")}
      />
    );
  }

  return (
    <svg
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={["docs-home-icon", "docs-insert-icon", className]
        .filter(Boolean)
        .join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      /* Safety net for a glyph element that carries no `docs-home-icon__*`
         paint class: without a root stroke it would render invisibly. Any
         paint class still wins (a class selector beats a presentation
         attribute), so the ribbon's two-tone language is untouched. */
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {glyph(name)}
    </svg>
  );
}
