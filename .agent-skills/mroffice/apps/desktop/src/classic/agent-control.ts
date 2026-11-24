/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The local API's way to the AI's browser and to the screen (agent-browser.ts,
 * agent-screen.ts): an HTTP port on 127.0.0.1 that answers only the launch's
 * agent token (Authorization: Bearer), as the printer port does. The API asks
 * for one step at a time; the person approved what needs approving there.
 * While the AI acts on the screen, a small always-on-top notice says so and
 * stops it with one click.
 *
 * `/v1/originals` is the AI's way to the files pages came from (the links in
 * originals.json that Save uses, ./original-links.ts): which page a file
 * already is, linking a page to a file, the file a page is linked to, and
 * writing a file in one step (a page saved back to its original, or an
 * export). An older shell answers it 404, and the API says so instead of
 * writing the file some other way.
 */

import { BrowserWindow, screen as electronScreen } from "electron";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

import { browserAct } from "./agent-browser";
import { screenAct } from "./agent-screen";
import { originalLinksStore } from "./local-files";
import { originalsAct } from "./original-links";

const MAX_BODY = 4 * 1024 * 1024;
/** A file the AI writes (its export, a page saved back to its original)
 * comes in the request, base64: the largest page a file becomes is 64 MB. */
const MAX_ORIGINALS_BODY = 192 * 1024 * 1024;

export interface AgentControlLaunch {
  readonly agentPort: number;
  readonly agentToken: string;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let notice: BrowserWindow | null = null;
let noticeTimer: NodeJS.Timeout | null = null;
/** The run the notice stands for (the API names it on each step, run_ref). */
let noticeRun = "";




const stoppedRuns = new Set<string>();
let stoppedUnnamed = false;





const NOTICE_STOP_TITLE = "mrai-agent-control:stop";

const NOTICE_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;font:13px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;-webkit-user-select:none}
div{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(20,20,20,.88);color:#fff}
i{width:8px;height:8px;border-radius:50%;background:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.3)}
button{margin-left:auto;border:0;border-radius:6px;padding:4px 10px;background:#fff;color:#111;cursor:pointer}
</style><div><i></i><span>MR Note 的 AI 正在操作你的电脑</span><button onclick="document.title='${NOTICE_STOP_TITLE}'">停止</button></div>`;

function showNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (notice && !notice.isDestroyed()) notice.destroy();
    notice = null;
  }, 20_000);
  if (notice && !notice.isDestroyed()) return;
  const area = electronScreen.getPrimaryDisplay().workArea;
  notice = new BrowserWindow({
    width: 340, height: 44, x: area.x + area.width - 360, y: area.y + 12,
    frame: false, transparent: true, resizable: false, movable: true, focusable: false,
    // The first click on a window that never takes focus must still press its
    // button: without this macOS spent it on activating the window.
    acceptFirstMouse: true,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  notice.setAlwaysOnTop(true, "screen-saver");
  notice.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notice.on("page-title-updated", (event, title) => {
    event.preventDefault();
    if (title === NOTICE_STOP_TITLE) {
      if (noticeRun) stoppedRuns.add(noticeRun);
      else stoppedUnnamed = true;
      if (notice && !notice.isDestroyed()) notice.destroy();
      notice = null;
    }
  });
  void notice.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(NOTICE_HTML)}`);
  notice.once("ready-to-show", () => notice?.showInactive());
}

export function startAgentControl(launch: AgentControlLaunch): Promise<http.Server | null> {
  const server = http.createServer((req, res) => {
    const answer = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const auth = req.headers.authorization ?? "";
    const route = req.url ?? "";
    if (
      req.method !== "POST" ||
      !["/v1/browser", "/v1/screen", "/v1/originals"].includes(route) ||
      req.headers.host !== `127.0.0.1:${launch.agentPort}` ||
      req.headers.origin !== undefined ||
      !auth.startsWith("Bearer ") ||
      !sameSecret(auth.slice("Bearer ".length), launch.agentToken)
    ) {
      req.resume();
      answer(404, { ok: false, error: "not found" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const limit = route === "/v1/originals" ? MAX_ORIGINALS_BODY : MAX_BODY;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > limit) {
        answer(413, { ok: false, error: "too large" });
        return;
      }
      let request: Record<string, unknown>;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        answer(400, { ok: false, error: "bad request" });
        return;
      }
      if (route === "/v1/originals") {
        void originalsAct(originalLinksStore, request).then(
          (result) => answer(200, result),
          (error: unknown) => answer(200, { ok: false, error: "originals_failed", message: String(error) }),
        );
        return;
      }
      if (route === "/v1/screen") {
        const action = String(request.action);
        const acting = !["permissions", "settings", "screenshot", "elements", "list_apps", "get_app_state"].includes(action);
        const run = typeof request.run_ref === "string" ? request.run_ref : "";
        const refused = run
          ? stoppedRuns.has(run) && !["permissions", "settings"].includes(action)
          : acting && stoppedUnnamed;
        if (refused) {
          if (!run) stoppedUnnamed = false;
          answer(200, { ok: false, error: "stopped_by_person", message: "The person stopped the AI's control of the screen." });
          return;
        }
        if (acting) {
          noticeRun = run;
          showNotice();
        }
        void screenAct(request).then((result) => answer(200, result));
        return;
      }
      void browserAct(request).then((result) => answer(200, result));
    });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 10_000;
  return new Promise((resolve) => {
    server.once("error", (error) => {
      console.error(`[classic] agent control could not listen: ${error.message}`);
      resolve(null);
    });
    server.listen(launch.agentPort, "127.0.0.1", () => resolve(server));
  });
}
