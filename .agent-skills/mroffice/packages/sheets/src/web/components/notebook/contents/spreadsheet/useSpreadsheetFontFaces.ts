"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeOfficeFontFace,
  officeFontFaceFamily,
  type OfficeFontFace,
} from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import {
  fontAssetStatus,
  retainOfficeFontAssets,
  subscribeFontAssetStatus,
} from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import { officePrimaryFontFamily } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { cellMapPermutedSourceKey, cellMapRowPermutation, nearestKnownCellMap } from "@mrnote/core/web/lib/spreadsheet/cell-map-lineage.ts";
import { isMaterializedLineStyleBlank } from "@mrnote/core/web/lib/spreadsheet/line-styles.ts";
import type { SpreadsheetFontNeed } from "./SpreadsheetFontRepair";
import { getPageFontBindings } from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  captureSavedPageHotCacheScope,
  isSavedPageHotCacheScopeCurrent,
} from "@mrnote/core/web/lib/saved-page-hot-cache.ts";
import { subscribeAuthState } from "@mrnote/core/web/lib/auth-state.ts";
import { excelCutFamilyFace, isExcelCutFamily } from "@mrnote/core/web/lib/office-fonts/excel-cut-families.ts";
import { spreadsheetFontStack, type NativeGridFont } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";

export function spreadsheetFontStackWithAssets(
  family: string | undefined,
  aliases?: Readonly<Record<string, string>>,
  traits?: Pick<NativeGridFont, "bold" | "italic"> & { readonly record?: unknown; readonly fontRecord?: unknown },
): string {
  const alias =
    family && aliases?.[officePrimaryFontFamily(family).toLocaleLowerCase()];
  // Resolve availability before choosing the script fallback stack. An asset
  // alias must not inherit the stack chosen for its unavailable source name.
  return spreadsheetFontFamilyWithAssets(
    spreadsheetFontStack(alias || family, traits),
    aliases,
  )!;
}

export function spreadsheetFontFamilyWithAssets(
  family: string | undefined,
  aliases?: Readonly<Record<string, string>>,
): string | undefined {
  if (!family || !aliases || !Object.keys(aliases).length) return family;
  return family
    .split(",")
    .flatMap((token) => {
      // A face the workbook brings its own file of is drawn in that file: the
      // sheet's cut family of its stand-in (excel-cut-families.ts) steps aside.
      if (isExcelCutFamily(token)) return aliases[excelCutFamilyFace(token).toLocaleLowerCase()] ? [] : [token];
      const alias = aliases[officePrimaryFontFamily(token).toLocaleLowerCase()];
      return [alias ? `"${alias}"` : token];
    })
    .join(",");
}

// Editor snapshots are immutable, so what one object asks for is read once:
// a new snapshot shares nearly all its cells and styles with the last, and a
// workbook opening makes several (each block of cells that arrives is one).
// Read whole each time, one open of 100,000 cells called this walk 3.3 million
// times. Values retain only the small font summary, never a sheet or cell map.
const objectFontNeeds = new WeakMap<object, readonly SpreadsheetFontNeed[]>();
const NO_FONT_NEEDS: readonly SpreadsheetFontNeed[] = [];

function mergeFontNeed(needs: Map<string, SpreadsheetFontNeed>, incoming: SpreadsheetFontNeed) {
  const key = incoming.family.toLocaleLowerCase();
  const need = needs.get(key) ?? { family: incoming.family };
  if (incoming.bold) need.bold = true;
  if (incoming.italic) need.italic = true;
  if (incoming.boldItalic) need.boldItalic = true;
  needs.set(key, need);
}

function ownFontNeed(family: unknown, style: Record<string, unknown>): SpreadsheetFontNeed | null {
  if (typeof family !== "string") return null;
  const name = officePrimaryFontFamily(family);
  if (!name || name.length > 200) return null;
  const need: SpreadsheetFontNeed = { family: name };
  const bold = style.bold === true || Number(style.fontWeight) >= 600;
  const italic = style.italic === true || style.fontStyle === "italic";
  if (bold && italic) need.boldItalic = true;
  else if (bold) need.bold = true;
  else if (italic) need.italic = true;
  return need;
}

/** Cell fields a calculation writes: the value it shows, never a face. */
const calculatedCellKeys = new Set(["value", "kind", "formula", "display", "chartValueCache"]);

/**
 * The needs of a cell map recorded as an edit of one already summed up
 * (`recordCellMapEdit`), when its changed cells differ from those before only
 * in what a calculation writes (a sort's save stamping its 2,122 formulas'
 * values): the same as before, without summing up 730,000 cells again.
 */
