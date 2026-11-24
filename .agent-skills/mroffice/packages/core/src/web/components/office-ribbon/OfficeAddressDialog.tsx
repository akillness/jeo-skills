"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useRef, useState, type ReactNode } from "react";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeDialogParts as parts } from "./officeDialogChrome";

/**
 * The one-field "insert from an address" dialog Office opens for Insert >
 * Online Video (Microsoft Support, "Insert an online video in Word": the
 * dialog asks for the address of the online video, then Insert or Cancel)
 * and, in an editor without an image search service, for a picture taken
 * from the web by its address.
 *
 * Behaviour reproduced:
 *   - one address field, focused when the dialog opens;
 *   - Insert is the default action (Enter), Cancel / Escape / the title-bar
 *     X leave the document untouched;
 *   - Insert stays unavailable until something is typed;
 *   - an address the host refuses (a site that cannot be embedded, a
 *     scheme it does not load, the connection that went away) keeps the
 *     dialog open with the reason under the field, marked invalid, so the
 *     user can correct it instead of starting over.
 *
 * The host owns what an address means: `onSubmit` returns true when it
 * inserted, false for the dialog's own `invalidMessage`, or a message of its
 * own. Nothing here writes to a document.
 */
export interface OfficeAddressDialogProps {
  readonly open: boolean;
  readonly title: string;
  /** Read with the dialog (visually hidden: the label asks the question). */
  readonly description: string;
  readonly label: string;
  /** Guidance under the field (the sites a video may come from). */
  readonly hint?: ReactNode;
  readonly placeholder?: string;
  readonly insertLabel: string;
  readonly cancelLabel: string;
  readonly invalidMessage: string;
  /** False while the host cannot write (read-only, offline). */
  readonly canSubmit?: boolean;
  readonly maxLength?: number;
  readonly inputMode?: "url" | "text";
  readonly onSubmit: (value: string) => boolean | string;
  readonly onCancel: () => void;
  readonly returnFocusTarget?: () => HTMLElement | null;
  /** `<prefix>-dialog` is the card's test id. */
  readonly testIdPrefix: string;
  readonly inputTestId?: string;
  readonly defaultActionTestId?: string;
  readonly cancelActionTestId?: string;
}

export function OfficeAddressDialog({
  open,
  title,
  description,
  label,
  hint,
  placeholder,
  insertLabel,
  cancelLabel,
  invalidMessage,
  canSubmit = true,
  maxLength = 4_096,
  inputMode = "url",
  onSubmit,
  onCancel,
  returnFocusTarget,
  testIdPrefix,
  inputTestId,
  defaultActionTestId,
  cancelActionTestId,
}: OfficeAddressDialogProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const errorId = useId();

  const submit = () => {
    const result = onSubmit(value);
    if (result === true) return;
    setError(typeof result === "string" ? result : invalidMessage);
    inputRef.current?.focus();
  };

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={<span className="sr-only">{description}</span>}
      defaultActionLabel={insertLabel}
      cancelActionLabel={cancelLabel}
      defaultActionDisabled={!canSubmit || value.trim() === ""}
      onDefaultAction={submit}
      onCancel={onCancel}
      initialFocusRef={inputRef}
      returnFocusTarget={returnFocusTarget}
      testIdPrefix={testIdPrefix}
      defaultActionTestId={defaultActionTestId}
      cancelActionTestId={cancelActionTestId}
      className="w-[min(480px,calc(100vw-32px))]"
    >
      <label className={parts.field}>
        <span className={parts.label}>{label}</span>
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={inputTestId}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
        />
      </label>
      {error ? (
        <p id={errorId} role="alert" className={parts.error}>
          {error}
        </p>
      ) : hint ? (
        <p className={parts.hint}>{hint}</p>
      ) : null}
    </OfficeDialogShell>
  );
}
