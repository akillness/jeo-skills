"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The master's text styles in Slide Master view of an Office theme deck
 * (PPT-B030): pick the title style or one of the body style's five levels,
 * then its size, bold, italic and colour -- what PowerPoint edits from the
 * Home tab with that level's text selected on the master ("Change the font
 * size", Microsoft Support). Every slide inherits the change; Reset gives the
 * level the theme's values back. The window commits each change as one undo
 * step through the deck theme.
 */

import { useState } from "react";

import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import { TEXT_COLOR_VALUES } from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import { officeFontSizeOptions, parseOfficeFontSizeInput } from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { OfficeHomeCommand, OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { RibbonValueCombobox } from "@mrnote/core/web/components/office-ribbon/RibbonValueCombobox.tsx";
import { RotateCcw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { DropdownMenu, DropdownMenuSeparator, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import type { OfficeMasterTextLevel } from "../../../../lib/presentation-office-master";
import type { OfficeMasterTextValues } from "@mrnote/core/web/lib/presentation-office-master-model.ts";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";

import { PresentationCustomColorItem, PresentationSwatchGrid } from "@mrnote/core/web/components/notebook/contents/ribbon/ColorMenu.tsx";

export interface PresentationOfficeMasterTextStyleBarLabels {
  readonly level: string;
  readonly title: string;
  /** The body's five levels: "Body", "Second level" .. "Fifth level". */
  readonly bodyLevels: readonly string[];
  readonly fontSize: string;
  readonly bold: string;
  readonly italic: string;
  readonly color: string;
  readonly customColor: string;
  readonly reset: string;
}

export interface PresentationOfficeMasterTextStyleBarProps {
  readonly labels: PresentationOfficeMasterTextStyleBarLabels;
  readonly target: OfficeMasterTextLevel;
  readonly onTarget: (target: OfficeMasterTextLevel) => void;
  /** What the level draws now (the master's value, else the theme's). */
  readonly values: OfficeMasterTextValues;
  /** Whether the master states anything of its own at this level. */
  readonly overridden: boolean;
  readonly disabled: boolean;
  readonly onPatch: (patch: { [K in keyof OfficeMasterTextValues]?: OfficeMasterTextValues[K] | null }) => void;
  readonly onReset: () => void;
}

const MASTER_FONT_SIZE_OPTIONS = officeFontSizeOptions("powerpoint");

const TARGET_VALUES = ["title:1", "body:1", "body:2", "body:3", "body:4", "body:5"] as const;

function targetFromValue(value: string): OfficeMasterTextLevel {
  const [style, level] = value.split(":");
  return style === "title"
    ? { style: "title", level: "1" }
    : { style: "body", level: (level ?? "1") as "1" | "2" | "3" | "4" | "5" };
}

export function PresentationOfficeMasterTextStyleBar({
  labels,
  target,
  onTarget,
  values,
  overridden,
  disabled,
  onPatch,
  onReset,
}: PresentationOfficeMasterTextStyleBarProps) {
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const targetValue = `${target.style}:${target.level}`;
  return (
    <div
      className={presentationChrome.masterStyleGroup}
      data-testid="presentation-office-master-text-styles"
      data-master-level={targetValue}
    >
      <label className={presentationChrome.masterStyleLevel}>
        <span className={presentationChrome.masterCardUsage}>{labels.level}</span>
        <select
          value={targetValue}
          disabled={disabled}
          onChange={(event) => onTarget(targetFromValue(event.target.value))}
          data-testid="presentation-office-master-level"
          aria-label={labels.level}
        >
          {TARGET_VALUES.map((value) => {
            const level = targetFromValue(value);
            return (
              <option key={value} value={value}>
                {level.style === "title" ? labels.title : labels.bodyLevels[Number(level.level) - 1]}
              </option>
            );
          })}
        </select>
      </label>
      <RibbonValueCombobox
        testId="presentation-office-master-font-size"
        label={labels.fontSize}
        placeholder={labels.fontSize}
        inputMode="decimal"
        className="note-editor-ribbon-value-combobox--font-size"
        selectOnFocus
        disabled={disabled}
        value={sizeDraft ?? (values.fontSize === undefined ? "" : String(values.fontSize))}
        // The level's size is points: PowerPoint's list and its 1-3600
        // tenths rule (the Docs px list and whole numbers turned 10.5 into 11).
        options={MASTER_FONT_SIZE_OPTIONS}
        onDraftChange={setSizeDraft}
        onFocusChange={(focused) => {
          if (!focused) setSizeDraft(null);
        }}
        onRememberSelection={() => {}}
        onCommit={(next) => {
          const size = parseOfficeFontSizeInput(next, "powerpoint");
          if (size === undefined) return false;
          setSizeDraft(null);
          onPatch({ fontSize: size });
          return true;
        }}
      />
      <OfficeHomeCommand
        active={values.bold === true}
        disabled={disabled}
        icon={<DocsHomeIcon name="bold" size={17} />}
        label={labels.bold}
        onClick={() => onPatch({ bold: !(values.bold === true) })}
        testId="presentation-office-master-bold"
        variant="icon"
      />
      <OfficeHomeCommand
        active={values.italic === true}
        disabled={disabled}
        icon={<DocsHomeIcon name="italic" size={17} />}
        label={labels.italic}
        onClick={() => onPatch({ italic: !(values.italic === true) })}
        testId="presentation-office-master-italic"
        variant="icon"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            variant="icon"
            hasMenuIndicator
            disabled={disabled}
            icon={
              <span className="note-editor-office-toolbar__color-glyph" aria-hidden="true">
                <DocsHomeIcon name="fontColor" size={17} />
                <span
                  className="note-editor-office-toolbar__color-underline"
                  style={{ backgroundColor: values.color ?? "#000000" }}
                />
              </span>
            }
            label={labels.color}
            testId="presentation-office-master-color-menu"
          />
        </DropdownMenuTrigger>
        <RibbonDropdownMenuContent align="start" className="note-editor-color-menu">
          <PresentationSwatchGrid
            colors={TEXT_COLOR_VALUES}
            current={values.color}
            label={labels.color}
            onPick={(color) => onPatch({ color })}
            testPrefix="presentation-office-master-color"
            variant="text"
          />
          <DropdownMenuSeparator />
          <PresentationCustomColorItem
            label={labels.customColor}
            value={values.color ?? "#000000"}
            onPick={(color) => onPatch({ color })}
            testId="presentation-office-master-color-custom"
          />
        </RibbonDropdownMenuContent>
      </DropdownMenu>
      <OfficeHomeCommand
        disabled={disabled || !overridden}
        icon={<RotateCcw size={17} />}
        label={labels.reset}
        onClick={onReset}
        testId="presentation-office-master-reset"
        variant="icon"
      />
    </div>
  );
}
