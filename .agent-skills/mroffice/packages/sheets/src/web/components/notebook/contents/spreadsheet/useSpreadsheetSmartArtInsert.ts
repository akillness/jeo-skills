"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { anchorForObjectBounds, smartArtFrameForBounds, smartArtMembersInFrame } from "../../../../lib/spreadsheet/drawing-buttons";
import { useCallback, useRef, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { officeSmartArtSeed } from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import { DEFAULT_SMARTART_STYLE } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { isEngineAbort, engineErrorMessageKey, smartArtEngine } from "@mrnote/core/web/lib/office-smartart/remote.ts";
import { useEngineCallQueue } from "@mrnote/core/web/lib/engine-host/use-engine-call.ts";
import { useNativeSmartArtOutlineVersion } from "@mrnote/core/web/lib/office-smartart/native-outline-remote.ts";
import { type SpreadsheetRibbonTab } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { createSpreadsheetShapeObject, isSpreadsheetPresetShapeKind } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { type SpreadsheetSmartArtMember, smartArtLabelsFromValues, MAX_SMART_ART_NODES, SPREADSHEET_SMARTART_FRAME_EMU, SPREADSHEET_SMARTART_FONT_PT } from "@mrnote/core/web/lib/spreadsheet/smart-art.ts";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX } from "./spreadsheetGridConstants";
import { MAX_SHEET_OBJECTS } from "./spreadsheetObjectContext";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { type OfficeSmartArtPlaceholders } from "@mrnote/core/web/lib/office-smartart/catalog.ts";

/** What useSpreadsheetSmartArtInsert reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSmartArtInsertInputs {
  colWidth: SparseAxisSizeResolver;
  contextualTabActivationRef: RefObject<{ contextual: NonNullable<SpreadsheetRibbonTab["contextual"]>; id?: string; } | null>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  rowHeight: SparseAxisSizeResolver;
  selRect: GridRect;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  /** Selects a SmartArt graphic as a whole, through one of its shapes. */
  setSmartArtGraphicScopeId: Dispatch<SetStateAction<string | null>>;
  sheet: SheetModel;
  sheetObjects: SpreadsheetObject[];
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  showProtectNotice: (message?: string) => void;
  smartArtPlaceholders: OfficeSmartArtPlaceholders;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workbookThemeAccentColors: readonly string[];
  /** The workbook theme's body face (`+mn-lt`), which sets how tall the labels' lines stand. */
  workbookBodyFace?: string | null;
  /** A graphic was inserted and selected (the window opens its Text Pane). */
  onInserted?: () => void;
}

