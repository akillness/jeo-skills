"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, type ReactNode } from "react";

import type { PresentationTableBlock } from "../../../console/editor/native-document/documentCommands";
import {
  TABLE_STYLE_PRESETS,
  normalizeTableStyleId,
  normalizeTableStyleLook,
  tableStyleLookCellCss,
  tableStyleLookTableCss,
  type TableRowEmphasisFlags,
  type TableStyleLook,
} from "../../../../lib/presentation-table-style";
import { TABLE_STYLE_GALLERY } from "../../../../lib/presentation-table-gallery";

type PresentationTableStyleGalleryItemId = OfficeTableStyleGalleryItemId;

export type { PresentationTableStyleSelection } from "../../../../lib/presentation-table-buttons";
import type { PresentationTableStyleSelection } from "../../../../lib/presentation-table-buttons";

export interface PresentationTableStyleGalleryLabels {
  readonly ariaLabel: string;
  readonly more: string;
  readonly builtIn: string;
  readonly authored: string;
  readonly deck: string;
  readonly clear: string;
  readonly unavailable: string;
}

export interface PresentationTableStyleGalleryProps {
  readonly table: PresentationTableBlock;
  readonly accentColors?: readonly string[];
  /** The deck's Dark 1 / Light 1 / Dark 2 / Light 2 and colour map (`presentationTableStyleSchemeColors`). */
  readonly schemeColors?: TableStyleSchemeColors;
  readonly deckLooks: readonly TableStyleLook[];
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly labels: PresentationTableStyleGalleryLabels;
  readonly onPreviewChange: (
    selection: PresentationTableStyleSelection | null,
  ) => void;
  readonly onCommit: (selection: PresentationTableStyleSelection) => void;
}

export { applyPresentationTableStyleSelection } from "../../../../lib/presentation-table-buttons";

import {
  OfficeTableStyleGallery,
  OfficeTableStylePreviewTable,
  type OfficeTableStyleGalleryDocumentItem,
  type OfficeTableStyleGalleryItemId,
} from "../../../office-ribbon/OfficeTableStyleGallery";
import {
  createWebTableStyleGallery,
  isNativeWebTableStyleId,
  nativeWebTableStyleSlot,
  presentationTableStyleLabelKey,
  type TableStyleSchemeColors,
} from "../../../../lib/presentation-table-web-gallery";
import { useOfficeData } from "../../../../lib/office-data/use-office-data";

function StylePreview({
  look,
  table,
}: {
  look: TableStyleLook;
  table: TableRowEmphasisFlags;
}) {
  return (
    <OfficeTableStylePreviewTable
      tableStyle={tableStyleLookTableCss(look)}
      cellStyle={(row, col) =>
        Object.fromEntries(
          Object.entries(
            tableStyleLookCellCss(look, table, row, 5, col, 5) ?? {},
          ).map(([key, value]) => [
            key,
            key.startsWith("border") && typeof value === "string"
              ? value.replace(/([0-9.]+)px/g, (_, n) => `${Number(n) / 2}px`)
              : value,
          ]),
        )
      }
    />
  );
}

