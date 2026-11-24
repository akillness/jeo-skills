"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Check } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useEffect, useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfPrintPageInventory } from "../../../../lib/pdf/print-preflight";

function formatPageRanges(
  pages: readonly number[],
  t: ReturnType<typeof useTranslations>,
): string {
  const ranges: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const start = pages[index];
    let end = start;
    while (index + 1 < pages.length && pages[index + 1] === end + 1) {
      index += 1;
      end = pages[index];
    }
    const range = start === end ? String(start) : `${start}–${end}`;
    ranges.push(t("pdf.printPreflight.pageRangeItem", { range }));
  }
  return ranges.join(t("pdf.printPreflight.rangeSeparator"));
}

function formatPageSize(widthPt: number, heightPt: number): string {
  const widthIn = widthPt / 72;
  const heightIn = heightPt / 72;
  const widthMm = widthIn * 25.4;
  const heightMm = heightIn * 25.4;
  return `${widthPt.toFixed(2)} × ${heightPt.toFixed(2)} pt (${widthIn.toFixed(2)} × ${heightIn.toFixed(2)} in; ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm)`;
}

export interface PdfPrintPreflightProps {
  readonly open: boolean;
  readonly inventory: PdfPrintPageInventory;
  readonly busy?: boolean;
  readonly onContinue: (scaleToFitSelected: boolean) => void;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Visible, read-only page-size review before any PDF bytes are produced.
 *
 * The checkbox records only the user's intent to choose the operating-system
 * option later. It never rewrites the PDF or claims control over printer paper,
 * printable margins, or the macOS/Windows print sheet.
 */
export default function PdfPrintPreflight({
  open,
  inventory,
  busy = false,
  onContinue,
  onCancel,
  returnFocusRef,
}: PdfPrintPreflightProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [scaleToFitSelected, setScaleToFitSelected] = useState(false);
  const continueInFlightRef = useRef(false);
  const previousBusyRef = useRef(busy);
  const mixedSizes = inventory.sizes.length > 1;
  const hasPages = inventory.pages.length > 0;
  useEffect(() => {
    if (!open || (previousBusyRef.current && !busy)) {
      continueInFlightRef.current = false;
    }
    previousBusyRef.current = busy;
  }, [busy, open]);
  const submit = () => {
    if (busy || !hasPages || continueInFlightRef.current) return;
    continueInFlightRef.current = true;
    onContinue(scaleToFitSelected);
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.printPreflight.title")}
      description={t("pdf.printPreflight.description")}
      defaultActionLabel={t("pdf.printPreflight.apply")}
      cancelActionLabel={t("pdf.printPreflight.cancel")}
      busyActionLabel={t("pdf.printPreflight.preparing")}
      busy={busy}
      defaultActionDisabled={!hasPages}
      onDefaultAction={submit}
      onCancel={onCancel}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      testIdPrefix="pdf-print-preflight"
      className="sm:max-w-[620px]"
    >
      <div className="space-y-3 text-sm">
        <div
          className={parts.group}
          data-testid="pdf-print-preflight-inventory"
        >
          <p className="font-medium">
            {hasPages
              ? t("pdf.printPreflight.inventorySummary", {
                  pages: inventory.pages.length,
                  sizes: inventory.sizes.length,
                })
              : t("pdf.printPreflight.inventoryEmpty")}
          </p>
          {hasPages ? (
            <ul className="mt-2 space-y-2">
              {inventory.sizes.map((size) => (
                <li
                  key={`${size.widthPt}:${size.heightPt}:${size.pages.join(",")}`}
                  className={parts.well}
                  data-testid="pdf-print-preflight-size"
                >
                  <span className="font-medium">
                    {formatPageSize(size.widthPt, size.heightPt)}
                  </span>
                  <span className={`${parts.hint} mt-0.5 block`}>
                    {t("pdf.printPreflight.pageRanges", {
                      count: size.pages.length,
                      ranges: formatPageRanges(size.pages, t),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${parts.error} mt-2`} role="alert">
              {t("pdf.printPreflight.noInventory")}
            </p>
          )}
        </div>

        {mixedSizes ? (
          <div
            className={parts.message} data-tone="warning"
            role="alert"
            data-testid="pdf-print-preflight-mixed-warning"
          >
            {t("pdf.printPreflight.mixedSizes")}
          </div>
        ) : null}

        <div
          className={parts.group}
          data-testid="pdf-print-preflight-system-disclosure"
        >
          {t("pdf.printPreflight.osControlHint")}
        </div>

        <label className={`${parts.check} min-h-11`}>
          <span className="relative size-11 shrink-0">
            <input
              type="checkbox"
              checked={scaleToFitSelected}
              disabled={busy}
              onChange={(event) => setScaleToFitSelected(event.target.checked)}
              className={`${parts.markInput} absolute inset-0 size-11 cursor-pointer`}
              data-testid="pdf-print-preflight-scale-to-fit"
            />
            <span
              aria-hidden
              className={`${parts.mark} pointer-events-none absolute left-3.5 top-3.5 inline-flex size-4 items-center justify-center`}
            >
              {scaleToFitSelected ? (
                <Check size={12} strokeWidth={2.4} />
              ) : null}
            </span>
          </span>
          <span>{t("pdf.printPreflight.scaleToFitReminder")}</span>
        </label>
      </div>
    </OfficeDialogShell>
  );
}
