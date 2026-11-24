/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { app, Menu, nativeImage, Tray } from "electron";

import { readSettings, writeSettings } from "./desktop-settings";

/** Whether this platform keeps the app in a tray (Windows; macOS has the Dock). */
export function trayAvailable(): boolean {
  return process.platform === "win32";
}

/** Whether closing the last window leaves the app in the tray (default: yes). */
export function keepInTrayOnClose(): boolean {
  return trayAvailable() && readSettings().keepInTrayOnClose !== false;
}

export function setKeepInTrayOnClose(on: boolean): void {
  writeSettings({ keepInTrayOnClose: on });
}

let tray: Tray | null = null;
let showing: Promise<void> | null = null;

export interface TrayActions {
  readonly name: string;
  readonly openLabel: string;
  readonly quitLabel: string;
  open(): void;
  quit(): void;
}

/** The tray icon, once (it stays until the app quits). */
export function showTray(actions: TrayActions): Promise<void> {
  if (!trayAvailable()) return Promise.resolve();
  showing ??= (async () => {
    // The app's own icon, as Windows draws it for the executable.
    let icon = nativeImage.createEmpty();
    try {
      icon = await app.getFileIcon(process.execPath, { size: "small" });
    } catch {
      // An empty icon still gives the menu.
    }
    tray = new Tray(icon);
    tray.setToolTip(actions.name);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: actions.openLabel, click: () => actions.open() },
        { type: "separator" },
        { label: actions.quitLabel, click: () => actions.quit() },
      ]),
    );
    tray.on("click", () => actions.open());
  })();
  return showing;
}
