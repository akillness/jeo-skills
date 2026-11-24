"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState } from "react";

/**
 * A dialog number box that keeps what the user is typing (so "1" on the way
 * to "10", "0." or an emptied box survives the keystroke) and reports each
 * parseable value; on blur it shows the model's value again. The typed text
 * is an override that exists only between the first keystroke and blur, so
 * no effect has to mirror the model. The model may clamp what it receives:
 * the clamped value appears only once the user leaves the box.
 *
 * Shared by the Spreadsheet page-setup dialog and the PDF decoration dialog
 * (header/footer and page-number margins, watermark offsets).
 */
export function OfficeDraftNumberInput({
  value,
  onCommit,
  format,
  parse,
  testId,
  id,
  className,
  min,
  max,
  step,
  disabled,
  placeholder,
  ariaLabel,
  initialFocus,
  flagOutOfRange = false,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  testId?: string;
  id?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  initialFocus?: boolean;
  /** Mark a typed value outside min..max with aria-invalid until blur. */
  flagOutOfRange?: boolean;
}) {
  const shown = value === null ? "" : format(value);
  const [typed, setTyped] = useState<string | null>(null);
  const typedValue = typed === null ? null : parse(typed);
  // Out of range only once a parseable value is typed; the box keeps it
  // until blur, when the model's (clamped) value is shown again.
  const outOfRange =
    flagOutOfRange &&
    typedValue !== null &&
    ((min !== undefined && typedValue < min) ||
      (max !== undefined && typedValue > max));
  return (
    <input
      type="number"
      id={id}
      className={className}
      value={typed ?? shown}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={outOfRange || undefined}
      data-initial-focus={initialFocus ? "" : undefined}
      data-testid={testId}
      onBlur={() => setTyped(null)}
      onChange={(event) => {
        const next = event.target.value;
        setTyped(next);
        if (next.trim() === "") {
          onCommit(null);
          return;
        }
        const parsed = parse(next);
        if (parsed !== null) onCommit(parsed);
      }}
    />
  );
}
