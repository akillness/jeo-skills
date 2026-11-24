"use client";





















































/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type ReactElement, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { SLIDES_PER_PAGE_OPTIONS, type SlidesPerPage } from "@mrnote/core/web/lib/presentation-print-settings.ts";

export type PresentationPdfPublishWhat = "slides" | "handouts" | "notes" | "outline";

export interface PresentationPdfOptions {
  readonly publishWhat: PresentationPdfPublishWhat;
  /** Handouts' slides per page (the export's `handout-N`). */
  readonly handoutSlidesPerPage: SlidesPerPage;
  /** Options ▸ Include hidden slides (off, as PowerPoint's). */
  readonly includeHiddenSlides: boolean;
}

export const DEFAULT_PRESENTATION_PDF_OPTIONS: PresentationPdfOptions = Object.freeze({
  publishWhat: "slides",
  handoutSlidesPerPage: 6,
  includeHiddenSlides: false,
});

/** The export's `layout` for a Publish what (undefined: the slides PDF). */
export function presentationPdfExportLayout(options: PresentationPdfOptions): string | undefined {
  if (options.publishWhat === "handouts") return `handout-${options.handoutSlidesPerPage}`;
  if (options.publishWhat === "notes" || options.publishWhat === "outline") return options.publishWhat;
  return undefined;
}

const PUBLISH_WHAT: ReadonlyArray<{ value: PresentationPdfPublishWhat; labelKey: string }> = [
  { value: "slides", labelKey: "presentation.pdfOptions.whatSlides" },
  { value: "handouts", labelKey: "presentation.pdfOptions.whatHandouts" },
  { value: "notes", labelKey: "presentation.pdfOptions.whatNotes" },
  { value: "outline", labelKey: "presentation.pdfOptions.whatOutline" },
];

/** Options the export does not honour yet: shown as PowerPoint shows them, greyed. */
const UNSUPPORTED_CHECKS: ReadonlyArray<{ group: "publish" | "nonPrinting" | "pdf"; key: string; checked: boolean }> = [
  { group: "publish", key: "frameSlides", checked: false },
  { group: "publish", key: "includeComments", checked: false },
  { group: "nonPrinting", key: "documentProperties", checked: false },
  { group: "nonPrinting", key: "structureTags", checked: false },
  { group: "pdf", key: "pdfA", checked: false },
  { group: "pdf", key: "bitmapText", checked: false },
  { group: "pdf", key: "encrypt", checked: false },
];

