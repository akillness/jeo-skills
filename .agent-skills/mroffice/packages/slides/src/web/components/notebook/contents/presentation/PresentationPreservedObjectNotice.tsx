/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PreservedObjectNotice } from "@mrnote/core/web/lib/presentation-preserved-object.ts";

/**
 * The frame of an object the file keeps and this page cannot draw.
 *
 * Deliberately an outline and a caption rather than any invented artwork: what
 * the page is missing IS the object's own drawing, so anything drawn in its
 * place would be a shape the file does not contain. The frame is the one thing
 * the slide really does say.
 *
 * Inert to the pointer — the block underneath stays selectable, movable and
 * deletable exactly as before.
 */
/** The caption's colours: near-black on near-white. */
export const NOTICE_TEXT = "#1f1f1f";
export const NOTICE_BACKGROUND = "#fafafa";
const NOTICE_LINE = "rgba(0, 0, 0, 0.6)";
const NOTICE_LINE_INNER = "rgba(255, 255, 255, 0.7)";

export function PresentationPreservedObjectNotice({
  notice,
  label,
}: {
  notice: PreservedObjectNotice;
  label: string;
}) {
  return (
    <div
      data-testid="presentation-preserved-object"
      data-preserved-kind={notice.kind}
      data-preserved-code={notice.code}
      title={label}
      aria-label={label}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
        boxSizing: "border-box",
        // Over any slide content (a black screen, a white page): a dark
        // dashed line with a light one inside it shows on both.
        border: `1px dashed ${NOTICE_LINE}`,
        boxShadow: `inset 0 0 0 1px ${NOTICE_LINE_INNER}`,
        borderRadius: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <span
        data-testid="presentation-preserved-object-label"
        style={{
          font: "500 11px/1.35 system-ui, sans-serif",
          textAlign: "center",
          maxWidth: "100%",
          // Its own colours, not the window's: the caption lies over the
          // slide, whose colours are the document's in every app theme
          // (light, dark, high contrast). 16.1:1 (WCAG AA asks 4.5:1).
          color: NOTICE_TEXT,
          background: NOTICE_BACKGROUND,
          padding: "2px 6px",
          borderRadius: 3,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default PresentationPreservedObjectNotice;
