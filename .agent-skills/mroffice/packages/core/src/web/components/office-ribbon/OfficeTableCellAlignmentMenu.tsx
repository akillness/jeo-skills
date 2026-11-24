"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { RibbonDropdownMenuContent } from "./CupertinoRibbonMenu";
import { OfficeHomeMenuTrigger } from "./OfficeHomeRibbon";

export type OfficeTableCellHorizontalAlignment = "left" | "center" | "right";
export type OfficeTableCellVerticalAlignment = "top" | "middle" | "bottom";

export interface OfficeTableCellAlignmentValue {
  readonly horizontal: OfficeTableCellHorizontalAlignment;
  readonly vertical: OfficeTableCellVerticalAlignment;
}

interface OfficeTableCellAlignmentLabels {
  readonly left: string;
  readonly center: string;
  readonly right: string;
}

interface OfficeTableCellVerticalAlignmentLabels {
  readonly top: string;
  readonly middle: string;
  readonly bottom: string;
}

export interface OfficeTableCellAlignmentMenuProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly horizontal: OfficeTableCellHorizontalAlignment;
  readonly horizontalLabels: OfficeTableCellAlignmentLabels;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly mixed?: boolean;
  readonly mixedLabel: string;
  readonly onSelect: (value: OfficeTableCellAlignmentValue) => void;
  readonly presentation?: "menu" | "inline";
  readonly testId: string;
  readonly vertical: OfficeTableCellVerticalAlignment;
  readonly verticalLabels: OfficeTableCellVerticalAlignmentLabels;
}

const HORIZONTAL_ALIGNMENTS: readonly OfficeTableCellHorizontalAlignment[] = [
  "left",
  "center",
  "right",
];
const VERTICAL_ALIGNMENTS: readonly OfficeTableCellVerticalAlignment[] = [
  "top",
  "middle",
  "bottom",
];

const ALIGNMENT_VALUES: readonly OfficeTableCellAlignmentValue[] =
  VERTICAL_ALIGNMENTS.flatMap((vertical) =>
    HORIZONTAL_ALIGNMENTS.map((horizontal) => ({ horizontal, vertical })),
  );

function alignmentValueId({
  horizontal,
  vertical,
}: OfficeTableCellAlignmentValue): string {
  return `${vertical}-${horizontal}`;
}

function lineStart(
  horizontal: OfficeTableCellHorizontalAlignment,
  width: number,
): number {
  if (horizontal === "left") return 5;
  if (horizontal === "right") return 19 - width;
  return 12 - width / 2;
}

/**
 * A state-preview glyph, shared by every editor that exposes the Office 3x3
 * cell-alignment gallery. It intentionally reflects both axes instead of
 * borrowing a generic paragraph-alignment icon for a two-dimensional command.
 */
export function OfficeTableCellAlignmentGlyph({
  horizontal,
  vertical,
}: OfficeTableCellAlignmentValue) {
  const firstY = vertical === "top" ? 6 : vertical === "middle" ? 9 : 12;
  const lines = [9, 6, 8] as const;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={24}
      viewBox="0 0 24 24"
      width={24}
    >
      <rect
        fill="none"
        height="19"
        rx="1.5"
        stroke="currentColor"
        strokeOpacity="0.42"
        strokeWidth="1.25"
        width="19"
        x="2.5"
        y="2.5"
      />
      {lines.map((width, index) => {
        const x = lineStart(horizontal, width);
        const y = firstY + index * 3;
        return (
          <line
            key={`${width}-${index}`}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
            x1={x}
            x2={x + width}
            y1={y}
            y2={y}
          />
        );
      })}
    </svg>
  );
}

/**
 * Shared Office cell-alignment command surface. Editor adapters remain the
 * authority for reading mixed selections and applying the two attrs atomically.
 */
export function OfficeTableCellAlignmentMenu({
  className,
  disabled,
  horizontal,
  horizontalLabels,
  icon,
  label,
  mixed = false,
  mixedLabel,
  onSelect,
  presentation = "menu",
  testId,
  vertical,
  verticalLabels,
}: OfficeTableCellAlignmentMenuProps) {
  const inlineButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const value = alignmentValueId({ horizontal, vertical });
  const activeLabel = mixed
    ? mixedLabel
    : `${verticalLabels[vertical]} · ${horizontalLabels[horizontal]}`;

  const optionLabel = (option: OfficeTableCellAlignmentValue) =>
    `${verticalLabels[option.vertical]} · ${horizontalLabels[option.horizontal]}`;

  const moveInlineFocus = (
    currentIndex: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % ALIGNMENT_VALUES.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + ALIGNMENT_VALUES.length) % ALIGNMENT_VALUES.length;
    } else if (event.key === "ArrowDown") {
      nextIndex =
        (currentIndex + HORIZONTAL_ALIGNMENTS.length) % ALIGNMENT_VALUES.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        (currentIndex -
          HORIZONTAL_ALIGNMENTS.length +
          ALIGNMENT_VALUES.length) %
        ALIGNMENT_VALUES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ALIGNMENT_VALUES.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = ALIGNMENT_VALUES[nextIndex];
    if (!next) return;
    inlineButtonRefs.current[nextIndex]?.focus();
  };

  if (presentation === "inline") {
    return (
      <div
        className={className}
        role="radiogroup"
        aria-label={`${label}: ${activeLabel}`}
        data-office-table-alignment-inline="true"
        data-testid={`${testId}-inline`}
      >
        {ALIGNMENT_VALUES.map((option, index) => {
          const optionId = alignmentValueId(option);
          const labelForOption = optionLabel(option);
          const active = !mixed && optionId === value;
          return (
            <button
              key={optionId}
              ref={(node) => {
                inlineButtonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={labelForOption}
              className="note-editor-office-table-alignment-option"
              data-active={active ? "true" : undefined}
              data-testid={`${testId}-${optionId}`}
              disabled={disabled}
              tabIndex={
                (active || (mixed && index === 0)) && !disabled ? 0 : -1
              }
              title={labelForOption}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(option);
                  return;
                }
                moveInlineFocus(index, event);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option)}
            >
              <OfficeTableCellAlignmentGlyph {...option} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          active={mixed ? "mixed" : value !== "top-left"}
          disabled={disabled}
          displayLabel={activeLabel}
          hasMenuIndicator
          icon={
            icon ?? (
              <OfficeTableCellAlignmentGlyph
                horizontal={horizontal}
                vertical={vertical}
              />
            )
          }
          label={label}
          testId={testId}
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        align="start"
        className="min-w-0"
        data-testid={`${testId}-menu`}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          className="grid grid-cols-3 gap-1 p-1"
          value={mixed ? "" : value}
        >
          {ALIGNMENT_VALUES.map((option) => {
            const optionId = alignmentValueId(option);
            const labelForOption = optionLabel(option);
            return (
              <DropdownMenuRadioItem
                key={optionId}
                aria-label={labelForOption}
                className="h-8 w-8 justify-center p-0 data-[state=checked]:bg-accent data-[state=checked]:ring-1 data-[state=checked]:ring-primary [&>span:first-child]:hidden"
                data-testid={`${testId}-${optionId}`}
                onSelect={() => onSelect(option)}
                title={labelForOption}
                value={optionId}
              >
                <OfficeTableCellAlignmentGlyph {...option} />
                <span className="sr-only">{labelForOption}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}
