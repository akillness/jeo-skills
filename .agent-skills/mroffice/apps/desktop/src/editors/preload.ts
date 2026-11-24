/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What the editors' page may ask of the app (`window.mrofficeEditorsDesktop`,
 * apps/playground/src/desktop.ts): the files this window was given, opening
 * and saving files on this computer, and the menu's commands. Nothing else of
 * Node or Electron reaches the page, and the app answers only the main frame
 * of the editors' own origin (main.ts). The page never learns where a file
 * is: it names each one by the handle the app gave it.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("mrofficeEditorsDesktop", {
  platform: process.platform,
  /** The files waiting for this window, once each. */
  takeOpenFiles: () => ipcRenderer.invoke("editors:take-open-files"),
  /** Called when more files are waiting (a double-click while the app runs). */
  onFilesWaiting: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("editors:files-waiting", handler);
    return () => ipcRenderer.removeListener("editors:files-waiting", handler);
  },
  /** The menu's commands for the page: "save", "save-as", "new:<editor>". */
  onCommand: (listener: (command: string) => void) => {
    const handler = (_event: unknown, command: unknown) => listener(String(command));
    ipcRenderer.on("editors:command", handler);
    return () => ipcRenderer.removeListener("editors:command", handler);
  },
  /** The system's Open dialog; the chosen files arrive as waiting files. */
  showOpenDialog: () => ipcRenderer.invoke("editors:open-dialog"),
  /** Files dropped on the window: opened from where they are, so Save writes
   * them back. Files that are not on this computer's disk are left to the page. */
  openDropped: (files: File[]) => {
    const paths = Array.from(files ?? [])
      .map((file) => {
        try {
          return webUtils.getPathForFile(file);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    return paths.length ? ipcRenderer.invoke("editors:open-paths", paths) : Promise.resolve(0);
  },
  /** Save an editor's file: back to the file `handle` names, or through the
   * Save dialog (new files, Save As, another kind of file). Resolves to the
   * file's handle and name, or null when the person cancelled. */
  saveFile: (request: { handle?: string | null; name: string; bytes: Uint8Array; saveAs?: boolean }) =>
    ipcRenderer.invoke("editors:save", {
      handle: typeof request?.handle === "string" ? request.handle : null,
      name: String(request?.name ?? ""),
      bytes: request?.bytes,
      saveAs: Boolean(request?.saveAs),
    }),
  /** The window has unsaved changes (the close button's dot on macOS). */
  setEdited: (edited: boolean) => ipcRenderer.send("editors:edited", Boolean(edited)),
});
