"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import {
  FluentLibraryIcon,
  type FluentLibraryIconIds,
  type FluentLibraryIconPalette,
} from "./FluentLibraryIcon";

export type PageArtworkKind =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "code";

/**
 * The formats an editor's Export menu writes, drawn as the same layered
 * pages: the library's page types plus the files that are not page types.
 */
export type FileFormatArtworkKind =
  | PageArtworkKind
  | "csv"
  | "html"
  | "image"
  | "markdown"
  | "text"
  | "cad"
  // a handwriting document (a Docs page set up for the pen)
  | "handwriting";

function normalizePageType(pageType: string): PageArtworkKind {
  if (
    pageType === "document" ||
    pageType === "spreadsheet" ||
    pageType === "presentation" ||
    pageType === "pdf" ||
    pageType === "code"
  ) {
    return pageType;
  }
  return "document";
}

// Artwork is drawn again with every render of what holds it (an editor's
// ribbon menus, a window's chrome) though its props rarely change:
// memoized, it is not.
export const PageTypeArtwork = memo(function PageTypeArtwork({
  pageType,
  variant,
  className,
}: {
  pageType: string;
  /** The page row's variant (`page_variant`): "handwriting" for a
   *  handwriting document, which is a document page. */
  variant?: string | null;
  className?: string;
}) {
  return (
    <FileFormatArtwork
      format={variant === "handwriting" ? "handwriting" : normalizePageType(pageType)}
      className={className}
    />
  );
});

/** A file format on the page library's tile; the Export menus' glyph. */
export const FileFormatArtwork = memo(function FileFormatArtwork({
  format,
  className,
}: {
  format: FileFormatArtworkKind;
  className?: string;
}) {
  const palette = PAGE_PALETTES[format];

  return (
    <FluentLibraryIcon
      family="page"
      kind={format}
      palette={palette}
      className={className}
    >
      {(ids) => <PageMark kind={format} ids={ids} palette={palette} />}
    </FluentLibraryIcon>
  );
});

function PageMark({
  kind,
  ids,
  palette,
}: {
  kind: FileFormatArtworkKind;
  ids: FluentLibraryIconIds;
  palette: FluentLibraryIconPalette;
}) {
  return (
    <g>
      <g data-icon-part="page-rear">
        <path
          d="M25.2 9.2h19.1l8.1 8.2v30.4c0 2.3-1.8 4.1-4.1 4.1H25.2V9.2Z"
          fill={`url(#${ids.secondary})`}
          stroke={palette.secondaryBottom}
          strokeOpacity=".36"
          strokeWidth=".8"
        />
        <path
          d="M44.3 9.4v6c0 1.2.9 2.1 2.1 2.1h5.7"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity=".56"
          strokeWidth="1"
        />
      </g>

      <g data-icon-part="page-middle">
        <path
          d="M19.2 12.5h20.9l8 8.1v29.5c0 2.4-1.9 4.3-4.3 4.3H19.2V12.5Z"
          fill={`url(#${ids.primary})`}
          stroke={palette.primaryBottom}
          strokeOpacity=".42"
          strokeWidth=".85"
        />
        <path
          d="M40.1 12.7v6c0 1.2.9 2.1 2.1 2.1h5.6"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity=".52"
          strokeWidth="1"
        />
      </g>

      <g data-icon-part="page-front">
        <path
          d="M12.4 15.7h23.4l8.5 8.6v25.8c0 2.5-2 4.5-4.5 4.5H16.9c-2.5 0-4.5-2-4.5-4.5V15.7Z"
          fill="#fbfdfd"
          stroke={palette.primaryBottom}
          strokeOpacity=".48"
          strokeWidth=".95"
        />
        <path
          d="M12.9 20.3c2.1-2.7 5-3.9 8.7-3.9h13.7"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeOpacity=".92"
          strokeWidth="1.2"
        />
        <path
          d="M16.1 22.2v25.4"
          fill="none"
          stroke={`url(#${ids.badge})`}
          strokeLinecap="round"
          strokeWidth="2.5"
        />
        <PageContent kind={kind} palette={palette} />
      </g>

      <g data-icon-part="page-fold">
        <path
          d="M35.8 15.8v6.1c0 1.4 1.1 2.5 2.5 2.5h5.9l-8.4-8.6Z"
          fill={palette.secondaryTop}
          stroke={palette.primaryBottom}
          strokeLinejoin="round"
          strokeOpacity=".38"
          strokeWidth=".72"
        />
        <path
          d="M36.8 17.2v4.1c0 1.1.8 1.9 1.9 1.9h4"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeOpacity=".65"
          strokeWidth=".75"
        />
      </g>
    </g>
  );
}

