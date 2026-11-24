"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Docs-facing name for the shared SmartArt insert gallery, which now lives in
 * `components/office-ribbon/OfficeSmartArtInsertGallery.tsx` so Presentation and
 * Spreadsheet render the same menu. Docs keeps its
 * `document-toolbar-smartart-menu-*` test ids; its cards draw the shared engine
 * scene, which is exactly what the insert materialises as native shapes.
 */

export {
  OfficeSmartArtInsertGallery,
  OfficeSmartArtInsertGallery as DocumentSmartArtInsertGallery,
  type OfficeSmartArtInsertGalleryProps,
  type OfficeSmartArtInsertGalleryProps as DocumentSmartArtInsertGalleryProps,
  type SmartArtGalleryApplication,
  type SmartArtInsertGalleryGroup,
  type SmartArtInsertGalleryLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx";
