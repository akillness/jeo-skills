"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { cssPixelsToEmu } from "../../../../lib/spreadsheet/drawing-buttons";
import { useCallback, type ChangeEvent as ReactChangeEvent, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { loadOfficeImageNaturalSize, officeInsertedPictureSize, imagePixelSizeFromDataUrl } from "@mrnote/core/web/lib/office-picture-fit.ts";
import { insertedHeaderFooterPicture } from "../../../../lib/spreadsheet/header-footer-picture";
import { spreadsheetInsertWriterReceiptMatches } from "../../../../lib/spreadsheet/visible-command-authority";
import { type SpreadsheetRibbonTab } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { workbookEmbeddedPictureChars, SPREADSHEET_EMBEDDED_PICTURE_CHAR_BUDGET, placePicturesDownColumn } from "@mrnote/core/web/lib/spreadsheet/cell-picture.ts";
import { type rangeHasLockedCell as rangeHasLockedCellWithProtection, type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type PrintHeaderFooterPicture } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { SPREADSHEET_IMAGE_FILE_MIME_TYPES, buildImageObject, buildSvgImageObject, isSpreadsheetSvgPictureFile } from "@mrnote/core/web/lib/spreadsheet/sheet-image.ts";
import { spreadsheetPictureFileByteCeiling, fitSpreadsheetPictureSource, FittedPictureReader } from "../../../../lib/spreadsheet/sheet-image-fit";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { MAX_SHEET_ROWS } from "./spreadsheetGridConstants";
import { MAX_SHEET_OBJECTS } from "./spreadsheetObjectContext";
import { type InsertMutationReceipt, type PageSetupSelectionSnapshot } from "./spreadsheetMutationReceipts";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { readSpreadsheetPictureFile } from "./spreadsheetWindowHelpers";
import { MAX_PICTURES_PLACED_IN_CELLS_AT_ONCE } from "./spreadsheetWindowConstants";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetPictureFileInsert reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetPictureFileInsertInputs {
  contextualTabActivationRef: RefObject<{ contextual: NonNullable<SpreadsheetRibbonTab["contextual"]>; id?: string; } | null>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pictureInCellFileAuthorityRef: RefObject<{ requestId: number; receipt: InsertMutationReceipt; } | null>;
  pictureInCellInputRef: RefObject<HTMLInputElement | null>;
  pictureInsertFileAuthorityRef: RefObject<{ requestId: number; receipt: InsertMutationReceipt; } | null>;
  pictureInsertRequestRef: RefObject<number>;
  rangeHasLockedCellRef: RefObject<(candidate: SheetModel, range: Parameters<typeof rangeHasLockedCellWithProtection>[1]) => boolean>;
  readPageSetupSelectionSnapshot: () => PageSetupSelectionSnapshot | null;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  showProtectNotice: (message?: string) => void;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetPictureFileInsert({
  contextualTabActivationRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pictureInCellFileAuthorityRef,
  pictureInCellInputRef,
  pictureInsertFileAuthorityRef,
  pictureInsertRequestRef,
  rangeHasLockedCellRef,
  readPageSetupSelectionSnapshot,
  replaceActiveSheet,
  setSelectedObjectId,
  sheetProtectionAllowsRef,
  showProtectNotice,
  t,
}: SpreadsheetPictureFileInsertInputs) {
  // Insert > Pictures with an .svg file: Excel inserts it as a picture at its
  // own size. The sheet keeps the passive SVG itself (the server's
  // svg_sanitizer when it carries anything active); the workbook writer
  // stores it beside a PNG drawn on the server, as Excel does.
  const insertSvgPictureFileWithAuthority = useCallback(
    async (
      file: File,
      authority: { requestId: number; receipt: InsertMutationReceipt },
    ) => {
      const { preparePassiveSvgPicture } = await import("@mrnote/slides/web/lib/presentation-office-graphic-file.ts");
      let prepared: Awaited<ReturnType<typeof preparePassiveSvgPicture>>;
      try {
        prepared = await preparePassiveSvgPicture(
          file.type ? file : new File([file], file.name, { type: "image/svg+xml", lastModified: file.lastModified }),
        );
      } catch {
        if (pictureInsertRequestRef.current !== authority.requestId) return;
        toast({ variant: "destructive", description: t("spreadsheet.insertRibbon.pictureFileType") });
        return;
      }
      if (pictureInsertRequestRef.current !== authority.requestId) return;
      const receipt = authority.receipt;
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveSelection = readPageSetupSelectionSnapshot();
      const current = Boolean(
        liveSelection &&
          liveSheet &&
          spreadsheetInsertWriterReceiptMatches({
            expectedControlId: receipt.controlId,
            receiptControlId: receipt.controlId,
            sourceWorkbook: receipt.workbook,
            sourceActiveSheetIndex: receipt.activeSheetIndex,
            sourceSheet: receipt.sheet,
            sourceSheetId: receipt.sheetId,
            sourceSelectionEpoch: receipt.selection.epoch,
            sourceRange: receipt.selection.range,
            liveWorkbook,
            liveActiveSheetIndex: liveIndex,
            liveSheet,
            liveSheetId: liveSheet?.id ?? "",
            liveSelectionEpoch: liveSelection?.epoch ?? -1,
            liveRange: liveSelection?.range ?? { r1: -1, r2: -1, c1: -1, c2: -1 },
          }) &&
          sheetProtectionAllowsRef.current(liveSheet, "editObjects"),
      );
      if (!current || !liveSheet) {
        toast({ variant: "destructive", description: t("spreadsheet.insertRibbon.pictureSourceChanged") });
        return;
      }
      const liveObjects = liveSheet.objects ?? [];
      if (liveObjects.length >= MAX_SHEET_OBJECTS) return;
      const picture = buildSvgImageObject(prepared.src, {
        row: receipt.selection.active.row,
        col: receipt.selection.active.col,
      }, file.name.replace(/\.svg$/i, ""));
      if (!picture) {
        toast({ variant: "destructive", description: t("spreadsheet.insertRibbon.pictureInvalid") });
        return;
      }
      const size = officeInsertedPictureSize(
        { width: prepared.pixelWidth, height: prepared.pixelHeight },
        { width: 960, height: 720 },
      );
      const imageObject = {
        ...picture,
        anchor: {
          kind: "oneCell",
          from: picture.anchor.from,
          widthEmu: cssPixelsToEmu(size.width),
          heightEmu: cssPixelsToEmu(size.height),
        },
      } as unknown as SpreadsheetObject;
      replaceActiveSheet({ ...liveSheet, objects: [...liveObjects, imageObject] });
      contextualTabActivationRef.current = { contextual: "object" };
      setSelectedObjectId(imageObject.id);
    },
    [readPageSetupSelectionSnapshot, replaceActiveSheet, t],
  );

  // One picture file into the sheet, authenticated by the insert receipt it
  // was asked under: the Insert > Picture file picker and a pasted image
  // (live audit B241) share the type, size, version and protection checks.
  const insertPictureFileWithAuthority = useCallback(
    (
      file: File,
      authority: { requestId: number; receipt: InsertMutationReceipt },
    ) => {
      if (isSpreadsheetSvgPictureFile(file)) {
        void insertSvgPictureFileWithAuthority(file, authority);
        return;
      }
      const normalizedType = file.type.toLowerCase();
      if (
        !SPREADSHEET_IMAGE_FILE_MIME_TYPES.includes(
          normalizedType as (typeof SPREADSHEET_IMAGE_FILE_MIME_TYPES)[number],
        ) ||
        file.size <= 0 ||
        file.size > spreadsheetPictureFileByteCeiling(normalizedType)
      ) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureFileType"),
        });
        return;
      }
      const reader = new FittedPictureReader();
      reader.onerror = () => {
        if (pictureInsertRequestRef.current !== authority.requestId) return;
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureReadFailed"),
        });
      };
      reader.onload = async () => {
        if (pictureInsertRequestRef.current !== authority.requestId) return;
        // A picture whose data: URL overruns the page's single-string bound
        // is re-encoded down to it (Excel embeds it whole; a page cannot);
        // one that cannot be made to fit is refused here, not at every save.
        const source = await fitSpreadsheetPictureSource(reader.result);
        if (pictureInsertRequestRef.current !== authority.requestId) return;
        if (source === null) {
          toast({
            variant: "destructive",
            description: t("spreadsheet.insertRibbon.pictureFileType"),
          });
          return;
        }
        // Excel inserts a picture at its own size (96 DPI), scaled down
        // together only when it would not fit -- the shared rule the deck
        // uses -- instead of a fixed 120 x 84 box.
        const natural = await loadOfficeImageNaturalSize(source);
        if (pictureInsertRequestRef.current !== authority.requestId) return;
        const receipt = authority.receipt;
        const liveWorkbook = liveSheetsRef.current;
        const liveIndex = liveActiveSheetIndexRef.current;
        const liveSheet = liveWorkbook[liveIndex];
        const liveSelection = readPageSetupSelectionSnapshot();
        const current = Boolean(
          liveSelection &&
          liveSheet &&
          spreadsheetInsertWriterReceiptMatches({
            expectedControlId: receipt.controlId,
            receiptControlId: receipt.controlId,
            sourceWorkbook: receipt.workbook,
            sourceActiveSheetIndex: receipt.activeSheetIndex,
            sourceSheet: receipt.sheet,
            sourceSheetId: receipt.sheetId,
            sourceSelectionEpoch: receipt.selection.epoch,
            sourceRange: receipt.selection.range,
            liveWorkbook,
            liveActiveSheetIndex: liveIndex,
            liveSheet,
            liveSheetId: liveSheet?.id ?? "",
            liveSelectionEpoch: liveSelection?.epoch ?? -1,
            liveRange: liveSelection?.range ?? {
              r1: -1,
              r2: -1,
              c1: -1,
              c2: -1,
            },
          }) &&
          // A picture floats over the cells: Excel's Edit objects alone.
          sheetProtectionAllowsRef.current(liveSheet, "editObjects"),
        );
        if (!current) {
          toast({
            variant: "destructive",
            description: t("spreadsheet.insertRibbon.pictureSourceChanged"),
          });
          return;
        }
        const liveObjects = liveSheet?.objects ?? [];
        if (liveObjects.length >= MAX_SHEET_OBJECTS) return;
        const picture = buildImageObject(source, {
          row: receipt.selection.active.row,
          col: receipt.selection.active.col,
        });
        if (!picture) {
          toast({
            variant: "destructive",
            description: t("spreadsheet.insertRibbon.pictureInvalid"),
          });
          return;
        }
        const size = natural
          ? officeInsertedPictureSize(natural, { width: 960, height: 720 })
          : null;
        const imageObject = (
          size
            ? {
                ...picture,
                anchor: {
                  kind: "oneCell",
                  from: picture.anchor.from,
                  widthEmu: cssPixelsToEmu(size.width),
                  heightEmu: cssPixelsToEmu(size.height),
                },
              }
            : picture
        ) as unknown as SpreadsheetObject;
        replaceActiveSheet({
          ...liveSheet,
          objects: [...liveObjects, imageObject],
        });
        contextualTabActivationRef.current = { contextual: "object" };
        setSelectedObjectId(imageObject.id);
      };
      reader.readAsDataURL(file);
    },
    [insertSvgPictureFileWithAuthority, readPageSetupSelectionSnapshot, replaceActiveSheet, t],
  );
  const handlePictureInsertFileChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;
      event.currentTarget.value = "";
      const authority = pictureInsertFileAuthorityRef.current;
      pictureInsertFileAuthorityRef.current = null;
      if (!file || !authority) return;
      insertPictureFileWithAuthority(file, authority);
    },
    [insertPictureFileWithAuthority],
  );

  // Insert > Pictures > Place in Cell (Excel): the chosen pictures become the
  // values of the active cell and the cells below it, "starting from the
  // active cell and down the column", overwriting what those cells held, in
  // one worksheet transaction (one Undo). Each file is checked, read and
  // fitted like an inserted floating picture; the receipt taken when the
  // picker opened must still be the live workbook and selection afterwards.
  const openPictureInCellFilePicker = useCallback(
    (receipt: InsertMutationReceipt): boolean => {
      const input = pictureInCellInputRef.current;
      if (!input) return false;
      const requestId = pictureInsertRequestRef.current + 1;
      pictureInsertRequestRef.current = requestId;
      pictureInCellFileAuthorityRef.current = { requestId, receipt };
      input.value = "";
      input.click();
      return true;
    },
    [],
  );
  const placePictureFilesInCells = useCallback(
    async (
      files: readonly File[],
      authority: { requestId: number; receipt: InsertMutationReceipt },
    ): Promise<boolean> => {
      const sources: string[] = [];
      for (const file of files.slice(0, MAX_PICTURES_PLACED_IN_CELLS_AT_ONCE)) {
        const source = await readSpreadsheetPictureFile(file);
        if (pictureInsertRequestRef.current !== authority.requestId) return false;
        if (source === null) {
          toast({
            variant: "destructive",
            description: t("spreadsheet.insertRibbon.pictureFileType"),
          });
          return false;
        }
        sources.push(source);
      }
      if (sources.length === 0) return false;
      const receipt = authority.receipt;
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveSelection = readPageSetupSelectionSnapshot();
      const start = receipt.selection.active;
      const last = Math.min(
        start.row + sources.length - 1,
        (liveSheet?.rowCount ?? 1) - 1,
      );
      const current = Boolean(
        liveSelection &&
          liveSheet &&
          spreadsheetInsertWriterReceiptMatches({
            expectedControlId: receipt.controlId,
            receiptControlId: receipt.controlId,
            sourceWorkbook: receipt.workbook,
            sourceActiveSheetIndex: receipt.activeSheetIndex,
            sourceSheet: receipt.sheet,
            sourceSheetId: receipt.sheetId,
            sourceSelectionEpoch: receipt.selection.epoch,
            sourceRange: receipt.selection.range,
            liveWorkbook,
            liveActiveSheetIndex: liveIndex,
            liveSheet,
            liveSheetId: liveSheet?.id ?? "",
            liveSelectionEpoch: liveSelection?.epoch ?? -1,
            liveRange: liveSelection?.range ?? { r1: -1, r2: -1, c1: -1, c2: -1 },
          }),
      );
      if (!current || !liveSheet) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureSourceChanged"),
        });
        return false;
      }
      // A cell the sheet's protection locks takes no picture (it is a value).
      if (
        rangeHasLockedCellRef.current(liveSheet, {
          r1: start.row,
          r2: last,
          c1: start.col,
          c2: start.col,
        })
      ) {
        showProtectNotice();
        return false;
      }
      const added = sources.reduce((total, source) => total + source.length, 0);
      if (
        workbookEmbeddedPictureChars(liveWorkbook) + added >
        SPREADSHEET_EMBEDDED_PICTURE_CHAR_BUDGET
      ) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureBudget"),
        });
        return false;
      }
      const placed = placePicturesDownColumn(
        liveSheet.cells,
        start,
        sources.map((src) => ({ src })),
        // The worksheet's rows, not the stored ones: a blank row below the
        // used range takes a picture like any other cell (live audit B378).
        MAX_SHEET_ROWS,
      );
      if (placed.keys.length === 0) return false;
      replaceActiveSheet({
        ...liveSheet,
        cells: placed.cells,
        rowCount: Math.max(liveSheet.rowCount, start.row + placed.keys.length),
        columnCount: Math.max(liveSheet.columnCount, start.col + 1),
      });
      return true;
    },
    [readPageSetupSelectionSnapshot, replaceActiveSheet, showProtectNotice, t],
  );
  // Page Setup > Header/Footer > Custom Header > Insert Picture: the chosen
  // file read as a picture at its original size (Excel inserts it unscaled),
  // within the workbook's embedded-picture budget.
  const readHeaderFooterPicture = useCallback(
    async (file: File): Promise<PrintHeaderFooterPicture | null> => {
      const source = await readSpreadsheetPictureFile(file);
      if (source === null) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureFileType"),
        });
        return null;
      }
      if (
        workbookEmbeddedPictureChars(liveSheetsRef.current) + source.length >
        SPREADSHEET_EMBEDDED_PICTURE_CHAR_BUDGET
      ) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.insertRibbon.pictureBudget"),
        });
        return null;
      }
      const natural =
        imagePixelSizeFromDataUrl(source) ?? (await loadOfficeImageNaturalSize(source, 2000));
      return insertedHeaderFooterPicture(source, natural);
    },
    [t],
  );
  return {
    handlePictureInsertFileChange,
    insertPictureFileWithAuthority,
    openPictureInCellFilePicker,
    placePictureFilesInCells,
    readHeaderFooterPicture,
  };
}
