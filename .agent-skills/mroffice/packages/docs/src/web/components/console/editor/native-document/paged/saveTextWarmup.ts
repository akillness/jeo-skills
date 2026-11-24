/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { JSONContent } from "@tiptap/core";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { inkWritingActive } from "@mrnote/core/web/lib/ink-writing-session.ts";
import { inkPointerArbiter } from "@mrnote/core/web/lib/ink-pointer-policy.ts";
import { warmYDocStateEncoding } from "@mrnote/core/web/lib/collab/y-state-encoder.ts";
import { externalizePageDraftBlobs } from "@mrnote/core/web/lib/page-draft-blob-store.ts";
import { warmPageDraftBlockText } from "@mrnote/core/web/lib/page-draft-segments.ts";
import { warmDocumentProjectionBlocks, warmMirroredBlock } from "@mrnote/core/web/lib/collab/document-page-causal-model.ts";
import { warmNamedBodyBlock } from "@mrnote/core/web/lib/collab/page-causal-named-body.ts";
import { keptBlockJson, runtimeDocumentJson } from "@mrnote/core/web/__cut__/m2c7d818b46.ts";
import { warmPageBlockLayoutInput } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { contentLayoutInputKept, stableProjectionJson, withProjectionJsonMemo } from "@mrnote/core/web/components/console/editor/native-document/paged/projectionJsonMemo.ts";

/** Quiet time after a change of the document before reading resumes. */
const QUIET_MS = 1200;
/** Longest stretch of reading in one task. */
const SLICE_MS = 4;
/** Between steps of keeping the room's encoded state. */
const ROOM_RETRY_MS = 16;
/** Retry while a stroke is being drawn. */
const PEN_RETRY_MS = 100;
/** While writing: from this long after a stroke ends, one slice a frame. */
const AFTER_STROKE_MS = 300;
const WRITING_STEP_MS = 16;

export const saveTextWarmupKey = new PluginKey("saveTextWarmup");

type WarmWindow = Window & { __mraiNoSaveWarm?: boolean; __mraiNoYEncodeWarm?: boolean; __mraiNoDraftWarm?: boolean };

function warmupWanted(): boolean {
  return typeof window !== "undefined" && !(window as WarmWindow).__mraiNoSaveWarm;
}

function draftWarmupWanted(): boolean {
  return typeof window !== "undefined" && !(window as WarmWindow).__mraiNoDraftWarm;
}

/** What a draft keeps of a frozen block, kept ahead: its JSON text
 * (page-draft-segments), and that it holds no string the draft would store
 * apart (page-draft-blob-store, from depth 0, which holds for any depth the
 * draft reads it at). Each is what those keep themselves. */
export function warmDraftBlock(block: object): void {
  warmPageDraftBlockText(block);
  externalizePageDraftBlobs(block, "warm");
}

function roomWarmupWanted(): boolean {
  return typeof window !== "undefined" && !(window as WarmWindow).__mraiNoYEncodeWarm;
}

/** The blocks of the flat document the save reads: a sheet's children, or a
 * top-level block of a document without sheets. Only frozen JSON is kept. */
export function saveBlocksToWarm(doc: PmNode): object[] {
  const json = runtimeDocumentJson(doc);
  const blocks: object[] = [];
  for (const top of json.content ?? []) {
    if (top.type === PAGE_BLOCK_NODE && Array.isArray(top.content)) {
      for (const child of top.content as JSONContent[]) if (Object.isFrozen(child)) blocks.push(child);
    } else if (Object.isFrozen(top)) blocks.push(top);
  }
  return blocks;
}

/** The block nodes of a document whose JSON the save reads (as
 * saveBlocksToWarm, before their JSON is made): made a block at a time,
 * the first reading of a large note does not make all of it in one task. */
export function saveBlockNodes(doc: PmNode): PmNode[] {
  const nodes: PmNode[] = [];
  doc.forEach((top) => {
    if (top.type.name === PAGE_BLOCK_NODE) top.forEach((child) => { nodes.push(child); });
    else nodes.push(top);
  });
  return nodes;
}

/** Read up to `budgetMs` of `blocks` from `start`; the index reached. A
 * block given as its node is read as its kept JSON. */
export function warmSaveBlocks(
  blocks: readonly (object | PmNode)[], start: number, budgetMs: number,
  parts: { readonly layout?: boolean; readonly draft?: boolean } = { layout: true, draft: true },
): number {
  const end = performance.now() + budgetMs;
  let index = start;
  withProjectionJsonMemo(() => {
    while (index < blocks.length) {
      const item = blocks[index++];
      const block: object = isBlockNode(item) ? keptBlockJson(item) : item;
      // A block whose layout text is kept was read whole before (the draft's
      // texts with it, or by a save).
      if (contentLayoutInputKept(block)) continue;
      if (parts.draft) {
        try { warmDraftBlock(block); } catch { /* read by the draft as before */ }
      }
      if (parts.layout) {
        warmPageBlockLayoutInput(block);
        // Its stable text too: the pagination receipt a save (and the kept
        // layout receipt, 4 s after the pages settle) captures digests it.
        try { stableProjectionJson(block); } catch { /* serialized by the save as before */ }
      }
      if (performance.now() >= end) break;
    }
  });
  return index;
}

