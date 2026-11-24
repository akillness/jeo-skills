"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";
import {
  Maximize2,
  Minimize2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import styles from "./SpreadsheetRangePicker.module.css";

/**
 * Excel's RefEdit pair, shared by every spreadsheet dialog that takes a range
 * reference (Conditional Formatting's Applies to, Data Validation's Source):
 * a Collapse Dialog button beside the reference box, and the collapsed bar the
 * dialog becomes while the user selects the range on the sheet. The host owns
 * the text and follows the sheet selection into it; Enter, Escape or Expand
 * Dialog hands control back to the full dialog.
 */
export function SpreadsheetCollapseDialogButton({
  className,
  disabled,
  label,
  onClick,
  testId,
}: {
  /** The host dialog's own button look, when it has one. */
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={className ?? styles.iconButton}
      disabled={disabled}
      // Excel's collapse glyph belongs to its RefEdit box: Tab moves from one
      // argument box to the next, never stopping on the glyph in between.
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      <Minimize2 aria-hidden="true" size={13} />
    </button>
  );
}

export function SpreadsheetRangePickerBar({
  dialogLabel,
  expandLabel,
  inputLabel,
  onChange,
  onDone,
  testIdPrefix,
  value,
}: {
  dialogLabel: string;
  expandLabel: string;
  inputLabel: string;
  onChange: (value: string) => void;
  onDone: () => void;
  /** `${prefix}-picker`, `${prefix}-picker-input` and `${prefix}-expand`. */
  testIdPrefix: string;
  value: string;
}) {
  // Collapsed, Excel's RefEdit box holds the keyboard: focus lands in it (not
  // back on the ribbon button that opened the dialog), and Esc anywhere the
  // sheet does not take it expands the dialog again (live audit S-195).
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    // The window hands focus back to the grid as the full dialog unmounts,
    // after this effect: take it once more on the next frame unless the user
    // already moved it into another dialog or a text field.
    const frame = window.requestAnimationFrame(() => {
      const current = document.activeElement;
      const typing = current instanceof HTMLElement &&
        (current.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(current.tagName) || Boolean(current.closest('[role="dialog"]')));
      if (!typing || current === document.body) inputRef.current?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      doneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div
      role="dialog"
      aria-label={dialogLabel}
      data-ref-edit-collapsed=""
      className={styles.picker}
      data-testid={`${testIdPrefix}-picker`}
    >
      {/* Excel's collapsed dialog keeps its title: the dialog and the box. */}
      <span className={styles.title} data-testid={`${testIdPrefix}-picker-title`}>
        {dialogLabel === inputLabel ? dialogLabel : `${dialogLabel} - ${inputLabel}`}
      </span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={value}
        aria-label={inputLabel}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
        data-testid={`${testIdPrefix}-picker-input`}
      />
      <button
        type="button"
        className={styles.iconButton}
        aria-label={expandLabel}
        title={expandLabel}
        onClick={onDone}
        data-testid={`${testIdPrefix}-expand`}
      >
        <Maximize2 aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
