/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The screen, mouse and keyboard of this computer, for MR Note Classic's AI.
 * macOS: pictures from the system's own screencapture, input through the
 * bundled helper (native/mac/computer-control.swift); both need what the
 * person grants in System Settings (Screen Recording, Accessibility), and
 * this asks macOS to show its own prompts, nothing more. Windows: PowerShell
 * with the system's own .NET and user32 calls.
 *
 * Coordinates: the AI points at the picture it was shown; the picture is the
 * main display scaled to at most PICTURE_WIDTH pixels, so each answer says
 * the picture's size and the display's size in points, and input converts.
 *
 * A request that names an app (request.app: list_apps, get_app_state, and
 * click / type / key / set_value / select_text / secondary_action / scroll /
 * drag / menu on it) goes to agent-apps.ts instead: that app's own window and
 * elements, in front or not, input to it alone. The whole-screen actions stay
 * for older callers and for what no app's tree shows.
 */

import { app, shell } from "electron";
import { execFile } from "node:child_process";

import { appAct, appState, listApps, openApp, pausedWhileLocked, useHelper } from "./agent-apps";
import { componentRoot } from "../component";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PICTURE_WIDTH = 1568;

export type ScreenAnswer = Record<string, unknown> & { ok: boolean };

function run(file: string, args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      const code = error ? Number((error as NodeJS.ErrnoException & { code?: unknown }).code) || 1 : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });
}

function helper(): string {
  return path.join(componentRoot() ?? path.join(__dirname, "..", "..", "build"), "helper", "mrai-computer");
}

useHelper(helper);

async function mac(args: string[]): Promise<Record<string, unknown>> {
  const result = await run(helper(), args);
  try {
    const value = JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
    return Array.isArray(value) ? { list: value } : value;
  } catch {
    return { error: (result.stderr || result.stdout || "helper failed").slice(0, 300) };
  }
}

async function powershell(script: string): Promise<Record<string, unknown>> {
  const result = await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], 60_000);
  try {
    return JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
  } catch {
    return { error: (result.stderr || result.stdout || "powershell failed").slice(0, 300) };
  }
}

const WIN_PRELUDE = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class MraiInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[MraiInput]::SetProcessDPIAware() | Out-Null
`;

interface Geometry {
  pointsWidth: number;
  pointsHeight: number;
  pictureWidth: number;
  pictureHeight: number;
}

let lastGeometry: Geometry | null = null;

/** A point of the last picture, in the display's own coordinates. */
function toScreen(x: number, y: number): { x: number; y: number } {
  if (!lastGeometry) return { x, y };
  return {
    x: Math.round((x * lastGeometry.pointsWidth) / lastGeometry.pictureWidth),
    y: Math.round((y * lastGeometry.pointsHeight) / lastGeometry.pictureHeight),
  };
}

/** The picture's geometry without taking one: what the next screenshot of
 * the main display will be. */
async function ensureGeometry(): Promise<Geometry | null> {
  if (lastGeometry) return lastGeometry;
  if (process.platform === "darwin") {
    const displays = (await mac(["displays"])).list as Array<Record<string, number | boolean>> | undefined;
    const main = displays?.find((item) => item.main) ?? displays?.[0];
    if (!main) return null;
    const pointsWidth = Number(main.width);
    const pointsHeight = Number(main.height);
    const pixels = pointsWidth * Number(main.scale ?? 1);
    const pictureWidth = Math.min(PICTURE_WIDTH, pixels);
    lastGeometry = { pointsWidth, pointsHeight, pictureWidth, pictureHeight: Math.round((pointsHeight * pictureWidth) / pointsWidth) };
    return lastGeometry;
  }
  return null;
}

const WIN_ELEMENTS = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class MraiFront { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
"@
$w = [System.Windows.Automation.AutomationElement]::FromHandle([MraiFront]::GetForegroundWindow())
$all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$keep = 'Button','Edit','Document','CheckBox','RadioButton','ComboBox','Hyperlink','Text','TabItem','ListItem','MenuItem','Slider','DataItem'
$list = @()
foreach ($e in $all) {
  if ($list.Count -ge LIMIT) { break }
  $c = $e.Current
  $role = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
  if ($keep -notcontains $role -or $c.IsOffscreen) { continue }
  $r = $c.BoundingRectangle
  if ($r.Width -le 1 -or $r.Height -le 1) { continue }
  if (-not $c.Name -and ($role -eq 'Text')) { continue }
  $list += @{ role = $role; label = [string]$c.Name; x = $r.X; y = $r.Y; w = $r.Width; h = $r.Height }
}
@{ app = (Get-Process -Id $w.Current.ProcessId).ProcessName; window = $w.Current.Name; list = $list } | ConvertTo-Json -Compress -Depth 4`;