function inheritedCellMapNeeds(map: object): readonly SpreadsheetFontNeed[] | null {
  if (Array.isArray(map)) return null;
  const sorted = rowSortedCellMapNeeds(map);
  if (sorted) return sorted;
  const found = nearestKnownCellMap(map, (cells) => {
    const summary = objectFontNeeds.get(cells) ?? rowSortedCellMapNeeds(cells);
    return summary ? { summary, cells: cells as Record<string, unknown> } : undefined;
  });
  if (!found || found.keys.length > 4096 || Object.getPrototypeOf(found.value.cells) !== Object.getPrototypeOf(map)) return null;
  for (const key of found.keys) {
    if (!calculationOnlyChange(found.value.cells[key], (map as Record<string, unknown>)[key])) return null;
  }
  return found.value.summary;
}

/** The needs of a row sort's map (`recordCellMapRowPermutation`): the very
 * cells of the map before, at new keys, but those whose formula it rewrote. */
function rowSortedCellMapNeeds(map: object): readonly SpreadsheetFontNeed[] | null {
  const record = cellMapRowPermutation(map);
  const summary = record && objectFontNeeds.get(record.before);
  if (!record || !summary || Object.getPrototypeOf(record.before) !== Object.getPrototypeOf(map)) return null;
  for (const key of record.permutation.relocated) {
    const at = key.indexOf(":");
    const source = cellMapPermutedSourceKey(record.permutation, Number(key.slice(0, at)), Number(key.slice(at + 1)));
    if (!calculationOnlyChange((record.before as Record<string, unknown>)[source], (map as Record<string, unknown>)[key])) return null;
  }
  objectFontNeeds.set(map, summary);
  return summary;
}

/** Whether two cells differ at most in what a calculation writes, which holds no face. */
function calculationOnlyChange(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  const scalar = (field: unknown) => field === null || typeof field !== "object";
  const plain = (cell: unknown): cell is Record<string, unknown> =>
    cell !== null && typeof cell === "object" && !Array.isArray(cell) && Object.getPrototypeOf(cell) === Object.prototype;
  if (!plain(before) || !plain(after) || isMaterializedLineStyleBlank(before) !== isMaterializedLineStyleBlank(after)) return false;
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[field] === after[field]) continue;
    if (!calculatedCellKeys.has(field)) return false;
    for (const side of [before[field], after[field]]) {
      if (scalar(side)) continue;
      // A value's cache ({ kind, source, value }) holds no face.
      if (!plain(side) || !Object.values(side).every(scalar)) return false;
    }
  }
  return true;
}

function fontNeedsOf(value: object): readonly SpreadsheetFontNeed[] {
  const known = objectFontNeeds.get(value);
  if (known) return known;
  const inherited = inheritedCellMapNeeds(value);
  if (inherited) {
    objectFontNeeds.set(value, inherited);
    return inherited;
  }
  let needs: Map<string, SpreadsheetFontNeed> | null = null;
  // A cell's needs are its style's, one summary shared by every cell of that
  // style: each summary is taken in once.
  let only: readonly SpreadsheetFontNeed[] | null = null;
  let taken: Set<readonly SpreadsheetFontNeed[]> | null = null;
  const own = (need: SpreadsheetFontNeed | null) => {
    if (!need) return;
    needs ??= new Map();
    if (only) {
      for (const each of only) mergeFontNeed(needs, each);
      only = null;
    }
    mergeFontNeed(needs, need);
  };
  const child = (item: unknown) => {
    // A blank a line format wrote: its face is the line's, read from the
    // sheet's own line formats beside it.
    if (!item || typeof item !== "object" || isMaterializedLineStyleBlank(item)) return;
    const summary = fontNeedsOf(item);
    if (summary.length === 0 || summary === only) return;
    if (!needs && !only) {
      only = summary;
      return;
    }
    if (taken?.has(summary)) return;
    (taken ??= new Set()).add(summary);
    needs ??= new Map();
    if (only) {
      for (const each of only) mergeFontNeed(needs, each);
      taken.add(only);
      only = null;
    }
    for (const each of summary) mergeFontNeed(needs, each);
  };
  if (Array.isArray(value)) {
    for (const item of value) child(item);
  } else {
    const object = value as Record<string, unknown>;
    own(ownFontNeed(object.fontFamily, object));
    // A shape's (or SmartArt shape's) label carries its own face under the
    // shared shape-font names (`lib/office-shape-text-font`).
    own(ownFontNeed(object.textFontFamily, { bold: object.textBold, italic: object.textItalic }));
    if (object.nativeGrid && typeof object.nativeGrid === "object") {
      const font = (object.nativeGrid as { font?: Record<string, unknown> }).font;
      if (font) {
        own(ownFontNeed(font.family, font));
        own(ownFontNeed(font.headingFamily, {}));
        own(ownFontNeed(font.bodyFamily, {}));
      }
    }
    for (const key of Object.keys(object)) if (key !== "fontFaces") child(object[key]);
  }
  const result: readonly SpreadsheetFontNeed[] = only ?? (needs ? [...(needs as Map<string, SpreadsheetFontNeed>).values()] : NO_FONT_NEEDS);
  objectFontNeeds.set(value, result);
  return result;
}

