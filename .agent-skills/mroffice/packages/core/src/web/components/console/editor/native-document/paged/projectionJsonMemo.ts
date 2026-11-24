/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node as PmNode } from "@tiptap/pm/model";

/**
 * What a save keeps between one serialization of the document and the next.
 *
 * A save reads the whole document as text several times over (the receipt's
 * index, its hash, the restore that proves it, the layout key). Nearly all
 * of that text is attribute records (a paragraph carries some sixty
 * attributes, the document its style catalogues), and nearly all of those
 * are the same objects as at the previous save: ProseMirror hands its own
 * attribute objects to `toJSON`, never changes them, and keeps them on every
 * node an edit did not touch.
 *
 * So the text of a ProseMirror attribute object is kept with the object for
 * as long as it lives. `rememberDocumentAttrs` names those objects (every
 * node's and mark's attributes and the document's own attribute values);
 * nothing else is kept across calls, because nothing else is known not to
 * change. The pagination mergers copy a record without its runtime keys on
 * every save; `noteStrippedAttrs` tells this module, for the current scope,
 * that such a copy is its source without those keys, and the copy's text is
 * kept with the source under the keys removed.
 *
 * None of this text is stored. It keys the pagination receipt and the
 * layout key, and the receipt is proven again from the stored document
 * before it is trusted.
 */
interface KeptTexts {
  stable?: string;
  layout?: string;
  /** The layout-key text of a node read as a content node, and whether a
   * chart is in it (see keptLayoutInput). */
  contentLayout?: { readonly text: string; readonly chart: boolean };
}

interface Derivation {
  readonly base: object;
  /** The base's own keys the copy does not have, sorted. */
  readonly removed: readonly string[];
}

interface MemoScope {
  /** Text of every object serialized in this scope. */
  readonly texts: WeakMap<object, string>;
  /** Copies made in this scope of a remembered record without some keys. */
  readonly derived: WeakMap<object, Derivation>;
  /** Digest of every canonical text hashed in this scope. */
  readonly digests: Map<string, string>;
  /** Whether a receipt restores a canonical text, per receipt object. */
  readonly restores: WeakMap<object, Map<string, boolean>>;
  /** Pure derivations of a document object (its merged continuations, its
   * canonical form), by derivation and input. */
  readonly derivations: Map<string, WeakMap<object, unknown>>;
}

/** Texts of ProseMirror's own attribute objects (and their object values). */
const keptByOwned = new WeakMap<object, KeptTexts>();
/** Texts of a remembered record's copies without some keys, by those keys. */
const keptByDerivation = new WeakMap<object, Map<string, KeptTexts>>();
let scope: MemoScope | null = null;

function hasKeys(record: object): boolean {
  for (const _ in record) return true;
  return false;
}

function own(value: unknown): void {
  if (value && typeof value === "object" && !keptByOwned.has(value)) keptByOwned.set(value, {});
}

/** Name the attribute objects of `doc` as unchanging: every node's and
 * mark's attributes, and the document's object-valued attributes (the save
 * rebuilds the document's record around the same values). */
/** A ProseMirror node, by class or, should the bundle hold the class twice,
 * by the shape every node has; a stand-in for a document is not one. */
function isProseMirrorNode(value: unknown): value is PmNode {
  if (value instanceof PmNode) return true;
  const node = value as { marks?: unknown; forEach?: unknown; attrs?: unknown; type?: { schema?: unknown } } | null;
  return Boolean(node) && typeof node === "object" && Array.isArray(node!.marks) &&
    typeof node!.forEach === "function" && Boolean(node!.attrs) && typeof node!.type?.schema === "object";
}

export function rememberDocumentAttrs(doc: PmNode): void {
  // Only a ProseMirror node's attribute objects are known never to change.
  // Anything else (a stand-in for a document) is not remembered: the save
  // serializes it the long way, as before.
  if (!isProseMirrorNode(doc)) return;
  for (const key in doc.attrs) own(doc.attrs[key]);
  const visit = (node: PmNode) => {
    if (!isProseMirrorNode(node)) return;
    if (hasKeys(node.attrs)) own(node.attrs);
    for (const mark of node.marks) if (hasKeys(mark.attrs)) own(mark.attrs);
    node.forEach(visit);
  };
  visit(doc);
}