/** What the front window shows that can be pressed, typed into or read, each
 * with its centre in the pixels of the screen's picture (so a click at it
 * lands on it), from the system's accessibility tree. */
async function elements(limit: number): Promise<ScreenAnswer> {
  let read: Record<string, unknown>;
  if (process.platform === "darwin") {
    const granted = await mac(["permissions"]);
    if (!granted.accessibility) {
      await mac(["ask-accessibility"]);
      return { ok: false, error: "accessibility_not_granted", message: "Accessibility is not allowed for MR Note: the person allows it in System Settings › Privacy & Security › Accessibility." };
    }
    read = await mac(["elements", String(limit)]);
  } else if (process.platform === "win32") {
    read = await powershell(`${WIN_PRELUDE}${WIN_ELEMENTS.replace("LIMIT", String(limit))}`);
  } else {
    return { ok: false, error: "unsupported_system" };
  }
  if (read.error) return { ok: false, error: String(read.error) };
  const geometry = process.platform === "darwin" ? await ensureGeometry() : lastGeometry;
  const toPicture = (x: number, y: number) => geometry
    ? { x: Math.round((x * geometry.pictureWidth) / geometry.pointsWidth), y: Math.round((y * geometry.pictureHeight) / geometry.pointsHeight) }
    : { x: Math.round(x), y: Math.round(y) };
  const rows = ((read.list as Array<Record<string, unknown>> | undefined) ?? []).map((item) => {
    const centre = toPicture(Number(item.x) + Number(item.w) / 2, Number(item.y) + Number(item.h) / 2);
    return `${item.role} "${String(item.label ?? "").replace(/\s+/g, " ")}" at ${centre.x},${centre.y}`;
  });
  return { ok: true, app: read.app, window: read.window, elements: rows };
}

async function permissions(): Promise<Record<string, unknown>> {
  if (process.platform === "darwin") return mac(["permissions"]);
  return { accessibility: true, screen: true };
}