function PageContent({
  kind,
  palette,
}: {
  kind: FileFormatArtworkKind;
  palette: FluentLibraryIconPalette;
}) {
  return (
    <g data-icon-part="page-content">
      {kind === "document" ? <DocumentContent palette={palette} /> : null}
      {kind === "spreadsheet" ? <SpreadsheetContent palette={palette} /> : null}
      {kind === "presentation" ? (
        <PresentationContent palette={palette} />
      ) : null}
      {kind === "pdf" ? <PdfContent palette={palette} /> : null}
      {kind === "code" ? <CodeContent palette={palette} /> : null}
      {kind === "csv" ? <CsvContent palette={palette} /> : null}
      {kind === "html" ? <HtmlContent palette={palette} /> : null}
      {kind === "image" ? <ImageContent palette={palette} /> : null}
      {kind === "markdown" ? <MarkdownContent palette={palette} /> : null}
      {kind === "text" ? <TextContent palette={palette} /> : null}
      {kind === "cad" ? <CadContent palette={palette} /> : null}
      {kind === "handwriting" ? <HandwritingContent palette={palette} /> : null}
    </g>
  );
}

/* Comma-separated values: the spreadsheet's rows without its grid, each
   cell a short run with a comma after it. */
function CsvContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path
        d="M20.4 29.6h4.4M27.6 29.6h4.4M34.8 29.6h3.4M20.4 35.2h4.4M27.6 35.2h4.4M34.8 35.2h3.4M20.4 40.8h4.4M27.6 40.8h4.4M34.8 40.8h3.4M20.4 46.4h4.4M27.6 46.4h4.4"
        stroke={palette.badgeBottom}
        strokeOpacity=".78"
        strokeWidth="1.55"
      />
      <path
        d="M26.1 30.4l-.5 1.3M33.3 30.4l-.5 1.3M26.1 36l-.5 1.3M33.3 36l-.5 1.3M26.1 41.6l-.5 1.3M33.3 41.6l-.5 1.3M26.1 47.2l-.5 1.3"
        stroke={palette.primaryBottom}
        strokeWidth="1.2"
      />
    </g>
  );
}

/* A web page: angle brackets on a browser-like frame with its address bar. */
function HtmlContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect
        x="19.8"
        y="27"
        width="19.1"
        height="20.2"
        rx="2.6"
        stroke={palette.badgeBottom}
        strokeWidth="1.4"
      />
      <path
        d="M19.8 31.6h19.1"
        stroke={palette.badgeBottom}
        strokeOpacity=".7"
        strokeWidth="1.2"
      />
      <circle cx="22.7" cy="29.3" r=".8" fill={palette.primaryBottom} />
      <circle cx="25.2" cy="29.3" r=".8" fill={palette.secondaryBottom} />
      <path
        d="m26.4 35.1-3.4 3.5 3.4 3.5M32.3 35.1l3.4 3.5-3.4 3.5M31.2 33.6l-3.6 10.2"
        stroke={palette.primaryBottom}
        strokeWidth="1.8"
      />
    </g>
  );
}

/* A picture: a framed landscape with its sun. */
function ImageContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinejoin="round">
      <rect
        x="19.8"
        y="27.6"
        width="19.1"
        height="19"
        rx="2.6"
        fill={palette.badgeBottom}
        fillOpacity=".08"
        stroke={palette.badgeBottom}
        strokeWidth="1.4"
      />
      <circle cx="25.1" cy="32.9" r="2.05" fill={palette.secondaryBottom} />
      <path
        d="M21.2 45.2l5.6-7 3.6 4.1 2.6-2.9 4.6 5.8H21.2Z"
        fill={palette.primaryBottom}
      />
    </g>
  );
}

/* Markdown: the M and the down arrow of its mark. */
function MarkdownContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect
        x="19.8"
        y="29.6"
        width="19.1"
        height="15"
        rx="2.6"
        stroke={palette.badgeBottom}
        strokeWidth="1.4"
      />
      <path
        d="M22.6 41.1v-8.2l3.1 3.9 3.1-3.9v8.2"
        stroke={palette.primaryBottom}
        strokeWidth="1.8"
      />
      <path
        d="M34.1 32.9v8.2M31.6 38.6l2.5 2.5 2.5-2.5"
        stroke={palette.badgeBottom}
        strokeWidth="1.8"
      />
    </g>
  );
}

/* Plain text: lines of even weight and nothing else. */
function TextContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path
        d="M20.2 28.6h18.1M20.2 32.8h18.1M20.2 37h18.1M20.2 41.2h18.1M20.2 45.4h11.4"
        stroke={palette.badgeBottom}
        strokeOpacity=".74"
        strokeWidth="1.55"
      />
    </g>
  );
}

