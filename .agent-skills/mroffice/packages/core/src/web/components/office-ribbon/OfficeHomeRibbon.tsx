/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Shared Home-ribbon anatomy for the four native editors.
 *
 * The generic chassis owns tabs, overflow and selection-safe button events.
 * This module owns the physical grammar that was still drifting between
 * editors: a fixed-height non-stretching command band, bounded groups, one
 * undo rail, and the same large/compact/icon command boxes. Editor adapters
 * supply labels, icons and command authority; they do not recreate geometry.
 */

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  OfficeRibbonButton,
  OfficeRibbonGroup,
  type OfficeRibbonGroupLauncher,
  OfficeRibbonStrip,
  type OfficeRibbonStripProps,
  useOfficeRibbonLaneMark,
} from "./OfficeRibbonChassis";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  officeFormatPreviewHandlers,
  useOfficeFormatPreview,
  type OfficeFormatPreviewPatch,
} from "./officeFormatPreview";
import { useOfficeRibbonCommandGate } from "./officeRibbonCommandGate";
import { isDoubleTap } from "../../lib/double-tap";

/** A dblclick this soon after a double tap ran is the same double tap. */
const DOUBLE_TAP_DBLCLICK_MS = 800;
const nowMs = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

import styles from "./OfficeHomeRibbon.module.css";
import galleryStyles from "./OfficeRibbonGallery.module.css";

export type OfficeHomeRibbonDensity = "office" | "pdfCompact";
export type OfficeHomeGroupSize =
  "rail" | "narrow" | "compact" | "standard" | "wide" | "gallery" | "content";

export const OFFICE_HOME_METRICS = Object.freeze({
  office: Object.freeze({
    bandHeight: 100,
    captionHeight: 14,
    largeIcon: 24,
    compactIcon: 20,
  }),
  pdfCompact: Object.freeze({
    bandHeight: 100,
    captionHeight: 14,
    largeIcon: 24,
    compactIcon: 20,
  }),
});

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function OfficeHomeRibbonStrip({
  density = "office",
  className,
  ...props
}: OfficeRibbonStripProps & {
  density?: OfficeHomeRibbonDensity;
  className?: string;
}) {
  return (
    <div
      className={classes(styles.surface, className)}
      data-office-home-density={density}
      data-testid={
        props.testIdPrefix ? `${props.testIdPrefix}-home-surface` : undefined
      }
    >
      <OfficeRibbonStrip {...props} />
    </div>
  );
}

export function OfficeHomeRibbonGroup(props: {
  label?: string;
  ribbon?: string;
  size?: OfficeHomeGroupSize;
  /** Stable semantic command-family identity used by capability registries. */
  controlId?: string;
  /** @deprecated Group width is now content-owned and this hint is ignored. */
  width?: number;
  minWidth?: number;
  className?: string;
  testId?: string;
  /** The group's dialog box launcher, in its lower right corner. */
  launcher?: OfficeRibbonGroupLauncher;
  ariaBusy?: boolean;
  /** Extra `data-*` attributes on the group (a host's own tab gating). */
  dataAttributes?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}) {
  const {
    label,
    ribbon = "home",
    size = "content",
    controlId,
    minWidth,
    className,
    testId,
    launcher,
    ariaBusy,
    dataAttributes,
    children,
  } = props;
  const style: CSSProperties | undefined =
    minWidth === undefined ? undefined : { minWidth };

  return (
    <OfficeRibbonGroup
      label={label}
      ribbon={ribbon}
      controlId={controlId}
      className={classes(
        styles.group,
        size === "rail" && styles.groupRail,
        className,
      )}
      style={style}
      testId={testId}
      launcher={launcher}
      ariaBusy={ariaBusy}
      dataAttributes={dataAttributes}
    >
      {children}
    </OfficeRibbonGroup>
  );
}

