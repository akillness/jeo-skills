"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { Type as RichTextIcon } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetHomeIconName } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetHomeRibbonIcons.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { type WorkbookStructureProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { DropdownMenuSeparator, DropdownMenuSub } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { type SheetModel } from "./spreadsheetSheetModel";
import { DropdownMenuItem, DropdownMenuSubTrigger, DropdownMenuCheckboxItem } from "./SpreadsheetRibbonControls";
import { type Dispatch, type JSX, type SetStateAction } from "react";

/** What spreadsheetHomeCellsFormatMenuItems reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetHomeCellsFormatMenuItemsInputs {
  activeCell: { row: number; col: number; };
  activeSheetIndex: number;
  autoFitColumns: (cols: ReadonlyArray<number>) => void;
  autoFitRows: (rows: ReadonlyArray<number>) => void;
  beginSheetTabRename: (index: number) => void;
  executeVisibleCommand: (controlId: string) => Promise<boolean>;
  hiddenSheets: SheetModel[];
  hideColsInSelection: () => void;
  hideRowsInSelection: () => void;
  homeFormatColumns: number[];
  homeFormatColumnsBlocked: boolean;
  homeFormatRows: number[];
  homeFormatRowsBlocked: boolean;
  homeFormattingUnavailableReason: string;
  homeLineFormatBlockedReason: string;
  homeMenuIcon: (name: SpreadsheetHomeIconName) => JSX.Element;
  homeNoHiddenColumnsReason: string;
  homeNoHiddenRowsReason: string;
  /** How to reach the sheet's hidden rows / columns, when it has any. */
  homeUnhideRowsHint?: string;
  homeUnhideColumnsHint?: string;
  homeNoHiddenSheetsReason: string;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  openDefaultColumnWidthDialog: () => void;
  openMoveCopySheetDialog: (returnFocusTarget: HTMLElement | null, returnFocusSource: "home" | "tab") => void;
  openSizeDialog: (axis: "col" | "row", index: number, requestedIndices?: readonly number[]) => void;
  openUnhideDialog: () => void;
  primaryLockedSelection: boolean | "mixed" | null;
  renderSheetTabColorChoices: ({ current, disabled, onPick, choiceTestId, clearTestId, inputTestId, }: { current: string | null | undefined; disabled: boolean; onPick: (color: string | null) => void; choiceTestId: (colorIndex: number) => string; clearTestId: string; inputTestId: string; }) => JSX.Element;
  selectionHasHiddenCol: boolean;
  selectionHasHiddenRow: boolean;
  setRichTextOpen: Dispatch<SetStateAction<boolean>>;
  setSelectionLocked: (locked: boolean) => void;
  setSheetHidden: (index: number, hidden: boolean) => void;
  setSheetTabColor: (index: number, rawColor: string | null) => void;
  sheet: SheetModel;
  sheetProtectionConfigured: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tabColorNativeBlockedReason: string;
  tabColorNativeEditBlocked: boolean;
  toggleProtection: () => void;
  unhideColsInSelection: () => void;
  unhideRowsInSelection: () => void;
  visibleCommandMenuProps: (controlId: string, accessibleLabel?: string, selectionReason?: string) => { "data-control-id": string; "aria-label": string | undefined; disabled: boolean; hidden: boolean; title: string | undefined; };
  visibleSheetCount: number;
  workbookStructureProtectedReason: string;
  workbookStructureProtection: WorkbookStructureProtection | undefined;
  workbookTopologyLocked: boolean;
  workbookTopologyLockedReason: string;
  workbookTopologyReadOnlyReason: string | undefined;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetHomeCellsFormatMenuItems({
  activeCell,
  activeSheetIndex,
  autoFitColumns,
  autoFitRows,
  beginSheetTabRename,
  executeVisibleCommand,
  hiddenSheets,
  hideColsInSelection,
  hideRowsInSelection,
  homeFormatColumns,
  homeFormatColumnsBlocked,
  homeFormatRows,
  homeFormatRowsBlocked,
  homeFormattingUnavailableReason,
  homeLineFormatBlockedReason,
  homeMenuIcon,
  homeNoHiddenColumnsReason,
  homeNoHiddenRowsReason,
  homeUnhideRowsHint,
  homeUnhideColumnsHint,
  homeNoHiddenSheetsReason,
  isSheetProtectionEffectiveRef,
  openDefaultColumnWidthDialog,
  openMoveCopySheetDialog,
  openSizeDialog,
  openUnhideDialog,
  primaryLockedSelection,
  renderSheetTabColorChoices,
  selectionHasHiddenCol,
  selectionHasHiddenRow,
  setRichTextOpen,
  setSelectionLocked,
  setSheetHidden,
  setSheetTabColor,
  sheet,
  sheetProtectionConfigured,
  t,
  tabColorNativeBlockedReason,
  tabColorNativeEditBlocked,
  toggleProtection,
  unhideColsInSelection,
  unhideRowsInSelection,
  visibleCommandMenuProps,
  visibleSheetCount,
  workbookStructureProtectedReason,
  workbookStructureProtection,
  workbookTopologyLocked,
  workbookTopologyLockedReason,
  workbookTopologyReadOnlyReason,
}: SpreadsheetHomeCellsFormatMenuItemsInputs) {
  // A grey Unhide with lines hidden elsewhere carries the way to them under
  // its name, where a pointer can read it.
  const unhideEntryLabel = (label: string, hint: string | undefined) =>
    hint ? (
      <span className="docs-cupertino-menu__rich-text">
        <span>{label}</span>
        <span
          className="docs-cupertino-menu__rich-detail"
          data-testid="spreadsheet-unhide-hint"
          style={{ whiteSpace: "normal", maxWidth: 260 }}
        >
          {hint}
        </span>
      </span>
    ) : (
      <span>{label}</span>
    );
  const homeCellsFormatMenuItems = (
    prefix: string,
    returnFocusRef: { readonly current: HTMLButtonElement | null },
  ) => (
    <>
      <DropdownMenuItem
        data-testid={`${prefix}-row-height`}
        disabled={homeFormatRowsBlocked}
        aria-label={
          homeFormatRowsBlocked
            ? `${t("spreadsheet.rowHeightMenuItem")}: ${homeLineFormatBlockedReason}`
            : t("spreadsheet.rowHeightMenuItem")
        }
        title={homeFormatRowsBlocked ? homeLineFormatBlockedReason : undefined}
        onSelect={() => openSizeDialog("row", activeCell.row, homeFormatRows)}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.rowHeightMenuItem")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${prefix}-autofit-rows`}
        disabled={homeFormatRowsBlocked}
        aria-label={
          homeFormatRowsBlocked
            ? `${t("spreadsheet.autoFitRowHeight")}: ${homeLineFormatBlockedReason}`
            : t("spreadsheet.autoFitRowHeight")
        }
        title={homeFormatRowsBlocked ? homeLineFormatBlockedReason : undefined}
        onSelect={() => autoFitRows(homeFormatRows)}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.autoFitRowHeight")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${prefix}-column-width`}
        disabled={homeFormatColumnsBlocked}
        aria-label={
          homeFormatColumnsBlocked
            ? `${t("spreadsheet.columnWidthMenuItem")}: ${homeLineFormatBlockedReason}`
            : t("spreadsheet.columnWidthMenuItem")
        }
        title={homeFormatColumnsBlocked ? homeLineFormatBlockedReason : undefined}
        onSelect={() =>
          openSizeDialog("col", activeCell.col, homeFormatColumns)
        }
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.columnWidthMenuItem")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${prefix}-autofit-columns`}
        disabled={homeFormatColumnsBlocked}
        aria-label={
          homeFormatColumnsBlocked
            ? `${t("spreadsheet.autoFitColumnWidth")}: ${homeLineFormatBlockedReason}`
            : t("spreadsheet.autoFitColumnWidth")
        }
        title={homeFormatColumnsBlocked ? homeLineFormatBlockedReason : undefined}
        onSelect={() => autoFitColumns(homeFormatColumns)}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.autoFitColumnWidth")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${prefix}-default-column-width`}
        disabled={homeFormatColumnsBlocked}
        aria-label={
          homeFormatColumnsBlocked
            ? `${t("spreadsheet.uiCopy.defaultWidth")}: ${homeLineFormatBlockedReason}`
            : t("spreadsheet.uiCopy.defaultWidth")
        }
        title={homeFormatColumnsBlocked ? homeLineFormatBlockedReason : undefined}
        onSelect={openDefaultColumnWidthDialog}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.uiCopy.defaultWidth")}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid={`${prefix}-hide-unhide`}>
          {homeMenuIcon("hideUnhide")}
          <span>{t("spreadsheet.uiCopy.hideUnhide")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="docs-cupertino-menu docs-cupertino-menu--submenu w-max max-w-[15rem]">
          <DropdownMenuItem
            data-testid={`${prefix}-hide-rows`}
            disabled={homeFormatRowsBlocked}
            aria-label={
              homeFormatRowsBlocked
                ? `${t("spreadsheet.contextMenu.hideRows")}: ${homeLineFormatBlockedReason}`
                : t("spreadsheet.contextMenu.hideRows")
            }
            title={homeFormatRowsBlocked ? homeLineFormatBlockedReason : undefined}
            onSelect={() => hideRowsInSelection()}
          >
            {homeMenuIcon("hideUnhide")}
            <span>{t("spreadsheet.contextMenu.hideRows")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`${prefix}-hide-columns`}
            disabled={homeFormatColumnsBlocked}
            aria-label={
              homeFormatColumnsBlocked
                ? `${t("spreadsheet.contextMenu.hideColumns")}: ${homeLineFormatBlockedReason}`
                : t("spreadsheet.contextMenu.hideColumns")
            }
            title={homeFormatColumnsBlocked ? homeLineFormatBlockedReason : undefined}
            onSelect={() => hideColsInSelection()}
          >
            {homeMenuIcon("hideUnhide")}
            <span>{t("spreadsheet.contextMenu.hideColumns")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`${prefix}-hide-sheet`}
            onSelect={() => setSheetHidden(activeSheetIndex, true)}
            disabled={workbookTopologyLocked || visibleSheetCount <= 1}
            aria-label={
              workbookTopologyLocked
                ? `${t("spreadsheet.tabHide")}: ${workbookTopologyLockedReason}`
                : visibleSheetCount > 1
                ? t("spreadsheet.tabHide")
                : `${t("spreadsheet.tabHide")}: ${
                    t("spreadsheet.uiCopy.aWorkbookMustKeepAtLeastOneVisibleSheet")
                  }`
            }
            title={
              workbookTopologyLocked
                ? workbookTopologyLockedReason
                : visibleSheetCount <= 1
                ? t("spreadsheet.uiCopy.aWorkbookMustKeepAtLeastOneVisibleSheet")
                : undefined
            }
          >
            {homeMenuIcon("hideUnhide")}
            <span>{t("spreadsheet.tabHide")}</span>
          </DropdownMenuItem>
          {/* Unhide is Format Rows / Format Columns too (Excel "Protect a
              worksheet"), and its writer already stops at the same line
              check as Hide; the entry says so rather than answer a toast. */}
          <DropdownMenuItem
            data-testid={`${prefix}-unhide-rows`}
            onSelect={() => unhideRowsInSelection()}
            disabled={homeFormatRowsBlocked}
            aria-label={
              homeFormatRowsBlocked
                ? `${t("spreadsheet.contextMenu.unhideRows")}: ${homeLineFormatBlockedReason}`
                : selectionHasHiddenRow
                ? t("spreadsheet.contextMenu.unhideRows")
                : `${t("spreadsheet.contextMenu.unhideRows")}: ${homeNoHiddenRowsReason}`
            }
            title={
              homeFormatRowsBlocked
                ? homeLineFormatBlockedReason
                : selectionHasHiddenRow ? undefined : homeNoHiddenRowsReason
            }
          >
            {homeMenuIcon("hideUnhide")}
            {unhideEntryLabel(
              t("spreadsheet.contextMenu.unhideRows"),
              !homeFormatRowsBlocked && !selectionHasHiddenRow ? homeUnhideRowsHint : undefined,
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`${prefix}-unhide-columns`}
            onSelect={() => unhideColsInSelection()}
            disabled={homeFormatColumnsBlocked}
            aria-label={
              homeFormatColumnsBlocked
                ? `${t("spreadsheet.contextMenu.unhideColumns")}: ${homeLineFormatBlockedReason}`
                : selectionHasHiddenCol
                ? t("spreadsheet.contextMenu.unhideColumns")
                : `${t("spreadsheet.contextMenu.unhideColumns")}: ${homeNoHiddenColumnsReason}`
            }
            title={
              homeFormatColumnsBlocked
                ? homeLineFormatBlockedReason
                : selectionHasHiddenCol ? undefined : homeNoHiddenColumnsReason
            }
          >
            {homeMenuIcon("hideUnhide")}
            {unhideEntryLabel(
              t("spreadsheet.contextMenu.unhideColumns"),
              !homeFormatColumnsBlocked && !selectionHasHiddenCol ? homeUnhideColumnsHint : undefined,
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`${prefix}-unhide-sheet`}
            disabled={workbookTopologyLocked || hiddenSheets.length === 0}
            aria-label={
              workbookTopologyLocked
                ? `${t("spreadsheet.unhideSheetMenu")}: ${workbookTopologyLockedReason}`
                : hiddenSheets.length > 0
                ? t("spreadsheet.unhideSheetMenu")
                : `${t("spreadsheet.unhideSheetMenu")}: ${homeNoHiddenSheetsReason}`
            }
            title={
              workbookTopologyLocked
                ? workbookTopologyLockedReason
                : hiddenSheets.length > 0
                  ? undefined
                  : homeNoHiddenSheetsReason
            }
            onSelect={openUnhideDialog}
          >
            {homeMenuIcon("hideUnhide")}
            <span>{t("spreadsheet.unhideSheetMenu")}</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid={`${prefix}-rename-sheet`}
        disabled={workbookTopologyLocked}
        title={workbookTopologyLocked ? workbookTopologyLockedReason : undefined}
        onSelect={() => {
          beginSheetTabRename(activeSheetIndex);
        }}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.tabRename")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${prefix}-move-copy-sheet`}
        disabled={workbookTopologyLocked}
        title={workbookTopologyLocked ? workbookTopologyLockedReason : undefined}
        onSelect={() =>
          openMoveCopySheetDialog(returnFocusRef.current, "home")
        }
      >
        {homeMenuIcon("moveCopySheet")}
        <span>{t("spreadsheet.uiCopy.moveOrCopySheet")}</span>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          data-testid={`${prefix}-tab-color`}
          disabled={tabColorNativeEditBlocked || Boolean(workbookTopologyReadOnlyReason) || workbookStructureProtection?.locked === true}
          title={workbookTopologyReadOnlyReason ?? (workbookStructureProtection?.locked === true ? workbookStructureProtectedReason : tabColorNativeEditBlocked ? tabColorNativeBlockedReason : undefined)}
        >
          {homeMenuIcon("fillColor")}
          <span>{t("spreadsheet.tabColor")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className={`docs-cupertino-menu docs-cupertino-menu--submenu ${spreadsheetHomeStyles.sheetTabColorMenu}`}
        >
          {renderSheetTabColorChoices({
            current: sheet.tabColor,
            disabled: tabColorNativeEditBlocked || Boolean(workbookTopologyReadOnlyReason) || workbookStructureProtection?.locked === true,
            onPick: (color) => setSheetTabColor(activeSheetIndex, color),
            choiceTestId: (colorIndex) => `${prefix}-tab-color-${colorIndex}`,
            clearTestId: `${prefix}-tab-color-clear`,
            inputTestId: `${prefix}-tab-color-input`,
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid={`${prefix}-protect-sheet`}
        onSelect={() => toggleProtection()}
      >
        {homeMenuIcon("sensitivity")}
        {sheetProtectionConfigured
          ? t("spreadsheet.unprotectSheet")
          : t("spreadsheet.protectSheet")}
      </DropdownMenuItem>
      <DropdownMenuCheckboxItem
        data-testid={`${prefix}-lock-cells`}
        checked={
          primaryLockedSelection === "mixed"
            ? "indeterminate"
            : (primaryLockedSelection ?? false)
        }
        disabled={isSheetProtectionEffectiveRef.current(sheet) || primaryLockedSelection === null}
        aria-label={
          isSheetProtectionEffectiveRef.current(sheet) || primaryLockedSelection === null
            ? `${t("spreadsheet.lockCells")}: ${
                isSheetProtectionEffectiveRef.current(sheet)
                  ? t("spreadsheet.protectionBlocked")
                  : homeFormattingUnavailableReason
              }`
            : t("spreadsheet.lockCells")
        }
        title={
          isSheetProtectionEffectiveRef.current(sheet) || primaryLockedSelection === null
            ? isSheetProtectionEffectiveRef.current(sheet)
              ? t("spreadsheet.protectionBlocked")
              : homeFormattingUnavailableReason
            : undefined
        }
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") setSelectionLocked(checked);
        }}
      >
        {homeMenuIcon("sensitivity")}
        <span>{t("spreadsheet.lockCells")}</span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid={`${prefix}-cells-format-dialog`}
        data-control-occurrence-id="format-cells"
        data-control-surface="home-ribbon-cells"
        onSelect={() =>
          executeVisibleCommand("XLSCTL.HOME.CELLS.FORMAT.FORMAT_CELLS")
        }
        {...visibleCommandMenuProps(
          "XLSCTL.HOME.CELLS.FORMAT.FORMAT_CELLS",
          t("spreadsheet.fmtCellsDialog"),
        )}
      >
        {homeMenuIcon("formatCells")}
        <span>{t("spreadsheet.fmtCellsDialog")}</span>
      </DropdownMenuItem>
      {/* Format a substring of the active cell (bold / italic / underline /
          colour on just that span). */}
      <DropdownMenuItem
        data-testid={`${prefix}-rich-text`}
        onSelect={() => setRichTextOpen(true)}
      >
        <RichTextIcon className={spreadsheetHomeStyles.menuItemIcon} size={16} />
        <span>{t("spreadsheet.richTextTitle")}</span>
      </DropdownMenuItem>
    </>
  );
  return {
    homeCellsFormatMenuItems,
  };
}
