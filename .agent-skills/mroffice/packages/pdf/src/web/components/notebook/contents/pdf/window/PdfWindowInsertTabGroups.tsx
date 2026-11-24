"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  PdfSurfaceRibbonGroup,
  PdfSurfaceRibbonCommand,
} from "../PdfSurfaceRibbon";
import {
  PdfInsertRibbonIcon,
} from "../PdfInsertRibbonIcons";
import type {
  useAutosavedPageDocument,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import type { PdfPendingPatchbackRepair } from "./insertPageAuthority";
import type { PdfEditorRibbonTab } from "./editorRibbonTabs";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfWindowInsertTabGroupsProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workspaceWritable: boolean;
  hasWorkspaceWriteAuthority: () => boolean;
  setInsertPageDialogOpen: Dispatch<SetStateAction<boolean>>;
  insertPageOperationBusy: boolean;
  setInsertPageErrorMessage: Dispatch<SetStateAction<string | null>>;
  pendingPdfPatchbackRepairRef: RefObject<PdfPendingPatchbackRepair | null>;
  insertPageReturnFocusRef: RefObject<HTMLElement | null>;
  setNativeImageInsertRequestId: Dispatch<SetStateAction<number>>;
  editorRibbonTab: PdfEditorRibbonTab;
  addTextMode: boolean;
  setAddTextMode: Dispatch<SetStateAction<boolean>>;
  leaveTextEditModeToReader: (reason: string) => void;
  autosave: ReturnType<typeof useAutosavedPageDocument>;
  handleOpenBackgroundDialog: (trigger?: HTMLElement | null) => void;
  pdfInsertPageInventoryReady: boolean;
}

export function PdfWindowInsertTabGroups({
  t,
  workspaceWritable,
  hasWorkspaceWriteAuthority,
  setInsertPageDialogOpen,
  insertPageOperationBusy,
  setInsertPageErrorMessage,
  pendingPdfPatchbackRepairRef,
  insertPageReturnFocusRef,
  setNativeImageInsertRequestId,
  editorRibbonTab,
  addTextMode,
  setAddTextMode,
  leaveTextEditModeToReader,
  autosave,
  handleOpenBackgroundDialog,
  pdfInsertPageInventoryReady,
}: PdfWindowInsertTabGroupsProps) {
  return (
    editorRibbonTab === "insert" ? (
      <PdfSurfaceRibbonGroup
        label={t("toolbar.ribbonInsert")}
        tab="insert"
        testId="pdf-editor-insert-surface"
      >
        <PdfSurfaceRibbonCommand
          controlId="PDFCTL.SURFACE.INSERT_PAGE"
          disabled={
            !workspaceWritable ||
            insertPageOperationBusy ||
            !pdfInsertPageInventoryReady
          }
          displayLabel={t("pdf.viewer.insertBlankPage")}
          icon={<PdfInsertRibbonIcon name="blankPage" size={24} />}
          label={t("pdf.insertBlankPage")}
          onClick={(trigger) => {
            if (!hasWorkspaceWriteAuthority()) return;
            insertPageReturnFocusRef.current = trigger;
            if (!pendingPdfPatchbackRepairRef.current) {
              setInsertPageErrorMessage(null);
            }
            setInsertPageDialogOpen(true);
          }}
          testId="pdf-insert-page"
        />
        <PdfSurfaceRibbonCommand
          controlId="PDFCTL.SURFACE.INSERT_IMAGE"
          disabled={!workspaceWritable || autosave.readOnly}
          icon={<PdfInsertRibbonIcon name="image" size={24} />}
          label={t("pdf.insertImage")}
          onClick={() => {
            if (!hasWorkspaceWriteAuthority()) return;
            setNativeImageInsertRequestId((value) => value + 1);
            leaveTextEditModeToReader("insert-image");
          }}
          testId="pdf-insert-image"
        />
        <PdfSurfaceRibbonCommand
          active={addTextMode}
          controlId="PDFCTL.SURFACE.ADD_TEXT"
          disabled={!workspaceWritable || autosave.readOnly}
          icon={<PdfInsertRibbonIcon name="textBox" size={24} />}
          label={t("pdf.addText")}
          onClick={() => {
            if (!hasWorkspaceWriteAuthority()) return;
            setAddTextMode((value) => !value);
          }}
          testId="pdf-add-text-toggle"
          toggle
        />
        <PdfSurfaceRibbonCommand
          controlId="PDFCTL.SURFACE.BACKGROUND"
          icon={<PdfInsertRibbonIcon name="background" size={24} />}
          label={t("pdfViewer.background")}
          onClick={(trigger) => handleOpenBackgroundDialog(trigger)}
          testId="pdf-background-open"
        />
      </PdfSurfaceRibbonGroup>
    ) : null
  );
}
