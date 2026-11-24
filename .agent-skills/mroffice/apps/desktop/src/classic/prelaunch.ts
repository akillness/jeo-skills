/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

import { readSettings, writeSettings } from "./desktop-settings";
import { agentLabel, BACKGROUND_ARG, launchAgentPlist, prelaunchWanted } from "./prelaunch-agent";

export { BACKGROUND_ARG, launchedInBackground } from "./prelaunch-agent";

/** Whether this build can offer it (a packed app on macOS or Windows). */
export function prelaunchAvailable(): boolean {
  // A Store package starts at login by its manifest's StartupTask, not the Run key.
  if (process.windowsStore || process.mas) return false;
  return app.isPackaged && (process.platform === "darwin" || process.platform === "win32");
}

function agentFile(appId: string): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${agentLabel(appId)}.plist`);
}

/** The .app bundle this process runs from (…/X.app/Contents/MacOS/X). */
function bundlePath(): string {
  return path.resolve(path.dirname(process.execPath), "..", "..");
}

export function prelaunchEnabled(appId: string): boolean {
  if (!prelaunchAvailable()) return false;
  if (process.platform === "darwin") return fs.existsSync(agentFile(appId));
  return app.getLoginItemSettings({ path: process.execPath, args: [BACKGROUND_ARG] }).openAtLogin;
}

/** The menu's checkbox: the person's choice, kept, and applied. */
export function choosePrelaunch(appId: string, on: boolean): void {
  setPrelaunch(appId, on);
  writeSettings({ prelaunch: on });
}

/** At every packed launch: on unless the person turned it off
 * (``prelaunchWanted``); the LaunchAgent written again when the app has moved
 * (it names the bundle). Never throws. */
export function applyPrelaunchDefault(appId: string): void {
  if (!prelaunchAvailable()) return;
  try {
    const wanted = prelaunchWanted(readSettings().prelaunch);
    if (process.platform === "darwin") {
      const file = agentFile(appId);
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      if (wanted && current !== launchAgentPlist(appId, bundlePath())) setPrelaunch(appId, true);
      return;
    }
    if (wanted && !prelaunchEnabled(appId)) setPrelaunch(appId, true);
  } catch (error) {
    console.error(`[classic] login item not set: ${error instanceof Error ? error.message : error}`);
  }
}

export function setPrelaunch(appId: string, on: boolean): void {
  if (!prelaunchAvailable()) return;
  if (process.platform === "darwin") {
    const file = agentFile(appId);
    if (on) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, launchAgentPlist(appId, bundlePath()), { mode: 0o644 });
    } else {
      fs.rmSync(file, { force: true });
    }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [BACKGROUND_ARG] });
}
