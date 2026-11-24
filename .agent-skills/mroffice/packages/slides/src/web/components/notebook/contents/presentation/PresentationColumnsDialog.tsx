"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  formatPresentationMeasurement,
  parsePresentationMeasurement,
  PRESENTATION_INCH_MARK,
  type PresentationMeasurementUnit,
} from "@mrnote/core/web/lib/presentation-measurement.ts";
import {
  MAX_TEXT_COLUMNS,
  MAX_TEXT_COLUMN_SPACING_EMU,
  MIN_TEXT_COLUMNS,
} from "@mrnote/core/web/lib/presentation-text-columns.ts";

/**
 * PowerPoint's Columns dialog (Home > Columns > More Columns...; Mac 16.86
 * strings): Number of columns, 1 to 16, and Spacing between columns, 0" to
 * 56", in the locale's unit; Cancel / OK (PPT-A042).
 */
export function PresentationColumnsDialog({
  open,
  count,
  spacingEmu,
  unit,
  returnFocusRef,
  onApply,
  onCancel,
}: {
  readonly open: boolean;
  readonly count: number;
  readonly spacingEmu: number;
  readonly unit: PresentationMeasurementUnit;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** `spacingEmu` is undefined when the Spacing field was not touched. */
  readonly onApply: (count: number, spacingEmu: number | undefined) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [countDraft, setCountDraft] = useState(String(count));
  const [spacingDraft, setSpacingDraft] = useState(
    `${formatPresentationMeasurement(spacingEmu, unit)}${unit === "in" ? PRESENTATION_INCH_MARK : ` ${t("presentation.columnsDialog.cm")}`}`,
  );
  const [spacingTouched, setSpacingTouched] = useState(false);
  const countRef = useRef<HTMLInputElement | null>(null);
  const parsedCount = /^\d{1,2}$/.test(countDraft.trim()) ? Number(countDraft.trim()) : NaN;
  const parsedSpacing = parsePresentationMeasurement(spacingDraft, unit);
  const valid =
    Number.isInteger(parsedCount) &&
    parsedCount >= MIN_TEXT_COLUMNS &&
    parsedCount <= MAX_TEXT_COLUMNS &&
    parsedSpacing !== null &&
    parsedSpacing <= MAX_TEXT_COLUMN_SPACING_EMU;
  return (
    <OfficeDialogShell
      open={open}
      description=""
      title={t("presentation.columnsDialog.title")}
      defaultActionLabel={t("presentation.columnsDialog.ok")}
      cancelActionLabel={t("toolbar.cancel")}
      defaultActionDisabled={!valid}
      onDefaultAction={() => {
        if (valid && parsedSpacing !== null) {
          onApply(parsedCount, spacingTouched ? Math.round(parsedSpacing) : undefined);
        }
      }}
      onCancel={onCancel}
      initialFocusRef={countRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-columns"
      className="sm:max-w-[360px]"
    >
      <div className="grid gap-3">
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.columnsDialog.count")}</span>
          <input
            ref={countRef}
            type="number"
            min={MIN_TEXT_COLUMNS}
            max={MAX_TEXT_COLUMNS}
            step={1}
            value={countDraft}
            title={t("presentation.columnsDialog.countRange")}
            onChange={(event) => setCountDraft(event.target.value)}
            data-testid="presentation-columns-count"
          />
        </label>
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.columnsDialog.spacing")}</span>
          <input
            type="text"
            inputMode="decimal"
            value={spacingDraft}
            onChange={(event) => {
              setSpacingTouched(true);
              setSpacingDraft(event.target.value);
            }}
            data-testid="presentation-columns-spacing"
          />
        </label>
      </div>
    </OfficeDialogShell>
  );
}