/** rememberDocumentAttrs for one node only (not its children): its own and
 * its marks' attribute objects; for a document, also its attribute values. */
export function rememberNodeAttrs(node: PmNode, isDocument = false): void {
  if (!isProseMirrorNode(node)) return;
  if (isDocument) for (const key in node.attrs) own(node.attrs[key]);
  if (hasKeys(node.attrs)) own(node.attrs);
  for (const mark of node.marks) if (hasKeys(mark.attrs)) own(mark.attrs);
}

/**
 * Name the JSON of one ProseMirror node, kept for it (copilotPageRegion
 * keptNodeJson), as unchanging. It is frozen, its content and marks are
 * frozen arrays of such JSON, and its attribute objects are ProseMirror's
 * own: nothing in it changes for as long as it lives, so its texts are kept
 * with it from one save to the next, as an attribute record's are. A save
 * of an inked page serialized every block of the document again (several
 * times: the receipt, its digest, the layout key), each save.
 */
export function rememberFrozenNodeJson(json: object): void {
  if (!Object.isFrozen(json)) return;
  own(json);
  const record = json as { content?: unknown; marks?: unknown };
  if (Array.isArray(record.content) && Object.isFrozen(record.content)) own(record.content);
  if (Array.isArray(record.marks) && Object.isFrozen(record.marks)) {
    own(record.marks);
    for (const mark of record.marks) if (mark && typeof mark === "object" && Object.isFrozen(mark)) own(mark);
  }
}

/** `copy` is `source` without `keys` and nothing else changed (the mergers'
 * runtime-key strip). Within the current scope the copy's texts are those
 * kept for the record it came from. Outside a scope nothing is noted: the
 * copy may be changed by whoever receives it. */
export function noteStrippedAttrs(
  copy: object | undefined,
  source: object | undefined,
  keys: Iterable<string>,
): void {
  const current = scope;
  if (!current || !copy || !source || copy === source) return;
  let base: object;
  let removed: Set<string>;
  if (keptByOwned.has(source)) {
    base = source;
    removed = new Set();
  } else {
    const derivation = current.derived.get(source);
    if (!derivation) return;
    base = derivation.base;
    removed = new Set(derivation.removed);
  }
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(base, key)) removed.add(key);
  current.derived.set(copy, { base, removed: [...removed].sort() });
}

function keptFor(value: object, current: MemoScope): KeptTexts | undefined {
  const owned = keptByOwned.get(value);
  if (owned) return owned;
  const derivation = current.derived.get(value);
  if (!derivation) return undefined;
  let byKeys = keptByDerivation.get(derivation.base);
  if (!byKeys) keptByDerivation.set(derivation.base, (byKeys = new Map()));
  const id = derivation.removed.join("\u0000");
  let kept = byKeys.get(id);
  if (!kept) byKeys.set(id, (kept = {}));
  return kept;
}

function serialize(value: object): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableProjectionJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableProjectionJson(record[key])}`)
    .join(",")}}`;
}

/** Whether a `withProjectionJsonMemo` scope is open (tests). */
export function projectionJsonMemoOpen(): boolean {
  return scope !== null;
}

/** Run `fn` with every `stableProjectionJson` text kept per object for its
 * duration (nested scopes share the outermost one). `fn` must not mutate
 * JSON it has already serialized. */
export function withProjectionJsonMemo<T>(fn: () => T): T {
  if (scope) return fn();
  scope = {
    texts: new WeakMap(),
    derived: new WeakMap(),
    digests: new Map(),
    restores: new WeakMap(),
    derivations: new Map(),
  };
  try {
    return fn();
  } finally {
    scope = null;
  }
}

/** The table→container→split merge of a runtime document's continuations
 * (see serialization's `mergePagedRuntimeContinuationsJson`). */
export const PAGED_RUNTIME_MERGE = "paged-runtime-merge";

