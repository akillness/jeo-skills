"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState, type ReactElement, type RefObject } from "react";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeDialogParts as dialogParts } from "./officeDialogChrome";

/**
 * Office's Zoom dialog (PowerPoint: View > Zoom, "显示比例"): Fit and fixed
 * magnifications as radio buttons, and a Percent box that holds the value
 * those choose or any other within the host's range. OK applies it, Cancel
 * leaves the view as it was. The host decides what Fit means and which
 * presets it lists (PowerPoint: Fit, 400, 200, 100, 66, 50, 33).
 */
export type OfficeZoomDialogChoice =
  | { kind: "fit"; id?: string }
  | { kind: "percent"; percent: number };

export function OfficeZoomDialog({
  open,
  title,
  presets,
  initialPercent,
  min,
  max,
  labels,
  onApply,
  onCancel,
  returnFocusRef,
  testIdPrefix,
  fitOptions,
}: {
  open: boolean;
  title: string;
  presets: readonly number[];
  /** The view's current magnification, shown in Percent when the dialog opens. */
  initialPercent: number;
  min: number;
  max: number;
  labels: { fit: string; percent: string; ok: string; cancel: string };
  onApply: (choice: OfficeZoomDialogChoice) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  testIdPrefix: string;
  /** Several fits in place of the one `labels.fit` (Word's Page width, Text
   *  width, Whole page, Many pages), each answered as `{ kind: "fit", id }`. */
  fitOptions?: readonly { readonly id: string; readonly label: string }[];
}): ReactElement {
  const fits = fitOptions ?? [{ id: "fit", label: labels.fit }];
  const [choice, setChoice] = useState<string | number | null>(null);
  const [percentText, setPercentText] = useState("");

  useEffect(() => {
    if (!open) return;
    const rounded = Math.round(initialPercent);
    setChoice(presets.includes(rounded) && rounded === initialPercent ? rounded : null);
    setPercentText(String(rounded));
  }, [initialPercent, open, presets]);

  const typed = Number(percentText.trim().replace(/%$/u, ""));
  const percentValid = Number.isFinite(typed) && typed >= min && typed <= max;
  // The range this view can draw, said beside Percent; a preset outside it
  
  // then shut OK without a word).
  const rangeText = `${min}%–${max}%`;
  const rangeId = `${testIdPrefix}-range`;
  const apply = () => {
    if (typeof choice === "string") {
      onApply(fitOptions ? { kind: "fit", id: choice } : { kind: "fit" });
      return;
    }
    if (!percentValid) return;
    onApply({ kind: "percent", percent: Math.round(typed) });
  };

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={null}
      defaultActionLabel={labels.ok}
      cancelActionLabel={labels.cancel}
      onDefaultAction={apply}
      onCancel={onCancel}
      defaultActionDisabled={typeof choice !== "string" && !percentValid}
      returnFocusRef={returnFocusRef}
      testIdPrefix={testIdPrefix}
      className="sm:max-w-[280px]"
    >
      <fieldset
        role="radiogroup"
        aria-label={title}
        style={{ border: "none", display: "grid", gap: 6, margin: 0, padding: 0 }}
      >
        {/* Word lists its fits after the percentages; Excel and PowerPoint
            put their one Fit first. */}
        {(fitOptions
          ? [...presets, ...fits.map((fit) => fit.id)]
          : ["fit", ...presets]
        ).map((option) => {
          const outOfRange = typeof option === "number" && (option < min || option > max);
          return (
            <label
              key={option}
              className={dialogParts.check}
              title={outOfRange ? rangeText : undefined}
              style={outOfRange ? { opacity: 0.5 } : undefined}
            >
              <input
                type="radio"
                name={`${testIdPrefix}-choice`}
                checked={choice === option}
                disabled={outOfRange}
                aria-describedby={outOfRange ? rangeId : undefined}
                onChange={() => {
                  setChoice(option);
                  if (typeof option === "number") setPercentText(String(option));
                }}
                data-testid={`${testIdPrefix}-${option}`}
              />
              {typeof option === "string"
                ? fits.find((fit) => fit.id === option)?.label
                : `${option}%`}
            </label>
          );
        })}
      </fieldset>
      <label className={dialogParts.field} style={{ alignItems: "center", display: "flex", gap: 8 }}>
        {labels.percent}
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={percentText}
          onChange={(event) => {
            setPercentText(event.target.value);
            // A typed value is its own choice: no preset radio stays on.
            setChoice(null);
          }}
          aria-invalid={!percentValid}
          aria-describedby={rangeId}
          style={{ width: 72 }}
          data-testid={`${testIdPrefix}-percent`}
        />
        %
        <span id={rangeId} data-testid={rangeId} style={{ opacity: 0.7, fontSize: 12 }}>
          ({rangeText})
        </span>
      </label>
    </OfficeDialogShell>
  );
}
