"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import {
  ClipboardPaste,
  Link,
  Paintbrush,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

/** The six choices of Excel's right-click "Paste Options:" row (XLS-A076). */
export type SpreadsheetPasteOptionGlyphKind =
  | "paste"
  | "values"
  | "formulas"
  | "transpose"
  | "formatting"
  | "link";

const SIZE = 18;
const STROKE = 1.75;

/**
 * A clipboard with the choice's own mark at its lower right: "123" for
 * Values, "fx" for Formulas, crossed arrows for Transpose, a brush for
 * Formatting and a chain for Paste Link, the way Excel tells its six Paste
 * Options apart. Plain Paste is the clipboard alone.
 */
export function SpreadsheetPasteOptionGlyph({
  kind,
}: {
  kind: SpreadsheetPasteOptionGlyphKind;
}): ReactNode {
  const badge: ReactNode =
    kind === "values" ? (
      "123"
    ) : kind === "formulas" ? (
      <i style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>fx</i>
    ) : kind === "transpose" ? (
      "⇄"
    ) : kind === "formatting" ? (
      <Paintbrush size={10} strokeWidth={2.25} />
    ) : kind === "link" ? (
      <Link size={10} strokeWidth={2.25} />
    ) : null;
  return (
    <span
      aria-hidden="true"
      data-paste-option-glyph={kind}
      style={{
        position: "relative",
        display: "inline-flex",
        width: SIZE + 4,
        height: SIZE + 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ClipboardPaste size={SIZE} strokeWidth={STROKE} />
      {badge !== null ? (
        <span
          style={{
            position: "absolute",
            right: -3,
            bottom: -2,
            minWidth: 12,
            height: 11,
            padding: "0 2px",
            borderRadius: 3,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--console-accent-strong, #087c73)",
            background: "var(--menu-bg, var(--bg-base, #fff))",
            border: "1px solid currentColor",
          }}
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}
