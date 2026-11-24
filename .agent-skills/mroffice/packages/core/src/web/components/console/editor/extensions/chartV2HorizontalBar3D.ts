/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** ECharts GL's bar mesh supports arbitrary direction, but its built-in
 * cartesian layout always extrudes Z. This scoped layout uses that same mesh
 * for value-X bars and groups explicitly marked columns along category X.
 * Markers are render-option metadata, never chart source. */
type EChartsModule = typeof import("echarts");
type AxisModel = Parameters<EChartsModule["helper"]["createScale"]>[1];
type Scale = ReturnType<EChartsModule["helper"]["createScale"]>;

export const HORIZONTAL_BAR3D_LAYOUT_KEY = "mraiHorizontal3D";
export const CLUSTERED_COLUMN3D_LAYOUT_KEY = "mraiClusteredColumn3D";
const installed = new WeakSet<object>();

interface Axis3D {
  model: AxisModel;
  scale: Scale;
  getBandWidth(): number;
}
interface Cartesian3D {
  type: "cartesian3D";
  getAxis(dimension: "x" | "y" | "z"): Axis3D;
  dataToPoint(value: number[]): ArrayLike<number>;
}
interface BarData {
  get(dimension: string, index: number): unknown;
  each(callback: (index: number) => void): void;
  getItemLayout(index: number): unknown;
  setItemLayout(index: number, layout: number[][]): void;
  setLayout(key: string, value: number[]): void;
}
interface BoundSeries {
  data: BarData;
  stacked: boolean;
}
interface BarPosition {
  index: number;
  category: number;
  start: number;
  end: number;
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("horizontal_bar3d_invalid_coordinate");
  }
  return value;
}

function point(coord: Cartesian3D, value: number, category: number, offset: number): number[] {
  const result = coord.dataToPoint([value, 0, category]);
  return [finite(result[0]), finite(result[1]) + offset, finite(result[2])];
}

/** Install after echarts-gl, once for the actual ECharts module instance. */
export function installHorizontalBar3DLayout(echarts: EChartsModule): void {
  if (installed.has(echarts)) return;
  // GL's default layout runs at 1000. Preserve its other coordinate systems,
  // line charts and unmarked third-party bar series.
  echarts.registerLayout(1001, (ecModel) => {
    const groups = new Map<Cartesian3D, BoundSeries[]>();
    const columns = new Map<Cartesian3D, BarData[]>();
    ecModel.eachSeriesByType("bar3D", (series) => {
      const marker = (series.option as Record<string, unknown>)[HORIZONTAL_BAR3D_LAYOUT_KEY];
      const clusteredColumn = (series.option as Record<string, unknown>)[CLUSTERED_COLUMN3D_LAYOUT_KEY];
      if (clusteredColumn !== undefined) {
        if (clusteredColumn !== true || marker !== undefined) throw new Error("column3d_invalid_marker");
        const coord = series.coordinateSystem as unknown as Cartesian3D | undefined;
        if (coord?.type !== "cartesian3D" || typeof coord.getAxis !== "function") {
          throw new Error("column3d_coordinate_system_unavailable");
        }
        const group = columns.get(coord) ?? [];
        group.push(series.getData() as unknown as BarData);
        columns.set(coord, group);
        return;
      }
      if (marker === undefined) return;
      if (
        !marker || typeof marker !== "object" || Array.isArray(marker) ||
        typeof (marker as { stacked?: unknown }).stacked !== "boolean"
      ) throw new Error("horizontal_bar3d_invalid_marker");
      const coord = series.coordinateSystem as unknown as Cartesian3D | undefined;
      if (coord?.type !== "cartesian3D" || typeof coord.getAxis !== "function" || typeof coord.dataToPoint !== "function") {
        throw new Error("horizontal_bar3d_coordinate_system_unavailable");
      }
      const group = groups.get(coord) ?? [];
      group.push({ data: series.getData() as unknown as BarData, stacked: (marker as { stacked: boolean }).stacked });
      groups.set(coord, group);
    });
    // Native GL already supplies correct value-Z lengths. Cluster only the
    // marked columns within each category band, keeping the same mesh and
    // preserving legend filtering. Stacked and series-depth columns stay GL.
    for (const [coord, group] of columns) {
      const band = Math.abs(finite(coord.getAxis("x").getBandWidth()));
      const thickness = band / (group.length + 1.5);
      const pending: Array<{ data: BarData; index: number; layout: number[][] }> = [];
      group.forEach((data, seriesIndex) => {
        const offset = (seriesIndex - (group.length - 1) / 2) * thickness;
        data.each((index) => {
          const raw = data.getItemLayout(index);
          if (!Array.isArray(raw) || raw.length !== 3 || raw.some(row => !Array.isArray(row) || row.length !== 3)) {
            throw new Error("column3d_layout_unavailable");
          }
          const layout = raw.map(row => (row as unknown[]).map(finite));
          layout[0][0] += offset;
          layout[2][0] = thickness;
          pending.push({ data, index, layout });
        });
      });
      for (const { data, index, layout } of pending) data.setItemLayout(index, layout);
    }
    for (const [coord, group] of groups) {
      const positions = new Map<BoundSeries, BarPosition[]>();
      const positive = new Map<number, number>(), negative = new Map<number, number>();
      let low = 0, high = 0;
      // eachSeriesByType visits visible series. Recompute on legend changes,
      // retaining independent positive and negative stacks around zero.
      for (const series of group) {
        const items: BarPosition[] = [];
        series.data.each((index) => {
          const category = finite(series.data.get("category", index));
          if (!Number.isInteger(category) || category < 0) throw new Error("horizontal_bar3d_invalid_category");
          const value = finite(series.data.get("value", index));
          const totals = value >= 0 ? positive : negative;
          const start = series.stacked ? (totals.get(category) ?? 0) : 0;
          const end = finite(start + value);
          if (series.stacked) totals.set(category, end);
          low = Math.min(low, start, end);
          high = Math.max(high, start, end);
          items.push({ index, category, start, end });
        });
        positions.set(series, items);
      }
      // Use the same scale factory as GL's coordinate creator. It respects
      // explicit bounds, including the fixed 100% upper bound.
      const valueAxis = coord.getAxis("x");
      valueAxis.scale = echarts.helper.createScale([low, high], valueAxis.model);
      const band = Math.abs(finite(coord.getAxis("z").getBandWidth()));
      const depth = Math.abs(finite(coord.getAxis("y").getBandWidth())) * 0.7;
      group.forEach((series, seriesIndex) => {
        const thickness = band / (series.stacked ? 2.5 : group.length + 1.5);
        const offset = series.stacked ? 0 : (seriesIndex - (group.length - 1) / 2) * thickness;
        for (const item of positions.get(series) ?? []) {
          const start = point(coord, item.start, item.category, offset);
          const end = point(coord, item.end, item.category, offset);
          const length = Math.abs(end[0] - start[0]);
          series.data.setItemLayout(item.index, [start, [end[0] < start[0] ? -1 : 1, 0, 0], [thickness, length, depth]]);
        }
        // Width follows category/world-Y; length follows value/world-X.
        series.data.setLayout("orient", [0, 1, 0]);
      });
    }
  });
  installed.add(echarts);
}
