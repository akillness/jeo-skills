/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import * as Y from "yjs";
import { yTypeRevision } from "../../../../lib/collab/y-doc-revision";

import { DOCUMENT_ATTRIBUTE_CAPABILITIES } from "../../../../lib/document-feature-capabilities";
import {
  applyJsonDelta,
  applyJsonToYMap,
  jsonEquals,
  yToJson,
  type JsonValue,
} from "../../../../lib/collab/json-crdt";

import {
  resolvedCommentId,
  sanitizeCommentId,
  type CommentRecord,
} from "./comments";

export const COLLABORATIVE_DOCUMENT_ATTRS_MAP = "document-attrs-v1";
export const COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META =
  "mrai.documentAttrs.remote";
export const COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META =
  "mrai.documentAttrs.sectionMutation";

export type CollaborativeDocumentSectionMutation = Readonly<
  { type: "insert"; index: number } | { type: "delete"; index: number }
>;

const LOCAL_DOCUMENT_ATTRS_ORIGIN = Symbol("mrai-document-attrs-local");
const SYNTHETIC_LIST_ID_PREFIX = "__mrai_document_attr_crdt__:";
const SYNTHETIC_LIST_ITEM_MARKER = "__mrai_document_attr_crdt_item__";
const SYNTHETIC_LIST_ITEM_VALUE = "__mrai_document_attr_crdt_value__";
const SECTION_LIST_FIELDS = new Set([
  "sectionLayouts",
  "sectionBands",
  "sections",
]);
const IDENTITY_SEQUENCE = new WeakMap<object, number>();
const PRIVATE_DERIVED_DOCUMENT_ATTRS = new Set([
  "pageBlockSizes",
  "pageBlockLayoutKey",
  "pageRegionLayoutReceipt",
]);
const COLLABORATIVE_DOCUMENT_ATTR_KEYS = Object.freeze(
  Object.keys(DOCUMENT_ATTRIBUTE_CAPABILITIES).filter(
    (key) => !PRIVATE_DERIVED_DOCUMENT_ATTRS.has(key),
  ),
);

export interface CollaborativeDocumentAttrsPatch {
  readonly values: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}

export interface CollaborativeDocumentAttrsBinding {
  readonly hasState: boolean;
  readonly read: () => Readonly<Record<string, unknown>>;
  readonly publish: (
    attrs: Readonly<Record<string, unknown>>,
    sectionMutation?: CollaborativeDocumentSectionMutation | null,
  ) => boolean;
  /** Write the view's value of every attribute the shared map does not hold
   * yet (and the map's structured representation), leaving each original the
   * map already holds as it is. This is maintenance, not an authored change:
   * the caller publishes it outside personal history, before the gesture. */
  readonly materialize: (attrs: Readonly<Record<string, unknown>>) => boolean;
  readonly dispose: () => void;
}

export function normalizeCollaborativeDocumentSectionMutation(
  value: unknown,
): CollaborativeDocumentSectionMutation | null {
  if (
    !isRecord(value) ||
    (value.type !== "insert" && value.type !== "delete") ||
    !Number.isInteger(value.index) ||
    (value.index as number) < 0
  ) {
    return null;
  }
  return { type: value.type, index: value.index as number };
}

function jsonClone(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPreserveOnlyCommentMediaThread(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.sourceMediaDisposition === "preserve-only" &&
    typeof value.sourceMediaFingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(value.sourceMediaFingerprint) &&
    Array.isArray(value.sourceMediaKinds) &&
    value.sourceMediaKinds.length === 1 &&
    value.sourceMediaKinds[0] === "image" &&
    typeof value.sourceMediaCount === "number" &&
    Number.isInteger(value.sourceMediaCount) &&
    value.sourceMediaCount >= 1 &&
    value.sourceMediaCount <= 16
  );
}