export interface OfficeHomeCommandProps {
  /** Use click for commands that mount a modal backdrop. */
  activation?: "pointerDown" | "click";
  active?: boolean | "mixed";
  /** Optional live count rendered beside the visible command label. */
  badge?: number;
  /** Dialog/disclosure launchers expose their live expanded state. */
  ariaExpanded?: boolean;
  armedState?: string;
  /** Exact rendered command button; never recover anchors through DOM queries. */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Stable semantic command identity; independent from the test id. */
  controlId?: string;
  disabled?: boolean;
  /** Exact explanation appended to the accessible label while disabled. */
  disabledReason?: string;
  displayLabel?: string;
  /**
   * Live Preview for a format toggle (Bold, Italic, Underline, Strikethrough):
   * what clicking would apply, shown on the selection while hovered/focused.
   */
  formatPreview?: OfficeFormatPreviewPatch | null;
  /**
   * The command formats characters (Grow Font, a colour face): an open text
   * entry stays open for it and it acts on the characters selected. Implied
   * by `formatPreview`.
   */
  textFormatControl?: boolean;
  icon: ReactNode;
  label: string;
  keyShortcuts?: string;
  onClick: () => void;
  /**
   * A double-click — and a finger's double tap, which an iPad does not turn
   * into a dblclick (Format Painter: double-click locks it on, Microsoft
   * Support "Use the Format Painter"). The second tap runs this instead of
   * `onClick`; the first stays an ordinary click.
   */
  onDoubleClick?: () => void;
  testId?: string;
  variant?: "large" | "compact" | "icon";
}

