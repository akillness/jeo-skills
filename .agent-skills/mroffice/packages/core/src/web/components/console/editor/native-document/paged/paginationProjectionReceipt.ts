/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { JSONContent } from "@tiptap/core";
import { mergeSplitContinuationsJson } from "./blockSplitting";
import { mergeContainerContinuationsJson } from "./containerSplitting";
import { mergeTableContinuationsJson } from "./tablePagination";
import { PAGE_REGION_RECEIPT, PAGINATION_RUNTIME_ATTRIBUTES } from "./paginationProjectionKeys";
import { withInactiveChartUnionDefaults } from "../chartUnionAttrs";
import {
  memoizedProjectionDerivation,
  PAGED_RUNTIME_MERGE,
  projectionRestoresOnce,
  projectionTextDigest,
  sameProjectionJson,
  stableProjectionJson,
  withProjectionJsonMemo,
} from "./projectionJsonMemo";

export {
  PAGE_REGION_RECEIPT,
  COPILOT_PROJECTION_ORIGIN,
} from "./paginationProjectionKeys";
export { stableProjectionJson, withProjectionJsonMemo } from "./projectionJsonMemo";
const MAX_RECIPE_NODES = 50_000;
const MAX_RECIPE_BYTES = 2 * 1024 * 1024;
const metadata = new Set([
  "pageBlockSizes",
  "pageBlockLayoutKey",
  PAGE_REGION_RECEIPT,
]);
type Scalar = string | number | boolean | null;
export interface ProjectionNodeRecipe {
  path: number[];
  attrs?: Record<string, Scalar>;
  absentAttrs?: string[];
  text?: [number, number];
  children?: ProjectionNodeRecipe[];
}
export interface ProjectionPageGeometry {
  width: number;
  height: number;
  padding: number[];
  font: string;
  blocks: number[][];
  leading: boolean;
}
export interface PaginationProjectionReceipt {
  version: 1;
  canonicalHash: string;
  pages: ProjectionNodeRecipe[][];
  geometry: ProjectionPageGeometry[];
}

/** The existing three mergers remain the only source of semantic content. */
export function canonicalProjectionDocument(
  document: JSONContent,
): JSONContent {
  // A save canonicalizes the same objects several times (capture, hash,
  // proof, flatten): once per object within a projection scope.
  return memoizedProjectionDerivation("canonical-projection", document, canonicalize);
}

/** The runtime merge serialization's flatten makes of the same document. */
function mergeRuntimeContinuations(document: JSONContent): JSONContent {
  return mergeSplitContinuationsJson(
    mergeContainerContinuationsJson(mergeTableContinuationsJson(document)),
  );
}

function canonicalize(document: JSONContent): JSONContent {
  const merged = memoizedProjectionDerivation(
    PAGED_RUNTIME_MERGE,
    document,
    mergeRuntimeContinuations,
  );
  const attrs = { ...merged.attrs };
  for (const key of metadata) delete attrs[key];
  const flatten = (nodes: JSONContent[]): JSONContent[] =>
    nodes.flatMap((node) =>
      node.type === "pageBlock" ? flatten(node.content ?? []) : [node],
    );
  // Stored and editor chart nodes differ only by the schema's null defaults;
  // canonical content is the editor's form, so either proves the same page.
  return {
    ...merged,
    attrs,
    content: withoutRuntimeAttributes(withInactiveChartUnionDefaults(flatten(merged.content ?? []))),
  };
}

/** The blocks without the paginated editor's own attributes, as the room
 * holds them: every paragraph the editor kept said `pageTableBlockContinues:
 * false`, so a receipt kept from the editor's pages never matched the room's
 * content it is restored onto (a 272-page book reopened from scratch every
 * time). */