function repairPreserveOnlyCommentMedia(
  previous: Readonly<Record<string, unknown>>,
  requested: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const previousThreads = Array.isArray(previous.commentThreads)
    ? previous.commentThreads
    : [];
  const protectedEntries = previousThreads.flatMap((thread, index) =>
    isPreserveOnlyCommentMediaThread(thread)
      ? [{ id: thread.id as string, index, thread }]
      : [],
  );
  if (protectedEntries.length === 0) return requested;

  const protectedIds = new Set(protectedEntries.map((entry) => entry.id));
  const requestedThreads = Array.isArray(requested.commentThreads)
    ? requested.commentThreads
    : [];
  const nextThreads = requestedThreads.filter(
    (thread) =>
      !isPreserveOnlyCommentMediaThread(thread) &&
      !(isRecord(thread) && protectedIds.has(String(thread.id ?? ""))),
  );
  for (const entry of protectedEntries) {
    nextThreads.splice(
      Math.min(entry.index, nextThreads.length),
      0,
      jsonClone(entry.thread),
    );
  }
  const repaired = { ...requested, commentThreads: nextThreads };
  return jsonEquals(
    requested as Record<string, JsonValue>,
    repaired as Record<string, JsonValue>,
  )
    ? requested
    : Object.freeze(repaired);
}

function syntheticListItem(identity: string, value: JsonValue): JsonValue {
  return {
    id: `${SYNTHETIC_LIST_ID_PREFIX}${identity}`,
    [SYNTHETIC_LIST_ITEM_MARKER]: true,
    [SYNTHETIC_LIST_ITEM_VALUE]: value,
  };
}

function syntheticListItemIdentity(value: unknown): string | null {
  if (!isRecord(value) || !isSyntheticListItem(value)) return null;
  return (value.id as string).slice(SYNTHETIC_LIST_ID_PREFIX.length);
}

type IdentityAllocator = (field: string) => string;

function identityAllocator(map: Y.Map<unknown>): IdentityAllocator {
  const owner = map.doc ?? map;
  const ownerId = map.doc
    ? `client-${map.doc.clientID.toString(36)}`
    : "detached";
  return (field) => {
    const next = (IDENTITY_SEQUENCE.get(owner) ?? 0) + 1;
    IDENTITY_SEQUENCE.set(owner, next);
    return `${field}:${ownerId}:${next.toString(36)}`;
  };
}

function isSyntheticListItem(
  value: Record<string, unknown>,
): value is Record<string, JsonValue> {
  return (
    typeof value.id === "string" &&
    value.id.startsWith(SYNTHETIC_LIST_ID_PREFIX) &&
    value[SYNTHETIC_LIST_ITEM_MARKER] === true &&
    Object.prototype.hasOwnProperty.call(value, SYNTHETIC_LIST_ITEM_VALUE)
  );
}

function encodeCollaborativeCommentThreads(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((thread) => {
    if (
      !isRecord(thread) ||
      typeof thread.id !== "string" ||
      !Array.isArray(thread.comments)
    ) {
      return thread;
    }
    return {
      ...thread,
      comments: thread.comments.map((comment, index) => {
        if (!isRecord(comment) || sanitizeCommentId(comment.id)) {
          return comment;
        }
        const identity = resolvedCommentId(
          thread.id,
          index,
          comment as unknown as CommentRecord,
        );
        return identity
          ? syntheticListItem(
              `comment:${thread.id}:${identity}`,
              comment as JsonValue,
            )
          : comment;
      }),
    };
  });
}

function domainListIdentity(
  field: string | undefined,
  value: Record<string, unknown>,
): string | null {
  if (field === "stories" && typeof value.storyId === "string") {
    return `story:${value.storyId}`;
  }
  if (
    field === "reactions" &&
    typeof value.type === "string" &&
    typeof value.actorId === "string" &&
    typeof value.actorProvider === "string"
  ) {
    return `reaction:${value.type}:${value.actorProvider}:${value.actorId}`;
  }
  if (field === "styles" && typeof value.styleId === "string") {
    return `style:${value.styleId}`;
  }
  if (field === "sources" && typeof value.tag === "string") {
    return `source:${value.tag}`;
  }
  return null;
}

