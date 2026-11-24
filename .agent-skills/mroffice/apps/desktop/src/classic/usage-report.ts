/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, powerMonitor } from "electron";

import { readAccount } from "./ai-account";
import { readSettings, writeSettings } from "./desktop-settings";
import { PRODUCT } from "./product";

type CountKey =
  | "active_minutes"
  | "sessions"
  | "writebacks"
  | "autosaves"
  | "saves_as"
  | "files_created"
  | "renderer_crashes"
  | "service_crashes";

interface DayCounts extends Partial<Record<CountKey | "local_ai_calls", number>> {
  opened?: Record<string, number>;
}

interface Store {
  days: Record<string, DayCounts>;
  /** When the person was last active (ms), for the session rule. */
  lastActiveAt?: number;
  /** When a report last went through (ms). */
  sentAt?: number;
}

/** Formats a file is counted under (the API keeps the same list). */
const FORMATS = new Set([
  "docx", "doc", "dotx", "rtf", "odt", "txt", "md",
  "xlsx", "xls", "xlsm", "csv", "ods",
  "pptx", "ppt", "ppsx", "potx", "odp",
  "pdf",
]);
const KEEP_DAYS = 14;
const SESSION_GAP_MS = 30 * 60_000;
const IDLE_SECONDS = 60;
const SEND_EVERY_MS = 6 * 60 * 60_000;
const FIRST_SEND_DELAY_MS = 2 * 60_000;

const storeFile = () => path.join(app.getPath("userData"), "usage-report.json");
let store: Store | null = null;
let saveTimer: NodeJS.Timeout | null = null;

/** Whether the person leaves usage statistics on (absent: on). */
export function usageReportsEnabled(): boolean {
  return readSettings().usageReports !== false;
}

/** Turn usage statistics on or off; off forgets what was counted. */
export function setUsageReportsEnabled(on: boolean): boolean {
  writeSettings({ usageReports: on });
  if (!on) {
    store = { days: {} };
    try {
      fs.rmSync(storeFile(), { force: true });
    } catch {
      // Nothing to forget.
    }
  }
  return usageReportsEnabled();
}

/** YYYY-MM-DD in the computer's own time zone. */
export function localDay(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** The format a file is counted under: its extension when listed, else "other". */
export function formatOf(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return FORMATS.has(ext) ? ext : "other";
}

function load(): Store {
  if (store) return store;
  try {
    const value = JSON.parse(fs.readFileSync(storeFile(), "utf8")) as Store;
    store = value && typeof value === "object" && value.days && typeof value.days === "object" ? value : { days: {} };
  } catch {
    store = { days: {} };
  }
  return store;
}

function saveSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 5_000);
  saveTimer.unref?.();
}

function saveNow(): void {
  if (!store) return;
  try {
    const partial = `${storeFile()}.partial`;
    fs.writeFileSync(partial, JSON.stringify(store));
    fs.renameSync(partial, storeFile());
  } catch {
    // A count lost to a full disk only thins the dashboard.
  }
}

function today(): DayCounts {
  const days = load().days;
  const key = localDay();
  days[key] ??= {};
  return days[key];
}

/** Count one thing that happened today (nothing while statistics are off). */
export function countUsage(key: CountKey, by = 1): void {
  if (!usageReportsEnabled()) return;
  const day = today();
  day[key] = (day[key] ?? 0) + by;
  saveSoon();
}

/** A file opened in the app, by its format only. */
export function countOpened(filePath: string): void {
  if (!usageReportsEnabled()) return;
  const day = today();
  const format = formatOf(filePath);
  day.opened ??= {};
  day.opened[format] = (day.opened[format] ?? 0) + 1;
  saveSoon();
}

/** A page written to a file on disk: back to its source (by hand or by
 * autosave) or to a file chosen in a save dialog; `created` when the file
 * was not there before. */
export function countWrite(kind: "writeback" | "autosave" | "save_as", created: boolean): void {
  countUsage(kind === "writeback" ? "writebacks" : kind === "autosave" ? "autosaves" : "saves_as");
  if (created) countUsage("files_created");
}

/** One minute's look: a focused window and a person not idle is an active
 * minute; one after 30 quiet minutes starts a session. */
function tick(): void {
  if (!usageReportsEnabled()) return;
  const focused = BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused());
  if (!focused || powerMonitor.getSystemIdleTime() >= IDLE_SECONDS) return;
  const now = Date.now();
  const current = load();
  if (!current.lastActiveAt || now - current.lastActiveAt > SESSION_GAP_MS) countUsage("sessions");
  current.lastActiveAt = now;
  countUsage("active_minutes");
}

function localModelCounts(localModelDir: string | null): Record<string, number> {
  if (!localModelDir) return {};
  try {
    const value = JSON.parse(fs.readFileSync(path.join(localModelDir, "usage-days.json"), "utf8")) as unknown;
    if (!value || typeof value !== "object") return {};
    const out: Record<string, number> = {};
    for (const [day, count] of Object.entries(value as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof count === "number" && count > 0) out[day] = Math.floor(count);
    }
    return out;
  } catch {
    return {};
  }
}

function prune(current: Store): void {
  const oldest = localDay(new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60_000));
  for (const day of Object.keys(current.days)) if (day < oldest) delete current.days[day];
}

/** The report the app would send now (exported for its tests). */
export function buildReport(current: Store, localAi: Record<string, number>): Record<string, unknown> | null {
  const oldest = localDay(new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60_000));
  const keys = new Set([...Object.keys(current.days), ...Object.keys(localAi)].filter((day) => day >= oldest));
  const days = [...keys]
    .sort()
    .slice(-KEEP_DAYS)
    .map((day) => ({ day, ...current.days[day], ...(localAi[day] ? { local_ai_calls: localAi[day] } : {}) }));
  if (days.length === 0) return null;
  return {
    product: PRODUCT.id,
    version: app.getVersion(),
    os: process.platform,
    arch: process.arch,
    days,
  };
}

async function send(cloudOrigin: string, localModelDir: string | null): Promise<void> {
  if (!usageReportsEnabled()) return;
  const account = readAccount();
  if (!account) return;
  const current = load();
  prune(current);
  const report = buildReport(current, localModelCounts(localModelDir));
  if (!report) return;
  try {
    const response = await fetch(new URL("/api/v1/desktop/usage-report", cloudOrigin), {
      method: "POST",
      headers: { "content-type": "application/json", "x-mrai-desktop-token": account.token },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      current.sentAt = Date.now();
      saveNow();
    }
  } catch {
    // Offline: the days wait for the next try.
  }
}

/** Start counting active minutes and sending reports (once per launch). */
export function startUsageReports(options: { cloudOrigin: string; localModelDir: string | null }): void {
  const minute = setInterval(tick, 60_000);
  minute.unref?.();
  const first = setTimeout(() => void send(options.cloudOrigin, options.localModelDir), FIRST_SEND_DELAY_MS);
  first.unref?.();
  const later = setInterval(() => void send(options.cloudOrigin, options.localModelDir), SEND_EVERY_MS);
  later.unref?.();
  app.on("before-quit", () => saveNow());
}
