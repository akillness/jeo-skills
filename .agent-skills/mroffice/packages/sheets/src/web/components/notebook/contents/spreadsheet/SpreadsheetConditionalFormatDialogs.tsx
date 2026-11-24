"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Home > Conditional Formatting > Manage Rules… and New Rule…, as Excel lays
 * them out (Microsoft Support: "Manage conditional formatting rule
 * precedence", "Use conditional formatting to highlight information").
 *
 * - Conditional Formatting Rules Manager: "Show formatting rules for", the
 *   New / Edit / Delete / Duplicate / Move Up / Move Down toolbar, and one row
 *   per rule in precedence order with its Format preview, an editable
 *   Applies to reference (with a collapse-dialog range picker) and Stop If
 *   True. Every change is staged in the dialog; OK and Apply write the whole
 *   collection as one worksheet edit (one Undo step), Cancel writes nothing.
 * - New / Edit Formatting Rule: the six rule types and the rule description
 *   pane for each, a Preview, and Format… opening the shared Format Cells
 *   dialog in its conditional-format mode.
 *
 * The dialog owns no worksheet logic: rules are built by the model
 * (lib/spreadsheet/conditional-rule-draft.ts → buildRule), and the window
 * decides whether a collection may be written (protection, the original-file
 * write-back gates) through `onCommit`.
 */

import { containDialogTab } from "@mrnote/core/web/lib/dialog-tab-containment.ts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  ChevronDown,
  ChevronUp,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  officeDialogParts as dialogParts,
  spreadsheetDialogClassName,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";

import FormatCellsDialog, {
  type FormatCellsResult,
  type FormatCellsStyle,
} from "../FormatCellsDialog";
import { ColorPalettePopover } from "../../../../lib/spreadsheet/ColorPalettePopover";
import type { BorderLineStyle, CellBorderEdges } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import {
  applyDifferentialCss,
  conditionalRuleSupportsStopIfTrue,
  ICON_SET_FAMILIES,
  iconSetCount,
  isClassicNativeConditionalRuleEditable,
  MAX_CONDITIONAL_FORMATS,
  newConditionalRuleCopy,
  ruleOverlaps,
  type ConditionalDifferentialStyle,
  type ConditionalFormatRule,
  type ConditionalOperator,
  type ConditionalRange,
  type ConditionalRuleKind,
  type DateOccurringPeriod,
  type IconSetName,
  type IconThresholdType,
  type TextMatchOperator,
} from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import {
  CONDITIONAL_AVERAGE_OPTIONS,
  CONDITIONAL_CELL_VALUE_OPERATORS,
  CONDITIONAL_CONTAIN_SUBJECTS,
  CONDITIONAL_DATE_PERIODS,
  CONDITIONAL_RULE_TYPES,
  CONDITIONAL_VALUE_FORMAT_STYLES,
  conditionalDraftKind,
  conditionalFormatIsSet,
  conditionalRuleAppliesTo,
  conditionalRuleDraftForRibbon,
  conditionalRuleDraftFromRule,
  conditionalRuleFormat,
  conditionalRuleFromDraft,
  conditionalThresholdTypes,
  createConditionalRuleId,
  defaultConditionalRuleDraft,
  formatConditionalAppliesTo,
  parseConditionalAppliesTo,
  withConditionalFormatStyle,
  withConditionalIconSet,
  withConditionalRuleAreas,
  type ConditionalAverageOption,
  type ConditionalContainSubject,
  type ConditionalRibbonRuleDraft,
  type ConditionalRuleDraft,
  type ConditionalRuleTypeId,
  type ConditionalThresholdDraft,
  type ConditionalThresholdType,
  type ConditionalValueFormatStyle,
} from "@mrnote/core/web/lib/spreadsheet/conditional-rule-draft.ts";
import { MAX_GRID_COLUMNS, MAX_GRID_ROWS } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import {
  selectionStatisticsSync,
  type SelectionStatisticsSource,
} from "../../../../lib/spreadsheet/selection-statistics";
import {
  SpreadsheetCollapseDialogButton,
  SpreadsheetRangePickerBar,
} from "./SpreadsheetRangePicker";
import styles from "./SpreadsheetConditionalFormatDialogs.module.css";
import { CONDITIONAL_RULE_TYPE_ICON, SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

type Translate = ReturnType<typeof useTranslations>;

/** Which dialog the window asked for. */
export type SpreadsheetConditionalDialogRequest =
  | { readonly kind: "manager" }
  | { readonly kind: "newRule"; readonly draft?: ConditionalRuleDraft }
  /** Home > Conditional Formatting > Highlight Cells / Top-Bottom entries:
   * Excel's small per-rule dialog (a value and a preset format). */
  | { readonly kind: "quickRule"; readonly entry: ConditionalRibbonRuleDraft };

export type SpreadsheetConditionalCommitAction = "add" | "manage";

export interface SpreadsheetConditionalFormatDialogsProps {
  readonly request: SpreadsheetConditionalDialogRequest;
  /** The active sheet's rules, in precedence order (index 0 applies first). */
  readonly rules: readonly ConditionalFormatRule[];
  /** Every other worksheet, for Excel's per-sheet "Show formatting rules for". */
  readonly otherSheets: readonly {
    readonly id: string;
    readonly name: string;
    readonly rules: readonly ConditionalFormatRule[];
  }[];
  readonly sheetName: string;
  readonly selection: ConditionalRange;
  /** An imported workbook written back into its own package. */
  readonly patchback: boolean;
  /** The sheet's conditional formatting cannot be rewritten at all. */
  readonly sheetNativeBlocked: boolean;
  /** Whether a rule of this kind can be written by this workbook's route. */
  readonly kindWritable: (kind: ConditionalRuleKind) => boolean;
  /** The window's refusal for the last write, if any. */
  readonly error: string | null;
  readonly onDismissError: () => void;
  /** Write `nextRules` over `baseRules`; false when the write was refused. */
  readonly onCommit: (
    action: SpreadsheetConditionalCommitAction,
    baseRules: readonly ConditionalFormatRule[],
    nextRules: readonly ConditionalFormatRule[],
  ) => boolean;
  readonly onClose: () => void;
  /** The shared dimmer looks for modal cards; the range picker hides ours. */
  readonly onModalChange?: () => void;
  /** Highlight Cells / Top-Bottom quick dialogs: the rule the dialog would
   * add right now (null when its draft does not build), for the window to
   * preview on the selection; null again when the dialog closes. */
  readonly onPreview?: (rule: ConditionalFormatRule | null) => void;
  /** The selection as the status bar reads it, and the active cell's value:
   * the Highlight Cells quick dialogs pre-fill their boxes from them. */
  readonly selectionStatistics?: SelectionStatisticsSource;
  readonly activeCellValue?: unknown;
  readonly renderIcon: (
    iconSet: IconSetName,
    index: number,
    count: 3 | 4 | 5,
  ) => ReactNode;
  readonly paletteId?: string;
}

// ── Format helpers ───────────────────────────────────────────────────────────

const CSS_BORDER_STYLE: Partial<Record<BorderLineStyle, string>> = {
  hair: "dotted",
  dotted: "dotted",
  dashed: "dashed",
  dashDot: "dashed",
  dashDotDot: "dashed",
  mediumDashed: "dashed",
  mediumDashDot: "dashed",
  mediumDashDotDot: "dashed",
  slantDashDot: "dashed",
  double: "double",
};

/** The Preview / Format column sample: the rule's format drawn on a cell. */
function sampleStyle(format: ConditionalDifferentialStyle): CSSProperties {
  const css = applyDifferentialCss({}, format);
  const out: CSSProperties = {
    color: css.color,
    backgroundColor: css.backgroundColor,
    backgroundImage: css.backgroundImage,
    fontWeight: css.fontWeight,
    fontStyle: css.fontStyle,
    textDecoration: css.textDecoration,
    fontFamily: css.fontFamily,
  };
  const edges = format.borderEdges ?? {};
  for (const [edge, key] of [
    ["top", "borderTop"],
    ["right", "borderRight"],
    ["bottom", "borderBottom"],
    ["left", "borderLeft"],
  ] as const) {
    const line = edges[edge];
    if (!line) continue;
    out[key] = `1px ${CSS_BORDER_STYLE[line.style] ?? "solid"} ${line.color ?? "#000000"}`;
  }
  return out;
}

/** The rule's format as Format Cells shows it. */
function formatCellsStyleOf(format: ConditionalDifferentialStyle): FormatCellsStyle {
  return {
    ...(format.textColor ? { color: format.textColor } : {}),
    ...(format.backgroundColor ? { backgroundColor: format.backgroundColor } : {}),
    ...(format.gradientFill ? { gradientFill: format.gradientFill } : {}),
    // An explicit false (Regular over a bold cell) is a stated format too.
    ...(format.bold !== undefined ? { bold: format.bold } : {}),
    ...(format.italic !== undefined ? { italic: format.italic } : {}),
    ...(format.strikethrough ? { strikethrough: true } : {}),
    ...(format.underline === "single" || format.underline === "double"
      ? {
          underline: true,
          ...(format.underline === "double" ? { underlineStyle: "double" as const } : {}),
        }
      : {}),
    ...(format.borderEdges ? { borderEdges: format.borderEdges } : {}),
  };
}

/** Fold what Format Cells changed into the rule's format; untouched members
 * (theme slots, font extras an imported rule carries) stay as they were. */
function applyFormatCellsResult(
  format: ConditionalDifferentialStyle,
  result: FormatCellsResult,
): ConditionalDifferentialStyle {
  const next: ConditionalDifferentialStyle = { ...format };
  const patch = result.style;
  const has = (key: keyof FormatCellsStyle) =>
    Object.prototype.hasOwnProperty.call(patch, key);
  if (result.formatCode !== undefined) {
    if (result.formatCode === "General" || result.formatCode === "") {
      delete next.numberFormat;
    } else {
      next.numberFormat = result.formatCode;
    }
  }
  if (has("color")) {
    delete next.textThemeColor;
    if (patch.color) next.textColor = patch.color;
    else delete next.textColor;
  }
  if (has("backgroundColor") || has("fillPattern") || has("gradientFill")) {
    delete next.backgroundThemeColor;
    delete next.gradientFill;
    const color = patch.fillPattern?.backgroundColor ?? patch.backgroundColor;
    if (color) next.backgroundColor = color;
    else delete next.backgroundColor;
  }
  for (const key of ["bold", "italic", "strikethrough"] as const) {
    if (!has(key)) continue;
    // Three states: on, explicitly off (B495: Regular cancels the cell's own
    // bold), and not stated (the cell's font shows through).
    if (patch[key]) next[key] = true;
    else if (patch[key] === false) next[key] = false;
    else delete next[key];
  }
  if (has("underline") || has("underlineStyle")) {
    if (patch.underline) {
      next.underline = patch.underlineStyle === "double" ? "double" : "single";
    } else {
      delete next.underline;
    }
  }
  const edges: CellBorderEdges = { ...(next.borderEdges ?? {}) };
  let bordersTouched = false;
  // A rule's format borders each matching cell on its own: the Border tab's
  // perimeter lines are that cell's four sides (XLS-A060).
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const change = result.borderLinesPatch?.[edge];
    if (!change) continue;
    bordersTouched = true;
    if (change.style === null) {
      delete edges[edge];
      continue;
    }
    edges[edge] = {
      style: change.style,
      ...(change.color ? { color: change.color } : {}),
    };
  }
  if (bordersTouched) {
    if (Object.keys(edges).length > 0) next.borderEdges = edges;
    else delete next.borderEdges;
  }
  return next;
}

const OPERATOR_SYMBOL: Record<ConditionalOperator, string> = {
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "=": "=",
  "!=": "<>",
  between: "",
  notBetween: "",
};

const OPERATOR_KEY: Record<ConditionalOperator, string> = {
  between: "between",
  notBetween: "notBetween",
  "=": "eq",
  "!=": "ne",
  ">": "gt",
  "<": "lt",
  ">=": "ge",
  "<=": "le",
};

/** The Rules Manager's "Rule (applied in order shown)" text. */
export function describeConditionalRuleForManager(
  rule: ConditionalFormatRule,
  t: Translate,
): string {
  const draft = conditionalRuleDraftFromRule(rule);
  switch (draft.type) {
    case "allValues":
      return t(
        draft.formatStyle === "dataBar"
          ? "spreadsheet.cfDialog.describe.dataBar"
          : draft.formatStyle === "iconSet"
            ? "spreadsheet.cfDialog.describe.iconSet"
            : "spreadsheet.cfDialog.describe.colorScale",
      );
    case "cellsThatContain":
      switch (draft.subject) {
        case "cellValue":
          if (draft.operator === "between" || draft.operator === "notBetween") {
            return t(
              draft.operator === "between"
                ? "spreadsheet.cfDialog.describe.cellValueBetween"
                : "spreadsheet.cfDialog.describe.cellValueNotBetween",
              { a: draft.value1, b: draft.value2 },
            );
          }
          return `${t("spreadsheet.cfDialog.describe.cellValue")} ${OPERATOR_SYMBOL[draft.operator]} ${draft.value1}`;
        case "specificText":
          return t(`spreadsheet.cfDialog.describe.text_${draft.textOperator}`, {
            text: draft.text,
          });
        case "datesOccurring":
          return t("spreadsheet.cfDialog.describe.dates", {
            period: t(`spreadsheet.conditionalPeriod_${draft.period}`),
          });
        default:
          return t(`spreadsheet.cfDialog.describe.${draft.subject}`);
      }
    case "topBottom":
      return t(
        `spreadsheet.cfDialog.describe.${draft.bottom ? "bottom" : "top"}${draft.percent ? "Percent" : ""}`,
        { n: draft.rank },
      );
    case "aboveBelowAverage": {
      const std = /^stdDev(\d)(Above|Below)$/.exec(draft.average);
      if (std) {
        return t(`spreadsheet.cfDialog.describe.stdDev${std[2]}`, { n: std[1] });
      }
      return t(`spreadsheet.cfDialog.describe.${draft.average}`);
    }
    case "uniqueDuplicate":
      return t(
        draft.unique
          ? "spreadsheet.cfDialog.describe.unique"
          : "spreadsheet.cfDialog.describe.duplicate",
      );
    case "formula":
    default:
      return `${t("spreadsheet.cfDialog.describe.formula")} ${draft.formula}`;
  }
}

// ── Small controls ───────────────────────────────────────────────────────────

const POPOVER_Z_INDEX = 90;

function ColorButton({
  value,
  label,
  testId,
  paletteId,
  disabled,
  onPick,
}: {
  readonly value: string;
  readonly label: string;
  readonly testId: string;
  readonly paletteId?: string;
  readonly disabled?: boolean;
  readonly onPick: (color: string) => void;
}) {
  const t = useTranslations("console-notebooks");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={anchorRef}
        type="button"
        className={`${dialogParts.compactButton} ${styles.swatchButton}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        data-testid={testId}
      >
        <span aria-hidden="true" className={styles.swatch} style={{ background: value }} />
        <ChevronDown aria-hidden="true" size={12} />
      </button>
      {open ? (
        <ColorPalettePopover
          anchorRef={anchorRef}
          zIndex={POPOVER_Z_INDEX}
          value={value}
          labels={{
            automatic: t("toolbar.textColorAutomatic"),
            themeColors: t("spreadsheet.themeColors"),
            standardColors: t("spreadsheet.standardColors"),
            recentColors: t("spreadsheet.recentColors"),
            moreColors: t("spreadsheet.moreColors"),
          }}
          testIdPrefix={`${testId}-palette`}
          paletteId={paletteId}
          onDismiss={() => setOpen(false)}
          onPick={(color) => {
            if (color) onPick(color);
            setOpen(false);
          }}
        />
      ) : null}
    </span>
  );
}

function FormatSample({
  format,
  testId,
}: {
  readonly format: ConditionalDifferentialStyle;
  readonly testId: string;
}) {
  const t = useTranslations("console-notebooks");
  const set = conditionalFormatIsSet(format);
  return (
    <span
      className={`${styles.sample} ${set ? "" : styles.sampleEmpty}`}
      style={set ? sampleStyle(format) : undefined}
      data-testid={testId}
    >
      {set ? t("spreadsheet.cfDialog.sample") : t("spreadsheet.cfDialog.noFormat")}
    </span>
  );
}

/** The Rules Manager's Format column: what the rule paints. */
function RuleFormatPreview({
  rule,
  renderIcon,
}: {
  readonly rule: ConditionalFormatRule;
  readonly renderIcon: SpreadsheetConditionalFormatDialogsProps["renderIcon"];
}) {
  if (rule.kind === "colorScale") {
    const stops = [rule.min.color, rule.mid?.color, rule.max.color].filter(Boolean);
    return (
      <span
        className={styles.sample}
        data-testid="spreadsheet-conditional-rule-format"
        style={{ backgroundImage: `linear-gradient(90deg, ${stops.join(", ")})` }}
      />
    );
  }
  if (rule.kind === "dataBar") {
    return (
      <span
        className={styles.sample}
        data-testid="spreadsheet-conditional-rule-format"
        style={{ justifyContent: "flex-start" }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "70%",
            height: "100%",
            background:
              rule.gradient === false
                ? rule.color
                : `linear-gradient(90deg, ${rule.color}, #ffffff)`,
          }}
        />
      </span>
    );
  }
  if (rule.kind === "iconSet") {
    const count = iconSetCount(rule.iconSet);
    return (
      <span
        className={`${styles.sample} ${styles.iconRow}`}
        data-testid="spreadsheet-conditional-rule-format"
      >
        {Array.from({ length: count }, (_, slot) => (
          <span key={slot} aria-hidden="true">
            {renderIcon(rule.iconSet, count - 1 - slot, count)}
          </span>
        ))}
      </span>
    );
  }
  return (
    <FormatSample
      format={conditionalRuleFormat(rule)}
      testId="spreadsheet-conditional-rule-format"
    />
  );
}

