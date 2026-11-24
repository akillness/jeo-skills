/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The MR Office component: the local service this app runs when it is
 * installed (the API, the web app, the Office file engines and their
 * runtime). It is free but not open source, and is downloaded on its own
 * from the repository's Releases (README.md). With it, this app is the MR
 * Office desktop app; without it, the open-source editors run on their own
 * (src/editors/).
 *
 * Where it is looked for, first found:
 * 1. MROFFICE_COMPONENT_DIR, a folder (any build);
 * 2. resources/component inside the app (a package built with the component
 *    beside it: apps/desktop/component, electron-builder.config.cjs);
 * 3. the app's data folder: <app data>/MR Office Editors/component.
 *
 * A component fits this shell only when it was built for the same bridge
 * between the shell and its pages: its component.json names the contract
 * (a digest of the shell's preload bridges), and so does this shell
 * (component-contract.json, written by the export). Any other component is
 * not started: the app says which version it needs instead.
 *
 * No Electron here, so it is tested on its own (test/component.test.mjs).
 */

import fs from "node:fs";
import path from "node:path";

export const COMPONENT_RELEASES_URL = "https://github.com/XinaTian/MROffice/releases";

export interface ComponentManifest {
  readonly name: string;
  readonly version: string;
  readonly contract: string;
  readonly platform: string;
  readonly arch: string;
}

export type ComponentState =
  | { readonly kind: "ready"; readonly root: string; readonly manifest: ComponentManifest }
  | { readonly kind: "absent"; readonly looked: readonly string[] }
  | { readonly kind: "unusable"; readonly root: string; readonly reason: string };

/** What a component holds (the folders the shell starts it from). */
const REQUIRED = [
  ["runtime", "node"],
  ["runtime", "python"],
  ["mrnote", "apps", "api"],
  ["mrnote", "apps", "web"],
  ["mrnote", "engine-host"],
];

export function readManifest(root: string): ComponentManifest | null {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, "component.json"), "utf8")) as Partial<ComponentManifest>;
    if (typeof value.version !== "string" || typeof value.contract !== "string") return null;
    return {
      name: String(value.name ?? "MR Office component"),
      version: value.version,
      contract: value.contract,
      platform: String(value.platform ?? ""),
      arch: String(value.arch ?? ""),
    };
  } catch {
    return null;
  }
}

/** The places looked at, in order. */
export function componentCandidates(options: { env?: string; resourcesPath?: string | null; userData: string }): string[] {
  return [options.env, options.resourcesPath ? path.join(options.resourcesPath, "component") : null, path.join(options.userData, "component")].filter(
    (item): item is string => Boolean(item),
  );
}

export function findComponent(options: {
  candidates: readonly string[];
  contract: string;
  platform?: string;
  arch?: string;
}): ComponentState {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  for (const root of options.candidates) {
    if (!fs.existsSync(root)) continue;
    const manifest = readManifest(root);
    if (!manifest) return { kind: "unusable", root, reason: "it has no component.json" };
    if (manifest.platform && (manifest.platform !== platform || (manifest.arch && manifest.arch !== arch))) {
      return { kind: "unusable", root, reason: `it is built for ${manifest.platform}-${manifest.arch}, and this computer is ${platform}-${arch}` };
    }
    if (manifest.contract !== options.contract) {
      return { kind: "unusable", root, reason: `it (${manifest.version}) was built for another version of this app` };
    }
    const missing = REQUIRED.map((parts) => path.join(...parts)).filter((part) => !fs.existsSync(path.join(root, part)));
    if (missing.length) return { kind: "unusable", root, reason: `it is incomplete (no ${missing.join(", ")})` };
    return { kind: "ready", root, manifest };
  }
  return { kind: "absent", looked: [...options.candidates] };
}

/** This shell's contract (component-contract.json beside the app's package.json). */
export function shellContract(appRoot: string): string {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(appRoot, "component-contract.json"), "utf8")) as { contract?: unknown };
    return typeof value.contract === "string" ? value.contract : "";
  } catch {
    return "";
  }
}

let current: ComponentState | null = null;

/** The state the entry found (src/entry.ts), for the rest of the app. */
export function setComponentState(state: ComponentState): void {
  current = state;
}

export function componentState(): ComponentState | null {
  return current;
}

/** The component's folder, when it is ready. */
export function componentRoot(): string | null {
  return current?.kind === "ready" ? current.root : null;
}
