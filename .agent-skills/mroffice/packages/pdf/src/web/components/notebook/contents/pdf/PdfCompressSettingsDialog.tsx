"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  PDF_COMPRESS_LOSSLESS_PRESET,
  type PdfCompressLosslessPreset,
  type PdfCompressServerPreset,
} from "../../../../lib/pdf/compress";

export type PdfCompressPreset =
  | PdfCompressLosslessPreset
  | PdfCompressServerPreset;

interface PdfCompressSettingsDialogProps {
  readonly open: boolean;
  readonly value: PdfCompressPreset;
  readonly lossyAvailable: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onApply: (preset: PdfCompressPreset) => void;
  readonly onCancel: () => void;
}

const PRESETS: readonly PdfCompressPreset[] = [
  PDF_COMPRESS_LOSSLESS_PRESET,
  "screen",
  "ebook",
  "print",
];

function PdfCompressSettingsDialogSession({
  value,
  lossyAvailable,
  returnFocusRef,
  onApply,
  onCancel,
}: Omit<PdfCompressSettingsDialogProps, "open">): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<PdfCompressPreset>(() =>
    value !== PDF_COMPRESS_LOSSLESS_PRESET && !lossyAvailable
      ? PDF_COMPRESS_LOSSLESS_PRESET
      : value,
  );
  const label = (preset: PdfCompressPreset): string => {
    if (preset === PDF_COMPRESS_LOSSLESS_PRESET) {
      return t("pdf.compress.presetLossless");
    }
    if (preset === "screen") return t("pdf.compress.presetScreen");
    if (preset === "ebook") return t("pdf.compress.presetEbook");
    return t("pdf.compress.presetPrint");
  };
  const description = (preset: PdfCompressPreset): string => {
    if (preset === PDF_COMPRESS_LOSSLESS_PRESET) {
      return t("pdf.compress.presetLosslessHint");
    }
    if (preset === "screen") {
      return t("pdf.compress.presetScreenHint");
    }
    if (preset === "ebook") {
      return t("pdf.compress.presetEbookHint");
    }
    return t("pdf.compress.presetPrintHint");
  };

  return (
    <OfficeDialogShell
      open
      title={t("pdf.compress.title")}
      description={t("pdf.compress.description")}
      defaultActionLabel={t("pdf.compress.apply")}
      cancelActionLabel={t("pdf.compress.cancel")}
      initialFocus="cancel"
      returnFocusRef={returnFocusRef}
      onDefaultAction={() => onApply(draft)}
      onCancel={onCancel}
      testIdPrefix="pdf-compress-settings"
    >
      <fieldset className="grid gap-2">
        <legend className="sr-only">{t("pdf.compress.quality")}</legend>
        {PRESETS.map((preset) => {
          const disabled =
            preset !== PDF_COMPRESS_LOSSLESS_PRESET && !lossyAvailable;
          return (
            <label
              key={preset}
              className={`${parts.choice} items-start ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } min-h-11`}
            >
              <span className="relative mt-0.5 size-4 shrink-0">
                <input
                  type="radio"
                  name="pdf-compress-preset"
                  value={preset}
                  checked={draft === preset}
                  disabled={disabled}
                  className={`${parts.markInput} absolute -left-3 -top-3 size-11 cursor-pointer`}
                  data-testid={`pdf-compress-settings-${preset}`}
                  onChange={() => setDraft(preset)}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute inset-0 inline-flex size-4 items-center justify-center`} data-shape="radio"
                />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{label(preset)}</span>
                <span className={parts.hint}>
                  {description(preset)}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {!lossyAvailable ? (
        <p className={`${parts.hint} m-0`} role="status">
          {t("pdf.compress.losslessOnly")}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}

export default function PdfCompressSettingsDialog(
  props: PdfCompressSettingsDialogProps,
): React.JSX.Element | null {
  if (!props.open) return null;
  return (
    <PdfCompressSettingsDialogSession
      key={`${props.value}:${props.lossyAvailable ? "lossy" : "lossless"}`}
      value={props.value}
      lossyAvailable={props.lossyAvailable}
      returnFocusRef={props.returnFocusRef}
      onApply={props.onApply}
      onCancel={props.onCancel}
    />
  );
}
