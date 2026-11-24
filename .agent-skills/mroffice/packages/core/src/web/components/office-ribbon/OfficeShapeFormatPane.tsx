"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X } from "./icons/houseIcons";

import { OfficeTaskPane, type OfficeTaskPaneProps } from "./OfficeTaskPane";
import styles from "./OfficeShapeFormatPane.module.css";

/** The pane's own classes, for a host's custom field (a row, an action). */
export const officeShapeFormatPaneStyles = styles;

/**
 * The ONE Format Shape pane for Docs, the deck and the worksheet.
 *
 * Office's Format Shape pane (Word, PowerPoint and Excel draw the same one;
 * Microsoft Support, "Add a fill or effect to a shape or text box" and
 * "Format Shape pane") is a docked, non-modal column with a tab strip at
 * the top -- Shape Options and Text Options, plus whatever the host adds --
 * and bordered sections underneath: Fill & Line, Effects, Size and
 * Properties (Alt Text lives there) on the shape side; Text Fill & Outline,
 * Text Effects and Text Box on the text side. A change applies at once; a
 * typed value applies when the field is left (Enter, Tab, a click
 * elsewhere) -- never when Cancel is pressed, which drops what is not
 * applied yet (an applied value is undone with Undo) -- and a value another editor
 * changed underneath an unsaved draft is never overwritten silently: the
 * draft stays, the pane says so, and one button takes the latest values.
 *
 * The frame, the tab strip, the read-only rule (every writing control is
 * disabled, tabs and Close and Cancel stay live) and the draft authority
 * live here; each host declares its own tabs, sections and fields against
 * its own writers, exactly as it does for the shared Shape Format tab.
 * A field the host cannot honour right now is shown disabled with its
 * reason, never dropped, so the three editors keep the same pane.
 */
export interface OfficeShapeFormatPaneLabels {
  readonly title: string;
  readonly close: string;
  readonly apply: string;
  readonly cancel: string;
  /** Said above the fields while an unsaved draft conflicts with the page. */
  readonly draftConflict?: string;
  readonly useLatestDraft?: string;
}

interface OfficeShapeFormatPaneFieldBase {
  /** `<prefix>-<id>` is the field's test id. */
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

/** A colour, with an optional "none" checkbox beside it. */
export interface OfficeShapeFormatPaneColorField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "color";
  /** `#rrggbb`, or `"none"` when the swatch is off. */
  readonly value: string;
  /** The swatch shown while the value is "none". */
  readonly fallback?: string;
  readonly onChange: (value: string) => void;
  /** When present, a checkbox that writes `"none"` / `restore` toggles here. */
  readonly none?: {
    readonly label: string;
    /** The colour written when the checkbox is cleared again. */
    readonly restore: string;
    readonly testId?: string;
  };
  /** Controls drawn after the swatch (a theme row, an eyedropper). */
  readonly extra?: ReactNode;
}

/** A number typed in, committed when the field is left (or on Enter). */
export interface OfficeShapeFormatPaneNumberField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "number";
  readonly value: number | string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** A unit drawn after the field (`cm`, `pt`, `°`). */
  readonly unit?: string;
  /** Shown while the field is empty (Office's "Auto" bound). */
  readonly placeholder?: string;
  /** The host's own input skin (Docs' physical value input). */
  readonly inputClassName?: string;
  /** Returns whether the value was taken; false keeps the draft. */
  readonly onCommit: (value: string) => boolean;
  /**
   * Why a typed value cannot be taken (an axis minimum at or above its
   * maximum), said under the field while that draft stands, so a refused
   * value is never left looking applied.
   */
  readonly invalidReason?: (value: string) => string | null;
  /**
   * Apply on every keystroke instead of when the field is left (a stepper
   * whose host redraws at once, as the deck's outline width does). No draft
   * is kept, so a page that moves under it simply shows the page's value.
   */
  readonly immediate?: boolean;
}

export interface OfficeShapeFormatPaneSelectField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "select";
  readonly value: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    /** An option this object cannot take, greyed with its reason. */
    readonly disabled?: boolean;
    readonly title?: string;
  }[];
  readonly onChange: (value: string) => void;
}

