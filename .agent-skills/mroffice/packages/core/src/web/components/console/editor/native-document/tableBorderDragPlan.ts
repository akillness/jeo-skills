/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure plans for dragging a Docs table border with the mouse, following Word.
 *
 * Word semantics (Microsoft Support "Resize a table, column, or row" and the
 * modifier behaviour Word documents for column borders):
 *
 * - Column border, no modifier: only the two columns the border separates
 *   change; the table keeps its width. A neighbour that reaches its minimum
 *   stops the border (the drag is clamped there, never rejected as a whole).
 * - Shift: only the column LEFT of the border changes; the table gets wider or
 *   narrower by the same amount. This is how a column next to a narrow spacer
 *   column is widened.
 * - Ctrl: the left column changes, the table keeps its width, and every column
 *   right of the border shares the difference in proportion to its width.
 * - Ctrl+Shift: as Ctrl, but the columns right of the border end up equal.
 * - The table's right outer border only ever changes the last column (and so
 *   the table width), whatever the modifier.
 * - The table's left outer border moves the table's left edge: the first
 *   column absorbs the movement while every other column stays where it is.
 *   For a left-aligned table that means the table indent (`w:tblInd`) moves
 *   with the edge; a centred or right-aligned table is placed by its
 *   alignment, so only the first column width changes.
 * - Row border (including the table's bottom edge): the row above the border
 *   takes the dragged height. Word stores it as "At least" (`w:trHeight
 *   w:hRule="atLeast"`), so the row still grows with its content; a row whose
 *   height was "Exactly" keeps that rule.
 */

export type TableColumnDragMode = "adjacent" | "shift" | "proportional" | "equal";

interface ModifierState {
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

/** Word's column-border modifiers. Command stands in for Ctrl on a Mac,
 * where Ctrl+click is the context-menu gesture. */
export function tableColumnDragMode(event: ModifierState): TableColumnDragMode {
  const ctrl = event.ctrlKey === true || event.metaKey === true;
  const shift = event.shiftKey === true;
  if (ctrl && shift) return "equal";
  if (ctrl) return "proportional";
  if (shift) return "shift";
  return "adjacent";
}

function finiteWidth(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function quantize(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/**
 * Split `total` into shares proportional to `weights`, quantized to `step`
 * without losing or gaining anything: cumulative rounding keeps the sum.
 */
function distribute(total: number, weights: readonly number[], step: number): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(weightSum > 0)) {
    return weights.map((_, index) =>
      index === weights.length - 1 ? total : 0,
    );
  }
  const shares: number[] = [];
  let cumulative = 0;
  let previous = 0;
  for (const weight of weights) {
    cumulative += weight;
    const edge = quantize((total * cumulative) / weightSum, step);
    shares.push(edge - previous);
    previous = edge;
  }
  return shares;
}

/**
 * New grid widths after dragging the border on the RIGHT of `column` by
 * `rawDelta` (positive = to the right). `step` quantizes the movement (1/15
 * for a twips grid, 0 for none). A column already narrower than `minWidth`
 * is never forced wider.
 */
export function planTableColumnBorderDrag(
  startWidths: readonly number[],
  column: number,
  rawDelta: number,
  minWidth: number,
  mode: TableColumnDragMode = "adjacent",
  step = 0,
): number[] {
  const widths = startWidths.map((width) => finiteWidth(width, minWidth));
  if (
    !Number.isInteger(column) ||
    column < 0 ||
    column >= widths.length ||
    !Number.isFinite(rawDelta)
  ) {
    return widths;
  }
  const delta = quantize(rawDelta, step);
  const current = widths[column]!;
  const floor = Math.min(minWidth, current);
  if (column === widths.length - 1 || mode === "shift") {
    widths[column] = Math.max(floor, current + delta);
    return widths;
  }
  if (mode === "adjacent") {
    const next = widths[column + 1]!;
    const nextFloor = Math.min(minWidth, next);
    const applied = Math.max(floor - current, Math.min(delta, next - nextFloor));
    widths[column] = current + applied;
    widths[column + 1] = next - applied;
    return widths;
  }

  const right = widths.slice(column + 1);
  const rightTotal = right.reduce((sum, width) => sum + width, 0);
  let maxGrow: number;
  if (mode === "equal") {
    maxGrow = rightTotal - right.length * minWidth;
  } else {
    // Proportional shrinking stops when the first right-hand column reaches
    // its own floor: every column scales by the same factor.
    const tightest = right.reduce(
      (ratio, width) =>
        width > 0 ? Math.max(ratio, Math.min(minWidth, width) / width) : 1,
      0,
    );
    maxGrow = rightTotal * (1 - tightest);
  }
  const applied = Math.max(floor - current, Math.min(delta, Math.max(0, maxGrow)));
  const remaining = rightTotal - applied;
  const shares = distribute(
    remaining,
    mode === "equal" ? right.map(() => 1) : right,
    step,
  );
  widths[column] = current + applied;
  shares.forEach((share, index) => {
    widths[column + 1 + index] = share;
  });
  return widths;
}

export interface TableLeftEdgeDragOptions {
  /** Current left indent (px) of a left-aligned table; `null` when the table
   * is placed by a centre/right alignment instead. */
  readonly indentPx: number | null;
  /** Largest indent the bounded table model stores. */
  readonly maxIndentPx: number;
}

export interface TableLeftEdgeDragPlan {
  readonly widths: number[];
  /** How far the table's left edge moved (px, positive = right). The
   * indent changes by exactly this much; 0 for an aligned table. */
  readonly indentDeltaPx: number;
}

/**
 * Drag the table's LEFT outer border by `rawDelta`. A left-aligned table
 * moves its indent with the edge in whole pixels (the stored indent is whole
 * pixels) and never below zero, since the model has no negative indent; the
 * first column takes the opposite change, so its right border and every
 * other column stay put.
 */
export function planTableLeftEdgeDrag(
  startWidths: readonly number[],
  rawDelta: number,
  minWidth: number,
  options: TableLeftEdgeDragOptions,
): TableLeftEdgeDragPlan {
  const widths = startWidths.map((width) => finiteWidth(width, minWidth));
  if (widths.length === 0 || !Number.isFinite(rawDelta)) {
    return { widths, indentDeltaPx: 0 };
  }
  const first = widths[0]!;
  const floor = Math.min(minWidth, first);
  if (options.indentPx === null) {
    widths[0] = Math.max(floor, first - rawDelta);
    return { widths, indentDeltaPx: 0 };
  }
  const indent = Math.max(0, options.indentPx);
  const lowest = -indent;
  const highest = Math.min(
    Math.max(0, options.maxIndentPx - indent),
    Math.floor(first - floor),
  );
  // `|| 0` folds a clamped -0 into 0.
  const delta = Math.max(lowest, Math.min(highest, Math.round(rawDelta))) || 0;
  widths[0] = first - delta;
  return { widths, indentDeltaPx: delta };
}

export interface TableRowHeightDragBounds {
  readonly min: number;
  readonly max: number;
}

/** Height (whole px) a row takes after its bottom border moved by `rawDelta`
 * client pixels; `scale` converts client pixels to layout pixels. */
export function planTableRowHeightDrag(
  startHeight: number,
  rawDelta: number,
  bounds: TableRowHeightDragBounds,
  scale = 1,
): number {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const start = Number.isFinite(startHeight) ? startHeight : bounds.min;
  const delta = Number.isFinite(rawDelta) ? rawDelta / factor : 0;
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(start + delta)));
}

/** Word keeps an "Exactly" row exact; every other dragged row is "At least". */
export function tableRowHeightDragRule(current: unknown): "atLeast" | "exact" {
  return current === "exact" ? "exact" : "atLeast";
}
