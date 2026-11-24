/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The on-device model: this build has none. The MR Office desktop app offers
 * one with its component; here every call answers "not supported" and
 * nothing is ever downloaded. The names are the ones the shell calls
 * (src/classic/main.ts, src/classic/services.ts).
 */

import path from "node:path";
import { app, type BrowserWindow } from "electron";

export function localModelRoot(): string {
  return path.join(app.getPath("userData"), "local-model");
}

export function localModelDir(): string {
  return localModelRoot();
}

export interface LocalModelContext {
  readonly notify: () => void;
  readonly stopServer: () => Promise<void>;
  readonly hidden: boolean;
}

export interface LocalModelStatus {
  supported: boolean;
  machine: { memoryBytes: number; appleSilicon: boolean; platform: string };
  recommended: null;
  installed: null;
  installing: null;
  partial: null;
  space: null;
  lastError: string | null;
}

export function localModelStatus(): LocalModelStatus {
  return {
    supported: false,
    machine: { memoryBytes: 0, appleSilicon: process.arch === "arm64" && process.platform === "darwin", platform: process.platform },
    recommended: null,
    installed: null,
    installing: null,
    partial: null,
    space: null,
    lastError: null,
  };
}

export function startLocalModelDownload(
  _context: LocalModelContext,
  _request: { key?: unknown; mirror?: unknown } = {},
): { ok: boolean; error?: string } {
  return { ok: false, error: "unsupported" };
}

export function pauseLocalModelDownload(): { ok: boolean } {
  return { ok: false };
}

export function cancelLocalModelDownload(_context: LocalModelContext): { ok: boolean } {
  return { ok: false };
}

export async function removeLocalModelFiles(
  _context: LocalModelContext,
  _owner: BrowserWindow | null,
): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
