/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A click on a Selection Pane row, the part every editor's pane shares.
 *
 * Microsoft Support, "Manage objects with the Selection pane": "To select
 * multiple objects, press Ctrl while you click the objects in the list". As in
 * any Office list, Shift+Click selects the run of rows from the one clicked
 * last (the anchor) to this one, in place of the selection; Ctrl+Click (Cmd on
 * a Mac) adds or removes one row and makes it the anchor; a plain click
 * selects the one row.
 */

export type OfficeSelectionPaneClickMode = "single" | "toggle" | "range";

/** The mode a row click's modifier keys ask for. */
export function selectionPaneClickMode(event: {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): OfficeSelectionPaneClickMode {
  if (event.shiftKey) return "range";
  if (event.ctrlKey || event.metaKey) return "toggle";
  return "single";
}

/**
 * The rows a click selects. `order` is the pane's selectable rows, top to
 * bottom; `current` the selected ones; `anchor` the row clicked last (a range
 * without one in `order` selects the clicked row alone). Returns the selected
 * keys in pane order and the new anchor (`null` when nothing is selected).
 */
export function selectionPaneClickSelection(
  order: readonly string[],
  current: readonly string[],
  anchor: string | null,
  key: string,
  mode: OfficeSelectionPaneClickMode,
): { keys: string[]; anchor: string | null } {
  if (!order.includes(key)) return { keys: [...current], anchor };
  if (mode === "range" && anchor !== null && order.includes(anchor)) {
    const from = order.indexOf(anchor);
    const to = order.indexOf(key);
    return { keys: order.slice(Math.min(from, to), Math.max(from, to) + 1), anchor };
  }
  if (mode === "toggle") {
    const selected = new Set(current);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    const keys = order.filter((candidate) => selected.has(candidate));
    return { keys, anchor: keys.length > 0 ? key : null };
  }
  return { keys: [key], anchor: key };
}