export interface OfficeShapeFormatPaneCheckboxField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "checkbox";
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/** A line of text, committed when the field is left. */
export interface OfficeShapeFormatPaneTextField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "text";
  readonly value: string;
  readonly maxLength?: number;
  /** Shown while the field is empty. */
  readonly placeholder?: string;
  /**
   * The host's edge rule for a typed value (a URL's scheme whitelist, a
   * canonical form): the pane commits and shows what it returns, so a
   * rejected value is cleared in the field, not kept as a phantom draft.
   */
  readonly sanitize?: (value: string) => string;
  readonly onCommit: (value: string) => boolean;
}

/** A paragraph with Apply and Cancel (alt text, a shape's text). */
export interface OfficeShapeFormatPaneTextareaField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "textarea";
  readonly value: string;
  readonly rows?: number;
  readonly maxLength?: number;
  readonly onCommit: (value: string) => boolean;
}

/** A list of buttons (Docs' text-box link targets), or a note when empty. */
export interface OfficeShapeFormatPaneButtonsField
  extends OfficeShapeFormatPaneFieldBase {
  readonly kind: "buttons";
  readonly buttons: readonly {
    readonly id: string;
    readonly label: string;
    readonly icon?: ReactNode;
    readonly onSelect: () => void;
    readonly disabled?: boolean;
  }[];
  readonly emptyLabel?: string;
  readonly emptyTestId?: string;
}

/** A host-drawn control (the deck's gradient stops, an image fill). */
export interface OfficeShapeFormatPaneCustomField {
  readonly kind: "custom";
  readonly id: string;
  readonly render: ReactNode;
}

export type OfficeShapeFormatPaneField =
  | OfficeShapeFormatPaneColorField
  | OfficeShapeFormatPaneNumberField
  | OfficeShapeFormatPaneSelectField
  | OfficeShapeFormatPaneCheckboxField
  | OfficeShapeFormatPaneTextField
  | OfficeShapeFormatPaneTextareaField
  | OfficeShapeFormatPaneButtonsField
  | OfficeShapeFormatPaneCustomField;

export interface OfficeShapeFormatPaneSection {
  readonly id: string;
  /** A section whose tests already address it keeps its own test id. */
  readonly testId?: string;
  /** Omitted for a section that is only a row of controls (an action). */
  readonly title?: string;
  /** A line under the title (why a section is greyed, what it takes). */
  readonly hint?: string;
  readonly fields: readonly OfficeShapeFormatPaneField[];
}

export interface OfficeShapeFormatPaneTab {
  /** `shape`, `text`, `alt`, … -- `<prefix>-tab-<id>`. */
  readonly id: string;
  readonly label: string;
  readonly sections: readonly OfficeShapeFormatPaneSection[];
}

/**
 * A host command's page of the pane: the tab `id`, and the `section` it
 * brings into view (`officeEffectsPaneSections`' `effects-glow`, ...). A new
 * `serial` is a new request (the same page asked for twice scrolls again).
 */
export interface OfficeShapeFormatPaneRequest {
  readonly id: string;
  readonly serial: number;
  readonly section?: string;
}

/** The attribute every pane section carries, naming its section id. */
const SECTION_ATTRIBUTE = "data-format-section";

/**
 * Bring one section of a Format pane into view (the Effects menu's "...
 * Options" rows, as Office opens the pane at that effect): the section under
 * `root` whose id is `section` scrolls to the top of the pane's body and is
 * marked `data-format-section-revealed`. False when the page holds no such
 * section. Every pane the shared builders draw (this pane, its sections in a
 * host's own pane) answers it.
 */
export function revealOfficeShapeFormatPaneSection(
  root: ParentNode | null | undefined,
  section: string,
): boolean {
  if (!root) return false;
  let found: HTMLElement | null = null;
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(`[${SECTION_ATTRIBUTE}]`))) {
    if (element.getAttribute(SECTION_ATTRIBUTE) === section && !found) {
      found = element;
      element.setAttribute("data-format-section-revealed", "true");
    } else {
      element.removeAttribute("data-format-section-revealed");
    }
  }
  found?.scrollIntoView?.({ block: "start" });
  return found !== null;
}

