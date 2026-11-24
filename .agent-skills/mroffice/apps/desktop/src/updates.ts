/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Updates: this build has none of its own. It never checks a feed, downloads
 * or installs anything; "Check for Updates" opens the Releases page, where
 * new versions of this app's source and of the MR Office component are
 * published. The names are the ones the shell calls (src/classic/main.ts).
 */

import { app, dialog, shell } from "electron";

const RELEASES_URL = "https://github.com/XinaTian/MROffice/releases";

export type UpdatePhase = "disabled" | "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

export interface UpdateStatus {
  readonly current: string;
  readonly phase: UpdatePhase;
  readonly version: string | null;
  readonly received: number | null;
  readonly total: number | null;
  readonly preparing: boolean;
  readonly checkedAt: number | null;
  readonly beta: boolean;
  readonly betaOffered: boolean;
  readonly how: "installs" | "download-page" | null;
}

export interface UpdateOptions {
  readonly displayName?: string;
  readonly macSelfInstall?: boolean;
  readonly hidden?: boolean;
  readonly betaChannel?: boolean;
}

let displayName = app.getName();

export function updateStatus(): UpdateStatus {
  return {
    current: app.getVersion(),
    phase: "disabled",
    version: null,
    received: null,
    total: null,
    preparing: false,
    checkedAt: null,
    beta: false,
    betaOffered: false,
    how: "download-page",
  };
}

export function isLocalFeedBuild(): boolean {
  return false;
}

export function onUpdateStatus(_listener: (status: UpdateStatus) => void): () => void {
  return () => undefined;
}

export function setSettleBeforeInstall(_settle: () => Promise<void>): void {}

export function setBetaUpdates(_on: boolean): void {}

/** No updater here: nothing to hold back while an AI app works. */
export function noteAutomationActivity(): void {}

export function startUpdateChecks(options: UpdateOptions = {}): void {
  if (options.displayName) displayName = options.displayName;
}

export function checkForUpdatesAfterSignIn(): void {}

/** The menu's "Check for Updates": say where new versions are, and go there if asked. */
export function checkForUpdatesNow(): void {
  const zh = app.getLocale().toLowerCase().startsWith("zh");
  const choice = dialog.showMessageBoxSync({
    type: "info",
    buttons: zh ? ["打开 Releases", "关闭"] : ["Open Releases", "Close"],
    defaultId: 0,
    cancelId: 1,
    message: zh ? `${displayName} 不会自动更新。` : `${displayName} does not update itself.`,
    detail: zh
      ? `当前版本 ${app.getVersion()}。新版本的源代码和 MR Office 组件发布在 GitHub Releases。`
      : `This is version ${app.getVersion()}. New versions of its source and of the MR Office component are published on GitHub Releases.`,
  });
  if (choice === 0) void shell.openExternal(RELEASES_URL);
}

export async function checkInline(): Promise<UpdateStatus> {
  return updateStatus();
}

export async function downloadUpdateNow(): Promise<void> {
  await shell.openExternal(RELEASES_URL);
}

export function installUpdateNow(): void {}
