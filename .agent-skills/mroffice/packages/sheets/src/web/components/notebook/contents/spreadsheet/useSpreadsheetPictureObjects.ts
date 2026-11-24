/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, type MutableRefObject } from "react";

import { registerPagePictureObjects } from "@mrnote/core/web/lib/page-picture-objects.ts";
import { isStorablePictureDataUrl, uploadPagePicture } from "@mrnote/core/web/lib/page-picture-upload.ts";
import type { SheetModel, SpreadsheetObject } from "./spreadsheetSheetModel";

const CONCURRENT_UPLOADS = 2;
const RETRY_AFTER_MS = 60_000;

function pictureSrc(object: SpreadsheetObject): unknown {
  return object.type === "image" ? (object as { src?: unknown }).src : undefined;
}

/** The floating pictures of the workbook still held as `data:` URIs worth storing. */
export function sheetDataPictures(sheets: readonly SheetModel[]): Set<string> {
  const found = new Set<string>();
  for (const sheet of sheets) {
    for (const object of sheet.objects ?? []) {
      const src = pictureSrc(object);
      if (isStorablePictureDataUrl(src)) found.add(src);
    }
  }
  return found;
}

/** The workbook with every picture whose `data:` URI has a token named by it;
 * null when none changed. */
export function sheetsWithPictureTokens(
  sheets: readonly SheetModel[],
  tokens: ReadonlyMap<string, string>,
): SheetModel[] | null {
  let changed = false;
  const next = sheets.map((sheet) => {
    let sheetChanged = false;
    const objects = (sheet.objects ?? []).map((object) => {
      const src = pictureSrc(object);
      const token = typeof src === "string" ? tokens.get(src) : undefined;
      if (!token) return object;
      sheetChanged = true;
      return { ...object, src: token } as SpreadsheetObject;
    });
    if (!sheetChanged) return sheet;
    changed = true;
    return { ...sheet, objects };
  });
  return changed ? next : null;
}

export function useSpreadsheetPictureObjects(options: {
  readonly pageId: string | null | undefined;
  readonly notebookId?: string | null;
  /** The workbook as rendered: a change schedules a pass. */
  readonly sheets: readonly SheetModel[];
  /** The workbook as it is now, read when a pass runs. */
  readonly liveSheetsRef: MutableRefObject<SheetModel[]>;
  /** Whether this window may write the page now (a viewer's never does). */
  readonly canWrite: () => boolean;
  /** Writes the workbook and saves it, with no Undo step. */
  readonly writeSwapped: (next: SheetModel[]) => void;
  readonly upload?: (pageId: string, dataUrl: string) => Promise<string | null>;
  readonly delayMs?: number;
}): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const state = useRef<{
    tokens: Map<string, string>;
    inFlight: Set<string>;
    retryAt: Map<string, number>;
    timer: ReturnType<typeof setTimeout> | null;
    destroyed: boolean;
    schedule: (delay?: number) => void;
  } | null>(null);

  useEffect(() => {
    const own = {
      tokens: new Map<string, string>(),
      inFlight: new Set<string>(),
      retryAt: new Map<string, number>(),
      timer: null as ReturnType<typeof setTimeout> | null,
      destroyed: false,
      schedule: (() => {}) as (delay?: number) => void,
    };
    const run = () => {
      own.timer = null;
      const current = optionsRef.current;
      const pageId = current.pageId;
      if (own.destroyed || !pageId || !current.canWrite()) return;
      const wanted = sheetDataPictures(current.liveSheetsRef.current);
      if (wanted.size === 0) return;
      // Pictures already stored: named by their token now (again, when an
      // Undo or another window brought the `data:` URI back).
      if ([...wanted].some((src) => own.tokens.has(src))) {
        const next = sheetsWithPictureTokens(current.liveSheetsRef.current, own.tokens);
        if (next) current.writeSwapped(next);
      }
      const upload = current.upload ?? uploadPagePicture;
      for (const src of wanted) {
        if (own.inFlight.size >= CONCURRENT_UPLOADS) break;
        if (own.tokens.has(src) || own.inFlight.has(src) || (own.retryAt.get(src) ?? 0) > Date.now()) continue;
        own.inFlight.add(src);
        void upload(pageId, src)
          .then((token) => {
            if (!token) {
              own.retryAt.set(src, Date.now() + RETRY_AFTER_MS);
              setTimeout(() => own.schedule(0), RETRY_AFTER_MS + 50);
              return;
            }
            // Drawn from this page's pictures from now on.
            registerPagePictureObjects(pageId, { sheets: [{ objects: [{ type: "image", src: token }] }] },
              optionsRef.current.notebookId);
            own.tokens.set(src, token);
          })
          .catch(() => {
            own.retryAt.set(src, Date.now() + RETRY_AFTER_MS);
            setTimeout(() => own.schedule(0), RETRY_AFTER_MS + 50);
          })
          .finally(() => {
            own.inFlight.delete(src);
            own.schedule(0);
          });
      }
    };
    own.schedule = (delay = optionsRef.current.delayMs ?? 800) => {
      if (own.timer === null && !own.destroyed) own.timer = setTimeout(run, delay);
    };
    state.current = own;
    own.schedule(optionsRef.current.delayMs ?? 1_500);
    return () => {
      own.destroyed = true;
      if (own.timer !== null) clearTimeout(own.timer);
      state.current = null;
    };
  }, [options.pageId]);

  useEffect(() => {
    state.current?.schedule();
  }, [options.sheets]);
}
