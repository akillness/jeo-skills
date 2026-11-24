"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfRibbonTranslator } from "./pdfRibbonTranslator";

export type PdfLinkContextKind = "url" | "page";
export type PdfLinkContextSource = "managed" | "native";

export interface PdfLinkContextRibbonModel {
  kind: PdfLinkContextKind;
  source: PdfLinkContextSource;
  page: number;
  destination: string;
  width: number;
  height: number;
  busy: boolean;
  openEnabled: boolean;
  editEnabled: boolean;
  editDisabledReason?: string;
  deleteEnabled: boolean;
  deleteDisabledReason?: string;
}

export interface PdfLinkContextRibbonLabels {
  link: string;
  open: string;
  edit: string;
  destination: string;
  positionSize: string;
  actions: string;
  webLink: string;
  pageLink: string;
  managedLink: string;
  nativeLink: string;
  openLink: string;
  editLink: string;
  removeLink: string;
  backToEditing: string;
  pageNumber: (page: number) => string;
}

export function createPdfLinkContextRibbonLabels(
  t: PdfRibbonTranslator,
): PdfLinkContextRibbonLabels {
  return {
    link: t("pdfContextRibbon.link.link"),
    open: t("pdfContextRibbon.link.open"),
    edit: t("pdfContextRibbon.link.edit"),
    destination: t("pdfContextRibbon.link.destination"),
    positionSize: t("pdfContextRibbon.link.positionSize"),
    actions: t("pdfContextRibbon.link.actions"),
    webLink: t("pdfContextRibbon.link.webLink"),
    pageLink: t("pdfContextRibbon.link.pageLink"),
    managedLink: t("pdfContextRibbon.link.managedLink"),
    nativeLink: t("pdfContextRibbon.link.nativeLink"),
    openLink: t("pdfContextRibbon.link.openLink"),
    editLink: t("pdfContextRibbon.link.editLink"),
    removeLink: t("pdfContextRibbon.link.removeLink"),
    backToEditing: t("pdfContextRibbon.link.backToEditing"),
    pageNumber: (page) => t("pdfContextRibbon.link.pageNumber", { page }),
  };
}
