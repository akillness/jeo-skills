/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * TipTap's placeholder, without its viewport tracker.
 *
 * The plugin view measures which positions are on screen (two `posAtCoords`
 * hit tests and their layout) whenever the document's size changes, so that
 * a placeholder on every empty block can be limited to the visible ones.
 * With `showOnlyCurrent` and without `includeChildren` (the options the
 * document editor uses) only the caret's block is ever decorated and the
 * measurement is never read: every stroke of ink paid it for nothing.
 * TipTap 3.27.3 dropped that view upstream (the plugin carries decorations
 * only); this stays so a plugin view can never come back on those options.
 */

import Placeholder from "@tiptap/extension-placeholder";
import { Plugin } from "@tiptap/pm/state";

export const CaretPlaceholder = Placeholder.extend({
  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? [];
    if (!this.options.showOnlyCurrent || this.options.includeChildren) return plugins;
    return plugins.map((plugin) => new Plugin({ ...plugin.spec, view: undefined }));
  },
});