export function OfficeHomeCommand({
  activation,
  active,
  ariaExpanded,
  armedState,
  badge,
  buttonRef,
  controlId,
  disabled: ownDisabled,
  disabledReason: ownDisabledReason,
  displayLabel,
  formatPreview: formatPreviewPatch,
  textFormatControl,
  icon,
  keyShortcuts,
  label,
  onClick,
  onDoubleClick,
  testId,
  variant = "compact",
}: OfficeHomeCommandProps) {
  const formatPreview = useOfficeFormatPreview();
  // This command's double tap: its own key for isDoubleTap, whether the
  // press in hand is the second tap, and when the last one ran.
  const doubleTap = useRef({ pending: false, at: Number.NEGATIVE_INFINITY });
  // The host's selection gate may grey this command for what is selected.
  const { disabled, disabledReason } = useOfficeRibbonCommandGate(
    testId,
    ownDisabled,
    ownDisabledReason,
  );
  const iconOnly = variant === "icon";
  const accessibleLabel =
    disabled && disabledReason
      ? `${label}: ${disabledReason}`
      : badge && badge > 0
        ? `${label}: ${badge}`
        : label;
  return (
    <OfficeRibbonButton
      activation={activation}
      active={active}
      big={variant === "large"}
      buttonRef={buttonRef}
      className={classes(
        styles.command,
        variant === "large" && styles.commandLarge,
        variant === "compact" && styles.commandCompact,
        iconOnly && styles.commandIcon,
      )}
      disabled={disabled}
      label={accessibleLabel}
      {...officeFormatPreviewHandlers(
        formatPreview,
        disabled ? null : formatPreviewPatch,
      )}
      onMouseDownCapture={
        onDoubleClick
          ? (event) => {
              // a tap's compatibility mousedown, the second of a double tap
              doubleTap.current.pending = isDoubleTap(event.nativeEvent, doubleTap.current);
            }
          : undefined
      }
      onClick={() => {
        formatPreview.clearPreview();
        if (onDoubleClick && doubleTap.current.pending) {
          doubleTap.current.pending = false;
          doubleTap.current.at = nowMs();
          onDoubleClick();
          return;
        }
        onClick();
      }}
      onDoubleClick={
        onDoubleClick
          ? () => {
              // a browser that also reports the double tap as a dblclick
              if (nowMs() - doubleTap.current.at < DOUBLE_TAP_DBLCLICK_MS) return;
              onDoubleClick();
            }
          : undefined
      }
      testId={testId}
      aria-expanded={ariaExpanded}
      aria-keyshortcuts={keyShortcuts}
      data-armed={armedState}
      data-control-id={controlId}
      data-disabled-reason={
        disabled && disabledReason ? disabledReason : undefined
      }
      data-office-anatomy={variant}
      data-office-text-format-control={
        textFormatControl || formatPreviewPatch !== undefined ? "true" : undefined
      }
    >
      <span className={styles.commandGlyph} aria-hidden>
        {icon}
      </span>
      {iconOnly ? null : (
        <span className={styles.commandLabel}>{displayLabel ?? label}</span>
      )}
      {badge && badge > 0 ? (
        <span className={styles.commandBadge} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </OfficeRibbonButton>
  );
}

export interface OfficeHomeMenuTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  active?: boolean | "mixed";
  /** Stable semantic command identity; rendered only as a data attribute. */
  controlId?: string;
  /** Appended to the accessible name/title when this trigger is disabled. */
  disabledReason?: string;
  displayLabel?: string;
  geometry?: "default" | "pager" | "gallery";
  /** Render the shared bounded disclosure rail; callers supply only the primary icon. */
  hasMenuIndicator?: boolean;
  icon: ReactNode;
  label: string;
  testId?: string;
  variant?: "large" | "compact" | "icon";
}

/**
 * Ref-forwarding button face for Radix `Trigger asChild` integrations.
 * Command buttons deliberately own their click pipeline; menu triggers must
 * instead accept the trigger library's ref, data-state and event handlers.
 */
/**
 * A disabled trigger's name with why it is disabled -- once: a host that
 * already wrote the reason into the name (as several sheet menus do) would
 * otherwise have it said twice (live audit S-148).
 */
function labelWithDisabledReason(label: string, disabled: boolean | undefined, reason: string | undefined): string {
  if (!disabled || !reason || label.includes(reason)) return label;
  return `${label}: ${reason}`;
}

export const OfficeHomeMenuTrigger = forwardRef<
  HTMLButtonElement,
  OfficeHomeMenuTriggerProps
>(function OfficeHomeMenuTrigger(
  {
    active,
    className,
    controlId,
    disabled: ownDisabled,
    disabledReason: ownDisabledReason,
    displayLabel,
    geometry = "default",
    hasMenuIndicator,
    icon,
    label,
    testId,
    title,
    variant = "compact",
    ...buttonProps
  },
  ref,
) {
  // Callers spell the control id both ways. The explicit attribute is written
  // AFTER the spread, so a caller that passed `data-control-id` used to have
  // it overwritten with `undefined` and the button reached the DOM with no
  // control id at all — silently, for 25 menu triggers across the deck.
  const resolvedControlId =
    controlId ??
    (buttonProps as { "data-control-id"?: string })["data-control-id"];
  const { disabled, disabledReason } = useOfficeRibbonCommandGate(
    testId,
    ownDisabled,
    ownDisabledReason,
  );
  if (geometry === "gallery") {
    const accessibleLabel = labelWithDisabledReason(label, disabled, disabledReason);
    return (
      <button
        {...buttonProps}
        ref={ref}
        type="button"
        className={classes("office-ribbon-control", galleryStyles.disclosureButton, className)}
        aria-label={accessibleLabel}
        aria-pressed={active}
        data-control-id={resolvedControlId}
        data-disabled-reason={disabled && disabledReason ? disabledReason : undefined}
        data-office-control-part="disclosure"
        data-office-gallery-part="disclosure"
        data-testid={testId}
        disabled={disabled}
        title={title ?? accessibleLabel}
      >
        <span aria-hidden="true">
          <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
        </span>
      </button>
    );
  }
  const iconOnly = variant === "icon";
  const accessibleLabel = labelWithDisabledReason(label, disabled, disabledReason);
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={classes(
        "office-ribbon-control",
        variant === "large"
          ? "note-editor-ribbon-big"
          : "note-editor-office-toolbar__button",
        active &&
          (variant === "large"
            ? "note-editor-ribbon-big--active"
            : "is-active"),
        styles.command,
        variant === "large" && styles.commandLarge,
        variant === "compact" && styles.commandCompact,
        iconOnly && styles.commandIcon,
        iconOnly && geometry === "pager" && styles.commandPager,
        hasMenuIndicator && styles.commandWithDisclosure,
        className,
      )}
      aria-label={accessibleLabel}
      aria-pressed={active}
      data-control-id={resolvedControlId}
      data-disabled-reason={disabled && disabledReason ? disabledReason : undefined}
      data-office-home-menu-indicator={hasMenuIndicator || undefined}
      data-office-control-part={hasMenuIndicator ? "menu" : "button"}
      data-testid={testId}
      disabled={disabled}
      title={title ?? accessibleLabel}
    >
      {hasMenuIndicator ? (
        <>
          <span
            className={classes("office-ribbon-control", styles.commandMain)}
            data-office-control-part="primary"
            data-office-home-menu-part="primary"
          >
            <span className={styles.commandGlyph} aria-hidden>
              {icon}
            </span>
            {iconOnly ? null : (
              <span className={styles.commandLabel}>
                {displayLabel ?? label}
              </span>
            )}
          </span>
          <span
            className={classes("office-ribbon-control", styles.disclosureRail)}
            data-office-control-part="disclosure"
            data-office-home-menu-part="trigger"
            aria-hidden
          >
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={16} />
          </span>
        </>
      ) : (
        <>
          <span className={styles.commandGlyph} aria-hidden>
            {icon}
          </span>
          {iconOnly ? null : (
            <span className={styles.commandLabel}>{displayLabel ?? label}</span>
          )}
        </>
      )}
    </button>
  );
});

