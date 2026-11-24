/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The window checker's closure (./vibe-checker.ts): what the shell runs in its
 * own Chromium to check an AI-made window, read once and verified byte for
 * byte against its manifest before any of it is used.
 *
 * Built by apps/web/scripts/build-vibe-runtime.mjs --desktop and staged by
 * scripts/classic-assemble.mjs into mrnote/vibe-runtime/:
 *
 *   manifest.json            schema mrnote.desktop-vibe-runtime.v1: every
 *                            file below by sha256 and size
 *   preflight.iife.js        the site checker's host bundles, the same
 *   dom-preflight.iife.js    sources the site's checker (Playwright and a
 *   server.iife.js           headless Chromium) runs, minified
 *   code-sandbox.html        the sandbox page the windows run in
 *   injected-script.js       Playwright's injected DOM script: the selector
 *                            engine and the visible / enabled / stable /
 *                            hit-target checks the site's checker clicks with
 *   font-families.json       the default fonts that checker sets per platform
 *
 * The five Pyodide files a shared Python window needs come from the copy the
 * app already ships (apps/web/pyodide, classic-pyodide.mjs), checked against
 * the pins the host bundle itself carries, as the site's checker checks them.
 *
 * A missing, changed or unknown file makes the checker unavailable: windows
 * are then refused (shared) or offered unchecked (others), never checked by
 * other bytes than these.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RUNTIME_SCHEMA = "mrnote.desktop-vibe-runtime.v1";
export const RUNTIME_ENTRIES = {
  shared: "lib/vibe-window/shared-app-preflight.ts",
  dom: "lib/vibe-window/dom-preflight.ts",
  action: "lib/vibe-window/shared-app-server.ts",
} as const;
export type RuntimeLane = keyof typeof RUNTIME_ENTRIES;

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

export class VibeRuntimeError extends Error {}

export interface VibeRuntime {
  readonly dir: string;
  /** The manifest's own digest: the API binds receipts to it. */
  readonly manifestSha256: string;
  readonly bundles: Readonly<Record<RuntimeLane, string>>;
  readonly sandboxPage: Buffer;
  readonly injectedScript: string;
  readonly fontFamilies: unknown;
  readonly pyodide: { readonly base: string; readonly dir: string | null };
}

interface Pin {
  sha256: string;
  bytes: number;
}

function pinOf(value: unknown): Pin {
  const pin = value as Pin | null;
  if (!pin || typeof pin.sha256 !== "string" || !HEX64.test(pin.sha256) || !Number.isInteger(pin.bytes) || pin.bytes < 0) {
    throw new VibeRuntimeError("manifest-pin-invalid");
  }
  return pin;
}

/** The closure in `dir`, verified; a VibeRuntimeError when it cannot be trusted. */
export function loadVibeRuntime(dir: string, pyodideDir: string | null): VibeRuntime {
  let raw: Buffer;
  try {
    const stat = fs.statSync(path.join(dir, "manifest.json"));
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new VibeRuntimeError("manifest-invalid");
    raw = fs.readFileSync(path.join(dir, "manifest.json"));
  } catch (error) {
    if (error instanceof VibeRuntimeError) throw error;
    throw new VibeRuntimeError("manifest-missing");
  }
  let manifest: {
    schema?: unknown;
    entries?: Record<string, unknown>;
    files?: Record<string, unknown>;
    pyodide?: { base?: unknown };
  };
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new VibeRuntimeError("manifest-invalid");
  }
  if (
    !manifest ||
    manifest.schema !== RUNTIME_SCHEMA ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    !manifest.entries ||
    typeof manifest.entries !== "object"
  ) {
    throw new VibeRuntimeError("manifest-invalid");
  }
  const files = manifest.files;
  const read = (name: unknown): Buffer => {
    if (typeof name !== "string" || !SAFE_NAME.test(name) || !Object.hasOwn(files, name)) {
      throw new VibeRuntimeError("manifest-file-unknown");
    }
    const pin = pinOf(files[name]);
    if (pin.bytes > MAX_FILE_BYTES) throw new VibeRuntimeError("manifest-file-too-large");
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(dir, name));
    } catch {
      throw new VibeRuntimeError("manifest-file-missing");
    }
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new VibeRuntimeError("manifest-file-changed");
    return bytes;
  };
  const bundles = {} as Record<RuntimeLane, string>;
  for (const [lane, entry] of Object.entries(RUNTIME_ENTRIES) as Array<[RuntimeLane, string]>) {
    bundles[lane] = read(manifest.entries[entry]).toString("utf8");
  }
  const base = manifest.pyodide?.base;
  if (typeof base !== "string" || !/^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v0\.26\.2\/full\/$/.test(base)) {
    throw new VibeRuntimeError("manifest-pyodide-invalid");
  }
  let fontFamilies: unknown;
  try {
    fontFamilies = JSON.parse(read("font-families.json").toString("utf8"));
  } catch (error) {
    if (error instanceof VibeRuntimeError) throw error;
    throw new VibeRuntimeError("manifest-fonts-invalid");
  }
  return Object.freeze({
    dir,
    manifestSha256: sha256(raw),
    bundles: Object.freeze(bundles),
    sandboxPage: read("code-sandbox.html"),
    injectedScript: read("injected-script.js").toString("utf8"),
    fontFamilies,
    pyodide: Object.freeze({ base, dir: pyodideDir }),
  });
}

/**
 * One pinned Pyodide file, read from the app's own copy and checked against
 * the pin the host bundle gave (url, bytes, sha256), as the site's checker
 * checks the bytes it fetched; a VibeRuntimeError when the app has no copy or other bytes.
 */
export function readPyodideAsset(runtime: VibeRuntime, pin: { url: unknown; bytes: unknown; sha256: unknown }): Buffer {
  if (
    typeof pin.url !== "string" ||
    !pin.url.startsWith(runtime.pyodide.base) ||
    typeof pin.bytes !== "number" ||
    pin.bytes > 12_000_000 ||
    typeof pin.sha256 !== "string"
  ) {
    throw new VibeRuntimeError("asset-pin");
  }
  const name = pin.url.slice(runtime.pyodide.base.length);
  if (!SAFE_NAME.test(name) || !runtime.pyodide.dir) throw new VibeRuntimeError("asset-unavailable");
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(path.join(runtime.pyodide.dir, name));
  } catch {
    throw new VibeRuntimeError("asset-unavailable");
  }
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new VibeRuntimeError("asset-integrity");
  return bytes;
}
