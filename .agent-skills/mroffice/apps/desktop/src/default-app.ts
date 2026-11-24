/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Make the app the one a double-click opens.
 *
 * - macOS: the bundled helper (native/mac/default-app.swift) asks Launch
 *   Services, through NSWorkspace.setDefaultApplication, to open each chosen
 *   document type with this app; macOS asks the person to confirm each type
 *   (Settings > General lists them one by one). `status` reports the types
 *   that already open here.
 * - Windows: since Windows 10 no app may change the defaults itself; the
 *   app's own page of Settings > Default apps is opened, where one click on
 *   "Set default" makes it the default for all its types (Windows 11).
 *   `status` reads the person's choice per type from the registry
 *   (Explorer\FileExts\.<ext>\UserChoice, else the class's own default)
 *   and compares it with the ProgID the installer registered.
 * - Anything else: not offered.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { app, shell } from "electron";

import { parseRegValue, WINDOWS_PROG_ID_KINDS } from "./default-app-offer";
import { componentRoot } from "./component";

export interface DefaultAppState {
  readonly supported: "direct" | "settings" | "none";
  /** Whether the system answered which app opens each type. */
  readonly checked: boolean;
  /** Extensions that already open with this app. */
  readonly defaultFor: readonly string[];
  readonly extensions: readonly string[];
}

/**
 * The types "make it the default" offers, one system confirmation each on
 * macOS. The rarer ones (.docm, .xls, .tsv; .markdown is the same type as
 * .md) stay under Open With only.
 */
export const DEFAULT_APP_EXTENSIONS: readonly string[] = ["docx", "xlsx", "pptx", "pdf", "md", "csv"];
const EXTENSIONS = DEFAULT_APP_EXTENSIONS;
/** The person answers one dialog per type; give them time. */
const SET_TIMEOUT_MS = 11 * 60 * 1000;



let windowsProgIdPrefix = "MROfficeEditors.";
/** The RegisteredApplications value the installer writes, by which Settings
 * opens this app's own Default apps page (MR Note: build/installer.nsh;
 * MR Office: build/office/installer.nsh). */
let windowsRegisteredApp = "MR Office Editors";

export function configureDefaultApp(options: { windowsProgIdPrefix?: string; windowsRegisteredApp?: string }): void {
  if (options.windowsProgIdPrefix) windowsProgIdPrefix = options.windowsProgIdPrefix;
  if (options.windowsRegisteredApp) windowsRegisteredApp = options.windowsRegisteredApp;
}

/** The requested types that may be made default (all of them when none given). */
export function defaultAppExtensions(requested: unknown): string[] {
  if (!Array.isArray(requested)) return [...EXTENSIONS];
  return EXTENSIONS.filter((ext) => requested.includes(ext));
}

function macBundlePath(): string | null {
  // …/MR. Lattivity.app/Contents/MacOS/MR. Lattivity
  const bundle = path.resolve(path.dirname(app.getPath("exe")), "..", "..");
  return bundle.endsWith(".app") ? bundle : null;
}

function helperPath(): string {
  return path.join(componentRoot() ?? path.join(__dirname, "..", "build"), "helper", "mrai-default-app");
}

function runHelper(args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(helperPath(), args, { timeout }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** One registry value; null when the key or value is absent. */
function readRegistry(key: string, value: string | null): Promise<string | null> {
  const args = ["query", key, ...(value ? ["/v", value] : ["/ve"])];
  return new Promise((resolve, reject) => {
    execFile("reg", args, { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (!error) resolve(parseRegValue(stdout));
      // reg.exe exits 1 for a missing key or value; anything else is no answer.
      else if ((error as { code?: unknown }).code === 1) resolve(null);
      else reject(error);
    });
  });
}

/** The ProgID a double-click on `.ext` opens with: the person's choice
 * (Windows 11 24H2 keeps it under UserChoiceLatest), else the class's own. */
async function windowsProgIdFor(ext: string): Promise<string | null> {
  const fileExts = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${ext}`;
  return (
    (await readRegistry(`${fileExts}\\UserChoiceLatest`, "ProgId")) ??
    (await readRegistry(`${fileExts}\\UserChoice`, "ProgId")) ??
    (await readRegistry(`HKCR\\.${ext}`, null))
  );
}

export async function defaultAppState(): Promise<DefaultAppState> {
  if (process.platform === "darwin") {
    const bundle = macBundlePath();
    if (!bundle) return { supported: "none", checked: false, defaultFor: [], extensions: EXTENSIONS };
    try {
      const out = await runHelper(["status", bundle, ...EXTENSIONS]);
      const defaultFor = out
        .split("\n")
        .filter((line) => line.endsWith(" yes"))
        .map((line) => line.split(" ")[0]);
      return { supported: "direct", checked: true, defaultFor, extensions: EXTENSIONS };
    } catch {
      return { supported: "direct", checked: false, defaultFor: [], extensions: EXTENSIONS };
    }
  }
  if (process.platform === "win32") {
    try {
      const progIds = await Promise.all(EXTENSIONS.map((ext) => windowsProgIdFor(ext)));
      const defaultFor = EXTENSIONS.filter(
        (ext, index) =>
          progIds[index]?.toLowerCase() === `${windowsProgIdPrefix}${WINDOWS_PROG_ID_KINDS[ext] ?? ""}`.toLowerCase(),
      );
      return { supported: "settings", checked: true, defaultFor, extensions: EXTENSIONS };
    } catch {
      return { supported: "settings", checked: false, defaultFor: [], extensions: EXTENSIONS };
    }
  }
  return { supported: "none", checked: false, defaultFor: [], extensions: EXTENSIONS };
}

/**
 * Make this app the default for the given types (all offered ones when none
 * are given); resolves to the state afterwards, once the person has answered.
 */
export async function makeDefaultApp(extensions: readonly string[] = EXTENSIONS): Promise<DefaultAppState> {
  if (process.platform === "darwin") {
    const bundle = macBundlePath();
    if (bundle && extensions.length) {
      await runHelper(["set", bundle, ...extensions], SET_TIMEOUT_MS).catch(() => undefined);
    }
  } else if (process.platform === "win32") {
    // Registered by the installer under RegisteredApplications (above);
    // older Windows open the general page.
    await shell
      .openExternal(`ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(windowsRegisteredApp)}`)
      .catch(() => shell.openExternal("ms-settings:defaultapps"));
  }
  return defaultAppState();
}
