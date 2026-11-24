"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import insertRibbonStyles from "../PdfInsertRibbonTab.module.css";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Scissors, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { PDF_POPOVER_CHROME } from "./popoverChrome";
import {
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfSourceRiskSnapshot } from "../../../../../lib/pdf/save-policy";
import type { OutlineNode } from "@mrnote/core/web/lib/pdf/outline.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfRibbonToolButton } from "../PdfRibbonButton";

export interface PdfSplitControlProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  savePolicyV1: boolean;
  matchedSourceRiskSnapshot: PdfSourceRiskSnapshot | null;
  loading: boolean;
  outline: OutlineNode[];
  splitBusy: boolean;
  setSplitOpen: Dispatch<SetStateAction<boolean>>;
  splitOpen: boolean;
  splitDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
  splitMode: "ranges" | "combine" | "everyN" | "bookmarks";
  setSplitMode: Dispatch<SetStateAction<"ranges" | "combine" | "everyN" | "bookmarks">>;
  splitRangeSpec: string;
   
  splitRangeError?: string | null;
  setSplitRangeSpec: Dispatch<SetStateAction<string>>;
  splitEveryNValue: string;
  setSplitEveryNValue: Dispatch<SetStateAction<string>>;
  handleSplitDownload: (override?: { mode: "ranges" | "combine" | "everyN" | "bookmarks"; rangeSpec: string; everyNValue?: string | undefined; } | undefined) => Promise<boolean>;
  activeSplitCommand: { readonly featureId: "PDF-PAG-STRUCT-03"; readonly action: "pdf.page.extract"; } | { readonly featureId: "PDF-TOO-FILE-01"; readonly action: "pdf.file.split"; };
}

export function PdfSplitControl({
  t,
  loading,
  outline,
  splitBusy,
  setSplitOpen,
  splitOpen,
  splitDialogReturnFocusRef,
  splitMode,
  setSplitMode,
  splitRangeSpec,
  splitRangeError = null,
  setSplitRangeSpec,
  splitEveryNValue,
  setSplitEveryNValue,
  handleSplitDownload,
  activeSplitCommand,
}: PdfSplitControlProps) {
  return (
    !loading ? (
      <div className="pdf-viewer__split">
        <PdfRibbonToolButton
          icon={splitBusy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Scissors size={14} />
          )}
          data-testid="pdf-split-toggle"
          onClick={(event) => {
            splitDialogReturnFocusRef.current = event.currentTarget;
            setSplitOpen((open) => !open);
          }}
          disabled={splitBusy}
          aria-expanded={splitOpen}
          aria-haspopup="dialog"
          title={t("pdfViewer.splitFile")}
          aria-label={t("pdfViewer.splitFile")}
          data-capability-id={activeSplitCommand.featureId}
          data-output-disposition="flatten-with-consent"
        >
          {t("pdfViewer.splitFile")}
        </PdfRibbonToolButton>
        {splitOpen ? (
          <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
            <DialogContent
              skin="none"
              className={`${PDF_POPOVER_CHROME} ${insertRibbonStyles.decorationDialog}`}
              showCloseButton={false}
              data-testid="pdf-split-popover"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                splitDialogReturnFocusRef.current?.focus();
              }}
              >
              <div className={officeDialogParts.header}>
                <DialogTitle className={officeDialogParts.title}>{t("pdfViewer.splitFile")}</DialogTitle>
                <DialogClose
                  className={officeDialogParts.close}
                  aria-label={t("common.close")}
                >
                  <X size={14} aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogDescription className="sr-only">
                {t("pdfViewer.splitMode")}
              </DialogDescription>
              <div className={insertRibbonStyles.decorationForm}>
            <div
              className="pdf-viewer__split-modes"
              role="radiogroup"
              aria-label={t("pdfViewer.splitMode")}
            >
              <label className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                <input
                  type="radio"
                  name="pdf-split-mode"
                  checked={splitMode === "ranges"}
                  onChange={() => setSplitMode("ranges")}
                  data-testid="pdf-split-mode-ranges"
                />
                <span>{t("pdfViewer.splitByRanges")}</span>
              </label>
              <label className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                <input
                  type="radio"
                  name="pdf-split-mode"
                  checked={splitMode === "combine"}
                  onChange={() => setSplitMode("combine")}
                  data-testid="pdf-split-mode-combine"
                />
                <span>{t("pdfViewer.splitCombine")}</span>
              </label>
              <label className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                <input
                  type="radio"
                  name="pdf-split-mode"
                  checked={splitMode === "everyN"}
                  onChange={() => setSplitMode("everyN")}
                  data-testid="pdf-split-mode-every-n"
                />
                <span>{t("pdfViewer.splitEveryN")}</span>
              </label>
              {outline.length > 0 ? (
                <label className={`${officeDialogParts.check} pdf-viewer__split-mode`}>
                  <input
                    type="radio"
                    name="pdf-split-mode"
                    checked={splitMode === "bookmarks"}
                    onChange={() => setSplitMode("bookmarks")}
                    data-testid="pdf-split-mode-bookmarks"
                  />
                  <span>{t("pdfViewer.splitByBookmarks")}</span>
                </label>
              ) : null}
            </div>
            {splitMode === "ranges" || splitMode === "combine" ? (
              <input
                type="text"
                className="pdf-viewer__split-input"
                data-testid="pdf-split-range-input"
                value={splitRangeSpec}
                onChange={(event) =>
                  setSplitRangeSpec(event.target.value)
                }
                placeholder={t("pdfViewer.splitRangePlaceholder")}
                aria-label={
                  splitMode === "combine"
                    ? t("pdfViewer.splitCombineLabel")
                    : t("pdfViewer.splitRangeLabel")
                }
                aria-invalid={splitRangeError ? true : undefined}
                aria-describedby={
                  splitRangeError ? "pdf-split-range-error" : undefined
                }
              />
            ) : splitMode === "everyN" ? (
              <input
                type="number"
                min={1}
                step={1}
                className="pdf-viewer__split-input"
                data-testid="pdf-split-every-n-input"
                value={splitEveryNValue}
                onChange={(event) =>
                  setSplitEveryNValue(event.target.value)
                }
                aria-label={t("pdfViewer.splitEveryNLabel")}
              />
            ) : null}
            {(splitMode === "ranges" || splitMode === "combine") &&
            splitRangeError ? (
              <p
                id="pdf-split-range-error"
                className={officeDialogParts.message}
                role="alert"
                data-testid="pdf-split-range-error"
              >
                {splitRangeError}
              </p>
            ) : null}
            <button
              type="button"
              className={`${officeDialogParts.primaryButton} pdf-viewer__split-go`}
              data-testid="pdf-split-go"
              onClick={() => void handleSplitDownload()}
              // Not grey while the file shown is inspected again after a
              // save: the press waits for it, busy (handleSplitDownload).
              disabled={
                splitBusy ||
                ((splitMode === "ranges" || splitMode === "combine") &&
                  splitRangeError !== null)
              }
              title={
                splitBusy ? t("pdfViewer.splitInflight") : undefined
              }
              data-capability-id={activeSplitCommand.featureId}
              data-output-disposition="flatten-with-consent"
            >
              {splitBusy
                ? t("pdfViewer.splitInflight")
                : t("pdfViewer.splitDownload")}
            </button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    ) : null
  );
}
