/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { TocGalleryRow } from "../../../../lib/document-export/tocWordCatalog";

/**
 * What a table of contents asks of the editor's ribbon from its own surfaces:
 * the content-control tab Word draws above a selected table (the gallery
 * drop-down and "Update Table..."), F9 on the table and the context menu's
 * "Update Field". The ribbon owns the dialogs and the gallery's inserts, so
 * every surface runs the very command the References tab runs.
 */
export type TocControlRequest =
  | { readonly action: "update" }
  | { readonly action: "automatic"; readonly row: TocGalleryRow }
  | { readonly action: "manual"; readonly row: TocGalleryRow }
  | { readonly action: "custom" }
  | { readonly action: "remove" };

export const TOC_CONTROL_REQUEST_EVENT = "mrnote:toc-control-request";

/** Sent on the editor's own DOM, so only the ribbon of that editor answers. */
export function requestTocControl(editor: Editor, request: TocControlRequest): void {
  if (editor.isDestroyed) return;
  editor.view.dom.dispatchEvent(
    new CustomEvent<TocControlRequest>(TOC_CONTROL_REQUEST_EVENT, { detail: request }),
  );
}
