/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The document editor's extension list: the native document plugin
 * registry's extensions, the floating toolbar's prepared menu and Word's Find
 * paint, in that order, with the one code-block highlighter. Shared by the
 * editor (NoteEditor) and the print surface, so both build the same schema,
 * node views, plugins and decorations.
 */
import type { AnyExtension } from "@tiptap/core";
import { common, createLowlight } from "lowlight";
import type { OfficeDataWholeName } from "@mrnote/core/web/lib/office-data/store.ts";
import {
  DocumentFindHighlightExtension,
  preparedBubbleMenuExtension,
  type PreparedBubbleMenu,
} from "@mrnote/core/web/components/console/editor/preparedBubbleMenu.ts";

/** The code blocks' highlighter. */
export const documentLowlight = createLowlight(common);

/** The served Office tables a document's first reveal waits for. */
export const DOCUMENT_OFFICE_DATA: readonly OfficeDataWholeName[] = ["word-table-styles"];

/** The editor's base extensions (collaboration, when on, is appended by the editor). */
export function documentEditorBaseExtensions(
  pluginExtensions: readonly AnyExtension[],
  preparedBubbleMenu: PreparedBubbleMenu | null,
): AnyExtension[] {
  return [
    ...pluginExtensions,
    ...(preparedBubbleMenu ? [preparedBubbleMenuExtension(preparedBubbleMenu)] : []),
    DocumentFindHighlightExtension,
  ];
}