function encodeSectionList(
  value: unknown[],
  field: string,
  previous: JsonValue | undefined,
  mutation: CollaborativeDocumentSectionMutation | null,
  allocateIdentity: IdentityAllocator,
): JsonValue[] {
  const previousItems = Array.isArray(previous) ? previous : [];
  const previousIdentities = previousItems.map(syntheticListItemIdentity);
  const hasStablePrevious =
    previousItems.length > 0 &&
    previousIdentities.every(
      (identity): identity is string => identity !== null,
    ) &&
    new Set(previousIdentities).size === previousIdentities.length;
  let identities: string[];
  if (!hasStablePrevious) {
    identities = value.map(() => allocateIdentity(field));
  } else if (
    mutation?.type === "insert" &&
    value.length === previousItems.length + 1 &&
    mutation.index <= previousItems.length
  ) {
    identities = [...(previousIdentities as string[])];
    identities.splice(mutation.index, 0, allocateIdentity(field));
  } else if (
    mutation?.type === "delete" &&
    value.length === previousItems.length - 1 &&
    mutation.index < previousItems.length
  ) {
    identities = [...(previousIdentities as string[])];
    identities.splice(mutation.index, 1);
  } else if (value.length === previousItems.length) {
    identities = previousIdentities as string[];
  } else {
    // An unknown structural mutation cannot be safely aligned by position.
    // Keep the array atomic for this publish instead of cross-wiring one
    // section's properties onto another section's durable transport identity.
    return value.map((entry, index) =>
      encodeCollaborativeValue(
        entry,
        undefined,
        previousItems[index],
        null,
        allocateIdentity,
      ),
    );
  }

  const previousByIdentity = new Map(
    previousItems.flatMap((entry, index) => {
      const identity = previousIdentities[index];
      return identity ? [[identity, entry] as const] : [];
    }),
  );
  return value.map((entry, index) => {
    const identity = identities[index];
    const previousEntry = previousByIdentity.get(identity);
    const previousValue =
      previousEntry &&
      isRecord(previousEntry) &&
      isSyntheticListItem(previousEntry)
        ? (previousEntry[SYNTHETIC_LIST_ITEM_VALUE] as JsonValue)
        : undefined;
    return syntheticListItem(
      identity,
      encodeCollaborativeValue(
        entry,
        undefined,
        previousValue,
        null,
        allocateIdentity,
      ),
    );
  });
}

function encodeCollaborativeValue(
  value: unknown,
  field: string | undefined,
  previous: JsonValue | undefined,
  sectionMutation: CollaborativeDocumentSectionMutation | null,
  allocateIdentity: IdentityAllocator,
): JsonValue {
  if (Array.isArray(value)) {
    if (field && SECTION_LIST_FIELDS.has(field)) {
      return encodeSectionList(
        value,
        field,
        previous,
        sectionMutation,
        allocateIdentity,
      );
    }
    const previousItems = Array.isArray(previous) ? previous : [];
    return value.map((entry, index) => {
      const encoded = encodeCollaborativeValue(
        entry,
        undefined,
        previousItems[index],
        null,
        allocateIdentity,
      );
      if (!isRecord(encoded) || typeof encoded.id === "string") {
        return encoded;
      }
      const identity = domainListIdentity(field, encoded);
      return identity ? syntheticListItem(identity, encoded) : encoded;
    });
  }
  if (isRecord(value)) {
    const previousRecord = isRecord(previous) ? previous : {};
    const encoded: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        encoded[key] = encodeCollaborativeValue(
          entry,
          key,
          previousRecord[key] as JsonValue | undefined,
          sectionMutation,
          allocateIdentity,
        );
      }
    }
    return encoded;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
}

function decodeCollaborativeValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => decodeCollaborativeValue(entry));
  }
  if (isRecord(value)) {
    if (isSyntheticListItem(value)) {
      return decodeCollaborativeValue(
        value[SYNTHETIC_LIST_ITEM_VALUE] as JsonValue,
      );
    }
    const decoded: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      decoded[key] = decodeCollaborativeValue(entry as JsonValue);
    }
    return decoded;
  }
  return value;
}

function encodeCollaborativeDocumentAttrs(
  attrs: Readonly<Record<string, unknown>>,
  previous: Readonly<Record<string, JsonValue>>,
  sectionMutation: CollaborativeDocumentSectionMutation | null,
  allocateIdentity: IdentityAllocator,
): Record<string, JsonValue> {
  const encoded: Record<string, JsonValue> = {};
  for (const key of COLLABORATIVE_DOCUMENT_ATTR_KEYS) {
    const raw = jsonClone(attrs[key]);
    if (raw === undefined) continue;
    encoded[key] = encodeCollaborativeValue(
      key === "commentThreads" ? encodeCollaborativeCommentThreads(raw) : raw,
      key,
      previous[key],
      sectionMutation,
      allocateIdentity,
    );
  }
  return encoded;
}