export function spreadsheetFontNeeds(sheets: readonly unknown[]): SpreadsheetFontNeed[] {
  return fontNeedsOf(sheets as object)
    .map((need) => ({ ...need }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export function cachedSpreadsheetFontNeeds(sheets: readonly unknown[]): SpreadsheetFontNeed[] {
  const needs = new Map<string, SpreadsheetFontNeed>();
  for (const sheet of sheets) {
    if (sheet === null || typeof sheet !== "object") continue;
    for (const incoming of fontNeedsOf(sheet)) mergeFontNeed(needs, incoming);
  }
  return [...needs.values()].sort((a, b) => a.family.localeCompare(b.family));
}

function sameFontRelevantProperties(before: Record<string, unknown>, after: Record<string, unknown>, scalarKeys: ReadonlySet<string>): boolean {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] === after[key]) continue;
    // Unknown objects under value/formula must still be traversed: importing
    // opaque payload is not evidence that it cannot contain font declarations.
    if (!scalarKeys.has(key) ||
        (before[key] !== null && typeof before[key] === "object") ||
        (after[key] !== null && typeof after[key] === "object")) return false;
  }
  return true;
}

const plainCellValueKeys = new Set(["value", "kind", "formula"]);
const cellsOnlyKey = new Set(["cells"]);

/** Call only at the accepted transaction boundary with its complete known keys. */
export function inheritSpreadsheetFontNeeds(
  before: { cells: Record<string, unknown> },
  after: { cells: Record<string, unknown> },
  knownKeys: readonly string[],
): boolean {
  const summary = objectFontNeeds.get(before);
  if (!summary || knownKeys.length > 4096 || Object.getPrototypeOf(before) !== Object.getPrototypeOf(after)) return false;
  // Sheet metadata is opaque and can contain fonts at any depth. Only cells
  // may change here; even a style-equal replacement follows the full scanner.
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (cellsOnlyKey.has(key)) continue;
    if ((before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key]) return false;
  }
  for (const key of knownKeys) {
    const previous = before.cells[key];
    const next = after.cells[key];
    if (previous === next) continue;
    const plainRecord = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === "object" && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    if (previous !== undefined && !plainRecord(previous)) return false;
    if (next !== undefined && !plainRecord(next)) return false;
    if (!sameFontRelevantProperties((previous ?? {}) as Record<string, unknown>, (next ?? {}) as Record<string, unknown>, plainCellValueKeys)) return false;
  }
  objectFontNeeds.set(after, summary);
  return true;
}

export function normalizeSpreadsheetFontFaces(
  raw: unknown,
): OfficeFontFace[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 128) return undefined;
  const faces: OfficeFontFace[] = [];
  const families = new Set<string>();
  for (const value of raw) {
    const face = normalizeOfficeFontFace(value);
    if (
      !face?.asset ||
      face.asset.files.some((file) => !file.attachmentId) ||
      families.has(face.family.toLocaleLowerCase())
    )
      return undefined;
    families.add(face.family.toLocaleLowerCase());
    faces.push(face);
  }
  return faces;
}

/**
 * No faces, as one value: a fresh `[]` on each save's new content version
 * changed the aliases every row paints with and repainted the whole grid.
 */
const NO_FACES: OfficeFontFace[] = [];

