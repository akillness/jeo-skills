/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type PasteGridOptions } from "../../../../lib/spreadsheet/paste-buttons";

/** The cells on screen (the grid is virtualized): what an AI write lights up, row by row. */
export const SPREADSHEET_AI_BLOCK_SELECTOR = 'td:has([data-testid="spreadsheet-cell"][data-cell])';

/**
 * What a sheet an Agent run is drafting fills in with: its cells (keyed by
 * the cell their input names) and its charts, which enter when the rows they
 * sit over do.
 */
export const SPREADSHEET_LIVE_DRAFT_BLOCK_SELECTOR = `${SPREADSHEET_AI_BLOCK_SELECTOR}, [data-chart-id]`;

export type RichPasteOptions = PasteGridOptions;