/** PPT data adapter; keyboard/preview/commit/focus remain shared Office behavior. */
export function PresentationTableStyleGallery({
  table,
  deckLooks: deckLooksRead,
  accentColors: accentColorsRead,
  schemeColors: schemeColorsRead,
  disabled = false,
  disabledReason,
  labels,
  onPreviewChange,
  onCommit,
}: PresentationTableStyleGalleryProps) {
  // The 74 looks are served (a signed-in page asks once); until they land,
  // and on a guest page, the gallery draws MRAI's recipe of each family
  // (`office-table-style-fallback.ts`), and draws again when they land.
  const servedCatalog = useOfficeData("presentation-table-styles");
  // What the looks read of the table: its style and its six style options. A
  // word typed in one of its cells is a new table of the same style, and the
  
  const {
    tableStyleId, tableStyleLook, headerRow, bandedRows, totalRow,
    firstColumn, lastColumn, bandedColumns,
  } = table;
  // The looks are read by what they say, not by which objects hold them: the
  // host gathers the deck's looks afresh at every key, and a cell's text
  // arriving through the room (or an undo) is a fresh copy of the same look.
  // Drawing the 74 x 25 sample cells again at each key was most of a table
  
  const tableStyleLookKey = useMemo(
    () => (tableStyleLook === undefined ? "" : JSON.stringify(tableStyleLook) ?? ""),
    [tableStyleLook],
  );
  const deckLooksKey = useMemo(() => JSON.stringify(deckLooksRead), [deckLooksRead]);
  // `deckLooksKey` stands for `deckLooksRead`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deckLooks = useMemo(() => deckLooksRead, [deckLooksKey]);
  const accentColorsKey = accentColorsRead?.join("|");
  // `accentColorsKey` stands for `accentColorsRead`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accentColors = useMemo(() => accentColorsRead, [accentColorsKey]);
  const schemeColorsKey = schemeColorsRead === undefined ? "" : JSON.stringify(schemeColorsRead);
  // `schemeColorsKey` stands for `schemeColorsRead`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schemeColors = useMemo(() => schemeColorsRead, [schemeColorsKey]);
  const styledTable = useMemo(
    () => ({
      tableStyleId, tableStyleLook, headerRow, bandedRows, totalRow,
      firstColumn, lastColumn, bandedColumns,
    }) as TableRowEmphasisFlags & { tableStyleId?: unknown; tableStyleLook?: unknown },
    // `tableStyleLookKey` stands for `tableStyleLook`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableStyleId, tableStyleLookKey, headerRow, bandedRows, totalRow, firstColumn, lastColumn, bandedColumns],
  );
  const unavailableLabel = labels.unavailable;
  const model = useMemo(() => {
    const table = styledTable;
    // Native package definitions take priority over a built-in recipe with
    // the same GUID (including custom themes and imported overrides).
    const nativeLooks = new Map(deckLooks.map((look) => [look.styleId, look]));
    const currentLook = normalizeTableStyleLook(
      table.tableStyleLook,
      table.tableStyleId,
    );
    if (currentLook) nativeLooks.set(currentLook.styleId, currentLook);
    // The served looks, or the recipe's until they land (`servedCatalog` is
    // this memo's reason to draw again).
    const catalog = createWebTableStyleGallery(accentColors, "en", schemeColors).map((entry) => ({
      ...entry,
      look: nativeLooks.get(entry.look.styleId) ?? entry.look,
    }));
    const selectionById = new Map<
      PresentationTableStyleGalleryItemId,
      PresentationTableStyleSelection
    >();
    const slotPreviews = new Map<number, ReactNode>();
    for (const entry of catalog) {
      selectionById.set(`web:${entry.slot}`, { kind: "look", look: entry.look });
      slotPreviews.set(
        entry.slot,
        <StylePreview look={entry.look} table={table} />,
      );
    }
    const currentId = normalizeTableStyleId(table.tableStyleId);
    let value: PresentationTableStyleGalleryItemId | null = null;
    const currentWeb = catalog.find(
      (entry) => entry.look.styleId === currentId,
    );
    if (currentWeb) value = `web:${currentWeb.slot}`;
    // With no looks at all (a host that holds none) a built-in style still
    // names its slot.
    const currentSlot = catalog.length ? null : nativeWebTableStyleSlot(currentId);
    if (currentSlot !== null) value = `web:${currentSlot}`;

    // Preserve document house styles and earlier MRAI definitions without
    // mixing obsolete shortcuts into the 74-slot Web catalog.
    const known = new Set(catalog.map((entry) => entry.look.styleId));
    const carried = normalizeTableStyleLook(
      table.tableStyleLook,
      table.tableStyleId,
    );
    const oldAuthored = TABLE_STYLE_GALLERY.find(
      (entry) => entry.id === currentId,
    )?.look;
    const documentLooks = [
      ...deckLooks,
      ...(carried ? [carried] : oldAuthored ? [oldAuthored] : []),
    ];
    const documentItems: OfficeTableStyleGalleryDocumentItem[] = [];
    for (const look of documentLooks) {
      if (known.has(look.styleId) || isNativeWebTableStyleId(look.styleId)) continue;
      known.add(look.styleId);
      const id = `deck:${look.styleId}` as const;
      selectionById.set(id, { kind: "look", look });
      const labelKey = presentationTableStyleLabelKey(look);
      documentItems.push({
        id,
        label: look.styleName ?? look.styleId,
        ...(labelKey ? { labelKey } : {}),
        preview: <StylePreview look={look} table={table} />,
      });
      if (look.styleId === currentId) value = id;
    }
    if (currentId && !value) {
      const preset = TABLE_STYLE_PRESETS.find(
        (entry) => entry.tableStyleId === currentId,
      );
      if (preset?.id === "plain") value = "web:0";
      else if (preset?.id === "grid-grey") value = "web:7";
      else {
        const id = `current:${currentId}` as const;
        value = id;
        documentItems.push({
          id,
          label: unavailableLabel,
          disabled: true,
          disabledReason: unavailableLabel,
          preview: (
            <StylePreview
              look={{
                styleId: currentId,
                parts: { wholeTbl: { fill: "#f1f5f9" } },
              }}
              table={table}
            />
          ),
        });
      }
    }
    selectionById.set("clear", { kind: "clear" });
    return { selectionById, slotPreviews, documentItems, value };
    // `servedCatalog` is not read here: `createWebTableStyleGallery` reads
    // the store itself, and the memo draws again when the served looks land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentColors, schemeColors, deckLooks, unavailableLabel, servedCatalog, styledTable]);
  // By the words: the host hands a new labels object at every render.
  const { ariaLabel, more, clear, deck } = labels;
  const galleryLabels = useMemo(
    () => ({ ariaLabel, more, clear, document: deck }),
    [ariaLabel, more, clear, deck],
  );

  return (
    <OfficeTableStyleGallery
      application="presentation"
      labels={galleryLabels}
      disabled={disabled}
      disabledReason={disabledReason}
      documentItems={model.documentItems}
      renderSlotPreview={(slot) => model.slotPreviews.get(slot) ?? null}
      onCommit={(id) => {
        const selection = model.selectionById.get(id);
        if (selection) onCommit(selection);
      }}
      onPreviewChange={(id) =>
        onPreviewChange(id ? (model.selectionById.get(id) ?? null) : null)
      }
      testIdPrefix="presentation-table-style-gallery"
      value={model.value}
    />
  );
}

