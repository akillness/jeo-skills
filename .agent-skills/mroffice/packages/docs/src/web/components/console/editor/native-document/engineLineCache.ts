/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The engine's line corrections of a block, kept by its node (text engine on,
 * documentEngineLineBreaks).
 *
 * The page ledger moves blocks from sheet to sheet many times while a long
 * document opens; each move replaces the block, drops its corrections and
 * makes the line pass read it again: R286-D01 opened with the engine on spent
 * 26.5 s in that pass (24 s measuring blocks), most of it on blocks it had
 * already measured, unchanged, at the same width. A block whose drawn lines
 * agreed with the engine's is the same block when it lands: the same node
 * (content, marks and attributes), drawn as wide, in the same faces, under the
 * same document attributes and the same kind of parent. Its corrections are
 * put back from here, without reading the page.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { newFontFacesOf } from "@mrnote/core/web/lib/font-face-news.ts";

/** What the lines of a block depend on besides the node itself. */
export interface EngineLineKey {
  /** The block's drawn width, px. */
  readonly width: number;
  /** The engine's faces (textEngineEpoch). */
  readonly epoch: string;
  /** The document's attributes (compatibility mode, styles), by identity. */
  readonly docAttrs: unknown;
  /** The parent the block inherits from: a sheet (any), or a cell or list
   * item by its attributes' identity. */
  readonly parent: unknown;
}

/** A correction span, its positions relative to the block's start. */
export interface CachedSpan {
  readonly from: number;
  readonly to: number;
  readonly [field: string]: unknown;
}

interface Entry {
  readonly key: EngineLineKey;
  readonly spans: readonly CachedSpan[];
  /** The families the block's runs name, with the faces of each the browser
   * had settled when it was measured (FamilyNews). */
  readonly faces: ReadonlyArray<readonly [string, number]>;
  /** Where the block's lines after its first start in its content
   * (fragmentOf), when they are known. */
  readonly starts?: readonly number[];
}

/** A block's lines taken from the block it was cut from (fragmentOf). */
export interface EngineLineFragment<T> {
  /** The block it was cut from. */
  readonly whole: ProseMirrorNode;
  /** Where in the whole's content the fragment starts. */
  readonly offset: number;
  /** The whole's spans from there on, at the fragment's position. */
  readonly spans: T[];
  /** The fragment's own line starts after its first line. */
  readonly starts: number[];
  /** The families the whole's runs name. */
  readonly families: string[];
}

/** Attributes a page cut gives a block's tail and nothing else: the tail of
 * a block is drawn as the block is from its cut on, its first line without
 * the first-line indent (the continuation's text-indent: 0). */
const TAIL_ONLY_ATTRS: ReadonlySet<string> = new Set(["pageSplitContinuation", "pageSplitPieceOf"]);

/** Attributes a page cut gives a block's head and nothing else: the head is
 * drawn as the block is up to its cut, marked as continuing on the next page
 * (its closing break's blank row hidden, as Word ends the line there). */
const HEAD_ONLY_ATTRS: ReadonlySet<string> = new Set(["pageSplitContinues", "pageSplitPieceOf"]);

function sameAttrsButTail(whole: ProseMirrorNode, tail: ProseMirrorNode, only: ReadonlySet<string> = TAIL_ONLY_ATTRS): boolean {
  const a = whole.attrs as Record<string, unknown>;
  const b = tail.attrs as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (only.has(key)) continue;
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (x && y && typeof x === "object" && typeof y === "object" && JSON.stringify(x) === JSON.stringify(y)) continue;
    return false;
  }
  return true;
}








export interface FamilyNews {
  count(family: string): number;
}

const familyNewsByDocument = new WeakMap<Document, FamilyNews>();

