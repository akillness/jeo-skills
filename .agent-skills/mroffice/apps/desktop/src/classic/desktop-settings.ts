/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The desktop app's own settings, kept in its data folder
 * (desktop-settings.json): what the person chose in the app's menu.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface DesktopSettings {
  /** Windows: closing the last window leaves the app in the tray (./tray.ts). */
  keepInTrayOnClose?: boolean;
  /** "Ready in the background at login", as the person set it in the menu (./prelaunch.ts); absent: never set. */
  prelaunch?: boolean;
  /** A page that came from a file on this computer is written back to that
   * file once its edits settle, not only on ⌘S (Settings › General);
   * absent: on. */
  autoSaveToOriginal?: boolean;
  /** "Send usage statistics" (Settings › General): the app's daily counts
   * for the operators' dashboard, never names or content (./usage-report.ts);
   * absent: on. */
  usageReports?: boolean;
  /** AI apps on this computer may use the app as their screen through its
   * local MCP endpoint (./ai-screen, Settings › General); absent: on. */
  aiScreen?: boolean;
}

const settingsFile = () => path.join(app.getPath("userData"), "desktop-settings.json");

export function readSettings(): DesktopSettings {
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile(), "utf8")) as unknown;
    return value && typeof value === "object" ? (value as DesktopSettings) : {};
  } catch {
    return {};
  }
}

export function writeSettings(change: DesktopSettings): void {
  const partial = `${settingsFile()}.partial`;
  fs.writeFileSync(partial, JSON.stringify({ ...readSettings(), ...change }));
  fs.renameSync(partial, settingsFile());
}

/** Autosave to the original file (on unless the person turned it off). */
export function autoSaveToOriginalEnabled(): boolean {
  return readSettings().autoSaveToOriginal !== false;
}

/** The AI screen's local MCP endpoint (on unless the person turned it off). */
export function aiScreenEnabled(): boolean {
  return readSettings().aiScreen !== false;
}

// --- The notebook a launch's documents land in -------------------------------
//
// The page tells it (mraiDesktop.rememberLanding, ../../web/lib/desktop-landing.ts):
// the notebook its window shows. Kept beside the settings (landing.json), read
// at a launch started by a double-click (./main.ts openRouteFor).

const NOTEBOOK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const landingFile = () => path.join(app.getPath("userData"), "landing.json");
let landing: string | null | undefined;

/** The notebook the window last showed, or null. */
export function readLanding(): string | null {
  if (landing !== undefined) return landing;
  try {
    const value = (JSON.parse(fs.readFileSync(landingFile(), "utf8")) as { notebookId?: unknown }).notebookId;
    landing = typeof value === "string" && NOTEBOOK_ID.test(value) ? value : null;
  } catch {
    landing = null;
  }
  return landing;
}

/** The notebook the window shows now (null: forgotten). False when not a notebook's id. */
export function writeLanding(notebookId: string | null): boolean {
  if (notebookId !== null && !NOTEBOOK_ID.test(notebookId)) return false;
  if (readLanding() === notebookId) return true;
  landing = notebookId;
  try {
    const partial = `${landingFile()}.partial`;
    fs.writeFileSync(partial, JSON.stringify({ notebookId }));
    fs.renameSync(partial, landingFile());
  } catch {
    // Not kept: the next launch goes through the open page.
  }
  return true;
}
