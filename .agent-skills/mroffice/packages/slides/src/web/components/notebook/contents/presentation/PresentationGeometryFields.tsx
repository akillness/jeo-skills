"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState } from "react";






















/** Where a position is measured from (PowerPoint's "From" list). */
export type PresentationPositionOrigin = "topLeft" | "center";

export type PresentationGeometryKey =
  | "left"
  | "top"
  | "width"
  | "height"
  | "rotation";

export interface PresentationGeometryFieldSpec {
  readonly key: PresentationGeometryKey;
  /** The visible label ("X", "宽", "旋转"). */
  readonly label: string;
  /** The unit drawn after the box ("厘米", `"`, "°"). */
  readonly unit: string;
  /** Accessible name and hover text; names the unit ("宽 (厘米)"). */
  readonly description: string;
  /** The object's value in the field's unit; "" when it has none. */
  readonly value: string;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly disabled: boolean;
  /** Applies a typed value; false when the window refused it. */
  readonly onCommit: (raw: string) => boolean;
  /** A position's "From" list: the origin it is measured from. */
  readonly origin?: {
    readonly value: PresentationPositionOrigin;
    readonly label: string;
    readonly options: ReadonlyArray<{
      readonly value: PresentationPositionOrigin;
      readonly label: string;
    }>;
    readonly onChange: (origin: PresentationPositionOrigin) => void;
  };
}

function stepDecimals(step: number): number {
  const text = String(step);
  const point = text.indexOf(".");
  return point < 0 ? 0 : text.length - point - 1;
}

/** `8.00 厘米`, but `3.15"` and `45°`: a mark sits on the number. */
function valueText(value: string, unit: string): string {
  return /\p{L}/u.test(unit) ? `${value} ${unit}` : `${value}${unit}`;
}

function PresentationGeometryField({
  field,
}: {
  field: PresentationGeometryFieldSpec;
}) {
  const { key, label, unit, description, value, step, min, max, disabled } =
    field;
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // The object changed under the field (a drag, Undo, the ribbon): show it.
    setShown(value);
    setDraft(value);
  }
  const commit = (raw: string) => {
    if (disabled) return;
    const next = raw.trim();
    if (next !== value.trim()) field.onCommit(next);
    // An applied value re-renders the field with the object's new value; a
    // refused one leaves the object as it was, and the field shows it again.
    setDraft(value);
  };
  const stepBy = (direction: 1 | -1) => {
    const current = Number(value);
    if (disabled || value.trim() === "" || !Number.isFinite(current)) return;
    const next = Math.min(max, Math.max(min, current + direction * step));
    commit(next.toFixed(stepDecimals(step)));
  };
  const numeric = Number(value);
  return (
    <label title={description}>
      {label}
      <span className="presentation-window__geometry-value">
        <input
          type="text"
          role="spinbutton"
          inputMode={key === "width" || key === "height" ? "decimal" : undefined}
          autoComplete="off"
          spellCheck={false}
          aria-label={description}
          aria-valuenow={
            value.trim() !== "" && Number.isFinite(numeric) ? numeric : undefined
          }
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={value.trim() !== "" ? valueText(value, unit) : undefined}
          title={description}
          value={draft}
          disabled={disabled}
          data-unit={unit}
          data-testid={`presentation-geometry-${key}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Escape" && draft !== value) {
              event.preventDefault();
              event.stopPropagation();
              setDraft(value);
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              stepBy(event.key === "ArrowUp" ? 1 : -1);
            }
          }}
        />
        <span
          className="presentation-window__geometry-unit"
          aria-hidden="true"
          data-testid={`presentation-geometry-${key}-unit`}
        >
          {unit}
        </span>
      </span>
      {field.origin ? (
        <select
          className="presentation-window__geometry-origin"
          aria-label={`${label} ${field.origin.label}`}
          title={field.origin.label}
          value={field.origin.value}
          disabled={disabled}
          data-testid={`presentation-geometry-${key}-origin`}
          onChange={(event) =>
            field.origin?.onChange(event.target.value as PresentationPositionOrigin)
          }
        >
          {field.origin.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </label>
  );
}

export function PresentationGeometryFields({
  fields,
}: {
  fields: readonly PresentationGeometryFieldSpec[];
}) {
  return (
    <div className="presentation-window__geometry-panel">
      {fields.map((field) => (
        <PresentationGeometryField key={field.key} field={field} />
      ))}
    </div>
  );
}
