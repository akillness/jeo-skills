/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { pageDocumentJsonEquals } from "../../../../lib/page-save-acknowledgement";

export const WHITEBOARD_OBJECT_NODE = "whiteboardObject";
export const WHITEBOARD_SCENE_META = "mrai.whiteboard.scene";

// Excalidraw's authored fields get independent Y.XmlElement attributes. Arrays
// such as a path's points remain one property; unknown extension data is kept
// opaque rather than discarded by the editor schema.
export const WHITEBOARD_OBJECT_FIELDS = [
  "type", "x", "y", "width", "height", "angle", "strokeColor", "backgroundColor",
  "fillStyle", "strokeWidth", "strokeStyle", "roundness", "roughness", "opacity",
  "seed", "version", "versionNonce", "index", "isDeleted", "groupIds", "frameId",
  "boundElements", "updated", "link", "locked", "customData", "fontSize", "fontFamily",
  "text", "textAlign", "verticalAlign", "containerId", "originalText", "autoResize",
  "lineHeight", "points", "lastCommittedPoint", "startBinding", "endBinding",
  "startArrowhead", "endArrowhead", "elbowed", "fixedSegments", "startIsSpecial",
  "endIsSpecial", "pressures", "simulatePressure", "fileId", "status", "scale", "crop",
  "name", "strokeSharpness", "baseline",
] as const;
const fields = new Set<string>(WHITEBOARD_OBJECT_FIELDS);
const EXTRA = "extraFields";
type Property = readonly [unknown, number, string, true?];
export type WhiteboardElement = Record<string, unknown> & { id: string };
type ObjectEntry = { id: string; properties: Map<string, Property> };
const objectNodeCache = new WeakMap<ProseMirrorNode, ObjectEntry>();
const elementCache = new WeakMap<ObjectEntry, WhiteboardElement>();
const sceneNodeCache = new WeakMap<ProseMirrorNode, { entries: ObjectEntry[]; elements: WhiteboardElement[] }>();
const hasSceneCache = new WeakMap<ProseMirrorNode, boolean>();

export function documentHasWhiteboardScene(node: ProseMirrorNode | undefined): boolean {
  if (!node || typeof node.forEach !== "function") return false;
  const cached = hasSceneCache.get(node);
  if (cached !== undefined) return cached;
  let found = node.type.name === "whiteboard";
  if (!found) node.forEach(child => { if (!found) found = documentHasWhiteboardScene(child); });
  hasSceneCache.set(node, found);
  return found;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function scene(value: unknown): WhiteboardElement[] {
  if (!Array.isArray(value) || value.some(element => !record(element) ||
      typeof element.id !== "string" || !element.id)) throw new Error("Invalid whiteboard scene");
  return value as WhiteboardElement[];
}
function property(value: unknown): Property | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4) ||
      (value.length === 4 && value[3] !== true) ||
      !Number.isSafeInteger(value[1]) || value[1] < 0 || typeof value[2] !== "string") {
    throw new Error("Invalid whiteboard property");
  }
  return value as unknown as Property;
}
function preferred(a: Property, b: Property): Property {
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b;
  if (a[2] !== b[2]) return a[2] > b[2] ? a : b;
  const left = propertyValueKey(a[0]), right = propertyValueKey(b[0]);
  if (left !== right) return left > right ? a : b;
  return a[3] ? a : b;
}

/** JSON insertion order and runtime number spelling are not author intent.
 * Resolve a rare revision/author collision identically in browsers and Yrs. */
