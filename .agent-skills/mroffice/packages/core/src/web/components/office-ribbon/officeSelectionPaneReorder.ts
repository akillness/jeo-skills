/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Reordering in the Selection Pane (Word / Excel / PowerPoint: Home > Select
 * > Selection Pane), the part every editor shares.
 *
 * Microsoft Support, "Manage objects with the Selection pane": the list reads
 * in stacking order, top to bottom; "drag the selected object name up or down
 * in the list", or use Bring Forward / Send Backward (Ctrl+Shift+F /
 * Ctrl+Shift+B); "for an object that's in a group, you can only move it within
 * the group"; Ctrl+Click selects several; in Word, inline objects are listed
 * but cannot be reordered, hidden or multi-selected.
 *
 * The pane names a drop as "these units go to slot k of their container":
 * a container is the list of rows that move against each other (the objects
 * of the slide / sheet / layer, or the objects of one group), front first, and
 * slot k counts the rows that stay in front of the dropped ones. An editor
 * never sorts on its own for a drop: {@link planSelectionPaneReorder} reaches
 * the order by running the editor's own Bring to Front / Bring Forward / Send
 * Backward / Send to Back on its model, and the editor commits the result once
 * (one Undo step, one save, one collaborative update).
 */

export type OfficeStackCommand = "front" | "forward" | "backward" | "back";

/** A drag's drop, or a keyboard step (Ctrl+Shift+F / Ctrl+Shift+B). */
export type OfficeSelectionPaneMove =
  | {
      readonly kind: "drop";
      /** The units moved, front first. */
      readonly keys: readonly string[];
      readonly container: string;
      /** Rows of the container that stay in front of the moved ones. */
      readonly slot: number;
    }
  | {
      readonly kind: "step";
      readonly keys: readonly string[];
      readonly container: string;
      readonly direction: "forward" | "backward";
    };

/**
 * The container's order (front first) once `moving` is dropped at `slot`:
 * the moved units side by side, in their own order, `slot` of the others in
 * front of them. Multi-selected rows dragged together close up, as a
 * selection brought to the front does.
 */
export function selectionPaneDropOrder(
  order: readonly string[],
  moving: ReadonlySet<string>,
  slot: number,
): string[] {
  const picked = order.filter((key) => moving.has(key));
  const rest = order.filter((key) => !moving.has(key));
  const at = Math.max(0, Math.min(rest.length, Math.trunc(slot)));
  return [...rest.slice(0, at), ...picked, ...rest.slice(at)];
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/**
 * The model after a drop, reached by the editor's own Arrange commands: or
 * null when the drop changes nothing or the commands cannot reach it (a
 * locked object in the way, an order the model cannot state).
 *
 * - One unit, or units already side by side: one-step moves toward the slot
 *   (each passes one neighbouring unit, the units keep together, as Office
 *   moves a selection by one step).
 * - Units apart: Bring to Front (or Send to Back, the nearer edge) first,
 *   which closes them up in their own order, then one-step moves.
 *
 * `order` reads the container (front first) from a model, null when it can
 * no longer be read; `step` is one command on the moving units, null when it
 * moves nothing. A stack shared with units of another container (Word's
 * floating objects in front of and behind the text) may need steps that do
 * not show in the container: the bound is generous and the plan stops as
 * soon as the container reads the dropped order.
 */
export function planSelectionPaneReorder<S>(input: {
  readonly model: S;
  readonly order: (model: S) => readonly string[] | null;
  readonly moving: readonly string[];
  readonly slot: number;
  readonly step: (model: S, command: OfficeStackCommand) => S | null;
  /** The most commands one drop may take (default: four per unit, at least 64). */
  readonly maxCommands?: number;
}): S | null {
  const start = input.order(input.model);
  if (!start) return null;
  const moving = new Set(input.moving.filter((key) => start.includes(key)));
  if (moving.size === 0) return null;
  const wanted = selectionPaneDropOrder(start, moving, input.slot);
  if (sameOrder(start, wanted)) return null;
  const limit = input.maxCommands ?? Math.max(64, start.length * 4);
  const firstMoving = (order: readonly string[]) => order.findIndex((key) => moving.has(key));
  const wantedAt = firstMoving(wanted);
  const together = (order: readonly string[]) => {
    const at = order.map((key, index) => (moving.has(key) ? index : -1)).filter((index) => index >= 0);
    return at.length > 0 && at[at.length - 1]! - at[0]! === at.length - 1;
  };
  let model = input.model;
  let commands = 0;
  let order: readonly string[] | null = start;
  if (!together(start)) {
    // Close the units up at the edge nearer the slot.
    const restCount = start.length - moving.size;
    const edge: OfficeStackCommand = wantedAt <= restCount / 2 ? "front" : "back";
    const closed = input.step(model, edge);
    if (!closed) return null;
    model = closed;
    commands += 1;
    order = input.order(model);
  }
  while (order && !sameOrder(order, wanted)) {
    if (commands >= limit) return null;
    const now = firstMoving(order);
    if (now < 0) return null;
    // The units stand together and the others keep their own order (every
    // Arrange command keeps it), so the place of the first unit says which
    // way the next step goes.
    if (now === wantedAt) return null;
    const command: OfficeStackCommand = now > wantedAt ? "forward" : "backward";
    const next = input.step(model, command);
    if (!next) return null;
    model = next;
    commands += 1;
    order = input.order(model);
  }
  return order ? model : null;
}

/** Whether a keyboard step moves anything (false at the container's edge). */
export function selectionPaneStepIsLive(
  order: readonly string[],
  moving: ReadonlySet<string>,
  direction: "forward" | "backward",
): boolean {
  const at = order.map((key, index) => (moving.has(key) ? index : -1)).filter((index) => index >= 0);
  if (at.length === 0) return false;
  // Each selected unit passes the unselected one next to it; none can when
  // the selection already fills that end of the container.
  return direction === "forward"
    ? at.some((index, position) => index !== position)
    : at.some((index, position) => index !== order.length - at.length + position);
}
