/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Whether a document's page count is still an estimate: its first layout is
 * going on, parts of it are still to load, or its background layout has not
 * reached the end. A long book's count passed through 338 on its way to 316:
 * the status bar shows "about" until the count first holds, and from then on
 * the count as it stands (an edit in a long document runs a background layout
 * too, and the word must not come and go with the keys).
 *
 * The word stays away for the first second: a short document settles before
 * anyone could read it.
 */
import { useEffect, useState } from "react";
import { PAGE_LEDGER_BACKGROUND_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { INITIAL_PAGINATION_SETTLING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";

const SHOW_AFTER_MS = 1_000;
const SENTINEL_POLL_MS = 2_000;
const PARTS_SENTINEL = '[data-testid="note-editor-parts-sentinel"]';

/** Whether the document is held as parts and some are still to come in. */
export function documentPartsStillToCome(root: HTMLElement): boolean {
  const surface = root.closest('[data-testid="note-editor-page-surface"]') ?? root.parentElement;
  return Boolean(surface?.querySelector(PARTS_SENTINEL));
}

export function pageCountStillMoving(root: HTMLElement): boolean {
  if (root.hasAttribute(INITIAL_PAGINATION_SETTLING_ATTR) || root.hasAttribute(PAGE_LEDGER_BACKGROUND_ATTR)) return true;
  const surface = root.closest('[data-testid="note-editor-page-surface"]') ?? root.parentElement;
  return Boolean(surface?.querySelector(PARTS_SENTINEL));
}

/** `root`: the editor's root element, once it has one. */
export function usePageCountIsEstimate(root: HTMLElement | null): boolean {
  const [estimate, setEstimate] = useState(false);
  useEffect(() => {
    if (!root) return;
    const win = root.ownerDocument.defaultView;
    if (!win) return;
    if (!pageCountStillMoving(root)) return;
    const observer = new win.MutationObserver(() => check());
    // The sentinel leaves in a render of its own, with no attribute to say so.
    const poll = win.setInterval(() => check(), SENTINEL_POLL_MS);
    let timer: number | null = win.setTimeout(() => {
      timer = null;
      if (pageCountStillMoving(root)) setEstimate(true);
    }, SHOW_AFTER_MS);
    const stop = () => {
      observer.disconnect();
      win.clearInterval(poll);
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
    };
    const check = () => {
      if (pageCountStillMoving(root)) return;
      stop();
      setEstimate(false);
    };
    observer.observe(root, { attributes: true, attributeFilter: [INITIAL_PAGINATION_SETTLING_ATTR, PAGE_LEDGER_BACKGROUND_ATTR] });
    return stop;
  }, [root]);
  return estimate;
}