async function shot(): Promise<ScreenAnswer> {
  if (process.platform === "darwin") {
    const granted = await mac(["permissions"]);
    if (!granted.screen) {
      await mac(["ask-screen"]);
      return { ok: false, error: "screen_not_granted", message: "Screen Recording is not allowed for MR Note: the person allows it in System Settings › Privacy & Security › Screen Recording, then restarts the app." };
    }
    const displays = (await mac(["displays"])).list as Array<Record<string, number | boolean>> | undefined;
    const main = displays?.find((item) => item.main) ?? displays?.[0];
    const file = path.join(os.tmpdir(), `mrai-screen-${process.pid}-${Date.now()}.jpg`);
    const taken = await run("/usr/sbin/screencapture", ["-x", "-m", "-t", "jpg", file]);
    if (taken.code !== 0 || !fs.existsSync(file)) return { ok: false, error: "screenshot_failed", message: taken.stderr.slice(0, 300) };
    await run("/usr/bin/sips", ["--resampleWidth", String(PICTURE_WIDTH), "-s", "formatOptions", "70", file]);
    const size = await run("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
    const width = Number(/pixelWidth: (\d+)/.exec(size.stdout)?.[1] ?? PICTURE_WIDTH);
    const height = Number(/pixelHeight: (\d+)/.exec(size.stdout)?.[1] ?? 0);
    const jpeg = fs.readFileSync(file).toString("base64");
    fs.rmSync(file, { force: true });
    lastGeometry = {
      pointsWidth: Number(main?.width ?? width),
      pointsHeight: Number(main?.height ?? height),
      pictureWidth: width,
      pictureHeight: height,
    };
    return { ok: true, jpeg, width, height, display: { width: lastGeometry.pointsWidth, height: lastGeometry.pointsHeight } };
  }
  if (process.platform === "win32") {
    const file = path.join(os.tmpdir(), `mrai-screen-${process.pid}-${Date.now()}.jpg`).replace(/'/g, "''");
    const answer = await powershell(`${WIN_PRELUDE}
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$w = [Math]::Min(${PICTURE_WIDTH}, $b.Width); $h = [int]($b.Height * $w / $b.Width)
$small = New-Object System.Drawing.Bitmap $bmp, $w, $h
$small.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
@{ width = $w; height = $h; dw = $b.Width; dh = $b.Height } | ConvertTo-Json -Compress`);
    if (answer.error || !fs.existsSync(file)) return { ok: false, error: "screenshot_failed", message: String(answer.error ?? "") };
    const jpeg = fs.readFileSync(file).toString("base64");
    fs.rmSync(file, { force: true });
    lastGeometry = {
      pointsWidth: Number(answer.dw), pointsHeight: Number(answer.dh),
      pictureWidth: Number(answer.width), pictureHeight: Number(answer.height),
    };
    return { ok: true, jpeg, width: answer.width, height: answer.height, display: { width: answer.dw, height: answer.dh } };
  }
  return { ok: false, error: "unsupported_system" };
}

const WIN_KEYS: Record<string, string> = {
  return: "{ENTER}", enter: "{ENTER}", tab: "{TAB}", escape: "{ESC}", esc: "{ESC}", backspace: "{BACKSPACE}",
  delete: "{DELETE}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}", home: "{HOME}", end: "{END}",
  pageup: "{PGUP}", pagedown: "{PGDN}", space: " ", f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}", f5: "{F5}",
  f6: "{F6}", f7: "{F7}", f8: "{F8}", f9: "{F9}", f10: "{F10}", f11: "{F11}", f12: "{F12}",
};

function sendKeysCombo(combo: string): string | null {
  let prefix = "";
  let key = "";
  for (const part of combo.toLowerCase().split("+")) {
    if (part === "ctrl" || part === "control" || part === "cmd" || part === "command") prefix += "^";
    else if (part === "shift") prefix += "+";
    else if (part === "alt" || part === "option") prefix += "%";
    else key = WIN_KEYS[part] ?? (part.length === 1 ? part.replace(/[+^%~(){}[\]]/g, "{$&}") : "");
  }
  return key ? prefix + key : null;
}

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

async function input(action: string, request: Record<string, unknown>): Promise<ScreenAnswer> {
  const point = (xKey: string, yKey: string) => toScreen(Number(request[xKey]), Number(request[yKey]));
  if (process.platform === "darwin") {
    const granted = await mac(["permissions"]);
    if (!granted.accessibility) {
      await mac(["ask-accessibility"]);
      return { ok: false, error: "accessibility_not_granted", message: "Accessibility is not allowed for MR Note: the person allows it in System Settings › Privacy & Security › Accessibility." };
    }
    let args: string[];
    if (action === "click") {
      const at = point("x", "y");
      args = ["click", String(at.x), String(at.y), String(request.button ?? "left"), String(request.count ?? 1)];
    } else if (action === "move") {
      const at = point("x", "y");
      args = ["move", String(at.x), String(at.y)];
    } else if (action === "drag") {
      const from = point("x", "y");
      const to = point("to_x", "to_y");
      args = ["drag", String(from.x), String(from.y), String(to.x), String(to.y)];
    } else if (action === "scroll") {
      args = ["scroll", String(Number(request.dx ?? 0)), String(Number(request.dy ?? 5))];
    } else if (action === "type") {
      args = ["type", String(request.text ?? "")];
    } else if (action === "key") {
      args = ["key", String(request.key ?? "")];
    } else if (action === "press") {
      args = ["press", String(request.name ?? ""), ...(request.role ? [String(request.role)] : [])];
    } else {
      return { ok: false, error: `unknown action ${action}` };
    }
    const done = await mac(args);
    if (done.error) {
      return { ok: false, error: String(done.error), ...(Array.isArray(done.near) ? { near: done.near } : {}) };
    }
    return { ok: true, ...(action === "press" ? { pressed: done.label } : {}) };
  }
  if (process.platform === "win32") {
    let script = WIN_PRELUDE;
    if (action === "click" || action === "move") {
      const at = point("x", "y");
      script += `[MraiInput]::SetCursorPos(${at.x}, ${at.y}) | Out-Null; Start-Sleep -Milliseconds 40\n`;
      if (action === "click") {
        const [down, up] = request.button === "right" ? [0x0008, 0x0010] : request.button === "middle" ? [0x0020, 0x0040] : [0x0002, 0x0004];
        for (let i = 0; i < Math.max(1, Number(request.count ?? 1)); i += 1) {
          script += `[MraiInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); [MraiInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60\n`;
        }
      }
    } else if (action === "drag") {
      const from = point("x", "y");
      const to = point("to_x", "to_y");
      script += `[MraiInput]::SetCursorPos(${from.x}, ${from.y}); [MraiInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)\n`;
      for (let step = 1; step <= 20; step += 1) {
        script += `[MraiInput]::SetCursorPos(${Math.round(from.x + ((to.x - from.x) * step) / 20)}, ${Math.round(from.y + ((to.y - from.y) * step) / 20)}); Start-Sleep -Milliseconds 12\n`;
      }
      script += `[MraiInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)\n`;
    } else if (action === "scroll") {
      script += `[MraiInput]::mouse_event(0x0800,0,0,${-120 * Number(request.dy ?? 5)},[UIntPtr]::Zero)\n`;
    } else if (action === "type") {
      // By the clipboard, the person's own put back after (every format it held).
      script += `$saved = $null; try { $saved = [System.Windows.Forms.Clipboard]::GetDataObject() } catch { }
$kept = New-Object System.Windows.Forms.DataObject
if ($saved) { foreach ($f in $saved.GetFormats($false)) { try { $kept.SetData($f, $saved.GetData($f)) } catch { } } }
[System.Windows.Forms.Clipboard]::SetText(${quote(String(request.text ?? ""))}); [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 400
try { if ($saved) { [System.Windows.Forms.Clipboard]::SetDataObject($kept, $true) } else { [System.Windows.Forms.Clipboard]::Clear() } } catch { }\n`;
    } else if (action === "key") {
      const combo = sendKeysCombo(String(request.key ?? ""));
      if (!combo) return { ok: false, error: "unknown_key" };
      script += `[System.Windows.Forms.SendKeys]::SendWait(${quote(combo)})\n`;
    } else {
      return { ok: false, error: `unknown action ${action}` };
    }
    script += `@{ ok = $true } | ConvertTo-Json -Compress`;
    const done = await powershell(script);
    return done.error ? { ok: false, error: String(done.error) } : { ok: true };
  }
  return { ok: false, error: "unsupported_system" };
}

/** An app by the name a person calls it ("网易云音乐" is NeteaseMusic.app): Spotlight's display names. */
async function macAppPath(name: string): Promise<string | null> {
  const q = name.replace(/["\\*]/g, "").replace(/\.app$/i, "").trim();
  if (!q) return null;
  const query = `kMDItemContentType == "com.apple.application-bundle" && (kMDItemDisplayName == "${q}"cd || kMDItemDisplayName == "${q}.app"cd || kMDItemFSName == "${q}.app"cd || kMDItemDisplayName == "${q}*"cd)`;
  const found = await run("/usr/bin/mdfind", [query], 15_000);
  const paths = found.stdout.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".app"));
  const rank = (p: string) => (p.startsWith("/Applications/") ? 0 : p.startsWith(path.join(os.homedir(), "Applications")) ? 1 : p.startsWith("/System/") ? 2 : 3);
  return paths.sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0] ?? null;
}