/* A CAD drawing: a dimensioned part on a faint grid. */
function CadContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M20.4 31.4h18.2M20.4 36.4h18.2M20.4 41.4h18.2M25.4 27.6v18.6M31.4 27.6v18.6M37.4 27.6v18.6"
        stroke={palette.primaryBottom}
        strokeOpacity=".28"
        strokeWidth=".9"
      />
      <path
        d="M22.4 44.4l7-11.6 7 11.6Z"
        stroke={palette.badgeBottom}
        strokeWidth="1.7"
      />
      <circle cx="29.4" cy="40.2" r="1.6" stroke={palette.primaryBottom} strokeWidth="1.4" />
      <path
        d="M21.4 47.6h16M21.4 46.4v2.4M37.4 46.4v2.4"
        stroke={palette.secondaryBottom}
        strokeWidth="1.1"
      />
    </g>
  );
}

/* A handwriting document: dotted paper with a line written across it. */
function HandwritingContent({ palette }: { palette: FluentLibraryIconPalette }) {
  const dots: string[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      dots.push(`M${21.2 + column * 5.4} ${28.4 + row * 4.8}h.01`);
    }
  }
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={dots.join("")} stroke={palette.secondaryBottom} strokeOpacity=".55" strokeWidth="1.25" />
      <path
        d="M19.6 41.2c2.2-4.4 4.1-6.6 5.6-6.6 2.3 0 .2 7.6 2.6 7.6 1.9 0 3-5.4 5.1-5.4 1.6 0 1.2 3.6 2.8 3.6 1.1 0 2-1.1 3.1-2.6"
        stroke={palette.primaryBottom}
        strokeWidth="1.9"
      />
      <path d="m36.9 30.2 3.3-3.3 2.2 2.2-3.3 3.3-2.9.7.7-2.9Z" fill={palette.badgeBottom} stroke="none" />
    </g>
  );
}

function DocumentContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round">
      <rect
        x="20.2"
        y="27.2"
        width="13.8"
        height="3.1"
        rx="1.55"
        fill={palette.primaryBottom}
        stroke="none"
      />
      <path
        d="M20.2 35h18.1M20.2 39.2h18.1M20.2 43.4h12.8M20.2 47.6h15.2"
        stroke={palette.badgeBottom}
        strokeOpacity=".72"
        strokeWidth="1.55"
      />
    </g>
  );
}

function SpreadsheetContent({
  palette,
}: {
  palette: FluentLibraryIconPalette;
}) {
  return (
    <g fill="none" strokeLinejoin="round">
      <rect
        x="20.1"
        y="27"
        width="18.4"
        height="20.1"
        rx="2.2"
        stroke={palette.badgeBottom}
        strokeWidth="1.45"
      />
      <path
        d="M20.7 32.1h17.2M20.7 37h17.2M20.7 42h17.2M26.2 27.6v18.9M32.2 27.6v18.9"
        stroke={palette.primaryBottom}
        strokeOpacity=".62"
        strokeWidth="1"
      />
      <path
        d="M26.7 37.5h4.9v4h-4.9z"
        fill={palette.primaryBottom}
        stroke="none"
      />
    </g>
  );
}

function PresentationContent({
  palette,
}: {
  palette: FluentLibraryIconPalette;
}) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect
        x="20.1"
        y="27.2"
        width="18.8"
        height="14.1"
        rx="2.3"
        stroke={palette.badgeBottom}
        strokeWidth="1.55"
      />
      <path
        d="M29.5 41.5v4.2M25.9 45.8h7.3"
        stroke={palette.badgeBottom}
        strokeWidth="1.45"
      />
      <path
        d="M23.6 37.4v-3.3M27.2 37.4v-5.2M30.8 37.4v-7.5"
        stroke={palette.primaryBottom}
        strokeWidth="2.05"
      />
      <path
        d="M34.4 30.2a3.2 3.2 0 1 1-2.7 4.8h2.7v-4.8Z"
        fill={palette.secondaryBottom}
        stroke="none"
      />
    </g>
  );
}

function PdfContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path
        d="M20.3 30.1h11.4"
        stroke={palette.primaryBottom}
        strokeOpacity=".45"
        strokeWidth="1.2"
      />
      <rect
        x="19.8"
        y="33.2"
        width="18.7"
        height="12.6"
        rx="2.2"
        fill={palette.primaryBottom}
        stroke="none"
      />
      <text
        x="29.15"
        y="41.8"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="7.1"
        fontWeight="800"
        letterSpacing=".2"
        textAnchor="middle"
      >
        PDF
      </text>
    </g>
  );
}