/** One served SmartArt command on a sheet: asks, writes, and what follows. */
export interface ServedSheetSmartArtPlan<A> {
  ask: (signal: AbortSignal) => Promise<A>;
  apply: (live: SheetModel, answer: A) => SheetModel | null;
  done?: () => void;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSmartArtInsert({
  colWidth,
  contextualTabActivationRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  replaceActiveSheet,
  rowHeight,
  selRect,
  setSelectedObjectId,
  setSmartArtGraphicScopeId,
  sheet,
  sheetObjects,
  sheetProtectionAllowsRef,
  showProtectNotice,
  smartArtPlaceholders,
  t,
  workbookThemeAccentColors,
  workbookBodyFace,
  onInserted,
}: SpreadsheetSmartArtInsertInputs) {
  // The seed the gallery card and the insert share, from the ONE Office
  // SmartArt catalog and the ONE placeholder rule the three editors seed.
  const smartArtInsertSeed = useCallback(
    (layoutId: string) =>
      officeSmartArtSeed(
        layoutId,
        smartArtPlaceholders.itemLabel,
        smartArtPlaceholders.rootLabel,
      ),
    [smartArtPlaceholders],
  );

  // ── SmartArt layout, served ─────────────────────────────────────────────
  //
  // Insert, every Design-tab relayout and the conversion of an Office diagram
  // ask the engine host; the answer is written in ONE undo step onto the
  // sheet the command was pressed on, and only while that sheet's objects are
  // still the ones the request was built from. The commands run one after
  // another, a command planned from the live sheet when its turn comes: a
  // newer command used to supersede an older one in flight, and the Text
  
  // A failure says why and writes nothing.
  const smartArtCalls = useEngineCallQueue();
  // A preserved diagram's outline is read by the server too; the 转换为可编辑
  // gallery greys its layouts again when it lands.
  useNativeSmartArtOutlineVersion();
  const reportSmartArtEngineError = useCallback(
    (error: unknown) => {
      if (isEngineAbort(error)) return;
      toast({ title: t(engineErrorMessageKey(error)), variant: "destructive" });
    },
    [t],
  );
  /**
   * Queue one served command, planned from the live sheet when its turn
   * comes (so it starts from what the commands before it wrote). A sheet
   * something else wrote while the server was answering is planned again,
   * once, rather than written over.
   */
  // A queued command writes when its answer lands, renders later than the
  // one it was queued in: it writes through the CURRENT sheet writer, which
  // refuses a write built against a sheet that is no longer the live one.
  const replaceActiveSheetRef = useRef(replaceActiveSheet);
  replaceActiveSheetRef.current = replaceActiveSheet;
  const queueServedSheetSmartArt = useCallback(
    <A,>(
      prepare: (live: SheetModel) => ServedSheetSmartArtPlan<A> | null,
      /** After the command settled, whatever came of it. */
      settled?: () => void,
    ): boolean => {
      const index = liveActiveSheetIndexRef.current;
      void smartArtCalls
        .run(async (signal) => {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const start = liveSheetsRef.current[liveActiveSheetIndexRef.current];
            if (!start || liveActiveSheetIndexRef.current !== index) return;
            const plan = prepare(start);
            if (!plan) return;
            const objects = start.objects;
            const answer = await plan.ask(signal);
            if (signal.aborted) return;
            const live = liveSheetsRef.current[liveActiveSheetIndexRef.current];
            if (
              !live ||
              liveActiveSheetIndexRef.current !== index ||
              !sheetProtectionAllowsRef.current(live, "editObjects")
            ) {
              return;
            }
            if (live.objects !== objects) continue;
            const next = plan.apply(live, answer);
            if (!next) return;
            const result = replaceActiveSheetRef.current(next);
            if (result[index]?.objects === next.objects) {
              plan.done?.();
              return;
            }
            // The writer had not caught up with the sheet the command read
            // (the commands before it landed a moment ago): plan it again
            // once the window has rendered them.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        })
        .catch(reportSmartArtEngineError)
        .finally(() => settled?.());
      return true;
    },
    [reportSmartArtEngineError, smartArtCalls],
  );
  /** A command built from the sheet as it is now (dropped if it changed before its turn). */
  const commitServedSheetSmartArt = useCallback(
    <A,>(
      ask: (signal: AbortSignal) => Promise<A>,
      apply: (live: SheetModel, answer: A) => SheetModel | null,
      done?: () => void,
    ): boolean => {
      const objects = liveSheetsRef.current[liveActiveSheetIndexRef.current]?.objects;
      return queueServedSheetSmartArt((live) =>
        live.objects === objects ? { ask, apply, done } : null,
      );
    },
    [queueServedSheetSmartArt],
  );

  /** The served members of an inserted diagram, as the sheet's own objects. */
  const sheetSmartArtInsertObjects = useCallback(
    (
      members: readonly SpreadsheetSmartArtMember[],
      liveSheet: SheetModel,
      objectCount: number,
      anchorRow: number,
      anchorColumn: number,
    ): SpreadsheetObject[] => {
      const room = MAX_SHEET_OBJECTS - objectCount;
      if (members.length === 0 || room <= 0) return [];
      const originLeft =
        SPREADSHEET_HEADER_WIDTH_PX +
        offsetOfLine(anchorColumn, liveSheet.columnCount, colWidth);
      const originTop =
        SPREADSHEET_HEADER_HEIGHT_PX +
        offsetOfLine(anchorRow, liveSheet.rowCount, rowHeight);
      const groupId = `smartart-${Date.now().toString(36)}-${objectCount}`;
      const taken = members.slice(0, room);
      // The graphic's frame, the one anchored object Excel has for a SmartArt
      // graphic (Move and size with cells, as Excel inserts it): from the
      // anchor cell at the size Excel drops a new graphic at.
      const grid = { rowCount: liveSheet.rowCount, columnCount: liveSheet.columnCount, colWidth, rowHeight };
      const graphicFrame = smartArtFrameForBounds(undefined, {
        left: originLeft,
        top: originTop,
        width: Math.max(SPREADSHEET_SMARTART_FRAME_EMU.width / 9525, ...taken.map(({ bounds }) => bounds.left + bounds.width)),
        height: Math.max(SPREADSHEET_SMARTART_FRAME_EMU.height / 9525, ...taken.map(({ bounds }) => bounds.top + bounds.height)),
      }, grid);
      const placed = taken.map((member) => {
        // Only the id / type / anchor skeleton is kept — the member's own
        // normalized style replaces `base.shape` below, so the seed kind here
        // never has to name a geometry the factory's preset vocabulary lacks.
        const base = createSpreadsheetShapeObject(
          isSpreadsheetPresetShapeKind(member.kind) ? member.kind : "rectangle",
          { row: anchorRow, col: anchorColumn },
        );
        const { bounds, kind: _kind, shape, rotation, flipH, ...identity } = member;
        return {
          ...base,
          ...identity,
          groupId,
          shape,
          anchor: {
            ...anchorForObjectBounds(
              { kind: "oneCell", from: { row: anchorRow, column: anchorColumn } },
              {
                left: originLeft + bounds.left,
                top: originTop + bounds.top,
                width: bounds.width,
                height: bounds.height,
              },
              liveSheet.rowCount,
              liveSheet.columnCount,
              colWidth,
              rowHeight,
            ),
            // A member's turn (a cycle's arrows) is the anchor's rotation, the
            // field the canvas draws and the workbook writer emits as `rot`.
            ...(rotation ? { rotation } : {}),
            ...(flipH ? { flipH: true } : {}),
          },
        } as unknown as SpreadsheetObject;
      });
      return smartArtMembersInFrame(
        placed,
        taken.map(({ bounds }) => ({ left: originLeft + bounds.left, top: originTop + bounds.top, width: bounds.width, height: bounds.height })),
        graphicFrame,
        grid,
      );
    },
    [colWidth, rowHeight],
  );

  // Insert SmartArt (Excel / WPS 智能图形): one layout of the shared Office
  // catalog, laid out by the shared engine, projected onto ORDINARY sheet
  // shapes (lib/spreadsheet/smart-art) that share one groupId so the diagram
  // selects / moves / exports as a unit through the existing object path.
  // The text comes from the selected cells when they hold any -- the list is
  // almost always already in the sheet, and re-typing it into a pane is the
  // part people skip -- and from the layout's own placeholders otherwise.
  const insertSmartArtLayout = useCallback(
    (layoutId: string) => {
      if (!sheetProtectionAllowsRef.current(sheet, "editObjects")) {
        showProtectNotice();
        return;
      }
      const seed = smartArtInsertSeed(layoutId);
      if (!seed) return;
      const selected: string[] = [];
      for (let row = selRect.r1; row <= selRect.r2; row += 1) {
        for (let col = selRect.c1; col <= selRect.c2; col += 1) {
          const cell = sheet.cells[`${row}:${col}`];
          const display =
            typeof cell?.display === "string" ? cell.display : undefined;
          selected.push(String(display ?? cell?.value ?? ""));
        }
      }
      const labels = smartArtLabelsFromValues(selected).slice(
        0,
        MAX_SMART_ART_NODES,
      );
      const items = labels.length > 0 ? labels : seed.items;
      // The layout's own outline levels only describe its own seed size.
      const levels =
        seed.levels && seed.levels.length === items.length
          ? seed.levels
          : undefined;
      const accents = workbookThemeAccentColors;
      if (MAX_SHEET_OBJECTS - sheetObjects.length <= 0) return;
      // Anchor below the selection when the labels came from it, so the
      // diagram never covers its own source.
      const anchorRow = labels.length > 0 ? selRect.r2 + 1 : selRect.r1;
      const anchorColumn = selRect.c1;
      // The layout is the server's: the members come back laid out and
      // projected onto sheet shapes.
      let firstAdded: string | null = null;
      commitServedSheetSmartArt(
        (signal) =>
          smartArtEngine(
            "sheet.build",
            {
              kind: seed.kind,
              items,
              ...(levels ? { levels: [...levels] } : {}),
              // An organization chart's sample assistant (Office's sampData),
              // only with the layout's own seed.
              ...(levels && seed.assistants && items === seed.items
                ? { assistants: seed.assistants }
                : {}),
              // An alias card (Continuous Block Process) is laid out as itself.
              ...(seed.layoutUrn ? { layoutUrn: seed.layoutUrn } : {}),
              bounds: SPREADSHEET_SMARTART_FRAME_EMU,
              style: {
                ...DEFAULT_SMARTART_STYLE,
                nodeFill: accents[0] ?? DEFAULT_SMARTART_STYLE.nodeFill,
                fontSize: SPREADSHEET_SMARTART_FONT_PT,
              },
              ...(workbookBodyFace ? { bodyFace: workbookBodyFace } : {}),
            },
            { signal },
          ),
        (live, answer) => {
          const liveObjects = live.objects || [];
          const added = sheetSmartArtInsertObjects(
            answer.members,
            live,
            liveObjects.length,
            anchorRow,
            anchorColumn,
          );
          if (!added.length) return null;
          firstAdded = added[0]?.id ?? null;
          return { ...live, objects: [...liveObjects, ...added] };
        },
        () => {
          contextualTabActivationRef.current = { contextual: "object" };
          setSelectedObjectId(firstAdded);
          // Excel selects an inserted SmartArt graphic as a whole: its
          // frame, no shape's handles (after the selection, which clears it).
          setSmartArtGraphicScopeId(firstAdded);
          if (firstAdded) onInserted?.();
        },
      );
    },
    [
      onInserted,
      commitServedSheetSmartArt,
      selRect,
      sheet,
      sheetObjects,
      sheetSmartArtInsertObjects,
      showProtectNotice,
      smartArtInsertSeed,
      workbookThemeAccentColors,
      workbookBodyFace,
    ],
  );
  return {
    commitServedSheetSmartArt,
    queueServedSheetSmartArt,
    insertSmartArtLayout,
  };
}