function propertyValueKey(value: unknown, depth = 0): string {
  if (depth > 256) throw new Error("Whiteboard property nesting limit");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid whiteboard number");
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, false);
    return `n${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  if (Array.isArray(value)) return `[${value.map(item => propertyValueKey(item, depth + 1)).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${propertyValueKey(value[key], depth + 1)}`).join(",")}}`;
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  throw new Error("Invalid whiteboard property");
}
function elementProperties(element: WhiteboardElement): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null);
  const extra: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(element)) {
    if (key === "id" || value === undefined) continue;
    if (fields.has(key)) values[key] = value;
    else extra[key] = value;
  }
  if (Object.keys(extra).length) values[EXTRA] = extra;
  return values;
}
function objectJson(element: WhiteboardElement, revision = 0, author = ""): JSONContent {
  const attrs: Record<string, unknown> = { id: element.id };
  for (const [key, value] of Object.entries(elementProperties(element))) {
    attrs[key] = [clone(value), revision, author];
  }
  return { type: WHITEBOARD_OBJECT_NODE, attrs };
}
function readObjects(children: readonly JSONContent[]): ObjectEntry[] {
  const byId = new Map<string, ObjectEntry>();
  for (const child of children) {
    if (child.type !== WHITEBOARD_OBJECT_NODE || !record(child.attrs) ||
        typeof child.attrs.id !== "string" || !child.attrs.id) {
      throw new Error("Invalid whiteboard object");
    }
    const id = child.attrs.id;
    const entry = byId.get(id) ?? { id, properties: new Map<string, Property>() };
    byId.set(id, entry);
    for (const key of [...WHITEBOARD_OBJECT_FIELDS, EXTRA]) {
      const value = property(child.attrs[key]);
      if (value === null) continue;
      const previous = entry.properties.get(key);
      entry.properties.set(key, previous ? preferred(previous, value) : value);
    }
  }
  return [...byId.values()];
}
function materialize(entries: readonly ObjectEntry[]): WhiteboardElement[] {
  const result = entries.map(entry => {
    const cached = elementCache.get(entry);
    if (cached) return cached;
    const extraProperty = entry.properties.get(EXTRA);
    const extra = extraProperty?.[3] ? undefined : extraProperty?.[0];
    const value: WhiteboardElement = { ...(record(extra) ? clone(extra) : {}), id: entry.id };
    for (const [key, item] of entry.properties) {
      if (key !== EXTRA && !item[3]) value[key] = clone(item[0]);
    }
    elementCache.set(entry, value);
    return value;
  });
  // Excalidraw assigns fractional indices to scene order. Missing indices are
  // retained in their native order for old saved diagrams.
  if (result.every(element => typeof element.index === "string")) {
    result.sort((a, b) => a.index === b.index ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      : (a.index as string) < (b.index as string) ? -1 : 1);
  }
  return result;
}
function readNodeObjects(node: ProseMirrorNode) {
  const cached = sceneNodeCache.get(node);
  if (cached) return cached;
  const byId = new Map<string, ObjectEntry>();
  node.forEach(child => {
    let entry = objectNodeCache.get(child);
    if (!entry) {
      entry = readObjects([child.toJSON() as JSONContent])[0];
      objectNodeCache.set(child, entry);
    }
    const previous = byId.get(entry.id);
    if (!previous) { byId.set(entry.id, entry); return; }
    const combined: ObjectEntry = { id: entry.id, properties: new Map(previous.properties) };
    for (const [key, value] of entry.properties) {
      const prior = combined.properties.get(key);
      combined.properties.set(key, prior ? preferred(prior, value) : value);
    }
    byId.set(entry.id, combined);
  });
  const entries = [...byId.values()];
  const result = { entries, elements: materialize(entries) };
  sceneNodeCache.set(node, result);
  return result;
}
/** Stable read-only model view. The canvas receives a deep copy because its
 * element mutators must never change this comparison baseline. */
export function readWhiteboardScene(node: ProseMirrorNode | JSONContent): WhiteboardElement[] {
  if (typeof (node as ProseMirrorNode).toJSON === "function") {
    const pm = node as ProseMirrorNode;
    return pm.childCount ? readNodeObjects(pm).elements : scene(pm.attrs.elements ?? []);
  }
  const json = node as JSONContent;
  if (json.content?.length) return materialize(readObjects(json.content));
  return scene(json.attrs?.elements ?? []);
}
function transform<T>(value: T, hydrate: boolean): T {
  if (!record(value)) return value;
  if (value.type === "whiteboard") {
    const node = value as JSONContent;
    if (hydrate) {
      if (node.content?.length) { readObjects(node.content); return value; }
      const elements = scene(node.attrs?.elements ?? []);
      if (!elements.length) return value;
      return { ...node, attrs: { ...node.attrs, elements: [] },
        content: elements.map(element => objectJson(element)) } as T;
    }
    if (!node.content?.length) return value;
    const rest = { ...node };
    delete rest.content;
    return { ...rest, attrs: { ...node.attrs, elements: readWhiteboardScene(node) } } as T;
  }
  if (!Array.isArray(value.content)) return value;
  const content = value.content.map(child => transform(child, hydrate));
  return content.some((child, index) => child !== (value.content as unknown[])[index])
    ? { ...value, content } as T : value;
}
export function hydrateWhiteboardScenes<T>(value: T): T { return transform(value, true); }
export function serializeWhiteboardScenes<T>(value: T): T { return transform(value, false); }

/** Apply only fields actually changed in this canvas; never copy its stale
 * full scene over newly received peer fields or objects. */
export function mergeWhiteboardSceneDelta(
  current: readonly WhiteboardElement[], before: readonly WhiteboardElement[], after: readonly WhiteboardElement[],
): WhiteboardElement[] {
  const old = new Map(before.map(element => [element.id, element]));
  const next = new Map(after.map(element => [element.id, element]));
  const result = new Map(current.map(element => [element.id, element]));
  for (const [id, value] of next) {
    const previous = old.get(id);
    if (!previous) { if (!result.has(id)) result.set(id, value); continue; }
    if (pageDocumentJsonEquals(previous, value)) continue;
    const live = result.get(id);
    if (!live) continue;
    const merged: WhiteboardElement = Object.assign(Object.create(null), live);
    for (const key of new Set([...Object.keys(previous), ...Object.keys(value)])) {
      if (key === "id" || pageDocumentJsonEquals(previous[key], value[key])) continue;
      if (Object.prototype.hasOwnProperty.call(value, key)) merged[key] = value[key];
      else delete merged[key];
    }
    result.set(id, merged);
  }
  for (const [id, previous] of old) {
    if (next.has(id) || !result.has(id)) continue;
    result.set(id, { ...result.get(id)!, isDeleted: true,
      version: Number(previous.version ?? 0) + 1 });
  }
  return [...result.values()];
}