/**
 * `derive(input)`, once per input object in this scope: a save capturing its
 * receipt, proving it and flattening the document merges the same runtime
 * document's continuations and canonicalizes the same objects several times.
 * `derive` must be a pure function of `input`, and neither the input nor the
 * result may be mutated while the scope lasts. Outside a scope it just runs.
 */
export function memoizedProjectionDerivation<I, O>(
  name: string,
  input: I,
  derive: (input: I) => O,
): O {
  const current = scope;
  if (!current || !input || typeof input !== "object") return derive(input);
  let table = current.derivations.get(name);
  if (!table) current.derivations.set(name, (table = new WeakMap()));
  const key = input as unknown as object;
  if (table.has(key)) return table.get(key) as O;
  const output = derive(input);
  table.set(key, output);
  return output;
}

export function stableProjectionJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const current = scope;
  if (!current) return serialize(value);
  const known = current.texts.get(value);
  if (known !== undefined) return known;
  const kept = keptFor(value, current);
  const text = kept ? (kept.stable ??= serialize(value)) : serialize(value);
  current.texts.set(value, text);
  return text;
}

/**
 * `stableProjectionJson(a) === stableProjectionJson(b)`, without writing
 * either text: the same object is equal to itself, a record is compared key
 * by key. Restoring a receipt rebuilds the canonical document out of the
 * canonical document's own subtrees, so most of the comparison is identity.
 */
export function sameProjectionJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return stableProjectionJson(a) === stableProjectionJson(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    if (a.length !== other.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!sameProjectionJson(a[index], other[index])) return false;
    }
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  let defined = 0;
  for (const key of Object.keys(left)) {
    if (left[key] === undefined) continue;
    defined += 1;
    if (!Object.prototype.hasOwnProperty.call(right, key) || !sameProjectionJson(left[key], right[key])) {
      return false;
    }
  }
  for (const key of Object.keys(right)) if (right[key] !== undefined) defined -= 1;
  return defined === 0;
}

/** The digest of one canonical text, computed once per scope. */
export function projectionTextDigest(text: string, compute: (text: string) => string): string {
  const current = scope;
  if (!current) return compute(text);
  let digest = current.digests.get(text);
  if (digest === undefined) current.digests.set(text, (digest = compute(text)));
  return digest;
}

/** Whether `receipt` restores the document whose canonical text is
 * `canonicalText`; asked once per scope. A restore is a pure function of the
 * canonical content and the receipt, and neither changes inside a scope. */
export function projectionRestoresOnce(
  receipt: unknown,
  canonicalText: () => string,
  restore: () => boolean,
): boolean {
  const current = scope;
  if (!current || !receipt || typeof receipt !== "object") return restore();
  let byText = current.restores.get(receipt);
  if (!byText) current.restores.set(receipt, (byText = new Map()));
  const text = canonicalText();
  const known = byText.get(text);
  if (known !== undefined) return known;
  const restores = restore();
  byText.set(text, restores);
  return restores;
}

/** Whether the layout-key text of `value`, read as a content node, is
 * already kept (saveTextWarmup skips it). */
export function contentLayoutInputKept(value: object): boolean {
  return keptByOwned.get(value)?.contentLayout !== undefined;
}

/** The layout-key text of a record, kept the same way as its stable text.
 * Read as a content node, whether a chart is in it is part of what it
 * gives: `compute` is handed its own chart state, and a kept chart is
 * reported into `chartState`. */
export function keptLayoutInput(
  value: object,
  contentNode: boolean,
  compute: (chartState?: { present: boolean }) => string,
  chartState?: { present: boolean },
): string {
  const current = scope;
  const kept = current ? keptFor(value, current) : undefined;
  if (!kept) return compute(chartState);
  if (!contentNode) return (kept.layout ??= compute(chartState));
  if (!chartState) return compute(chartState);
  if (!kept.contentLayout) {
    const own = { present: false };
    kept.contentLayout = { text: compute(own), chart: own.present };
  }
  if (kept.contentLayout.chart) chartState.present = true;
  return kept.contentLayout.text;
}