function withoutRuntimeAttributes(nodes: JSONContent[]): JSONContent[] {
  return nodes.map(function strip(node: JSONContent): JSONContent {
    let attrs = node.attrs;
    if (attrs && Object.keys(attrs).some((key) => PAGINATION_RUNTIME_ATTRIBUTES.has(key))) {
      attrs = Object.fromEntries(Object.entries(attrs).filter(([key]) => !PAGINATION_RUNTIME_ATTRIBUTES.has(key)));
    }
    const content = node.content?.map(strip);
    if (attrs === node.attrs && (!content || content.every((child, index) => child === node.content![index]))) return node;
    return { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) };
  });
}

/** Stable non-security cache fingerprint. Restore additionally proves exact
 * semantic equality; this digest never grants any source/write authority. */
export function projectionCanonicalHash(document: JSONContent): string {
  return projectionTextDigest(
    stableProjectionJson(withoutPictureSources(canonicalProjectionDocument(document))),
    canonicalTextDigest,
  );
}

const SIZED_PICTURE_TYPES = new Set(["image", "inlineImage"]);

const positive = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value > 0;

/** A picture's source string as the print hands it (inline data) or the page
 * names it (an attachment, `mrai-picture:<sha256>`). */
const handedPictureSource = (value: unknown): boolean =>
  typeof value === "string" && (value.startsWith("data:") || value.startsWith("mrai-picture:"));

/**
 * The document as its layout depends on it, for the fingerprint only: where
 * a picture's source is, not what draws at the size it states. The print
 * hands every picture to the headless page inline (`inline_document_pictures`
 * rewrites each `src` as data), so a receipt kept by the editor never named
 * the content it printed, and a 271-page book was laid out from scratch on
 * the server for every PDF. A picture that states no size is laid out at its
 * source's, and keeps its source in the fingerprint; a picture filling a
 * frame (a shape's fill) stands at the frame's size.
 */
/** Whether a value holds a handed picture source anywhere (kept per object:
 * a document's attribute objects are the editor's own, never changed). */
const handedSourceInside = new WeakMap<object, boolean>();
function holdsHandedSource(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const known = handedSourceInside.get(value);
  if (known !== undefined) return known;
  let found = false;
  if (Array.isArray(value)) found = value.some(holdsHandedSource);
  else {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "src" && handedPictureSource(entry)) || holdsHandedSource(entry)) { found = true; break; }
    }
  }
  handedSourceInside.set(value, found);
  return found;
}

function withoutPictureSources(document: JSONContent): JSONContent {
  const nested = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(nested);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === "src" && handedPictureSource(entry) ? "" : nested(entry);
    }
    return out;
  };
  // A node with no picture source in it is itself (the same objects): copied,
  // every block's attributes were new objects to the stable serialization,
  // which then wrote the whole document's text again for every hash instead
  // of the text it keeps with each attribute object (a 6 MB handwritten
  // note: most of a save's 1.5 s at an iPad's speed).
  const node = (item: JSONContent): JSONContent => {
    let attrs = item.attrs as Record<string, unknown> | undefined;
    if (attrs) {
      const sized = SIZED_PICTURE_TYPES.has(item.type ?? "") && typeof attrs.src === "string" &&
        ((positive(attrs.width) && positive(attrs.height)) || (positive(attrs.widthEmu) && positive(attrs.heightEmu)));
      if (sized || holdsHandedSource(attrs)) {
        const rest = nested(sized ? { ...attrs, src: "" } : attrs) as Record<string, unknown>;
        if (!sized && typeof attrs.src === "string") rest.src = attrs.src;
        attrs = rest;
      }
    }
    const content = item.content?.map(node);
    if (attrs === item.attrs && (!content || content.every((child, index) => child === item.content![index]))) return item;
    return {
      ...item,
      ...(attrs ? { attrs } : {}),
      ...(content ? { content } : {}),
    };
  };
  return node(document);
}

/**
 * The content a kept layout (layoutSnapshot) names: the document's blocks and
 * settings as they lay out, whichever form they come in. The form stored and
 * the form an editor holds differ in defaults it fills in (a null, a false) and
 * in block ids and heading anchors, none of which moves a line; restoring still proves the result
 * exactly equal to the content it is restored onto.
 */
