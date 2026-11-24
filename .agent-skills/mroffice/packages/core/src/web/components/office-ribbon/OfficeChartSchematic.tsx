"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, type ReactNode } from "react";

import {
  isThreeDimensionalChartLeaf,
  type ChartFamily,
  type ChartSubtype,
} from "../../lib/office-charts/catalog";
import styles from "./OfficeInsertGallery.module.css";

/*
 * The chart pictures of the Insert Chart menus: one small family glyph per
 * menu row and one schematic per subtype card. Each draws what that chart
 * type actually looks like (series in Office's blue / orange / grey order,
 * 3-D types with lit top and shaded side faces), so the card is the chart.
 */

const INK = {
  blue: "#3b82f6",
  blueSoft: "#9cc3fb",
  blueDeep: "#1f5fcf",
  orange: "#f59e0b",
  orangeSoft: "#fbd38a",
  orangeDeep: "#c2780a",
  grey: "#a3adbb",
  greySoft: "#d4dae3",
  greyDeep: "#6f7a8b",
  axis: "#94a3b8",
  grid: "#e3e8ef",
  gap: "#ffffff",
} as const;

type Tone = "blue" | "orange" | "grey";
const FACE: Record<Tone, { front: string; top: string; side: string }> = {
  blue: { front: INK.blue, top: INK.blueSoft, side: INK.blueDeep },
  orange: { front: INK.orange, top: INK.orangeSoft, side: INK.orangeDeep },
  grey: { front: INK.grey, top: INK.greySoft, side: INK.greyDeep },
};
const TONES: readonly Tone[] = ["blue", "orange", "grey"];

type Pt = readonly [number, number];
const r2 = (value: number) => Math.round(value * 100) / 100;
const pt = ([x, y]: Pt) => `${r2(x)} ${r2(y)}`;
const zip = (xs: readonly number[], ys: readonly number[]): Pt[] =>
  xs.map((x, index) => [x, ys[index]] as const);
const shift = (points: readonly Pt[], dx: number, dy: number): Pt[] =>
  points.map(([x, y]) => [x + dx, y + dy] as const);
const linePath = (points: readonly Pt[]) =>
  points.map((point, index) => `${index ? "L" : "M"}${pt(point)}`).join("");
/** A curve through every point (Catmull-Rom as cubic Béziers). */
function smoothPath(points: readonly Pt[]) {
  let d = `M${pt(points[0])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index];
    const from = points[index];
    const to = points[index + 1];
    const after = points[index + 2] ?? to;
    const c1: Pt = [from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6];
    const c2: Pt = [to[0] - (after[0] - from[0]) / 6, to[1] - (after[1] - from[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(to)}`;
  }
  return d;
}
/** The region between an upper and a lower edge drawn left to right. */
const band = (top: readonly Pt[], bottom: readonly Pt[]) =>
  `${linePath(top)}L${[...bottom].reverse().map(pt).join("L")}Z`;
const baseline = (xs: readonly number[], y: number) => xs.map((x) => [x, y] as const);

/** A point on an ellipse at `turn` (0 = top, clockwise). */
function onEllipse(cx: number, cy: number, rx: number, ry: number, turn: number): Pt {
  const angle = turn * 2 * Math.PI;
  return [cx + rx * Math.sin(angle), cy - ry * Math.cos(angle)];
}
function wedge(cx: number, cy: number, rx: number, ry: number, t0: number, t1: number) {
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return `M${r2(cx)} ${r2(cy)}L${pt(onEllipse(cx, cy, rx, ry, t0))}A${rx} ${ry} 0 ${large} 1 ${pt(onEllipse(cx, cy, rx, ry, t1))}Z`;
}
function annulus(cx: number, cy: number, outer: number, inner: number, t0: number, t1: number) {
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return (
    `M${pt(onEllipse(cx, cy, outer, outer, t0))}` +
    `A${outer} ${outer} 0 ${large} 1 ${pt(onEllipse(cx, cy, outer, outer, t1))}` +
    `L${pt(onEllipse(cx, cy, inner, inner, t1))}` +
    `A${inner} ${inner} 0 ${large} 0 ${pt(onEllipse(cx, cy, inner, inner, t0))}Z`
  );
}
/** The visible rim of a tilted disc between two turns of its lower half. */
function rim(cx: number, cy: number, rx: number, ry: number, depth: number, t0: number, t1: number) {
  const a = onEllipse(cx, cy, rx, ry, t0);
  const b = onEllipse(cx, cy, rx, ry, t1);
  return (
    `M${pt(a)}A${rx} ${ry} 0 0 1 ${pt(b)}` +
    `L${pt([b[0], b[1] + depth])}A${rx} ${ry} 0 0 0 ${pt([a[0], a[1] + depth])}Z`
  );
}

/** One solid block: front face, lit top and shaded right side. */
function Block({ x, y, w, h, tone, depth = 5 }: { x: number; y: number; w: number; h: number; tone: Tone; depth?: number }) {
  const face = FACE[tone];
  const rise = depth * 0.75;
  return (
    <g data-chart-block>
      <path d={`M${r2(x)} ${r2(y)}l${depth} ${-rise}h${r2(w)}l${-depth} ${rise}Z`} fill={face.top} />
      <path d={`M${r2(x + w)} ${r2(y)}l${depth} ${-rise}v${r2(h)}l${-depth} ${rise}Z`} fill={face.side} />
      <rect x={r2(x)} y={r2(y)} width={r2(w)} height={r2(h)} fill={face.front} />
    </g>
  );
}

const AXES = <path d="M14 8V62H108" fill="none" stroke={INK.axis} strokeWidth="1.5" strokeLinejoin="round" />;
const GRID = <path d="M15 26H108M15 44H108" fill="none" stroke={INK.grid} strokeWidth="1" />;
const PLOT = (
  <>
    {GRID}
    {AXES}
  </>
);
/** The floor and back wall a 3-D chart stands in. */
const FLOOR = (
  <>
    <path d="M12 62l10-7.5h88l-10 7.5Z" fill={INK.greySoft} opacity="0.7" />
    <path d="M22 54.5V8" fill="none" stroke={INK.grid} strokeWidth="1.5" />
  </>
);
const PERCENT_TOP_COLUMN = (
  <path data-chart-percent-guide d="M15 14H108" fill="none" stroke={INK.greyDeep} strokeWidth="1" strokeDasharray="3 2" />
);
const MARKER_R = 3;

