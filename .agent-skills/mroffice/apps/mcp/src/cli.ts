#!/usr/bin/env node
// mroffice-mcp          MCP over stdin/stdout (an AI app that starts the server
//                       itself; --stdio says the same), with the editor pages
//                       on the HTTP side
// mroffice-mcp --http   the MCP endpoint at <public url>/mcp, with the editor pages
// mroffice-mcp --desktop  MCP over stdin/stdout, handed to MR Office's desktop app
//                       (its window is the AI's screen; started when not running).
//                       Without --desktop or --no-desktop, stdio uses the app when it
//                       runs (or is installed and starts), else this server's own.
//
// Settings come from the environment (src/config.ts): MROFFICE_MCP_PORT,
// MROFFICE_MCP_PUBLIC_URL, MROFFICE_MCP_EDITOR_DIST, MROFFICE_MCP_EDITOR_ORIGIN,
// MROFFICE_MCP_ENGINE (none | local-dev), MROFFICE_MCP_DEV_EMAIL, MROFFICE_MCP_DATA_DIR ...

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Account } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { findDesktop, launchDesktop, runDesktopProxy } from "./desktop.ts";
import { createEngine } from "./engine.ts";
import { startHttp } from "./http.ts";
import { HeadlessEditor } from "./render.ts";
import { createServer, VERSION, type Services } from "./server.ts";
import { DocumentStore } from "./store.ts";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`mroffice-mcp ${VERSION}: MR Office's editors as an MCP server

  mroffice-mcp           MCP over stdin/stdout, for an AI app that starts the server itself
                         (the default; --stdio says the same)
  mroffice-mcp --http    MCP over Streamable HTTP at http://127.0.0.1:<port>/mcp
  mroffice-mcp --desktop MCP over stdin/stdout, with MR Office's desktop app as the screen:
                         files open in its window and every edit shows there live
                         (starts the app when it is not running)
  mroffice-mcp --no-desktop  stdio, never the desktop app (documents kept by this server)
  mroffice-mcp login     sign in to your MR Office account (for Word, Excel and PowerPoint files)
  mroffice-mcp logout    sign out and revoke this computer's access
  mroffice-mcp whoami    who is signed in

With neither flag, stdio uses the MR Office desktop app when it runs on this computer
(or is installed: it is started in the background), and this server's own documents otherwise.
Both also serve the editor page that links open, on http://127.0.0.1:<port> (default 3410).
Nothing needs setting up: the first Word, Excel or PowerPoint file opens
MR Office's sign-in in your browser.

Add it to an AI app: in its MCP settings, the command is
  npx -y mroffice-mcp
or add the hosted server, https://mcp.mroffice.ai/mcp, as a remote MCP server
(connector). Instructions for each app: https://mroffice.ai/developers/mcp

Environment:
  MROFFICE_MCP_PORT        port of the HTTP side (3410)
  MROFFICE_MCP_DATA_DIR    where documents are kept (a folder in the system temp directory)
  MROFFICE_MCP_EDITOR_ORIGIN  where the editor's scripts load from (https://demo.mroffice.ai)
  MROFFICE_MCP_PUBLIC_URL  the address people and apps reach the HTTP side at
  MROFFICE_MCP_MAX_FILE_BYTES  largest file a tool takes (20 MB)
  MROFFICE_MCP_API_URL     the MR Office to sign in to (https://mroffice.ai)
  MROFFICE_MCP_DESKTOP     1 = --desktop, 0 = --no-desktop
  MROFFICE_DESKTOP_DISCOVERY  the desktop app's ai-screen.json (default: its data folder)
  MROFFICE_MCP_DESKTOP_LAUNCH  0 = never start the desktop app

https://mroffice.ai
`);
  process.exit(0);
}

const config = loadConfig();
const account = config.engine.kind === "account" ? new Account(config.engine.apiUrl) : undefined;
const command = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
if (command === "login" || command === "logout" || command === "whoami") {
  if (!account) {
    process.stderr.write("Signing in needs the account engine (MROFFICE_MCP_ENGINE=account, the default).\n");
    process.exit(2);
  }
  if (command === "whoami") {
    const current = account.credentials();
    process.stdout.write(current ? `Signed in to ${account.apiUrl}${current.account ? ` as ${current.account.email}` : ""}\n` : `Not signed in to ${account.apiUrl}\n`);
    process.exit(current ? 0 : 1);
  }
  if (command === "logout") {
    process.stdout.write((await account.logout()) ? "Signed out; this computer's access is revoked.\n" : "Not signed in.\n");
    process.exit(0);
  }
  const { url, done } = await account.startLogin(true);
  process.stdout.write(`Opening MR Office's sign-in page. If the browser does not open, visit:\n${url}\n`);
  try {
    const signed = await done;
    process.stdout.write(`Signed in to ${account.apiUrl}${signed.account ? ` as ${signed.account.email}` : ""}.\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
if (command) {
  process.stderr.write(`Unknown command ${command}; see mroffice-mcp --help\n`);
  process.exit(2);
}

const log = (line: string) => process.stderr.write(`[mroffice-mcp] ${line}\n`);

// The desktop app as the screen (src/desktop.ts), over stdio only.
let proxied = false;
if (!process.argv.includes("--http")) {
  const desktopFlag = process.argv.includes("--desktop") || process.env.MROFFICE_MCP_DESKTOP === "1";
  const ownFlag = process.argv.includes("--no-desktop") || process.env.MROFFICE_MCP_DESKTOP === "0";
  if (desktopFlag && ownFlag) {
    process.stderr.write("--desktop and --no-desktop together: choose one.\n");
    process.exit(2);
  }
  if (!ownFlag) {
    const found = (await findDesktop()) ?? (await launchDesktop(desktopFlag ? 90_000 : 30_000, log));
    if (found) {
      await runDesktopProxy(found, log);
      proxied = true;
    } else if (desktopFlag) {
      process.stderr.write(
        "MR Office's desktop app is not running and could not be started. Install it from https://mroffice.ai/download, open it, " +
          'and check that Settings > General > "Let AI apps use this app as their screen" is on; then start this again ' +
          "(--no-desktop uses MR Office without the app).\n",
      );
      process.exit(1);
    }
  }
}

// The app's endpoint answers every tool when proxied: nothing of this server's own runs then.
const services: Services | null = proxied
  ? null
  : { config, store: new DocumentStore(config.dataDir), engine: createEngine(config, account), renderer: new HeadlessEditor(config), account: config.auth === "oauth" ? undefined : account };

if (!services) {
  // proxied (src/desktop.ts)
} else if (!process.argv.includes("--http")) {
  if (process.stdin.isTTY && !process.argv.includes("--stdio")) {
    // started by hand in a terminal: say what this is instead of waiting silently
    log("this is an MCP server: an AI app starts it itself (its MCP settings take the command `npx -y mroffice-mcp`; https://mroffice.ai/developers/mcp).");
    log("waiting for an MCP client on stdin; Ctrl-C to stop. --http serves it over HTTP, --help says more.");
  }
  // the editor pages and links; another process over the same data directory may already serve them
  try {
    await startHttp(services);
    log(`editor pages at ${config.publicUrl}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    log(`port ${config.port} is in use: links point to the server already there`);
  }
  await createServer(services).connect(new StdioServerTransport());
  log("MCP on stdio");
} else {
  await startHttp(services);
  log(`MCP at ${config.publicUrl}/mcp; editor pages at ${config.publicUrl}/_mcp/view/<id>; engine ${config.engine.kind}; editor assets from ${config.editorOrigin}; documents in ${config.dataDir}`);
}

const stop = async () => {
  await services?.renderer.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