async function openMacApp(name: string): Promise<ScreenAnswer> {
  let target = name;
  let result = await run("/usr/bin/open", ["-a", name]);
  if (result.code !== 0) {
    const found = await macAppPath(name);
    if (!found) return { ok: false, error: `no app named ${name} on this Mac` };
    target = found;
    result = await run("/usr/bin/open", [found]);
  }
  if (result.code !== 0) return { ok: false, error: result.stderr.slice(0, 300) || "could not open" };
  const where = target.endsWith(".app") ? target : (await run("/usr/bin/osascript", ["-e", `POSIX path of (path to application ${JSON.stringify(name)})`], 10_000)).stdout.trim();
  const bundle = where ? (await run("/usr/bin/mdls", ["-raw", "-name", "kMDItemCFBundleIdentifier", where], 10_000)).stdout.trim() : "";
  return { ok: true, ...(target !== name ? { opened: path.basename(target, ".app") } : {}), ...(bundle && bundle !== "(null)" ? { bundle } : {}) };
}

/** On Windows an app the Start menu lists is opened by its name there, then as a program or file. */
async function openWindowsApp(name: string): Promise<ScreenAnswer> {
  const script = `$n = ${quote(name)}
$app = Get-StartApps | Where-Object { $_.Name -eq $n } | Select-Object -First 1
if (-not $app) { $app = Get-StartApps | Where-Object { $_.Name -like "*$n*" } | Select-Object -First 1 }
if ($app) { Start-Process ("shell:AppsFolder\\" + $app.AppID); @{ ok = $true; opened = $app.Name } | ConvertTo-Json -Compress; exit }
try { Start-Process $n -ErrorAction Stop; @{ ok = $true } | ConvertTo-Json -Compress } catch { @{ ok = $false; error = "no app named $n on this computer" } | ConvertTo-Json -Compress }`;
  const answer = await powershell(script);
  return answer.ok ? { ok: true, ...(answer.opened ? { opened: String(answer.opened) } : {}) } : { ok: false, error: String(answer.error ?? "could not open") };
}

