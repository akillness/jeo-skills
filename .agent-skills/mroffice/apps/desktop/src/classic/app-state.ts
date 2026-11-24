/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An app's window as the AI reads it (agent-apps.ts): the outline of its
 * elements, each with an id the next step names, written as text lines; a
 * second read of the same window says only what changed; and the wait after
 * a step until the window stops changing. No Electron here: the same code
 * reads a Mac's Accessibility tree and Windows' UI Automation tree.
 */

export interface AppNode {
  /** The helper's id (Mac) or the UI Automation runtime id (Windows): unique in the window. */
  id: string | number;
  /** Depth in the outline (0: the window). */
  d: number;
  role: string;
  sub?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  /** The element's frame in the display's coordinates (Mac: points; Windows: pixels). */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  flags?: string[];
  actions?: string[];
}

/** An app window and the picture of it the AI is shown. */
export interface WindowGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  pictureWidth: number;
  pictureHeight: number;
}

export const PICTURE_MAX_WIDTH = 1568;

/** The size of a window's picture: its pixels, at most PICTURE_MAX_WIDTH wide. */
export function pictureSize(width: number, height: number, scale = 1): { width: number; height: number } {
  const pixels = Math.max(1, Math.round(width * (scale || 1)));
  const pictureWidth = Math.min(PICTURE_MAX_WIDTH, pixels);
  return { width: pictureWidth, height: Math.max(1, Math.round((height * pictureWidth) / Math.max(1, width))) };
}

/** A point of the window's picture, in the display's coordinates. */
export function pictureToScreen(geometry: WindowGeometry, x: number, y: number): { x: number; y: number } {
  return {
    x: geometry.x + (x * geometry.w) / geometry.pictureWidth,
    y: geometry.y + (y * geometry.h) / geometry.pictureHeight,
  };
}

/** A point of the display, in the pixels of the window's picture. */
export function screenToPicture(geometry: WindowGeometry, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(((x - geometry.x) * geometry.pictureWidth) / geometry.w),
    y: Math.round(((y - geometry.y) * geometry.pictureHeight) / geometry.h),
  };
}

/** A label on one line; a value keeps its lines (written \n). */
const quoted = (text: string, limit: number, lines = false) => {
  const flat = lines ? text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ") : text.replace(/\s+/g, " ").trim();
  return JSON.stringify(flat.length > limit ? `${flat.slice(0, limit)}…` : flat);
};

/** One element as a line: `[12] Button "发送" (press, show_menu) {focused} @412,388`. */
export function renderNode(node: AppNode, geometry: WindowGeometry | null, ids: (node: AppNode) => string | number = (item) => item.id): string {
  const bits = [`[${ids(node)}]`, node.sub && node.role !== node.sub ? `${node.role}/${node.sub}` : node.role];
  if (node.label) bits.push(quoted(node.label, 160));
  if (node.value !== undefined && node.value !== "") {
    const long = /TextArea|Document|WebArea|Edit/.test(node.role);
    bits.push(`value=${quoted(node.value, long ? 1200 : 160, long)}`);
  } else if (node.placeholder) {
    bits.push(`placeholder=${quoted(node.placeholder, 80)}`);
  }
  if (node.actions?.length) bits.push(`(${node.actions.join(", ")})`);
  if (node.flags?.length) bits.push(`{${node.flags.join(", ")}}`);
  if (geometry && node.w && node.h && node.x !== undefined && node.y !== undefined && node.d > 0) {
    const centre = screenToPicture(geometry, node.x + node.w / 2, node.y + node.h / 2);
    bits.push(`@${centre.x},${centre.y}`);
  }
  return bits.join(" ");
}

const indent = (node: AppNode) => "  ".repeat(Math.min(12, Math.max(0, node.d)));

export function renderTree(nodes: AppNode[], geometry: WindowGeometry | null, ids?: (node: AppNode) => string | number): string[] {
  return nodes.map((node) => indent(node) + renderNode(node, geometry, ids));
}

/** What a read keeps of each element to tell the next read what changed. */
export type Snapshot = Map<string, string>;

const signature = (node: AppNode) =>
  JSON.stringify([node.d, node.role, node.sub ?? "", node.label ?? "", node.value ?? "", node.flags ?? [], node.actions ?? []]);

export function snapshotOf(nodes: AppNode[]): Snapshot {
  return new Map(nodes.map((node) => [String(node.id), signature(node)]));
}

