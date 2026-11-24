/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The desktop app's bridge (apps/desktop/src/preload.ts), present only when
// the playground runs inside MR Office Editors: files come from the computer
// with a handle, and Save writes them back there instead of downloading.

export interface DesktopOpenedFile {
  readonly handle: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface DesktopBridge {
  readonly platform: string;
  takeOpenFiles(): Promise<{
    files: DesktopOpenedFile[];
    refused: { name: string; reason: "too-large" | "unreadable" | "not-openable" }[];
    commands: string[];
  }>;
  onFilesWaiting(listener: () => void): () => void;
  onCommand(listener: (command: string) => void): () => void;
  showOpenDialog(): Promise<void>;
  openDropped(files: File[]): Promise<number>;
  saveFile(request: { handle?: string | null; name: string; bytes: Uint8Array; saveAs?: boolean }): Promise<{ handle: string; name: string; written: boolean } | null>;
  setEdited(edited: boolean): void;
}

export function desktopBridge(): DesktopBridge | null {
  return (globalThis as { mrofficeEditorsDesktop?: DesktopBridge }).mrofficeEditorsDesktop ?? null;
}

const REFUSED: Record<string, string> = {
  "too-large": "is too large to open",
  unreadable: "could not be read",
  "not-openable": "is not a file these editors open",
};

export function refusedMessage(refused: { name: string; reason: string }[]): string | null {
  if (!refused.length) return null;
  return refused.map((file) => `${file.name} ${REFUSED[file.reason] ?? "could not be opened"}.`).join(" ");
}