export interface OfficeHomeNumberFieldStepper {
  controlId?: string;
  decrementLabel: string;
  incrementLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  testId?: string;
}

export interface OfficeHomeNumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "className" | "type"
> {
  appearance?: "default" | "native-spinner";
  className?: string;
  controlId?: string;
  label: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
  stepper?: OfficeHomeNumberFieldStepper;
  testId: string;
}

/**
 * Shared Office ribbon number field. Hosts keep parsing, bounds and command
 * authority; this primitive owns the bounded field shell, its opt-in compact
 * native spinner, and the paired custom stepper used by existing consumers.
 */
export function OfficeHomeNumberField({
  appearance,
  className,
  controlId,
  disabled,
  label,
  max,
  min,
  onDecrement,
  onIncrement,
  onKeyDown,
  step,
  stepper,
  testId,
  value,
  ...inputProps
}: OfficeHomeNumberFieldProps) {
  const resolvedControlId =
    controlId ??
    (inputProps as { "data-control-id"?: string })["data-control-id"];
  const nativeSpinner = appearance === "native-spinner";
  const customStepper = nativeSpinner ? undefined : stepper;
  const valueText = value === undefined || value === null ? "" : String(value);
  const numericValue = valueText.trim() === "" ? Number.NaN : Number(valueText);
  const numericMin = min === undefined ? undefined : Number(min);
  const numericMax = max === undefined ? undefined : Number(max);
  const decrement = customStepper?.onDecrement ?? onDecrement;
  const increment = customStepper?.onIncrement ?? onIncrement;

  return (
    <span
      className={classes(styles.numberField, className)}
      data-appearance={nativeSpinner ? "native-spinner" : undefined}
      data-disabled={disabled || undefined}
      data-has-stepper={Boolean(customStepper) || undefined}
      data-step={step}
    >
      <input
        {...inputProps}
        type={nativeSpinner ? "number" : "text"}
        role="spinbutton"
        className={styles.numberFieldInput}
        aria-label={label}
        aria-valuemin={
          Number.isFinite(numericMin) ? numericMin : undefined
        }
        aria-valuemax={
          Number.isFinite(numericMax) ? numericMax : undefined
        }
        aria-valuenow={
          Number.isFinite(numericValue) ? numericValue : undefined
        }
        aria-valuetext={valueText}
        data-control-id={resolvedControlId}
        data-testid={testId}
        disabled={disabled}
        inputMode={inputProps.inputMode ?? "decimal"}
        max={nativeSpinner ? max : undefined}
        min={nativeSpinner ? min : undefined}
        step={nativeSpinner ? step : undefined}
        value={valueText}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (increment && !disabled && event.key === "ArrowUp") {
            event.preventDefault();
            increment();
            return;
          }
          if (decrement && !disabled && event.key === "ArrowDown") {
            event.preventDefault();
            decrement();
            return;
          }
          onKeyDown?.(event);
        }}
      />
      {customStepper ? (
        <span
          className={styles.numberStepper}
          data-control-id={customStepper.controlId}
          data-testid={customStepper.testId ?? `${testId}-stepper`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className={classes("office-ribbon-control", styles.numberStepperButton)}
            data-office-control-part="stepper"
            aria-label={customStepper.decrementLabel}
            data-office-number-stepper-action="decrement"
            data-testid={`${testId}-decrement`}
            disabled={disabled}
            onClick={customStepper.onDecrement}
          >
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={10} />
          </button>
          <button
            type="button"
            className={classes(
              "office-ribbon-control",
              styles.numberStepperButton,
              styles.numberStepperIncrement,
            )}
            data-office-control-part="stepper"
            aria-label={customStepper.incrementLabel}
            data-office-number-stepper-action="increment"
            data-testid={`${testId}-increment`}
            disabled={disabled}
            onClick={customStepper.onIncrement}
          >
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={10} />
          </button>
        </span>
      ) : null}
    </span>
  );
}

