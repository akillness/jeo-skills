/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What MR Note Classic's pages may ask of the app (`window.mraiDesktop`). The
 * same documents bridge the online app offers (takeOpenFiles, readOpenFile:
 * apps/web components/open-files), plus saving back to the file a document
 * came from, files on this computer read where they are and saved back to
 * (local-files.ts, apps/web lib/desktop-local-files.ts), and the MR Note
 * sign-in AI uses (apps/web lib/desktop-classic-ai.ts).
 * The main process answers only the main frame of the app's own pages.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";

/**
 * MR Office (../../products.cjs): the page is on the office surface before
 * any of its own scripts run. The web app's bootstrap stamps the surface
 * from `?surface=` and remembers it (apps/web/lib/product-surface.ts); here,
 * at document start, the address says `surface=office` (a `surface=note`
 * replaced) and the remembered choice is office, so a page served by the
 * service worker -- which the shell's request rule never sees (./surface.ts)
 * -- is on it too. The main process passes the surface as an argument (a
 * sandboxed preload imports nothing of the app's).
 */
function pinSurface(): void {
  const surface = process.argv.find((arg) => arg.startsWith("--mrai-surface="))?.slice("--mrai-surface=".length);
  if (surface !== "office" || location.protocol !== "http:" || location.hostname !== "127.0.0.1") return;
  try {
    const url = new URL(location.href);
    if (url.searchParams.getAll("surface").join(",") !== surface) {
      url.searchParams.delete("surface");
      url.searchParams.set("surface", surface);
      history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    localStorage.setItem("mr-surface", surface);
  } catch {
    // Storage refused: the address alone stamps the surface for this load.
  }
}
pinSurface();

contextBridge.exposeInMainWorld("mraiDesktop", {
  classic: true,
  platform: process.platform,
  /** The window's instant view (src/classic/instant-view.ts): the page now
   * shows what it showed ("home": the home with its files; "deck": a deck on
   * its canvas), so it goes; and the home as it is now, for the next
   * launch's. */
  instantDone: (kind: string) => ipcRenderer.invoke("mrai:instant-done", String(kind)),
  instantSave: (html: string) => ipcRenderer.invoke("mrai:instant-save", String(html)),
  /** The file name of the double-clicked document whose first page covers
   * this window (null when none does): its own window is what the cover
   * stands for, not an earlier document's window brought back. */
  instantDocument: () => ipcRenderer.invoke("mrai:instant-document"),
  /** A document opened while the page is shown covers the window with its
   * first page (src/classic/main.ts coverForDocument): ``listener`` hears it,
   * so the page watches for that document again. Returns the unsubscribe. */
  /** The page watches for the covered document (the cover then waits for it). */
  instantWatching: () => ipcRenderer.invoke("mrai:instant-watching"),
  onInstantWatch: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("mrai:instant-watch", handler);
    return () => ipcRenderer.removeListener("mrai:instant-watch", handler);
  },
  /** The documents this window was opened for; ``keep`` leaves them for a
   * later take (the notebook the open page leads to imports them). */
  takeOpenFiles: (keep?: boolean) => ipcRenderer.invoke("mrai:take-open-files", keep === true),
  /** The notebook the window shows (null: none to come back to): a document
   * double-clicked to start the app is loaded straight into it
   * (src/classic/main.ts openRouteFor). */
  rememberLanding: (notebookId: string | null) =>
    ipcRenderer.invoke("mrai:remember-landing", typeof notebookId === "string" ? notebookId : null),
  /** A notebook's page takes documents opened from the system where it is:
   * ``listener`` hears each time some are waiting (take them with
   * takeOpenFiles). Returns the unsubscribe. */
  onDocumentsOpened: (listener: (opened?: unknown) => void, options?: { reopens?: unknown; notebookId?: unknown }) => {
    // ``opened.reopened``: documents opened again, unchanged since each became
    // a page of the notebook this page shows (``options.reopens``): it shows
    // those pages where it is, no file waits for it.
    const handler = (_event: unknown, opened?: unknown) => listener(opened && typeof opened === "object" ? opened : undefined);
    ipcRenderer.on("mrai:documents-opened", handler);
    const reopens = options?.reopens === true && typeof options.notebookId === "string" ? options.notebookId : null;
    void ipcRenderer.invoke("mrai:documents-in-place", true, reopens);
    return () => {
      ipcRenderer.removeListener("mrai:documents-opened", handler);
      void ipcRenderer.invoke("mrai:documents-in-place", false);
    };
  },
  /** Pages handed over as documents opened again that are gone: their
   * documents are handed over again as new ones (imported). */
  reopenedPagesMissing: (pageIds: unknown) =>
    ipcRenderer.invoke("mrai:reopened-pages-missing", Array.isArray(pageIds) ? pageIds.map(String) : []),
  /** The app quitting or this window closing: ``handler`` settles the page's
   * edits (saves sent and waited on, recovery copies written) within the time
   * given, and the app waits for it before it closes. Returns the unsubscribe. */
  onSettleEdits: (handler: (timeoutMs: number, extend: (ms: number) => Promise<boolean>) => Promise<unknown>) => {
    const listener = (_event: unknown, nonce: unknown, timeoutMs: unknown) => {
      // Once: the page writing a pending autosave back to its file asks the
      // app to wait for it (up to the app's own bound).
      const extend = (ms: number) =>
        ipcRenderer.invoke("mrai:edits-settle-extend", String(nonce), Number(ms)).then(Boolean, () => false);
      void Promise.resolve()
        .then(() => handler(Number(timeoutMs) || 0, extend))
        .catch(() => null)
        .then((result) => ipcRenderer.invoke("mrai:edits-settled", String(nonce), result ?? null));
    };
    ipcRenderer.on("mrai:settle-edits", listener);
    void ipcRenderer.invoke("mrai:settles-edits", true);
    return () => {
      ipcRenderer.removeListener("mrai:settle-edits", listener);
      void ipcRenderer.invoke("mrai:settles-edits", false);
    };
  },
  readOpenFile: (token: string, start: number, end: number) =>
    ipcRenderer.invoke("mrai:read-open-file", String(token), Number(start), Number(end)),
  defaultAppState: () => ipcRenderer.invoke("mrai:default-app-state"),
  makeDefaultApp: (extensions?: string[]) =>
    ipcRenderer.invoke("mrai:make-default-app", Array.isArray(extensions) ? extensions.map(String) : undefined),
  /** At launch: { supported, missing } when the app should ask to open the
   * documents by default (at most once per run), else null. */
  defaultAppOffer: () => ipcRenderer.invoke("mrai:default-app-offer"),
  /** "No thanks": not asked at launch again (Settings can still make it the default). */
  declineDefaultApp: () => ipcRenderer.invoke("mrai:default-app-decline"),
  /** Write an exported file (bytes) next to its original, asking where when
   * there is none or `saveAs` is set. Resolves to the path, or null. */
  saveFile: (request: { bytes: ArrayBuffer; filename: string; originalPath?: string | null; saveAs?: boolean }) =>
    ipcRenderer.invoke("mrai:save-file", {
      bytes: request?.bytes,
      filename: String(request?.filename ?? ""),
      originalPath: request?.originalPath ? String(request.originalPath) : null,
      saveAs: Boolean(request?.saveAs),
    }),
  /** A token for a file the page holds that is on this computer (dropped
   * or picked), which the app's API reads where it is; null otherwise. */
  localFileToken: (file: File) => {
    let filePath = "";
    try {
      filePath = webUtils.getPathForFile(file);
    } catch {
      filePath = "";
    }
    return filePath ? ipcRenderer.invoke("mrai:local-file-token", filePath) : Promise.resolve(null);
  },
  /** The page a local file became, so Save writes back to that file. */
  linkOriginal: (pageId: string, localToken: string, notebookId?: string) =>
    ipcRenderer.invoke("mrai:link-original", String(pageId), String(localToken), notebookId ? String(notebookId) : undefined),
  originalOf: (pageId: string) => ipcRenderer.invoke("mrai:original-of", String(pageId)),
  /** Write a page's file over the file it came from (asking where once when
   * there is none). Resolves to { path, name }, { error }, or null. */
  saveToOriginal: (request: { pageId: string; bytes: ArrayBuffer; filename: string; state?: string; auto?: boolean }) =>
    ipcRenderer.invoke("mrai:save-to-original", {
      pageId: String(request?.pageId ?? ""),
      bytes: request?.bytes,
      filename: String(request?.filename ?? ""),
      state: typeof request?.state === "string" ? request.state : undefined,
      auto: request?.auto === true,
    }),
  /** Whether the page is linked to a file, that file is there and unchanged
   * since the app last saw it, and autosave is on (the autosave's check). */
  originalStatus: (pageId: string) => ipcRenderer.invoke("mrai:original-status", String(pageId)),
  /** Autosave to the original file: the setting, and turning it on or off. */
  originalAutosave: {
    enabled: () => ipcRenderer.invoke("mrai:original-autosave"),
    setEnabled: (on: boolean) => ipcRenderer.invoke("mrai:original-autosave", Boolean(on)),
  },
  /** "Send usage statistics": the app's daily counts for the operators'
   * dashboard, no names or content (src/classic/usage-report.ts). */
  usageReports: {
    enabled: () => ipcRenderer.invoke("mrai:usage-reports"),
    setEnabled: (on: boolean) => ipcRenderer.invoke("mrai:usage-reports", Boolean(on)),
  },
  /** The places on this computer the sidebar shows as a folder tree
   * (src/classic/places-ipc.ts; apps/web lib/desktop-places.ts). Every path
   * is checked by the app: inside the home folder, no contents read. */
  places: {
    state: () => ipcRenderer.invoke("mrai:places-state"),
    remember: (selected: string | null, expanded: string[]) =>
      ipcRenderer.invoke("mrai:places-remember", selected ? String(selected) : null, Array.isArray(expanded) ? expanded.map(String) : []),
    list: (folder: string) => ipcRenderer.invoke("mrai:places-list", String(folder)),
    /** Watch these folders while they are shown (the set replaces the last). */
    watch: (folders: string[]) => ipcRenderer.invoke("mrai:places-watch", Array.isArray(folders) ? folders.map(String) : []),
    onChange: (listener: (folder: string) => void) => {
      const handler = (_event: unknown, folder: unknown) => listener(String(folder ?? ""));
      ipcRenderer.on("mrai:places-changed", handler);
      return () => ipcRenderer.removeListener("mrai:places-changed", handler);
    },
    /** Open documents as Finder opens them (linked to their files). */
    open: (paths: string[]) => ipcRenderer.invoke("mrai:open-local-paths", Array.isArray(paths) ? paths.map(String) : []),
    /** The system's Open dialog, starting in ``folder``. */
    openDialog: (folder?: string | null) => ipcRenderer.invoke("mrai:places-open-dialog", folder ? String(folder) : null),
    reveal: (target: string) => ipcRenderer.invoke("mrai:places-reveal", String(target)),
    createFolder: (parent: string, name: string) => ipcRenderer.invoke("mrai:places-create-folder", String(parent), String(name)),
    /** A new page's file in ``folder``, never over another; the page is linked to it. */
    createFile: (request: { folder: string; baseName: string; extension: string; bytes: ArrayBuffer; pageId: string; notebookId?: string; state?: string }) =>
      ipcRenderer.invoke("mrai:places-create-file", {
        folder: String(request?.folder ?? ""),
        baseName: String(request?.baseName ?? ""),
        extension: String(request?.extension ?? ""),
        bytes: request?.bytes,
        pageId: String(request?.pageId ?? ""),
        notebookId: request?.notebookId ? String(request.notebookId) : undefined,
        state: typeof request?.state === "string" ? request.state : undefined,
      }),
    rename: (target: string, name: string) => ipcRenderer.invoke("mrai:places-rename", String(target), String(name)),
    trash: (target: string) => ipcRenderer.invoke("mrai:places-trash", String(target)),
    privacySettings: () => ipcRenderer.invoke("mrai:places-privacy-settings"),
    /** A listed document's picture (src/classic/place-thumbnails.ts): the
     * page it became while unchanged, a small PNG data URL, or not ok. */
    thumbnail: (target: string, size: number) =>
      ipcRenderer.invoke("mrai:places-thumbnail", String(target), Number(size) || 0),
  },
  /** The app's own LibreOffice (src/classic/libreoffice.ts): what it offers
   * and holds, download and enable it (resolves when done, cancelled or
   * failed), remove it, and hear when any of that changes. */
  libreOffice: {
    status: () => ipcRenderer.invoke("mrai:libreoffice-status"),
    install: () => ipcRenderer.invoke("mrai:libreoffice-install"),
    remove: () => ipcRenderer.invoke("mrai:libreoffice-remove"),
    onChange: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("mrai:libreoffice-changed", handler);
      return () => ipcRenderer.removeListener("mrai:libreoffice-changed", handler);
    },
  },
  /** The model on this computer (src/classic/local-model.ts): what is
   * recommended and installed, download it in the background (resolves at
   * once; follow it with status and onChange), pause, cancel, delete. */
  localModel: {
    status: () => ipcRenderer.invoke("mrai:local-model-status"),
    download: (request?: { key?: string; mirror?: string }) =>
      ipcRenderer.invoke("mrai:local-model-download", {
        key: typeof request?.key === "string" ? request.key : undefined,
        mirror: typeof request?.mirror === "string" ? request.mirror : undefined,
      }),
    pause: () => ipcRenderer.invoke("mrai:local-model-pause"),
    cancel: () => ipcRenderer.invoke("mrai:local-model-cancel"),
    remove: () => ipcRenderer.invoke("mrai:local-model-remove"),
    onChange: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("mrai:local-model-changed", handler);
      return () => ipcRenderer.removeListener("mrai:local-model-changed", handler);
    },
  },
  /** What the AI may do on this computer (src/classic/agent-computer.ts):
   * give it folders (the system's dialog), take one back, choose the mode
   * and how its asks are approved (the composer's 权限模式);
   * the pages read the current state from the API (GET /desktop/computer). */
  agentComputer: {
    addFolder: () => ipcRenderer.invoke("mrai:agent-computer-add-folder"),
    removeFolder: (folder: string) => ipcRenderer.invoke("mrai:agent-computer-remove-folder", String(folder)),
    setMode: (mode: string, network?: boolean) =>
      ipcRenderer.invoke("mrai:agent-computer-set-mode", String(mode), typeof network === "boolean" ? network : undefined),
    /** 权限模式: manual | accept_edits | skip. */
    setApproval: (approval: string) => ipcRenderer.invoke("mrai:agent-computer-set-approval", String(approval)),
    onChange: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("mrai:agent-computer-changed", handler);
      return () => ipcRenderer.removeListener("mrai:agent-computer-changed", handler);
    },
  },
  /** New versions of the app (src/updates.ts): Settings › Software Update
   * reads the state (telling the shell its language), checks, downloads,
   * restarts to install, chooses the beta versions, and hears each change. */
  updates: {
    status: (locale?: string) => ipcRenderer.invoke("mrai:update-status", typeof locale === "string" ? locale : undefined),
    check: () => ipcRenderer.invoke("mrai:update-check"),
    download: () => ipcRenderer.invoke("mrai:update-download"),
    install: () => ipcRenderer.invoke("mrai:update-install"),
    setBeta: (on: boolean) => ipcRenderer.invoke("mrai:update-set-beta", on === true),
    onChange: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("mrai:update-changed", handler);
      return () => ipcRenderer.removeListener("mrai:update-changed", handler);
    },
  },
  /** The AI screen (src/classic/ai-screen): AI apps on this computer --
   * terminal assistants, AI editors -- open, read and edit documents in this
   * window through the app's local MCP endpoint. The notebook canvas serves
   * the app's requests (apps/web components/notebook/useDesktopAiScreen):
   * ``serve`` answers each with ``handler``; ``pages`` says which documents
   * it shows; Settings reads and changes the endpoint and its allowed apps. */
  aiScreen: {
    serve: (handler: (request: unknown) => Promise<unknown>) => {
      const listener = (_event: unknown, nonce: unknown, request: unknown) => {
        void Promise.resolve()
          .then(() => handler(request))
          .catch((error: unknown) => ({
            ok: false,
            error: { code: "embed_command_failed", message: error instanceof Error ? error.message : String(error) },
          }))
          .then((answer) => ipcRenderer.invoke("mrai:ai-screen-answer", String(nonce), answer));
      };
      ipcRenderer.on("mrai:ai-screen-request", listener);
      void ipcRenderer.invoke("mrai:ai-screen-serve", true);
      return () => {
        ipcRenderer.removeListener("mrai:ai-screen-request", listener);
        void ipcRenderer.invoke("mrai:ai-screen-serve", false);
      };
    },
    pages: (pages: unknown) => ipcRenderer.invoke("mrai:ai-screen-pages", Array.isArray(pages) ? pages : []),
    state: () => ipcRenderer.invoke("mrai:ai-screen-state"),
    setEnabled: (on: boolean) => ipcRenderer.invoke("mrai:ai-screen-set-enabled", on === true),
    revoke: (name: string) => ipcRenderer.invoke("mrai:ai-screen-revoke", String(name)),
    onChange: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on("mrai:ai-screen-changed", handler);
      return () => ipcRenderer.removeListener("mrai:ai-screen-changed", handler);
    },
  },
  aiAccount: () => ipcRenderer.invoke("mrai:ai-account"),
  signInForAi: (reason?: string) => ipcRenderer.invoke("mrai:ai-sign-in", String(reason ?? "")),
  signOutOfAi: () => ipcRenderer.invoke("mrai:ai-sign-out"),
  onAiAccountChange: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("mrai:ai-account-changed", handler);
    return () => ipcRenderer.removeListener("mrai:ai-account-changed", handler);
  },
});
