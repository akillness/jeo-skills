"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { MAX_SHEETS, sheetUnhideable } from "../../../../lib/spreadsheet/sheet-buttons";
import { type ReactNode, type RefObject } from "react";
import { Eye, Copy as CopyIcon, ClipboardPaste, PenLine, ArrowDownUp, StepForward, Layers as LayersIcon, Ungroup as UngroupIcon } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { type SpreadsheetHomeIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetHomeRibbonIcons.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { SpreadsheetInsertIcon } from "./SpreadsheetInsertRibbonIcons";
import { type SpreadsheetVisibleCommandReason } from "../../../../lib/spreadsheet/visible-command-authority";
import { type SpreadsheetRibbonTabId } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { groupHoldsEverySheet, normalizeSheetGroup } from "../../../../lib/spreadsheet/sheet-group";
import { type WorkbookStructureProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { DropdownMenuSub, DropdownMenuSeparator } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { type SheetModel } from "./spreadsheetSheetModel";
import { DropdownMenuItem, DropdownMenuSubTrigger } from "./SpreadsheetRibbonControls";
import { type Dispatch, type JSX, type SetStateAction } from "react";
import { type ResolvedSpreadsheetVisibleControl } from "../../../../lib/spreadsheet/visible-command-authority";

/** What spreadsheetSheetTabContextMenuItems reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSheetTabContextMenuItemsInputs {
  activateSheetTab: (index: number) => void;
  beginSheetTabRename: (index: number) => void;
  changeLogOpenRequestRef: RefObject<{ scope: "workbook"; } | { scope: "sheet"; } | { scope: "range"; r1: number; c1: number; r2: number; c2: number; } | null>;
  copiedSheet: SheetModel | null;
  copySheetForPaste: (index: number) => void;
  copySpreadsheetShareLink: (worksheetId?: string, worksheetName?: string, rangeRef?: string) => Promise<void>;
  deleteSheet: (index: number) => void;
  duplicateSheetAt: (index: number, insertAt?: number) => void;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  homeMenuIcon: (name: SpreadsheetHomeIconName) => JSX.Element;
  insertSheetAt: (requestedIndex: number) => void;
  moveSheetByDir: (index: number, dir: -1 | 1) => void;
  moveSheetTo: (from: number, to: number) => void;
  pasteCopiedSheetAfter: (index: number) => void;
  renderSheetTabColorChoices: ({ current, disabled, onPick, choiceTestId, clearTestId, inputTestId, }: { current: string | null | undefined; disabled: boolean; onPick: (color: string | null) => void; choiceTestId: (colorIndex: number) => string; clearTestId: string; inputTestId: string; }) => JSX.Element;
  requestMoveCopySheetFromTab: (index: number) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  scheduleRaf: (callback: () => void) => void;
  setRibbonTab: (next: SpreadsheetRibbonTabId) => void;
  setSheetGroupIds: Dispatch<SetStateAction<string[] | null>>;
  setSheetHidden: (index: number, hidden: boolean) => void;
  setSheetTabColor: (index: number, rawColor: string | null) => void;
  setTabMenuIndex: Dispatch<SetStateAction<number | null>>;
  sheet: SheetModel;
  sheetGroup: string[] | null;
  sheets: SheetModel[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tabColorNativeBlockedReason: string;
  visibleCommandReason: (reasonKey: SpreadsheetVisibleCommandReason | null) => string | undefined;
  visibleCommandState: (controlId: string) => ResolvedSpreadsheetVisibleControl;
  workbookStructureProtectedReason: string;
  workbookStructureProtection: WorkbookStructureProtection | undefined;
  workbookTopologyLocked: boolean;
  workbookTopologyLockedReason: string;
  workbookTopologyReadOnlyReason: string | undefined;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetSheetTabContextMenuItems({
  activateSheetTab,
  beginSheetTabRename,
  changeLogOpenRequestRef,
  copiedSheet,
  copySheetForPaste,
  copySpreadsheetShareLink,
  deleteSheet,
  duplicateSheetAt,
  executeVisibleCommand,
  homeMenuIcon,
  insertSheetAt,
  moveSheetByDir,
  moveSheetTo,
  pasteCopiedSheetAfter,
  renderSheetTabColorChoices,
  requestMoveCopySheetFromTab,
  rootRef,
  scheduleRaf,
  setRibbonTab,
  setSheetGroupIds,
  setSheetHidden,
  setSheetTabColor,
  setTabMenuIndex,
  sheet,
  sheetGroup,
  sheets,
  t,
  tabColorNativeBlockedReason,
  visibleCommandReason,
  visibleCommandState,
  workbookStructureProtectedReason,
  workbookStructureProtection,
  workbookTopologyLocked,
  workbookTopologyLockedReason,
  workbookTopologyReadOnlyReason,
}: SpreadsheetSheetTabContextMenuItemsInputs) {
  const sheetTabContextMenuItems = (candidate: SheetModel, index: number) => {
    const hiddenSheets = sheets
      .map((hiddenSheet, hiddenIndex) => ({ hiddenSheet, hiddenIndex }))
      .filter(({ hiddenSheet }) => sheetUnhideable(hiddenSheet));
    const worksheetLinkState = visibleCommandState(
      "XLSCTL.SHARE.LINK.WORKSHEET",
    );
    const showChangesState = visibleCommandState(
      "XLSCTL.REVIEW.CHANGES.SHOW",
    );
    const manageProtectionState = visibleCommandState(
      "XLSCTL.REVIEW.PROTECT.MANAGE_MENU",
    );
    const topologyReason = workbookTopologyLocked
      ? workbookTopologyLockedReason
      : undefined;
    // Excel keeps at least one sheet visible: the last visible tab cannot be
    // deleted while the others are hidden (and none is unhidden for it).
    const deleteReason =
      topologyReason ??
      (!candidate.hidden &&
      sheets.filter((sheetCandidate) => !sheetCandidate.hidden).length <= 1 &&
      sheets.length > 1
        ? t("spreadsheet.uiCopy.aWorkbookMustKeepAtLeastOneVisibleSheet")
        : undefined);
    const icon = (node: ReactNode) => (
      <span className={spreadsheetHomeStyles.sheetTabMenuIcon} aria-hidden="true">
        {node}
      </span>
    );
    return (
      <>
        <DropdownMenuItem
          disabled={workbookTopologyLocked || sheets.length >= MAX_SHEETS}
          title={topologyReason}
          data-testid={`spreadsheet-tab-insert-${index}`}
          onSelect={() => insertSheetAt(index)}
        >
          {icon(homeMenuIcon("insertCells"))}
          <span>{t("spreadsheet.insertFunctionInsert")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(deleteReason) || sheets.length <= 1}
          title={deleteReason}
          data-testid={`spreadsheet-tab-delete-${index}`}
          onSelect={() => deleteSheet(index)}
        >
          {icon(homeMenuIcon("deleteCells"))}
          <span>{t("spreadsheet.tabDelete")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            workbookTopologyLocked ||
            sheets.filter((sheetCandidate) => !sheetCandidate.hidden).length <= 1
          }
          title={topologyReason}
          data-testid={`spreadsheet-tab-hide-${index}`}
          onSelect={() => setSheetHidden(index, true)}
        >
          {icon(homeMenuIcon("hideUnhide"))}
          <span>{t("spreadsheet.tabHide")}</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={workbookTopologyLocked || hiddenSheets.length === 0}
            title={topologyReason}
            data-testid={`spreadsheet-tab-unhide-${index}`}
          >
            {icon(<Eye size={16} />)}
            <span>{t("spreadsheet.tabUnhide")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="docs-cupertino-menu docs-cupertino-menu--submenu office-context-menu office-context-menu--submenu"
          >
            {hiddenSheets.map(({ hiddenSheet, hiddenIndex }) => (
              <DropdownMenuItem
                key={hiddenSheet.id}
                disabled={workbookTopologyLocked}
                data-testid={`spreadsheet-tab-unhide-item-${hiddenIndex}`}
                onSelect={() => setSheetHidden(hiddenIndex, false)}
              >
                {icon(<Eye size={16} />)}
                <span>{hiddenSheet.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          data-testid={`spreadsheet-tab-copy-${index}`}
          onSelect={() => copySheetForPaste(index)}
        >
          {icon(<CopyIcon size={16} />)}
          <span>{t("pdf.snapshot.latexCopy")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={workbookTopologyLocked || sheets.length >= MAX_SHEETS}
          title={topologyReason}
          data-testid={`spreadsheet-tab-duplicate-${index}`}
          onSelect={() => duplicateSheetAt(index)}
        >
          {icon(homeMenuIcon("moveCopySheet"))}
          <span>{t("spreadsheet.uiCopy.duplicateWorksheet")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            !copiedSheet || workbookTopologyLocked || sheets.length >= MAX_SHEETS
          }
          title={
            topologyReason ??
            (!copiedSheet
              ? t("spreadsheet.uiCopy.copyAWorksheetFirst")
              : undefined)
          }
          data-testid={`spreadsheet-tab-paste-${index}`}
          onSelect={() => pasteCopiedSheetAfter(index)}
        >
          {icon(<ClipboardPaste size={16} />)}
          <span>{t("spreadsheet.uiCopy.pasteWorksheet")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={workbookTopologyLocked}
          title={topologyReason}
          data-testid={`spreadsheet-tab-rename-${index}`}
          onSelect={() => {
            beginSheetTabRename(index);
            setTabMenuIndex(null);
          }}
        >
          {icon(<PenLine size={16} />)}
          <span>{t("spreadsheet.tabRename")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={workbookTopologyLocked}
          title={topologyReason}
          data-testid={`spreadsheet-tab-move-copy-${index}`}
          onSelect={() => requestMoveCopySheetFromTab(index)}
        >
          {icon(homeMenuIcon("moveCopySheet"))}
          <span>{t("spreadsheet.tabMoveOrCopy")}</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={workbookTopologyLocked || sheets.length <= 1}
            title={topologyReason}
            data-testid={`spreadsheet-tab-reorder-${index}`}
          >
            {icon(<ArrowDownUp size={16} />)}
            <span>{t("spreadsheet.uiCopy.reorder")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="docs-cupertino-menu docs-cupertino-menu--submenu office-context-menu office-context-menu--submenu"
          >
            <DropdownMenuItem
              disabled={workbookTopologyLocked || index <= 0}
              data-testid={`spreadsheet-tab-move-left-${index}`}
              onSelect={() => moveSheetByDir(index, -1)}
            >
              {icon(
                <OfficeSemanticIcon semanticId="ribbon.scroll.left" size={16} />,
              )}
              <span>{t("spreadsheet.tabMoveLeft")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={workbookTopologyLocked || index >= sheets.length - 1}
              data-testid={`spreadsheet-tab-move-right-${index}`}
              onSelect={() => moveSheetByDir(index, 1)}
            >
              {icon(
                <OfficeSemanticIcon semanticId="ribbon.scroll.right" size={16} />,
              )}
              <span>{t("spreadsheet.tabMoveRight")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={workbookTopologyLocked || index <= 0}
              data-testid={`spreadsheet-tab-move-first-${index}`}
              onSelect={() => moveSheetTo(index, 0)}
            >
              {icon(<StepForward size={16} style={{ transform: "scaleX(-1)" }} />)}
              <span>{t("spreadsheet.uiCopy.moveToBeginning")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={workbookTopologyLocked || index >= sheets.length - 1}
              data-testid={`spreadsheet-tab-move-last-${index}`}
              onSelect={() => moveSheetTo(index, sheets.length - 1)}
            >
              {icon(<StepForward size={16} />)}
              <span>{t("spreadsheet.uiCopy.moveToEnd")}</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={
              Boolean(candidate.tabColorNativeBlocker) ||
              Boolean(workbookTopologyReadOnlyReason) ||
              workbookStructureProtection?.locked === true
            }
            title={
              workbookTopologyReadOnlyReason ??
              (workbookStructureProtection?.locked === true
                ? workbookStructureProtectedReason
                : candidate.tabColorNativeBlocker
                  ? tabColorNativeBlockedReason
                  : undefined)
            }
            data-testid={`spreadsheet-tab-color-menu-${index}`}
          >
            {icon(homeMenuIcon("fillColor"))}
            <span>{t("spreadsheet.tabColor")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className={`docs-cupertino-menu docs-cupertino-menu--submenu ${spreadsheetHomeStyles.sheetTabColorMenu}`}
          >
            {renderSheetTabColorChoices({
              current: candidate.tabColor,
              disabled:
                Boolean(candidate.tabColorNativeBlocker) ||
                Boolean(workbookTopologyReadOnlyReason) ||
                workbookStructureProtection?.locked === true,
              onPick: (color) => setSheetTabColor(index, color),
              choiceTestId: (colorIndex) =>
                `spreadsheet-tab-color-choice-${index}-${colorIndex}`,
              clearTestId: `spreadsheet-tab-color-clear-${index}`,
              inputTestId: `spreadsheet-tab-color-input-${index}`,
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={!manageProtectionState.enabled}
          title={visibleCommandReason(manageProtectionState.reasonKey)}
          data-testid={`spreadsheet-tab-manage-protection-${index}`}
          onSelect={() => {
            activateSheetTab(index);
            setRibbonTab("review");
            scheduleRaf(() =>
              rootRef.current
                ?.querySelector<HTMLButtonElement>(
                  '[data-testid="spreadsheet-ribbon-review-manage-protection"]',
                )
                ?.click(),
            );
          }}
        >
          {icon(homeMenuIcon("sensitivity"))}
          <span>{t("spreadsheet.review.manageProtection")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!worksheetLinkState.enabled}
          title={visibleCommandReason(worksheetLinkState.reasonKey)}
          data-testid={`spreadsheet-tab-copy-link-${index}`}
          onSelect={() =>
            void copySpreadsheetShareLink(candidate.id, candidate.name)
          }
        >
          {icon(<SpreadsheetInsertIcon name="sheetLink" size={16} />)}
          <span>
            {t("spreadsheet.uiCopy.copyLinkToThisSheet")}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!showChangesState.enabled}
          title={visibleCommandReason(showChangesState.reasonKey)}
          data-testid={`spreadsheet-tab-show-changes-${index}`}
          onSelect={() => {
            activateSheetTab(index);
            setRibbonTab("review");
            changeLogOpenRequestRef.current = { scope: "sheet" };
            scheduleRaf(() =>
              void executeVisibleCommand("XLSCTL.REVIEW.CHANGES.SHOW"),
            );
          }}
        >
          {icon(
            <OfficeSemanticIcon semanticId="review.trackChanges" size={16} />,
          )}
          <span>{t("spreadsheet.review.showChanges")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* XLS-A079: Excel's last tab-menu item groups every sheet; a grouped
            tab's menu also offers Ungroup Sheets. */}
        <DropdownMenuItem
          disabled={
            sheets.filter((sheetCandidate) => !sheetCandidate.hidden).length < 2 ||
            groupHoldsEverySheet(sheets, sheetGroup)
          }
          data-testid={`spreadsheet-tab-select-all-${index}`}
          onSelect={() => {
            setSheetGroupIds(
              normalizeSheetGroup(sheets, sheets.map((sheetCandidate) => sheetCandidate.id), sheet.id),
            );
          }}
        >
          {icon(<LayersIcon size={16} />)}
          <span>{t("spreadsheet.uiCopy.selectAllSheets")}</span>
        </DropdownMenuItem>
        {sheetGroup?.includes(candidate.id) ? (
          <DropdownMenuItem
            data-testid={`spreadsheet-tab-ungroup-${index}`}
            onSelect={() => setSheetGroupIds(null)}
          >
            {icon(<UngroupIcon size={16} />)}
            <span>{t("spreadsheet.uiCopy.ungroupSheets")}</span>
          </DropdownMenuItem>
        ) : null}
      </>
    );
  };
  return {
    sheetTabContextMenuItems,
  };
}
