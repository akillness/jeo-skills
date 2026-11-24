/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The right-click menu where the page shows none of its own (text fields,
 * selected text, links): Electron has no default one. The editors' canvases
 * draw their own menus and so never reach this.
 */

import { app, clipboard, Menu, shell, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from "electron";

export function showContextMenu(contents: WebContents, params: ContextMenuParams): void {
  const zh = app.getLocale().toLowerCase().startsWith("zh");
  const label = (zhText: string, enText: string) => (zh ? zhText : enText);
  const items: MenuItemConstructorOptions[] = [];

  if (params.isEditable && params.misspelledWord) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
    }
    items.push({
      label: label("添加到词典", "Add to Dictionary"),
      click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    items.push({ type: "separator" });
  }

  if (params.linkURL && /^(https?|mailto):/.test(params.linkURL)) {
    items.push(
      // It truly opens the system's default browser (shell.openExternal), the
      // one place outside the app this menu sends a person.
      { label: label("在默认浏览器中打开链接", "Open Link in Default Browser"), click: () => void shell.openExternal(params.linkURL) },
      { label: label("拷贝链接", "Copy Link"), click: () => clipboard.writeText(params.linkURL) },
      { type: "separator" },
    );
  }

  const flags = params.editFlags;
  if (params.isEditable) {
    items.push(
      { role: "cut", label: label("剪切", "Cut"), enabled: flags.canCut },
      { role: "copy", label: label("拷贝", "Copy"), enabled: flags.canCopy },
      { role: "paste", label: label("粘贴", "Paste"), enabled: flags.canPaste },
      { type: "separator" },
      { role: "selectAll", label: label("全选", "Select All"), enabled: flags.canSelectAll },
    );
  } else if (params.selectionText.trim()) {
    items.push({ role: "copy", label: label("拷贝", "Copy"), enabled: flags.canCopy });
  }

  while (items.length && items[items.length - 1].type === "separator") items.pop();
  if (items.length) Menu.buildFromTemplate(items).popup();
}
