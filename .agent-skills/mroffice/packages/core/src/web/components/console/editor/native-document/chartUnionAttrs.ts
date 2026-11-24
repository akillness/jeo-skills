/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A V2 chart node -- block or In Line with Text -- carries the legacy
 * `categories` and `series` fields as explicit nulls in the editor (the node
 * schema's defaults), while the server stores the page without them
 * (`canonicalize_document_chart_nodes`, `chart` and `inlineChart` alike). Saves use the stored form; the pagination
 * projection uses the editor's form, so a receipt made from either proves the
 * same document. Only `content` arrays are walked: chart data and source
 * objects stay opaque. An unchanged tree is returned as the same object.
 */
import { chartNodeAttrsOnV2 } from "../extensions/chartBlockShared";

const INACTIVE_V2_NULL_ATTRS = ["categories", "series"] as const;

type Node = Record<string, unknown>;

/** The block chart and its In Line with Text spelling: one chart node. */
const CHART_NODE_TYPES = new Set(["chart", "inlineChart"]);

function mapChartNodes<T>(
  value: T,
  change: (attrs: Node) => Node | null,
  accepts: (node: Node, attrs: Node) => boolean = (node, attrs) =>
    CHART_NODE_TYPES.has(String(node.type)) && attrs.schemaVersion === 2,
): T {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const next = mapChartNodes(item, change, accepts);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? items : value) as T;
  }
  if (!value || typeof value !== "object") return value;
  const node = value as Node;
  let result = node;
  // A chart node stored without attrs is a blank V1 chart.
  const attrs = node.attrs ?? (CHART_NODE_TYPES.has(String(node.type)) ? {} : undefined);
  if (
    attrs && typeof attrs === "object" && !Array.isArray(attrs) &&
    accepts(node, attrs as Node)
  ) {
    const next = change(attrs as Node);
    if (next) result = { ...node, attrs: next };
  }
  if (Array.isArray(node.content)) {
    const content = mapChartNodes(node.content, change, accepts);
    if (content !== node.content) result = { ...result, content };
  }
  return result as T;
}

/** The stored form: V2 chart nodes (block and inline) without the inactive legacy nulls. */
export function withoutInactiveChartUnionAttrs<T>(value: T): T {
  return mapChartNodes(value, (attrs) => {
    if (!INACTIVE_V2_NULL_ATTRS.some((key) => key in attrs && attrs[key] === null)) return null;
    const next = { ...attrs };
    for (const key of INACTIVE_V2_NULL_ATTRS) if (next[key] === null) delete next[key];
    return next;
  });
}

/** The editor's form: V2 chart nodes (block and inline) with the inactive legacy nulls present. */
export function withInactiveChartUnionDefaults<T>(value: T): T {
  return mapChartNodes(value, (attrs) => {
    if (INACTIVE_V2_NULL_ATTRS.every((key) => attrs[key] !== undefined)) return null;
    const next = { ...attrs };
    for (const key of INACTIVE_V2_NULL_ATTRS) if (next[key] === undefined) next[key] = null;
    return next;
  });
}

/**
 * Every chart on the one chart model: a stored V1 chart (block or inline)
 * is lifted to V2 attrs by the one converter (`chartNodeAttrsOnV2`) as the
 * page is read, so the editor never holds a V1 chart and the next save
 * stores V2. Charts already on the model, and the tree around them, are
 * returned as the same objects.
 */
export function withLegacyChartsOnV2<T>(value: T): T {
  return mapChartNodes(
    value,
    (attrs) => chartNodeAttrsOnV2(attrs),
    (node, attrs) => CHART_NODE_TYPES.has(String(node.type)) && attrs.schemaVersion !== 2,
  );
}