export interface OfficeHomeCheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "children" | "className" | "onChange" | "type"
> {
  checked: boolean;
  className?: string;
  controlId?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  testId: string;
}

/** Native checkbox semantics with the same bounded Office ribbon geometry. */
export function OfficeHomeCheckbox({
  checked,
  className,
  controlId,
  disabled,
  label,
  onCheckedChange,
  testId,
  ...inputProps
}: OfficeHomeCheckboxProps) {
  const resolvedControlId =
    controlId ??
    (inputProps as { "data-control-id"?: string })["data-control-id"];
  return (
    <label
      className={classes(styles.checkbox, className)}
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <input
        {...inputProps}
        type="checkbox"
        className={styles.checkboxInput}
        checked={checked}
        data-control-id={resolvedControlId}
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className={styles.checkboxIndicator} aria-hidden="true">
        {checked ? (
          <OfficeSemanticIcon semanticId="selection.check" size={11} />
        ) : null}
      </span>
      <span className={styles.checkboxLabel}>{label}</span>
    </label>
  );
}

export function OfficeHomeUndoRail({
  label,
  undo,
  redo,
  testId,
  width,
  ribbon,
  commandMarker,
}: {
  label: string;
  undo: OfficeHomeCommandProps;
  redo: OfficeHomeCommandProps;
  testId?: string;
  width?: number;
  /**
   * The ribbon token the group carries (`data-ribbon`), so a host whose strip
   * collects a contextual tab's groups by that token mounts the rail DIRECTLY
   * in its track, as the SmartArt tab is mounted: a `display: contents`
   * wrapper takes the group out of the track's column anatomy.
   */
  ribbon?: string;
  /**
   * A data attribute the host's own focus rules look for on a pressed
   * command (Docs' header/footer island keeps its story open for a press
   * inside `[data-header-footer-context-control]`). It marks a box-less
   * wrapper INSIDE the group, around the two commands, so the group itself
   * stays the track's child.
   */
  commandMarker?: `data-${string}`;
}) {
  const commands = (
    <>
      <OfficeHomeCommand {...undo} variant="icon" />
      <OfficeHomeCommand {...redo} variant="icon" />
    </>
  );
  return (
    <OfficeHomeRibbonGroup
      label={label}
      ribbon={ribbon}
      size="rail"
      width={width}
      className={styles.undoRail}
      testId={testId}
    >
      {commandMarker ? (
        <div {...{ [commandMarker]: "" }} style={{ display: "contents" }}>
          {commands}
        </div>
      ) : (
        commands
      )}
    </OfficeHomeRibbonGroup>
  );
}












