/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { chartNodeAttrsOnV2 } from "../components/console/editor/extensions/chartBlockShared";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAttr(attrs: unknown, key: string): string {
  if (!isRecord(attrs)) return "";
  const value = attrs[key];
  return typeof value === "string" ? value.trim() : "";
}

function nodeContent(node: JsonRecord): JsonRecord[] {
  const content = node.content;
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord);
}

function hasAiSemanticNode(node: unknown): boolean {
  if (!isRecord(node)) return false;

  const type = typeof node.type === "string" ? node.type : "";
  if (["chart", "inlineChart", "mermaid", "smartArt", "codeChart"].includes(type)) {
    return true;
  }
  if (
    (type === "inlineMath" || type === "mathBlock") &&
    stringAttr(node.attrs, "latex")
  ) {
    return true;
  }

  if (
    (type === "tableCell" || type === "tableHeader") &&
    stringAttr(node.attrs, "formula")
  ) {
    return true;
  }

  return nodeContent(node).some(hasAiSemanticNode);
}

function normalizeSerializedDocument(text: string): string {
  return (
    text
      .replace(/\u00a0/g, " ")
      .split("\n")
      // Preserve leading whitespace inside Mermaid/Python fenced blocks and
      // nested lists. Only trailing editor whitespace is semantically empty.
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function compactJson(value: unknown, maxChars = 12_000): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return "";
    if (serialized.length <= maxChars) return serialized;
    const marker = "…[middle truncated]…";
    if (marker.length >= maxChars) return serialized.slice(0, maxChars);
    const bodyChars = maxChars - marker.length;
    const headChars = Math.ceil(bodyChars * 0.65);
    return `${serialized.slice(0, headChars)}${marker}${serialized.slice(
      -(bodyChars - headChars),
    )}`;
  } catch {
    return "";
  }
}

function semanticObjectForAi(node: JsonRecord): string {
  const type = typeof node.type === "string" ? node.type : "";
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  if (type === "chart" || type === "inlineChart") {
    // The model reads every chart on the one chart model it edits.
    const chartAttrs = chartNodeAttrsOnV2(attrs) ?? attrs;
    const chart = Object.fromEntries(
      [
        "schemaVersion",
        "chartType",
        "chartSubtype",
        "stylePreset",
        "title",
        "data",
        "format",
      ]
        .filter((key) => chartAttrs[key] !== undefined && chartAttrs[key] !== null)
        .map((key) => [key, chartAttrs[key]]),
    );
    return `[chart ${compactJson(chart)}]`;
  }
  if (type === "mermaid") {
    const source = stringAttr(attrs, "source");
    const caption = stringAttr(attrs, "caption");
    return [
      caption ? `[mermaid caption: ${caption}]` : "[mermaid]",
      "```mermaid",
      source,
      "```",
    ].join("\n");
  }
  if (type === "smartArt") {
    return `[smartArt ${compactJson({ layout: attrs.layout, items: attrs.items })}]`;
  }
  if (type === "codeChart") {
    const source = stringAttr(attrs, "source");
    const caption = stringAttr(attrs, "caption");
    return [
      caption ? `[code chart caption: ${caption}]` : "[code chart]",
      "```python",
      source,
      "```",
    ].join("\n");
  }
  return "";
}

function joinInline(nodes: JsonRecord[]): string {
  return nodes.map(serializeNodeForAi).join("");
}

function joinBlocks(nodes: JsonRecord[]): string {
  return nodes
    .map(serializeNodeForAi)
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
}

function serializeTableCell(node: JsonRecord): string {
  const displayed = normalizeSerializedDocument(joinBlocks(nodeContent(node)));
  const formula = stringAttr(node.attrs, "formula");

  if (!formula) return displayed;

  const marker = displayed
    ? `[table formula: ${formula} => ${displayed}]`
    : `[table formula: ${formula}]`;
  return displayed ? `${displayed} ${marker}` : marker;
}

function serializeList(nodes: JsonRecord[], ordered: boolean): string {
  return nodes
    .map((node, index) => {
      const body = normalizeSerializedDocument(serializeNodeForAi(node));
      const marker = ordered ? `${index + 1}.` : "-";
      return body
        .split("\n")
        .map((line, lineIndex) =>
          lineIndex === 0 ? `${marker} ${line}` : `  ${line}`,
        )
        .join("\n");
    })
    .join("\n");
}

function serializeNodeForAi(node: JsonRecord): string {
  if (typeof node.text === "string") return node.text;

  const type = typeof node.type === "string" ? node.type : "";
  const children = nodeContent(node);

  switch (type) {
    case "doc":
      return joinBlocks(children);
    case "paragraph":
      return joinInline(children);
    case "heading": {
      const level = Math.min(
        6,
        Math.max(1, Number((node.attrs as JsonRecord | undefined)?.level) || 1),
      );
      const body = joinInline(children);
      return body ? `${"#".repeat(level)} ${body}` : "";
    }
    case "hardBreak":
      return "\n";
    case "inlineMath": {
      const latex = stringAttr(node.attrs, "latex");
      return latex ? `$${latex}$` : "";
    }
    case "mathBlock": {
      const latex = stringAttr(node.attrs, "latex");
      return latex ? `$$\n${latex}\n$$` : "";
    }
    case "chart":
    case "inlineChart":
    case "mermaid":
    case "smartArt":
    case "codeChart":
      return semanticObjectForAi(node);
    case "table":
      return children.map(serializeNodeForAi).join("\n");
    case "tableRow":
      return children.map(serializeNodeForAi).join(" | ");
    case "tableCell":
    case "tableHeader":
      return serializeTableCell(node);
    case "bulletList":
      return serializeList(children, false);
    case "orderedList":
      return serializeList(children, true);
    case "listItem":
      return joinBlocks(children);
    default:
      return children.length > 0 ? joinBlocks(children) : "";
  }
}

/** A compact semantic snapshot for the currently targeted rich object. */
export function documentSemanticNodeForAiContext(node: unknown): string {
  if (!isRecord(node)) return "";
  return semanticObjectForAi(node);
}

export function documentTextForAiContext({
  json,
  fallbackText,
}: {
  json: unknown;
  fallbackText: string;
}): string {
  if (!hasAiSemanticNode(json) || !isRecord(json)) {
    return fallbackText;
  }

  const serialized = normalizeSerializedDocument(serializeNodeForAi(json));
  return serialized || fallbackText;
}















export function documentJsonSliceForAiContext(
  doc: { cut?: (from: number, to: number) => { toJSON?: () => unknown } },
  from: number,
  to: number,
): unknown {
  if (typeof doc?.cut !== "function") return null;
  try {
    const slice = doc.cut(from, to);
    return typeof slice?.toJSON === "function" ? slice.toJSON() : null;
  } catch {
    return null;
  }
}
