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
 * runs the menu item. So the editors keep their own Save, Undo/Redo,
 * clipboard and zoom, and a plain text field still gets the system's.
 *
 * - New, Save and Save As are the page's (it knows which file is in front):
 *   the menu sends them to the window as commands.
 * - Undo, Redo: pressed on the keyboard and left by the page, the native
 *   undo of the focused field; chosen with the mouse, the shortcut is sent to
 *   the page, so an editor's own history answers as if the keys were pressed.
 */

import { app, BrowserWindow, Menu, shell, type KeyboardEvent, type MenuItemConstructorOptions } from "electron";

import { APP_DISPLAY_NAME, DESKTOP_APP_URL, REPOSITORY_URL, WEBSITE_URL } from "./brand";

export interface MenuActions {
  newWindow(): void;
  open(window: BrowserWindow | null): void;
  /** Send a command to the page of the window in front. */
  command(window: BrowserWindow | null, command: string): void;
}

/** The editors that start a new file, and what the menu calls them. */
const NEW_FILES: readonly [string, string, string][] = [
  ["docs", "Document", "文档"],
  ["sheets", "Spreadsheet", "电子表格"],
  ["slides", "Presentation", "演示文稿"],
  ["code", "Code File", "代码文件"],
];

type Modifier = "meta" | "control" | "shift";

function sendShortcut(window: BrowserWindow, keyCode: string, modifiers: Modifier[]): void {
  const contents = window.webContents;
  contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
}

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
  const name = APP_DISPLAY_NAME;
  const windowOf = (base: unknown) => (base instanceof BrowserWindow ? base : BrowserWindow.getFocusedWindow());
  const command = (value: string): MenuItemConstructorOptions["click"] => (_item, base) => actions.command(windowOf(base), value);

  const template: MenuItemConstructorOptions[] = [];
  if (mac) {
    template.push({
      label: name,
      submenu: [
        { role: "about", label: label(`关于 ${name}`, `About ${name}`) },
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
          label: label("新建", "New"),
          submenu: NEW_FILES.map(([id, en, zhText], index) => ({
            label: label(zhText, en),
            ...(index === 0 ? { accelerator: "CmdOrCtrl+N" } : {}),
            click: command(`new:${id}`),
          })),
        },
        { label: label("新建窗口", "New Window"), accelerator: "CmdOrCtrl+Shift+N", click: () => actions.newWindow() },
        { type: "separator" },
        { label: label("打开…", "Open…"), accelerator: "CmdOrCtrl+O", click: (_item, base) => actions.open(windowOf(base)) },
        // macOS keeps the list (app.addRecentDocument); Windows shows it in
        // the taskbar's jump list
        ...(mac
          ? [
              {
                label: label("最近打开", "Open Recent"),
                role: "recentDocuments",
                submenu: [{ label: label("清除菜单", "Clear Menu"), role: "clearRecentDocuments" }],
              } as MenuItemConstructorOptions,
            ]
          : []),
        { type: "separator" },
        { label: label("保存", "Save"), accelerator: "CmdOrCtrl+S", click: command("save") },
        { label: label("另存为…", "Save As…"), accelerator: "CmdOrCtrl+Shift+S", click: command("save-as") },
        { type: "separator" },
        mac ? { role: "close", label: label("关闭窗口", "Close Window") } : { role: "quit", label: label("退出", "Exit") },
      ],
    },
    {
      label: label("编辑", "Edit"),
      submenu: [
        historyItem(label("撤销", "Undo"), "CmdOrCtrl+Z", { keyCode: "Z", modifiers: [mod] }, (window) => window.webContents.undo()),
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
        { role: "toggleDevTools", label: label("开发者工具", "Developer Tools") },
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
        { label: label("源代码（GitHub）", "Source Code (GitHub)"), click: () => void shell.openExternal(REPOSITORY_URL) },
        { label: label("获取 MR Office 组件（免费）…", "Get the MR Office Component (Free)…"), click: () => void shell.openExternal(DESKTOP_APP_URL) },
        { label: "mroffice.ai", click: () => void shell.openExternal(WEBSITE_URL) },
      ],
    },
  );
  return Menu.buildFromTemplate(template);
}
