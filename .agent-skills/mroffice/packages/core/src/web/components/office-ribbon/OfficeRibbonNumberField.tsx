/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "../../../host/next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useTouchMode } from "../../lib/touch-mode";

import styles from "./OfficeRibbonNumberField.module.css";

export const OFFICE_RIBBON_NUMBER_FIELD_WIDTH_SCALE = 1.5;

function classes(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface OfficeRibbonNumberFieldClassNames {
  field?: string;
  icon?: string;
  input?: string;
  label?: string;
  unit?: string;
}

export interface OfficeRibbonNumberFieldProps {
  /** A length box that also takes a typed unit ("2 cm", `0.5"`, "72 pt"),
   * as Word's do: a text field the host parses; a number field otherwise. */
  acceptsUnits?: boolean;
  icon: ReactNode;
  label: string;
  testId: string;
  value: string;
  classNames?: OfficeRibbonNumberFieldClassNames;
  controlId?: string;
  controlOccurrenceId?: string;
  controlSurface?: string;
  disabled?: boolean;
  disabledReason?: string;
  mixed?: boolean;
  mixedLabel?: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  visibleLabel?: string;
  inputWidthPx?: number;
  onRememberSelection?: () => void;
  onDraftChange?: (raw: string) => void;
  onStep?: (direction: "increment" | "decrement") => void;
  onCommit: (raw: string) => void;
  






  resyncKey?: string | number;
}

type StepDirection = "increment" | "decrement";









function OfficeRibbonNumberSteppers({
  label,
  testId,
  disabled,
  onPress,
  onStep,
}: {
  label: string;
  testId: string;
  disabled: boolean;
  onPress?: () => void;
  onStep: (direction: StepDirection) => void;
}) {
  const t = useTranslations("console-notebooks");
  const stepper = (direction: StepDirection) => (
    <button
      type="button"
      className={styles.stepper}
      data-office-ribbon-number-stepper={direction}
      data-testid={`${testId}-${direction}`}
      aria-label={t(`presentation.tableInsert.${direction}`, { label })}
      disabled={disabled}
      tabIndex={-1}
      onPointerDown={onPress}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onStep(direction);
      }}
    >
      <span aria-hidden>{direction === "increment" ? "+" : "\u2212"}</span>
    </button>
  );
  return (
    <>
      {stepper("decrement")}
      {stepper("increment")}
    </>
  );
}

/**
 * Shared Office ribbon number field.
 *
 * Docs, Spreadsheet and the other native editors use the same compact icon +
 * numeric input + optional unit anatomy. The field owns draft synchronisation,
 * Enter/blur commit and Escape cancellation; editor adapters supply only the
 * command authority, icon and contextual sizing classes. With Touch mode on,
 * − / + steppers follow the value (OfficeRibbonNumberSteppers); off, the
 * field is exactly the compact one.
 */
/** How many decimals a typed number carries ("5.08" → 2, "3" → 0). */
function decimalsOf(text: string): number {
  const match = /\.(\d+)$/.exec(text.trim());
  return match ? match[1].length : 0;
}

