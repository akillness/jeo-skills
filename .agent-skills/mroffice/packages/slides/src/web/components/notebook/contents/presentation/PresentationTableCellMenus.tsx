"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Table Design / Table Layout Ribbon's cell menus: the choice, colour,
 * margin and borders menus a selected table cell range drives, with their
 * option lists and label tables.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { lineWeightPointsToDesignPx } from "@mrnote/core/web/lib/presentation/text-units.ts";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { IconTableDraw, IconTableCellMargins } from "../PresentationRibbonIcons";
import type { TableCellMarginField } from "../../../../lib/presentation/TableMarginsDialog";
import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { OfficeBorderPreset } from "@mrnote/core/web/components/office-ribbon/OfficeBorderPresetIcon.tsx";
import {
  OfficeColorPalettePopover,
  type OfficeColorPalettePopoverLabels,
} from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import {
  OfficeBorderMenuSections,
  OfficeBorderPresetItems,
  officeBorderWeightLabel,
  officeBordersMenuStyles,
} from "@mrnote/core/web/components/office-ribbon/OfficeBordersMenu.tsx";
import {
  DEFAULT_TABLE_CELL_BORDER_COLOR,
  DEFAULT_TABLE_CELL_BORDER_WIDTH,
  TABLE_CELL_MARGIN_PRESETS,
  type ResolvedCellStyle,
  type TableBorderTarget,
  type TableCellBorder,
  type TableCellBevelPreset,
  type TableCellMarginPreset,
} from "@mrnote/core/web/lib/presentation-table-style.ts";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import type {
  OfficeColorPalettePanelLabels,
} from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePanel.tsx";

/** WPS's own names for DrawingML's bevel presets (catalogue keys). */
export const TABLE_CELL_BEVEL_LABELS: Record<TableCellBevelPreset, string> = {
  relaxedInset: "presentation.ui.tableCellBevel.relaxedInset",
  circle: "presentation.ui.tableCellBevel.circle",
  slope: "presentation.ui.tableCellBevel.slope",
  cross: "presentation.ui.tableCellBevel.cross",
  angle: "presentation.ui.tableCellBevel.angle",
  softRound: "presentation.ui.tableCellBevel.softRound",
  convex: "presentation.ui.tableCellBevel.convex",
  coolSlant: "presentation.ui.tableCellBevel.coolSlant",
  divot: "presentation.ui.tableCellBevel.divot",
  riblet: "presentation.ui.tableCellBevel.riblet",
  hardEdge: "presentation.ui.tableCellBevel.hardEdge",
  artDeco: "presentation.ui.tableCellBevel.artDeco",
};

export type TableCellMarginMenuValue = TableCellMarginPreset | "custom" | "mixed";

export type TableCellMarginMenuLabels = Readonly<
  Record<TableCellMarginMenuValue, string> & { title: string }
>;

export type TableCellSelectionValue<T> = Readonly<{
  mixed: boolean;
  value: T;
}>;

export function uniformTableCellSelectionValue<T>(
  styles: readonly ResolvedCellStyle[],
  read: (style: ResolvedCellStyle) => T,
): TableCellSelectionValue<T> | null {
  const first = styles[0];
  if (!first) return null;
  const value = read(first);
  return {
    value,
    mixed: styles.slice(1).some((style) => !Object.is(read(style), value)),
  };
}

export const TABLE_BORDER_TARGET_PRESET_ICON: Record<TableBorderTarget, OfficeBorderPreset> = {
  all: "all",
  outside: "outside",
  inside: "inside",
  "inside-horizontal": "insideH",
  "inside-vertical": "insideV",
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  "diagonal-down": "diagonalDown",
  "diagonal-up": "diagonalUp",
  none: "none",
};

/** PowerPoint's Borders list order. */
const BORDER_LIST_ORDER: readonly TableBorderTarget[] = [
  "none",
  "all",
  "outside",
  "inside",
  "top",
  "bottom",
  "left",
  "right",
  "inside-horizontal",
  "inside-vertical",
  "diagonal-down",
  "diagonal-up",
];

/** PowerPoint's list groups: whole grids, single edges, inside lines and diagonals. */
function tableBorderTargetGroup(target: TableBorderTarget): string {
  switch (target) {
    case "none":
    case "all":
    case "outside":
    case "inside":
      return "grids";
    case "top":
    case "bottom":
    case "left":
    case "right":
      return "edges";
    default:
      return "lines";
  }
}

export type TableCellChoiceOption<T extends string> = Readonly<{
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  value: T;
}>;

