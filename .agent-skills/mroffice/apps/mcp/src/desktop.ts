// MR Office's desktop app as the AI's screen: when the app runs on this
// computer, `mroffice-mcp` (stdio) hands the AI app's MCP connection to the
// app's own MCP endpoint, so the tools open the person's files in the app's
// window and every edit shows there live (apps/desktop src/classic/ai-screen).
//
// The app says where its endpoint is in `ai-screen.json`, in its data folder
// (macOS ~/Library/Application Support/MR Office/, Windows %APPDATA%\MR Office\;
// MRNote Classic's likewise): a loopback port and a bearer token, readable by
// this user only. The endpoint answers 127.0.0.1 only, and the app asks the
// person once whether this AI app may use it.
//
// Modes (src/cli.ts): `--desktop` uses the app and starts it when it is not
// running; `--no-desktop` never does; neither: the app when it runs (or is
// installed and starts within a few seconds), else the documents of this
// server's own (the editor in the chat).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** What the app writes (apps/desktop src/classic/ai-screen/discovery.ts, version 1). */
export interface DesktopDiscovery {
  readonly v: 1;
  readonly app: string;
  readonly product: string;
  readonly version: string;
  readonly url: string;
  readonly port: number;
  readonly token: string;
  readonly pid: number;
}

export interface FoundDesktop {
  readonly file: string;
  readonly discovery: DesktopDiscovery;
}

/** The desktop apps, in the order they are looked for. */
const APPS = ["MR Office", "MRNote Classic"] as const;

/** Where each app's discovery file is on this platform (MROFFICE_DESKTOP_DISCOVERY names one instead). */
export function discoveryFiles(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  if (env.MROFFICE_DESKTOP_DISCOVERY) return [env.MROFFICE_DESKTOP_DISCOVERY];
  const home = env.HOME || env.USERPROFILE || homedir();
  const base =
    platform === "darwin"
      ? join(home, "Library", "Application Support")
      : platform === "win32"
        ? env.APPDATA || join(home, "AppData", "Roaming")
        : env.XDG_CONFIG_HOME || join(home, ".config");
  return APPS.map((app) => join(base, app, "ai-screen.json"));
}