export function OfficeHomeCommandStack({
  className,
  children,
  rows,
}: {
  className?: string;
  children: ReactNode;
  rows?: 3;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  
  // rows={3} states it for a stack whose faces hide and show.
  useOfficeRibbonLaneMark(ref, "data-office-stack-lane", rows === 3);
  return (
    <div
      ref={ref}
      className={classes(
        styles.commandStack,
        rows === 3 && styles.commandStackThreeRows,
        className,
      )}
      data-office-stack-rows={rows}
    >
      {children}
    </div>
  );
}

export function OfficeHomeCommandRow({
  className,
  children,
  testId,
}: {
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={classes(styles.commandRow, className)}
      data-office-home-command-row="true"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * Adapter-driven Clipboard anatomy shared by every Home ribbon. The host owns
 * command authority and menu contents; this component owns only the stable
 * large Paste split plus the compact action stack beside it.
 */
export function OfficeHomeClipboardComposite({
  primary,
  trigger,
  actions,
  className,
  splitClassName,
  actionsClassName,
  testId,
  splitTestId,
  actionsTestId,
}: {
  primary: ReactNode;
  trigger: ReactNode;
  actions: ReactNode;
  className?: string;
  splitClassName?: string;
  actionsClassName?: string;
  testId?: string;
  splitTestId?: string;
  actionsTestId?: string;
}) {
  return (
    <div
      className={classes(styles.clipboard, className)}
      data-testid={testId}
    >
      <OfficeHomeSplitLayout
        primary={primary}
        trigger={trigger}
        className={classes(styles.clipboardSplit, splitClassName)}
        testId={splitTestId}
      />
      <div
        className={classes(styles.clipboardActions, actionsClassName)}
        data-testid={actionsTestId}
      >
        {actions}
      </div>
    </div>
  );
}

/** A split one of whose enabled buttons is hovered (OfficeRibbonControl.css). */
export const OFFICE_SPLIT_HOVER_ATTRIBUTE = "data-office-split-hover";
/** The same for a finger's press (lib/press-feedback's `data-press-play`). */
export const OFFICE_SPLIT_PRESS_ATTRIBUTE = "data-office-split-press";
/** A split one of whose buttons is open, expanded, pressed or active. */
export const OFFICE_SPLIT_SELECTED_ATTRIBUTE = "data-office-split-selected";
/** A split whose every button is unavailable: its whole face fades. */
export const OFFICE_SPLIT_DISABLED_ATTRIBUTE = "data-office-split-disabled";
const SPLIT_HOVER_QUERY = ':has(button:hover:not(:disabled):not([aria-disabled="true"]))';
const SPLIT_DISABLED_QUERY =
  ':has(button):not(:has(button:not(:disabled):not([aria-disabled="true"])))';
const SPLIT_PRESS_QUERY = ':has(button[data-press-play]:not(:disabled):not([aria-disabled="true"]))';
const SPLIT_SELECTED_QUERY =
  ':has(button[data-state="open"], button[aria-expanded="true"], button[aria-pressed="true"], button[aria-pressed="mixed"], button.is-active)';
const SPLIT_STATE_ATTRIBUTES = ["disabled", "aria-disabled", "data-state", "aria-expanded", "aria-pressed", "class", "data-press-play"];

function splitMatches(split: Element, query: string): boolean {
  try {
    return split.matches(query);
  } catch {
    return false;
  }
}
















function useOfficeSplitStateMarks(splitRef: { readonly current: HTMLDivElement | null }): void {
  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return;
    const sync = () => {
      split.toggleAttribute(OFFICE_SPLIT_HOVER_ATTRIBUTE, splitMatches(split, SPLIT_HOVER_QUERY));
      split.toggleAttribute(OFFICE_SPLIT_PRESS_ATTRIBUTE, splitMatches(split, SPLIT_PRESS_QUERY));
      split.toggleAttribute(OFFICE_SPLIT_SELECTED_ATTRIBUTE, splitMatches(split, SPLIT_SELECTED_QUERY));
      split.toggleAttribute(OFFICE_SPLIT_DISABLED_ATTRIBUTE, splitMatches(split, SPLIT_DISABLED_QUERY));
    };
    sync();
    const observer = typeof MutationObserver === "function" ? new MutationObserver(sync) : null;
    observer?.observe(split, { subtree: true, childList: true, attributes: true, attributeFilter: SPLIT_STATE_ATTRIBUTES });
    // :hover moves with the pointer (and, after a tap in Safari, stays until
    // the next one lands elsewhere, which sends the compatibility mouseout).
    // An engine that moves :hover after the boundary event reads it again
    // before the frame paints.
    let frame = 0;
    const syncHover = () => {
      sync();
      if (frame || typeof requestAnimationFrame !== "function") return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    const hoverEvents = ["pointerover", "pointerout", "mouseover", "mouseout"] as const;
    for (const type of hoverEvents) split.addEventListener(type, syncHover);
    return () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const type of hoverEvents) split.removeEventListener(type, syncHover);
    };
  }, [splitRef]);
}