function isBlockNode(value: object | PmNode): value is PmNode {
  return typeof (value as PmNode).forEach === "function" && typeof (value as PmNode).type?.name === "string";
}

/** Slices of the warm-up longer than this are written to a harness's
 * `window.__saveWarmTrace` array, when it made one. */
const TRACE_SLICE_MS = 12;
function traceSlice(phase: string, started: number): void {
  const ms = performance.now() - started;
  if (ms < TRACE_SLICE_MS || typeof window === "undefined") return;
  const sink = (window as Window & { __saveWarmTrace?: unknown[] }).__saveWarmTrace;
  if (Array.isArray(sink)) sink.push(`${Math.round(performance.now())} ${phase} ${Math.round(ms)}`);
}

class SaveTextWarmer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private blocks: PmNode[] | null = null;
  private index = 0;
  private roomDone = false;
  /** The room's projection blocks read ahead so far (-1: done or refused). */
  private projected = 0;
  private editorBlocks: object[] | null = null;

  constructor(private view: EditorView) {
    this.schedule(QUIET_MS);
  }

  update(view: EditorView, previous: { doc: PmNode }): void {
    this.view = view;
    if (view.state.doc === previous.doc) return;
    this.blocks = null;
    this.roomDone = false;
    this.projected = 0;
    this.editorBlocks = null;
    this.schedule(inkWritingActive() ? AFTER_STROKE_MS : QUIET_MS);
  }

  private schedule(ms: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), ms);
  }

  private run(): void {
    this.timer = null;
    if ((!warmupWanted() && !draftWarmupWanted() && !roomWarmupWanted()) || this.view.isDestroyed) return;
    if (inkPointerArbiter.strokeRunning()) {
      this.schedule(PEN_RETRY_MS);
      return;
    }
    const writing = inkWritingActive();
    if (writing) {
      const ended = inkPointerArbiter.lastStrokeEndedAt;
      const since = typeof ended === "number" ? performance.now() - ended : Infinity;
      if (since < AFTER_STROKE_MS) {
        this.schedule(AFTER_STROKE_MS - since);
        return;
      }
    }
    const next = writing ? WRITING_STEP_MS : 0;
    let blocksLeft = false;
    let started = performance.now();
    try {
      if (!this.blocks) {
        this.blocks = saveBlockNodes(this.view.state.doc);
        this.index = 0;
      }
      this.index = warmSaveBlocks(this.blocks, this.index, SLICE_MS, { layout: warmupWanted(), draft: draftWarmupWanted() });
      traceSlice("blocks", started);
      blocksLeft = this.index < this.blocks.length;
      if (!blocksLeft) this.blocks = null;
    } catch {
      // Nothing kept; the save reads the document as before.
      this.blocks = null;
    }
    if (blocksLeft) {
      this.schedule(next);
      return;
    }
    const room = (ySyncPluginKey.getState(this.view.state) as { doc?: Y.Doc } | undefined)?.doc ?? null;
    // The room's projection, block by block, with what the save's digest
    // reads of each (the body it names is the room's), beside the editor's
    // blocks: a save proves its body says what the room does, block by block.
    started = performance.now();
    if (room && this.projected >= 0 && draftWarmupWanted()) {
      const editorBlocks = this.projected === 0 || !this.editorBlocks
        ? (this.editorBlocks = saveBlocksToWarm(this.view.state.doc)) : this.editorBlocks;
      const reached = warmDocumentProjectionBlocks(room, this.projected, SLICE_MS, (block, index) => {
        try { warmNamedBodyBlock(block); } catch { /* digested by the save as before */ }
        warmMirroredBlock(editorBlocks[index], block);
      });
      traceSlice("room", started);
      if (reached >= 0 && reached < room.getXmlFragment("default").length) {
        this.projected = reached;
        this.schedule(next);
        return;
      }
      this.projected = -1;
      this.editorBlocks = null;
    }
    if (this.roomDone || !roomWarmupWanted()) return;
    started = performance.now();
    try {
      this.roomDone = !room || warmYDocStateEncoding(room, SLICE_MS);
    } catch {
      this.roomDone = true;
    }
    traceSlice("encode", started);
    // A room mid-transaction or waiting for updates, or with more to encode:
    // again in a moment (a frame apart, so a waiting room costs nothing).
    if (!this.roomDone) this.schedule(Math.max(next, ROOM_RETRY_MS));
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.blocks = null;
  }
}

export const SaveTextWarmup = Extension.create({
  name: "saveTextWarmup",
  addProseMirrorPlugins() {
    return [new Plugin({ key: saveTextWarmupKey, view: (view) => new SaveTextWarmer(view) })];
  },
});