export function normalizeFamily(family: string): string {
  return family.replace(/["']/g, "").trim().toLowerCase();
}

export function familyNews(document: Document): FamilyNews {
  const known = familyNewsByDocument.get(document);
  if (known) return known;
  const counts = new Map<string, number>();
  const news: FamilyNews = { count: (family) => counts.get(normalizeFamily(family)) ?? 0 };
  const onSettled = (event: Event) => {
    const faces = newFontFacesOf(event) ?? (event as Event & { fontfaces?: ReadonlyArray<{ family?: string }> }).fontfaces ?? [];
    for (const face of faces) {
      if (!face.family) continue;
      const family = normalizeFamily(face.family);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  };
  document.fonts?.addEventListener?.("loadingdone", onSettled);
  document.fonts?.addEventListener?.("loadingerror", onSettled);
  familyNewsByDocument.set(document, news);
  return news;
}

const WIDTH_EPSILON_PX = 0.01;

function sameFaces(entry: Entry, news: FamilyNews): boolean {
  return entry.faces.every(([family, count]) => news.count(family) === count);
}

function sameKey(a: EngineLineKey, b: EngineLineKey): boolean {
  return a.epoch === b.epoch && a.docAttrs === b.docAttrs &&
    a.parent === b.parent && Math.abs(a.width - b.width) <= WIDTH_EPSILON_PX;
}

export interface EngineLineCache {
  /** The block's spans at `pos`, when it was measured as it is now. */
  lookup<T extends { from: number; to: number }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): T[] | null;
  /** Keep the spans of a block at `pos` whose drawn lines agreed, with the
   * families its runs name. */
  store<T extends { from: number; to: number }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, spans: readonly T[], families: readonly string[], news: FamilyNews, starts?: readonly number[]): void;
  /**
   * The lines of a page cut's tail, from the block it was cut from, when the
   * cut fell where one of that block's lines starts: a cut changes no line
   * after it (the tail is laid out at the same width, from a line start,
   * its first line no wider than the whole's later lines), so the tail's
   * lines are the whole's from there on. Kept only from a block whose drawn
   * lines agreed, measured as the tail is now (key and faces), and for a
   * tail (pageSplitContinuation) of the same content and attributes.
   */
  fragmentOf<T extends { from: number; to: number; tabBreak?: boolean }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): EngineLineFragment<T> | null;
  /**
   * The lines of a page cut's head, from the block it was cut from, when the
   * cut fell where one of that block's lines starts: a cut changes no line
   * before it (the head is laid out at the same width, from the same start),
   * so the head's lines are the whole's up to there. Kept only from a block
   * whose drawn lines agreed, measured as the head is now (key and faces),
   * and for a head (pageSplitContinues) of the same content and attributes.
   * `offset` is 0: the head starts where the whole does.
   */
  headOf<T extends { from: number; to: number; tabBreak?: boolean }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): EngineLineFragment<T> | null;
  forget(node: ProseMirrorNode): void;
  /** Why `lookup` found nothing for a block (probes): "node" (never kept),
   * or the first part of the key that differed. */
  missReason(node: ProseMirrorNode, key: EngineLineKey, news: FamilyNews): string;
}

