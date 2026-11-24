/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export function editorViewDom(editor: unknown): HTMLElement | null {
  if (!editor || typeof editor !== "object") return null;
  const runtime = editor as { isDestroyed?: boolean; view?: { dom?: unknown } };
  if (runtime.isDestroyed === true) return null;
  try {
    const dom = runtime.view?.dom;
    return typeof HTMLElement !== "undefined" && dom instanceof HTMLElement ? dom : null;
  } catch {
    return null;
  }
}