/**
 * Reveal `request.section` under `root` after each new request has rendered
 * (and on mount, for a pane opened by the request).
 */
export function useRevealOfficeShapeFormatPaneSection(
  root: { readonly current: ParentNode | null },
  request: { readonly serial: number; readonly section?: string } | null | undefined,
) {
  const serial = request?.serial;
  const section = request?.section;
  useEffect(() => {
    if (!section) return;
    revealOfficeShapeFormatPaneSection(root.current, section);
    // A new serial is a new request; the ref is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, section]);
}

export interface OfficeShapeFormatPaneProps {
  /** `document-shape-format-pane`, `spreadsheet-shape-format-pane`, … */
  readonly testIdPrefix: string;
  /** The pane root's test id when it is not the prefix (the deck's inspector). */
  readonly rootTestId?: string;
  /** `data-*` attributes the host's tests read on the root. */
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
  /** The dock's open panes, when the host docks more than one. */
  readonly dockTabs?: OfficeTaskPaneProps["tabs"];
  readonly dockTabsLabel?: string;
  readonly labels: OfficeShapeFormatPaneLabels;
  readonly tabs: readonly OfficeShapeFormatPaneTab[];
  readonly initialTab?: string;
  /** A host command that opens the pane at one page (PowerPoint's More
   * Rotation Options... opens Size & Properties), and at one section of it
   * (Glow Options... opens Effects at Glow): each new `serial` selects that
   * tab and scrolls the section into view; later clicks on the tabs are the
   * user's own. */
  readonly requestedTab?: OfficeShapeFormatPaneRequest;
  /** False greys every writing control; tabs, Close and Cancel stay live. */
  readonly writable: boolean;
  readonly onClose: () => void;
  /** Controls in the title row before the close button. */
  readonly headerActions?: ReactNode;
  /** The host's own placement; the default docks at the right edge. */
  readonly className?: string;
  readonly dockRight?: boolean;
  readonly titleId?: string;
  readonly closeControlId?: string;
  readonly controlId?: string;
  readonly hidden?: boolean;
  readonly paneRef?: React.Ref<HTMLElement>;
  readonly style?: React.CSSProperties;
}

interface AuthoritativeDraft {
  readonly accept: () => void;
  readonly conflict: boolean;
  readonly dirty: boolean;
  readonly reset: () => void;
  readonly setValue: (value: string) => void;
  readonly value: string;
}

interface DraftEntry {
  readonly baseline: string;
  readonly source: string;
  readonly value: string;
}

/**
 * The pane's typed values: each follows the page while it is clean, keeps
 * the user's draft while it is dirty, and reports a conflict when the page
 * moved under a dirty draft (the rule Docs' pane carried before it was
 * shared). The pane owns them so the conflict banner and its "use latest"
 * button see every field at once.
 */
function useOfficeShapeFormatDrafts() {
  const [map, setMap] = useState<Readonly<Record<string, DraftEntry>>>({});
  const entries: Record<string, DraftEntry> = {};
  const draftFor = (id: string, sourceValue: string): AuthoritativeDraft => {
    let entry = map[id];
    if (!entry || entry.source !== sourceValue) {
      const next: DraftEntry =
        !entry || entry.value === entry.baseline || sourceValue === entry.value
          ? { baseline: sourceValue, source: sourceValue, value: sourceValue }
          : { ...entry, source: sourceValue };
      // Sync during render, once per source change (the guard keeps it idempotent).
      setMap((current) =>
        current[id]?.source === sourceValue ? current : { ...current, [id]: next },
      );
      entry = next;
    }
    entries[id] = entry;
    const write = (patch: (current: DraftEntry) => DraftEntry) =>
      setMap((current) => ({ ...current, [id]: patch(current[id] ?? entry) }));
    return {
      accept: () =>
        write((current) => ({
          baseline: current.value,
          source: sourceValue,
          value: current.value,
        })),
      conflict:
        sourceValue !== entry.baseline &&
        sourceValue !== entry.value &&
        entry.value !== entry.baseline,
      dirty: entry.value !== entry.baseline,
      reset: () =>
        write(() => ({ baseline: sourceValue, source: sourceValue, value: sourceValue })),
      setValue: (value) => write((current) => ({ ...current, value })),
      value: entry.value,
    };
  };
  return { draftFor, entries };
}

/** `wrapText` -> `Wrap text`, `outer-bottom-right` -> `Outer bottom right`. */
export function humanizeOfficeShapeFormatOption(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : value;
}

function ImmediateNumberField({
  field,
  prefix,
  writable,
}: {
  field: OfficeShapeFormatPaneNumberField;
  prefix: string;
  writable: boolean;
}) {
  const disabled = !writable || Boolean(field.disabled);
  return (
    <label className={styles.field}>
      <span>{field.label}</span>
      <span className={styles.numberRow}>
        <input
          aria-label={field.label}
          className={field.inputClassName}
          data-testid={`${prefix}-${field.id}`}
          disabled={disabled}
          max={field.max}
          min={field.min}
          onChange={(event) => {
            if (!disabled) field.onCommit(event.target.value);
          }}
          step={field.step}
          title={disabled ? field.disabledReason : undefined}
          type="number"
          value={field.value}
        />
        {field.unit ? (
          <span className={styles.unit} data-testid={`${prefix}-${field.id}-unit`}>
            {field.unit}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function DraftField({
  field,
  prefix,
  writable,
  draft,
  conflictId,
}: {
  field: OfficeShapeFormatPaneNumberField | OfficeShapeFormatPaneTextField;
  prefix: string;
  writable: boolean;
  draft: AuthoritativeDraft;
  conflictId: string;
}) {
  const disabled = !writable || Boolean(field.disabled);
  const invalid =
    field.kind === "number" && draft.dirty ? (field.invalidReason?.(draft.value) ?? null) : null;
  const invalidId = `${prefix}-${field.id}-invalid`;
  // The value a press already committed: the blur that follows the press
  // (before the pane re-renders) must not commit it a second time.
  const committedRef = useRef<string | null>(null);
  const commit = () => {
    if (disabled || draft.conflict || !draft.dirty) return;
    const next =
      field.kind === "text" && field.sanitize
        ? field.sanitize(draft.value)
        : draft.value;
    if (committedRef.current === next) return;
    if (next !== draft.value) draft.setValue(next);
    if (field.onCommit(next)) {
      committedRef.current = next;
      draft.accept();
    }
  };
  // A press outside the pane while this field holds a typed value commits it
  // first, to the object it was typed for: a click on another slide or
  // object changed the selection before the blur, and the blur then found
  
  // inside the pane is left to the blur (its Cancel drops the draft).
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!draft.dirty || disabled) return;
    const onPointerDown = (event: PointerEvent) => {
      const input = inputRef.current;
      if (!input || document.activeElement !== input) return;
      const pane = input.closest("[data-office-task-pane]") ?? input;
      if (event.target instanceof Node && pane.contains(event.target)) return;
      commitRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [draft.dirty, disabled]);
  const common = {
    ref: inputRef,
    "aria-describedby": draft.conflict ? conflictId : invalid ? invalidId : undefined,
    "aria-invalid": invalid ? true : undefined,
    "data-testid": `${prefix}-${field.id}`,
    disabled,
    title: disabled ? field.disabledReason : undefined,
    onBlur: commit,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      committedRef.current = null;
      draft.setValue(event.target.value);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape" && draft.dirty) {
        event.preventDefault();
        draft.reset();
      }
    },
    value: draft.value,
  };
  return (
    <label className={styles.field}>
      <span>{field.label}</span>
      {field.kind === "number" ? (
        <span className={styles.numberRow}>
          <input
            {...common}
            className={field.inputClassName}
            max={field.max}
            min={field.min}
            placeholder={field.placeholder}
            step={field.step}
            type="number"
          />
          {field.unit ? (
            <span className={styles.unit} data-testid={`${prefix}-${field.id}-unit`}>
              {field.unit}
            </span>
          ) : null}
        </span>
      ) : (
        <input
          {...common}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          type="text"
        />
      )}
      {invalid ? (
        <span id={invalidId} role="alert" className={styles.invalid} data-testid={invalidId}>
          {invalid}
        </span>
      ) : null}
    </label>
  );
}

function TextareaField({
  field,
  prefix,
  writable,
  draft,
  conflictId,
  labels,
  discardDrafts,
}: {
  field: OfficeShapeFormatPaneTextareaField;
  prefix: string;
  writable: boolean;
  draft: AuthoritativeDraft;
  conflictId: string;
  labels: OfficeShapeFormatPaneLabels;
  /** Drops every typed value the pane has not applied yet. */
  discardDrafts: () => void;
}) {
  const disabled = !writable || Boolean(field.disabled);
  return (
    <>
      <label className={styles.field}>
        <span>{field.label}</span>
        <textarea
          aria-describedby={draft.conflict ? conflictId : undefined}
          data-testid={`${prefix}-${field.id}-input`}
          disabled={disabled}
          maxLength={field.maxLength}
          onChange={(event) => draft.setValue(event.target.value)}
          rows={field.rows ?? 6}
          title={disabled ? field.disabledReason : undefined}
          value={draft.value}
        />
      </label>
      <div className={styles.actions}>
        <button
          data-testid={`${prefix}-${field.id}-apply`}
          disabled={disabled || draft.conflict}
          onClick={() => {
            if (disabled || draft.conflict) return;
            if (field.onCommit(draft.value)) draft.accept();
          }}
          title={disabled ? field.disabledReason : undefined}
          type="button"
        >
          <Check size={16} aria-hidden />
          {labels.apply}
        </button>
        <button
          data-testid={`${prefix}-${field.id}-cancel`}
          // Pressing Cancel must not take the focus first: the field being
          // typed in would be left, and leaving a field applies its value,
          // so Cancel applied the very height it was meant to drop (user
          // audit S-009). The focus stays put and Cancel drops every value
          // not yet applied, this paragraph's and a field's mid-typing.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            draft.reset();
            discardDrafts();
          }}
          type="button"
        >
          <X size={16} aria-hidden />
          {labels.cancel}
        </button>
      </div>
    </>
  );
}

function Field({
  field,
  prefix,
  writable,
  draft,
  conflictId,
  labels,
  discardDrafts,
}: {
  field: OfficeShapeFormatPaneField;
  prefix: string;
  writable: boolean;
  /** The pane-owned draft of a number, text or textarea field. */
  draft?: AuthoritativeDraft;
  conflictId: string;
  labels: OfficeShapeFormatPaneLabels;
  discardDrafts: () => void;
}) {
  if (field.kind === "custom") {
    return <div data-testid={`${prefix}-${field.id}`}>{field.render}</div>;
  }
  const disabled = !writable || Boolean(field.disabled);
  const reason = disabled ? field.disabledReason : undefined;
  switch (field.kind) {
    case "color": {
      const off = field.value === "none";
      return (
        <label className={styles.field}>
          <span>{field.label}</span>
          <span className={styles.row}>
            <input
              aria-label={field.label}
              data-testid={`${prefix}-${field.id}`}
              disabled={disabled || off}
              onChange={(event) => field.onChange(event.target.value)}
              title={reason}
              type="color"
              value={off ? (field.fallback ?? "#ffffff") : field.value}
            />
            {field.none ? (
              <label className={styles.check}>
                <input
                  checked={off}
                  data-testid={field.none.testId ?? `${prefix}-${field.id}-none`}
                  disabled={disabled}
                  onChange={(event) =>
                    field.onChange(event.target.checked ? "none" : field.none!.restore)
                  }
                  title={reason}
                  type="checkbox"
                />
                {field.none.label}
              </label>
            ) : null}
            {field.extra}
          </span>
        </label>
      );
    }
    case "select":
      return (
        <label className={styles.field}>
          <span>{field.label}</span>
          <select
            data-testid={`${prefix}-${field.id}`}
            disabled={disabled}
            onChange={(event) => field.onChange(event.target.value)}
            title={reason}
            value={field.value}
          >
            {field.options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                title={option.title}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "checkbox":
      return (
        <label className={styles.check}>
          <input
            checked={field.checked}
            data-testid={`${prefix}-${field.id}`}
            disabled={disabled}
            onChange={(event) => field.onChange(event.target.checked)}
            title={reason}
            type="checkbox"
          />
          {field.label}
        </label>
      );
    case "number":
      if (field.immediate) {
        return <ImmediateNumberField field={field} prefix={prefix} writable={writable} />;
      }
      return draft ? (
        <DraftField
          field={field}
          prefix={prefix}
          writable={writable}
          draft={draft}
          conflictId={conflictId}
        />
      ) : null;
    case "text":
      return draft ? (
        <DraftField
          field={field}
          prefix={prefix}
          writable={writable}
          draft={draft}
          conflictId={conflictId}
        />
      ) : null;
    case "textarea":
      return draft ? (
        <TextareaField
          field={field}
          prefix={prefix}
          writable={writable}
          draft={draft}
          conflictId={conflictId}
          labels={labels}
          discardDrafts={discardDrafts}
        />
      ) : null;
    case "buttons":
      return (
        <div className={styles.buttonList} data-testid={`${prefix}-${field.id}`}>
          {field.buttons.length ? (
            field.buttons.map((button) => (
              <button
                key={button.id}
                data-testid={`${prefix}-${field.id}-${button.id}`}
                disabled={disabled || Boolean(button.disabled)}
                onClick={() => {
                  if (disabled || button.disabled) return;
                  button.onSelect();
                }}
                title={reason}
                type="button"
              >
                {button.icon}
                {button.label}
              </button>
            ))
          ) : (
            <span data-testid={field.emptyTestId ?? `${prefix}-${field.id}-empty`}>
              {field.emptyLabel}
            </span>
          )}
        </div>
      );
  }
}

/**
 * The pane's sections alone, for a host whose pane is its own (Docs' Format
 * Picture): the same fields, drafts and test ids, so a section the shared
 * builders make (officeEffectsPaneSections) draws one way everywhere.
 */
export function OfficeShapeFormatPaneSections({
  sections,
  labels,
  testIdPrefix,
  writable,
}: {
  sections: readonly OfficeShapeFormatPaneSection[];
  labels: OfficeShapeFormatPaneLabels;
  testIdPrefix: string;
  writable: boolean;
}) {
  const { draftFor } = useOfficeShapeFormatDrafts();
  const conflictId = `${testIdPrefix}-draft-conflict`;
  const drafts = new Map<string, AuthoritativeDraft>();
  for (const section of sections) {
    for (const field of section.fields) {
      if ((field.kind === "number" && !field.immediate) || field.kind === "text" || field.kind === "textarea") {
        drafts.set(field.id, draftFor(field.id, String(field.value)));
      }
    }
  }
  const discardDrafts = () => {
    for (const draft of drafts.values()) if (draft.dirty) draft.reset();
  };
  return (
    <>
      {sections.map((section) => (
        <fieldset
          className={styles.section}
          data-format-section={section.id}
          data-testid={section.testId ?? `${testIdPrefix}-section-${section.id}`}
          key={section.id}
        >
          {section.title ? <legend>{section.title}</legend> : null}
          {section.hint ? <p className={styles.hint}>{section.hint}</p> : null}
          {section.fields.map((field) => (
            <Field
              conflictId={conflictId}
              discardDrafts={discardDrafts}
              draft={drafts.get(field.id)}
              field={field}
              key={field.id}
              labels={labels}
              prefix={testIdPrefix}
              writable={writable}
            />
          ))}
        </fieldset>
      ))}
    </>
  );
}

export function OfficeShapeFormatPane({
  testIdPrefix,
  rootTestId,
  dataAttributes,
  dockTabs,
  dockTabsLabel,
  labels,
  tabs,
  initialTab,
  requestedTab,
  writable,
  onClose,
  headerActions,
  className,
  dockRight,
  titleId,
  closeControlId,
  controlId,
  hidden,
  paneRef,
  style,
}: OfficeShapeFormatPaneProps) {
  const [selected, setSelected] = useState(
    requestedTab?.id ?? initialTab ?? tabs[0]?.id ?? "shape",
  );
  const [seenRequest, setSeenRequest] = useState(requestedTab?.serial);
  if (requestedTab && requestedTab.serial !== seenRequest) {
    setSeenRequest(requestedTab.serial);
    if (tabs.some((entry) => entry.id === requestedTab.id)) setSelected(requestedTab.id);
  }
  const tab = tabs.find((entry) => entry.id === selected) ?? tabs[0];
  const conflictId = `${testIdPrefix}-draft-conflict`;
  const bodyRef = useRef<HTMLDivElement>(null);
  useRevealOfficeShapeFormatPaneSection(bodyRef, requestedTab);

  const { draftFor } = useOfficeShapeFormatDrafts();
  // The typed fields on the selected tab are drafted here, in the pane's own
  // render, so the conflict banner sees them all; a field off the tab keeps
  // its draft untouched.
  const drafts = new Map<string, AuthoritativeDraft>();
  for (const section of tab?.sections ?? []) {
    for (const field of section.fields) {
      if (
        (field.kind === "number" && !field.immediate) ||
        field.kind === "text" ||
        field.kind === "textarea"
      ) {
        drafts.set(field.id, draftFor(field.id, String(field.value)));
      }
    }
  }
  const conflicting = [...drafts.values()].filter((draft) => draft.conflict);
  const discardDrafts = () => {
    for (const draft of drafts.values()) if (draft.dirty) draft.reset();
  };
  const sections = (tab?.sections ?? []).map((section) => (
    <fieldset
      className={styles.section}
      data-format-section={section.id}
      data-testid={section.testId ?? `${testIdPrefix}-section-${section.id}`}
      key={section.id}
    >
      {section.title ? <legend>{section.title}</legend> : null}
      {section.hint ? <p className={styles.hint}>{section.hint}</p> : null}
      {section.fields.map((field) => (
        <Field
          conflictId={conflictId}
          discardDrafts={discardDrafts}
          draft={drafts.get(field.id)}
          field={field}
          key={field.id}
          labels={labels}
          prefix={testIdPrefix}
          writable={writable}
        />
      ))}
    </fieldset>
  ));

  return (
    <OfficeTaskPane
      title={labels.title}
      closeLabel={labels.close}
      onClose={onClose}
      testIdPrefix={testIdPrefix}
      testId={rootTestId ?? testIdPrefix}
      closeTestId={rootTestId ? `${rootTestId}-close` : `${testIdPrefix}-close`}
      tabs={dockTabs}
      tabsLabel={dockTabsLabel}
      titleId={titleId}
      controlId={controlId}
      closeControlId={closeControlId}
      headerActions={headerActions}
      hidden={hidden}
      dockRight={dockRight}
      className={[styles.pane, className].filter(Boolean).join(" ")}
      paneRef={paneRef}
      style={style}
      dataAttributes={{ ...dataAttributes, "data-office-format-pane": "", "data-read-only": writable ? "false" : "true" }}
    >
      {tabs.length > 1 ? (
        <div className={styles.tabs} role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              aria-selected={entry.id === tab?.id}
              className={styles.tab}
              data-testid={`${testIdPrefix}-tab-${entry.id}`}
              onClick={() => setSelected(entry.id)}
              role="tab"
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      <div aria-disabled={!writable} className={styles.body} ref={bodyRef} role="group">
        {conflicting.length > 0 && labels.draftConflict && labels.useLatestDraft ? (
          <div
            className={styles.conflict}
            data-testid={conflictId}
            id={conflictId}
            role="alert"
          >
            <span>{labels.draftConflict}</span>
            <button
              data-testid={`${testIdPrefix}-draft-use-latest`}
              onClick={() => {
                for (const draft of conflicting) draft.reset();
              }}
              type="button"
            >
              {labels.useLatestDraft}
            </button>
          </div>
        ) : null}
        {sections}
      </div>
    </OfficeTaskPane>
  );
}