function CodeContent({ palette }: { palette: FluentLibraryIconPalette }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect
        x="19.8"
        y="27"
        width="19.1"
        height="20.2"
        rx="2.6"
        fill={palette.badgeBottom}
        fillOpacity=".08"
        stroke={palette.badgeBottom}
        strokeWidth="1.4"
      />
      <path
        d="m26.9 32.4-3.7 3.8 3.7 3.8M31.8 32.4l3.7 3.8-3.7 3.8M31 30.7l-3.2 11.1"
        stroke={palette.primaryBottom}
        strokeWidth="1.9"
      />
      <path
        d="M23.2 44h7.3"
        stroke={palette.secondaryBottom}
        strokeWidth="1.35"
      />
    </g>
  );
}

const PAGE_PALETTES: Record<FileFormatArtworkKind, FluentLibraryIconPalette> = {
  document: {
    primaryTop: "#57b8f2",
    primaryBottom: "#2177c9",
    secondaryTop: "#88cdf5",
    secondaryBottom: "#3593d9",
    badgeTop: "#286fc1",
    badgeBottom: "#174b8e",
    accent: "#b9e3fb",
    shadow: "#174b8e",
  },
  spreadsheet: {
    primaryTop: "#49bd82",
    primaryBottom: "#178c52",
    secondaryTop: "#79d5a3",
    secondaryBottom: "#2aa76a",
    badgeTop: "#1e8b55",
    badgeBottom: "#0b5734",
    accent: "#a7e7c3",
    shadow: "#0b5734",
  },
  presentation: {
    primaryTop: "#f58d67",
    primaryBottom: "#d95732",
    secondaryTop: "#f9ad8d",
    secondaryBottom: "#e9714a",
    badgeTop: "#d15a35",
    badgeBottom: "#96331d",
    accent: "#ffd0bd",
    shadow: "#96331d",
  },
  pdf: {
    primaryTop: "#ef6c78",
    primaryBottom: "#cc344a",
    secondaryTop: "#f5969d",
    secondaryBottom: "#df4f5e",
    badgeTop: "#c33a4d",
    badgeBottom: "#851f31",
    accent: "#ffc1c7",
    shadow: "#851f31",
  },
  code: {
    primaryTop: "#4b8992",
    primaryBottom: "#285b63",
    secondaryTop: "#77acb1",
    secondaryBottom: "#3d7a82",
    badgeTop: "#315e66",
    badgeBottom: "#172f34",
    accent: "#a8e0dc",
    shadow: "#172f34",
  },
  // The spreadsheet's greens, a shade cooler: the same family of file.
  csv: {
    primaryTop: "#5cc39a",
    primaryBottom: "#1f8f66",
    secondaryTop: "#8bd9b7",
    secondaryBottom: "#35a97c",
    badgeTop: "#237f5c",
    badgeBottom: "#0f5a3f",
    accent: "#b4ead3",
    shadow: "#0f5a3f",
  },
  html: {
    primaryTop: "#42b7d5",
    primaryBottom: "#137a99",
    secondaryTop: "#7fd0e5",
    secondaryBottom: "#2596b6",
    badgeTop: "#17728d",
    badgeBottom: "#0b4a5c",
    accent: "#b5e8f3",
    shadow: "#0b4a5c",
  },
  image: {
    primaryTop: "#a98cf0",
    primaryBottom: "#6f47c9",
    secondaryTop: "#c4b0f5",
    secondaryBottom: "#8a66dc",
    badgeTop: "#6a45bf",
    badgeBottom: "#3f2680",
    accent: "#dcd0fb",
    shadow: "#3f2680",
  },
  markdown: {
    primaryTop: "#8593a8",
    primaryBottom: "#4a5a72",
    secondaryTop: "#a9b4c5",
    secondaryBottom: "#657690",
    badgeTop: "#4e5e76",
    badgeBottom: "#2a3646",
    accent: "#d3dae5",
    shadow: "#2a3646",
  },
  text: {
    primaryTop: "#9aa3ad",
    primaryBottom: "#5d6873",
    secondaryTop: "#b9c0c8",
    secondaryBottom: "#7c8792",
    badgeTop: "#5f6a75",
    badgeBottom: "#353d46",
    accent: "#dde2e7",
    shadow: "#353d46",
  },
  // ink: a violet-blue between the document's blue and the image's purple
  handwriting: {
    primaryTop: "#7d8cf4",
    primaryBottom: "#4652c9",
    secondaryTop: "#a8b3f8",
    secondaryBottom: "#6170dd",
    badgeTop: "#3f49b3",
    badgeBottom: "#262d78",
    accent: "#d3d9fd",
    shadow: "#262d78",
  },
  cad: {
    primaryTop: "#e0aa4c",
    primaryBottom: "#a86f10",
    secondaryTop: "#ecc57f",
    secondaryBottom: "#c48a24",
    badgeTop: "#9c6a14",
    badgeBottom: "#5f3f07",
    accent: "#f6e2b5",
    shadow: "#5f3f07",
  },
};
