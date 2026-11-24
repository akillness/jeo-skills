/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Byte, page and pixel ceilings the PDF viewer enforces on its outputs. */

import { PDF_EDITABLE_MAX_BYTES } from "@mrnote/core/web/lib/document-size-limits.ts";
export const PDF_PAGE_PACKAGE_MAX_SOURCE_BYTES = PDF_EDITABLE_MAX_BYTES;
export const PDF_PAGE_PACKAGE_MAX_AGGREGATE_BYTES = 256 * 1024 * 1024;
export const PDF_PAGE_PACKAGE_MAX_STREAM_CHUNKS = 65_536;
export const PDF_FORM_IMPORT_MAX_DATA_BYTES = 4 * 1024 * 1024;
export const PDF_CAD_DXF_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
export const PDF_IMAGE_ONLY_MAX_PAGES = 500;
// Text one translation sends: the reply is sized by the model's own output
// ceiling (the API's selection-action), and the API takes 200,000 characters
// of page context (MAX_NOTEBOOK_AI_CONTEXT_CHARS). At 20,000 / 4,000 a
// paper or a long selection was refused outright.
export const PDF_FULL_TRANSLATION_MAX_CHARS = 200_000;
export const PDF_SELECTION_TRANSLATION_MAX_CHARS = 200_000;
export const PDF_ENCRYPT_MAX_OUTPUT_BYTES = 160 * 1024 * 1024;
export const PDF_IMAGE_ONLY_MAX_PAGE_POINTS = 20_000;
export const PDF_IMAGE_ONLY_MAX_CANVAS_DIMENSION = 16_384;
export const PDF_IMAGE_ONLY_MAX_PAGE_PIXELS = 40_000_000;
export const PDF_IMAGE_ONLY_MAX_AGGREGATE_PIXELS = 200_000_000;

export const PDF_IMAGE_ONLY_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
