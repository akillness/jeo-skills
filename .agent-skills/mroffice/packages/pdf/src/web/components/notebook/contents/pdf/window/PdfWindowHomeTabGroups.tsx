"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { RefObject } from "react";
import {
  OfficeHomeUndoRail,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { Undo2, Redo2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { PdfEditorRibbonTab } from "./editorRibbonTabs";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfWindowHomeTabGroupsProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  nativeFileAttachmentBusy: boolean;
  nativeFileAttachmentBusyRef: RefObject<boolean>;
  nativePageImportBusy: boolean;
  nativePageImportBusyRef: RefObject<boolean>;
  editorRibbonTab: PdfEditorRibbonTab;
  canUndoNativeReceipt: boolean;
  canRedoNativeReceipt: boolean;
  executeNativeUndo: () => Promise<boolean>;
  executeNativeRedo: () => Promise<boolean>;
}

export function PdfWindowHomeTabGroups({
  t,
  nativeFileAttachmentBusy,
  nativeFileAttachmentBusyRef,
  nativePageImportBusy,
  nativePageImportBusyRef,
  editorRibbonTab,
  canUndoNativeReceipt,
  canRedoNativeReceipt,
  executeNativeUndo,
  executeNativeRedo,
}: PdfWindowHomeTabGroupsProps) {
  return (
    editorRibbonTab === "home" ? (
      <OfficeHomeUndoRail
        label={t("toolbar.ribbonEdit")}
        ribbon="home"
        testId="pdf-editor-home-history"
        undo={{
          activation: "click",
          controlId: "PDFCTL.SURFACE.UNDO",
          disabled:
            nativeFileAttachmentBusy ||
            nativePageImportBusy ||
            !canUndoNativeReceipt,
          icon: <Undo2 size={18} />,
          label: t("pdf.editUndo"),
          onClick: () => {
            if (
              !nativeFileAttachmentBusyRef.current &&
              !nativePageImportBusyRef.current &&
              canUndoNativeReceipt
            ) {
              void executeNativeUndo();
            }
          },
          testId: "pdf-edit-undo",
        }}
        redo={{
          activation: "click",
          controlId: "PDFCTL.SURFACE.REDO",
          disabled:
            nativeFileAttachmentBusy ||
            nativePageImportBusy ||
            !canRedoNativeReceipt,
          icon: <Redo2 size={18} />,
          label: t("pdf.editRedo"),
          onClick: () => {
            if (
              !nativeFileAttachmentBusyRef.current &&
              !nativePageImportBusyRef.current &&
              canRedoNativeReceipt
            ) {
              void executeNativeRedo();
            }
          },
          testId: "pdf-edit-redo",
        }}
      />
    ) : null
  );
}
