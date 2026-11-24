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

export type CopilotSpreadsheetContent = any;
export type CopilotSpreadsheetDelta = any;
export type CopilotSpreadsheetSelection = any;
export type NativeCopilotCellValuePlanner = any;
export type NativeCopilotChartPlanner = any;
export const resolveSpreadsheetCopilotDelta: any = inertFunction("cut#resolveSpreadsheetCopilotDelta", "null");
export type resolveSpreadsheetCopilotDelta = any;
export const spreadsheetCopilotChartHasSelectedRange: any = inertFunction("cut#spreadsheetCopilotChartHasSelectedRange", "boolean");
export type spreadsheetCopilotChartHasSelectedRange = any;
export const spreadsheetCopilotCreatedChartIds: any = inertFunction("cut#spreadsheetCopilotCreatedChartIds", "array");
export type spreadsheetCopilotCreatedChartIds = any;
export const spreadsheetCopilotWorkbookDelta: any = inertFunction("cut#spreadsheetCopilotWorkbookDelta", "null");
export type spreadsheetCopilotWorkbookDelta = any;
