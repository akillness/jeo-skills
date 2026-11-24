/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What the AI may do on this computer (apps/api app/desktop/computer): the
 * folders the person gives it, picked in the system's own dialog, and the
 * mode they choose. Only this process changes them (with the launch token);
 * the app's pages read them and ask for a change through the bridge, so no
 * page script, an AI-made one included, can widen what the AI may touch.
 */

import { BrowserWindow, dialog, ipcMain } from "electron";

export interface AgentComputerLaunch {
  readonly apiOrigin: string;
  readonly webOrigin: string;
  readonly launchToken: string;
}

const MODES = new Set(["read_only", "auto", "ask", "full"]);
/** The composer's 权限模式: how the steps the mode asks about are approved. */
const APPROVALS = new Set(["manual", "accept_edits", "skip"]);

export function registerAgentComputer(
  launchOf: () => AgentComputerLaunch | null,
  fromApp: (event: Electron.IpcMainInvokeEvent) => boolean,
): void {
  async function call(method: string, route: string, body?: unknown): Promise<unknown> {
    const launch = launchOf();
    if (!launch) return null;
    const response = await fetch(`${launch.apiOrigin}/api/v1/desktop/computer${route}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: launch.webOrigin,
        "x-mrai-desktop-launch": launch.launchToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok) {
      const code = (answer as { detail?: { code?: string } } | null)?.detail?.code;
      return { error: code || `http_${response.status}` };
    }
    return answer;
  }

  function changed(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("mrai:agent-computer-changed");
    }
  }

  ipcMain.handle("mrai:agent-computer-add-folder", async (event) => {
    if (!fromApp(event)) return null;
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const picked = await (owner
      ? dialog.showOpenDialog(owner, {
          title: "Give the AI a folder",
          buttonLabel: "Give to AI",
          properties: ["openDirectory", "createDirectory", "multiSelections"],
        })
      : dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory", "multiSelections"] }));
    if (picked.canceled || !picked.filePaths.length) return null;
    let last: unknown = null;
    for (const folder of picked.filePaths) last = await call("POST", "/folders", { path: folder });
    changed();
    return last;
  });

  ipcMain.handle("mrai:agent-computer-remove-folder", async (event, folder: unknown) => {
    if (!fromApp(event) || typeof folder !== "string" || !folder) return null;
    const answer = await call("POST", "/folders/remove", { path: folder });
    changed();
    return answer;
  });

  ipcMain.handle("mrai:agent-computer-set-mode", async (event, mode: unknown, network: unknown) => {
    if (!fromApp(event) || typeof mode !== "string" || !MODES.has(mode)) return null;
    const answer = await call("PUT", "", { mode, network: typeof network === "boolean" ? network : undefined });
    changed();
    return answer;
  });

  ipcMain.handle("mrai:agent-computer-set-approval", async (event, approval: unknown) => {
    if (!fromApp(event) || typeof approval !== "string" || !APPROVALS.has(approval)) return null;
    const answer = await call("PUT", "/approval", { approval });
    changed();
    return answer;
  });
}