/**
 * Layout-only split anatomy. The caller retains its existing command and
 * menu primitives, while both halves share one fixed box and focus outline.
 */
export function OfficeHomeSplitLayout({
  primary,
  trigger,
  className,
  testId,
}: {
  primary: ReactNode;
  trigger: ReactNode;
  className?: string;
  testId?: string;
}) {
  // Whether the split holds a large command, looked at after every render
  // (the caller's faces are opaque nodes): the CSS keys on this mark rather
  // than on `:not(:has(.commandLarge))`, which WebKit re-evaluated for every
  // node inserted anywhere in the page.
  const splitRef = useRef<HTMLDivElement | null>(null);
  useOfficeSplitStateMarks(splitRef);
  useLayoutEffect(() => {
    const element = splitRef.current;
    if (!element) return;
    if (styles.commandLarge && element.getElementsByClassName(styles.commandLarge).length > 0) {
      element.setAttribute("data-office-split-large", "");
    } else {
      element.removeAttribute("data-office-split-large");
    }
  });
  return (
    <div
      ref={splitRef}
      className={classes("office-ribbon-control", styles.split, className)}
      data-office-control-part="split"
      data-office-home-split="true"
      data-testid={testId}
    >
      <div
        className={styles.splitPrimary}
        data-office-home-split-part="primary"
      >
        {primary}
      </div>
      <div
        className={classes("office-ribbon-control", styles.splitTrigger)}
        data-office-control-part="disclosure"
        data-office-home-split-part="trigger"
      >
        {trigger}
      </div>
    </div>
  );
}

/**
 * A large split, Office's Eraser or Paste: the 52px command face over the
 * 14px strip that opens its menu. The strip is one chevron; the caller's
 * trigger is a chevron-only menu trigger (variant "icon"), never a labelled
 * compact button, which the strip cannot hold.
 */
export function OfficeHomeLargeSplitLayout({
  primary,
  trigger,
  className,
  testId,
}: {
  primary: ReactNode;
  trigger: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <OfficeHomeSplitLayout
      primary={primary}
      trigger={trigger}
      className={classes(styles.largeSplit, className)}
      testId={testId}
    />
  );
}

export function OfficeHomeGallery({
  label,
  className,
  children,
  testId,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={classes(styles.gallery, className)}
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
