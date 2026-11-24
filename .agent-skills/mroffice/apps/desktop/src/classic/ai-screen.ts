/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The AI screen (a local MCP endpoint that AI apps on this computer use to
// edit the documents open in this app's windows) is part of MR Office's
// desktop app: it drives the editors through MR Office's automation runtime,
// which the open-source editors do not carry. This build answers as an app
// that has it switched off.
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

export interface AiScreenContext {
  readonly appName: () => string;
  readonly product: string;
  readonly zh: () => boolean;
  readonly hidden: boolean;
  readonly fromApp: (event: IpcMainInvokeEvent) => boolean;
  readonly openDocuments: (paths: string[]) => void;
  readonly targetWindow: () => BrowserWindow | null;
  readonly ready: () => boolean;
  readonly pagesOfFile: (filePath: string) => string[];
  readonly linkPath: (pageId: string) => string | null;
  readonly isOpenable: (filePath: string) => boolean;
  readonly writeFileAtomically: (target: string, bytes: Uint8Array) => Promise<void>;
  readonly enabled: () => boolean;
  readonly setEnabled: (on: boolean) => void;
}

export function registerAiScreen(_context: AiScreenContext): { start(): Promise<void>; stop(): void } {
  return {
    async start() {},
    stop() {},
  };
}
