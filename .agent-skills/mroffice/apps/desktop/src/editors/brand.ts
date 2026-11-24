/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * This build's identity. It is its own app, never the MR Office desktop app
 * people download from the Releases page: another name, bundle id, data
 * folder and single-instance lock (Electron keys both on the name), and its
 * own Windows ProgIDs (document-types.cjs). It declares no URL scheme, since
 * nothing comes back to it from a browser, and it has no update feed.
 *
 * Builds of a fork should change these values (and package.json's
 * productName and electron-builder.config.cjs's appId with them).
 */

/** The name people read: windows, menus, the About panel. */
export const APP_DISPLAY_NAME = "MR Office Editors";
/** Bundle id (macOS) and AppUserModelId (Windows). */
export const APP_ID = "ai.mroffice.editors.oss";

/** Where this source and the free MR Office desktop app are. */
export const REPOSITORY_URL = "https://github.com/XinaTian/MROffice";
export const DESKTOP_APP_URL = "https://github.com/XinaTian/MROffice/releases";
export const WEBSITE_URL = "https://mroffice.ai";
