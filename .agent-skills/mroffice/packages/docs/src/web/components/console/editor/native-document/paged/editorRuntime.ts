/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The editor-runtime guards the document surface uses (NoteEditor and the
 * print surface): a TipTap editor is usable once it has a state and a view
 * and until it is destroyed. Moved unchanged out of NoteEditor.tsx.
 */
import type { useEditor } from "@tiptap/react";

export type NoteEditorRuntime = NonNullable<ReturnType<typeof useEditor>>;

// The component builds its editor with `useEditor(config, deps)`, whose
// overload yields `Editor | null` until the instance exists — so every helper
// below must accept the nullable shape (ReturnType<typeof useEditor> alone
// resolves to the non-null overload and rejects the live variable).
export type MaybeNoteEditor = NoteEditorRuntime | null;

export function editorDom(editor: MaybeNoteEditor): HTMLElement | null {
  try {
    return (
      (editor as unknown as { view?: { dom?: HTMLElement } } | null)?.view
        ?.dom ?? null
    );
  } catch {
    return null;
  }
}

export function isUsableEditor(editor: MaybeNoteEditor): editor is NoteEditorRuntime {
  const runtime = editor as unknown as {
    commandManager?: unknown;
    destroyed?: boolean;
    isDestroyed?: boolean;
    state?: unknown;
    view?: unknown;
  } | null;
  let viewReady = true;
  try {
    viewReady = !("view" in (runtime ?? {})) || runtime?.view != null;
  } catch {
    viewReady = false;
  }
  return (
    Boolean(editor) &&
    runtime?.isDestroyed !== true &&
    runtime?.destroyed !== true &&
    runtime?.state != null &&
    viewReady &&
    runtime?.commandManager !== null
  );
}

export function getEditorCommands<TCommands extends object>(
  editor: MaybeNoteEditor,
): TCommands | null {
  if (!isUsableEditor(editor)) return null;
  try {
    return (
      (editor as unknown as { commands?: TCommands | null }).commands ?? null
    );
  } catch {
    return null;
  }
}

export function executeEditorCommand<TArgs extends unknown[]>(
  command: unknown,
  ...args: TArgs
): boolean {
  if (typeof command !== "function") return false;
  try {
    return (command as (...callArgs: TArgs) => unknown)(...args) !== false;
  } catch {
    return false;
  }
}
