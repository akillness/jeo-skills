/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";

export type PdfCommentRibbonIconName =
  | "highlight"
  | "areaHighlight"
  | "draw"
  | "note"
  | "attachment"
  | "stamp"
  | "measure"
  | "shape"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "replaceMark"
  | "insertCaret"
  | "commentMode"
  | "hideComments"
  | "manageComments"
  | "exportComments"
  | "excerptPage"
  | "aiSummary"
  | "importComments"
  | "readAloud"
  | "readAloudSettings"
  | "readAloudPrevious"
  | "readAloudNext"
  | "pause"
  | "stop"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "eraser"
  | "copy"
  | "paste"
  | "duplicate"
  | "delete";

const SHARED_ICONS: Partial<
  Record<PdfCommentRibbonIconName, OfficeSemanticIconId>
> = {
  commentMode: "review.comment",
  draw: "draw.pen",
  eraser: "draw.eraser.stroke",
  highlight: "draw.highlighter",
  measure: "view.ruler",
  note: "comment.add",
  readAloud: "review.readAloud",
  shape: "shape.insert",
};

function PdfCommentGlyph({ name }: { name: PdfCommentRibbonIconName }) {
  switch (name) {
    case "areaHighlight":
      return (
        <>
          <rect x="4" y="4.5" width="16" height="15" rx="2" />
          <path d="M7 8h10M7 11.5h7.5M7 15h9" />
          <path d="M5.5 18h13" strokeWidth="2.5" opacity=".55" />
        </>
      );
    case "attachment":
      return (
        <path d="m8.2 12.8 7.1-7.1a3.7 3.7 0 0 1 5.2 5.2L11 20.4a5.2 5.2 0 0 1-7.4-7.4l9-9a2.7 2.7 0 0 1 3.8 3.8l-8.2 8.1a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" />
      );
    case "stamp":
      return (
        <>
          <path d="M9 4.2a3 3 0 0 1 6 0c0 2.1-.8 3.7-2 5.3v2.2h5.2l1.3 2.3v2.2h-15V14l1.3-2.3H11V9.5C9.8 7.9 9 6.3 9 4.2Z" />
          <path d="M6.2 19.7h11.6" />
        </>
      );
    case "underline":
      return (
        <>
          <path d="M7 4.5v6.2a5 5 0 0 0 10 0V4.5" />
          <path d="M5.5 19.5h13" strokeWidth="2" />
        </>
      );
    case "strikeout":
      return (
        <>
          <path d="M16.8 7.1c-.9-1.6-2.5-2.4-4.8-2.4-2.8 0-4.6 1.2-4.6 3.1 0 1.7 1.3 2.6 4.7 3.2 3.1.5 4.5 1.4 4.5 3.3 0 2.1-1.9 3.4-4.9 3.4-2.4 0-4.2-.9-5.2-2.6" />
          <path d="M4 12h16" strokeWidth="2" />
        </>
      );
    case "squiggly":
      return (
        <g data-pdf-comment-glyph="squiggly-markup">
          <path d="M5 6.5h14M5 10.5h10" opacity=".7" />
          <path
            d="M4 17c1.2-2 2.4-2 3.6 0s2.4 2 3.6 0 2.4-2 3.6 0 2.4 2 3.6 0 2.4-2 3.6 0"
            strokeWidth="2"
          />
        </g>
      );
    case "replaceMark":
      return (
        <g data-pdf-comment-glyph="replace-markup">
          <path d="M4.5 6.5h15M4.5 10.5h11" opacity=".7" />
          <path d="M3.5 10.5h17" strokeWidth="2" />
          <path d="m6 20 3-5 3 5M16 15v6M13 18h6" />
        </g>
      );
    case "insertCaret":
      return (
        <>
          <path d="m6.5 18 5.5-9 5.5 9" />
          <path d="M12 9V4M9.5 4h5" />
        </>
      );
    case "hideComments":
      return (
        <>
          <path d="M5 6.5h14v9h-8l-4 3v-3H5Z" />
          <path d="m3.5 3.5 17 17" strokeWidth="2" />
        </>
      );
    case "manageComments":
      return (
        <g data-pdf-comment-glyph="comments-pane">
          <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
          <path d="M8.5 4v16" opacity=".6" />
          <path d="M11.5 7.5h6M11.5 11h4.5" />
          <path d="M11.5 14.5h6v3h-4l-2 1.5z" />
        </g>
      );
    case "exportComments":
      return (
        <>
          <path d="M5 4.5h10v15H5zM8 8h4M8 11h4" />
          <path d="M14 14h6M17.5 11.5 20 14l-2.5 2.5" strokeWidth="2" />
        </>
      );
    case "excerptPage":
      return (
        <g data-pdf-comment-glyph="excerpt-page">
          <path d="M6 3.5h8.5L19 8v12.5H6z" />
          <path d="M14.5 3.5V8H19" />
          <path d="M9 12h7M9 15h5" />
          <path d="M9 18h3" opacity=".6" />
        </g>
      );
    case "aiSummary":
      return (
        <g data-pdf-comment-glyph="ai-summary">
          <path d="M5 6.5h9M5 10h7M5 13.5h5" />
          <path d="M17 11.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
        </g>
      );
    case "importComments":
      return (
        <>
          <path d="M9 4.5h10v15H9zM12 8h4M12 11h4" />
          <path d="M10 14H4M6.5 11.5 4 14l2.5 2.5" strokeWidth="2" />
        </>
      );
    case "pause":
      return (
        <>
          <path d="M8.5 5v14M15.5 5v14" strokeWidth="2.2" />
        </>
      );
    case "stop":
      return <rect x="6" y="6" width="12" height="12" rx="1.5" />;
    case "readAloudSettings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" />
        </>
      );
    case "readAloudPrevious":
      return <path d="m14.5 6-6 6 6 6M7 6v12" />;
    case "readAloudNext":
      return <path d="m9.5 6 6 6-6 6M17 6v12" />;
    case "line":
      return <path d="M5 19 19 5" />;
    case "arrow":
      return (
        <>
          <path d="M5 19 19 5" />
          <path d="M12.5 5H19v6.5" />
        </>
      );
    case "rectangle":
      return <rect x="4" y="5" width="16" height="14" rx="1.5" />;
    case "ellipse":
      return <ellipse cx="12" cy="12" rx="8" ry="6.5" />;
    case "copy":
      return (
        <>
          <rect x="8" y="7" width="11" height="12" rx="1.5" />
          <path d="M16 7V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H8" />
        </>
      );
    case "paste":
      return (
        <>
          <path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15" />
          <path d="M9 3h6v4H9zM9 12h6M9 16h4" />
        </>
      );
    case "duplicate":
      return (
        <>
          <rect x="8" y="7" width="11" height="12" rx="1.5" />
          <path d="M16 7V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H8M13.5 10v6M10.5 13h6" />
        </>
      );
    case "delete":
      return (
        <>
          <path d="M5 7h14M9 7V4.5h6V7M7.5 7l.8 13h7.4l.8-13M10 10.5v6M14 10.5v6" />
        </>
      );
    default:
      return null;
  }
}

export default function PdfCommentRibbonIcon({
  name,
  size = 24,
}: {
  name: PdfCommentRibbonIconName;
  size?: number;
}) {
  const semanticId = SHARED_ICONS[name];
  if (semanticId) {
    return <OfficeSemanticIcon semanticId={semanticId} size={size} />;
  }

  return (
    <svg
      aria-hidden="true"
      data-pdf-comment-icon={name}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <PdfCommentGlyph name={name} />
    </svg>
  );
}
