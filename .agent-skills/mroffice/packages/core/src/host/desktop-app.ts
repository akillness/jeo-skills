/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// What the open-source editors leave to MR Note itself: Word, Excel and
// PowerPoint files, formulas with functions, charts, SmartArt editing,
// saving PDF edits back into the file, and the rest of MR Note's service
// (notebooks, history, sharing, AI). These are provided by the MR Office
// desktop app's installer (free, the full service). A control that needs one
// of them tells the person so, through the host, instead of doing nothing.

import { editorHost } from "./host";

/** Where the MR Office desktop app (free) is downloaded: this repository's Releases. */
export const DESKTOP_DOWNLOAD_URL = "https://github.com/XinaTian/MROffice/releases";
/** MR Office's site. */
export const WEB_APP_URL = "https://mroffice.ai";

const lastNotice = new Map<string, number>();

/** Tell the person (through the host) that this is done by the MR Office
 * desktop app, with where to get it; at most once
 * every few seconds for one feature, so a control that asks again and again
 * is not noisy. */
export function noteDesktopFeature(feature?: string): void {
  const now = Date.now();
  const key = feature ?? "";
  if (now - (lastNotice.get(key) ?? 0) < 4000) return;
  lastNotice.set(key, now);
  try {
    editorHost().notify?.({
      title: feature ? `${feature}: free in MR Office` : "Free in MR Office",
      description: "MR Office online opens it right away in any browser, on Linux too; the free desktop app also works offline on Mac and Windows.",
      tone: "info",
      action: { label: "Open MR Office online (free)", href: WEB_APP_URL },
      secondary: { label: "Desktop app (Mac, Windows)", href: DESKTOP_DOWNLOAD_URL },
    });
  } catch {
    // no host to tell
  }
}
