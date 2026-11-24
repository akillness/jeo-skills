/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The app's menus.
 *
 * Keys reach the page first, as in Chrome: a shortcut the page handles (and
 * calls preventDefault on) never reaches the menu, and one it leaves alone
 * runs the menu item. So the editors keep their own Undo/Redo, clipboard and
 * zoom, and a plain text field still gets the system's.
 *
 * - Cut, Copy, Paste, Select All: the standard roles (on macOS nothing else
 *   copies; Chrome's own Edit menu does the same).
 * - Undo, Redo: pressed on the keyboard and left by the page, the native
 *   undo of the focused field (what Chrome's menu does); chosen with the
 *   mouse, the shortcut is sent to the page, so an editor's own history
 *   answers exactly as if the keys had been pressed.
 * - Actual Size, Zoom In, Zoom Out: the page's zoom, only when the page does
 *   not use the keys itself (the editors zoom their canvas).
 */

import { app, BrowserWindow, Menu, shell, type KeyboardEvent, type MenuItemConstructorOptions } from "electron";

import { APP_DISPLAY_NAME } from "./brand";
import { ut } from "./update-text";
import { isAppUrl } from "./navigation";

export interface MenuActions {
  readonly origin: string;
  newWindow(route: string): void;
  checkForUpdates(): void;
  /** The name in the app menu (MR Note Classic names itself). */
  readonly appName?: string;
  /** Help ▸ Open in Browser: the online app only (the classic app's pages
   * are its own, on this computer). */
  readonly openInBrowser?: boolean;
  /** Extra Help items (the classic app's license and source). */
  readonly helpItems?: MenuItemConstructorOptions[];
  /** Items under Settings (the app menu on macOS, File elsewhere): the
   * classic app's "ready in the background at login". */
  readonly appItems?: MenuItemConstructorOptions[];
}

type Modifier = "meta" | "control" | "shift";

function sendShortcut(window: BrowserWindow, keyCode: string, modifiers: Modifier[]): void {
  const contents = window.webContents;
  contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
}

/** Undo / Redo: native for a key the page left, the page's own for a click. */
function historyItem(
  label: string,
  accelerator: string,
  shortcut: { keyCode: string; modifiers: Modifier[] },
  native: (window: BrowserWindow) => void,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: (_item, base, event: KeyboardEvent | undefined) => {
      const window = base instanceof BrowserWindow ? base : BrowserWindow.getFocusedWindow();
      if (!window) return;
      if (event?.triggeredByAccelerator) native(window);
      else sendShortcut(window, shortcut.keyCode, shortcut.modifiers);
    },
  };
}

export function buildMenu(actions: MenuActions): Menu {
  const zh = app.getLocale().toLowerCase().startsWith("zh");
  const label = (zhText: string, enText: string) => (zh ? zhText : enText);
  const mac = process.platform === "darwin";
  const mod: Modifier = mac ? "meta" : "control";
  const name = actions.appName ?? APP_DISPLAY_NAME;
  const checkForUpdates: MenuItemConstructorOptions = {
    // The update dialogs name it in their own language (update-text.ts).
    label: ut("menuCheck"),
    click: () => actions.checkForUpdates(),
  };
  const settings: MenuItemConstructorOptions = {
    label: label("设置…", "Settings…"),
    accelerator: "CmdOrCtrl+,",
    click: (_item, base) => {
      const window = base instanceof BrowserWindow ? base : null;
      if (window) void window.loadURL(`${actions.origin}/app/settings`);
      else actions.newWindow("/app/settings");
    },
  };

  const template: MenuItemConstructorOptions[] = [];
  if (mac) {
    template.push({
      label: name,
      submenu: [
        { role: "about", label: label(`关于 ${name}`, `About ${name}`) },
        checkForUpdates,
        { type: "separator" },
        settings,
        ...(actions.appItems ?? []),
        { type: "separator" },
        { role: "services", label: label("服务", "Services") },
        { type: "separator" },
        { role: "hide", label: label(`隐藏 ${name}`, `Hide ${name}`) },
        { role: "hideOthers", label: label("隐藏其他", "Hide Others") },
        { role: "unhide", label: label("全部显示", "Show All") },
        { type: "separator" },
        { role: "quit", label: label(`退出 ${name}`, `Quit ${name}`) },
      ],
    });
  }
  template.push(
    {
      label: label("文件", "File"),
      submenu: [
        {
          label: label("新建窗口", "New Window"),
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => actions.newWindow("/app"),
        },
        { type: "separator" },
        ...(mac ? [] : [settings, ...(actions.appItems ?? []), { type: "separator" } as MenuItemConstructorOptions]),
        mac
          ? { role: "close", label: label("关闭窗口", "Close Window") }
          : { role: "quit", label: label("退出", "Exit") },
      ],
    },
    {
      label: label("编辑", "Edit"),
      submenu: [
        historyItem(label("撤销", "Undo"), "CmdOrCtrl+Z", { keyCode: "Z", modifiers: [mod] }, (window) =>
          window.webContents.undo(),
        ),
        historyItem(
          label("重做", "Redo"),
          mac ? "Shift+CmdOrCtrl+Z" : "Ctrl+Y",
          { keyCode: mac ? "Z" : "Y", modifiers: mac ? [mod, "shift"] : [mod] },
          (window) => window.webContents.redo(),
        ),
        { type: "separator" },
        { role: "cut", label: label("剪切", "Cut") },
        { role: "copy", label: label("拷贝", "Copy") },
        { role: "paste", label: label("粘贴", "Paste") },
        { role: "selectAll", label: label("全选", "Select All") },
      ],
    },
    {
      label: label("显示", "View"),
      submenu: [
        { role: "reload", label: label("重新载入", "Reload") },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } as MenuItemConstructorOptions]),
        { type: "separator" },
        { role: "resetZoom", label: label("实际大小", "Actual Size") },
        { role: "zoomIn", label: label("放大", "Zoom In"), accelerator: "CmdOrCtrl+=" },
        { role: "zoomOut", label: label("缩小", "Zoom Out") },
        { type: "separator" },
        { role: "togglefullscreen", label: label("进入全屏幕", "Toggle Full Screen") },
      ],
    },
    { role: "windowMenu", label: label("窗口", "Window") },
    {
      role: "help",
      label: label("帮助", "Help"),
      submenu: [
        ...(actions.openInBrowser === false
          ? []
          : [
              {
                label: label("在浏览器中打开", "Open in Browser"),
                click: (_item, base) => {
                  const url = base instanceof BrowserWindow ? base.webContents.getURL() : actions.origin;
                  void shell.openExternal(isAppUrl(url, actions.origin) ? url : actions.origin);
                },
              } as MenuItemConstructorOptions,
            ]),
        ...(actions.helpItems ?? []),
        ...(mac ? [] : [{ type: "separator" } as MenuItemConstructorOptions, checkForUpdates]),
      ],
    },
  );
  return Menu.buildFromTemplate(template);
}
