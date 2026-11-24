"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Excel's range finder on the sheet: while a formula is being entered, each
 * reference it names wears a border in the reference's colour
 * (`lib/spreadsheet/formula-reference-highlight`).
 *
 * The entry lives in its editor, not in the window's state, so this layer
 * listens to the shared entry (`SpreadsheetLiveEdit`) by itself and the
 * window is not rendered again for a keystroke. The boxes are measured off
 * the cells the grid has on screen: a reference that runs past the rendered
 * rows or columns is boxed as far as they go, and one wholly out of view
 * draws nothing.
 */

import { useMemo, useRef, useSyncExternalStore } from "react";

import {
  formulaReferenceSpans,
  type FormulaReferenceSpan,
} from "@mrnote/core/web/lib/spreadsheet/formula-reference-highlight.ts";

import type { SpreadsheetLiveEdit } from "./SpreadsheetDraftInput";
import { SheetRangePaneLayers, type SheetRangePaneLayerRefs } from "./SheetRangePaneLayers";
import { useSheetRangeBoxes, type SheetFrozenLines, type SheetRangePane } from "./useSheetRangeBoxes";

/** The range finder's layer in the body: over the cells' own text, under
 * the fill handle and the comment indicator. */
const BODY_LAYER = 5;

export function SpreadsheetFormulaReferenceOverlay({
  liveEdit,
  identity,
  committedEntry,
  sheetName,
  layoutKey,
  frozen = null,
}: {
  liveEdit: SpreadsheetLiveEdit;
  /** The open entry's identity in `liveEdit` (the edited cell's). */
  identity: string;
  /** What the cell holds, shown until the first keystroke of the entry. */
  committedEntry: string;
  /** The sheet on screen: a reference to another sheet draws no box here. */
  sheetName: string;
  /** Changes when the grid lays out again (scroll window, sizes, zoom). */
  layoutKey: unknown;
  /** The frozen lines: a reference across a freeze line is boxed in each pane. */
  frozen?: SheetFrozenLines | null;
}) {
  const reader = useRef({}).current;
  const draft = useSyncExternalStore(
    liveEdit.subscribe,
    () => liveEdit.read(identity, reader),
    () => null,
  );
  const entry = draft ?? committedEntry;
  const spans = useMemo(() => {
    const seen = new Set<string>();
    const out: (FormulaReferenceSpan & { key: string })[] = [];
    for (const span of formulaReferenceSpans(entry)) {
      if (span.sheet !== undefined && span.sheet.toLowerCase() !== sheetName.toLowerCase()) continue;
      const key = `${span.r1}:${span.c1}:${span.r2}:${span.c2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...span, key });
    }
    return out;
  }, [entry, sheetName]);
  const hostRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<SheetRangePaneLayerRefs>({});
  const boxes = useSheetRangeBoxes(hostRef, spans, layoutKey, frozen, layersRef);
  const drawn = (pane: SheetRangePane) =>
    boxes.filter((box) => box.pane === pane).map((box) => (
      <span
        key={`${box.span.key}@${box.pane}`}
        data-testid="spreadsheet-formula-reference-box"
        data-reference={box.span.key}
        data-pane={box.pane}
        data-color={box.span.color}
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          boxSizing: "border-box",
          borderStyle: "solid",
          borderColor: box.span.color,
          borderWidth: box.edges.map((edge) => (edge ? "2px" : "0")).join(" "),
          // The reference's cells are tinted, as Excel shades them.
          background: `color-mix(in srgb, ${box.span.color} 10%, transparent)`,
        }}
      />
    ));
  // The body's boxes in the host, under the frozen panes; a frozen pane's
  // on a layer pinned with that pane, over its cells (SheetRangePaneLayers).
  return (
    <SheetRangePaneLayers
      hostRef={hostRef}
      layersRef={layersRef}
      frozen={frozen}
      bodyLayer={BODY_LAYER}
      testId="spreadsheet-formula-reference-overlay"
    >
      {drawn}
    </SheetRangePaneLayers>
  );
}
