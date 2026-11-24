/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { fontFaceNewsCount } from "../../../../lib/font-face-news";

/**
 * Identifies the document's loaded font faces, for caches of measured text
 * geometry. Null while faces are loading: every measurement is provisional
 * then. A face added already loaded (a `FontFace` built from bytes) fires no
 * event but changes the set's size. The count is of events that brought a
 * face not settled before (lib/font-face-news): WebKit's repeats of what is
 * already loaded do not void a measurement.
 */
export function loadedFontsKey(document: Document): string | null {
  const fonts: FontFaceSet | undefined = document.fonts;
  if (!fonts) return "";
  const news = fontFaceNewsCount(document);
  if (news === null) return `0:${fonts.size ?? 0}`;
  return fonts.status === "loading" ? null : `${news}:${fonts.size}`;
}
