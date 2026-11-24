"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useSyncExternalStore } from "react";
import { onTextEngineChange } from "@mrnote/core/web/lib/text-engine/measure.ts";
import { spreadsheetTextEngineEpoch, spreadsheetTextEngineOn } from "@mrnote/core/web/lib/spreadsheet/spreadsheet-text-engine.ts";
import { officeWrapExtraEpoch, onOfficeWrapExtraLoaded } from "@mrnote/core/web/lib/spreadsheet/office-hinted-wrap.ts";

const subscribe = (listener: () => void) => {
  const engine = spreadsheetTextEngineOn() ? onTextEngineChange(listener) : () => {};
  const extra = onOfficeWrapExtraLoaded(listener);
  return () => {
    engine();
    extra();
  };
};

/** The engine's epoch, and the hinted wrap's extra table once it has landed
 * (office-hinted-wrap: Greek, Latin Extended-A and the math signs). */
const epoch = () => {
  const extra = officeWrapExtraEpoch();
  const engine = spreadsheetTextEngineEpoch();
  return extra ? `${engine}|w${extra}` : engine;
};

/**
 * Renders the grid again when the text engine's faces land, so every cell
 * measured while they were loading (spill, "####", Shrink to Fit) is decided
 * again from the engine -- the same decision in every browser, whichever
 * order the faces arrived in -- and when the hinted wrap's extra table lands,
 * so the rows of text it covers are fitted at Excel's widths.
 */
export function useSpreadsheetTextEngineEpoch(): string {
  return useSyncExternalStore(subscribe, epoch, () => "");
}
