"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Re-export shim. The Office chart insert gallery is shared by Docs,
 * Presentation and Spreadsheet and now lives in
 * `@/components/office-ribbon/OfficeChartInsertGallery`. Docs keeps importing
 * it from here so no Docs call site or test changes.
 */
export {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
  OfficeChartInsertGallery,
  OfficeChartInsertGallery as DocumentChartInsertGallery,
  OfficeChartSchematic,
  chartInsertSections,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
export type {
  OfficeChartGalleryApplication,
  OfficeChartInsertGalleryProps,
  OfficeChartInsertGalleryProps as DocumentChartInsertGalleryProps,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
