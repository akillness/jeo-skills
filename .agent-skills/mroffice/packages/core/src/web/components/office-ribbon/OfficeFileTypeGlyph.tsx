"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  FileFormatArtwork,
  type FileFormatArtworkKind,
} from "../notebook/PageTypeArtwork";

/**
 * A file-type glyph for the editors' Export menus.
 *
 * It is the page library's own artwork (PageTypeArtwork: the layered pages
 * on the glossy 64 px tile, with the same lift and fan-out when the row is
 * hovered or highlighted), so a file in an export menu looks like the same
 * file in "All pages". Formats the library has no page type for (CSV, a web
 * page, an image, Markdown, plain text, a CAD drawing) are drawn there as
 * extra kinds on the same pages.
 */
export type OfficeFileTypeGlyphKind =
  | "workbook"
  | "csv"
  | "pdf"
  | "html"
  | "image"
  | "slides"
  | "word"
  | "markdown"
  | "text"
  | "cad"
  | "code";

const ARTWORK_KIND: Record<OfficeFileTypeGlyphKind, FileFormatArtworkKind> = {
  workbook: "spreadsheet",
  csv: "csv",
  pdf: "pdf",
  html: "html",
  image: "image",
  slides: "presentation",
  word: "document",
  markdown: "markdown",
  text: "text",
  cad: "cad",
  code: "code",
};

export function OfficeFileTypeGlyph({
  kind,
  size = 40,
  className,
}: {
  kind: OfficeFileTypeGlyphKind;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`office-file-type-glyph${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      data-file-type={kind}
      aria-hidden="true"
    >
      <FileFormatArtwork
        format={ARTWORK_KIND[kind]}
        className="office-file-type-glyph__artwork"
      />
    </span>
  );
}