export function commitWhiteboardScene(
  editor: Editor, getPos: () => number | undefined, expected: ProseMirrorNode,
  before: readonly WhiteboardElement[], after: readonly WhiteboardElement[],
  background: { before: unknown; after: unknown }, author: string,
): WhiteboardElement[] | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  let pos: number | undefined;
  try { pos = getPos(); } catch { return null; }
  if (typeof pos !== "number") return null;
  const target = editor.state.doc.nodeAt(pos);
  if (!target || target.type.name !== "whiteboard") return null;
  const id = expected.attrs.block_id;
  // Native collaboration keeps the editor bound to one page session. Allow
  // its same-block peer updates; noncollaborative page reuse keeps the exact
  // node guard so a delayed gesture cannot cross a full-document replacement.
  if (target !== expected && (!ySyncPluginKey.getState(editor.state)?.binding ||
      typeof id !== "string" || !id || target.attrs.block_id !== id)) return null;
  scene([...before]); scene([...after]);
  const objectType = editor.schema.nodes[WHITEBOARD_OBJECT_NODE];
  if (!objectType) return null;
  let current = readWhiteboardScene(target);
  let merged = mergeWhiteboardSceneDelta(current, before, after);
  const changedBackground = !pageDocumentJsonEquals(background.before, background.after);
  if (pageDocumentJsonEquals(current, merged) && !changedBackground) return current;
  let tr = editor.state.tr;
  let live = target;
  if (!live.childCount) {
    const initial = Fragment.fromArray(current.map(element => objectType.create(objectJson(element).attrs)));
    tr = tr.replaceWith(pos + 1, pos + live.nodeSize - 1, initial)
      .setNodeMarkup(pos, undefined, { ...live.attrs, elements: [] });
    // Upgrading representation is not the gesture being undone. Otherwise an
    // Undo after a peer edit could remove untouched baseline objects while
    // keeping only the peer-edited child alive.
    tr.setMeta("addToHistory", false).setMeta(WHITEBOARD_SCENE_META, true);
    editor.view.dispatch(tr);
    if (editor.isDestroyed || !editor.isEditable) return null;
    try { pos = getPos(); } catch { return null; }
    if (typeof pos !== "number") return null;
    const migrated = editor.state.doc.nodeAt(pos);
    if (!migrated || migrated.type.name !== "whiteboard" ||
        (typeof id === "string" && id && migrated.attrs.block_id !== id)) return null;
    live = migrated;
    current = readWhiteboardScene(live);
    merged = mergeWhiteboardSceneDelta(current, before, after);
    tr = editor.state.tr;
  }
  const entries = readNodeObjects(live).entries;
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const currentById = new Map(current.map(element => [element.id, element]));
  for (const element of merged) {
    const prior = currentById.get(element.id);
    if (prior === element) continue;
    const data = elementProperties(element);
    if (!entriesById.has(element.id)) {
      const end = pos + tr.doc.nodeAt(pos)!.nodeSize - 1;
      tr = tr.insert(end, objectType.create(objectJson(element, 1, author).attrs));
      continue;
    }
    const previousData = prior ? elementProperties(prior) : {};
    const entry = entriesById.get(element.id)!;
    const updates: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(previousData), ...Object.keys(data)])) {
      if (pageDocumentJsonEquals(previousData[key], data[key])) continue;
      const revision = (entry.properties.get(key)?.[1] ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw new Error("Whiteboard revision limit");
      updates[key] = Object.prototype.hasOwnProperty.call(data, key)
        ? [clone(data[key]), revision, author] : [null, revision, author, true];
    }
    if (!Object.keys(updates).length) continue;
    const board = tr.doc.nodeAt(pos)!;
    board.forEach((child, offset) => {
      if (child.attrs.id === element.id) {
        tr = tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, ...updates });
      }
    });
  }
  if (changedBackground || !pageDocumentJsonEquals(current, merged)) {
    const board = tr.doc.nodeAt(pos)!;
    tr = tr.setNodeMarkup(pos, undefined, { ...board.attrs,
      appState: { viewBackgroundColor: changedBackground ? background.after
        : board.attrs.appState?.viewBackgroundColor ?? background.before ?? "#ffffff" } });
  }
  tr.setMeta(WHITEBOARD_SCENE_META, true);
  editor.view.dispatch(tr);
  return readWhiteboardScene(editor.state.doc.nodeAt(pos)!);
}