// ── New / Edit Formatting Rule ───────────────────────────────────────────────

const PROBLEM_KEYS = {
  value: "spreadsheet.cfDialog.problem.value",
  text: "spreadsheet.cfDialog.problem.text",
  formula: "spreadsheet.cfDialog.problem.formula",
  formulaSyntax: "spreadsheet.cfDialog.problem.formulaSyntax",
  rank: "spreadsheet.cfDialog.problem.rank",
  threshold: "spreadsheet.cfDialog.problem.threshold",
  format: "spreadsheet.cfDialog.problem.format",
  invalid: "spreadsheet.cfDialog.problem.invalid",
} as const;

interface RuleEditorProps {
  readonly mode: "new" | "edit";
  readonly initialDraft: ConditionalRuleDraft;
  readonly areas: readonly ConditionalRange[];
  readonly previous: ConditionalFormatRule | null;
  readonly patchback: boolean;
  readonly kindWritable: (kind: ConditionalRuleKind) => boolean;
  readonly error: string | null;
  readonly renderIcon: SpreadsheetConditionalFormatDialogsProps["renderIcon"];
  readonly paletteId?: string;
  /** Returns an error message, or null when the rule was accepted. */
  readonly onOk: (rule: ConditionalFormatRule) => string | null;
  readonly onCancel: () => void;
}

const POSITION_LABEL_KEYS = {
  min: "spreadsheet.cfDialog.minimum",
  mid: "spreadsheet.cfDialog.midpoint",
  max: "spreadsheet.cfDialog.maximum",
} as const;

/** A threshold's Type list; switching away from an endpoint seeds a value. */
function ThresholdTypeSelect({
  position,
  draft,
  onChange,
  testIdPrefix,
  family = "scale",
}: {
  readonly position: "min" | "mid" | "max";
  readonly draft: ConditionalThresholdDraft;
  readonly onChange: (next: ConditionalThresholdDraft) => void;
  readonly testIdPrefix: string;
  readonly family?: "scale" | "bar";
}) {
  const t = useTranslations("console-notebooks");
  return (
    <select
      className={styles.select}
      value={draft.type}
      aria-label={`${t(POSITION_LABEL_KEYS[position])} ${t("spreadsheet.cfDialog.typeLabel")}`}
      onChange={(event) => {
        const type = event.target.value as ConditionalThresholdType;
        const wasEndpoint =
          draft.type === "min" || draft.type === "max" || draft.type === "automatic";
        onChange({
          type,
          value:
            type === "min" || type === "max" || type === "automatic"
              ? ""
              : !wasEndpoint
                ? draft.value
                : type === "formula"
                  ? "="
                  : position === "max"
                    ? "100"
                    : "0",
        });
      }}
      data-testid={`${testIdPrefix}-${position}-type`}
    >
      {conditionalThresholdTypes(position, family).map((type) => (
        <option key={type} value={type}>
          {t(`spreadsheet.cfDialog.threshold.${type}`)}
        </option>
      ))}
    </select>
  );
}