export function PresentationTableCellChoiceMenu<T extends string>({
  defaultValue,
  disabled = false,
  displayLabel,
  icon,
  label,
  layout = "list",
  menuControlId,
  mixed,
  mixedLabel,
  onApplyCurrent,
  onSelect,
  options,
  primaryControlId,
  testId,
  triggerVariant = "compact",
  value,
}: {
  defaultValue: T;
  disabled?: boolean;
  displayLabel?: string;
  icon: ReactNode;
  label: string;
  layout?: "grid" | "list";
  menuControlId?: string;
  mixed: boolean;
  mixedLabel: string;
  onApplyCurrent?: () => void;
  onSelect: (value: T) => void;
  options: readonly TableCellChoiceOption<T>[];
  primaryControlId?: string;
  testId: string;
  triggerVariant?: "large" | "compact" | "icon";
  value: T;
}) {
  const activeLabel = mixed
    ? mixedLabel
    : (options.find((option) => option.value === value)?.label ?? label);
  return (
    <DropdownMenu>
      {onApplyCurrent ? (
        <OfficeHomeSplitLayout
          testId={`${testId}-split`}
          primary={
            <OfficeHomeCommand
              active={mixed ? "mixed" : value !== defaultValue}
              controlId={primaryControlId}
              disabled={disabled}
              displayLabel={activeLabel}
              icon={icon}
              label={label}
              onClick={onApplyCurrent}
              testId={testId}
            />
          }
          trigger={
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                active={mixed ? "mixed" : value !== defaultValue}
                data-control-id={menuControlId}
                disabled={disabled}
                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                label={`${label}: ${activeLabel}`}
                testId={`${testId}-menu-trigger`}
                variant="icon"
              />
            </DropdownMenuTrigger>
          }
        />
      ) : (
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            active={mixed ? "mixed" : value !== defaultValue}
            controlId={menuControlId}
            disabled={disabled}
            displayLabel={displayLabel ?? activeLabel}
            hasMenuIndicator
            icon={icon}
            label={`${label}: ${activeLabel}`}
            testId={testId}
            variant={triggerVariant}
          />
        </DropdownMenuTrigger>
      )}
      <RibbonDropdownMenuContent
        align="start"
        className={layout === "grid" ? "min-w-0" : undefined}
        data-testid={`${testId}-menu`}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          className={layout === "grid" ? "grid grid-cols-3 gap-1 p-1" : undefined}
          value={mixed ? "" : value}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              disabled={disabled || option.disabled}
              aria-label={option.label}
              className={
                layout === "grid"
                  ? "h-8 w-8 justify-center p-0 data-[state=checked]:bg-accent data-[state=checked]:ring-1 data-[state=checked]:ring-primary [&>span:first-child]:hidden"
                  : undefined
              }
              onSelect={() => onSelect(option.value)}
              data-testid={`${testId}-${option.value}`}
              title={layout === "grid" ? option.label : undefined}
            >
              {option.icon}
              {layout === "grid" ? (
                <span className="sr-only">{option.label}</span>
              ) : (
                option.label
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A menu command we have not built, with the reason rendered on the item.
 *
 * `DropdownMenuItem` carries `data-[disabled]:pointer-events-none`, so a
 * disabled item is never hovered and a `title` on it never opens — the reason
 * would exist only in the DOM. The reason is exactly what the reader needs, so
 * it is rendered, the way `OfficeHomeCommand` renders its own `disabledReason`
 * into the tooltip of a ribbon button (which does keep its pointer events).
 */
function PresentationUnavailableMenuItemText({
  label,
  reason,
  reasonTestId,
}: {
  label: string;
  reason: string;
  reasonTestId: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span>{label}</span>
      <span
        className="max-w-[22rem] whitespace-normal text-[11px] leading-snug"
        style={{ opacity: 0.72 }}
        data-testid={reasonTestId}
      >
        {reason}
      </span>
    </span>
  );
}

export function PresentationTableCellColorMenu({
  allowNoFill = true,
  automaticLabel,
  applyCurrentControlId,
  anchorClassName,
  disabled = false,
  displayLabel,
  icon,
  label,
  labels,
  menuControlId,
  mixed,
  mixedLabel,
  noFillLabel,
  onApplyCurrent,
  onAutomatic,
  onDismiss,
  onPick,
  onToggle,
  open,
  recents,
  testId,
  triggerVariant = "icon",
  value,
  secondary,
  formatPreview,
}: {
  /** Live Preview of the text colour this menu sets (not of a fill). */
  formatPreview?: "color" | "highlight";
  /**
   * A second colour this menu sets, offered at the foot of its palette and
   * opened in the same place: Shading's Table Background, which paints the
   * whole table under every cell (PPT-A137).
   */
  secondary?: {
    label: string;
    noFillLabel: string;
    open: boolean;
    onOpen: () => void;
    onPick: (color: string | null) => void;
    testId: string;
    value: string | null;
  };
  allowNoFill?: boolean;
  automaticLabel?: string;
  applyCurrentControlId?: string;
  anchorClassName: string;
  disabled?: boolean;
  displayLabel?: string;
  icon: ReactNode;
  label: string;
  labels: OfficeColorPalettePopoverLabels;
  menuControlId?: string;
  mixed: boolean;
  mixedLabel: string;
  noFillLabel: string;
  onApplyCurrent?: () => void;
  onAutomatic?: () => void;
  onDismiss: () => void;
  onPick: (color: string | null) => void;
  onToggle: () => void;
  open: boolean;
  recents: readonly string[];
  testId: string;
  triggerVariant?: "large" | "compact" | "icon";
  value: string | null;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const currentLabel = mixed
    ? mixedLabel
    : (value ?? automaticLabel ?? noFillLabel);
  useEffect(() => {
    if (disabled && open) onDismiss();
  }, [disabled, onDismiss, open]);
  useEffect(() => {
    if (disabled && secondary?.open) onDismiss();
  }, [disabled, onDismiss, secondary?.open]);
  const palette =
    open && !disabled ? (
      <OfficeColorPalettePopover
        anchorRef={triggerRef}
        value={mixed ? undefined : (value ?? undefined)}
        recents={recents}
        allowNoFill={allowNoFill}
        noFillSelected={!mixed && value === null}
        automaticSelected={!mixed && value === null && Boolean(onAutomatic)}
        labels={{
          ...labels,
          ...(allowNoFill ? { noFill: noFillLabel } : {}),
          ...(automaticLabel ? { automatic: automaticLabel } : {}),
        }}
        onAutomatic={onAutomatic}
        onPick={onPick}
        onDismiss={onDismiss}
        testIdPrefix={testId}
        formatPreview={formatPreview}
        footer={
          secondary ? (
            <button
              type="button"
              className="office-ribbon-control note-editor-office-toolbar__button"
              data-office-control-part="button"
              data-testid={`${secondary.testId}-open`}
              onClick={secondary.onOpen}
            >
              {secondary.label}
            </button>
          ) : undefined
        }
      />
    ) : secondary?.open && !disabled ? (
      <OfficeColorPalettePopover
        anchorRef={triggerRef}
        value={secondary.value ?? undefined}
        recents={recents}
        allowNoFill
        noFillSelected={secondary.value === null}
        labels={{ ...labels, noFill: secondary.noFillLabel }}
        onPick={secondary.onPick}
        onDismiss={onDismiss}
        testIdPrefix={secondary.testId}
      />
    ) : null;
  if (onApplyCurrent) {
    return (
      <span className={anchorClassName}>
        <OfficeHomeSplitLayout
          testId={`${testId}-split`}
          primary={
            <OfficeHomeCommand
              variant="icon"
              controlId={applyCurrentControlId}
              disabled={disabled || mixed}
              icon={icon}
              label={`${label}: ${currentLabel}`}
              onClick={onApplyCurrent}
              testId={testId}
            />
          }
          trigger={
            <OfficeHomeMenuTrigger
              ref={triggerRef}
              active={mixed ? "mixed" : open}
              aria-expanded={open}
              aria-haspopup="dialog"
              data-control-id={menuControlId}
              disabled={disabled}
              icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
              label={`${label}: ${currentLabel}`}
              onClick={onToggle}
              onPointerDown={(event) => {
                if (open) event.stopPropagation();
              }}
              testId={`${testId}-menu`}
              variant="icon"
            />
          }
        />
        {palette}
      </span>
    );
  }
  return (
    <span className={anchorClassName}>
      <OfficeHomeMenuTrigger
        ref={triggerRef}
        active={mixed ? "mixed" : open}
        aria-expanded={open}
        aria-haspopup="dialog"
        controlId={menuControlId}
        disabled={disabled}
        displayLabel={displayLabel}
        hasMenuIndicator
        icon={icon}
        label={`${label}: ${currentLabel}`}
        onClick={onToggle}
        onPointerDown={(event) => {
          if (open) event.stopPropagation();
        }}
        testId={testId}
        variant={triggerVariant}
      />
      {palette}
    </span>
  );
}

export const TABLE_CELL_FONT_SIZE_OPTIONS = [
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54,
  60, 66, 72, 80, 90, 96,
].map((value) => ({ value: String(value), label: String(value) }));

export const TABLE_CELL_MARGIN_VALUE_OPTIONS = [
  0, 2.4, 4.8, 7.2, 9.6, 12, 14.4, 19.2, 24, 32, 48, 72, 96,
].map((value) => ({ value: String(value), label: String(value) }));

export const EMPTY_TABLE_CELL_MARGIN_DRAFTS: Record<TableCellMarginField, string> = {
  marginLeft: "",
  marginRight: "",
  marginTop: "",
  marginBottom: "",
};

export type ContextualTableAxis = "col" | "row";

export const EMPTY_TABLE_AXIS_SIZE_DRAFTS: Record<ContextualTableAxis, string> = {
  col: "",
  row: "",
};

export const TABLE_CELL_BORDER_POINT_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6] as const;

export const TABLE_CELL_BORDER_WIDTH_OPTIONS = TABLE_CELL_BORDER_POINT_WEIGHTS.map((points) => ({
  value: String(lineWeightPointsToDesignPx(points)), label: officeBorderWeightLabel(points),
}));

export function PresentationTableCellMarginMenu({
  disabled = false,
  displayLabel,
  labels,
  onCustom,
  onSelect,
  testId,
  triggerRef,
  triggerVariant = "compact",
  value,
}: {
  disabled?: boolean;
  displayLabel?: string;
  labels: TableCellMarginMenuLabels;
  onCustom: () => void;
  onSelect: (preset: TableCellMarginPreset) => void;
  testId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  triggerVariant?: "large" | "compact" | "icon";
  value: TableCellMarginMenuValue;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          ref={triggerRef}
          active={value === "mixed" ? "mixed" : value !== "normal"}
          disabled={disabled}
          displayLabel={displayLabel ?? labels[value]}
          hasMenuIndicator
          icon={<IconTableCellMargins home size={20} />}
          label={labels.title}
          testId={testId}
          variant={triggerVariant}
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        data-testid={`${testId}-menu`}
      >
        <DropdownMenuLabel>{labels.title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value === "mixed" || value === "custom" ? "" : value}
        >
          {TABLE_CELL_MARGIN_PRESETS.map((preset) => (
            <DropdownMenuRadioItem
              disabled={disabled}
              key={preset}
              value={preset}
              onSelect={() => onSelect(preset)}
              data-testid={`${testId}-${preset}`}
            >
              {labels[preset]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled}
          onSelect={onCustom}
          data-testid={`${testId}-custom`}
        >
          {labels.custom}
        </DropdownMenuItem>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Table Design ▸ Borders, the Docs Table Layout ▸ Borders menu's shape
 * (DocumentTableBordersMenu): a preset glyph grid, then Line style / Colour /
 * Cell margins submenus, then Draw Table and View Gridlines. PowerPoint keeps
 * the pen's style, weight and colour in its Draw Borders group as well; those
 * controls stay, this menu is the Borders button's own sheet. Preset ids keep
 * the `<testId>-<target>` ids the ribbon tests press.
 */
export function PresentationTableBordersMenu({
  colorSection,
  disabled = false,
  drawTable,
  gridlines,
  icon,
  label,
  marginSection,
  menuControlId,
  onSelect,
  options,
  styleSection,
  testId,
  value,
}: {
  colorSection: {
    title: string;
    value: string;
    labels: OfficeColorPalettePanelLabels;
    recents?: readonly string[];
    onPick: (color: string) => void;
  };
  disabled?: boolean;
  drawTable: { active: boolean; label: string; onToggle: () => void };
  gridlines: { checked: boolean; label: string; onChange: (checked: boolean) => void };
  icon: ReactNode;
  label: string;
  marginSection: {
    title: string;
    value: string;
    options: readonly { value: string; label: string }[];
    customLabel: string;
    onSelect: (preset: TableCellMarginPreset) => void;
    onCustom: () => void;
  };
  menuControlId?: string;
  onSelect: (value: TableBorderTarget) => void;
  options: readonly TableCellChoiceOption<TableBorderTarget>[];
  styleSection: {
    title: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onSelect: (value: string) => void;
  };
  testId: string;
  value: TableBorderTarget;
}) {
  // Picking a pen style or colour puts the pen in the user's hand (the host
  // arms Draw Table, as PowerPoint does), so the menu gets out of the way.
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          controlId={menuControlId}
          disabled={disabled}
          displayLabel={label}
          hasMenuIndicator
          icon={icon}
          label={`${label}: ${options.find((option) => option.value === value)?.label ?? label}`}
          testId={testId}
          variant="large"
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className={officeBordersMenuStyles.menu}
        data-testid={`${testId}-menu`}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <OfficeBorderPresetItems
          groupLabel={label}
          disabled={disabled}
          presets={[...options]
            .sort((a, b) => BORDER_LIST_ORDER.indexOf(a.value) - BORDER_LIST_ORDER.indexOf(b.value))
            .map((option) => ({
            id: option.value,
            label: option.label,
            icon: option.icon,
            checked: option.value === value,
            disabled: option.disabled,
            testId: `${testId}-${option.value}`,
            group: tableBorderTargetGroup(option.value),
            onSelect: () => onSelect(option.value),
          }))}
        />
        <DropdownMenuSeparator />
        <OfficeBorderMenuSections
          disabled={disabled}
          sections={[
            {
              id: "style",
              kind: "choices",
              label: styleSection.title,
              value: styleSection.value,
              triggerTestId: `${testId}-style-menu`,
              options: styleSection.options.map((option) => ({
                id: option.value,
                label: option.label,
                testId: `${testId}-style-${option.value}`,
              })),
              onSelect: (picked) => {
                styleSection.onSelect(picked);
                setOpen(false);
              },
            },
            {
              id: "color",
              kind: "color-palette",
              label: colorSection.title,
              value: colorSection.value,
              triggerTestId: `${testId}-color-menu`,
              testIdPrefix: `${testId}-color`,
              labels: colorSection.labels,
              recents: colorSection.recents,
              onSelect: (color) => {
                colorSection.onPick(color);
                setOpen(false);
              },
            },
            {
              id: "margins",
              kind: "choices",
              label: marginSection.title,
              value: marginSection.value,
              triggerTestId: `${testId}-margin-menu`,
              options: [
                ...marginSection.options.map((option) => ({
                  id: option.value,
                  label: option.label,
                  testId: `${testId}-margin-${option.value}`,
                })),
                {
                  id: "custom",
                  label: marginSection.customLabel,
                  testId: `${testId}-margin-custom`,
                },
              ],
              onSelect: (picked) => {
                if (picked === "custom") marginSection.onCustom();
                else marginSection.onSelect(picked as TableCellMarginPreset);
              },
            },
          ]}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled}
          data-testid={`${testId}-draw-table`}
          onSelect={drawTable.onToggle}
        >
          <IconTableDraw />
          {drawTable.label}
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={gridlines.checked}
          data-testid={`${testId}-gridlines`}
          onCheckedChange={(checked) => gridlines.onChange(checked === true)}
        >
          <OfficeSemanticIcon semanticId="table.gridlines" size={16} />
          {gridlines.label}
        </DropdownMenuCheckboxItem>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

export const TABLE_BORDER_TARGET_LABEL_KEYS = {
  all: "presentation.tableRibbon.borderTarget.all",
  outside: "presentation.tableRibbon.borderTarget.outside",
  inside: "presentation.tableRibbon.borderTarget.inside",
  "inside-horizontal": "presentation.tableRibbon.borderTarget.insideHorizontal",
  "inside-vertical": "presentation.tableRibbon.borderTarget.insideVertical",
  top: "presentation.tableRibbon.borderTarget.top",
  bottom: "presentation.tableRibbon.borderTarget.bottom",
  left: "presentation.tableRibbon.borderTarget.left",
  right: "presentation.tableRibbon.borderTarget.right",
  "diagonal-down": "presentation.tableRibbon.borderTarget.diagonalDown",
  "diagonal-up": "presentation.tableRibbon.borderTarget.diagonalUp",
  none: "presentation.tableRibbon.borderTarget.none",
} as const satisfies Record<TableBorderTarget, string>;

export const TABLE_CELL_BORDER_KEYS = [
  "borderLeft",
  "borderRight",
  "borderTop",
  "borderBottom",
  "borderDiagonalDown",
  "borderDiagonalUp",
] as const;

export const TABLE_BORDER_STATE_PROBE: TableCellBorder = Object.freeze({
  style: "solid",
  color: DEFAULT_TABLE_CELL_BORDER_COLOR,
  width: DEFAULT_TABLE_CELL_BORDER_WIDTH,
});
