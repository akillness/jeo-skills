"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState } from "react";

import {
  PDF_LIVE_EDIT_EVENT,
  type PdfLiveEditDetail,
} from "@mrnote/core/web/components/notebook/page-review-in-place.ts";

export interface PdfLiveEditReplace {
  readonly find: string;
  readonly replace: string;
}







export function usePdfLiveEditFind(
  pageId: string | undefined,
  find: {
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
    readonly setTerm: (term: string) => void;
  },
): PdfLiveEditReplace | null {
  const [shown, setShown] = useState<{ run: string; replace: PdfLiveEditReplace } | null>(null);
  const live = useRef({ find, openedHere: false, run: "" });
  useEffect(() => {
    live.current.find = find;
  });
  useEffect(() => {
    if (!pageId) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PdfLiveEditDetail>).detail;
      if (!detail?.agent_run_ref) return;
      const state = live.current;
      if (detail.ended || detail.page_id !== pageId || !detail.find) {
        if (state.run !== detail.agent_run_ref) return;
        if (state.openedHere) {
          state.find.setTerm("");
          state.find.setOpen(false);
        }
        state.run = "";
        state.openedHere = false;
        setShown(null);
        return;
      }
      if (state.run !== detail.agent_run_ref) state.openedHere = !state.find.open;
      state.run = detail.agent_run_ref;
      state.find.setTerm(detail.find);
      state.find.setOpen(true);
      setShown({ run: detail.agent_run_ref, replace: { find: detail.find, replace: detail.replace ?? "" } });
    };
    globalThis.addEventListener(PDF_LIVE_EDIT_EVENT, handler);
    return () => globalThis.removeEventListener(PDF_LIVE_EDIT_EVENT, handler);
  }, [pageId]);
  return shown?.replace ?? null;
}