/** A threshold's Value box, greyed and naming the endpoint for Lowest /
 * Highest Value as Excel shows it. */
function ThresholdValueInput({
  position,
  draft,
  onChange,
  testIdPrefix,
}: {
  readonly position: "min" | "mid" | "max";
  readonly draft: ConditionalThresholdDraft;
  readonly onChange: (next: ConditionalThresholdDraft) => void;
  readonly testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const endpoint =
    draft.type === "min" || draft.type === "max" || draft.type === "automatic";
  return (
    <input
      className={styles.input}
      type="text"
      disabled={endpoint}
      value={
        endpoint ? `(${t(`spreadsheet.cfDialog.threshold.${draft.type}`)})` : draft.value
      }
      aria-label={`${t(POSITION_LABEL_KEYS[position])} ${t("spreadsheet.cfDialog.valueLabel")}`}
      onChange={(event) => onChange({ ...draft, value: event.target.value })}
      data-testid={`${testIdPrefix}-${position}-value`}
    />
  );
}

function RuleEditor({
  mode,
  initialDraft,
  areas,
  previous,
  patchback,
  kindWritable,
  error,
  renderIcon,
  paletteId,
  onOk,
  onCancel,
}: RuleEditorProps) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<ConditionalRuleDraft>(initialDraft);
  const [problem, setProblem] = useState<string | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const typeListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    typeListRef.current
      ?.querySelector<HTMLButtonElement>("[aria-selected='true']")
      ?.focus({ preventScroll: true });
  }, []);

  const update = (patch: Partial<ConditionalRuleDraft>) => {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const updateScale = (
    position: "min" | "mid" | "max",
    next: ConditionalThresholdDraft,
  ) =>
    update({
      scale: { ...draft.scale, [position]: { ...draft.scale[position], ...next } },
    });
  const kind = conditionalDraftKind(draft);
  const writable = kindWritable(kind);

  const submit = () => {
    if (!writable) return;
    const built = conditionalRuleFromDraft(draft, areas, { previous, patchback });
    if (!built.ok) {
      setProblem(t(PROBLEM_KEYS[built.problem]));
      return;
    }
    const refusal = onOk(built.rule);
    if (refusal) setProblem(refusal);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (containDialogTab(event, dialogRef.current)) return;
    if (
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      event.target instanceof HTMLInputElement &&
      event.target.type === "text"
    ) {
      event.preventDefault();
      submit();
    }
  };

  const moveType = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = CONDITIONAL_RULE_TYPES[
      (index + delta + CONDITIONAL_RULE_TYPES.length) % CONDITIONAL_RULE_TYPES.length
    ];
    update({ type: next });
    requestAnimationFrame(() =>
      typeListRef.current
        ?.querySelector<HTMLButtonElement>(`[data-rule-type='${next}']`)
        ?.focus({ preventScroll: true }),
    );
  };

  const iconCount = iconSetCount(draft.icon.set);
  const scaleColumns = draft.formatStyle === "threeColorScale" ? 3 : 2;
  const scalePositions: ("min" | "mid" | "max")[] =
    scaleColumns === 3 ? ["min", "mid", "max"] : ["min", "max"];

  const allValuesPane = (
    <>
      <span className={styles.heading}>{t("spreadsheet.cfDialog.allValuesHeading")}</span>
      <span className={styles.row}>
        <label className={styles.label} htmlFor="cf-format-style">
          {t("spreadsheet.cfDialog.formatStyle")}
        </label>
        <select
          id="cf-format-style"
          className={styles.select}
          value={draft.formatStyle}
          onChange={(event) =>
            setDraft((current) =>
              withConditionalFormatStyle(
                current,
                event.target.value as ConditionalValueFormatStyle,
              ),
            )
          }
          data-testid="spreadsheet-conditional-format-style"
        >
          {CONDITIONAL_VALUE_FORMAT_STYLES.map((style) => (
            <option key={style} value={style}>
              {t(`spreadsheet.cfDialog.style.${style}`)}
            </option>
          ))}
        </select>
        {draft.formatStyle === "dataBar" ? (
          <label className={styles.label}>
            <input
              type="checkbox"
              checked={draft.bar.barOnly}
              onChange={(event) =>
                update({ bar: { ...draft.bar, barOnly: event.target.checked } })
              }
              data-testid="spreadsheet-conditional-bar-only"
            />{" "}
            {t("spreadsheet.cfDialog.barOnly")}
          </label>
        ) : null}
        {draft.formatStyle === "iconSet" ? (
          <label className={styles.label}>
            <input
              type="checkbox"
              checked={draft.icon.reverse}
              onChange={(event) =>
                update({ icon: { ...draft.icon, reverse: event.target.checked } })
              }
              data-testid="spreadsheet-conditional-icon-reverse"
            />{" "}
            {t("spreadsheet.cfDialog.reverseIcons")}
          </label>
        ) : null}
      </span>
      {draft.formatStyle === "twoColorScale" || draft.formatStyle === "threeColorScale" ? (
        <>
          <div
            className={styles.grid}
            style={{ "--cf-columns": scaleColumns } as CSSProperties}
            data-testid="spreadsheet-conditional-scale"
          >
            <span />
            {scalePositions.map((position) => (
              <span key={position} className={styles.heading}>
                {t(POSITION_LABEL_KEYS[position])}
              </span>
            ))}
            <span className={styles.label}>{t("spreadsheet.cfDialog.typeLabel")}</span>
            {scalePositions.map((position) => (
              <ThresholdTypeSelect
                key={position}
                position={position}
                draft={draft.scale[position]}
                testIdPrefix="spreadsheet-conditional-scale"
                onChange={(next) => updateScale(position, next)}
              />
            ))}
            <span className={styles.label}>{t("spreadsheet.cfDialog.valueLabel")}</span>
            {scalePositions.map((position) => (
              <ThresholdValueInput
                key={position}
                position={position}
                draft={draft.scale[position]}
                testIdPrefix="spreadsheet-conditional-scale"
                onChange={(next) => updateScale(position, next)}
              />
            ))}
            <span className={styles.label}>{t("spreadsheet.cfDialog.colorLabel")}</span>
            {scalePositions.map((position) => (
              <ColorButton
                key={position}
                value={draft.scale[position].color}
                label={`${t(POSITION_LABEL_KEYS[position])} ${t("spreadsheet.cfDialog.colorLabel")}`}
                testId={`spreadsheet-conditional-scale-${position}-color`}
                paletteId={paletteId}
                onPick={(color) =>
                  update({
                    scale: {
                      ...draft.scale,
                      [position]: { ...draft.scale[position], color },
                    },
                  })
                }
              />
            ))}
          </div>
          <span className={styles.row}>
            <span className={styles.label}>{t("spreadsheet.cfDialog.preview")}</span>
            <span
              className={styles.previewBar}
              style={{
                flex: 1,
                backgroundImage: `linear-gradient(90deg, ${scalePositions
                  .map((position) => draft.scale[position].color)
                  .join(", ")})`,
              }}
              data-testid="spreadsheet-conditional-preview"
            />
          </span>
        </>
      ) : null}
      {draft.formatStyle === "dataBar" ? (
        <>
          <div className={styles.grid} style={{ "--cf-columns": 2 } as CSSProperties}>
            <span />
            <span className={styles.heading}>{t("spreadsheet.cfDialog.minimum")}</span>
            <span className={styles.heading}>{t("spreadsheet.cfDialog.maximum")}</span>
            <span className={styles.label}>{t("spreadsheet.cfDialog.typeLabel")}</span>
            {(["min", "max"] as const).map((position) => (
              <ThresholdTypeSelect
                key={position}
                position={position}
                family="bar"
                draft={draft.bar[position]}
                testIdPrefix="spreadsheet-conditional-bar"
                onChange={(next) => update({ bar: { ...draft.bar, [position]: next } })}
              />
            ))}
            <span className={styles.label}>{t("spreadsheet.cfDialog.valueLabel")}</span>
            {(["min", "max"] as const).map((position) => (
              <ThresholdValueInput
                key={position}
                position={position}
                draft={draft.bar[position]}
                testIdPrefix="spreadsheet-conditional-bar"
                onChange={(next) => update({ bar: { ...draft.bar, [position]: next } })}
              />
            ))}
          </div>
          <span className={styles.heading}>{t("spreadsheet.cfDialog.barAppearance")}</span>
          <span className={styles.row}>
            <label className={styles.label} htmlFor="cf-bar-fill">
              {t("spreadsheet.cfDialog.fill")}
            </label>
            <select
              id="cf-bar-fill"
              className={styles.select}
              value={draft.bar.gradient ? "gradient" : "solid"}
              onChange={(event) =>
                update({ bar: { ...draft.bar, gradient: event.target.value === "gradient" } })
              }
              data-testid="spreadsheet-conditional-bar-fill"
            >
              <option value="solid">{t("spreadsheet.cfDialog.solidFill")}</option>
              <option value="gradient">{t("spreadsheet.cfDialog.gradientFill")}</option>
            </select>
            <span className={styles.label}>{t("spreadsheet.cfDialog.colorLabel")}</span>
            <ColorButton
              value={draft.bar.color}
              label={t("spreadsheet.cfDialog.colorLabel")}
              testId="spreadsheet-conditional-bar-color"
              paletteId={paletteId}
              onPick={(color) => update({ bar: { ...draft.bar, color } })}
            />
          </span>
          <span className={styles.row}>
            <span className={styles.label}>{t("spreadsheet.cfDialog.preview")}</span>
            <span
              className={styles.previewBar}
              style={{ flex: 1, display: "flex" }}
              data-testid="spreadsheet-conditional-preview"
            >
              <span
                style={{
                  width: "80%",
                  background: draft.bar.gradient
                    ? `linear-gradient(90deg, ${draft.bar.color}, #ffffff)`
                    : draft.bar.color,
                }}
              />
            </span>
          </span>
        </>
      ) : null}
      {draft.formatStyle === "iconSet" ? (
        <>
          <span className={styles.row}>
            <label className={styles.label} htmlFor="cf-icon-style">
              {t("spreadsheet.cfDialog.iconStyle")}
            </label>
            <select
              id="cf-icon-style"
              className={styles.select}
              value={draft.icon.set}
              onChange={(event) =>
                setDraft((current) =>
                  withConditionalIconSet(current, event.target.value as IconSetName),
                )
              }
              data-testid="spreadsheet-conditional-icon-set"
            >
              {ICON_SET_FAMILIES.map((family) => (
                <option key={family.name} value={family.name}>
                  {t(`spreadsheet.cfDialog.iconSet.${family.name}`)}
                </option>
              ))}
            </select>
            <span className={styles.iconRow} aria-hidden="true">
              {Array.from({ length: iconCount }, (_, slot) => (
                <span key={slot}>{renderIcon(draft.icon.set, iconCount - 1 - slot, iconCount)}</span>
              ))}
            </span>
            <label className={styles.label}>
              <input
                type="checkbox"
                checked={draft.icon.iconOnly}
                onChange={(event) =>
                  update({ icon: { ...draft.icon, iconOnly: event.target.checked } })
                }
                data-testid="spreadsheet-conditional-icon-only"
              />{" "}
              {t("spreadsheet.cfDialog.iconOnly")}
            </label>
          </span>
          <span className={styles.heading}>{t("spreadsheet.cfDialog.iconRules")}</span>
          <div className={styles.grid} style={{ "--cf-columns": 3 } as CSSProperties}>
            <span className={styles.heading}>{t("spreadsheet.cfDialog.iconColumn")}</span>
            <span />
            <span className={styles.heading}>{t("spreadsheet.cfDialog.valueLabel")}</span>
            <span className={styles.heading}>{t("spreadsheet.cfDialog.typeLabel")}</span>
            {Array.from({ length: iconCount }, (_, row) => {
              // Row 0 is the highest bucket; thresholds are stored ascending.
              const bucket = iconCount - 1 - row;
              const icon = draft.icon.reverse ? row : bucket;
              const thresholdIndex = bucket - 1;
              const upper = draft.icon.thresholds[bucket];
              // The bucket above takes its boundary when its operator is
              // ">=", so this one is "< value"; with ">" above, the boundary
              
              const op = draft.icon.gte[bucket] === false ? "\u2264" : "<";
              return (
                <span key={row} style={{ display: "contents" }}>
                  <span aria-hidden="true">{renderIcon(draft.icon.set, icon, iconCount)}</span>
                  <span className={styles.muted}>
                    {row === 0
                      ? t("spreadsheet.cfDialog.iconWhenValueIs")
                      : thresholdIndex >= 0
                        ? t("spreadsheet.cfDialog.iconWhenLess", { value: upper ?? "", op })
                        : t("spreadsheet.cfDialog.iconWhenLessOnly", { value: upper ?? "", op })}{" "}
                    {thresholdIndex >= 0 ? (
                      // Excel's ">=" / ">" column: whether the boundary itself
                      // belongs to this icon's bucket.
                      <select
                        className={styles.select}
                        value={draft.icon.gte[thresholdIndex] === false ? "gt" : "gte"}
                        aria-label={`${t("spreadsheet.cfDialog.valueLabel")} ${row + 1} operator`}
                        onChange={(event) => {
                          const gte = [...draft.icon.gte];
                          gte[thresholdIndex] = event.target.value !== "gt";
                          update({ icon: { ...draft.icon, gte } });
                        }}
                        data-testid={`spreadsheet-conditional-icon-gte-${thresholdIndex}`}
                      >
                        <option value="gte">{">="}</option>
                        <option value="gt">{">"}</option>
                      </select>
                    ) : null}
                  </span>
                  {thresholdIndex >= 0 ? (
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="decimal"
                      value={draft.icon.thresholds[thresholdIndex] ?? ""}
                      aria-label={`${t("spreadsheet.cfDialog.valueLabel")} ${row + 1}`}
                      onChange={(event) => {
                        const thresholds = [...draft.icon.thresholds];
                        thresholds[thresholdIndex] = event.target.value;
                        update({ icon: { ...draft.icon, thresholds } });
                      }}
                      data-testid={`spreadsheet-conditional-icon-threshold-${thresholdIndex}`}
                    />
                  ) : (
                    <span />
                  )}
                  {thresholdIndex >= 0 ? (
                    <select
                      className={styles.select}
                      value={draft.icon.types[thresholdIndex] ?? "percent"}
                      aria-label={`${t("spreadsheet.cfDialog.typeLabel")} ${row + 1}`}
                      onChange={(event) => {
                        const types = [...draft.icon.types];
                        types[thresholdIndex] = event.target.value as IconThresholdType;
                        update({ icon: { ...draft.icon, types } });
                      }}
                      data-testid={`spreadsheet-conditional-icon-type-${thresholdIndex}`}
                    >
                      <option value="number">{t("spreadsheet.cfDialog.threshold.number")}</option>
                      <option value="percent">{t("spreadsheet.cfDialog.threshold.percent")}</option>
                      <option value="formula">{t("spreadsheet.cfDialog.threshold.formula")}</option>
                      <option value="percentile">{t("spreadsheet.cfDialog.threshold.percentile")}</option>
                    </select>
                  ) : (
                    <span />
                  )}
                </span>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );

  const containPane = (
    <>
      <span className={styles.heading}>{t("spreadsheet.cfDialog.containHeading")}</span>
      <span className={styles.row}>
        <select
          className={styles.select}
          value={draft.subject}
          aria-label={t("spreadsheet.cfDialog.containHeading")}
          onChange={(event) =>
            update({ subject: event.target.value as ConditionalContainSubject })
          }
          data-testid="spreadsheet-conditional-subject"
        >
          {CONDITIONAL_CONTAIN_SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {t(`spreadsheet.cfDialog.subject.${subject}`)}
            </option>
          ))}
        </select>
        {draft.subject === "cellValue" ? (
          <>
            <select
              className={styles.select}
              value={draft.operator}
              aria-label={t("spreadsheet.conditionalOperator")}
              onChange={(event) =>
                update({ operator: event.target.value as ConditionalOperator })
              }
              data-testid="spreadsheet-conditional-op"
            >
              {CONDITIONAL_CELL_VALUE_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {t(`spreadsheet.cfDialog.operator.${OPERATOR_KEY[operator]}`)}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              type="text"
              value={draft.value1}
              aria-label={t("spreadsheet.conditionalValue")}
              onChange={(event) => update({ value1: event.target.value })}
              data-testid="spreadsheet-conditional-value"
              style={{ width: 110 }}
            />
            {draft.operator === "between" || draft.operator === "notBetween" ? (
              <>
                <span className={styles.label}>{t("spreadsheet.cfDialog.and")}</span>
                <input
                  className={styles.input}
                  type="text"
                  value={draft.value2}
                  aria-label={t("spreadsheet.conditionalValue2")}
                  onChange={(event) => update({ value2: event.target.value })}
                  data-testid="spreadsheet-conditional-value2"
                  style={{ width: 110 }}
                />
              </>
            ) : null}
          </>
        ) : null}
        {draft.subject === "specificText" ? (
          <>
            <select
              className={styles.select}
              value={draft.textOperator}
              aria-label={t("spreadsheet.conditionalTextOp")}
              onChange={(event) =>
                update({ textOperator: event.target.value as TextMatchOperator })
              }
              data-testid="spreadsheet-conditional-text-op"
            >
              {(["contains", "notContains", "beginsWith", "endsWith"] as const).map((operator) => (
                <option key={operator} value={operator}>
                  {t(`spreadsheet.cfDialog.textOp.${operator}`)}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              type="text"
              value={draft.text}
              aria-label={t("spreadsheet.conditionalText")}
              onChange={(event) => update({ text: event.target.value })}
              data-testid="spreadsheet-conditional-text"
              style={{ width: 160 }}
            />
          </>
        ) : null}
        {draft.subject === "datesOccurring" ? (
          <select
            className={styles.select}
            value={draft.period}
            aria-label={t("spreadsheet.conditionalPeriod")}
            onChange={(event) =>
              update({ period: event.target.value as DateOccurringPeriod })
            }
            data-testid="spreadsheet-conditional-period"
          >
            {CONDITIONAL_DATE_PERIODS.map((period) => (
              <option key={period} value={period}>
                {t(`spreadsheet.conditionalPeriod_${period}`)}
              </option>
            ))}
          </select>
        ) : null}
      </span>
    </>
  );

  const topBottomPane = (
    <>
      <span className={styles.heading}>{t("spreadsheet.cfDialog.topBottomHeading")}</span>
      <span className={styles.row}>
        <select
          className={styles.select}
          value={draft.bottom ? "bottom" : "top"}
          aria-label={t("spreadsheet.cfDialog.topBottomHeading")}
          onChange={(event) => update({ bottom: event.target.value === "bottom" })}
          data-testid="spreadsheet-conditional-top-bottom"
        >
          <option value="top">{t("spreadsheet.cfDialog.top")}</option>
          <option value="bottom">{t("spreadsheet.cfDialog.bottom")}</option>
        </select>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          value={draft.rank}
          aria-label={t("spreadsheet.conditionalRank")}
          onChange={(event) => update({ rank: event.target.value })}
          data-testid="spreadsheet-conditional-rank"
          style={{ width: 64 }}
        />
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={draft.percent}
            onChange={(event) => update({ percent: event.target.checked })}
            data-testid="spreadsheet-conditional-percent"
          />{" "}
          {t("spreadsheet.cfDialog.percentOfRange")}
        </label>
      </span>
    </>
  );

  const averagePane = (
    <>
      <span className={styles.heading}>{t("spreadsheet.cfDialog.averageHeading")}</span>
      <span className={styles.row}>
        <select
          className={styles.select}
          value={draft.average}
          aria-label={t("spreadsheet.cfDialog.averageHeading")}
          onChange={(event) =>
            update({ average: event.target.value as ConditionalAverageOption })
          }
          data-testid="spreadsheet-conditional-average"
        >
          {CONDITIONAL_AVERAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`spreadsheet.cfDialog.average.${option}`)}
            </option>
          ))}
        </select>
        <span className={styles.label}>{t("spreadsheet.cfDialog.averageSuffix")}</span>
      </span>
    </>
  );

  const uniquePane = (
    <>
      <span className={styles.heading}>{t("spreadsheet.cfDialog.uniqueHeading")}</span>
      <span className={styles.row}>
        <select
          className={styles.select}
          value={draft.unique ? "unique" : "duplicate"}
          aria-label={t("spreadsheet.cfDialog.uniqueHeading")}
          onChange={(event) => update({ unique: event.target.value === "unique" })}
          data-testid="spreadsheet-conditional-unique"
        >
          <option value="duplicate">{t("spreadsheet.cfDialog.duplicate")}</option>
          <option value="unique">{t("spreadsheet.cfDialog.unique")}</option>
        </select>
        <span className={styles.label}>{t("spreadsheet.cfDialog.uniqueSuffix")}</span>
      </span>
    </>
  );

  const formulaPane = (
    <>
      <label className={styles.heading} htmlFor="cf-formula">
        {t("spreadsheet.cfDialog.formulaHeading")}
      </label>
      <input
        id="cf-formula"
        className={styles.input}
        type="text"
        spellCheck={false}
        value={draft.formula}
        placeholder={t("spreadsheet.conditionalFormulaPlaceholder")}
        onChange={(event) => update({ formula: event.target.value })}
        data-testid="spreadsheet-conditional-formula"
      />
    </>
  );

  return (
    <>
      <div
        ref={dialogRef}
        className={`${spreadsheetDialogClassName()} ${styles.dialog} ${styles.editor}`}
        style={{ zIndex: 82 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-rule-editor-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="spreadsheet-conditional-rule-editor"
        data-rule-type={draft.type}
      >
        <div className={dialogParts.header}>
          <h2 id="cf-rule-editor-title" className={dialogParts.title}>
            {t(mode === "new" ? "spreadsheet.cfDialog.newTitle" : "spreadsheet.cfDialog.editTitle")}
          </h2>
          <button
            type="button"
            className={dialogParts.close}
            onClick={onCancel}
            aria-label={t("common.close")}
            data-testid="spreadsheet-conditional-rule-editor-dialog-close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <span className={styles.heading} id="cf-rule-type-label">
          {t("spreadsheet.cfDialog.selectType")}
        </span>
        <div
          ref={typeListRef}
          className={`${dialogParts.list} ${styles.typeList}`}
          role="listbox"
          aria-labelledby="cf-rule-type-label"
          data-testid="spreadsheet-conditional-rule-types"
        >
          {CONDITIONAL_RULE_TYPES.map((type: ConditionalRuleTypeId, index) => (
            <button
              key={type}
              type="button"
              role="option"
              aria-selected={draft.type === type}
              tabIndex={draft.type === type ? 0 : -1}
              className={`${dialogParts.listItem} ${styles.typeOption}`}
              onClick={() => update({ type })}
              onKeyDown={(event) => moveType(event, index)}
              data-rule-type={type}
              data-testid={`spreadsheet-conditional-rule-type-${type}`}
            >
              <SpreadsheetDialogIcon name={CONDITIONAL_RULE_TYPE_ICON[type]} />
              {t(`spreadsheet.cfDialog.type.${type}`)}
            </button>
          ))}
        </div>
        <span className={styles.heading}>{t("spreadsheet.cfDialog.editDescription")}</span>
        <div className={styles.description} data-testid="spreadsheet-conditional-rule-description">
          {draft.type === "allValues"
            ? allValuesPane
            : draft.type === "cellsThatContain"
              ? containPane
              : draft.type === "topBottom"
                ? topBottomPane
                : draft.type === "aboveBelowAverage"
                  ? averagePane
                  : draft.type === "uniqueDuplicate"
                    ? uniquePane
                    : formulaPane}
          {draft.type !== "allValues" ? (
            <span className={styles.row}>
              <span className={styles.label}>{t("spreadsheet.cfDialog.preview")}</span>
              <span style={{ flex: 1 }}>
                <FormatSample format={draft.format} testId="spreadsheet-conditional-preview" />
              </span>
              <button
                type="button"
                className={dialogParts.button}
                onClick={() => setFormatOpen(true)}
                data-testid="spreadsheet-conditional-format-button"
              >
                {t("spreadsheet.cfDialog.formatButton")}
              </button>
            </span>
          ) : null}
        </div>
        {!writable ? (
          <span role="status" className={styles.notice} data-testid="spreadsheet-conditional-native-blocker">
            {t("spreadsheet.uiCopy.thisRuleTypeCannotBeWrittenLosslesslyToThe")}
          </span>
        ) : null}
        {problem || error ? (
          <span role="alert" className={dialogParts.error} data-testid="spreadsheet-conditional-error">
            {problem ?? error}
          </span>
        ) : null}
        <div className={dialogParts.footer}>
          <button
            type="button"
            className={dialogParts.button}
            onClick={onCancel}
            data-testid="spreadsheet-conditional-rule-cancel"
          >
            {t("spreadsheet.cfDialog.cancel")}
          </button>
          <button
            type="button"
            className={dialogParts.primaryButton}
            disabled={!writable}
            title={
              writable
                ? undefined
                : t("spreadsheet.uiCopy.thisRuleTypeCannotBeWrittenLosslesslyToThe")
            }
            onClick={submit}
            data-testid="spreadsheet-conditional-rule-ok"
          >
            {t("spreadsheet.cfDialog.ok")}
          </button>
        </div>
      </div>
      {formatOpen ? (
        <FormatCellsDialog
          conditionalFormat
          themeBindingEnabled={false}
          paletteId={paletteId}
          previewValue={null}
          currentFormat={draft.format.numberFormat}
          currentAlignment={formatCellsStyleOf(draft.format)}
          onConfirm={(result) => {
            setFormatOpen(false);
            setProblem(null);
            setDraft((current) => ({
              ...current,
              format: applyFormatCellsResult(current.format, result),
            }));
            dialogRef.current?.focus({ preventScroll: true });
          }}
          onCancel={() => {
            setFormatOpen(false);
            dialogRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );
}

// ── Highlight Cells / Top-Bottom quick dialogs ──────────────────────────────

/** Excel's "Format cells that are GREATER THAN: … with [preset]" list, top
 * to bottom; Light Red Fill with Dark Red Text is the default. The red
 * presets share Excel's dark red (9C0006), the colour its Red Text writes.
 * Red Border is Excel's border-only dxf, thin 9C0006 on the four sides and
 * nothing else (an Excel-saved workbook using all six presets in list
 * order: openpyxl's tests/test_data/reader/conditional-formatting.xlsx). */
const RED_BORDER_EDGE = /* own data: RED_BORDER_EDGE */ {"style":"thin","color":"#72131f"};
const QUICK_RULE_PRESETS: readonly {
  readonly id: string;
  readonly format: ConditionalDifferentialStyle;
}[] = /* own data: QUICK_RULE_PRESETS */ [{"id":"lightRedDarkRed","format":{"backgroundColor":"#f4d2d6","textColor":"#72131f"}},{"id":"yellowDarkYellow","format":{"backgroundColor":"#f4ecd2","textColor":"#724513"}},{"id":"greenDarkGreen","format":{"backgroundColor":"#d2f4e0","textColor":"#13723a"}},{"id":"lightRedFill","format":{"backgroundColor":"#f4d2d6"}},{"id":"redText","format":{"textColor":"#72131f"}},{"id":"redBorder","format":{"borderEdges":{"top":{"style":"thin","color":"#72131f"},"right":{"style":"thin","color":"#72131f"},"bottom":{"style":"thin","color":"#72131f"},"left":{"style":"thin","color":"#72131f"}}}}];
const QUICK_CUSTOM_PRESET = "custom";
/** The list's value once a custom format is applied: a value of its own, so
 * choosing Custom Format… again is a change and reopens Format Cells. */
const QUICK_CUSTOM_APPLIED = "customApplied";

/**
 * What Excel has in the boxes when a Highlight Cells dialog opens. The
 * numbers are the selection's numbers (formula results count; text,
 * logicals and blanks do not), not the active cell's:
 * - Greater Than / Less Than / Equal To: (min + max) / 2
 * - Between: min + (max - min) / 4 and min + 3 (max - min) / 4
 * - Text That Contains: the active cell's text
 * Sources: Contextures "Less Than - Default Settings" (the average of the
 * selection's Max and Min); Microsoft Q&A 5166277 (12..94 gives 53);
 * JavaDrive exceltips/conditional index1/4/5/6/8 (16000..45000 gives 30500,
 * and 23250 / 37750 for Between; Equal To over 1..5 gives 3 with the active
 * cell holding 4, and stays empty over text; Text That Contains shows the
 * active cell's 緑); Get Digital Help (Text That Contains shows "apple").
 * Only whole-number defaults are filled: the one fractional sample shows
 * 250.25 / 628.75 as 250 / 629, which does not establish Excel's rounding.
 * With no numbers, or an active cell that holds no text, the box is empty.
 */
function quickRulePrefill(
  entry: ConditionalRibbonRuleDraft,
  selection: SelectionStatisticsSource | undefined,
  activeCellValue: unknown,
): Partial<ConditionalRuleDraft> {
  if (entry === "textContains") {
    return typeof activeCellValue === "string" && activeCellValue.trim() !== ""
      ? { text: activeCellValue }
      : {};
  }
  const midpoint = entry === "greaterThan" || entry === "lessThan" || entry === "equals";
  if ((!midpoint && entry !== "between") || !selection) return {};
  const { min, max } = selectionStatisticsSync(selection);
  if (min === null || max === null) return {};
  const values = midpoint
    ? [(min + max) / 2]
    : [min + (max - min) / 4, min + (3 * (max - min)) / 4];
  if (!values.every((value) => Number.isSafeInteger(value))) return {};
  const [value1, value2] = values.map(String);
  return midpoint ? { value1 } : { value1, value2 };
}

interface QuickRuleDialogProps {
  readonly entry: ConditionalRibbonRuleDraft;
  readonly areas: readonly ConditionalRange[];
  readonly patchback: boolean;
  readonly kindWritable: (kind: ConditionalRuleKind) => boolean;
  readonly error: string | null;
  readonly paletteId?: string;
  readonly onOk: (rule: ConditionalFormatRule) => string | null;
  readonly onCancel: () => void;
  readonly onPreview?: (rule: ConditionalFormatRule | null) => void;
  readonly selectionStatistics?: SelectionStatisticsSource;
  readonly activeCellValue?: unknown;
}

/**
 * The small dialog each Highlight Cells Rules / Top/Bottom Rules entry opens
 * in Excel ("Greater Than": a value box and "with [Light Red Fill with Dark
 * Red Text]"). It builds the same draft New Formatting Rule would and adds
 * the rule through the same path; Custom Format… opens Format Cells.
 */
function QuickRuleDialog({
  entry,
  areas,
  patchback,
  kindWritable,
  error,
  paletteId,
  onOk,
  onCancel,
  onPreview,
  selectionStatistics,
  activeCellValue,
}: QuickRuleDialogProps) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<ConditionalRuleDraft>(() => {
    const base = conditionalRuleDraftForRibbon(entry);
    if (base.type === "topBottom") return { ...base, rank: "10" };
    return { ...base, ...quickRulePrefill(entry, selectionStatistics, activeCellValue) };
  });
  const [preset, setPreset] = useState<string>(QUICK_RULE_PRESETS[0].id);
  const [formatOpen, setFormatOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const update = (patch: Partial<ConditionalRuleDraft>) => {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const writable = kindWritable(conditionalDraftKind(draft));
  // Excel previews the rule on the selected cells while this dialog is open,
  // following the value and the "with" format, and drops it on Cancel: report
  // the rule OK would add now (null when the draft does not build) and null
  // once the dialog goes away. `areas` is rebuilt on every parent render, so
  // its coordinates are the dependency.
  const areasKey = areas.map((area) => `${area.r1}:${area.c1}:${area.r2}:${area.c2}`).join(",");
  const previewRule = useMemo(() => {
    if (!writable) return null;
    const built = conditionalRuleFromDraft(draft, areas, { previous: null, patchback });
    return built.ok ? built.rule : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, areasKey, patchback, writable]);
  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  });
  useEffect(() => {
    onPreviewRef.current?.(previewRule);
  }, [previewRule]);
  useEffect(() => () => onPreviewRef.current?.(null), []);
  const submit = () => {
    if (!writable) return;
    const built = conditionalRuleFromDraft(draft, areas, { previous: null, patchback });
    if (!built.ok) {
      setProblem(t(PROBLEM_KEYS[built.problem]));
      return;
    }
    const refusal = onOk(built.rule);
    if (refusal) setProblem(refusal);
  };
  const choosePreset = (id: string) => {
    if (id === QUICK_CUSTOM_PRESET) {
      setFormatOpen(true);
      return;
    }
    const chosen = QUICK_RULE_PRESETS.find((candidate) => candidate.id === id);
    if (!chosen) return;
    setPreset(id);
    update({ format: { ...chosen.format } });
  };
  const percent =
    entry === "topPercent" || entry === "bottomPercent";
  const valueField = (
    value: string,
    onChange: (next: string) => void,
    testId: string,
    label: string,
    first: boolean,
  ) => (
    <input
      ref={first ? firstFieldRef : undefined}
      className={styles.input}
      type="text"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
    />
  );
  let fields: ReactNode = null;
  switch (entry) {
    case "greaterThan":
    case "lessThan":
    case "equals":
      fields = valueField(
        draft.value1,
        (value1) => update({ value1 }),
        "spreadsheet-conditional-value",
        t("spreadsheet.conditionalValue"),
        true,
      );
      break;
    case "between":
      fields = (
        <>
          {valueField(
            draft.value1,
            (value1) => update({ value1 }),
            "spreadsheet-conditional-value",
            t("spreadsheet.conditionalValue"),
            true,
          )}
          <span className={styles.label}>{t("spreadsheet.cfQuick.and")}</span>
          {valueField(
            draft.value2,
            (value2) => update({ value2 }),
            "spreadsheet-conditional-value2",
            t("spreadsheet.conditionalValue"),
            false,
          )}
        </>
      );
      break;
    case "textContains":
      fields = valueField(
        draft.text,
        (text) => update({ text }),
        "spreadsheet-conditional-text",
        t("spreadsheet.conditionalKindTextContains"),
        true,
      );
      break;
    case "dateOccurring":
      fields = (
        <select
          className={styles.select}
          value={draft.period}
          aria-label={t("spreadsheet.conditionalPeriod")}
          onChange={(event) =>
            update({ period: event.target.value as DateOccurringPeriod })
          }
          data-testid="spreadsheet-conditional-period"
        >
          {CONDITIONAL_DATE_PERIODS.map((period) => (
            <option key={period} value={period}>
              {t(`spreadsheet.conditionalPeriod_${period}`)}
            </option>
          ))}
        </select>
      );
      break;
    case "duplicateValues":
      fields = (
        <>
          <select
            className={styles.select}
            value={draft.unique ? "unique" : "duplicate"}
            aria-label={t("spreadsheet.cfQuick.prompt.duplicateValues")}
            onChange={(event) => update({ unique: event.target.value === "unique" })}
            data-testid="spreadsheet-conditional-unique"
          >
            <option value="duplicate">{t("spreadsheet.cfQuick.duplicate")}</option>
            <option value="unique">{t("spreadsheet.cfQuick.unique")}</option>
          </select>
          <span className={styles.label}>{t("spreadsheet.cfQuick.values")}</span>
        </>
      );
      break;
    case "topItems":
    case "topPercent":
    case "bottomItems":
    case "bottomPercent":
      fields = (
        <>
          <input
            ref={firstFieldRef}
            className={styles.input}
            type="number"
            min={1}
            max={percent ? 100 : 1000}
            step={1}
            value={draft.rank}
            aria-label={t("spreadsheet.cfQuick.rank")}
            onChange={(event) => update({ rank: event.target.value })}
            data-testid="spreadsheet-conditional-rank"
            style={{ width: 72 }}
          />
          {percent ? <span className={styles.label}>%</span> : null}
        </>
      );
      break;
    case "aboveAverage":
    case "belowAverage":
      fields = (
        <span className={styles.label}>{t("spreadsheet.cfQuick.forSelection")}</span>
      );
      break;
  }
  return (
    <>
      <OfficeDialogShell
        open={!formatOpen}
        title={t(`spreadsheet.cfQuick.title.${entry}`)}
        description={t(`spreadsheet.cfQuick.prompt.${entry}`)}
        defaultActionLabel={t("spreadsheet.cfDialog.ok")}
        cancelActionLabel={t("spreadsheet.cfDialog.cancel")}
        onDefaultAction={submit}
        onCancel={onCancel}
        defaultActionDisabled={!writable}
        initialFocusRef={firstFieldRef}
        testIdPrefix="spreadsheet-conditional-quick"
        defaultActionTestId="spreadsheet-conditional-rule-ok"
        cancelActionTestId="spreadsheet-conditional-rule-cancel"
      >
        <span className={styles.row}>
          {fields}
          <span className={styles.label}>{t("spreadsheet.cfQuick.with")}</span>
          <select
            className={styles.select}
            value={preset}
            aria-label={t("spreadsheet.cfQuick.with")}
            onChange={(event) => choosePreset(event.target.value)}
            data-testid="spreadsheet-conditional-quick-preset"
          >
            {QUICK_RULE_PRESETS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {t(`spreadsheet.cfQuick.preset.${candidate.id}`)}
              </option>
            ))}
            {preset === QUICK_CUSTOM_APPLIED ? (
              <option value={QUICK_CUSTOM_APPLIED} hidden>
                {t("spreadsheet.cfQuick.preset.customApplied")}
              </option>
            ) : null}
            <option value={QUICK_CUSTOM_PRESET}>
              {t("spreadsheet.cfQuick.preset.custom")}
            </option>
          </select>
        </span>
        {problem ?? error ? (
          <span
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-conditional-error"
          >
            {problem ?? error}
          </span>
        ) : null}
        {!writable ? (
          <span className={dialogParts.error}>
            {t("spreadsheet.uiCopy.thisRuleTypeCannotBeWrittenLosslesslyToThe")}
          </span>
        ) : null}
      </OfficeDialogShell>
      {formatOpen ? (
        <FormatCellsDialog
          conditionalFormat
          themeBindingEnabled={false}
          paletteId={paletteId}
          previewValue={null}
          currentFormat={draft.format.numberFormat}
          currentAlignment={formatCellsStyleOf(draft.format)}
          onConfirm={(result) => {
            setFormatOpen(false);
            setPreset(QUICK_CUSTOM_APPLIED);
            setProblem(null);
            setDraft((current) => ({
              ...current,
              format: applyFormatCellsResult(current.format, result),
            }));
          }}
          onCancel={() => setFormatOpen(false)}
        />
      ) : null}
    </>
  );
}

// ── Conditional Formatting Rules Manager ────────────────────────────────────

interface StagedRule {
  readonly key: string;
  readonly rule: ConditionalFormatRule;
  /** The Applies to box as typed; read on OK / Apply. */
  readonly appliesTo: string;
}

function stageRules(rules: readonly ConditionalFormatRule[]): StagedRule[] {
  return rules.map((rule, index) => ({
    key: rule.id ?? `row-${index}`,
    rule,
    appliesTo: conditionalRuleAppliesTo(rule),
  }));
}

/** A copy of a rule as a new rule: it has no native identity of its own. */
function duplicateRule(
  rule: ConditionalFormatRule,
): ConditionalFormatRule {
  // A copied bar keeps its fill; the writer authors the copy's own x14
  // twin (the source's id is dropped with the rest of its identity).
  return newConditionalRuleCopy(rule, createConditionalRuleId()) as unknown as ConditionalFormatRule;
}

type EditorState =
  | null
  | {
      readonly mode: "new" | "edit";
      readonly key: string | null;
      readonly draft: ConditionalRuleDraft;
      readonly areas: readonly ConditionalRange[];
      readonly previous: ConditionalFormatRule | null;
    };

function RulesManager(props: SpreadsheetConditionalFormatDialogsProps) {
  const {
    rules,
    otherSheets,
    sheetName,
    selection,
    patchback,
    sheetNativeBlocked,
    kindWritable,
    error,
    onDismissError,
    onCommit,
    onClose,
    onModalChange,
    renderIcon,
    paletteId,
  } = props;
  const t = useTranslations("console-notebooks");
  // Applies to may name any cell of the worksheet, as Excel lets a rule be
  // set ahead on rows not yet filled in; the sheet's stored extent is only
  // its used range and grows to hold the rule when it is written.
  const appliesToBounds = {
    rowCount: MAX_GRID_ROWS,
    columnCount: MAX_GRID_COLUMNS,
    sheetName,
  };
  const [base, setBase] = useState(rules);
  const [staged, setStaged] = useState<StagedRule[]>(() => stageRules(rules));
  const [awaitingApply, setAwaitingApply] = useState(false);
  // Excel's "Current Selection" is the selection the manager opened on.
  const [scopeRange] = useState<ConditionalRange>(() => ({ ...selection }));
  const [scope, setScope] = useState<string>("selection");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [picking, setPicking] = useState<{ key: string; from: ConditionalRange } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // After Apply the sheet's rules come back re-read; stage them afresh.
  if (awaitingApply && rules !== base) {
    setBase(rules);
    setStaged(stageRules(rules));
    setAwaitingApply(false);
  }

  // Collapse Dialog: the selection the user makes on the sheet becomes the
  // reference, as Excel's RefEdit box does.
  if (
    picking &&
    (selection.r1 !== picking.from.r1 ||
      selection.c1 !== picking.from.c1 ||
      selection.r2 !== picking.from.r2 ||
      selection.c2 !== picking.from.c2)
  ) {
    const text = formatConditionalAppliesTo([selection]);
    setPicking({ key: picking.key, from: { ...selection } });
    setStaged((current) =>
      current.map((entry) =>
        entry.key === picking.key ? { ...entry, appliesTo: text } : entry,
      ),
    );
  }
  useEffect(() => {
    onModalChange?.();
  }, [onModalChange, picking]);

  const otherSheet = scope.startsWith("sheet:")
    ? otherSheets.find((entry) => `sheet:${entry.id}` === scope) ?? null
    : null;
  const readOnlyView = otherSheet !== null;
  const baseSet = new Set(base);
  const ruleEditable = (rule: ConditionalFormatRule) =>
    !sheetNativeBlocked &&
    (!patchback ||
      !baseSet.has(rule) ||
      (!rule.nativeBlocker && isClassicNativeConditionalRuleEditable(rule)));
  const visible: StagedRule[] = otherSheet
    ? stageRules(otherSheet.rules)
    : staged.filter(
        (entry) => scope === "sheet" || ruleOverlaps(entry.rule, scopeRange),
      );
  const selected =
    readOnlyView ? null : visible.find((entry) => entry.key === selectedKey) ?? null;
  const selectedEditable = selected ? ruleEditable(selected.rule) : false;
  // Excel's Rules Manager deletes and moves any rule. A rule MRAI cannot
  // model keeps its body exactly (the writer only removes it or rewrites its
  // priority), so on an original-package sheet it can still be deleted and
  // moved; only its content stays read-only.
  const selectedMovable = Boolean(selected) && !sheetNativeBlocked;
  const selectedVisibleIndex = selected ? visible.indexOf(selected) : -1;
  const hasReadOnlyRules =
    sheetNativeBlocked ||
    (patchback &&
      staged.some(
        (entry) =>
          baseSet.has(entry.rule) &&
          (Boolean(entry.rule.nativeBlocker) ||
            !isClassicNativeConditionalRuleEditable(entry.rule)),
      ));

  const clearMessages = () => {
    setProblem(null);
    if (error) onDismissError();
  };

  const moveTarget = (direction: -1 | 1): number | null => {
    if (!selected || !selectedMovable) return null;
    const neighbour = visible[selectedVisibleIndex + direction];
    if (!neighbour) return null;
    return staged.indexOf(neighbour);
  };
  const upTarget = moveTarget(-1);
  const downTarget = moveTarget(1);
  const move = (target: number | null) => {
    if (!selected || target === null) return;
    clearMessages();
    setStaged((current) => {
      const next = current.filter((entry) => entry !== selected);
      next.splice(target, 0, selected);
      return next;
    });
  };

  const atLimit = staged.length >= MAX_CONDITIONAL_FORMATS;
  const insertNew = (entry: StagedRule) => {
    setStaged((current) =>
      // Excel adds a new rule at the top of the list. A workbook written back
      // into its own package appends it after the rules it read, which keep
      // their native precedence.
      patchback ? [...current, entry] : [entry, ...current],
    );
    setSelectedKey(entry.key);
  };

  const openNew = () => {
    clearMessages();
    if (atLimit) {
      setProblem(t("spreadsheet.conditionalRuleLimit"));
      return;
    }
    setEditor({
      mode: "new",
      key: null,
      draft: defaultConditionalRuleDraft(),
      areas: [scopeRange],
      previous: null,
    });
  };
  const openEdit = (entry: StagedRule | null) => {
    if (!entry || readOnlyView || !ruleEditable(entry.rule)) return;
    clearMessages();
    setEditor({
      mode: "edit",
      key: entry.key,
      draft: conditionalRuleDraftFromRule(entry.rule),
      areas:
        parseConditionalAppliesTo(entry.appliesTo, appliesToBounds) ??
        [entry.rule.range, ...(entry.rule.areas?.slice(1) ?? [])],
      previous: entry.rule,
    });
  };
  const deleteSelected = () => {
    if (!selected || !selectedMovable) return;
    clearMessages();
    const index = visible.indexOf(selected);
    const neighbour = visible[index + 1] ?? visible[index - 1] ?? null;
    setStaged((current) => current.filter((entry) => entry !== selected));
    setSelectedKey(neighbour?.key ?? null);
  };
  const duplicateSelected = () => {
    if (!selected || !selectedEditable) return;
    clearMessages();
    if (atLimit) {
      setProblem(t("spreadsheet.conditionalRuleLimit"));
      return;
    }
    const copy = duplicateRule(selected.rule);
    const entry: StagedRule = {
      key: copy.id ?? createConditionalRuleId(),
      rule: copy,
      appliesTo: selected.appliesTo,
    };
    setStaged((current) => {
      if (patchback) return [...current, entry];
      const next = [...current];
      next.splice(next.indexOf(selected) + 1, 0, entry);
      return next;
    });
    setSelectedKey(entry.key);
  };
  const duplicateWritable = selected
    ? kindWritable(selected.rule.kind ?? "comparison")
    : false;

  const setStopIfTrue = (entry: StagedRule, checked: boolean) => {
    clearMessages();
    setStaged((current) =>
      current.map((candidate) => {
        if (candidate !== entry) return candidate;
        const rule = { ...candidate.rule } as ConditionalFormatRule;
        if (checked) rule.stopIfTrue = true;
        else delete rule.stopIfTrue;
        return { ...candidate, rule };
      }),
    );
  };
  const setAppliesTo = (entry: StagedRule, text: string) => {
    setStaged((current) =>
      current.map((candidate) =>
        candidate.key === entry.key ? { ...candidate, appliesTo: text } : candidate,
      ),
    );
  };

  /** The collection OK / Apply would write, or null after reporting why not. */
  const collect = (): ConditionalFormatRule[] | null => {
    const next: ConditionalFormatRule[] = [];
    for (const entry of staged) {
      if (entry.appliesTo === conditionalRuleAppliesTo(entry.rule)) {
        next.push(entry.rule);
        continue;
      }
      const areas = parseConditionalAppliesTo(entry.appliesTo, appliesToBounds);
      if (!areas) {
        setSelectedKey(entry.key);
        setScope((current) => (current.startsWith("sheet:") ? "sheet" : current));
        setProblem(t("spreadsheet.uiCopy.enterAValidRangeWithinTheCurrentWorksheet"));
        return null;
      }
      next.push(
        formatConditionalAppliesTo(areas) === conditionalRuleAppliesTo(entry.rule)
          ? entry.rule
          : withConditionalRuleAreas(entry.rule, areas),
      );
    }
    return next;
  };
  const changed = (next: readonly ConditionalFormatRule[]) =>
    next.length !== base.length || next.some((rule, index) => rule !== base[index]);

  const commit = (close: boolean) => {
    clearMessages();
    const next = collect();
    if (!next) return;
    if (!changed(next)) {
      if (close) onClose();
      return;
    }
    if (!onCommit("manage", base, next)) return;
    if (close) onClose();
    else setAwaitingApply(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    // A modal: Tab stays in the manager instead of reaching the sheet tabs
    // and ribbon behind its dimmer (S-131).
    containDialogTab(event, dialogRef.current);
  };

  const onEditorOk = (rule: ConditionalFormatRule): string | null => {
    if (!editor) return null;
    const entry: StagedRule = {
      key: editor.key ?? rule.id ?? createConditionalRuleId(),
      rule,
      appliesTo: conditionalRuleAppliesTo(rule),
    };
    if (editor.mode === "new") {
      if (!entry.rule.id) entry.rule.id = entry.key;
      insertNew(entry);
    } else {
      setStaged((current) =>
        current.map((candidate) => (candidate.key === editor.key ? entry : candidate)),
      );
      setSelectedKey(entry.key);
    }
    setEditor(null);
    requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    return null;
  };

  if (picking) {
    const entry = staged.find((candidate) => candidate.key === picking.key);
    return (
      <SpreadsheetRangePickerBar
        dialogLabel={t("spreadsheet.uiCopy.conditionalFormattingRulesManager")}
        expandLabel={t("spreadsheet.cfDialog.expand")}
        inputLabel={t("spreadsheet.cfDialog.columnAppliesTo")}
        onChange={(value) => entry && setAppliesTo(entry, value)}
        onDone={() => setPicking(null)}
        testIdPrefix="spreadsheet-conditional-applies-to"
        value={entry?.appliesTo ?? ""}
      />
    );
  }

  return (
    <>
      <div
        ref={dialogRef}
        className={`${spreadsheetDialogClassName()} ${styles.dialog} ${styles.manager}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-manager-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="spreadsheet-conditional-manager"
      >
        <div className={dialogParts.header}>
          <h2 id="cf-manager-title" className={dialogParts.title}>
            {t("spreadsheet.uiCopy.conditionalFormattingRulesManager")}
          </h2>
          <button
            type="button"
            className={dialogParts.close}
            onClick={onClose}
            aria-label={t("common.close")}
            data-testid="spreadsheet-conditional-manager-dialog-close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <span className={styles.row}>
          <label className={styles.label} htmlFor="cf-manager-scope">
            {t("spreadsheet.cfDialog.showRulesFor")}
          </label>
          <select
            id="cf-manager-scope"
            className={styles.select}
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
              setSelectedKey(null);
            }}
            data-testid="spreadsheet-conditional-scope"
          >
            <option value="selection">{t("spreadsheet.cfDialog.scopeSelection")}</option>
            <option value="sheet">{t("spreadsheet.cfDialog.scopeSheet")}</option>
            {otherSheets.map((entry) => (
              <option key={entry.id} value={`sheet:${entry.id}`}>
                {entry.name}
              </option>
            ))}
          </select>
        </span>
        <span className={styles.row} role="toolbar" aria-label={t("spreadsheet.uiCopy.conditionalFormattingRulesManager")}>
          <button
            type="button"
            className={dialogParts.button}
            disabled={readOnlyView || sheetNativeBlocked}
            onClick={openNew}
            data-testid="spreadsheet-conditional-manager-new"
          >
            <SpreadsheetDialogIcon name="add" />
            {t("spreadsheet.cfDialog.newRule")}
          </button>
          <button
            type="button"
            className={dialogParts.button}
            disabled={!selectedEditable}
            title={
              selected && !selectedEditable
                ? t("spreadsheet.uiCopy.thisNativeRuleContainsUnmodelledSemanticsAndRemainsRead")
                : undefined
            }
            onClick={() => openEdit(selected)}
            data-testid="spreadsheet-conditional-manager-edit"
          >
            <SpreadsheetDialogIcon name="edit" />
            {t("spreadsheet.cfDialog.editRule")}
          </button>
          <button
            type="button"
            className={dialogParts.button}
            disabled={!selectedMovable}
            onClick={deleteSelected}
            data-testid="spreadsheet-conditional-manager-delete"
          >
            <SpreadsheetDialogIcon name="delete" />
            {t("spreadsheet.cfDialog.deleteRule")}
          </button>
          <button
            type="button"
            className={dialogParts.button}
            disabled={!selectedEditable || !duplicateWritable}
            title={
              selected && selectedEditable && !duplicateWritable
                ? t("spreadsheet.uiCopy.thisRuleTypeCannotBeWrittenLosslesslyToThe")
                : undefined
            }
            onClick={duplicateSelected}
            data-testid="spreadsheet-conditional-manager-duplicate"
          >
            <SpreadsheetDialogIcon name="copy" />
            {t("spreadsheet.cfDialog.duplicateRule")}
          </button>
          <button
            type="button"
            className={`${dialogParts.compactButton} ${styles.iconButton}`}
            disabled={upTarget === null}
            aria-label={t("spreadsheet.cfDialog.moveUp")}
            title={t("spreadsheet.cfDialog.moveUp")}
            onClick={() => move(upTarget)}
            data-testid="spreadsheet-conditional-move-up"
          >
            <ChevronUp aria-hidden="true" size={14} />
          </button>
          <button
            type="button"
            className={`${dialogParts.compactButton} ${styles.iconButton}`}
            disabled={downTarget === null}
            aria-label={t("spreadsheet.cfDialog.moveDown")}
            title={t("spreadsheet.cfDialog.moveDown")}
            onClick={() => move(downTarget)}
            data-testid="spreadsheet-conditional-move-down"
          >
            <ChevronDown aria-hidden="true" size={14} />
          </button>
        </span>
        <div className={styles.tableFrame}>
          <table className={styles.table} data-testid="spreadsheet-conditional-rules">
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{t("spreadsheet.cfDialog.columnRule")}</th>
                <th scope="col">{t("spreadsheet.cfDialog.columnFormat")}</th>
                <th scope="col">{t("spreadsheet.cfDialog.columnAppliesTo")}</th>
                <th scope="col" className={styles.center}>
                  {t("spreadsheet.cfDialog.columnStopIfTrue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const editable = !readOnlyView && ruleEditable(entry.rule);
                const stopSupported = conditionalRuleSupportsStopIfTrue(entry.rule);
                const description = describeConditionalRuleForManager(entry.rule, t);
                return (
                  <tr
                    key={entry.key}
                    className={styles.ruleRow}
                    aria-selected={entry.key === selected?.key}
                    data-selected={entry.key === selected?.key ? "true" : "false"}
                    data-readonly={editable ? "false" : "true"}
                    data-conditional-kind={entry.rule.kind ?? "comparison"}
                    title={
                      editable || readOnlyView
                        ? undefined
                        : t("spreadsheet.uiCopy.thisNativeRuleContainsUnmodelledSemanticsAndRemainsRead")
                    }
                    onClick={() => {
                      if (!readOnlyView) setSelectedKey(entry.key);
                    }}
                    onDoubleClick={() => openEdit(entry)}
                    data-testid="spreadsheet-conditional-rule"
                  >
                    <td>
                      <div className={styles.ruleText} title={description}>
                        {description}
                      </div>
                    </td>
                    <td>
                      <RuleFormatPreview rule={entry.rule} renderIcon={renderIcon} />
                    </td>
                    <td>
                      <span className={styles.appliesTo}>
                        <input
                          className={styles.input}
                          type="text"
                          value={entry.appliesTo}
                          disabled={!editable}
                          aria-label={t("spreadsheet.cfDialog.columnAppliesTo")}
                          onFocus={() => setSelectedKey(entry.key)}
                          onChange={(event) => setAppliesTo(entry, event.target.value)}
                          data-testid="spreadsheet-conditional-applies-to"
                        />
                        <SpreadsheetCollapseDialogButton
                          className={`${dialogParts.compactButton} ${styles.iconButton}`}
                          disabled={!editable}
                          label={t("spreadsheet.cfDialog.collapse")}
                          onClick={() => {
                            setSelectedKey(entry.key);
                            setPicking({ key: entry.key, from: { ...selection } });
                          }}
                          testId="spreadsheet-conditional-applies-to-pick"
                        />
                      </span>
                    </td>
                    <td className={styles.center}>
                      <input
                        type="checkbox"
                        checked={entry.rule.stopIfTrue === true}
                        disabled={!editable || !stopSupported}
                        title={
                          stopSupported
                            ? t("spreadsheet.cfDialog.columnStopIfTrue")
                            : t("spreadsheet.uiCopy.stopIfTrueIsUnavailableForColorScalesData")
                        }
                        aria-label={t("spreadsheet.cfDialog.columnStopIfTrue")}
                        onChange={(event) => setStopIfTrue(entry, event.target.checked)}
                        data-testid="spreadsheet-conditional-stop-if-true"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {readOnlyView ? (
          <span role="status" className={styles.muted}>
            {t("spreadsheet.cfDialog.otherSheetReadOnly")}
          </span>
        ) : null}
        {hasReadOnlyRules ? (
          <span role="status" className={styles.notice} data-testid="spreadsheet-conditional-native-blocker">
            {sheetNativeBlocked
              ? t("spreadsheet.uiCopy.someNativeRulesContainUnmodelledSemanticsTheyRemainRead")
              : t("spreadsheet.uiCopy.someRulesUseFormattingThatCantBeEditedHere")}
          </span>
        ) : null}
        {!editor && (problem || error) ? (
          <span role="alert" className={dialogParts.error} data-testid="spreadsheet-conditional-error">
            {problem ?? error}
          </span>
        ) : null}
        <div className={dialogParts.footer}>
          <button
            type="button"
            className={dialogParts.button}
            disabled={awaitingApply}
            onClick={() => commit(false)}
            data-testid="spreadsheet-conditional-manager-apply"
          >
            {t("spreadsheet.cfDialog.apply")}
          </button>
          <button
            type="button"
            className={dialogParts.button}
            onClick={onClose}
            data-testid="spreadsheet-conditional-manager-cancel"
          >
            {t("spreadsheet.cfDialog.cancel")}
          </button>
          <button
            type="button"
            className={dialogParts.primaryButton}
            onClick={() => commit(true)}
            data-testid="spreadsheet-conditional-manager-ok"
          >
            {t("spreadsheet.cfDialog.ok")}
          </button>
        </div>
      </div>
      {editor ? (
        <RuleEditor
          mode={editor.mode}
          initialDraft={editor.draft}
          areas={editor.areas}
          previous={editor.previous}
          patchback={patchback}
          kindWritable={kindWritable}
          error={null}
          renderIcon={renderIcon}
          paletteId={paletteId}
          onOk={onEditorOk}
          onCancel={() => {
            setEditor(null);
            requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </>
  );
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * New Rule from the ribbon opens New Formatting Rule directly over the
 * selection and writes on OK; Manage Rules opens the Rules Manager.
 */
export function SpreadsheetConditionalFormatDialogs(
  props: SpreadsheetConditionalFormatDialogsProps,
) {
  const t = useTranslations("console-notebooks");
  const { request } = props;
  if (request.kind === "manager") return <RulesManager {...props} />;
  const areas = [props.selection];
  const kindWritable = (kind: ConditionalRuleKind) =>
    !props.sheetNativeBlocked && props.kindWritable(kind);
  const addRule = (rule: ConditionalFormatRule): string | null => {
    if (props.error) props.onDismissError();
    if (props.rules.length >= MAX_CONDITIONAL_FORMATS) {
      return t("spreadsheet.conditionalRuleLimit");
    }
    if (!rule.id) rule.id = createConditionalRuleId();
    const next = props.patchback ? [...props.rules, rule] : [rule, ...props.rules];
    if (props.onCommit("add", props.rules, next)) props.onClose();
    return null;
  };
  if (request.kind === "quickRule") {
    return (
      <QuickRuleDialog
        entry={request.entry}
        areas={areas}
        patchback={props.patchback}
        kindWritable={kindWritable}
        error={props.error}
        paletteId={props.paletteId}
        onOk={addRule}
        onCancel={props.onClose}
        onPreview={props.onPreview}
        selectionStatistics={props.selectionStatistics}
        activeCellValue={props.activeCellValue}
      />
    );
  }
  return (
    <RuleEditor
      mode="new"
      initialDraft={request.draft ?? defaultConditionalRuleDraft()}
      areas={areas}
      previous={null}
      patchback={props.patchback}
      kindWritable={kindWritable}
      error={props.error}
      renderIcon={props.renderIcon}
      paletteId={props.paletteId}
      onOk={addRule}
      onCancel={props.onClose}
    />
  );
}
