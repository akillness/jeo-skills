/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect } from "react";

/**
 * Esc closes a pane that dims the page, wherever the keyboard is. The pane's
 * own onKeyDown hears Escape only while focus is inside it, and focus leaves
 * it whenever the pressed control disables or unmounts (Source Manager's New
 * Source, a menu that hands focus back to its trigger), which left the pane
 * open under Esc.
 */
export function useCloseOnEscape(
  onClose: () => void,
  enabled = true,
  { capture = false }: { capture?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    // `capture` claims Esc before the focused control (the editor) handles
    // it, for a pane that leaves the keyboard in the document.
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      if (capture) event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onDocumentKeyDown, capture);
    return () =>
      document.removeEventListener("keydown", onDocumentKeyDown, capture);
  }, [capture, enabled, onClose]);
}