export function createEngineLineCache(): EngineLineCache {
  const entries = new WeakMap<ProseMirrorNode, Entry>();
  /** The last block stored that ends with this child (a tail keeps its
   * whole's last child: Fragment.cut keeps the children it does not cut). */
  const byLastChild = new WeakMap<ProseMirrorNode, ProseMirrorNode>();
  /** The last block stored that starts with this child (a head keeps its
   * whole's first child when the cut is past it). */
  const byFirstChild = new WeakMap<ProseMirrorNode, ProseMirrorNode>();
  return {
    lookup<T extends { from: number; to: number }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): T[] | null {
      const entry = entries.get(node);
      if (!entry || !sameKey(entry.key, key) || !sameFaces(entry, news)) return null;
      return entry.spans.map((span) => ({ ...span, from: span.from + pos, to: span.to + pos }) as unknown as T);
    },
    store(node, key, pos, spans, families, news, starts) {
      const faces = [...new Set(families.map(normalizeFamily))].map((family) => [family, news.count(family)] as const);
      entries.set(node, { key, faces, spans: spans.map((span) => ({ ...span, from: span.from - pos, to: span.to - pos })), ...(starts?.length ? { starts } : {}) });
      const last = node.lastChild;
      if (starts?.length && last) byLastChild.set(last, node);
      const first = node.firstChild;
      if (starts?.length && first) byFirstChild.set(first, node);
    },
    fragmentOf<T extends { from: number; to: number; tabBreak?: boolean }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): EngineLineFragment<T> | null {
      if (node.attrs?.pageSplitContinuation !== true) return null;
      const last = node.lastChild;
      const whole = last ? byLastChild.get(last) : undefined;
      if (!whole || whole === node || whole.type !== node.type) return null;
      const entry = entries.get(whole);
      if (!entry?.starts || !sameKey(entry.key, key) || !sameFaces(entry, news)) return null;
      const offset = whole.content.size - node.content.size;
      if (offset <= 0 || !entry.starts.includes(offset)) return null;
      if (!sameAttrsButTail(whole, node) || !whole.content.cut(offset).eq(node.content)) return null;
      // Spans are kept relative to the block's position: content offset c is at 1 + c.
      const spans: T[] = [];
      for (const span of entry.spans) {
        // The whole's own hyphens off (the engine hyphenates it,
        // documentEngineLineBreaks' manualHyphens): its tail's too.
        if ((span as { manualHyphens?: boolean }).manualHyphens) {
          spans.push({ ...span, from: pos + 1, to: pos + 1 } as unknown as T);
          continue;
        }
        if (span.from < 1 + offset) continue;
        // The hyphen that ends the line before the cut is the head's.
        if (span.from === 1 + offset && (span as { hyphen?: boolean }).hyphen) continue;
        // A break before a tab that would open the tail: the tail's first line
        // starts there anyway (and the break would draw an empty line).
        if (span.from === 1 + offset && (span as { tabBreak?: boolean }).tabBreak) return null;
        spans.push({ ...span, from: span.from - offset + pos, to: span.to - offset + pos } as unknown as T);
      }
      return {
        whole, offset, spans,
        starts: entry.starts.filter((start) => start > offset).map((start) => start - offset),
        families: entry.faces.map(([family]) => family),
      };
    },
    headOf<T extends { from: number; to: number; tabBreak?: boolean }>(node: ProseMirrorNode, key: EngineLineKey, pos: number, news: FamilyNews): EngineLineFragment<T> | null {
      if (node.attrs?.pageSplitContinues !== true) return null;
      const first = node.firstChild;
      const whole = first ? byFirstChild.get(first) : undefined;
      if (!whole || whole === node || whole.type !== node.type) return null;
      const entry = entries.get(whole);
      if (!entry?.starts || !sameKey(entry.key, key) || !sameFaces(entry, news)) return null;
      const cut = node.content.size;
      if (cut <= 0 || cut >= whole.content.size || !entry.starts.includes(cut)) return null;
      if (!sameAttrsButTail(whole, node, HEAD_ONLY_ATTRS) || !whole.content.cut(0, cut).eq(node.content)) return null;
      // Spans are kept relative to the block's position: content offset c is at 1 + c.
      const end = 1 + cut;
      const spans: T[] = [];
      for (const span of entry.spans) {
        if (span.from < end && span.to > end) return null;
        if (span.from < end) {
          spans.push({ ...span, from: span.from + pos, to: span.to + pos } as unknown as T);
          continue;
        }
        // The hyphen that ends the line before the cut is the head's.
        if (span.from === end && (span as { hyphen?: boolean }).hyphen) spans.push({ ...span, from: span.from + pos, to: span.to + pos } as unknown as T);
      }
      return {
        whole, offset: 0, spans,
        starts: entry.starts.filter((start) => start < cut),
        families: entry.faces.map(([family]) => family),
      };
    },
    forget(node) {
      entries.delete(node);
    },
    missReason(node, key, news) {
      const entry = entries.get(node);
      if (!entry) return "node";
      const kept = entry.key;
      if (!sameFaces(entry, news)) return "faces";
      if (kept.epoch !== key.epoch) return "epoch";
      if (kept.docAttrs !== key.docAttrs) return "docAttrs";
      if (kept.parent !== key.parent) return "parent";
      if (Math.abs(kept.width - key.width) > WIDTH_EPSILON_PX) return "width";
      return "same";
    },
  };
}
