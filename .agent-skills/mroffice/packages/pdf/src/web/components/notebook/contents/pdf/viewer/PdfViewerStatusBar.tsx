"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  OfficeStatusBar,
  OfficeStatusProgress,
  OfficeStatusZoomDial,
} from "@mrnote/core/web/components/office-ribbon/OfficeStatusBar.tsx";
import { MIN_SCALE, MAX_SCALE } from "./zoomScale";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfViewerStatusBarProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  loading: boolean;
  scale: number;
  currentVisibleOrdinal: number;
  /** The current page's document label when it is not its number. */
  currentPageLabel?: string | null;
  textExportError: string | null;
  cadExportStatus: "success" | "error" | null;
  cadExportSummary: string | null;
  cadExportFailure: string | null;
  imageOnlyExportStatus: "success" | "error" | null;
  imageOnlyExportSummary: string | null;
  presentationActive: boolean;
  visiblePageCount: number;
  applyContinuousZoomScale: (nextScale: number) => void;
}

export function PdfViewerStatusBar({
  t,
  loading,
  scale,
  currentVisibleOrdinal,
  currentPageLabel = null,
  textExportError,
  cadExportStatus,
  cadExportSummary,
  cadExportFailure,
  imageOnlyExportStatus,
  imageOnlyExportSummary,
  presentationActive,
  visiblePageCount,
  applyContinuousZoomScale,
}: PdfViewerStatusBarProps) {
  return (
    !loading && !presentationActive ? (
      // The Docs status pill (OfficeStatusBar): where the reader is, the
      // last output's result, and the zoom crown, as Word's status bar
      // carries them. The Home ribbon keeps its own page cluster (the WPS
      // Home layout); the zoom percentage lives only here.
      <OfficeStatusBar
        className="pdf-viewer__statusbar"
        testId="pdf-status-bar"
        // The page reading changes on every scroll; only the output chips
        // announce themselves (their own role="status").
        ariaLive="off"
        data={{ "data-pdf-chrome": "bottom" }}
        left={
          <span data-testid="pdf-status-page">
            {currentPageLabel
              ? t("pdfViewer.pageOfLabeled", {
                  label: currentPageLabel,
                  current: currentVisibleOrdinal,
                  total: visiblePageCount,
                })
              : t("toolbar.pageNumberOf", {
                  page: currentVisibleOrdinal,
                  total: visiblePageCount,
                })}
          </span>
        }
        status={
          textExportError || cadExportStatus || imageOnlyExportStatus ? (
            <span
              className="pdf-viewer__status-output"
              data-testid="pdf-home-output-status"
            >
              {textExportError ? (
                <OfficeStatusProgress
                  phase="failed"
                  label={textExportError}
                  title={textExportError}
                  testId="pdf-convert-to-text-error"
                />
              ) : null}
              {cadExportStatus ? (
                <OfficeStatusProgress
                  phase={cadExportStatus === "error" ? "failed" : "ready"}
                  label={
                    cadExportStatus === "success"
                      ? (cadExportSummary ?? t("pdf.viewer.cadExportSavedPlain"))
                      : (cadExportFailure ?? t("pdf.viewer.cadExportFailed"))
                  }
                  testId="pdf-convert-to-cad-status"
                />
              ) : null}
              {imageOnlyExportStatus ? (
                <OfficeStatusProgress
                  phase={imageOnlyExportStatus === "error" ? "failed" : "ready"}
                  label={
                    imageOnlyExportStatus === "success"
                      ? t("pdf.viewer.imageOnlyPdfSaved", { value: imageOnlyExportSummary ?? "" })
                      : t("pdf.viewer.imageOnlyExportFailed")
                  }
                  testId="pdf-convert-to-image-only-status"
                />
              ) : null}
            </span>
          ) : null
        }
        zoom={
          <OfficeStatusZoomDial
            percent={scale * 100}
            minPercent={MIN_SCALE * 100}
            maxPercent={MAX_SCALE * 100}
            defaultPercent={100}
            onZoom={(percent) => applyContinuousZoomScale(percent / 100)}
            label={t("pdfViewer.zoomPresets")}
            resetLabel={t("pdfViewer.actualSize")}
            testIdPrefix="pdf-status"
          />
        }
      />
    ) : null
  );
}
