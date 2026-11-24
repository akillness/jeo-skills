"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { MAX_PICTURE_NAME_LENGTH } from "../../../../lib/spreadsheet/drawing-buttons";
import { Fragment, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { selectionPaneClickMode } from "@mrnote/core/web/components/office-ribbon/officeSelectionPaneClick.ts";
import { ArrowUpToLine, Boxes, ChevronUp, ChevronDown, ArrowDownToLine } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeDockedPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPaneDockHost.tsx";
import {
  OfficeSelectionPaneList,
  OfficeSelectionPaneRow,
  type OfficeSelectionPaneMove,
} from "@mrnote/core/web/components/office-ribbon/OfficeSelectionPaneList.tsx";
import spreadsheetHomeStyles from "./SpreadsheetHomeRibbon.module.css";
import { drawingStackPosition } from "../../../../lib/spreadsheet/drawing-stack";
import { chartDrawingGroupId } from "../../../../lib/spreadsheet/chart-groups";
import { type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { spreadsheetDrawingDisplayName, type SpreadsheetDrawing } from "./spreadsheetObjectContext";
import { type SpreadsheetChart } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { spreadsheetSelectionPaneIcon } from "./spreadsheetWindowHelpers";
import { SPREADSHEET_TASK_PANE_EDGES } from "./spreadsheetWindowConstants";
import { type DrawingStackEntry } from "../../../../lib/spreadsheet/drawing-stack";
import { type Dispatch, type SetStateAction } from "react";
import { type OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

/** What renderSpreadsheetSelectionPane reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetSelectionPaneInputs {
  /** The sheet's own charts: listed, shown and hidden with the objects (user
   * audit S-011). */
  charts: readonly SpreadsheetChart[];
  commitSelectionPaneRename: () => void;
  /** Excel's default name of a drawing without one ("矩形 1", "图表 1"). */
  drawingDefaultName: (drawing: SpreadsheetDrawing) => string;
  drawingStack: DrawingStackEntry[];
  reorderSheetChart: (chartId: string, move: "front" | "back" | "forward" | "backward") => void;
  reorderSheetObject: (objectId: string, move: "front" | "back" | "forward" | "backward") => void;
  /** A group's row: the whole group moves through the sheet's stack (by one
   * of its members), as the ribbon moves it. */
  reorderSheetGroup: (objectId: string, move: "front" | "back" | "forward" | "backward") => void;
  reorderSheetGroupChart: (chartId: string, move: "front" | "back" | "forward" | "backward") => void;
  /** The pane's drag and Ctrl+Shift+F / Ctrl+Shift+B (SpreadsheetWindow). */
  moveSheetPaneUnits: (move: OfficeSelectionPaneMove) => void;
  selectedChartId: string | null;
  selectedObjectId: string | null;
  /** The grid's multi-selection (`drawing:<id>` / `native:<chartId>`), when
   * it holds two or more drawings; the pane shows each of them selected. */
  selectedDrawingKeys: readonly string[] | null;
  /** Ctrl/Cmd+Click (toggle) and Shift+Click (range over `order`, the pane's
   * selectable names top to bottom) on a row (SpreadsheetWindow). */
  selectPaneDrawings: (key: string, mode: "toggle" | "range", order: readonly string[]) => boolean;
  selectSessionChart: (chartId: string) => void;
  selectionPaneRef: RefObject<HTMLElement | null>;
  selectionPaneRename: { id: string; draft: string; } | null;
  selectSessionObject: (objectId: string) => boolean;
  setSelectionPaneOpen: Dispatch<SetStateAction<boolean>>;
  setSelectionPaneRename: Dispatch<SetStateAction<{ id: string; draft: string; } | null>>;
  setSheetObjectsHidden: (ids: ReadonlySet<string>, hidden: boolean, chartIds?: ReadonlySet<string>) => void;
  sheet: SheetModel;
  sheetObjectPaneWritable: (object: SpreadsheetObject, field: "hidden" | "name") => boolean;
  sheetObjects: SpreadsheetObject[];
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheetTaskPaneDocks: { right: OfficeTaskPaneDockRegistry; };
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  uniqueSheetObjectIndex: (objectId: string) => number | null;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetSelectionPane({
  charts,
  commitSelectionPaneRename,
  drawingDefaultName,
  drawingStack,
  reorderSheetChart,
  reorderSheetObject,
  reorderSheetGroup,
  reorderSheetGroupChart,
  moveSheetPaneUnits,
  selectedChartId,
  selectedObjectId,
  selectedDrawingKeys,
  selectPaneDrawings,
  selectSessionChart,
  selectionPaneRef,
  selectionPaneRename,
  selectSessionObject,
  setSelectionPaneOpen,
  setSelectionPaneRename,
  setSheetObjectsHidden,
  sheet,
  sheetObjectPaneWritable,
  sheetObjects,
  sheetProtectionAllowsRef,
  sheetTaskPaneDocks,
  t,
  uniqueSheetObjectIndex,
}: RenderSpreadsheetSelectionPaneInputs) {
  // The sheet's own charts take the pane's writes while the sheet's objects
  // may be edited (protection's Edit objects).
  const chartsWritable = sheetProtectionAllowsRef.current(sheet, "editObjects");
  // A group member's row moves it among its own group (Excel's pane), so its
  // rail ends at the group's top / bottom member, not the sheet's.
  const memberLevels = new Map<string, number[]>();
  const noteMember = (groupId: unknown, level: number) => {
    const group = chartDrawingGroupId(groupId);
    if (!group || level < 0) return;
    memberLevels.set(group, [...(memberLevels.get(group) ?? []), level]);
  };
  sheetObjects.forEach((object) => noteMember(object.groupId, drawingStackPosition(drawingStack, "object", object.id)));
  charts.forEach((chart) => noteMember(chart.groupId, drawingStackPosition(drawingStack, "chart", chart.id)));
  const railEnds = (groupId: unknown, level: number) => {
    const levels = memberLevels.get(chartDrawingGroupId(groupId) ?? "");
    return levels && levels.length > 1
      ? { top: level >= Math.max(...levels), bottom: level <= Math.min(...levels) }
      : { top: level === drawingStack.length - 1, bottom: level <= 0 };
  };
  return (
        <OfficeDockedPane
          docks={sheetTaskPaneDocks}
          edges={SPREADSHEET_TASK_PANE_EDGES}
          pane="selection"
        >
          {/* Excel's Selection Pane (Home > Find & Select > Selection Pane):
              the shared Office task pane and object list Docs uses, docked
              with the workbook's other panes. The list reads front-most
              first; the rail moves an object through the stack, which is the
              sheet's object order. */}
          <OfficeTaskPane
            title={t("toolbar.selectionPane")}
            closeLabel={t("common.close")}
            onClose={() => setSelectionPaneOpen(false)}
            testIdPrefix="spreadsheet-selection"
            testId="spreadsheet-selection-pane"
            closeTestId="spreadsheet-selection-pane-close"
            paneRef={selectionPaneRef}
            dockRight={false}
            className={spreadsheetHomeStyles.chartFormatPaneFill}
          >
            {(() => {
              const paneIds = new Set(
                sheetObjects
                  .filter((object) => sheetObjectPaneWritable(object, "hidden"))
                  .map((object) => object.id),
              );
              const chartIds = chartsWritable ? new Set(charts.map((chart) => chart.id)) : new Set<string>();
              if (paneIds.size === 0 && chartIds.size === 0) return null;
              const paneHidden = [
                ...sheetObjects.filter((object) => paneIds.has(object.id)).map((object) => object.hidden === true),
                ...charts.filter((chart) => chartIds.has(chart.id)).map((chart) => chart.hidden === true),
              ];
              return (
                <span className={dialogParts.row}>
                  <button
                    type="button"
                    className={dialogParts.compactButton}
                    disabled={!paneHidden.some(Boolean)}
                    onClick={() => setSheetObjectsHidden(paneIds, false, chartIds)}
                    data-testid="spreadsheet-selection-pane-show-all"
                  >
                    {t("presentation.selectionPane.showAll")}
                  </button>
                  <button
                    type="button"
                    className={dialogParts.compactButton}
                    disabled={paneHidden.every(Boolean)}
                    onClick={() => setSheetObjectsHidden(paneIds, true, chartIds)}
                    data-testid="spreadsheet-selection-pane-hide-all"
                  >
                    {t("presentation.selectionPane.hideAll")}
                  </button>
                </span>
              );
            })()}
            <SpreadsheetSelectionPaneObjects
              charts={charts}
              chartsWritable={chartsWritable}
              commitSelectionPaneRename={commitSelectionPaneRename}
              drawingDefaultName={drawingDefaultName}
              drawingStack={drawingStack}
              moveSheetPaneUnits={moveSheetPaneUnits}
              railEnds={railEnds}
              reorderSheetChart={reorderSheetChart}
              reorderSheetObject={reorderSheetObject}
              reorderSheetGroup={reorderSheetGroup}
              reorderSheetGroupChart={reorderSheetGroupChart}
              selectedChartId={selectedChartId}
              selectedObjectId={selectedObjectId}
              selectedDrawingKeys={selectedDrawingKeys}
              selectPaneDrawings={selectPaneDrawings}
              selectSessionChart={selectSessionChart}
              selectionPaneRename={selectionPaneRename}
              selectSessionObject={selectSessionObject}
              setSelectionPaneRename={setSelectionPaneRename}
              setSheetObjectsHidden={setSheetObjectsHidden}
              sheetObjectPaneWritable={sheetObjectPaneWritable}
              sheetObjects={sheetObjects}
              objectsWritable={sheetProtectionAllowsRef.current(sheet, "editObjects")}
              t={t}
              uniqueSheetObjectIndex={uniqueSheetObjectIndex}
            />
          </OfficeTaskPane>
        </OfficeDockedPane>
  );
}

type PaneMove = "front" | "back" | "forward" | "backward";

interface SpreadsheetSelectionPaneObjectsProps {
  charts: readonly SpreadsheetChart[];
  chartsWritable: boolean;
  commitSelectionPaneRename: () => void;
  drawingDefaultName: (drawing: SpreadsheetDrawing) => string;
  drawingStack: DrawingStackEntry[];
  moveSheetPaneUnits: (move: OfficeSelectionPaneMove) => void;
  railEnds: (groupId: unknown, level: number) => { top: boolean; bottom: boolean };
  reorderSheetChart: (chartId: string, move: PaneMove) => void;
  reorderSheetObject: (objectId: string, move: PaneMove) => void;
  reorderSheetGroup: (objectId: string, move: PaneMove) => void;
  reorderSheetGroupChart: (chartId: string, move: PaneMove) => void;
  selectedChartId: string | null;
  selectedObjectId: string | null;
  selectedDrawingKeys: readonly string[] | null;
  selectPaneDrawings: (key: string, mode: "toggle" | "range", order: readonly string[]) => boolean;
  selectSessionChart: (chartId: string) => void;
  selectionPaneRename: { id: string; draft: string } | null;
  selectSessionObject: (objectId: string) => boolean;
  setSelectionPaneRename: Dispatch<SetStateAction<{ id: string; draft: string } | null>>;
  setSheetObjectsHidden: (ids: ReadonlySet<string>, hidden: boolean, chartIds?: ReadonlySet<string>) => void;
  sheetObjectPaneWritable: (object: SpreadsheetObject, field: "hidden" | "name") => boolean;
  sheetObjects: SpreadsheetObject[];
  objectsWritable: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  uniqueSheetObjectIndex: (objectId: string) => number | null;
}

type PaneDrawingRow =
  | { kind: "object"; object: SpreadsheetObject; index: number; level: number; group: string | undefined }
  | { kind: "chart"; chart: SpreadsheetChart; index: number; level: number; group: string | undefined };

/** A SmartArt graphic's members carry its `smartArt…` markers. */
function isSmartArtMember(object: SpreadsheetObject): boolean {
  return Object.keys(object).some((key) => key.startsWith("smartArt"));
}

/**
 * The pane's rows as Excel lists them: front-most first, a group of two or
 * more drawings one node where its top member stands, its members under it
 * (Right / Left arrow or its arrow expand and collapse it; Alt+Shift+9 /
 * Alt+Shift+1 all of them). A row drags among the rows of its own level --
 * the sheet's drawings and groups, or one group's members -- and the drop is
 * the sheet's own Arrange moves (SpreadsheetWindow `moveSheetPaneUnits`).
 */
function SpreadsheetSelectionPaneObjects({
  charts,
  chartsWritable,
  commitSelectionPaneRename,
  drawingDefaultName,
  drawingStack,
  moveSheetPaneUnits,
  railEnds,
  reorderSheetChart,
  reorderSheetObject,
  reorderSheetGroup,
  reorderSheetGroupChart,
  selectedChartId,
  selectedObjectId,
  selectedDrawingKeys,
  selectPaneDrawings,
  selectSessionChart,
  selectionPaneRename,
  selectSessionObject,
  setSelectionPaneRename,
  setSheetObjectsHidden,
  sheetObjectPaneWritable,
  sheetObjects,
  objectsWritable,
  t,
  uniqueSheetObjectIndex,
}: SpreadsheetSelectionPaneObjectsProps) {
  // Groups open by default (their members listed, as Excel's pane shows
  // them); a SmartArt graphic is one object and starts closed.
  const [expandedOverride, setExpandedOverride] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const rows: PaneDrawingRow[] = [
    ...sheetObjects.flatMap((object, index) =>
      // A SmartArt item its layout does not draw is in the outline (the
      // Text Pane), not on the sheet.
      (object as { smartArtHidden?: unknown }).smartArtHidden === true
        ? []
        : [{
            kind: "object" as const,
            object,
            index,
            level: drawingStackPosition(drawingStack, "object", object.id),
            group: chartDrawingGroupId(object.groupId),
          }],
    ),
    ...charts.map((chart, index) => ({
      kind: "chart" as const,
      chart,
      index,
      level: drawingStackPosition(drawingStack, "chart", chart.id),
      group: chartDrawingGroupId(chart.groupId),
    })),
  ]
    // Front-most first, across pictures, shapes and charts: the one stack
    // Arrange moves them through.
    .sort((left, right) => right.level - left.level || right.index - left.index);
  // A group is a node when it holds two or more of the sheet's drawings
  // (`drawingStackPaneUnits`, which the drop is planned on).
  const groupSizes = new Map<string, number>();
  for (const drawing of [...sheetObjects, ...charts]) {
    const group = chartDrawingGroupId(drawing.groupId);
    if (group) groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
  }
  const nodeGroup = (row: PaneDrawingRow) =>
    row.group && (groupSizes.get(row.group) ?? 0) > 1 ? row.group : undefined;
  const members = new Map<string, PaneDrawingRow[]>();
  const units: Array<{ group: string } | { row: PaneDrawingRow }> = [];
  for (const row of rows) {
    const group = nodeGroup(row);
    if (!group) {
      units.push({ row });
      continue;
    }
    const list = members.get(group);
    if (list) list.push(row);
    else {
      members.set(group, [row]);
      units.push({ group });
    }
  }
  const hasGroups = members.size > 0;
  // "Group 2" is the sheet's second group from the back, as the names Office
  // gives groups count.
  const groupOrdinal = new Map(
    [...members.keys()].reverse().map((group, index) => [group, index + 1]),
  );
  const drawingCount = sheetObjects.length + charts.length;
  const keyOf = (row: PaneDrawingRow) =>
    row.kind === "chart" ? `chart:${row.chart.id}` : `object:${row.object.id}`;
  const rowMovable = (row: PaneDrawingRow) =>
    row.kind === "chart"
      ? chartsWritable && drawingCount > 1
      : uniqueSheetObjectIndex(row.object.id) !== null && drawingCount > 1 && objectsWritable;
  const multiSelected = new Set(selectedDrawingKeys ?? []);
  const selectionKeyOf = (row: PaneDrawingRow) =>
    row.kind === "chart" ? `native:${row.chart.id}` : `drawing:${row.object.id}`;
  const rowSelected = (row: PaneDrawingRow) =>
    multiSelected.size > 1
      ? multiSelected.has(selectionKeyOf(row)) &&
        (row.kind === "chart" || uniqueSheetObjectIndex(row.object.id) !== null)
      : row.kind === "chart"
        ? row.chart.id === selectedChartId
        : uniqueSheetObjectIndex(row.object.id) !== null && row.object.id === selectedObjectId;
  // The names a Shift+Click runs over, top to bottom as listed: every shown
  // drawing the grid can select (a collapsed group's members are not listed).
  const rowHidden = (row: PaneDrawingRow) =>
    row.kind === "chart" ? row.chart.hidden === true : row.object.hidden === true;
  const rowSelectable = (row: PaneDrawingRow) =>
    !rowHidden(row) && (row.kind === "chart" || uniqueSheetObjectIndex(row.object.id) !== null);
  const groupExpanded = (group: string) => {
    const groupRows = members.get(group) ?? [];
    const smartArt = groupRows.some((row) => row.kind === "object" && isSmartArtMember(row.object));
    return expandedOverride.get(group) ?? !smartArt;
  };
  const clickOrder = units.flatMap((unit) => {
    if (!("group" in unit)) return rowSelectable(unit.row) ? [selectionKeyOf(unit.row)] : [];
    const groupRows = (members.get(unit.group) ?? []).filter(rowSelectable);
    // A collapsed group's node stands for its front-most shown member.
    return (groupExpanded(unit.group) ? groupRows : groupRows.slice(0, 1)).map(selectionKeyOf);
  });
  /** Ctrl/Cmd+Click or Shift+Click on a row: true when the pane took it. */
  const modifiedClick = (event: ReactMouseEvent, key: string) => {
    const mode = selectionPaneClickMode(event);
    if (mode === "single") return false;
    selectPaneDrawings(key, mode, clickOrder);
    return true;
  };
  // A row's Bring / Send rail moves the whole multi-selection when the row
  // is in it (Excel moves the ShapeRange), else the row alone.
  const inMultiSelection = (row: PaneDrawingRow) => multiSelected.size > 1 && multiSelected.has(selectionKeyOf(row));
  const reorderActions = (
    top: boolean,
    bottom: boolean,
    testSuffix: string,
    onMove: (move: PaneMove) => void,
  ) => ({
    label: t("toolbar.objectLayer"),
    actions: (
      [
        ["front", "bringToFront", ArrowUpToLine, top],
        ["forward", "bringForward", ChevronUp, top],
        ["backward", "sendBackward", ChevronDown, bottom],
        ["back", "sendToBack", ArrowDownToLine, bottom],
      ] as const
    ).map(([move, labelKey, Icon, disabled]) => ({
      key: move,
      label: t(`spreadsheet.${labelKey}`),
      icon: <Icon size={13} aria-hidden />,
      disabled,
      testId: `spreadsheet-selection-pane-${move}-${testSuffix}`,
      onClick: () => onMove(move),
    })),
  });

  const renderDrawingRow = (row: PaneDrawingRow, level: number | undefined, container: string) => {
    if (row.kind === "chart") {
      const { chart, index } = row;
      const chartLabel = spreadsheetDrawingDisplayName(chart, drawingDefaultName);
      const hidden = chart.hidden === true;
      const visibilityLabel = hidden
        ? t("presentation.selectionPane.showObject")
        : t("presentation.selectionPane.hideObject");
      const renameId = `chart:${chart.id}`;
      const { top, bottom } = railEnds(chart.groupId, row.level);
      const movable = rowMovable(row);
      return (
        <OfficeSelectionPaneRow
          key={renameId}
          icon={spreadsheetSelectionPaneIcon({ type: "chart" })}
          label={chartLabel}
          selected={rowSelected(row)}
          hidden={hidden}
          reorderable={movable}
          level={level}
          testId={`spreadsheet-selection-pane-chart-${index}`}
          rowData={{ "data-chart-id": chart.id, "data-object-type": "chart" }}
          drag={{ key: keyOf(row), container, movable }}
          onClick={(event) => {
            if (hidden || modifiedClick(event, `native:${chart.id}`)) return;
            selectSessionChart(chart.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "F2" && chartsWritable) {
              event.preventDefault();
              setSelectionPaneRename({ id: renameId, draft: chartLabel });
            }
          }}
          onLabelDoubleClick={() => {
            if (chartsWritable) setSelectionPaneRename({ id: renameId, draft: chartLabel });
          }}
          rename={
            selectionPaneRename?.id === renameId
              ? {
                  draft: selectionPaneRename.draft,
                  inputLabel: t("presentation.selectionPane.objectName"),
                  testId: "spreadsheet-selection-pane-rename-input",
                  maxLength: MAX_PICTURE_NAME_LENGTH,
                  onChange: (draft) => setSelectionPaneRename({ id: renameId, draft }),
                  onCommit: commitSelectionPaneRename,
                  onCancel: () => setSelectionPaneRename(null),
                }
              : null
          }
          visibility={{
            hidden,
            disabled: !chartsWritable,
            title: visibilityLabel,
            ariaLabel: visibilityLabel,
            testId: `spreadsheet-selection-pane-chart-visibility-${index}`,
            onToggle: () => setSheetObjectsHidden(new Set(), !hidden, new Set([chart.id])),
          }}
          reorder={
            movable
              ? reorderActions(top, bottom, `chart-${index}`, (move) =>
                  inMultiSelection(row) ? reorderSheetGroupChart(chart.id, move) : reorderSheetChart(chart.id, move),
                )
              : null
          }
        />
      );
    }
    const { object, index } = row;
    const unique = uniqueSheetObjectIndex(object.id) !== null;
    // A picture says its caption or "图片 N"; any other drawing its name, its
    // words, or Excel's default name ("矩形 1"), never its internal id (user
    // audit S-010).
    const objectLabel = spreadsheetDrawingDisplayName(object, drawingDefaultName);
    const renameable = unique && sheetObjectPaneWritable(object, "name");
    const visibilityWritable = unique && sheetObjectPaneWritable(object, "hidden");
    const hidden = object.hidden === true;
    const visibilityLabel = hidden
      ? t("presentation.selectionPane.showObject")
      : t("presentation.selectionPane.hideObject");
    const reorderable = rowMovable(row);
    // A SmartArt graphic's parts keep the order its layout gives them.
    const movable = reorderable && !(container && isSmartArtMember(object));
    const { top, bottom } = railEnds(object.groupId, row.level);
    return (
      <OfficeSelectionPaneRow
        key={`${object.id}:${index}`}
        icon={spreadsheetSelectionPaneIcon(object)}
        label={objectLabel}
        selected={rowSelected(row)}
        hidden={hidden}
        reorderable={movable}
        level={level}
        testId={`spreadsheet-selection-pane-object-${index}`}
        rowData={{
          "data-object-id": unique ? object.id : undefined,
          "data-object-type": object.type,
        }}
        drag={{ key: keyOf(row), container, movable }}
        onClick={(event) => {
          // A hidden object stays listed but is not drawn, so there is
          // nothing on the grid to select.
          if (!unique || hidden || modifiedClick(event, `drawing:${object.id}`)) return;
          selectSessionObject(object.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "F2" && renameable) {
            event.preventDefault();
            setSelectionPaneRename({ id: object.id, draft: objectLabel });
          }
        }}
        onLabelDoubleClick={() => {
          if (renameable) {
            setSelectionPaneRename({ id: object.id, draft: objectLabel });
          }
        }}
        rename={
          selectionPaneRename?.id === object.id
            ? {
                draft: selectionPaneRename.draft,
                inputLabel: t("presentation.selectionPane.objectName"),
                testId: "spreadsheet-selection-pane-rename-input",
                maxLength: MAX_PICTURE_NAME_LENGTH,
                onChange: (draft) => setSelectionPaneRename({ id: object.id, draft }),
                onCommit: commitSelectionPaneRename,
                onCancel: () => setSelectionPaneRename(null),
              }
            : null
        }
        visibility={{
          hidden,
          disabled: !visibilityWritable,
          title: visibilityLabel,
          ariaLabel: visibilityLabel,
          testId: `spreadsheet-selection-pane-visibility-${index}`,
          onToggle: () => setSheetObjectsHidden(new Set([object.id]), !hidden),
        }}
        reorder={
          movable
            ? reorderActions(top, bottom, String(index), (move) =>
                inMultiSelection(row) ? reorderSheetGroup(object.id, move) : reorderSheetObject(object.id, move),
              )
            : null
        }
      />
    );
  };

  const renderGroup = (group: string) => {
    const groupRows = members.get(group) ?? [];
    const smartArt = groupRows.some((row) => row.kind === "object" && isSmartArtMember(row.object));
    const expanded = expandedOverride.get(group) ?? !smartArt;
    const label = smartArt
      ? `${t("toolbar.smartArt")} ${groupOrdinal.get(group) ?? 1}`
      : t("presentation.selectionPane.groupName", { number: groupOrdinal.get(group) ?? 1 });
    const objectIds = new Set(
      groupRows.flatMap((row) =>
        row.kind === "object" && sheetObjectPaneWritable(row.object, "hidden") ? [row.object.id] : [],
      ),
    );
    const chartIds = new Set(
      chartsWritable ? groupRows.flatMap((row) => (row.kind === "chart" ? [row.chart.id] : [])) : [],
    );
    const hidden = groupRows.every((row) =>
      row.kind === "chart" ? row.chart.hidden === true : row.object.hidden === true,
    );
    const visibilityLabel = hidden
      ? t("presentation.selectionPane.showObject")
      : t("presentation.selectionPane.hideObject");
    const movable = groupRows.every(rowMovable) && units.length > 1;
    const lead = groupRows[0];
    const levels = groupRows.map((row) => row.level);
    const top = Math.max(...levels) === drawingStack.length - 1;
    const bottom = Math.min(...levels) <= 0;
    const toggle = () =>
      setExpandedOverride((current) => new Map(current).set(group, !expanded));
    return (
      <Fragment key={`group:${group}`}>
        <OfficeSelectionPaneRow
          icon={<Boxes size={16} aria-hidden />}
          label={label}
          selected={groupRows.some(rowSelected)}
          hidden={hidden}
          reorderable={movable}
          level={0}
          testId={`spreadsheet-selection-pane-group-${group}`}
          rowData={{ "data-group-id": group, "data-object-type": "group" }}
          drag={{ key: `group:${group}`, container: "", movable }}
          expansion={{
            expanded,
            label: expanded
              ? t("presentation.selectionPane.collapseGroup")
              : t("presentation.selectionPane.expandGroup"),
            testId: `spreadsheet-selection-pane-expand-${group}`,
            onToggle: toggle,
          }}
          onClick={(event) => {
            // The group's front-most drawing on the grid stands for it.
            const shown = groupRows.find((row) =>
              row.kind === "chart" ? row.chart.hidden !== true : row.object.hidden !== true,
            );
            if (!shown || modifiedClick(event, selectionKeyOf(shown))) return;
            if (shown.kind === "chart") selectSessionChart(shown.chart.id);
            else selectSessionObject(shown.object.id);
          }}
          visibility={
            objectIds.size + chartIds.size > 0
              ? {
                  hidden,
                  title: visibilityLabel,
                  ariaLabel: `${visibilityLabel} · ${label}`,
                  testId: `spreadsheet-selection-pane-group-visibility-${group}`,
                  onToggle: () => setSheetObjectsHidden(objectIds, !hidden, chartIds),
                }
              : null
          }
          reorder={
            movable && lead
              ? reorderActions(top, bottom, `group-${group}`, (move) =>
                  lead.kind === "chart"
                    ? reorderSheetGroupChart(lead.chart.id, move)
                    : reorderSheetGroup(lead.object.id, move),
                )
              : null
          }
        />
        {expanded ? groupRows.map((row) => renderDrawingRow(row, 1, `group:${group}`)) : null}
      </Fragment>
    );
  };

  return (
    <OfficeSelectionPaneList
      isEmpty={sheetObjects.length === 0 && charts.length === 0}
      emptyLabel={t("goTo.empty")}
      emptyTestId="spreadsheet-selection-pane-empty"
      listLabel={t("toolbar.selectionPane")}
      reorder={{
        onMove: moveSheetPaneUnits,
        hint: t("presentation.selectionPane.reorderHelp"),
        onExpandAll: hasGroups
          ? (expanded) =>
              setExpandedOverride(new Map([...members.keys()].map((group) => [group, expanded])))
          : undefined,
      }}
    >
      {units.map((unit) =>
        "group" in unit ? renderGroup(unit.group) : renderDrawingRow(unit.row, hasGroups ? 0 : undefined, ""),
      )}
    </OfficeSelectionPaneList>
  );
}