function readDiscovery(file: string): DesktopDiscovery | null {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<DesktopDiscovery>;
    if (value.v !== 1 || typeof value.token !== "string" || typeof value.port !== "number" || typeof value.url !== "string") return null;
    // Only ever a loopback endpoint: a file that names another host is not the app's.
    const url = new URL(value.url);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || Number(url.port) !== value.port) return null;
    return value as DesktopDiscovery;
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as another user (not ours to use, but alive).
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The running app's endpoint, when one answers (its pid alive, /health with the token). */
export async function findDesktop(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<FoundDesktop | null> {
  for (const file of discoveryFiles(env)) {
    const discovery = readDiscovery(file);
    if (!discovery || !processAlive(discovery.pid)) continue;
    try {
      const response = await fetchImpl(`http://127.0.0.1:${discovery.port}/health`, {
        headers: { authorization: `Bearer ${discovery.token}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return { file, discovery };
    } catch {
      // Not answering (starting, or a file left by a crash): the next.
    }
  }
  return null;
}

/** How to start the installed app on this platform, or null when it is not installed. */
export function desktopLauncher(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): { command: string; args: string[]; app: string } | null {
  for (const app of APPS) {
    if (platform === "darwin") {
      const bundles = [join("/Applications", `${app}.app`), join(env.HOME || homedir(), "Applications", `${app}.app`)];
      // -g: in the background; the person's terminal keeps the focus.
      if (bundles.some((bundle) => existsSync(bundle))) return { command: "open", args: ["-g", "-a", app], app };
    } else if (platform === "win32") {
      const roots = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs"), env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean) as string[];
      for (const root of roots) {
        const exe = join(root, app, `${app}.exe`);
        if (existsSync(exe)) return { command: exe, args: [], app };
      }
    }
  }
  return null;
}

/** Start the installed app (when there is one) and wait for its endpoint. */
export async function launchDesktop(waitMs: number, log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<FoundDesktop | null> {
  if (env.MROFFICE_MCP_DESKTOP_LAUNCH === "0") return null;
  const launcher = desktopLauncher(env);
  if (!launcher) return null;
  log(`starting ${launcher.app}…`);
  try {
    const child = spawn(launcher.command, launcher.args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    return null;
  }
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const found = await findDesktop(env);
    if (found) return found;
  }
  return null;
}

/**
 * Hand this process's stdin/stdout MCP connection to the app's endpoint, as
 * it is (the AI app's own `initialize`, so the app asks the person about the
 * AI app by its own name). When the app restarts (a new port and token) the
 * connection is opened again on the new endpoint and the AI app's request
 * sent again; a connection the app ended (its permission taken back in
 * Settings) is opened again too, and the app asks the person again.
 */
export async function runDesktopProxy(first: FoundDesktop, log: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const stdio = new StdioServerTransport();
  let found = first;
  let initialize: JSONRPCMessage | null = null;
  let protocolVersion: string | null = null;
  let upstream: StreamableHTTPClientTransport | null = null;
  /** The id of the initialize this proxy replays (its answer is not the AI app's). */
  let replayId: string | null = null;
  let closing = false;

  const open = async (): Promise<StreamableHTTPClientTransport> => {
    const transport = new StreamableHTTPClientTransport(new URL(found.discovery.url), {
      requestInit: { headers: { authorization: `Bearer ${found.discovery.token}` } },
    });
    transport.onmessage = (message) => {
      const id = (message as { id?: unknown }).id;
      if (replayId !== null && id === replayId) {
        replayId = null;
        return;
      }
      const result = (message as { result?: { protocolVersion?: unknown } }).result;
      if (initialize && id === (initialize as { id?: unknown }).id && typeof result?.protocolVersion === "string") {
        protocolVersion = result.protocolVersion;
        transport.setProtocolVersion(result.protocolVersion);
      }
      void stdio.send(message).catch(() => undefined);
    };
    transport.onerror = (error) => log(`desktop connection: ${error.message}`);
    await transport.start();
    return transport;
  };

  /** A new connection to the app (found again: it may have restarted), the AI app's initialize replayed. */
  const reconnect = async (replay: boolean): Promise<StreamableHTTPClientTransport> => {
    const old = upstream;
    upstream = null;
    if (old) void old.close().catch(() => undefined);
    found = (await findDesktop(env)) ?? (await launchDesktop(60_000, log, env)) ?? found;
    const transport = await open();
    if (replay && initialize) {
      replayId = `mroffice-mcp-reconnect-${Date.now()}`;
      const again = { ...(initialize as Record<string, unknown>), id: replayId } as JSONRPCMessage;
      await transport.send(again);
      if (protocolVersion) transport.setProtocolVersion(protocolVersion);
      await transport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as JSONRPCMessage);
    }
    upstream = transport;
    log(`connected again to ${found.discovery.app}`);
    return transport;
  };

  // Messages go as they come (an AI app runs tools side by side); a lost
  // connection is opened again once for all the messages that found it lost.
  let connection: Promise<StreamableHTTPClientTransport> | null = null;
  let renewing: Promise<StreamableHTTPClientTransport> | null = null;
  const current = () =>
    (connection ??= open().then((transport) => {
      upstream = transport;
      return transport;
    }));
  const renew = (replay: boolean) => {
    renewing ??= reconnect(replay).finally(() => {
      renewing = null;
    });
    connection = renewing;
    return renewing;
  };
  const forward = (message: JSONRPCMessage) => {
    const method = (message as { method?: unknown }).method;
    if (method === "initialize") initialize = message;
    void (async () => {
      let used: StreamableHTTPClientTransport | null = null;
      try {
        used = await current();
        await used.send(message);
      } catch (error) {
        if (closing) return;
        log(`desktop connection lost (${error instanceof Error ? error.message : String(error)}); connecting again`);
        try {
          // Another message may have opened the new connection already.
          const transport = used && upstream && upstream !== used ? upstream : await renew(method !== "initialize");
          await transport.send(message);
        } catch (again) {
          const id = (message as { id?: unknown }).id;
          if (id !== undefined && id !== null) {
            void stdio
              .send({
                jsonrpc: "2.0",
                id,
                error: { code: -32603, message: `MR Office's desktop app does not answer (${again instanceof Error ? again.message : String(again)}). Is it running?` },
              } as JSONRPCMessage)
              .catch(() => undefined);
          }
        }
      }
    })();
  };

  stdio.onmessage = forward;
  stdio.onclose = () => {
    closing = true;
    void upstream?.terminateSession().catch(() => undefined).finally(() => void upstream?.close().catch(() => undefined));
    setTimeout(() => process.exit(0), 500).unref();
  };
  await stdio.start();
  log(`MCP on stdio, using ${found.discovery.app} ${found.discovery.version} on this computer (its window is the screen)`);
}
