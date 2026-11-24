"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The bodies of PowerPoint's Align and Rotate menus, drawn once for every
 * place the slide editor opens them: the Shape Format tab's Align ▾ /
 * Rotate ▾ (through OfficeShapeFormatTab) and Home ▸ Arrange ▸ Position
 * Objects ▸ Align ▸ / Rotate ▸.
 *
 * PowerPoint (16.86 accessibility tree, PPT-A120 / PPT-A121) heads the Align
 * menu with three sections -- Horizontal: Align Left, Align Center, Align
 * Right; Vertical: Align Top, Align Middle, Align Bottom; Distribute:
 * Distribute Horizontally, Distribute Vertically -- and closes it with the
 * reference as a pair of exclusive choices, Align to Slide / Align Selected
 * Objects (the second is unavailable with fewer than two objects). The
 * Rotate menu lists the four quarter turns and flips, then More Rotation
 * Options..., which opens Format Shape at Size & Properties.
 *
 * Items only: the host owns the menu (a DropdownMenuContent or a sub menu),
 * so the same body serves a top-level menu and a cascading one.
 */
import { Fragment } from "react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";

export type OfficeObjectAlignAction =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distributeHorizontal"
  | "distributeVertical";

export type OfficeObjectRotateAction =
  | "rotateRight90"
  | "rotateLeft90"
  | "flipVertical"
  | "flipHorizontal";

/** The section heads PowerPoint puts over the Align menu's three runs. */
export interface OfficeAlignMenuSectionLabels {
  readonly horizontal: string;
  readonly vertical: string;
  readonly distribute: string;
}

/** Align to Slide / Align Selected Objects: one reference, chosen. */
export interface OfficeAlignTargetChoice {
  /** True: each object aligns to the slide; false: to the selection's box. */
  readonly toTarget: boolean;
  readonly targetLabel: string;
  readonly selectedLabel: string;
  /** Align Selected Objects needs two or more objects. */
  readonly selectedDisabled?: boolean;
  readonly onChange: (toTarget: boolean) => void;
  readonly targetTestId?: string;
  readonly selectedTestId?: string;
}

export const OFFICE_ALIGN_MENU_SECTIONS: readonly (readonly [
  keyof OfficeAlignMenuSectionLabels,
  readonly OfficeObjectAlignAction[],
])[] = [
  ["horizontal", ["left", "center", "right"]],
  ["vertical", ["top", "middle", "bottom"]],
  ["distribute", ["distributeHorizontal", "distributeVertical"]],
];

export const OFFICE_ROTATE_MENU_ACTIONS: readonly OfficeObjectRotateAction[] = [
  "rotateRight90",
  "rotateLeft90",
  "flipVertical",
  "flipHorizontal",
];

const SECTION_HEAD_CLASS =
  "px-2 pb-0.5 pt-1.5 text-xs font-semibold text-muted-foreground";

export function OfficeSectionedAlignMenuItems({
  sections,
  label,
  isDisabled,
  onAction,
  target,
  testIdFor,
  disabled,
}: {
  readonly sections: OfficeAlignMenuSectionLabels;
  readonly label: (action: OfficeObjectAlignAction) => string;
  readonly isDisabled?: (action: OfficeObjectAlignAction) => boolean;
  readonly onAction: (action: OfficeObjectAlignAction) => void;
  readonly target?: OfficeAlignTargetChoice;
  readonly testIdFor: (action: OfficeObjectAlignAction) => string;
  /** The whole menu is closed to this selection (read-only, nothing selected). */
  readonly disabled?: boolean;
}) {
  return (
    <>
      {OFFICE_ALIGN_MENU_SECTIONS.map(([section, actions], index) => (
        <Fragment key={section}>
          {index > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuLabel
            className={SECTION_HEAD_CLASS}
            data-office-menu-section={section}
          >
            {sections[section]}
          </DropdownMenuLabel>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action}
              data-testid={testIdFor(action)}
              disabled={disabled || isDisabled?.(action)}
              onSelect={() => onAction(action)}
            >
              {label(action)}
            </DropdownMenuItem>
          ))}
        </Fragment>
      ))}
      {target ? (
        <>
          <DropdownMenuSeparator />
          {(
            [
              [true, target.targetLabel, target.targetTestId, false],
              [false, target.selectedLabel, target.selectedTestId, target.selectedDisabled],
            ] as const
          ).map(([toTarget, text, testId, choiceDisabled]) => {
            const checked = target.toTarget === toTarget;
            return (
              <DropdownMenuItem
                key={String(toTarget)}
                role="menuitemradio"
                aria-checked={checked}
                data-testid={testId}
                disabled={disabled || Boolean(choiceDisabled)}
                onSelect={() => target.onChange(toTarget)}
              >
                <span className="inline-flex w-4 justify-center" aria-hidden="true">
                  {checked ? (
                    <OfficeSemanticIcon semanticId="selection.check" size={14} />
                  ) : null}
                </span>
                {text}
              </DropdownMenuItem>
            );
          })}
        </>
      ) : null}
    </>
  );
}

export function OfficeRotateMenuItems({
  label,
  onAction,
  testIdFor,
  disabled,
  more,
}: {
  readonly label: (action: OfficeObjectRotateAction) => string;
  readonly onAction: (action: OfficeObjectRotateAction) => void;
  readonly testIdFor: (action: OfficeObjectRotateAction) => string;
  readonly disabled?: boolean;
  /** More Rotation Options...: Format Shape at Size & Properties. */
  readonly more?: {
    readonly label: string;
    readonly onSelect: () => void;
    readonly disabled?: boolean;
    readonly testId: string;
  };
}) {
  return (
    <>
      {OFFICE_ROTATE_MENU_ACTIONS.map((action) => (
        <DropdownMenuItem
          key={action}
          data-testid={testIdFor(action)}
          disabled={disabled}
          onSelect={() => onAction(action)}
        >
          {label(action)}
        </DropdownMenuItem>
      ))}
      {more ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid={more.testId}
            disabled={more.disabled}
            onSelect={more.onSelect}
          >
            {more.label}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
