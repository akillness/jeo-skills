/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

import { startVibeChecker, type VibeCheckerLaunch } from "./vibe-checker";

export const CHECKER_PROCESS_FLAG = "--mrai-vibe-checker-process";

/** shared-runtime-browser.mjs NETWORK_LOCKDOWN_ARGS, for this whole process. */
export const CHECKER_PROCESS_SWITCHES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ["force-webrtc-ip-handling-policy", "disable_non_proxied_udp"],
  ["proxy-server", "http://127.0.0.1:9"],
  ["proxy-bypass-list", "<-loopback>"],
  ["host-resolver-rules", "MAP * ~NOTFOUND"],
] as const);

const ENV = {
  port: "MRAI_VIBE_CHECKER_PORT",
  token: "MRAI_VIBE_CHECKER_TOKEN",
  runtime: "MRAI_VIBE_CHECKER_RUNTIME",
  pyodide: "MRAI_VIBE_CHECKER_PYODIDE",
  parent: "MRAI_VIBE_CHECKER_PARENT_PID",
} as const;

/** The site checker's network rules, on this process; before the app is ready. */
export function applyCheckerProcessSwitches(): void {
  for (const [name, value] of CHECKER_PROCESS_SWITCHES) app.commandLine.appendSwitch(name, value);
}

/** This process is the checker: run it and nothing else. */
export function runVibeCheckerProcess(): void {
  applyCheckerProcessSwitches();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mrai-vibe-checker-"));
  app.setPath("userData", data);
  app.setPath("sessionData", data);
  if (process.platform === "darwin") app.setActivationPolicy("prohibited");
  app.on("window-all-closed", () => undefined);
  app.on("will-quit", () => fs.rmSync(data, { recursive: true, force: true }));
  const parent = Number(process.env[ENV.parent]);
  if (Number.isInteger(parent) && parent > 0) {
    setInterval(() => {
      try {
        process.kill(parent, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ESRCH") app.quit();
      }
    }, 2_000).unref();
  }
  const port = Number(process.env[ENV.port]);
  const token = process.env[ENV.token] ?? "";
  void app.whenReady().then(async () => {
    const started =
      Number.isInteger(port) && port > 0 && /^[a-f0-9]{64}$/.test(token)
        ? await startVibeChecker({ vibePort: port, vibeToken: token }, process.env[ENV.runtime] || null, process.env[ENV.pyodide] || null)
        : null;
    if (!started) {
      app.exit(1);
      return;
    }
    console.log(`mrai-vibe-checker ready on 127.0.0.1:${port}`);
  });
}

/**
 * Starts the checker process for this launch (the shell's side), and starts
 * it again if it ends while the app runs (at most once a minute). Returns
 * the function that ends it.
 */
export function startVibeCheckerProcess(
  launch: VibeCheckerLaunch,
  runtimeDir: string | null,
  pyodideDir: string | null,
): () => void {
  let child: ChildProcess | null = null;
  let stopped = false;
  let lastStart = 0;
  const start = () => {
    if (stopped || !runtimeDir) return;
    lastStart = Date.now();
    const keep = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "APPDATA", "LOCALAPPDATA"];
    const env: NodeJS.ProcessEnv = {};
    for (const key of keep) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, {
      [ENV.port]: String(launch.vibePort),
      [ENV.token]: launch.vibeToken,
      [ENV.runtime]: runtimeDir,
      [ENV.pyodide]: pyodideDir ?? "",
      [ENV.parent]: String(process.pid),
      ...(process.env.MRAI_VIBE_CHECKER_DEBUG ? { MRAI_VIBE_CHECKER_DEBUG: "1" } : {}),
    });
    // A packed app's executable starts its own entry; an unpacked run is
    // Electron with the entry's path.
    const args = app.isPackaged ? [CHECKER_PROCESS_FLAG] : [process.argv[1], CHECKER_PROCESS_FLAG];
    const started = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child = started;
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split("\n")) if (line.trim()) console.log(`[vibe-checker] ${line.slice(0, 500)}`);
    };
    started.stdout?.on("data", forward);
    started.stderr?.on("data", forward);
    started.on("exit", (code, signal) => {
      if (child === started) child = null;
      if (stopped) return;
      console.error(`[classic] window checker process ended (${code ?? signal})`);
      setTimeout(start, Math.max(0, 60_000 - (Date.now() - lastStart))).unref();
    });
  };
  start();
  return () => {
    stopped = true;
    child?.kill();
    child = null;
  };
}