export function layoutContentHash(document: JSONContent): string {
  const canonical = withoutPictureSources(canonicalProjectionDocument({
    type: document.type ?? "doc",
    ...(document.attrs ? { attrs: document.attrs } : {}),
    content: document.content ?? [],
  }));
  const meaningful = (value: unknown): boolean =>
    !(value === null || value === undefined || value === false || value === "" ||
      (Array.isArray(value) && value.length === 0));
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      // A heading's anchor id is written by the editor once it opens (the
      // table of contents' targets): the room's form has none, the pages
      // that settled have them (R286-D01: every heading of a kept segment).
      if (key === "block_id" || key === "anchor_id") continue;
      const entry = (value as Record<string, unknown>)[key];
      if (meaningful(entry)) out[key] = walk(entry);
    }
    return out;
  };
  return canonicalTextDigest(JSON.stringify(walk(canonical)));
}

/** The geometry a kept layout does not state (a receipt's grammar asks one per
 * page; only a save's proof reads it). */
export const NO_PAGE_GEOMETRY: ProjectionPageGeometry = { width: 1, height: 1, padding: [0, 0, 0, 0], font: "", blocks: [], leading: false };

function canonicalTextDigest(text: string): string {
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return `pr1:${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

function scalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 256)
  );
}
function allowedDifference(key: string): boolean {
  return (
    /^(?:pageSplit|pageTable|noteSlice)/.test(key) ||
    [
      "block_id",
      "pageUnbreakableContainerFallback",
      "start",
      "rowspan",
      "colspan",
      "keepWithNext",
      "keepLines",
      "spaceBeforePt",
      "spaceAfterPt",
      "pageBreakBefore",
    ].includes(key)
  );
}

/**
 * Receipts put together from a kept layout's rows (layoutSnapshot), which the
 * server held to its own bounds row by row: a part kept in segments is one
 * receipt of all of them, past what a page's own receipt may hold (R286-D01:
 * 4.4 MB), and was refused as no receipt at all.
 */
const keptLayoutReceipts = new WeakSet<object>();
/** What a receipt of a kept layout may come to: its part's every segment. */
const MAX_KEPT_RECIPE_BYTES = 64 * 2 * 1024 * 1024;
const MAX_KEPT_RECIPE_NODES = 64 * MAX_RECIPE_NODES;

export function markKeptLayoutReceipt<T extends object>(receipt: T): T {
  keptLayoutReceipts.add(receipt);
  return receipt;
}

export function normalizePaginationProjectionReceipt(
  value: unknown,
): PaginationProjectionReceipt | null {
  try {
    const kept = Boolean(value) && typeof value === "object" && keptLayoutReceipts.has(value as object);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      // Bytes of compact UTF-8 JSON, as the server measures it (its
      // pageRegionLayoutReceipt bound): string length counts UTF-16 units,
      // under the bytes of a CJK font name.
      new TextEncoder().encode(JSON.stringify(value)).length > (kept ? MAX_KEPT_RECIPE_BYTES : MAX_RECIPE_BYTES)
    )
      return null;
    const raw = value as PaginationProjectionReceipt;
    if (
      raw.version !== 1 ||
      !/^pr1:[a-f0-9]{16}:\d+$/.test(raw.canonicalHash) ||
      !Array.isArray(raw.pages) ||
      !raw.pages.length ||
      raw.pages.length > 5000 ||
      !Array.isArray(raw.geometry) ||
      raw.geometry.length !== raw.pages.length ||
      Object.keys(raw).some(
        (key) =>
          !["version", "canonicalHash", "pages", "geometry"].includes(key),
      )
    )
      return null;
    let remaining = kept ? MAX_KEPT_RECIPE_NODES : MAX_RECIPE_NODES;
    const validNode = (node: ProjectionNodeRecipe, depth: number): boolean => {
      if (
        --remaining < 0 ||
        depth > 40 ||
        !node ||
        typeof node !== "object" ||
        !Array.isArray(node.path) ||
        !node.path.length ||
        node.path.length > 40 ||
        node.path.some(
          (n) => !Number.isSafeInteger(n) || n < 0 || n > 100000,
        ) ||
        Object.keys(node).some(
          (key) =>
            !["path", "attrs", "absentAttrs", "text", "children"].includes(key),
        )
      )
        return false;
      if (
        node.attrs !== undefined &&
        (!node.attrs ||
          typeof node.attrs !== "object" ||
          Array.isArray(node.attrs) ||
          Object.keys(node.attrs).length > 48 ||
          Object.entries(node.attrs).some(
            ([key, value]) =>
              !scalar(value) ||
              (!allowedDifference(key) && !(key === "source" && value === null)),
          ))
      )
        return false;
      if (
        node.absentAttrs !== undefined &&
        (!Array.isArray(node.absentAttrs) ||
          node.absentAttrs.length > 48 ||
          node.absentAttrs.some((key) => !allowedDifference(key)))
      )
        return false;
      if (
        node.text &&
        (!Array.isArray(node.text) ||
          node.text.length !== 2 ||
          node.text.some((n) => !Number.isSafeInteger(n) || n < 0))
      )
        return false;
      return (
        node.children === undefined ||
        (Array.isArray(node.children) &&
          node.children.every((child) => validNode(child, depth + 1)))
      );
    };
    if (
      raw.pages.some(
        (page) =>
          !Array.isArray(page) ||
          !page.length ||
          !page.every((node) => validNode(node, 0)),
      )
    )
      return null;
    if (
      raw.geometry.some(
        (g) =>
          !g ||
          typeof g !== "object" ||
          Object.keys(g).some(
            (key) =>
              ![
                "width",
                "height",
                "padding",
                "font",
                "blocks",
                "leading",
              ].includes(key),
          ) ||
          !Number.isFinite(g.width) ||
          g.width <= 0 ||
          g.width > 20000 ||
          !Number.isFinite(g.height) ||
          g.height <= 0 ||
          g.height > 20000 ||
          typeof g.leading !== "boolean" ||
          typeof g.font !== "string" ||
          g.font.length > 1000 ||
          !Array.isArray(g.padding) ||
          g.padding.length !== 4 ||
          g.padding.some((n) => !Number.isFinite(n) || n < 0 || n > 20000) ||
          !Array.isArray(g.blocks) ||
          g.blocks.length > 10000 ||
          g.blocks.some(
            (rect) =>
              !Array.isArray(rect) ||
              rect.length !== 4 ||
              rect.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000),
          ),
      )
    )
      return null;
    return raw;
  } catch {
    return null;
  }
}

type Indexed = { node: JSONContent; path: number[]; json: string };
/** The canonical nodes of one type and marks, in document order, with the
 * same list by block id (built when first asked). */
type Bucket = { items: Indexed[]; byId?: Map<unknown, Indexed[]> };

/**
 * A bucket's candidates in the order the receipt has always tried them: a
 * stable sort by (under the preferred anchor, carries the node's block id),
 * both descending. A block id that is a string (or none) is looked up in
 * the bucket's id list instead of compared with every candidate.
 */
function* candidatesInOrder(
  bucket: Bucket | undefined,
  preferred: number[] | undefined,
  blockId: unknown,
): Generator<Indexed> {
  if (!bucket) return;
  const items = bucket.items;
  let sameId: Indexed[];
  const byIdList = typeof blockId === "string" || blockId === undefined;
  if (byIdList) {
    if (!bucket.byId) {
      const byId = new Map<unknown, Indexed[]>();
      for (const item of items) {
        const id = item.node.attrs?.block_id;
        const list = byId.get(id);
        if (list) list.push(item);
        else byId.set(id, [item]);
      }
      bucket.byId = byId;
    }
    sameId = bucket.byId.get(blockId) ?? [];
  } else {
    sameId = items;
  }
  const carriesId = (item: Indexed) => item.node.attrs?.block_id === blockId;
  const within = (item: Indexed) => preferred !== undefined && startsWithPath(item.path, preferred);
  if (preferred) {
    for (const item of sameId) if (within(item) && (byIdList || carriesId(item))) yield item;
    for (const item of items) if (within(item) && !carriesId(item)) yield item;
  }
  for (const item of sameId) if (!within(item) && (byIdList || carriesId(item))) yield item;
  for (const item of items) if (!within(item) && !carriesId(item)) yield item;
}
function startsWithPath(path: number[], prefix: number[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (path[i] !== prefix[i]) return false;
  return true;
}
function indexCanonical(document: JSONContent) {
  const index = new Map<string, Bucket>(),
    exact = new Map<string, Indexed[]>();
  const walk = (nodes: JSONContent[], prefix: number[], depth: number) => {
    if (depth > 40) throw new Error("Projection tree is too deep");
    nodes.forEach((node, i) => {
      const path = [...prefix, i],
        item = { node, path, json: stableProjectionJson(node) };
      const key = `${node.type}:${stableProjectionJson(node.marks)}`;
      const bucket = index.get(key);
      if (bucket) bucket.items.push(item);
      else index.set(key, { items: [item] });
      const matches = exact.get(item.json);
      if (matches) matches.push(item);
      else exact.set(item.json, [item]);
      walk(node.content ?? [], path, depth + 1);
    });
  };
  walk(document.content ?? [], [], 0);
  return { byType: index, byExact: exact };
}

/** Encode references and cuts only; never duplicate the source text/image or
 * persist a fragment tree as document content. Round-trip is mandatory. */
export function capturePaginationProjectionRecipe(
  runtime: JSONContent,
  geometry: ProjectionPageGeometry[],
  onFailure?: (reason: string) => void,
): PaginationProjectionReceipt | null {
  return withProjectionJsonMemo(() => captureRecipe(runtime, geometry, onFailure));
}

function captureRecipe(
  runtime: JSONContent,
  geometry: ProjectionPageGeometry[],
  onFailure?: (reason: string) => void,
): PaginationProjectionReceipt | null {
  try {
    if (
      !runtime.content?.length ||
      runtime.content.some((node) => node.type !== "pageBlock") ||
      geometry.length !== runtime.content.length
    ) {
      onFailure?.(
        `page_geometry_count:${runtime.content?.length}:${geometry.length}`,
      );
      return null;
    }
    const canonical = canonicalProjectionDocument(runtime),
      index = indexCanonical(canonical);
    const texts = new WeakMap<JSONContent, string>();
    const textOf = (node: JSONContent): string => {
      if (typeof node.text === "string") return node.text;
      const known = texts.get(node);
      if (known !== undefined) return known;
      const text = node.text ?? (node.content ?? []).map(textOf).join("");
      texts.set(node, text);
      return text;
    };
    let remaining = MAX_RECIPE_NODES;
    const encode = (
      node: JSONContent,
      preferred?: number[],
    ): ProjectionNodeRecipe => {
      if (--remaining < 0) throw new Error("Projection budget exhausted");
      const json = stableProjectionJson(node);
      const exactMatches = index.byExact.get(json);
      // Under a block, its own content first: a run reading " " is not one of
      // the same words on a page far away. That reference made a block's page
      // reach the other page, and a circle on 13 pages grew to 199 of them and
      // past what a preview can hold (a 219-page translation, part 4 of 15).
      // A cut of its own block is found among the candidates below.
      const exact = preferred
        ? exactMatches?.find((item) =>
            preferred.every((value, i) => item.path[i] === value),
          )
        : exactMatches?.[0];
      if (exact) return { path: exact.path };
      // A text block's candidates must contain its text: each text is
      // read once per capture, not once per candidate.
      const textMatched = ["paragraph", "heading", "codeBlock"].includes(node.type ?? "");
      const ownText = textMatched ? textOf(node) : "";
      // The candidates are tried in the order a stable sort of the whole
      // bucket gave: those under the preferred anchor first, among them (and
      // then among the rest) the ones carrying this block's id first, and
      // document order within each of the four ranks (candidatesInOrder).
      // Sorting every cell of the document for each cell of a table made a
      // save quadratic in the size of its tables.
      const bucket = index.byType.get(`${node.type}:${stableProjectionJson(node.marks)}`);
      for (const candidate of candidatesInOrder(bucket, preferred, node.attrs?.block_id)) {
        if (textMatched && !textOf(candidate.node).includes(ownText)) continue;
        const attrs: Record<string, Scalar> = {},
          absentAttrs: string[] = [];
        const candidateAttrs = candidate.node.attrs ?? {},
          nodeAttrs = node.attrs ?? {};
        // Every key of either record, the candidate's first, each once.
        const compatibleKey = (key: string): boolean => {
          const before = candidateAttrs[key],
            after = nodeAttrs[key];
          // A schema's explicit null default must survive the recipe. JSON
          // omits undefined object keys; treating both as null loses table
          // defaults and makes the reconstructed runtime fail exact equality.
          if (
            before === after ||
            (before !== undefined && after !== undefined &&
              stableProjectionJson(before) === stableProjectionJson(after))
          ) return true;
          // Runtime continuation tails can clear duplicate native custody: one
          // native paragraph has one claimant, so every physical half but the
          // first gives the source up — and inside a split table row the empty
          // stand-in for a cell half gives it up whichever side it is on.
          // A recipe may reproduce that null, never introduce another source.
          // Restore still proves the entire canonical source tree is identical.
          const clearedContinuationSource = key === "source" && after === null &&
            (nodeAttrs.pageSplitContinuation === true ||
              nodeAttrs.pageTableBlockContinuation === true ||
              nodeAttrs.pageTableBlockContinues === true);
          if (
            (!allowedDifference(key) && !clearedContinuationSource) ||
            (after !== undefined && !scalar(after))
          ) return false;
          if (after === undefined) absentAttrs.push(key);
          else attrs[key] = after as Scalar;
          return true;
        };
        let compatible = true;
        for (const key of Object.keys(candidateAttrs)) {
          if (!compatibleKey(key)) {
            compatible = false;
            break;
          }
        }
        if (compatible) {
          for (const key of Object.keys(nodeAttrs)) {
            if (!Object.prototype.hasOwnProperty.call(candidateAttrs, key) && !compatibleKey(key)) {
              compatible = false;
              break;
            }
          }
        }
        if (!compatible) continue;
        const recipe: ProjectionNodeRecipe = {
          path: candidate.path,
          ...(Object.keys(attrs).length ? { attrs } : {}),
          ...(absentAttrs.length ? { absentAttrs } : {}),
        };
        if (typeof node.text === "string") {
          if (typeof candidate.node.text !== "string") continue;
          const from = candidate.node.text.indexOf(node.text);
          if (from < 0) continue;
          recipe.text = [from, node.text.length];
        } else {
          if ((node.content ?? []).length)
            recipe.children = node.content!.map((child) =>
              encode(child, candidate.path),
            );
          else if (candidate.node.content?.length) recipe.children = [];
        }
        return recipe;
      }
      throw new Error(
        `unrepresentable:${node.type}:${Object.keys(node.attrs ?? {}).join(",")}`,
      );
    };
    let previousPath: number[] | undefined;
    const tablePaths = new Map<string, number[]>();
    const pages = runtime.content.map((page) =>
      (page.content ?? []).map((node) => {
        const tableId = node.attrs?.pageTableFragmentId;
        const preferred =
          typeof tableId === "string"
            ? tablePaths.get(tableId)
            : node.attrs?.pageSplitContinuation === true
              ? previousPath
              : undefined;
        const recipe = encode(node, preferred);
        previousPath = recipe.path;
        if (typeof tableId === "string") tablePaths.set(tableId, recipe.path);
        return recipe;
      }),
    );
    const receipt: PaginationProjectionReceipt = {
      version: 1,
      canonicalHash: projectionCanonicalHash(canonical),
      geometry,
      pages,
    };
    const normalized = normalizePaginationProjectionReceipt(receipt);
    if (!normalized || !paginationProjectionRestores(canonical, normalized)) {
      onFailure?.(normalized ? "roundtrip_mismatch" : "invalid_recipe");
      return null;
    }
    return normalized;
  } catch (error) {
    onFailure?.(error instanceof Error ? error.message : "invalid_projection");
    return null;
  }
}

export function restorePaginationProjection(
  canonicalInput: JSONContent,
  value: unknown,
): JSONContent | null {
  return withProjectionJsonMemo(() => restoreProjection(canonicalInput, value));
}

/** Whether `value` restores `canonicalInput`, for a caller that needs only
 * the answer. The answer depends on the canonical content and the receipt
 * alone, so a scope asks it once per receipt and canonical text: a save
 * proves its new receipt against the runtime document and again against
 * the stored one, which are the same content. */
export function paginationProjectionRestores(
  canonicalInput: JSONContent,
  value: unknown,
): boolean {
  return withProjectionJsonMemo(() =>
    projectionRestoresOnce(
      value,
      () => stableProjectionJson(canonicalProjectionDocument(canonicalInput)),
      () => restoreProjection(canonicalInput, value) !== null,
    ),
  );
}

/** The room's content each editor opened on (by its root), before the
 * editor normalized it: the hash a receipt kept from its pages names. */
const openedContent = new WeakMap<object, { hash: string; blocks: number }>();

export function rememberOpenedProjectionContent(root: object, content: JSONContent): void {
  try {
    const canonical = canonicalProjectionDocument(content);
    openedContent.set(root, { hash: projectionCanonicalHash(canonical), blocks: canonical.content?.length ?? 0 });
  } catch {
    openedContent.delete(root);
  }
}

/** The author edited the content: what they lay out next is theirs, not the opened content's. */
export function forgetOpenedProjectionContent(root: object): void {
  openedContent.delete(root);
}

/**
 * A receipt kept from an editor's pages, named by the content its room
 * opened with rather than by the editor's own: the editor fills in derived
 * attributes on opening (headings' anchor ids, atoms' run-style marks,
 * depending on which transactions reached them), which a page nobody saved
 * since never stores, so the next opening meets the room's content as it
 * opened. Only when the two hold the same blocks (the pages and their cuts
 * are the same either way); restoring still holds the result exactly to the
 * content it is restored onto.
 */
export function receiptForOpenedContent(
  root: object,
  receipt: PaginationProjectionReceipt,
  runtime: JSONContent,
): PaginationProjectionReceipt {
  const opened = openedContent.get(root);
  if (!opened || opened.hash === receipt.canonicalHash) return receipt;
  const blocks = canonicalProjectionDocument(runtime).content?.length ?? 0;
  return opened.blocks === blocks ? { ...receipt, canonicalHash: opened.hash } : receipt;
}

function restoreProjection(
  canonicalInput: JSONContent,
  value: unknown,
): JSONContent | null {
  try {
    const receipt = normalizePaginationProjectionReceipt(value);
    if (!receipt) return null;
    const canonical = canonicalProjectionDocument(canonicalInput);
    if (projectionCanonicalHash(canonical) !== receipt.canonicalHash)
      return null;
    const decode = (recipe: ProjectionNodeRecipe): JSONContent => {
      let source: JSONContent = canonical;
      for (const position of recipe.path) {
        if (!source.content?.[position])
          throw new Error("Unknown source anchor");
        source = source.content[position];
      }
      const node: JSONContent = { ...source };
      if (recipe.attrs || recipe.absentAttrs) {
        node.attrs = { ...source.attrs, ...recipe.attrs };
        for (const key of recipe.absentAttrs ?? []) delete node.attrs[key];
      }
      if (recipe.text) {
        if (
          typeof source.text !== "string" ||
          recipe.text[0] + recipe.text[1] > source.text.length
        )
          throw new Error("Invalid text cut");
        node.text = source.text.slice(
          recipe.text[0],
          recipe.text[0] + recipe.text[1],
        );
      }
      // An emptied copy of a filled source has no `content` at all: ProseMirror
      // never serializes an empty array, and both comparisons below are exact.
      if (recipe.children?.length) node.content = recipe.children.map(decode);
      else if (recipe.children) delete node.content;
      return node;
    };
    const restored = {
      ...canonicalInput,
      content: receipt.pages.map((page) => ({
        type: "pageBlock",
        content: page.map(decode),
      })),
    };
    return sameProjectionJson(canonicalProjectionDocument(restored), canonical)
      ? restored
      : null;
  } catch {
    return null;
  }
}

/** The canonical form of a few blocks, by their position, for a harness
 * comparing two openings' contents. */
export function canonicalProjectionSample(input: JSONContent, at: readonly number[] = [0, 1, 2, 100, 1000, 3000]): string {
  const blocks = canonicalProjectionDocument(input).content ?? [];
  const attrsOf = (node: JSONContent | undefined) => JSON.stringify(node?.attrs ?? {}).slice(0, 400);
  const docAttrs = canonicalProjectionDocument(input).attrs ?? {};
  return JSON.stringify({
    doc: Object.keys(docAttrs).length,
    docAttrs: Object.fromEntries(Object.entries(docAttrs).map(([key, value]) => [key, canonicalTextDigest(JSON.stringify(value ?? null)).slice(4, 12)])),
    hashes: blocks.map((block) => canonicalTextDigest(JSON.stringify(block)).slice(4, 10)).join(""),
    first: JSON.stringify(blocks[0] ?? null).slice(0, 6000),
    picked: Object.fromEntries([962, 1567, 1729, 356].map((index) => [index, JSON.stringify(blocks[index] ?? null).slice(0, 8000)])),
    blocks: at.filter((index) => index < blocks.length).map((index) => `${index}:${blocks[index]?.type}:${projectionCanonicalHash({ type: "doc", content: [blocks[index]!] }).slice(4, 12)}:${attrsOf(blocks[index])}`),
  });
}

/** Why `value` does not restore `canonicalInput`, for a harness trace:
 * "receipt" (not a receipt), "hash" (another content), "decode" (its
 * recipe does not fit the content), or the first top-level block whose
 * restored form differs. */
export function paginationProjectionRefusal(canonicalInput: JSONContent, value: unknown): string {
  try {
    const receipt = normalizePaginationProjectionReceipt(value);
    if (!receipt) return "receipt";
    const canonical = canonicalProjectionDocument(canonicalInput);
    const hash = projectionCanonicalHash(canonical);
    if (hash !== receipt.canonicalHash) return `hash ${hash.slice(0, 12)}!=${receipt.canonicalHash.slice(0, 12)} blocks=${canonical.content?.length ?? 0} ${canonicalProjectionSample(canonicalInput)}`;
    const restored = restorePaginationProjection(canonicalInput, value);
    if (restored) return "none";
    return "decode";
  } catch (error) {
    return `error ${error instanceof Error ? error.message.slice(0, 60) : "?"}`;
  }
}

const validatedRuntime = new WeakMap<
  object,
  PaginationProjectionReceipt | null
>();
/** Validation is cached only for immutable PM documents, never mutable JSON. */
export function projectionReceiptForRuntime(doc: {
  attrs: Record<string, unknown>;
  toJSON: () => JSONContent;
}): PaginationProjectionReceipt | null {
  if (validatedRuntime.has(doc)) return validatedRuntime.get(doc) ?? null;
  const raw = doc.attrs[PAGE_REGION_RECEIPT];
  if (!raw) {
    validatedRuntime.set(doc, null);
    return null;
  }
  const json = doc.toJSON();
  const restored = restorePaginationProjection(json, raw);
  const receipt =
    restored &&
    stableProjectionJson(restored.content) ===
      stableProjectionJson(json.content)
      ? normalizePaginationProjectionReceipt(raw)
      : null;
  validatedRuntime.set(doc, receipt);
  return receipt;
}