/** The actions on one app, named by request.app (agent-apps.ts). */
const APP_ACTIONS = new Set(["click", "set_value", "select_text", "secondary_action", "type", "key", "scroll", "drag", "menu", "raise"]);

/** Whole-screen steps that take the person's pointer, keyboard or front window. */
const WHOLE_SCREEN_INPUT = new Set(["click", "type", "key", "scroll", "drag", "move", "open_app"]);
const PERSON_PAUSE_S = 1.5;
const PERSON_WAIT_MS = 20_000;

/** Seconds since the person last typed or pointed (macOS), or null where unknown. */
async function personIdleSeconds(): Promise<number | null> {
  if (process.platform !== "darwin") return null;
  const { stdout, code } = await run("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"], 5_000);
  const match = code === 0 ? /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout) : null;
  return match ? Number(match[1]) / 1e9 : null;
}

/** Waits up to 20 s for a pause in the person's own input; an answer when it never comes. */
async function personBusy(): Promise<ScreenAnswer | null> {
  const until = Date.now() + PERSON_WAIT_MS;
  for (;;) {
    const idle = await personIdleSeconds();
    if (idle === null || idle >= PERSON_PAUSE_S) return null;
    if (Date.now() >= until) {
      return {
        ok: false,
        error: "person_busy",
        message:
          "The person is using the computer right now. This step moves their pointer or types into the window in " +
          "front, which would get in their way: it was not made. Work in an app's own window in the background " +
          "(app with elements by id, set_value, menu, keys to that app), or say what is left for when they pause.",
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

export async function screenAct(request: Record<string, unknown>): Promise<ScreenAnswer> {
  const action = String(request.action ?? "");
  try {
    if (action === "permissions") return { ok: true, ...(await permissions()) };
    if (action !== "settings") {
      // Nothing is read or done on a locked computer: paused until it is unlocked.
      const paused = await pausedWhileLocked();
      if (paused) return paused;
    }
    if (process.platform === "darwin" && ["list_apps", "get_app_state"].includes(action) || (request.app && APP_ACTIONS.has(action))) {
      if (process.platform === "darwin") {
        const granted = await mac(["permissions"]);
        if (!granted.accessibility && action !== "list_apps") {
          await mac(["ask-accessibility"]);
          return { ok: false, error: "accessibility_not_granted", message: "Accessibility is not allowed for MR Note: the person allows it in System Settings › Privacy & Security › Accessibility." };
        }
      }
    }
    if (action === "list_apps") return await listApps(Math.max(1, Math.min(800, Number(request.limit ?? 300))));
    if (action === "get_app_state") return await appState(request);
    if (action === "open_app" && request.app) return await openApp(request);
    if (request.app && APP_ACTIONS.has(action)) return await appAct(action, request);
    if (action === "settings") {
      // The person opens the setting themselves; the app only shows where.
      const pane = request.which === "screen" ? "Privacy_ScreenCapture" : "Privacy_Accessibility";
      if (process.platform === "darwin") await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
      return { ok: true };
    }
    if (action === "screenshot") return await shot();
    if (action === "elements") return await elements(Math.max(1, Math.min(600, Number(request.limit ?? 250))));
    if (action === "press" && process.platform !== "darwin") {
      return { ok: false, error: "press_unsupported", message: "Pressing by name is not available on this system yet: click the element's x,y." };
    }
    // A step that moves the person's own pointer or types into whatever is in
    
    // and is not made while they keep working.
    if (WHOLE_SCREEN_INPUT.has(action)) {
      const busy = await personBusy();
      if (busy) return busy;
    }
    let done: ScreenAnswer;
    if (action === "open_app") {
      const name = String(request.name ?? "");
      if (!name) return { ok: false, error: "name an app" };
      const before = process.platform === "darwin" ? String((await mac(["elements", "1"])).app ?? "") : "";
      done = process.platform === "darwin" ? await openMacApp(name) : await openWindowsApp(name);
      if (done.ok && process.platform === "darwin") {
        // Looked at only once it is in front: read at once, the window was
        // still the one before and the AI went looking for it elsewhere
        
        let front: Record<string, unknown> = {};
        const inFront = () => {
          const app = String(front.app ?? "");
          return Boolean(app && app !== before && (Array.isArray(front.list) || Boolean(front.window)));
        };
        for (let waited = 0; waited < 8000; waited += 250) {
          front = (await mac(["elements", "1"])) as Record<string, unknown>;
          if (inFront()) break;
          // An app already running with no window open (NeteaseMusic,
          
          // reopen its window, as a click on its Dock icon does.
          if (waited === 2000 && done.bundle) {
            await run("/usr/bin/osascript", [
              "-e", `tell application id ${JSON.stringify(String(done.bundle))} to reopen`,
              "-e", `tell application id ${JSON.stringify(String(done.bundle))} to activate`,
            ], 10_000);
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!inFront()) done = { ...done, note: "the app opened but its window is not in front: take a screenshot to see where it is" };
        delete done.bundle;
      }
    } else {
      done = await input(action, request);
    }
    // What the step did, seen at once: the screen's picture or its front
    // window's elements, as the AI asked (one turn a step, not two).
    const after = String(request.after ?? "none");
    if (!done.ok || after === "none") return done;
    await new Promise((resolve) => setTimeout(resolve, action === "open_app" ? 1500 : 500));
    const look = after === "elements" ? await elements(250) : await shot();
    return look.ok ? { ...look, ...done, after } : { ...done, after: "none" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "failed" };
  }
}
