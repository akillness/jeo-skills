/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The web server's port, kept the same at every launch.
 *
 * A page's storage (localStorage, IndexedDB, its service worker) belongs to
 * its origin, port included. The editors keep there more than preferences:
 * AutoRecover's unsaved drafts and the PDF recovery queue. A launch on another port neither sees
 * the drafts kept on the remembered one nor leaves its own where the next
 * launch looks, so the port must not move:
 *
 * - The first launch's port is remembered and every later launch uses it.
 * - The launch's own other ports (API, object store, printer, the AI's
 *   browser) are chosen around it: one of them landing on it once made the
 *   remembered port be given up for good (written over with that launch's
 *   fresh one), and every draft kept on the old origin was out of reach from
 *   then on.
 * - A remembered port still held when the app starts is, nearly always, the
 *   last launch's web server on its way out (a quick quit and reopen): it is
 *   waited for. Only a port held for longer than that is passed over for this
 *   launch, which is said in the log, and it is still the one remembered.
 * - Each launch records its web server's process and port when it starts
 *   (`lastWebServerHolds`). A held port whose last server is gone, or served
 *   another port, is held by another program: it is passed over at once, not
 *   waited for (every launch waited 10 s while another program kept it).
 *   With no record (the launch after an update from a version that kept
 *   none), the port is waited for as before.
 */

export interface WebPortChoice {
  /** The port this launch serves on. */
  readonly port: number;
  /** Whether it is the remembered one (else this launch is on a temporary origin). */
  readonly remembered: boolean;
  /** The port to remember for the next launches. */
  readonly remember: number;
}

export interface WebPortOptions {
  /** The remembered port, or 0 / NaN when there is none. */
  readonly remembered: number;
  /** A free port picked for this launch's web server. */
  readonly fresh: number;
  /** Whether a port can be listened on now. */
  readonly isFree: (port: number) => Promise<boolean>;
  /** How long a held remembered port is waited for, in ms. */
  readonly waitMs?: number;
  /**
   * Whether the last launch's web server, on that port, is still running:
   * true (it holds the port on its way out), false (it is gone, or served
   * another port: another program holds it), null (no record of it).
   */
  readonly heldByLastLaunch?: () => boolean | null;
  readonly sleep?: (ms: number) => Promise<void>;
}

const WAIT_STEP_MS = 250;

export function usablePort(port: number): boolean {
  return Number.isInteger(port) && port > 1024 && port < 65536;
}

export async function chooseWebPort(options: WebPortOptions): Promise<WebPortChoice> {
  const { remembered, fresh, isFree } = options;
  if (!usablePort(remembered)) return { port: fresh, remembered: false, remember: fresh };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + (options.waitMs ?? 10_000);
  for (;;) {
    if (await isFree(remembered)) return { port: remembered, remembered: true, remember: remembered };
    if (Date.now() >= deadline || options.heldByLastLaunch?.() === false) {
      return { port: fresh, remembered: false, remember: remembered };
    }
    await sleep(WAIT_STEP_MS);
  }
}

/** The web server a launch started, as recorded in the data folder. */
export interface LastWebServer {
  readonly pid: number;
  readonly port: number;
}

export function parseLastWebServer(text: string): LastWebServer | null {
  try {
    const value = JSON.parse(text) as { pid?: unknown; port?: unknown };
    const { pid, port } = value;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
    if (typeof port !== "number" || !usablePort(port)) return null;
    return { pid, port };
  } catch {
    return null;
  }
}

/**
 * `heldByLastLaunch` for `port`, from the last launch's record (null: none)
 * and whether a process is running (`alive`).
 */
export function lastWebServerHolds(
  last: LastWebServer | null,
  port: number,
  alive: (pid: number) => boolean,
): () => boolean | null {
  return () => {
    if (!last) return null;
    return last.port === port && alive(last.pid);
  };
}

/**
 * Ports for the launch's other services that are not the remembered web
 * port: any that is is picked again (`pick` gives a free port each call).
 */
export async function portsAvoiding(
  ports: readonly number[],
  avoid: number,
  pick: () => Promise<number>,
): Promise<number[]> {
  const chosen: number[] = [];
  for (const port of ports) {
    let next = port;
    while (next === avoid || chosen.includes(next)) next = await pick();
    chosen.push(next);
  }
  return chosen;
}
