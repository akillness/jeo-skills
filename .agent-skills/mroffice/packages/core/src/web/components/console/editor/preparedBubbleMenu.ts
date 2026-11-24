/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { BubbleMenuView, type BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { createDocumentFindHighlightPlugin } from "./native-document/documentFindHighlight";

type MenuShouldShow = Exclude<BubbleMenuPluginProps["shouldShow"], null | undefined>;
type MenuOptions = NonNullable<BubbleMenuPluginProps["options"]>;

/**
 * The floating toolbar's menu, part of the editor it serves from the start.
 *
 * The React BubbleMenu registers its plugin from an effect once the toolbar
 * mounts. Registering reconfigures the editor: every plugin view is rebuilt
 * and the whole document's decorations are read again (on a long document
 * the opening's single largest cost, 7 s of 20 in the development build, and
 * the room bridge's first content apply ran inside it). This holder is
 * created with the editor instead, its plugin is in the initial plugin list,
 * and the toolbar only says what to show and where while it is mounted.
 */
export interface PreparedBubbleMenu {
  readonly element: HTMLDivElement;
  readonly pluginKey: PluginKey;
  /** The mounted toolbar's predicate; nothing shows while none is mounted. */
  readonly shouldShow: MenuShouldShow | null;
  /** The mounted toolbar's placement and show/hide callbacks. */
  readonly options: MenuOptions | null;
  /** A toolbar mounted (or changed what it says), or none is (null). */
  attach(toolbar: { shouldShow: MenuShouldShow; options: MenuOptions } | null): void;
}

export function createPreparedBubbleMenu(): PreparedBubbleMenu | null {
  if (typeof document === "undefined") return null;
  const element = document.createElement("div");
  element.style.visibility = "hidden";
  element.style.position = "absolute";
  let toolbar: { shouldShow: MenuShouldShow; options: MenuOptions } | null = null;
  return {
    element,
    pluginKey: new PluginKey("docs-floating-toolbar"),
    get shouldShow() { return toolbar?.shouldShow ?? null; },
    get options() { return toolbar?.options ?? null; },
    attach(next) { toolbar = next; },
  };
}

/** The menu's plugin, reading the holder each time a view of it is built
 * (any later reconfiguration rebuilds plugin views). */
export function preparedBubbleMenuExtension(menu: PreparedBubbleMenu) {
  return Extension.create({
    name: "preparedBubbleMenu",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: menu.pluginKey,
          view: (view) =>
            new BubbleMenuView({
              view,
              editor,
              element: menu.element,
              pluginKey: menu.pluginKey,
              shouldShow: (props) => menu.shouldShow?.(props) ?? false,
              options: {
                ...menu.options,
                onShow: () => menu.options?.onShow?.(),
                onHide: () => menu.options?.onHide?.(),
              },
            }),
        }),
      ];
    },
  });
}

/** Word's Find paint (documentFindHighlight), present from the start on the
 * main editor for the same reason: the pane only sets its query. */
export const DocumentFindHighlightExtension = Extension.create({
  name: "documentFindHighlight",
  addProseMirrorPlugins() {
    return [createDocumentFindHighlightPlugin()];
  },
});
