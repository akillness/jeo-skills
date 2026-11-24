"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../lib/office-units";
import {
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import {
  RibbonDropdownMenuContent,
  RibbonDropdownMenuSubContent,
} from "./CupertinoRibbonMenu";
import {
  OfficeColorPalettePanel,
  type OfficeColorPalettePanelLabels,
  type OfficeColorPaletteEntry,
} from "./OfficeColorPalettePanel";
import styles from "./OfficeBordersMenu.module.css";

type CheckboxItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuCheckboxItem
>;

export const OFFICE_BORDER_LINE_STYLE_IDS = [
  "thin",
  "dashed",
  "dotted",
  "medium",
  "thick",
  "double",
] as const;

export type OfficeBorderLineStyleId =
  (typeof OFFICE_BORDER_LINE_STYLE_IDS)[number];

export type OfficeBorderLineSpec = Readonly<{
  style: "single" | "double" | "dashed" | "dotted";
  sizePt: number;
}>;

export function officeBorderLineStyleForSpec(line: {
  readonly style: string;
  readonly sizePt: number;
}): OfficeBorderLineStyleId {
  if (line.style === "double") return "double";
  if (line.style === "dashed") return "dashed";
  if (line.style === "dotted") return "dotted";
  if (line.sizePt >= 2.25) return "thick";
  if (line.sizePt >= 1.25) return "medium";
  return "thin";
}

export function officeBorderLineSpecForStyle(
  lineStyle: OfficeBorderLineStyleId,
): OfficeBorderLineSpec {
  switch (lineStyle) {
    case "dashed":
      return { style: "dashed", sizePt: 0.5 };
    case "dotted":
      return { style: "dotted", sizePt: 0.5 };
    case "medium":
      return { style: "single", sizePt: 1.5 };
    case "thick":
      return { style: "single", sizePt: 3 };
    case "double":
      return { style: "double", sizePt: 0.5 };
    case "thin":
      return { style: "single", sizePt: 0.5 };
  }
}

export interface OfficeBorderPresetOption {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly checked?: boolean | "indeterminate";
  readonly disabled?: boolean;
  readonly testId: string;
  readonly itemProps?: CheckboxItemProps;
  readonly onSelect: NonNullable<CheckboxItemProps["onSelect"]>;
  /**
   * The menu's group the preset belongs to; the list draws a rule where the
   * group changes, as Word's and Excel's Borders lists do (single edges,
   * whole boxes, inside lines and diagonals).
   */
  readonly group?: string;
}

export interface OfficeBorderMenuChoice {
  readonly id: string;
  readonly label: ReactNode;
  readonly testId: string;
  readonly disabled?: boolean;
}

interface OfficeBorderMenuSectionBase {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: string;
  readonly disabled?: boolean;
  readonly triggerTestId: string;
  readonly onSelect: (value: string) => void;
}

export interface OfficeBorderChoiceSection extends OfficeBorderMenuSectionBase {
  readonly kind?: "choices";
  readonly options: readonly OfficeBorderMenuChoice[];
}

export interface OfficeBorderLineStyleSection extends OfficeBorderMenuSectionBase {
  readonly kind: "line-styles";
  readonly value: OfficeBorderLineStyleId;
  readonly options: readonly (OfficeBorderMenuChoice & {
    readonly id: OfficeBorderLineStyleId;
    readonly label: string;
  })[];
}

export interface OfficeBorderColorSection extends OfficeBorderMenuSectionBase {
  readonly kind: "color-palette";
  readonly value: string;
  readonly testIdPrefix: string;
  readonly labels: OfficeColorPalettePanelLabels;
  readonly paletteId?: string;
  readonly themeColumns?: readonly (readonly string[])[];
  readonly onPickEntry?: (
    color: string,
    entry?: OfficeColorPaletteEntry,
  ) => void;
  readonly recents?: readonly string[];
  readonly onAutomatic?: () => void;
  readonly automaticSelected?: boolean;
  readonly allowNoFill?: boolean;
  readonly noFillSelected?: boolean;
  readonly onClear?: () => void;
}

export type OfficeBorderMenuSection =
  | OfficeBorderChoiceSection
  | OfficeBorderLineStyleSection
  | OfficeBorderColorSection;

interface OfficeBordersMenuBodyProps {
  readonly title: ReactNode;
  readonly presetGroupLabel: string;
  readonly presets: readonly OfficeBorderPresetOption[];
  readonly sections: readonly OfficeBorderMenuSection[];
  readonly disabled?: boolean;
  readonly beforePresets?: ReactNode;
  readonly afterSections?: ReactNode;
  /**
   * "list" (default) draws the presets as labelled rows, icon then name, the
   * way Word's and Excel's Borders menus list them; "grid" as an icon grid.
   */
  readonly layout?: "grid" | "list";
}

export function OfficeBorderLinePreview({
  lineStyle,
  sizePt,
}: {
  readonly lineStyle?: OfficeBorderLineStyleId;
  readonly sizePt?: number;
}) {
  return (
    <span
      className={`${styles.linePreview}${lineStyle ? ` ${styles[`linePreview_${lineStyle}`]}` : ""}`}
      data-office-border-line-preview={lineStyle}
      data-office-border-weight-preview={sizePt}
      style={
        sizePt === undefined
          ? undefined
          : { borderTopWidth: Math.min(16, Math.max(1 / 3, ptToPx(sizePt))) }
      }
      aria-hidden
    />
  );
}

export function officeBorderWeightLabel(points: number, unit = "pt"): string {
  if (!Number.isFinite(points) || points < 0) return "";
  const quarters = Math.round(points * 4);
  if (Number.isFinite(points) && Math.abs(points * 4 - quarters) < 1e-7) {
    const whole = Math.floor(quarters / 4);
    const fraction = ["", "¼", "½", "¾"][quarters % 4];
    return `${whole || !fraction ? whole : ""}${fraction} ${unit}`;
  }
  return `${Number(points.toFixed(3))} ${unit}`;
}

/** A display-only menu. Catalogs, units and native transactions belong to the host. */
export function OfficeBorderWeightMenu({
  points,
  valuePt,
  unit = "pt",
  label,
  disabled = false,
  onSelect,
  renderTrigger,
  testIdPrefix,
}: {
  readonly points: readonly number[];
  readonly valuePt: number | null;
  readonly unit?: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onSelect: (points: number) => void;
  readonly renderTrigger: (open: boolean) => ReactElement;
  readonly testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) setOpen(false);
  }
  const unavailable = useRef(disabled);
  useEffect(() => {
    unavailable.current = disabled;
    return () => {
      unavailable.current = true;
    };
  }, [disabled]);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => setOpen(next && !unavailable.current)}
      modal={false}
    >
      <DropdownMenuTrigger asChild>{renderTrigger(open)}</DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className={styles.weightMenu}
        aria-label={label}
        data-testid={`${testIdPrefix}-menu`}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuRadioGroup value={valuePt === null ? "" : String(valuePt)}>
          {points
            .filter((point) => Number.isFinite(point) && point > 0)
            .map((point) => (
              <DropdownMenuRadioItem
                key={point}
                value={String(point)}
                disabled={disabled}
                aria-label={officeBorderWeightLabel(point, unit)}
                className={styles.weightItem}
                data-testid={`${testIdPrefix}-${point}`}
                onSelect={() => {
                  if (unavailable.current) return;
                  onSelect(point);
                  setOpen(false);
                }}
              >
                <OfficeBorderLinePreview sizePt={point} />
                <span>{officeBorderWeightLabel(point, unit)}</span>
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/** Standalone entry to the same line-style radio list used by Docs/Sheet. */
export function OfficeBorderLineStyleMenu({
  section,
  disabled = false,
  renderTrigger,
  testId,
}: {
  readonly section: OfficeBorderLineStyleSection;
  readonly disabled?: boolean;
  readonly renderTrigger: (open: boolean) => ReactElement;
  readonly testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) setOpen(false);
  }
  const unavailable = useRef(disabled);
  useEffect(() => {
    unavailable.current = disabled;
    return () => {
      unavailable.current = true;
    };
  }, [disabled]);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => setOpen(next && !unavailable.current)}
      modal={false}
    >
      <DropdownMenuTrigger asChild>{renderTrigger(open)}</DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className={styles.lineStyleMenu}
        data-testid={testId}
      >
        <OfficeBorderLineStylePicker
          section={{
            ...section,
            onSelect: (value) => {
              if (!unavailable.current) section.onSelect(value);
            },
          }}
          disabled={disabled}
          close={() => setOpen(false)}
        />
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

function OfficeBorderLineStylePicker({
  section,
  disabled,
  close,
}: {
  readonly section: OfficeBorderLineStyleSection;
  readonly disabled: boolean;
  readonly close: () => void;
}) {
  return (
    <DropdownMenuRadioGroup
      value={section.value}
      onValueChange={(value) => {
        section.onSelect(value);
        close();
      }}
      aria-label={typeof section.label === "string" ? section.label : undefined}
    >
      {section.options.map((option) => (
        <DropdownMenuRadioItem
          key={option.id}
          value={option.id}
          aria-label={option.label}
          title={option.label}
          disabled={disabled || option.disabled}
          className={styles.lineStyleItem}
          data-testid={option.testId}
          onSelect={(event) => event.preventDefault()}
        >
          <OfficeBorderLinePreview lineStyle={option.id} />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

function OfficeBorderColorPicker({
  section,
  disabled,
  close,
}: {
  readonly section: OfficeBorderColorSection;
  readonly disabled: boolean;
  readonly close: () => void;
}) {
  return (
    <OfficeColorPalettePanel
      value={section.value}
      paletteId={section.paletteId}
      themeColumns={section.themeColumns}
      onPickEntry={
        section.onPickEntry
          ? (color, entry) => {
              if (color !== null) section.onPickEntry?.(color, entry);
              else section.onClear?.();
              close();
            }
          : undefined
      }
      recents={section.recents}
      labels={section.labels}
      onAutomatic={section.onAutomatic}
      automaticSelected={section.automaticSelected}
      allowNoFill={Boolean(section.allowNoFill && section.onClear)}
      noFillSelected={section.noFillSelected}
      disabled={disabled}
      onPick={(color) => {
        if (color === null) section.onClear?.();
        else section.onSelect(color);
        close();
      }}
      testIdPrefix={section.testIdPrefix}
    />
  );
}

function OfficeBorderChoicePicker({
  section,
  disabled,
  close,
}: {
  readonly section: OfficeBorderChoiceSection;
  readonly disabled: boolean;
  readonly close: () => void;
}) {
  return (
    <DropdownMenuRadioGroup
      value={section.value}
      onValueChange={(value) => {
        section.onSelect(value);
        close();
      }}
    >
      {section.options.map((option) => (
        <DropdownMenuRadioItem
          key={option.id}
          value={option.id}
          disabled={disabled || option.disabled}
          data-testid={option.testId}
          onSelect={(event) => event.preventDefault()}
        >
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function OfficeBorderMenuSections({
  sections,
  disabled = false,
}: {
  readonly sections: readonly OfficeBorderMenuSection[];
  readonly disabled?: boolean;
}) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const close = () => setOpenSectionId(null);
  return sections.map((section) => {
    const sectionDisabled = disabled || Boolean(section.disabled);
    return (
      <DropdownMenuSub
        key={section.id}
        open={openSectionId === section.id}
        onOpenChange={(open) => {
          setOpenSectionId((currentSectionId) => {
            if (open) return section.id;
            return currentSectionId === section.id ? null : currentSectionId;
          });
        }}
      >
        <DropdownMenuSubTrigger
          disabled={sectionDisabled}
          data-testid={section.triggerTestId}
          data-office-borders-current-value={section.value}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch" && !sectionDisabled) {
              setOpenSectionId(section.id);
            }
          }}
        >
          {section.label}
        </DropdownMenuSubTrigger>
        <RibbonDropdownMenuSubContent
          className={
            section.kind === "line-styles"
              ? styles.lineStyleMenu
              : section.kind === "color-palette"
                ? styles.colorPaletteMenu
                : undefined
          }
          data-office-borders-submenu={section.id}
        >
          {section.kind === "line-styles" ? (
            <OfficeBorderLineStylePicker
              section={section}
              disabled={sectionDisabled}
              close={close}
            />
          ) : section.kind === "color-palette" ? (
            <OfficeBorderColorPicker
              section={section}
              disabled={sectionDisabled}
              close={close}
            />
          ) : (
            <OfficeBorderChoicePicker
              section={section}
              disabled={sectionDisabled}
              close={close}
            />
          )}
        </RibbonDropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}

/**
 * The border presets of a Borders menu, as labelled rows (grouped by rule) or
 * an icon grid. Every editor's Borders menu draws its presets with this.
 */
export function OfficeBorderPresetItems({
  presets,
  groupLabel,
  layout = "list",
  disabled = false,
}: {
  readonly presets: readonly OfficeBorderPresetOption[];
  readonly groupLabel: string;
  readonly layout?: "grid" | "list";
  readonly disabled?: boolean;
}) {
  const list = layout === "list";
  return (
    <div
      className={list ? styles.presetList : styles.presetGrid}
      role="group"
      aria-label={groupLabel}
      data-office-borders-preset-grid={list ? undefined : "true"}
      data-office-borders-preset-list={list ? "true" : undefined}
    >
      {presets.map((option, index) => {
        const rule =
          list &&
          index > 0 &&
          option.group !== undefined &&
          option.group !== presets[index - 1]?.group ? (
            <DropdownMenuSeparator
              key={`${option.id}-rule`}
              className={styles.presetRule}
            />
          ) : null;
        const { className, ...itemProps } = option.itemProps ?? {};
        const content = list ? (
          <>
            <span className={styles.presetRowIcon} aria-hidden>
              {option.icon}
            </span>
            <span>{option.label}</span>
          </>
        ) : (
          option.icon
        );
        // A preset the host reports no state for is a command, as each
        // entry of Excel's Borders list is: it is not announced (or drawn)
        // as an unchecked box, which read as "no border is on".
        if (option.checked === undefined) {
          const { onCheckedChange: _onCheckedChange, ...commandProps } = itemProps;
          void _onCheckedChange;
          return [
            rule,
            <DropdownMenuItem
              key={option.id}
              {...commandProps}
              aria-label={option.label}
              title={option.itemProps?.title ?? (list ? undefined : option.label)}
              className={`${list ? styles.presetRow : styles.preset}${className ? ` ${className}` : ""}`}
              data-testid={option.testId}
              data-office-borders-command="true"
              disabled={disabled || option.disabled || itemProps.disabled}
              onSelect={option.onSelect}
            >
              {content}
            </DropdownMenuItem>,
          ];
        }
        const checked = option.checked;
        return [
          rule,
          <DropdownMenuCheckboxItem
            key={option.id}
            {...itemProps}
            checked={checked}
            aria-label={option.label}
            title={option.itemProps?.title ?? (list ? undefined : option.label)}
            className={`${list ? styles.presetRow : styles.preset}${className ? ` ${className}` : ""}`}
            data-testid={option.testId}
            disabled={disabled || option.disabled || itemProps.disabled}
            data-state={
              checked === "indeterminate"
                ? "indeterminate"
                : checked
                  ? "checked"
                  : "unchecked"
            }
            onSelect={option.onSelect}
          >
            {content}
          </DropdownMenuCheckboxItem>,
        ];
      })}
    </div>
  );
}

export default function OfficeBordersMenuBody({
  title,
  presetGroupLabel,
  presets,
  sections,
  disabled = false,
  beforePresets,
  afterSections,
  layout = "list",
}: OfficeBordersMenuBodyProps) {
  return (
    <>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {beforePresets}
      <OfficeBorderPresetItems
        presets={presets}
        groupLabel={presetGroupLabel}
        layout={layout}
        disabled={disabled}
      />
      {sections.length > 0 ? <DropdownMenuSeparator /> : null}
      <OfficeBorderMenuSections sections={sections} disabled={disabled} />
      {afterSections}
    </>
  );
}

export { styles as officeBordersMenuStyles };
