"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Copy, Download } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

export type PdfTranslationTarget = "translate_en" | "translate_zh";
export type PdfTranslationScope = "document" | "selection";
export type PdfTranslationPhase =
  | "preflight"
  | "extracting"
  | "streaming"
  | "done"
  | "error";

interface PdfTranslationPreflightProps {
  readonly open: boolean;
  readonly phase: PdfTranslationPhase;
  readonly target: PdfTranslationTarget;
  readonly translatedText: string;
  readonly error: string | null;
  readonly scope?: PdfTranslationScope;
  readonly selectionCharacterCount?: number;
  readonly onTargetChange: (target: PdfTranslationTarget) => void;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onCopyResult?: () => boolean | Promise<boolean>;
  readonly onDownloadResult?: () => boolean | Promise<boolean>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * PDF-owned disclosure for the network-backed Home > Full Translation action.
 * The first click opens only this shell: text extraction and provider egress
 * remain owned by the caller's explicit Start action.
 */
export default function PdfTranslationPreflight({
  open,
  phase,
  target,
  translatedText,
  error,
  scope = "document",
  selectionCharacterCount,
  onTargetChange,
  onStart,
  onCancel,
  onCopyResult,
  onDownloadResult,
  returnFocusRef,
}: PdfTranslationPreflightProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const working = phase === "extracting" || phase === "streaming";
  const finished = phase === "done";
  const selectionScope = scope === "selection";
  const translatedCopyLabel = selectionScope
    ? t("pdf.translationPreflight.resultSelectionLabel")
    : t("pdf.translationPreflight.resultDocumentLabel");
  const resultSeed = finished ? translatedText : null;
  const [lastResultSeed, setLastResultSeed] = useState(resultSeed);
  const [resultActionStatus, setResultActionStatus] = useState<string | null>(
    null,
  );
  if (resultSeed !== lastResultSeed) {
    setLastResultSeed(resultSeed);
    setResultActionStatus(null);
  }

  const runResultAction = async (
    action: (() => boolean | Promise<boolean>) | undefined,
    success: string,
  ) => {
    if (!action) return;
    try {
      setResultActionStatus(
        (await action())
          ? success
          : t("pdf.translationPreflight.actionUnavailable"),
      );
    } catch {
      setResultActionStatus(t("pdf.translationPreflight.actionUnavailable"));
    }
  };

  return (
    <OfficeDialogShell
      open={open}
      title={
        finished
          ? t("pdf.translationPreflight.titleDone")
          : selectionScope
            ? t("pdf.translationPreflight.titleSelection")
            : t("pdf.translationPreflight.titleDocument")
      }
      description={
        finished
          ? t("pdf.translationPreflight.descriptionDone")
          : selectionScope
            ? t("pdf.translationPreflight.descriptionSelection")
            : t("pdf.translationPreflight.descriptionDocument")
      }
      defaultActionLabel={
        finished ? t("common.close") : t("pdf.translationPreflight.start")
      }
      cancelActionLabel={finished ? t("common.close") : t("common.cancel")}
      onDefaultAction={finished ? onCancel : onStart}
      onCancel={onCancel}
      defaultActionDisabled={working}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-translation"
      className="sm:max-w-[620px]"
    >
      {finished ? (
        <>
          {null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {null}
            {null}
          </div>
          {resultActionStatus ? (
            null
          ) : null}
        </>
      ) : (
        <>
          <div className={parts.group}>
            <p className="font-medium">
              {selectionScope
                ? t("pdf.translationPreflight.scopeSelection")
                : t("pdf.translationPreflight.scopeDocument")}
            </p>
            <p className={`${parts.hint} mt-1`}>
              {selectionScope
                ? typeof selectionCharacterCount === "number"
                  ? t("pdf.translationPreflight.selectionDisclosureCount", {
                      count: selectionCharacterCount,
                    })
                  : t("pdf.translationPreflight.selectionDisclosure")
                : t("pdf.translationPreflight.documentDisclosure")}{" "}
              {t("pdf.translationPreflight.noBytesSent")}
            </p>
          </div>
          <fieldset
            className={`${parts.group} grid gap-2`}
            disabled={working}
          >
            <legend className={parts.sectionTitle}>
              {t("pdf.translationPreflight.targetLanguage")}
            </legend>
            {(
              [
                ["translate_en", t("ai.actions.translateEn")],
                ["translate_zh", t("ai.actions.translateZh")],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`${parts.check} min-h-11`}
              >
                <span className="relative size-4 shrink-0">
                  <input
                      type="radio"
                      name="pdf-translation-target"
                      value={value}
                      checked={target === value}
                      onChange={() => onTargetChange(value)}
                      data-testid={`pdf-translation-target-${value}`}
                    className={`${parts.markInput} absolute -left-3 -top-3.5 size-11 cursor-pointer`}
                  />
                  <span
                    aria-hidden
                    className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`}
                    data-shape="radio"
                  />
                </span>
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {working ? (
            null
          ) : null}
          {error ? (
            null
          ) : null}
        </>
      )}
    </OfficeDialogShell>
  );
}