/** A short fingerprint of a whole read: equal reads, equal fingerprints. */
export function treeHash(nodes: AppNode[]): string {
  let hash = 2166136261;
  for (const node of nodes) {
    const text = `${node.id}|${signature(node)}|${Math.round(node.x ?? 0)},${Math.round(node.y ?? 0)},${Math.round(node.w ?? 0)},${Math.round(node.h ?? 0)}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return `${nodes.length}:${hash.toString(16)}`;
}

export interface TreeAnswer {
  /** The lines the AI reads. */
  lines: string[];
  /** Only what changed since the previous read (false: the whole outline). */
  diff: boolean;
  added: number;
  removed: number;
  changed: number;
}

/**
 * The outline, or what changed in it since ``previous`` (the last read of
 * the same window): `+` new elements, `~` changed ones (as they are now),
 * `-` gone ones, in outline order. The whole outline when there is no
 * previous read, when ``full`` is asked, or when so much changed that the
 * whole reads better (more than half of it).
 */
export function treeAnswer(
  nodes: AppNode[],
  geometry: WindowGeometry | null,
  previous: Snapshot | null,
  options: { full?: boolean; ids?: (node: AppNode) => string | number } = {},
): TreeAnswer {
  const whole = (): TreeAnswer => ({ lines: renderTree(nodes, geometry, options.ids), diff: false, added: nodes.length, removed: 0, changed: 0 });
  if (!previous || options.full) return whole();
  const lines: string[] = [];
  let added = 0;
  let changed = 0;
  const seen = new Set<string>();
  for (const node of nodes) {
    const key = String(node.id);
    seen.add(key);
    const before = previous.get(key);
    if (before === undefined) {
      added += 1;
      lines.push(`+ ${indent(node)}${renderNode(node, geometry, options.ids)}`);
    } else if (before !== signature(node)) {
      changed += 1;
      lines.push(`~ ${indent(node)}${renderNode(node, geometry, options.ids)}`);
    }
  }
  const gone: string[] = [];
  for (const [key, before] of previous) {
    if (seen.has(key)) continue;
    try {
      const [, role, sub, label] = JSON.parse(before) as [number, string, string, string];
      gone.push(`- [${options.ids ? key : key}] ${sub && sub !== role ? `${role}/${sub}` : role}${label ? ` ${quoted(label, 80)}` : ""}`);
    } catch {
      gone.push(`- [${key}]`);
    }
  }
  const total = Math.max(nodes.length, previous.size, 1);
  if ((added + changed + gone.length) / total > 0.5) return whole();
  return { lines: [...lines, ...gone], diff: true, added, removed: gone.length, changed };
}

/** Words that say a window is still loading. */
const LOADING = /^(loading|正在加载|加载中|载入中|读取中|please wait|请稍候|正在载入)/i;

export function looksBusy(nodes: AppNode[]): boolean {
  return nodes.some((node) => node.flags?.includes("busy") || /ProgressIndicator|BusyIndicator|ProgressBar/.test(node.role)
    || LOADING.test(node.label ?? ""));
}

export interface SettleOptions {
  /** The least time to wait (ms). */
  min?: number;
  /** The most, while the window still changes or shows it is loading (ms). */
  max?: number;
  /** Between reads (ms). */
  interval?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Settled<T> {
  state: T;
  waitedMs: number;
  settled: boolean;
}

/**
 * Reads the window again until it has stopped changing: about a second
 * after a step, up to five while it changes or shows it is loading. The AI
 * neither waits nor reads again itself.
 */
export async function settle<T extends { nodes?: AppNode[]; busy?: boolean; error?: unknown }>(
  read: () => Promise<T>,
  options: SettleOptions = {},
): Promise<Settled<T>> {
  const min = options.min ?? 1000;
  const max = options.max ?? 5000;
  const interval = options.interval ?? 300;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const start = now();
  await sleep(Math.min(interval, min));
  let state = await read();
  let hash = treeHash(state.nodes ?? []);
  let stableSince = now();
  for (;;) {
    const elapsed = now() - start;
    const busy = Boolean(state.busy) || looksBusy(state.nodes ?? []);
    if (state.error) return { state, waitedMs: elapsed, settled: false };
    if (elapsed >= min && !busy && now() - stableSince >= interval) return { state, waitedMs: elapsed, settled: true };
    if (elapsed >= max) return { state, waitedMs: elapsed, settled: false };
    await sleep(interval);
    const next = await read();
    const nextHash = treeHash(next.nodes ?? []);
    if (nextHash !== hash) {
      hash = nextHash;
      stableSince = now();
    }
    state = next;
  }
}

/** A name as compared: any case, width and spacing, no ".app" / ".exe". */
export function foldName(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\.(app|exe|lnk)$/i, "").replace(/[\s\-_]+/g, "");
}

export interface AppEntry {
  name: string;
  /** Other names it goes by (process name, file name, Start menu name). */
  names?: string[];
  /** Mac: bundle id. Windows: the Start menu's AppID or the program's path. */
  id?: string;
  path?: string;
  running?: boolean;
  front?: boolean;
  lastUsed?: string;
}

/**
 * The app a name means: its exact name, id or path first (any case and
 * spacing), then one whose name contains it or that it contains (running
 * ones first, then the most recently used). Null when nothing is close.
 */
export function matchApp<T extends AppEntry>(query: string, apps: T[]): { app: T; matched: "exact" | "id" | "near" } | null {
  const wanted = foldName(query);
  if (!wanted) return null;
  const names = (app: T) => [app.name, ...(app.names ?? [])].filter(Boolean).map(foldName);
  const lowered = query.trim().toLowerCase();
  const byId = apps.find((app) => (app.id && app.id.toLowerCase() === lowered) || (app.path && app.path.toLowerCase() === lowered));
  if (byId) return { app: byId, matched: "id" };
  const order = [...apps].sort((a, b) => Number(Boolean(b.running)) - Number(Boolean(a.running))
    || String(b.lastUsed ?? "").localeCompare(String(a.lastUsed ?? "")));
  const exact = order.find((app) => names(app).includes(wanted));
  if (exact) return { app: exact, matched: "exact" };
  if (wanted.length < 2) return null;
  const near = order.find((app) => names(app).some((name) => name.includes(wanted) || (name.length >= 2 && wanted.includes(name)))
    || (app.id ? foldName(app.id).includes(wanted) : false));
  return near ? { app: near, matched: "near" } : null;
}
