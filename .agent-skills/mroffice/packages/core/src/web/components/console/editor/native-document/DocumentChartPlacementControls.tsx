"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Chart Format > Arrange, as Word lays it out for a chart: Position (In Line
 * with Text and the nine "with Square Text Wrapping" places), Wrap Text (the
 * seven choices, then Move with Text / Fix Position on Page, which only a
 * floating chart has), Bring Forward and Send Backward (each with its Front /
 * Back and text-layer variants), the Selection Pane and Align (to the
 * margins). Every entry is one `DocumentChartPlacementCommand`.
 */

import { Fragment, type ReactNode } from "react";

import {
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeCommandStack,
  OfficeHomeMenuTrigger,
} from "../../../office-ribbon/OfficeHomeRibbon";
import { OfficeSemanticIcon } from "../../../office-ribbon/icons/OfficeSemanticIcon";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "../../../office-ribbon/CupertinoRibbonMenu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import { FLOAT_POSITION_PRESETS, FLOAT_WRAP_CHOICES } from "../../../../lib/office-float-anchor-edit";

import type { DocumentChartPlacementCommand, DocumentChartPlacementState } from "./chartPlacement";

export const POSITION_KEYS = {
  topLeft: "positionTopLeft",
  topCenter: "positionTopCenter",
  topRight: "positionTopRight",
  middleLeft: "positionMiddleLeft",
  middleCenter: "positionMiddleCenter",
  middleRight: "positionMiddleRight",
  bottomLeft: "positionBottomLeft",
  bottomCenter: "positionBottomCenter",
  bottomRight: "positionBottomRight",
} as const;

const WRAP_KEYS = {
  square: "square",
  tight: "tight",
  through: "through",
  topAndBottom: "topAndBottom",
  behindText: "behindText",
  inFrontOfText: "inFrontOfText",
} as const;

/** One cell of the Position gallery: where the chart sits on a little page. */
export function PositionGlyph({ preset }: { preset: string }) {
  const column = preset.endsWith("Left") ? 0 : preset.endsWith("Center") ? 1 : 2;
  const row = preset.startsWith("top") ? 0 : preset.startsWith("middle") ? 1 : 2;
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="27" fill="none" stroke="currentColor" opacity="0.5" />
      {[5, 9, 13, 17, 21].map((y) => (
        <line key={y} x1="3" x2="19" y1={y + 1} y2={y + 1} stroke="currentColor" opacity="0.25" />
      ))}
      <rect x={3 + column * 5.5} y={3 + row * 7.5} width="5" height="6" fill="currentColor" />
    </svg>
  );
}

