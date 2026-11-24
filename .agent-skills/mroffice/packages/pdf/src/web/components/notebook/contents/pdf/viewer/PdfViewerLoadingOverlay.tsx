"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import type { PageRecord } from "./pageRecord";
import type {
  PdfNativeTextSourceHandoff,
} from "../../../../../lib/pdf/native-text-source-handoff";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfViewerLoadingOverlayProps {
  entryPainting: { pageNumber: number; canvas: HTMLCanvasElement; } | null | undefined;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  pages: PageRecord[];
  loading: boolean;
  stagedRevisionReloading: boolean;
  sameDocumentReloading: boolean;
  sameDocumentRevisionReloading: boolean;
  activeTextSourceHandoff: PdfNativeTextSourceHandoff | null;
}

export function PdfViewerLoadingOverlay({
  entryPainting,
  t,
  pages,
  loading,
  stagedRevisionReloading,
  sameDocumentReloading,
  sameDocumentRevisionReloading,
  activeTextSourceHandoff,
}: PdfViewerLoadingOverlayProps) {
  return (
    loading &&
    !activeTextSourceHandoff &&
    !sameDocumentReloading &&
    !sameDocumentRevisionReloading &&
    !(stagedRevisionReloading && pages.length > 0) ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          display: "flex",
          overflow: "hidden",
          background: "var(--console-surface-canvas, #f8fafc)",
        }}
      >
        {entryPainting ? (
          <div
            data-testid="pdf-viewer-entry-painting"
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, overflow: "hidden" }}
            ref={(node) => {
              if (!node) return;
              const canvas = entryPainting.canvas;
              if (canvas.parentElement !== node) {
                Object.assign(canvas.style, {
                  display: "block",
                  width: "100%",
                  height: "auto",
                });
                node.replaceChildren(canvas);
              }
            }}
          />
        ) : (
          <EditorLoadingState
            kind="pdf"
            label={t("pdfViewer.loading")}
            testId="pdf-viewer-loading"
          />
        )}
      </div>
    ) : null
  );
}
