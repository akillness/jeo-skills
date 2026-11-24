/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

/**
 * Node views whose text follows the whole document (a field's page or number, a
 * citation's label) read it again once an edit has paused, together, from one
 * listener of the editor: a document of 700 fields held 700 listeners that each
 * ran on every transaction, a selection change too, inside the keystroke.
 *
 * Reading the document stays each caller's job, once per document version. A
 * burst of edits is read at the latest after {@link LONGEST_WAIT_MS}.
 */
const EDIT_PAUSE_MS = 120;
const LONGEST_WAIT_MS = 1_000;

type Refresh = () => void;

/** A view group's own sign that its views must read again at once (the field
 * codes were toggled: the user asked and waits for the answer). */
type AskedAtOnce = (transaction: Transaction) => boolean;

interface Hub {
  views: Set<Refresh>;
  stop: () => void;
}

const hubs = new WeakMap<object, Map<string, Hub>>();

function startHub(editor: Editor, group: string, askedAtOnce: AskedAtOnce | undefined): Hub {
  const views = new Set<Refresh>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt: number | null = null;
  const run = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    firstAt = null;
    if (editor.isDestroyed) return;
    for (const view of [...views]) view();
  };
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (askedAtOnce?.(transaction)) {
      run();
      return;
    }
    if (!transaction.docChanged) return;
    const now = Date.now();
    firstAt ??= now;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, Math.min(EDIT_PAUSE_MS, Math.max(0, firstAt + LONGEST_WAIT_MS - now)));
  };
  editor.on("transaction", onTransaction);
  return {
    views,
    stop: () => {
      editor.off("transaction", onTransaction);
      if (timer !== undefined) clearTimeout(timer);
      hubs.get(editor)?.delete(group);
    },
  };
}

/**
 * Calls `refresh` once an edit to the document has paused, together with the other
 * views of `group` in this editor. Returns the way to stop.
 */
export function refreshWhenEditPauses(
  editor: Editor,
  group: string,
  refresh: Refresh,
  askedAtOnce?: AskedAtOnce,
): () => void {
  let groups = hubs.get(editor);
  if (!groups) {
    groups = new Map();
    hubs.set(editor, groups);
  }
  let hub = groups.get(group);
  if (!hub) {
    hub = startHub(editor, group, askedAtOnce);
    groups.set(group, hub);
  }
  const current = hub;
  current.views.add(refresh);
  return () => {
    current.views.delete(refresh);
    if (current.views.size === 0) current.stop();
  };
}
