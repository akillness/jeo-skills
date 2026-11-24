/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// This module (MR Note's AI) is part of MR Note, not of the open-source editors. This
// stand-in exports what the editors import from it and does nothing; a host
// that has the feature provides it through the host adapter instead.
/* eslint-disable */
import { inertClass, inertComponent, inertFunction, inertHook, inertValue } from "@mrnote/core/host/inert.ts";

export const PDF_WINDOW_FORMAT_JOB_EVENT: any = "mrai:pdf-window-format-job";
export type PDF_WINDOW_FORMAT_JOB_EVENT = any;
export type PdfWindowFormatChanges = any;
export type PdfWindowFormatJob = any;
export type PdfWindowFormatOutcome = any;
export const registerPdfWindowFormatPage: any = inertFunction("cut#registerPdfWindowFormatPage", "unsubscribe");
export type registerPdfWindowFormatPage = any;
export const settlePdfWindowFormatJob: any = inertFunction("cut#settlePdfWindowFormatJob", "promise");
export type settlePdfWindowFormatJob = any;
export const takePdfWindowFormatJob: any = inertFunction("cut#takePdfWindowFormatJob", "null");
export type takePdfWindowFormatJob = any;
