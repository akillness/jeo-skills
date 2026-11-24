/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import { createBackgroundLane, runInLane, type BackgroundLane } from "../../../lib/background-work";





const EDITABLE_HUB_SYNC_LIMIT = 256;

function readEditable(editor: Editor | null | undefined): boolean {
  return Boolean(editor && !editor.isDestroyed && editor.isEditable);
}

/**
 * The editor's live write authority, as React state.
 *
 * The Docs host turns editing off and on with `setEditable(value, false)`,
 * which emits no "update": Reading View, a permission change, a page that
 * finished connecting. A component that reads `editor.isEditable` while it
 * renders kept the value from its last render, so the ribbon's Undo stayed
 * pressable in Reading View and did nothing (live Word audit WUA 038).
 * ProseMirror rewrites the surface's `contenteditable` when the option flips,
 * so that is watched; any transaction re-reads it too. The returned value
 * changes, and the caller re-renders, whenever the authority does.
 */
/**
 * Call `listener` whenever the editor's write authority may have changed:
 * any update or transaction, and the surface's `contenteditable` flipping
 * (the Docs host's `setEditable(value, false)` emits no event). For node
 * views and other non-React readers; returns the unsubscribe. A node view
 * that listened to "update" alone kept the authority of its first paint: an
 * equation drawn while the reopened page was still connecting stayed
 * `aria-disabled` after editing came back (live Word audit WUA 063).
 */
export function subscribeEditorSurfaceEditable(
  editor: Editor | null | undefined,
  listener: () => void,
): () => void {
  if (!editor) return () => {};
  const hub = editableHubFor(editor);
  hub.listeners.add(listener);
  hub.watchSurface();
  return () => {
    hub.listeners.delete(listener);
    if (hub.listeners.size === 0) hub.release();
  };
}

/**
 * One set of editor listeners per editor, shared by every subscriber.
 *
 * Each equation of a formula-heavy book is a node view that follows the
 * authority: 10k subscribers each holding their own "transaction" and
 * "update" listeners and their own observer ran 20k callbacks per
 * transaction, and tearing the views down was quadratic (the emitter filters
 * its whole listener array on every `off`). The hub listens once and calls
 * the subscribers only when the authority it reads has actually changed;
 * every subscriber reads its first value itself when it subscribes.
 */
type EditableHub = {
  listeners: Set<() => void>;
  watchSurface: () => void;
  release: () => void;
};

const editableHubs = new WeakMap<Editor, EditableHub>();

function editableHubFor(editor: Editor): EditableHub {
  const existing = editableHubs.get(editor);
  if (existing) return existing;
  const listeners = new Set<() => void>();
  let last = readEditable(editor);
  // A long book turning editable told its ~10k equations at once, each
  // writing its preview's aria-disabled: one task of minutes in Safari
  
  
  // authority itself when told, so a late one is never told a stale value.
  let queue: Array<() => void> = [];
  let lane: BackgroundLane | null = null;
  let draining = false;
  const drain = () => {
    if (draining) return;
    draining = true;
    lane ??= createBackgroundLane({
      label: "editor-write-authority",
      owner: () => (editor.isDestroyed ? null : editor.view.dom),
    });
    void runInLane(lane, (current) => {
      while (queue.length) {
        const listener = queue.shift()!;
        if (listeners.has(listener)) listener();
        if (queue.length && current.shouldYield()) return true;
      }
      return false;
    }).finally(() => {
      draining = false;
      if (queue.length) drain();
    });
  };
  const notify = () => {
    const next = readEditable(editor);
    if (next === last) return;
    last = next;
    const told = Array.from(listeners);
    if (told.length <= EDITABLE_HUB_SYNC_LIMIT || typeof window === "undefined") {
      queue = [];
      for (const listener of told) listener();
      return;
    }
    queue = told;
    drain();
  };
  // Optional so a surface without an emitter (tests, a torn-down editor)
  // only takes the first read.
  const runtime: Partial<Pick<Editor, "on" | "off">> = editor;
  runtime.on?.("transaction", notify);
  runtime.on?.("update", notify);
  let observer: MutationObserver | null = null;
  let watched: HTMLElement | null = null;
  const hub: EditableHub = {
    listeners,
    watchSurface: () => {
      try {
        const dom = editor.isDestroyed ? null : editor.view.dom;
        if (!dom || dom === watched || typeof MutationObserver === "undefined") return;
        observer?.disconnect();
        observer = new MutationObserver(notify);
        observer.observe(dom, { attributes: true, attributeFilter: ["contenteditable"] });
        watched = dom;
      } catch {
        // A view that is not mounted yet has no surface to watch; the next
        // transaction reads the authority instead.
      }
    },
    release: () => {
      queue = [];
      lane?.dispose();
      lane = null;
      runtime.off?.("transaction", notify);
      runtime.off?.("update", notify);
      observer?.disconnect();
      observer = null;
      watched = null;
      editableHubs.delete(editor);
    },
  };
  editableHubs.set(editor, hub);
  return hub;
}

export function useEditorSurfaceEditable(editor: Editor | null | undefined): boolean {
  const [editable, setEditable] = useState(() => readEditable(editor));
  useEffect(() => {
    const refresh = () => setEditable(readEditable(editor));
    refresh();
    return subscribeEditorSurfaceEditable(editor, refresh);
  }, [editor]);
  return editable;
}