function Markers({ points, tone, primary }: { points: readonly Pt[]; tone: Tone; primary: boolean }) {
  return (
    <>
      {points.map(([cx, cy], index) =>
        primary ? (
          <circle key={index} data-chart-marker cx={r2(cx)} cy={r2(cy)} r={MARKER_R} fill={FACE[tone].front} stroke={INK.gap} strokeWidth="1" />
        ) : (
          <circle key={index} data-chart-marker-secondary cx={r2(cx)} cy={r2(cy)} r={MARKER_R} fill={FACE[tone].front} stroke={INK.gap} strokeWidth="1" />
        ),
      )}
    </>
  );
}

function Line({ points, tone, smooth = false, primaryAttr }: { points: readonly Pt[]; tone: Tone; smooth?: boolean; primaryAttr?: boolean }) {
  return (
    <path
      data-chart-series-line
      data-chart-smooth-line={(smooth && primaryAttr) || undefined}
      d={smooth ? smoothPath(points) : linePath(points)}
      fill="none"
      stroke={FACE[tone].front}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ---------------------------------------------------------------- column / bar

const STACKED: readonly ChartSubtype[] = ["stacked", "stacked3d", "stackedMarkers"];
const PERCENT: readonly ChartSubtype[] = ["percentStacked", "percentStacked3d", "percentStackedMarkers"];

function columnMarks(subtype: ChartSubtype, threeD: boolean): ReactNode {
  const base = threeD ? 60 : 62;
  if (subtype === "column3d") {
    const xs = [24, 52, 80];
    const back = [30, 22, 38];
    const front = [22, 34, 16];
    return (
      <>
        {FLOOR}
        {xs.map((x, index) => <Block key={`b${index}`} x={x + 9} y={base - 7 - back[index]} w={13} h={back[index]} tone="orange" />)}
        {xs.map((x, index) => <Block key={`f${index}`} x={x} y={base - front[index]} w={13} h={front[index]} tone="blue" />)}
      </>
    );
  }
  if (STACKED.includes(subtype) || PERCENT.includes(subtype)) {
    const percent = PERCENT.includes(subtype);
    const xs = threeD ? [24, 52, 80] : [22, 52, 82];
    const parts = percent
      ? [[22, 18, 26], [14, 18, 10], [12, 12, 12]]
      : [[18, 24, 14], [12, 10, 18], [8, 10, 6]];
    const width = threeD ? 15 : 18;
    const blocks: ReactNode[] = [];
    xs.forEach((x, column) => {
      let top = base;
      parts.forEach((series, index) => {
        const height = series[column];
        top -= height;
        blocks.push(
          threeD ? (
            <Block key={`${column}-${index}`} x={x} y={top} w={width} h={height} tone={TONES[index]} />
          ) : (
            <rect key={`${column}-${index}`} x={x} y={top} width={width} height={height} fill={FACE[TONES[index]].front} stroke={INK.gap} strokeWidth="0.75" />
          ),
        );
      });
    });
    return (
      <>
        {threeD ? FLOOR : PLOT}
        {blocks}
        {percent ? PERCENT_TOP_COLUMN : null}
      </>
    );
  }
  const xs = threeD ? [22, 50, 78] : [20, 50, 80];
  const s1 = threeD ? [24, 36, 18] : [26, 40, 20];
  const s2 = threeD ? [14, 26, 30] : [16, 28, 34];
  return (
    <>
      {threeD ? FLOOR : PLOT}
      {xs.flatMap((x, index) =>
        threeD
          ? [
              <Block key={`a${index}`} x={x} y={base - s1[index]} w={11} h={s1[index]} tone="blue" />,
              <Block key={`b${index}`} x={x + 12} y={base - s2[index]} w={11} h={s2[index]} tone="orange" />,
            ]
          : [
              <rect key={`a${index}`} x={x} y={base - s1[index]} width={12} height={s1[index]} fill={INK.blue} />,
              <rect key={`b${index}`} x={x + 13} y={base - s2[index]} width={12} height={s2[index]} fill={INK.orange} />,
            ],
      )}
    </>
  );
}

function barMarks(subtype: ChartSubtype, threeD: boolean): ReactNode {
  const left = 14;
  if (STACKED.includes(subtype) || PERCENT.includes(subtype)) {
    const percent = PERCENT.includes(subtype);
    const ys = threeD ? [44, 28, 12] : [45, 29, 13];
    const parts = percent
      ? [[40, 30, 48], [26, 36, 20], [22, 22, 20]]
      : [[30, 40, 26], [24, 18, 30], [16, 20, 12]];
    const height = threeD ? 10 : 12;
    const blocks: ReactNode[] = [];
    ys.forEach((y, row) => {
      let x = left;
      parts.forEach((series, index) => {
        const width = series[row] * (threeD ? 0.92 : 1);
        blocks.push(
          threeD ? (
            <Block key={`${row}-${index}`} x={x} y={y} w={width} h={height} tone={TONES[index]} />
          ) : (
            <rect key={`${row}-${index}`} x={x} y={y} width={width} height={height} fill={FACE[TONES[index]].front} stroke={INK.gap} strokeWidth="0.75" />
          ),
        );
        x += width;
      });
    });
    return (
      <>
        {threeD ? FLOOR : PLOT}
        {blocks}
        {percent ? (
          <path data-chart-percent-guide d={threeD ? "M95 6V60" : "M102 8V62"} fill="none" stroke={INK.greyDeep} strokeWidth="1" strokeDasharray="3 2" />
        ) : null}
      </>
    );
  }
  const ys = threeD ? [44, 26, 8] : [44, 26, 8];
  const s1 = threeD ? [46, 64, 34] : [52, 74, 38];
  const s2 = threeD ? [34, 50, 72] : [40, 58, 84];
  return (
    <>
      {threeD ? FLOOR : PLOT}
      {ys.flatMap((y, index) =>
        threeD
          ? [
              <Block key={`b${index}`} x={left} y={y + 9} w={s2[index]} h={6.5} tone="orange" depth={4} />,
              <Block key={`a${index}`} x={left} y={y + 1.5} w={s1[index]} h={6.5} tone="blue" depth={4} />,
            ]
          : [
              <rect key={`b${index}`} x={left} y={y + 8} width={s2[index]} height={7} fill={INK.orange} />,
              <rect key={`a${index}`} x={left} y={y} width={s1[index]} height={7} fill={INK.blue} />,
            ],
      )}
    </>
  );
}

// ---------------------------------------------------------------- line / area

const LINE_X = [18, 40, 62, 84, 104];

function lineMarks(subtype: ChartSubtype): ReactNode {
  const markers = subtype.endsWith("Markers") || subtype === "standardMarkers";
  if (subtype === "line3d") {
    const depth: Pt = [7, -5];
    // A ribbon: one lit facet per segment, its front edge in the series ink.
    const ribbon = (points: Pt[], tone: Tone) => (
      <>
        {points.slice(0, -1).map((point, index) => {
          const next = points[index + 1];
          const facet: Pt[] = [point, next, [next[0] + depth[0], next[1] + depth[1]], [point[0] + depth[0], point[1] + depth[1]]];
          return <path key={index} d={`${linePath(facet)}Z`} fill={FACE[tone].top} stroke={FACE[tone].front} strokeWidth="0.6" strokeLinejoin="round" />;
        })}
        <path d={linePath(points)} fill="none" stroke={FACE[tone].front} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
    const xs = [16, 36, 56, 76, 94];
    return (
      <>
        {FLOOR}
        {ribbon(shift(zip(xs, [44, 38, 42, 30, 34]), 9, -7), "orange")}
        {ribbon(zip(xs, [44, 30, 36, 20, 26]), "blue")}
      </>
    );
  }
  let series: Array<{ points: Pt[]; tone: Tone; guide?: boolean }>;
  if (subtype === "stacked" || subtype === "stackedMarkers") {
    series = [
      { points: zip(LINE_X, [52, 46, 50, 42, 46]), tone: "blue" },
      { points: zip(LINE_X, [36, 26, 32, 20, 26]), tone: "orange" },
    ];
  } else if (subtype === "percentStacked" || subtype === "percentStackedMarkers") {
    series = [
      { points: zip(LINE_X, [48, 40, 44, 34, 40]), tone: "blue" },
      { points: zip(LINE_X, [30, 22, 28, 20, 26]), tone: "orange" },
      { points: zip(LINE_X, [14, 14, 14, 14, 14]), tone: "grey", guide: true },
    ];
  } else {
    series = [
      { points: zip(LINE_X, [40, 26, 32, 16, 22]), tone: "blue" },
      { points: zip(LINE_X, [52, 44, 48, 36, 40]), tone: "orange" },
    ];
  }
  return (
    <>
      {PLOT}
      {series.map((item, index) =>
        item.guide ? (
          <path key={index} data-chart-percent-guide d={linePath(item.points)} fill="none" stroke={INK.grey} strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <Line key={index} points={item.points} tone={item.tone} />
        ),
      )}
      {markers
        ? series.map((item, index) => <Markers key={`m${index}`} points={item.points} tone={item.tone} primary={index === 0} />)
        : null}
    </>
  );
}

const AREA_X = [15, 38.25, 61.5, 84.75, 108];
const AREA_X_3D = [14, 35, 56, 77, 96];

function areaMarks(subtype: ChartSubtype, threeD: boolean): ReactNode {
  const percent = PERCENT.includes(subtype);
  const stacked = STACKED.includes(subtype) || percent;
  const xs = threeD ? AREA_X_3D : AREA_X;
  const base = threeD ? 60 : 62;
  const floor = baseline(xs, base);
  let layers: Array<{ top: Pt[]; bottom: Pt[]; tone: Tone }>;
  if (percent) {
    const s1 = zip(xs, [44, 36, 42, 32, 40]);
    const s2 = zip(xs, [28, 22, 30, 20, 26]);
    const s3 = zip(xs, [14, 14, 14, 14, 14]);
    layers = [
      { top: s1, bottom: floor, tone: "blue" },
      { top: s2, bottom: s1, tone: "orange" },
      { top: s3, bottom: s2, tone: "grey" },
    ];
  } else if (stacked) {
    const s1 = zip(xs, [48, 42, 46, 38, 44]);
    const s2 = zip(xs, [32, 22, 28, 18, 26]);
    layers = [
      { top: s1, bottom: floor, tone: "blue" },
      { top: s2, bottom: s1, tone: "orange" },
    ];
  } else {
    layers = [
      { top: zip(xs, [30, 16, 26, 12, 22]), bottom: floor, tone: "blue" },
      { top: zip(xs, [46, 38, 44, 34, 44]), bottom: floor, tone: "orange" },
    ];
  }
  const guide = percent ? (
    <path data-chart-percent-guide d={threeD ? "M14 14H96" : "M15 14H108"} fill="none" stroke={INK.greyDeep} strokeWidth="1" />
  ) : null;
  if (!threeD) {
    return (
      <>
        {PLOT}
        <g data-chart-percent-stack={percent || undefined}>
          {layers.map((layer, index) => (
            <path key={index} d={band(layer.top, layer.bottom)} fill={FACE[layer.tone].front} stroke={INK.gap} strokeWidth="0.75" strokeLinejoin="round" />
          ))}
        </g>
        {guide}
      </>
    );
  }
  const depth: Pt = [10, -7];
  /** A slab: its lit top edge, its shaded right end, then the front face. */
  const slab = (top: Pt[], bottom: Pt[], tone: Tone, key: string, offset: Pt = [0, 0]) => {
    const front = shift(top, ...offset);
    const under = shift(bottom, ...offset);
    const last = front[front.length - 1];
    const lastUnder = under[under.length - 1];
    const roof = front
      .slice(0, -1)
      .map((point, index) => {
        const next = front[index + 1];
        return `M${pt(point)}L${pt(next)}L${pt([next[0] + depth[0], next[1] + depth[1]])}L${pt([point[0] + depth[0], point[1] + depth[1]])}Z`;
      })
      .join("");
    return (
      <g key={key}>
        <path d={`M${pt(last)}L${pt([last[0] + depth[0], last[1] + depth[1]])}L${pt([lastUnder[0] + depth[0], lastUnder[1] + depth[1]])}L${pt(lastUnder)}Z`} fill={FACE[tone].side} />
        <path d={roof} fill={FACE[tone].top} />
        <path d={band(front, under)} fill={FACE[tone].front} />
      </g>
    );
  };
  return (
    <>
      {FLOOR}
      <g data-chart-percent-stack={percent || undefined}>
        {stacked
          ? layers.map((layer, index) => slab(layer.top, layer.bottom, layer.tone, `s${index}`))
          : [
              slab(layers[0].top, layers[0].bottom, layers[0].tone, "back", [9, -7]),
              slab(layers[1].top, layers[1].bottom, layers[1].tone, "front"),
            ]}
      </g>
      {guide}
    </>
  );
}

// ---------------------------------------------------------------- pie

const SLICES: ReadonlyArray<readonly [number, number, Tone]> = [
  [0, 0.42, "blue"],
  [0.42, 0.72, "orange"],
  [0.72, 1, "grey"],
];
const GAP_STROKE = { stroke: INK.gap, strokeWidth: 1.2, strokeLinejoin: "round" as const };

function pieMarks(subtype: ChartSubtype): ReactNode {
  if (subtype === "pie3d") {
    const [cx, cy, rx, ry, depth] = [60, 30, 34, 19, 9];
    return (
      <>
        <g data-chart-3d-layer>
          <path d={rim(cx, cy, rx, ry, depth, 0.25, 0.42)} fill={INK.blueDeep} />
          <path d={rim(cx, cy, rx, ry, depth, 0.42, 0.72)} fill={INK.orangeDeep} />
          <path d={rim(cx, cy, rx, ry, depth, 0.72, 0.75)} fill={INK.greyDeep} />
        </g>
        <g data-chart-3d-layer>
          {SLICES.map(([t0, t1, tone]) => (
            <path key={tone} d={wedge(cx, cy, rx, ry, t0, t1)} fill={FACE[tone].front} {...GAP_STROKE} />
          ))}
        </g>
      </>
    );
  }
  if (subtype === "pieOfPie" || subtype === "barOfPie") {
    const [cx, cy, r] = [36, 36, 24];
    const upper = onEllipse(cx, cy, r, r, 0.17);
    const lower = onEllipse(cx, cy, r, r, 0.33);
    const main = (
      <g data-chart-pie-part>
        <path d={wedge(cx, cy, r, r, 0.33, 0.75)} fill={INK.blue} {...GAP_STROKE} />
        <path d={wedge(cx, cy, r, r, 0.75, 1.17)} fill={INK.orange} {...GAP_STROKE} />
        <path d={wedge(cx, cy, r, r, 0.17, 0.33)} fill={INK.grey} {...GAP_STROKE} />
      </g>
    );
    if (subtype === "pieOfPie") {
      const [sx, sy, sr] = [96, 36, 14];
      return (
        <>
          <path data-chart-connector d={`M${pt(upper)}L${sx} ${sy - sr}M${pt(lower)}L${sx} ${sy + sr}`} fill="none" stroke={INK.greyDeep} strokeWidth="1" />
          {main}
          <g data-chart-pie-part>
            <path d={wedge(sx, sy, sr, sr, 0, 0.45)} fill={INK.grey} {...GAP_STROKE} />
            <path d={wedge(sx, sy, sr, sr, 0.45, 0.75)} fill={INK.greyDeep} {...GAP_STROKE} />
            <path d={wedge(sx, sy, sr, sr, 0.75, 1)} fill={INK.greySoft} {...GAP_STROKE} />
          </g>
        </>
      );
    }
    return (
      <>
        <path data-chart-connector d={`M${pt(upper)}L86 12M${pt(lower)}L86 60`} fill="none" stroke={INK.greyDeep} strokeWidth="1" />
        {main}
        <rect data-chart-bar-part x="86" y="12" width="15" height="20" fill={INK.grey} {...GAP_STROKE} />
        <rect data-chart-bar-part x="86" y="32" width="15" height="16" fill={INK.greyDeep} {...GAP_STROKE} />
        <rect data-chart-bar-part x="86" y="48" width="15" height="12" fill={INK.greySoft} {...GAP_STROKE} />
      </>
    );
  }
  if (subtype === "doughnut") {
    return (
      <g data-chart-hole>
        {SLICES.map(([t0, t1, tone]) => (
          <path key={tone} d={annulus(60, 36, 27, 15, t0, t1)} fill={FACE[tone].front} {...GAP_STROKE} />
        ))}
      </g>
    );
  }
  return (
    <>
      {SLICES.map(([t0, t1, tone]) => (
        <path key={tone} d={wedge(60, 36, 27, 27, t0, t1)} fill={FACE[tone].front} {...GAP_STROKE} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- hierarchy / statistical

const TREEMAP: ReadonlyArray<readonly [number, number, number, number, string]> = [
  [16, 8, 46, 32, INK.blue],
  [16, 42, 28, 22, INK.blue],
  [46, 42, 16, 22, INK.blueSoft],
  [64, 8, 40, 24, INK.orange],
  [64, 34, 22, 30, INK.orangeSoft],
  [88, 34, 16, 30, INK.grey],
];

function hierarchyMarks(subtype: ChartSubtype): ReactNode {
  if (subtype === "sunburst") {
    const outer: ReadonlyArray<readonly [number, number, string]> = [
      [0, 0.25, INK.blue],
      [0.25, 0.42, INK.blueSoft],
      [0.42, 0.6, INK.orange],
      [0.6, 0.72, INK.orangeSoft],
      [0.72, 0.86, INK.grey],
      [0.86, 1, INK.greySoft],
    ];
    return (
      <>
        <g data-chart-sunburst-ring>
          {SLICES.map(([t0, t1, tone]) => (
            <path key={tone} d={annulus(60, 36, 17, 7, t0, t1)} fill={FACE[tone].side} {...GAP_STROKE} />
          ))}
        </g>
        <g data-chart-sunburst-ring>
          {outer.map(([t0, t1, fill]) => (
            <path key={`${t0}`} d={annulus(60, 36, 28, 17, t0, t1)} fill={fill} {...GAP_STROKE} />
          ))}
        </g>
      </>
    );
  }
  return (
    <g data-chart-treemap-cell>
      {TREEMAP.map(([x, y, w, h, fill]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </g>
  );
}

function statisticalMarks(subtype: ChartSubtype): ReactNode {
  if (subtype === "boxWhisker") {
    const boxes: ReadonlyArray<readonly [number, number, number, number, number, number, Tone]> = [
      // centre, whisker top, box top, median, box bottom, whisker bottom
      [32, 14, 26, 36, 46, 56, "blue"],
      [60, 10, 20, 28, 40, 50, "orange"],
      [88, 22, 30, 42, 50, 58, "grey"],
    ];
    return (
      <>
        {PLOT}
        <path
          data-chart-whisker
          d={boxes
            .map(([cx, top, boxTop, , boxBottom, bottom]) =>
              `M${cx} ${boxTop}V${top}M${cx - 5} ${top}h10M${cx} ${boxBottom}V${bottom}M${cx - 5} ${bottom}h10`)
            .join("")}
          fill="none"
          stroke={INK.greyDeep}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g data-chart-box>
          {boxes.map(([cx, , boxTop, , boxBottom, , tone]) => (
            <rect key={cx} x={cx - 9} y={boxTop} width="18" height={boxBottom - boxTop} fill={FACE[tone].front} />
          ))}
        </g>
        <path
          data-chart-median
          d={boxes.map(([cx, , , median]) => `M${cx - 9} ${median}h18`).join("")}
          fill="none"
          stroke={INK.gap}
          strokeWidth="1.5"
        />
        <path
          data-chart-mean
          d={boxes.map(([cx, , boxTop, median]) => {
            const y = (boxTop + median) / 2;
            return `M${cx - 2.5} ${y - 2.5}l5 5M${cx + 2.5} ${y - 2.5}l-5 5`;
          }).join("")}
          fill="none"
          stroke={INK.gap}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </>
    );
  }
  if (subtype === "pareto") {
    const heights = [44, 32, 22, 14, 9, 6];
    const total = heights.reduce((sum, value) => sum + value, 0);
    let running = 0;
    const cumulative = heights.map((value, index) => {
      running += value;
      return [18 + index * 14.4 + 6, 62 - (running / total) * 50] as const;
    });
    return (
      <>
        {PLOT}
        <path d="M108 8V62" fill="none" stroke={INK.axis} strokeWidth="1.5" />
        {heights.map((height, index) => (
          <rect key={index} x={18 + index * 14.4} y={62 - height} width="12" height={height} fill={INK.blue} />
        ))}
        <path data-chart-pareto-line d={linePath(cumulative)} fill="none" stroke={INK.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {cumulative.map(([cx, cy], index) => (
          <circle key={index} cx={r2(cx)} cy={r2(cy)} r="2.4" fill={INK.orange} stroke={INK.gap} strokeWidth="0.8" />
        ))}
      </>
    );
  }
  const heights = [12, 26, 42, 36, 20, 9];
  return (
    <>
      {PLOT}
      {heights.map((height, index) => (
        <rect key={index} x={r2(18 + index * 14.5)} y={62 - height} width="14.5" height={height} fill={INK.blue} stroke={INK.gap} strokeWidth="1" />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- stock

const STOCK_X = [26, 48, 70, 92];

function stockMarks(subtype: ChartSubtype): ReactNode {
  const volume = subtype === "volumeHighLowClose" || subtype === "volumeOpenHighLowClose";
  const candles = subtype === "openHighLowClose" || subtype === "volumeOpenHighLowClose";
  // Prices in their band: the full plot, or above the volume bars.
  const scale = (value: number) => (volume ? 8 + (value - 8) * 0.68 : value);
  const high = [14, 20, 12, 18].map(scale);
  const low = [46, 52, 42, 48].map(scale);
  const open = [38, 26, 36, 22].map(scale);
  const close = [24, 40, 20, 32].map(scale);
  return (
    <>
      {PLOT}
      {volume ? (
        <>
          <path d="M108 8V62" fill="none" stroke={INK.axis} strokeWidth="1.5" />
          <path data-chart-stock-volume d={[10, 6, 13, 8].map((h, index) => `M${STOCK_X[index] - 7} 62v${-h}h14v${h}Z`).join("")} fill={INK.grey} />
        </>
      ) : null}
      {candles ? (
        <>
          <path
            data-chart-stock-wick
            d={STOCK_X.map((x, index) => {
              const top = Math.min(open[index], close[index]);
              const bottom = Math.max(open[index], close[index]);
              return `M${x} ${r2(high[index])}V${r2(top)}M${x} ${r2(bottom)}V${r2(low[index])}`;
            }).join("")}
            fill="none"
            stroke={INK.greyDeep}
            strokeWidth="1.5"
          />
          {STOCK_X.map((x, index) => {
            const rising = close[index] < open[index];
            const top = Math.min(open[index], close[index]);
            return (
              <rect
                key={x}
                data-chart-stock-open
                x={x - 6}
                y={r2(top)}
                width="12"
                height={r2(Math.abs(open[index] - close[index]))}
                fill={rising ? INK.gap : INK.greyDeep}
                stroke={INK.greyDeep}
                strokeWidth="1.5"
              />
            );
          })}
        </>
      ) : (
        <>
          <path
            data-chart-stock-wick
            d={STOCK_X.map((x, index) => `M${x} ${r2(high[index])}V${r2(low[index])}`).join("")}
            fill="none"
            stroke={INK.greyDeep}
            strokeWidth="2"
          />
          {STOCK_X.map((x, index) => (
            <path key={x} data-chart-stock-close d={`M${x} ${r2(close[index])}h7`} fill="none" stroke={INK.blue} strokeWidth="2.5" strokeLinecap="round" />
          ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- radar

function radarPoint(value: number, index: number): Pt {
  const angle = ((-90 + index * 72) * Math.PI) / 180;
  return [60 + 28 * value * Math.cos(angle), 37 + 28 * value * Math.sin(angle)];
}
const RADAR_S1 = [0.92, 0.62, 0.78, 0.5, 0.82].map(radarPoint);
const RADAR_S2 = [0.5, 0.88, 0.45, 0.82, 0.58].map(radarPoint);
const ring = (scale: number) => `${linePath([0, 1, 2, 3, 4].map((index) => radarPoint(scale, index)))}Z`;
const RADAR_WEB = `${ring(1)}${ring(0.5)}${[0, 1, 2, 3, 4].map((index) => `M60 37L${pt(radarPoint(1, index))}`).join("")}`;

function radarMarks(subtype: ChartSubtype): ReactNode {
  const filled = subtype === "filled";
  return (
    <>
      <path d={RADAR_WEB} fill="none" stroke={INK.axis} strokeWidth="1" strokeLinejoin="round" />
      {[
        { points: RADAR_S2, tone: "orange" as Tone },
        { points: RADAR_S1, tone: "blue" as Tone },
      ].map(({ points, tone }) => (
        <path
          key={tone}
          d={`${linePath(points)}Z`}
          fill={filled ? FACE[tone].front : "none"}
          fillOpacity={filled ? 0.78 : undefined}
          stroke={FACE[tone].front}
          strokeWidth={filled ? 1 : 2.5}
          strokeLinejoin="round"
        />
      ))}
      {subtype === "markers" ? (
        <>
          <Markers points={RADAR_S2} tone="orange" primary={false} />
          <Markers points={RADAR_S1} tone="blue" primary />
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- combo / waterfall

const COMBO_X = [18, 42, 66, 90];

function comboMarks(subtype: ChartSubtype): ReactNode {
  const secondary = subtype === "columnLineSecondary" || subtype === "custom";
  const columns = [26, 38, 20, 32];
  const line = zip(COMBO_X.map((x) => x + 7), secondary ? [22, 14, 30, 12] : [40, 24, 30, 16]);
  if (subtype === "stackedAreaColumn") {
    const xs = [15, 38.25, 61.5, 84.75, 108];
    const s1 = zip(xs, [44, 38, 42, 34, 40]);
    const s2 = zip(xs, [30, 20, 26, 16, 24]);
    return (
      <>
        {PLOT}
        <g data-chart-combo-area>
          <path d={band(s1, baseline(xs, 62))} fill={INK.blueSoft} />
          <path d={band(s2, s1)} fill={INK.orangeSoft} />
        </g>
        {COMBO_X.map((x, index) => (
          <rect key={x} x={x + 1} y={62 - [18, 30, 14, 24][index]} width="12" height={[18, 30, 14, 24][index]} fill={INK.greyDeep} />
        ))}
      </>
    );
  }
  return (
    <>
      {PLOT}
      {secondary ? (
        <path data-chart-secondary-axis d="M108 8V62" fill="none" stroke={INK.axis} strokeWidth="1.5" />
      ) : null}
      {COMBO_X.map((x, index) => (
        <rect key={x} x={x} y={62 - columns[index]} width="14" height={columns[index]} fill={INK.blue} />
      ))}
      {subtype === "custom" ? (
        <path data-chart-custom-series d={linePath(zip(COMBO_X.map((x) => x + 7), [50, 44, 48, 40]))} fill="none" stroke={INK.greyDeep} strokeWidth="2" strokeDasharray="4 2.5" strokeLinecap="round" />
      ) : null}
      <Line points={line} tone="orange" />
      <Markers points={line} tone="orange" primary={false} />
    </>
  );
}

function waterfallMarks(): ReactNode {
  // start total, +10, -8, +14, -6, end total (levels on the 62 baseline)
  const steps: ReadonlyArray<readonly [number, number, Tone]> = [
    [42, 62, "grey"],
    [32, 42, "blue"],
    [32, 40, "orange"],
    [26, 40, "blue"],
    [26, 32, "orange"],
    [32, 62, "grey"],
  ];
  const x = (index: number) => 17 + index * 15.4;
  const levels = [42, 32, 40, 26, 32];
  return (
    <>
      {PLOT}
      <path
        data-chart-waterfall-connector
        d={levels.map((level, index) => `M${r2(x(index) + 12)} ${level}H${r2(x(index + 1))}`).join("")}
        fill="none"
        stroke={INK.greyDeep}
        strokeWidth="1"
        strokeDasharray="2 1.5"
      />
      {steps.map(([top, bottom, tone], index) => (
        <rect key={index} x={r2(x(index))} y={top} width="12" height={bottom - top} fill={FACE[tone].front} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- xy

const XY_S1: Pt[] = [[22, 46], [38, 34], [56, 40], [74, 22], [96, 28]];
const XY_S2: Pt[] = [[28, 56], [46, 50], [64, 52], [82, 42], [102, 40]];

function xyMarks(subtype: ChartSubtype, gradientId: string): ReactNode {
  if (subtype === "bubble" || subtype === "bubble3d") {
    const three = subtype === "bubble3d";
    const bubbles: ReadonlyArray<readonly [number, number, number, Tone]> = [
      [32, 42, 8, "blue"],
      [60, 26, 12, "blue"],
      [90, 40, 9, "blue"],
      [46, 52, 6, "orange"],
      [76, 48, 9, "orange"],
      [98, 20, 6, "orange"],
    ];
    return (
      <>
        {PLOT}
        {three ? (
          <defs>
            {(["blue", "orange"] as const).map((tone) => (
              <radialGradient key={tone} id={`${gradientId}-${tone}`} cx="0.36" cy="0.32" r="0.72">
                <stop offset="0" stopColor={FACE[tone].top} />
                <stop offset="0.55" stopColor={FACE[tone].front} />
                <stop offset="1" stopColor={FACE[tone].side} />
              </radialGradient>
            ))}
          </defs>
        ) : null}
        {bubbles.map(([cx, cy, r, tone]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={three ? `url(#${gradientId}-${tone})` : FACE[tone].front}
            fillOpacity={three ? 1 : 0.82}
            stroke={three ? undefined : FACE[tone].side}
            strokeWidth={three ? undefined : 0.75}
          />
        ))}
        {three ? (
          <g data-chart-bubble-highlight fill={INK.gap} opacity="0.75">
            {bubbles.map(([cx, cy, r]) => (
              <ellipse key={`${cx}-${cy}`} cx={r2(cx - r * 0.35)} cy={r2(cy - r * 0.4)} rx={r2(r * 0.28)} ry={r2(r * 0.18)} />
            ))}
          </g>
        ) : null}
      </>
    );
  }
  const smooth = subtype === "smooth" || subtype === "smoothMarkers";
  const lines = subtype !== "markers";
  const markers = subtype === "markers" || subtype === "smoothMarkers" || subtype === "straightMarkers";
  return (
    <>
      {PLOT}
      {lines ? (
        <>
          <Line points={XY_S2} tone="orange" smooth={smooth} />
          <Line points={XY_S1} tone="blue" smooth={smooth} primaryAttr />
        </>
      ) : null}
      {markers ? (
        <>
          <Markers points={XY_S2} tone="orange" primary={false} />
          <Markers points={XY_S1} tone="blue" primary />
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- funnel / surface / map

function funnelMarks(): ReactNode {
  const widths = [88, 70, 54, 38, 24];
  return (
    <>
      {widths.map((width, index) => (
        <rect key={width} x={60 - width / 2} y={9 + index * 11} width={width} height="9" rx="1" fill={INK.blue} />
      ))}
    </>
  );
}

const SURFACE_H = [
  [0, 4, 8, 6, 2],
  [3, 8, 14, 10, 4],
  [5, 11, 17, 12, 6],
  [3, 8, 12, 9, 4],
  [0, 3, 6, 4, 1],
];
const surfacePoint = (i: number, j: number): Pt => [60 + 12 * i - 12 * j, 24 + 5.5 * i + 5.5 * j - SURFACE_H[i][j] * 1.1];

function surfaceMarks(subtype: ChartSubtype): ReactNode {
  if (subtype === "contour" || subtype === "wireframeContour") {
    const rings: ReadonlyArray<readonly [string, string]> = [
      ["M16 36C16 18 40 10 62 12C88 14 106 24 104 40C102 56 80 62 58 60C34 58 16 52 16 36Z", INK.blue],
      ["M30 36C30 26 46 20 62 22C80 24 92 30 90 40C88 50 74 54 58 52C42 50 30 46 30 36Z", INK.orange],
      ["M46 37C46 31 54 28 62 29C72 30 78 34 76 40C74 45 66 46 58 45C50 44 46 42 46 37Z", INK.grey],
    ];
    const wire = subtype === "wireframeContour";
    return wire ? (
      <g data-chart-wireframe-contour fill="none" strokeWidth="2">
        {rings.map(([d, color]) => <path key={color} d={d} stroke={color} />)}
      </g>
    ) : (
      <g data-chart-contour>
        {rings.map(([d, color]) => <path key={color} d={d} fill={color} />)}
      </g>
    );
  }
  const wire = subtype === "wireframe3d";
  const cells: ReactNode[] = [];
  // Back to front, so nearer facets cover farther ones.
  for (let sum = 0; sum <= 6; sum += 1) {
    for (let i = 0; i < 4; i += 1) {
      const j = sum - i;
      if (j < 0 || j > 3) continue;
      const corners = [surfacePoint(i, j), surfacePoint(i + 1, j), surfacePoint(i + 1, j + 1), surfacePoint(i, j + 1)];
      const height = (SURFACE_H[i][j] + SURFACE_H[i + 1][j] + SURFACE_H[i + 1][j + 1] + SURFACE_H[i][j + 1]) / 4;
      const tone: Tone = height < 5 ? "blue" : height < 10 ? "orange" : "grey";
      cells.push(
        <path
          key={`${i}-${j}`}
          d={`${linePath(corners)}Z`}
          fill={wire ? "none" : FACE[tone].front}
          stroke={wire ? FACE[tone].side : INK.gap}
          strokeWidth={wire ? 1.2 : 0.7}
          strokeLinejoin="round"
        />,
      );
    }
  }
  return <g data-chart-surface-mesh>{cells}</g>;
}

const MAP_REGIONS: ReadonlyArray<readonly [string, string]> = [
  ["M14 30L22 18L38 14L46 22L44 38L30 46L18 42Z", INK.blueSoft],
  ["M46 22L38 14L56 9L74 13L80 26L62 30Z", INK.blue],
  ["M44 38L46 22L62 30L66 46L50 54L36 50L30 46Z", INK.blueDeep],
  ["M62 30L80 26L96 19L106 32L98 48L82 54L66 46Z", INK.blueSoft],
  ["M50 54L66 46L82 54L76 63L58 64Z", INK.blue],
];

function mapMarks(strokeWidth = 1.4): ReactNode {
  return (
    <g data-chart-map-regions stroke={INK.gap} strokeWidth={strokeWidth} strokeLinejoin="round">
      {MAP_REGIONS.map(([d, fill]) => <path key={d} d={d} fill={fill} />)}
    </g>
  );
}

// ---------------------------------------------------------------- family glyphs

/** The menu row's picture: bolder, simpler, drawn at its 40 × 28 size. */
function familyGlyph(family: ChartFamily): ReactNode {
  const axis = <path d="M3.5 3v21.5H37" fill="none" stroke={INK.axis} strokeWidth="1.2" strokeLinejoin="round" />;
  switch (family) {
    case "column":
      return (
        <>
          {axis}
          {[[7, 9, "blue"], [12.5, 6, "orange"], [19, 15, "blue"], [24.5, 11, "orange"], [31, 18, "blue"]].map(([x, h, tone]) => (
            <rect key={x as number} x={x as number} y={24.5 - (h as number)} width="5" height={h as number} rx="0.6" fill={FACE[tone as Tone].front} />
          ))}
        </>
      );
    case "bar":
      return (
        <>
          {axis}
          {[[4.5, 21, "blue"], [9, 15, "orange"], [13.5, 29, "blue"], [18, 24, "orange"]].map(([y, w, tone]) => (
            <rect key={y as number} x="4" y={y as number} width={w as number} height="4" rx="0.6" fill={FACE[tone as Tone].front} />
          ))}
        </>
      );
    case "line":
      return (
        <>
          {axis}
          <path d="M6 20 13 12 20 15 27 7 35 10" fill="none" stroke={INK.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 23 13 19 20 21 27 15 35 17" fill="none" stroke={INK.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "area":
      return (
        <>
          <path d="M4 24.5V13L12 7L20 12L28 5L37 10V24.5Z" fill={INK.blue} />
          <path d="M4 24.5V19L12 15L20 18L28 13L37 17V24.5Z" fill={INK.orange} stroke={INK.gap} strokeWidth="0.6" />
          {axis}
        </>
      );
    case "pie":
      return SLICES.map(([t0, t1, tone]) => (
        <path key={tone} d={wedge(20, 14, 12, 12, t0, t1)} fill={FACE[tone].front} stroke={INK.gap} strokeWidth="0.9" strokeLinejoin="round" />
      ));
    case "hierarchy":
      return (
        <>
          {[[4, 3, 16, 12, INK.blue], [4, 16, 10, 9, INK.blue], [15, 16, 5, 9, INK.blueSoft], [21, 3, 15, 9, INK.orange], [21, 13, 8, 12, INK.orangeSoft], [30, 13, 6, 12, INK.grey]].map(([x, y, w, h, fill]) => (
            <rect key={`${x}-${y}`} x={x as number} y={y as number} width={w as number} height={h as number} fill={fill as string} />
          ))}
        </>
      );
    case "statistical":
      return (
        <>
          {axis}
          {[5, 11, 18, 14, 8, 4].map((h, index) => (
            <rect key={index} x={5 + index * 5.2} y={24.5 - h} width="5.2" height={h} fill={INK.blue} stroke={INK.gap} strokeWidth="0.6" />
          ))}
        </>
      );
    case "xy":
      return (
        <>
          {axis}
          {[[9, 17], [14, 10], [21, 13], [27, 6], [33, 9]].map(([cx, cy]) => <circle key={`${cx}`} cx={cx} cy={cy} r="2" fill={INK.blue} />)}
          {[[11, 21.5], [18, 19], [25, 20], [31, 15]].map(([cx, cy]) => <circle key={`${cx}`} cx={cx} cy={cy} r="2" fill={INK.orange} />)}
        </>
      );
    case "waterfall":
      return (
        <>
          {axis}
          <path d="M10 15h3M15.5 9h3M21 13h3M26.5 7h3" fill="none" stroke={INK.greyDeep} strokeWidth="0.7" strokeDasharray="1 0.8" />
          {[[5, 15, 24.5, "grey"], [10.5, 9, 15, "blue"], [16, 9, 13, "orange"], [21.5, 7, 13, "blue"], [27, 7, 10, "orange"], [32.5, 10, 24.5, "grey"]].map(([x, top, bottom, tone]) => (
            <rect key={x as number} x={x as number} y={top as number} width="4.5" height={(bottom as number) - (top as number)} fill={FACE[tone as Tone].front} />
          ))}
        </>
      );
    case "combo":
      return (
        <>
          {axis}
          {[[6, 10], [14, 15], [22, 9], [30, 13]].map(([x, h]) => (
            <rect key={x} x={x} y={24.5 - h} width="6" height={h} rx="0.6" fill={INK.blue} />
          ))}
          <path d="M9 13 17 6 25 11 33 4" fill="none" stroke={INK.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "map":
      return <g transform="translate(-0.5 -1) scale(0.36)">{mapMarks(3)}</g>;
    case "stock":
      return (
        <>
          {axis}
          <path d="M9 4V22M18 7V24M27 3V19M33 6V20" fill="none" stroke={INK.greyDeep} strokeWidth="1" />
          <rect x="6.5" y="8" width="5" height="9" fill={INK.gap} stroke={INK.greyDeep} strokeWidth="1" />
          <rect x="15.5" y="11" width="5" height="9" fill={INK.greyDeep} stroke={INK.greyDeep} strokeWidth="1" />
          <rect x="24.5" y="6" width="5" height="8" fill={INK.gap} stroke={INK.greyDeep} strokeWidth="1" />
          <rect x="30.5" y="9" width="5" height="7" fill={INK.greyDeep} stroke={INK.greyDeep} strokeWidth="1" />
        </>
      );
    case "radar":
      return (
        <g transform="translate(-10 -3.2) scale(0.5)">
          <path d={RADAR_WEB} fill="none" stroke={INK.axis} strokeWidth="1.8" strokeLinejoin="round" />
          <path d={`${linePath(RADAR_S2)}Z`} fill={INK.orange} fillOpacity="0.8" />
          <path d={`${linePath(RADAR_S1)}Z`} fill={INK.blue} fillOpacity="0.8" />
        </g>
      );
    case "funnel":
      return [32, 25, 18, 11].map((width, index) => (
        <rect key={width} x={20 - width / 2} y={3 + index * 5.75} width={width} height="4.5" rx="0.6" fill={INK.blue} />
      ));
    case "surface":
      return <g transform="translate(-1.6 -1.4) scale(0.36)">{surfaceMarks("surface3d")}</g>;
    default:
      return axis;
  }
}

// ---------------------------------------------------------------- the picture

export function OfficeChartSchematic({
  family,
  subtype,
  compact = false,
}: {
  family: ChartFamily;
  subtype: ChartSubtype;
  compact?: boolean;
}) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (compact) {
    return (
      <svg
        className={`${styles.preview} ${styles.familyPreview}`}
        viewBox="0 0 40 28"
        fill="none"
        aria-hidden
        data-compact
        data-chart-schematic={`${family}-${subtype}`}
      >
        {familyGlyph(family)}
      </svg>
    );
  }
  const threeD = isThreeDimensionalChartLeaf(family, subtype);
  const marks = (() => {
    switch (family) {
      case "column":
        return columnMarks(subtype, threeD);
      case "bar":
        return barMarks(subtype, threeD);
      case "line":
        return lineMarks(subtype);
      case "area":
        return areaMarks(subtype, threeD);
      case "pie":
        return pieMarks(subtype);
      case "hierarchy":
        return hierarchyMarks(subtype);
      case "statistical":
        return statisticalMarks(subtype);
      case "stock":
        return stockMarks(subtype);
      case "radar":
        return radarMarks(subtype);
      case "combo":
        return comboMarks(subtype);
      case "waterfall":
        return waterfallMarks();
      case "xy":
        return xyMarks(subtype, gradientId);
      case "funnel":
        return funnelMarks();
      case "surface":
        return surfaceMarks(subtype);
      case "map":
        return mapMarks();
      default:
        return AXES;
    }
  })();
  return (
    <svg
      className={styles.preview}
      viewBox="0 0 120 72"
      fill="none"
      aria-hidden
      data-chart-schematic={`${family}-${subtype}`}
    >
      {marks}
    </svg>
  );
}