/** Register only the current page's checked, explicitly bound font assets. */
export function useSpreadsheetFontFaces(
  raw: unknown,
  pageId: string,
  notebookId: string,
  scopeKey: string,
  contentVersion: number,
  enabled: boolean,
) {
  const key = JSON.stringify(raw ?? []);
  const parsed = useMemo(
    () => normalizeSpreadsheetFontFaces(JSON.parse(key)),
    [key],
  );
  type Proof = {
    key: string;
    scopeKey: string;
    pageId: string;
    notebookId: string;
    version: number;
    auth: ReturnType<typeof captureSavedPageHotCacheScope>;
    faces: OfficeFontFace[];
    complete: boolean;
  };
  const [proof, setProof] = useState<Proof>();
  const proofRef = useRef<Proof | undefined>(undefined);
  const [authRevision, setAuthRevision] = useState(0);
  useEffect(
    () => subscribeAuthState(() => setAuthRevision((value) => value + 1)),
    [],
  );
  useEffect(() => {
    if (
      !enabled ||
      !parsed?.length ||
      !pageId ||
      !notebookId ||
      contentVersion < 1
    ) {
      proofRef.current = undefined;
      setProof(undefined);
      return;
    }
    const previous = proofRef.current;
    if (
      previous?.key === key &&
      previous.scopeKey === scopeKey &&
      previous.pageId === pageId &&
      previous.notebookId === notebookId &&
      previous.version === contentVersion &&
      previous.complete &&
      isSavedPageHotCacheScopeCurrent(previous.auth)
    )
      return;
    const auth = captureSavedPageHotCacheScope(),
      controller = new AbortController();
    // Autosave's `page` may include recovered or peer drafts. A fresh SDK read
    // is the persisted authority; unacknowledged CRDT font IDs cannot fetch bytes.
    void getPageFontBindings(pageId, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted || !isSavedPageHotCacheScopeCurrent(auth))
          return;
        if (
          page.page_id !== pageId ||
          page.notebook_id !== notebookId ||
          page.content_version !== contentVersion
        ) {
          proofRef.current = undefined;
          setProof(undefined);
          return;
        }
        const allowed = new Set(
          (normalizeSpreadsheetFontFaces(page.font_faces) ?? []).map((face) =>
            JSON.stringify(face),
          ),
        );
        const faces = parsed.filter((face) =>
          allowed.has(JSON.stringify(face)),
        );
        // Preserve the identity when the exact binding is acknowledged again.
        const stableFaces =
          previous?.scopeKey === scopeKey &&
          JSON.stringify(previous.faces) === JSON.stringify(faces)
            ? previous.faces
            : faces;
        const next = {
          key,
          scopeKey,
          pageId,
          notebookId,
          version: page.content_version,
          auth,
          faces: stableFaces,
          complete: faces.length === parsed.length,
        };
        proofRef.current = next;
        setProof(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          proofRef.current = undefined;
          setProof(undefined);
        }
      });
    return () => controller.abort();
  }, [
    key,
    parsed,
    pageId,
    notebookId,
    scopeKey,
    contentVersion,
    enabled,
    authRevision,
  ]);
  const faces = useMemo(
    () =>
      proof?.key === key &&
      proof.scopeKey === scopeKey &&
      proof.pageId === pageId &&
      proof.notebookId === notebookId &&
      isSavedPageHotCacheScopeCurrent(proof.auth) &&
      // A normal save changes the version, not these already checked bytes.
      // Keep the existing lease while its identical binding is rechecked;
      // the effect above still requires the fresh version before accepting a
      // new proof. Different IDs/hashes/page/auth never inherit this display.
      proof.version <= contentVersion &&
      enabled
        ? proof.faces
        : NO_FACES,
    [
      proof,
      key,
      scopeKey,
      pageId,
      notebookId,
      contentVersion,
      enabled,
      authRevision,
    ],
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !faces.length) return;
    const stop = subscribeFontAssetStatus(() =>
      setRevision((value) => value + 1),
    );
    const release = retainOfficeFontAssets(
      faces.flatMap((face) => (face.asset ? [face.asset] : [])),
      document,
    );
    return () => {
      stop();
      release();
    };
  }, [faces, scopeKey, enabled]);
  const signature = useMemo(() => {
    const aliases: Record<string, string> = {};
    let unavailable = parsed === undefined || parsed.length !== faces.length;
    if (enabled && typeof document !== "undefined")
      for (const face of faces) {
        if (face.asset && fontAssetStatus(face.asset) === "available")
          aliases[face.family.toLocaleLowerCase()] = officeFontFaceFamily(face);
        else unavailable = true;
      }
    return JSON.stringify([aliases, unavailable]);
  }, [faces, parsed, enabled, revision, scopeKey]);
  // Every row paints with these aliases: the same answer keeps its identity,
  // so a save that only flips `enabled` for a moment (loading, a retried
  // error) or a font status event that changes nothing does not repaint the
  // grid.
  return useMemo(() => {
    const [aliases, unavailable] = JSON.parse(signature) as [Record<string, string>, boolean];
    return { aliases, unavailable, faces };
  }, [signature, faces]);
}