export function DocumentChartPlacementControls({
  placement,
  onPlacement,
  disabledReason,
  copy,
  testIdPrefix,
  officeProfile,
  selectionPane,
  showAlign = true,
  onMoreLayoutOptions,
  moreLayoutOptionsLabel,
  group,
}: {
  readonly placement: DocumentChartPlacementState;
  readonly onPlacement: (command: DocumentChartPlacementCommand) => boolean;
  readonly disabledReason: string | null;
  readonly copy: (key: string, fallback: string) => string;
  readonly testIdPrefix: string;
  readonly officeProfile: boolean;
  /** The Selection Pane command, beside the stack steps; omitted when the
   * host ribbon has its own. */
  readonly selectionPane?: ReactNode;
  /** Align to the margins; off where the host ribbon has its own Align. */
  readonly showAlign?: boolean;
  /** Opens the Layout dialog (More Layout Options…) for this drawing. */
  readonly onMoreLayoutOptions?: () => void;
  readonly moreLayoutOptionsLabel?: string;
  /**
   * Arrange > Group on this drawing and the objects picked with it (Word's
   * Group: two or more floating objects). Absent: no Group command here.
   */
  readonly group?: { readonly onGroup: () => void; readonly disabledReason: string | null };
}) {
  const label = (key: string, fallback: string) => copy(`spreadsheet.chartFormatCopy.arrange.${key}`, fallback);
  const floating = placement.wrap !== "inline";
  const disabled = disabledReason !== null;
  const run = (command: DocumentChartPlacementCommand) => () => {
    onPlacement(command);
  };
  const moreLayoutOptions = (where: string) =>
    onMoreLayoutOptions ? (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid={`${testIdPrefix}-${where}-more-layout-options`} onSelect={() => onMoreLayoutOptions()}>
          {moreLayoutOptionsLabel ?? "More Layout Options…"}
        </DropdownMenuItem>
      </>
    ) : null;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            active={floating}
            disabled={disabled}
            disabledReason={disabledReason ?? undefined}
            hasMenuIndicator
            icon={<OfficeSemanticIcon semanticId="object.align" size={22} />}
            label={label("position", "Position")}
            testId={`${testIdPrefix}-position`}
            variant="large"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
          <DropdownMenuLabel>{label("inLineWithText", "In Line with Text")}</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid={`${testIdPrefix}-position-inline`}
            data-state={placement.wrap === "inline" ? "checked" : undefined}
            onSelect={run({ kind: "inline" })}
          >
            {label("inLineWithText", "In Line with Text")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{label("withTextWrapping", "With Text Wrapping")}</DropdownMenuLabel>
          <div role="group" style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 4, padding: "2px 8px 6px" }}>
            {FLOAT_POSITION_PRESETS.map((preset) => {
              const name = label(POSITION_KEYS[preset], preset);
              return (
                <DropdownMenuItem
                  key={preset}
                  aria-label={name}
                  title={name}
                  data-testid={`${testIdPrefix}-position-${preset}`}
                  data-state={placement.preset === preset ? "checked" : undefined}
                  style={{
                    justifyContent: "center",
                    padding: 4,
                    outline: placement.preset === preset ? "2px solid var(--office-accent, #2b579a)" : undefined,
                  }}
                  onSelect={run({ kind: "position", preset })}
                >
                  <PositionGlyph preset={preset} />
                </DropdownMenuItem>
              );
            })}
          </div>
          {moreLayoutOptions("position")}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            active={floating}
            disabled={disabled}
            disabledReason={disabledReason ?? undefined}
            hasMenuIndicator
            icon={<OfficeSemanticIcon semanticId="object.textWrap" size={22} />}
            label={label("wrapText", "Wrap Text")}
            testId={`${testIdPrefix}-wrap`}
            variant="large"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
          <DropdownMenuRadioGroup value={placement.wrap}>
            <DropdownMenuRadioItem value="inline" data-testid={`${testIdPrefix}-wrap-inline`} onSelect={run({ kind: "inline" })}>
              {label("inLineWithText", "In Line with Text")}
            </DropdownMenuRadioItem>
            {FLOAT_WRAP_CHOICES.map((wrap) => (
              <DropdownMenuRadioItem
                key={wrap}
                value={wrap}
                data-testid={`${testIdPrefix}-wrap-${wrap}`}
                onSelect={run({ kind: "wrap", wrap })}
              >
                {label(WRAP_KEYS[wrap], wrap)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={placement.moveWithText === null ? "" : placement.moveWithText ? "move" : "fix"}
          >
            <DropdownMenuRadioItem
              value="move"
              disabled={!floating}
              data-testid={`${testIdPrefix}-move-with-text`}
              onSelect={run({ kind: "moveWithText", value: true })}
            >
              {label("moveWithText", "Move with Text")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="fix"
              disabled={!floating}
              data-testid={`${testIdPrefix}-fix-position-on-page`}
              onSelect={run({ kind: "moveWithText", value: false })}
            >
              {label("fixPositionOnPage", "Fix Position on Page")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {moreLayoutOptions("wrap")}
        </DropdownMenuContent>
      </DropdownMenu>
      <OfficeHomeCommandStack>
        <OfficeHomeCommandRow>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                disabled={!floating || disabled}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="object.bringForward" size={18} />}
                label={label("bringForward", "Bring Forward")}
                testId={`${testIdPrefix}-bring-forward`}
                variant={officeProfile ? "large" : "compact"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
              <DropdownMenuItem
                disabled={!placement.canBringForward}
                data-testid={`${testIdPrefix}-bring-forward-step`}
                onSelect={run({ kind: "order", step: "forward" })}
              >
                {label("bringForward", "Bring Forward")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!placement.canBringForward}
                data-testid={`${testIdPrefix}-bring-to-front`}
                onSelect={run({ kind: "order", step: "front" })}
              >
                {label("bringToFront", "Bring to Front")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={placement.wrap === "inFrontOfText"}
                data-testid={`${testIdPrefix}-bring-in-front-of-text`}
                onSelect={run({ kind: "wrap", wrap: "inFrontOfText" })}
              >
                {label("bringInFrontOfText", "Bring in Front of Text")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <OfficeHomeMenuTrigger
                disabled={!floating || disabled}
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="object.sendBackward" size={18} />}
                label={label("sendBackward", "Send Backward")}
                testId={`${testIdPrefix}-send-backward`}
                variant={officeProfile ? "large" : "compact"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
              <DropdownMenuItem
                disabled={!placement.canSendBackward}
                data-testid={`${testIdPrefix}-send-backward-step`}
                onSelect={run({ kind: "order", step: "backward" })}
              >
                {label("sendBackward", "Send Backward")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!placement.canSendBackward}
                data-testid={`${testIdPrefix}-send-to-back`}
                onSelect={run({ kind: "order", step: "back" })}
              >
                {label("sendToBack", "Send to Back")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={placement.wrap === "behindText"}
                data-testid={`${testIdPrefix}-send-behind-text`}
                onSelect={run({ kind: "wrap", wrap: "behindText" })}
              >
                {label("sendBehindText", "Send Behind Text")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </OfficeHomeCommandRow>
        {selectionPane ? <OfficeHomeCommandRow>{selectionPane}</OfficeHomeCommandRow> : null}
      </OfficeHomeCommandStack>
      {showAlign ? (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <OfficeHomeMenuTrigger
            disabled={!floating || disabled}
            hasMenuIndicator
            icon={<OfficeSemanticIcon semanticId="object.align" size={22} />}
            label={label("align", "Align")}
            testId={`${testIdPrefix}-align`}
            variant="large"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="note-editor-toolbar-menu">
          {(
            [
              ["left", "alignLeft", "object.align.left"],
              ["center", "alignCenter", "object.align.center"],
              ["right", "alignRight", "object.align.right"],
              ["top", "alignTop", "object.align.top"],
              ["middle", "alignMiddle", "object.align.middle"],
              ["bottom", "alignBottom", "object.align.bottom"],
            ] as const
          ).map(([align, key, icon], index) => (
            <Fragment key={align}>
              {index === 3 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem data-testid={`${testIdPrefix}-align-${align}`} onSelect={run({ kind: "align", align })}>
                <OfficeSemanticIcon semanticId={icon} size={16} />
                {label(key, align)}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      ) : null}
      {group ? (
        <OfficeHomeCommand
          disabled={disabled || group.disabledReason !== null}
          disabledReason={disabledReason ?? group.disabledReason ?? undefined}
          icon={<OfficeSemanticIcon semanticId="object.group" size={22} />}
          label={label("group", "Group")}
          onClick={group.onGroup}
          testId={`${testIdPrefix}-group`}
          variant="large"
        />
      ) : null}
    </>
  );
}