export function PresentationPdfOptionsDialog({
  initial,
  busy = false,
  onExport,
  onCancel,
  returnFocusRef,
  t,
}: {
  initial: PresentationPdfOptions;
  busy?: boolean;
  onExport: (options: PresentationPdfOptions) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  t: (key: string, values?: Record<string, string | number>) => string;
}): ReactElement {
  const [publishWhat, setPublishWhat] = useState<PresentationPdfPublishWhat>(initial.publishWhat);
  const [handoutSlidesPerPage, setHandoutSlidesPerPage] = useState<SlidesPerPage>(initial.handoutSlidesPerPage);
  const [includeHiddenSlides, setIncludeHiddenSlides] = useState<boolean>(initial.includeHiddenSlides);
  const firstChoiceRef = useRef<HTMLInputElement | null>(null);
  const handouts = publishWhat === "handouts";

  const unsupported = (group: (typeof UNSUPPORTED_CHECKS)[number]["group"]) =>
    UNSUPPORTED_CHECKS.filter((item) => item.group === group).map((item) => (
      <label key={item.key} className={parts.check} title={t("presentation.pdfOptions.notAvailable")}>
        <input
          type="checkbox"
          checked={item.checked}
          disabled
          readOnly
          data-testid={`presentation-pdf-options-${item.key}`}
        />
        <span>{t(`presentation.pdfOptions.${item.key}`)}</span>
      </label>
    ));

  return (
    <OfficeDialogShell
      open
      title={t("presentation.pdfOptions.title")}
      description={t("presentation.pdfOptions.description")}
      defaultActionLabel={t("presentation.pdfOptions.export")}
      cancelActionLabel={t("toolbar.cancel")}
      busy={busy}
      onDefaultAction={() => onExport({ publishWhat, handoutSlidesPerPage, includeHiddenSlides })}
      onCancel={onCancel}
      initialFocusRef={firstChoiceRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-pdf-options"
      defaultActionTestId="presentation-pdf-options-export"
    >
      <fieldset className={parts.group} disabled={busy}>
        <legend className={parts.sectionTitle}>{t("presentation.pdfOptions.range")}</legend>
        <label className={parts.check}>
          <input type="radio" name="presentation-pdf-range" checked readOnly data-testid="presentation-pdf-options-range-all" />
          <span>{t("presentation.pdfOptions.rangeAll")}</span>
        </label>
        {(["rangeCurrent", "rangeSlides"] as const).map((key) => (
          <label key={key} className={parts.check} title={t("presentation.pdfOptions.notAvailable")}>
            <input type="radio" name="presentation-pdf-range" checked={false} disabled readOnly
              data-testid={`presentation-pdf-options-${key}`} />
            <span>{t(`presentation.pdfOptions.${key}`)}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={parts.group} disabled={busy}>
        <legend className={parts.sectionTitle}>{t("presentation.pdfOptions.publishOptions")}</legend>
        <div role="radiogroup" aria-label={t("presentation.pdfOptions.publishWhat")} className="grid gap-1">
          <span className={parts.label}>{t("presentation.pdfOptions.publishWhat")}</span>
          {PUBLISH_WHAT.map((choice, index) => (
            <label key={choice.value} className={parts.check}>
              <input
                ref={index === 0 ? firstChoiceRef : undefined}
                type="radio"
                name="presentation-pdf-publish-what"
                value={choice.value}
                checked={publishWhat === choice.value}
                onChange={() => setPublishWhat(choice.value)}
                data-testid={`presentation-pdf-options-what-${choice.value}`}
              />
              <span>{t(choice.labelKey)}</span>
            </label>
          ))}
        </div>
        <label className={parts.field}>
          <span className={parts.label}>{t("presentation.printSlidesPerPage")}</span>
          <select
            value={handoutSlidesPerPage}
            disabled={!handouts}
            aria-label={t("presentation.printSlidesPerPage")}
            data-testid="presentation-pdf-options-slides-per-page"
            onChange={(event) => setHandoutSlidesPerPage(Number(event.target.value) as SlidesPerPage)}
          >
            {SLIDES_PER_PAGE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {t("presentation.printSlidesPerPageOption", { count })}
              </option>
            ))}
          </select>
        </label>
        <label className={parts.field} title={t("presentation.pdfOptions.notAvailable")}>
          <span className={parts.label}>{t("presentation.pdfOptions.order")}</span>
          <select value="horizontal" disabled data-testid="presentation-pdf-options-order"
            aria-label={t("presentation.pdfOptions.order")} onChange={() => undefined}>
            <option value="horizontal">{t("presentation.pdfOptions.orderHorizontal")}</option>
          </select>
        </label>
        <label className={parts.check}>
          <input
            type="checkbox"
            checked={includeHiddenSlides}
            onChange={(event) => setIncludeHiddenSlides(event.target.checked)}
            data-testid="presentation-pdf-options-include-hidden"
          />
          <span>{t("presentation.pdfOptions.includeHiddenSlides")}</span>
        </label>
        {unsupported("publish")}
      </fieldset>

      <fieldset className={parts.group} disabled={busy}>
        <legend className={parts.sectionTitle}>{t("presentation.pdfOptions.nonPrinting")}</legend>
        {unsupported("nonPrinting")}
      </fieldset>

      <fieldset className={parts.group} disabled={busy}>
        <legend className={parts.sectionTitle}>{t("presentation.pdfOptions.pdfOptions")}</legend>
        {unsupported("pdf")}
      </fieldset>
      <p className={`${parts.hint} m-0`}>{t("presentation.pdfOptions.notAvailable")}</p>
    </OfficeDialogShell>
  );
}