/** The encoded attributes last read from each map, by the map's revision:
 * typing changes the body, not this map, so a keystroke's publish and the
 * save's projections stop re-reading every catalog from the shared map. The
 * encoded value is internal (read-only); readers get decoded copies. */
const encodedAttrsCache = new WeakMap<Y.Map<unknown>, { revision: number; encoded: Record<string, JsonValue> }>();

function encodedAttrsFromMap(map: Y.Map<unknown>): Record<string, JsonValue> {
  const revision = yTypeRevision(map);
  const known = encodedAttrsCache.get(map);
  if (revision !== null && known?.revision === revision) return known.encoded;
  const encoded = readEncodedAttrsFromMap(map);
  if (revision !== null && yTypeRevision(map) === revision) {
    encodedAttrsCache.set(map, { revision, encoded });
  }
  return encoded;
}

function readEncodedAttrsFromMap(map: Y.Map<unknown>): Record<string, JsonValue> {
  const raw = yToJson(map);
  if (!isRecord(raw)) return {};
  const encoded: Record<string, JsonValue> = {};
  for (const key of COLLABORATIVE_DOCUMENT_ATTR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      encoded[key] = raw[key] as JsonValue;
    }
  }
  return encoded;
}

function decodeCollaborativeDocumentAttrs(
  encoded: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, unknown>> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(encoded)) {
    decoded[key] = decodeCollaborativeValue(value);
  }
  return Object.freeze(decoded);
}

function needsStructuredSeed(
  map: Y.Map<unknown>,
  next: Readonly<Record<string, JsonValue>>,
): boolean {
  return Object.entries(next).some(([key, value]) => {
    if (value === null || typeof value !== "object") return false;
    const current = map.get(key);
    return !(current instanceof Y.Map) && !(current instanceof Y.Array);
  });
}

function changedDocumentAttrs(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): CollaborativeDocumentAttrsPatch {
  const values: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const key of COLLABORATIVE_DOCUMENT_ATTR_KEYS) {
    const had = Object.prototype.hasOwnProperty.call(previous, key);
    const has = Object.prototype.hasOwnProperty.call(next, key);
    if (had && !has) {
      removed.push(key);
      continue;
    }
    if (
      has &&
      (!had || !jsonEquals(previous[key] as JsonValue, next[key] as JsonValue))
    ) {
      values[key] = jsonClone(next[key]);
    }
  }
  return { values: Object.freeze(values), removed };
}

function writeCollaborativeDocumentAttrs(
  map: Y.Map<unknown>,
  next: Readonly<Record<string, JsonValue>>,
  previous: Readonly<Record<string, JsonValue>>,
): boolean {
  const seedStructured = needsStructuredSeed(map, next);
  if (!seedStructured && jsonEquals(previous, next)) return false;
  let touched = seedStructured;
  const write = () => {
    if (seedStructured) applyJsonToYMap(map, next);
    else touched = applyJsonDelta(map, next, previous);
  };
  if (map.doc) map.doc.transact(write, LOCAL_DOCUMENT_ATTRS_ORIGIN);
  else write();
  return touched;
}

export function readCollaborativeDocumentAttrs(
  map: Y.Map<unknown>,
): Readonly<Record<string, unknown>> {
  return decodeCollaborativeDocumentAttrs(encodedAttrsFromMap(map));
}

export function publishCollaborativeDocumentAttrs(
  map: Y.Map<unknown>,
  attrs: Readonly<Record<string, unknown>>,
  sectionMutation?: CollaborativeDocumentSectionMutation | null,
): boolean {
  const previous = encodedAttrsFromMap(map);
  const previousDecoded = decodeCollaborativeDocumentAttrs(previous);
  const protectedAttrs = repairPreserveOnlyCommentMedia(previousDecoded, attrs);
  const next = encodeCollaborativeDocumentAttrs(
    protectedAttrs,
    previous,
    sectionMutation ?? null,
    identityAllocator(map),
  );
  return writeCollaborativeDocumentAttrs(map, next, previous);
}