export function OfficeRibbonNumberField({
  acceptsUnits = false,
  icon,
  label,
  testId,
  value,
  classNames,
  controlId,
  controlOccurrenceId,
  controlSurface,
  disabled = false,
  disabledReason,
  mixed = false,
  mixedLabel,
  min,
  max,
  step,
  unit,
  visibleLabel,
  inputWidthPx,
  onRememberSelection,
  onDraftChange,
  onStep,
  onCommit,
  resyncKey,
}: OfficeRibbonNumberFieldProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [editingMixed, setEditingMixed] = useState(false);
  const skipNextBlurCommitRef = useRef(false);
  const syncKey = `${mixed ? "mixed" : "value"}:${value}:${resyncKey ?? ""}`;
  const lastSyncedRef = useRef(syncKey);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const touchMode = useTouchMode();

  useEffect(() => {
    if ((focused && editingMixed) || lastSyncedRef.current === syncKey) return;
    lastSyncedRef.current = syncKey;
    setDraft(value);
    setEditingMixed(false);
  }, [editingMixed, focused, syncKey, value]);

  // The value in force as last rendered, for the check after a commit.
  const renderedRef = useRef({ syncKey, value });
  useLayoutEffect(() => {
    renderedRef.current = { syncKey, value };
  }, [syncKey, value]);

  const displayMixed = mixed && !editingMixed;
  const commit = (skipFollowingBlur = false) => {
    if (disabled || displayMixed) return;
    const next = draft.trim();
    if (next === value.trim()) return;
    // A plain number outside the field's own bounds is not a value it takes
    // (Office answers "The number must be between 0.01 and 55.87"): the field
    // shows its value again and nothing is written. Handed on, a host wrote
    // a zero width as a 1 EMU shape, saved and folded flat (WUA 105).
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(next)) {
      const number = Number(next);
      if (
        (Number.isFinite(min) && number < min) ||
        (Number.isFinite(max) && number > max)
      ) {
        setDraft(value);
        setEditingMixed(false);
        return;
      }
    }
    if (skipFollowingBlur) skipNextBlurCommitRef.current = true;
    const committedKey = syncKey;
    onCommit(next);
    // A value the host refused (a negative indent, "abc") leaves its value
    // as it was: the field shows that value again instead of keeping the
    // refused draft as if it had applied. An applied value has re-synced the
    // draft by then through its new key.
    requestAnimationFrame(() => {
      if (renderedRef.current.syncKey !== committedKey) return;
      setDraft(renderedRef.current.value);
      setEditingMixed(false);
    });
  };

  /** One step, as ArrowUp / ArrowDown take it: the host's own step when it
   * has one, else the input's native step (step / min / max), committed. */
  const stepOnce = (direction: StepDirection) => {
    if (disabled || displayMixed) return;
    const input = inputRef.current;
    const focusedHere = Boolean(input && input === document.activeElement);
    if (onStep) {
      // a focused field's draft gives way to the stepped value, as on ArrowUp
      if (focusedHere) skipNextBlurCommitRef.current = true;
      setDraft(value);
      setEditingMixed(false);
      onStep(direction);
      return;
    }
    if (!input) return;
    // One step from the value as typed, not from the nearest multiple of the
    // step: the input's own stepUp snapped 5.08 to 5.10 before stepping, so
    
    const current = Number(input.value.trim() || value.trim());
    if (Number.isFinite(current) && Number.isFinite(step) && step > 0) {
      const decimals = Math.max(
        decimalsOf(input.value.trim() || value.trim()),
        decimalsOf(String(step)),
      );
      const stepped = current + (direction === "increment" ? step : -step);
      const clamped = Math.min(
        Number.isFinite(max) ? max : Infinity,
        Math.max(Number.isFinite(min) ? min : -Infinity, stepped),
      );
      input.value = String(Number(clamped.toFixed(Math.min(decimals, 6))));
    } else {
      try {
        if (direction === "increment") input.stepUp();
        else input.stepDown();
      } catch {
        return; // not a steppable value
      }
    }
    const next = input.value.trim();
    setDraft(next);
    setEditingMixed(false);
    onDraftChange?.(next);
    if (next === value.trim()) return;
    if (focusedHere) skipNextBlurCommitRef.current = true;
    onCommit(next);
  };

  // The spinbutton's current value for assistive technology. A number input
  // reports its own value; a text one (a length box that takes "2 cm") has
  // none, so without aria-valuenow the accessibility tree read Value 0 next
  // to a box showing 1.61 (WUA 249). The number is the one shown — the draft
  // while typing — and the text says it with its unit.
  const shownText = displayMixed ? "" : draft.trim();
  const shownNumber = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(shownText);
  const ariaValueNow = shownNumber ? Number(shownNumber[0]) : undefined;
  const ariaValueText = displayMixed
    ? mixedLabel || undefined
    : shownText
      ? unit && !/[^\d.,+\-\s]/.test(shownText)
        ? `${shownText} ${unit}`
        : shownText
      : undefined;

  return (
    <label
      className={classes(styles.field, classNames?.field)}
      data-has-unit={unit ? "true" : undefined}
      data-has-visible-label={visibleLabel ? "true" : undefined}
      data-office-ribbon-number-field="true"
      data-office-ribbon-number-width-scale={
        OFFICE_RIBBON_NUMBER_FIELD_WIDTH_SCALE
      }
      data-appearance="native-spinner"
      data-touch-steppers={touchMode ? "true" : undefined}
      title={disabled && disabledReason ? disabledReason : label}
    >
      <span
        className={classes(styles.icon, classNames?.icon)}
        data-office-ribbon-number-icon="true"
        aria-hidden
      >
        {icon}
      </span>
      {visibleLabel ? (
        <span className={classes(styles.label, classNames?.label)}>
          {visibleLabel}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type={acceptsUnits ? "text" : "number"}
        role="spinbutton"
        className={classes(styles.input, classNames?.input)}
        data-control-id={controlId}
        data-control-occurrence-id={controlOccurrenceId}
        data-control-surface={controlSurface}
        data-disabled-reason={disabled ? disabledReason : undefined}
        data-office-ribbon-number-input="true"
        data-office-ribbon-number-width-scale={
          OFFICE_RIBBON_NUMBER_FIELD_WIDTH_SCALE
        }
        data-testid={testId}
        aria-label={label}
        aria-valuenow={
          ariaValueNow !== undefined && Number.isFinite(ariaValueNow)
            ? ariaValueNow
            : undefined
        }
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={ariaValueText}
        title={disabled && disabledReason ? disabledReason : label}
        value={displayMixed ? "" : draft}
        disabled={disabled}
        placeholder={displayMixed ? mixedLabel : undefined}
        min={min}
        max={max}
        step={step}
        style={
          inputWidthPx
            ? { width: inputWidthPx * OFFICE_RIBBON_NUMBER_FIELD_WIDTH_SCALE }
            : undefined
        }
        inputMode="decimal"
        onPointerDown={onRememberSelection}
        onFocus={() => {
          setFocused(true);
          onRememberSelection?.();
        }}
        onChange={(event) => {
          skipNextBlurCommitRef.current = false;
          setEditingMixed(true);
          setDraft(event.target.value);
          onDraftChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (disabled || displayMixed) return;
            // The field steps itself: the browser's own ArrowUp snapped a
            
            event.preventDefault();
            stepOnce(event.key === "ArrowUp" ? "increment" : "decrement");
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            skipNextBlurCommitRef.current = true;
            setDraft(value);
            setEditingMixed(false);
            setFocused(false);
            event.currentTarget.blur();
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit(true);
          setFocused(false);
          event.currentTarget.blur();
        }}
        onBlur={() => {
          setFocused(false);
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          commit();
        }}
      />
      {unit ? (
        <span
          className={classes(styles.unit, classNames?.unit)}
          data-office-ribbon-number-unit="true"
        >
          {unit}
        </span>
      ) : null}
      {touchMode ? (
        <OfficeRibbonNumberSteppers
          label={label}
          testId={testId}
          disabled={disabled || displayMixed}
          onPress={onRememberSelection}
          onStep={stepOnce}
        />
      ) : null}
    </label>
  );
}
