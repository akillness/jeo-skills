/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createPdfSessionDestroyer } from "../../../../../lib/pdf/render-lifecycle";

export type PdfPreviewDestroyable = {
  destroy: () => Promise<void> | void;
};

export function createPdfPageWindowPreviewLoadingOwner<
  TDocument extends PdfPreviewDestroyable,
>(
  loadingTask: PdfPreviewDestroyable & { promise: Promise<TDocument> },
  signal: AbortSignal,
  abort: () => Error,
): {
  acquire: () => Promise<TDocument>;
  dispose: () => Promise<void>;
} {
  let documentProxy: TDocument | null = null;
  const destroySession = createPdfSessionDestroyer(() => ({
    loadingTask,
    document: documentProxy,
  }));
  const destroyPendingTask = () => {
    if (documentProxy !== null) return;
    void destroySession().catch(() => undefined);
  };
  signal.addEventListener("abort", destroyPendingTask, { once: true });
  return {
    acquire: async () => {
      if (signal.aborted) {
        destroyPendingTask();
        throw abort();
      }
      documentProxy = await loadingTask.promise;
      if (signal.aborted) throw abort();
      return documentProxy;
    },
    dispose: async () => {
      signal.removeEventListener("abort", destroyPendingTask);
      try {
        await destroySession();
      } finally {
        documentProxy = null;
      }
    },
  };
}