export function bindCollaborativeDocumentAttrs(
  ydoc: Y.Doc,
  onRemotePatch: (patch: CollaborativeDocumentAttrsPatch) => void,
): CollaborativeDocumentAttrsBinding {
  if (!ydoc || typeof ydoc.getMap !== "function") {
    return {
      hasState: false,
      read: () => Object.freeze({}),
      publish: () => false,
      materialize: () => false,
      dispose: () => undefined,
    };
  }
  const map = ydoc.getMap<unknown>(COLLABORATIVE_DOCUMENT_ATTRS_MAP);
  const allocateIdentity = identityAllocator(map);
  let previousEncoded = encodedAttrsFromMap(map);
  // Every key typed publishes the attributes and almost never changes one:
  // the very values asked for last time, against the same map, write nothing,
  // and encoding them again was ~8 ms a key on a document with a large style
  // table. Whatever changes the map from elsewhere forgets both.
  let lastAsked: Readonly<Record<string, unknown>> | null = null;
  let lastRead: Readonly<Record<string, unknown>> | null = null;
  const sameValues = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
  };
  const observer = (_events: Y.YEvent<never>[], transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_DOCUMENT_ATTRS_ORIGIN) return;
    lastAsked = null;
    lastRead = null;
    let nextEncoded = encodedAttrsFromMap(map);
    let nextDecoded = decodeCollaborativeDocumentAttrs(nextEncoded);
    const previousDecoded = decodeCollaborativeDocumentAttrs(previousEncoded);
    const repairedDecoded = repairPreserveOnlyCommentMedia(
      previousDecoded,
      nextDecoded,
    );
    if (!jsonEquals(nextDecoded as JsonValue, repairedDecoded as JsonValue)) {
      const repairedEncoded = encodeCollaborativeDocumentAttrs(
        repairedDecoded,
        previousEncoded,
        null,
        allocateIdentity,
      );
      writeCollaborativeDocumentAttrs(map, repairedEncoded, nextEncoded);
      nextEncoded = encodedAttrsFromMap(map);
      nextDecoded = decodeCollaborativeDocumentAttrs(nextEncoded);
    }
    const patch = changedDocumentAttrs(previousDecoded, nextDecoded);
    previousEncoded = nextEncoded;
    if (Object.keys(patch.values).length > 0 || patch.removed.length > 0) {
      onRemotePatch(patch);
    }
  };
  map.observeDeep(observer as never);
  const publish = (
    attrs: Readonly<Record<string, unknown>>,
    sectionMutation?: CollaborativeDocumentSectionMutation | null,
  ) => {
    if (!sectionMutation && lastAsked && sameValues(attrs, lastAsked)) return false;
    lastAsked = sectionMutation ? null : attrs;
    const previousDecoded = decodeCollaborativeDocumentAttrs(previousEncoded);
    const protectedAttrs = repairPreserveOnlyCommentMedia(
      previousDecoded,
      attrs,
    );
    const nextEncoded = encodeCollaborativeDocumentAttrs(
      protectedAttrs,
      previousEncoded,
      sectionMutation ?? null,
      allocateIdentity,
    );
    const touched = writeCollaborativeDocumentAttrs(
      map,
      nextEncoded,
      previousEncoded,
    );
    previousEncoded = nextEncoded;
    if (touched) lastRead = null;
    return touched;
  };
  return {
    hasState: map.size > 0,
    read: () => (lastRead ??= readCollaborativeDocumentAttrs(map)),
    publish,
    materialize: (attrs) => {
      const missing = COLLABORATIVE_DOCUMENT_ATTR_KEYS.filter(
        (key) =>
          attrs[key] !== undefined &&
          !Object.prototype.hasOwnProperty.call(previousEncoded, key),
      );
      if (missing.length === 0 && !needsStructuredSeed(map, previousEncoded)) {
        return false;
      }
      const requested: Record<string, unknown> = {
        ...decodeCollaborativeDocumentAttrs(previousEncoded),
      };
      for (const key of missing) requested[key] = attrs[key];
      return publish(requested);
    },
    dispose: () => map.unobserveDeep(observer as never),
  };
}
