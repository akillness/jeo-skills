/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A page of the app's own (assets/: the splash, the progress window), loaded
 * as a data: URL. The packed app's fuses withhold file:// its privileges
 * (grantFileProtocolExtraPrivileges: false), and a page inside app.asar does
 * not load from file:// at all there (ERR_FILE_NOT_FOUND: a blank splash);
 * these pages are self-contained, so their HTML is all they need. The
 * fragment carries what the page reads from location.hash (its language).
 */

import fs from "node:fs";
import type { BrowserWindow } from "electron";

export function loadBundledPage(window: BrowserWindow, file: string, fragment: string): Promise<void> {
  const html = fs.readFileSync(file).toString("base64");
  return window.loadURL(`data:text/html;charset=utf-8;base64,${html}#${fragment}`);
}
