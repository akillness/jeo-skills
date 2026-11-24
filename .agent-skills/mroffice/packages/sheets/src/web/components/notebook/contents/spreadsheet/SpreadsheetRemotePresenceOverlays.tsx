"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useMemo, useRef, useSyncExternalStore, type CSSProperties } from "react";

import { spreadsheetRemotePresenceForSheet } from "@mrnote/core/web/lib/collab/spreadsheet-workbook-collab.ts";
import { type WorkbookRemotePresence } from "@/lib/collab/workbook-presence";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";

import { SheetRangePaneLayers, sheetBoxPaneParts, sheetFreezeLinesPx, type SheetRangePaneLayerRefs } from "./SheetRangePaneLayers";
import { workbookRemotePresenceOverlayBoxes } from "./useSpreadsheetSmartArtBoxesAndPresence";
import type { SheetFrozenLines, SheetRangePane } from "./useSheetRangeBoxes";

/** A peer's box over the body: over the cells' own text and the validation
 * caret, under the fill handle's neighbours and the frozen panes. */
const BODY_LAYER = 7;
/** How far a box's name tag reaches past the box (above it, and along). */
const TAG_REACH_PX = 200;


const NO_SUBSCRIPTION = () => () => {};
const NO_REMOTE: readonly WorkbookRemotePresence[] = [];

/**
 * The other members' active cells and ranges over the grid. It hears their
 * moves on its own (the presence controller's `subscribe`), so a peer's range
 * growing under their drag redraws these boxes, not the spreadsheet window.
 */
export const SpreadsheetRemotePresenceOverlays = memo(function SpreadsheetRemotePresenceOverlays({
  remote,
  read,
  subscribe,
  sheetId,
  rowCount,
  columnCount,
  colWidth,
  rowHeight,
  gridRtl,
  editingLabel,
  editingTag,
  frozen = null,
}: {
  /** The list the window last rendered with (the fallback without `read`). */
  remote?: readonly WorkbookRemotePresence[];
  read?: () => readonly WorkbookRemotePresence[];
  subscribe?: (listener: () => void) => () => void;
  sheetId: string;
  rowCount: number;
  columnCount: number;
  colWidth: SparseAxisSizeResolver;
  rowHeight: SparseAxisSizeResolver;
  gridRtl: boolean;
  /** Appended to a peer's accessible label while they edit their cell. */
  editingLabel: string;
  /** Appended to a peer's name tag while they edit their cell. */
  editingTag: string;
  /** The frozen lines: a box over frozen cells is drawn over that pane. */
  frozen?: SheetFrozenLines | null;
}) {
  const live = useSyncExternalStore(
    subscribe ?? NO_SUBSCRIPTION,
    read ?? (() => remote ?? NO_REMOTE),
    read ?? (() => remote ?? NO_REMOTE),
  );
  const overlays = useMemo(
    () =>
      workbookRemotePresenceOverlayBoxes(
        spreadsheetRemotePresenceForSheet(live, sheetId, rowCount, columnCount),
        { colWidth, gridRtl, rowHeight, sheet: { rowCount, columnCount } },
      ),
    [colWidth, columnCount, gridRtl, live, rowCount, rowHeight, sheetId],
  );
  const freezeRows = frozen?.rows ?? 0;
  const freezeCols = frozen?.cols ?? 0;
  const freeze = useMemo(
    () => sheetFreezeLinesPx({ rows: freezeRows, cols: freezeCols }, rowCount, columnCount, rowHeight, colWidth),
    [colWidth, columnCount, freezeCols, freezeRows, rowCount, rowHeight],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<SheetRangePaneLayerRefs>({});
  const presenceBox = (overlay: (typeof overlays)[number], clip: string | undefined, named = true) => (
    <div
      key={`${overlay.presence.user.id ?? "guest"}:${overlay.presence.clientId}`}
      // A box cut at a freeze line is one peer: its first part is named.
      role={named ? "img" : undefined}
      aria-label={named ? `${overlay.label}${overlay.presence.editing ? editingLabel : ""}` : undefined}
      aria-hidden={named ? undefined : "true"}
      data-testid="spreadsheet-remote-presence"
      data-client-id={overlay.presence.clientId}
      data-user-id={overlay.presence.user.id ?? undefined}
      data-editing={overlay.presence.editing ? "true" : undefined}
      style={{
        position: "absolute",
        ...overlay.range,
        ...(clip ? ({ clipPath: clip } satisfies CSSProperties) : {}),
        zIndex: BODY_LAYER,
        pointerEvents: "none",
        boxSizing: "border-box",
        border: `2px solid ${overlay.color}`,
        background: overlay.background,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          ...overlay.active,
          boxSizing: "border-box",
          border: `2px solid ${overlay.color}`,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInlineStart: -2,
          bottom: "100%",
          maxWidth: 180,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          borderRadius: "4px 4px 0 0",
          background: overlay.color,
          color: "#ffffff",
          padding: "2px 6px",
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {overlay.presence.user.name}
        {overlay.presence.editing ? editingTag : ""}
      </span>
    </div>
  );
  const drawn = (pane: SheetRangePane) =>
    overlays.flatMap((overlay) =>
      sheetBoxPaneParts(overlay.range, freeze, TAG_REACH_PX)
        .map((part, index) => ({ part, named: index === 0 }))
        .filter(({ part }) => part.pane === pane)
        .map(({ part, named }) => presenceBox(overlay, part.clip, named)),
    );
  if (!freeze) {
    // No frozen panes: each box on its own at the body's tier, as always.
    return <>{overlays.map((overlay) => presenceBox(overlay, undefined))}</>;
  }
  return (
    <SheetRangePaneLayers
      hostRef={hostRef}
      layersRef={layersRef}
      frozen={frozen}
      bodyLayer={BODY_LAYER}
      testId="spreadsheet-remote-presence-layer"
      // Each box is an image of a peer's place, named for assistive technology.
      announced
    >
      {drawn}
    </SheetRangePaneLayers>
  );
});
