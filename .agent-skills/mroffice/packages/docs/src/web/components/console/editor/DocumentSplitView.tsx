"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState, Plugin, Transaction } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import {
  yCursorPluginKey,
  ySyncPluginKey,
  yUndoPluginKey,
} from "@tiptap/y-tiptap";

const DOCUMENT_SPLIT_SOURCE_META = "documentSplitViewSource";
const DOCUMENT_SPLIT_SELECTION_META = "documentSplitViewSelection";

/**
 * ProseMirror assigns every plugin a runtime `key` string (`name$` or
 * `name$N`) but keeps it out of its public typings. CollaborationCaret builds
 * its awareness-listener PluginKey inline, so that generated name is the only
 * identity the plugin exposes; read it through an `in` guard instead of the
 * undeclared member.
 */
function runtimePluginKeyName(plugin: Plugin): string | null {
  return "key" in plugin && typeof plugin.key === "string" ? plugin.key : null;
}

function isCollaborationBindingPlugin(plugin: Plugin): boolean {
  return (
    plugin.spec.key === ySyncPluginKey ||
    plugin.spec.key === yUndoPluginKey ||
    plugin.spec.key === yCursorPluginKey ||
    (runtimePluginKeyName(plugin)?.startsWith(
      "collaborationCaretAwarenessListener$",
    ) ??
      false)
  );
}

function splitProjectionState(state: EditorState): EditorState {
  return state.reconfigure({
    // A Yjs binding owns exactly one ProseMirror view. Reusing those plugin
    // views in the split projection steals the binding from the primary view
    // and can duplicate awareness/undo observers. The secondary surface sends
    // its transactions through the primary editor, where the single canonical
    // collaboration binding publishes them.
    plugins: state.plugins.filter(
      (plugin) => !isCollaborationBindingPlugin(plugin),
    ),
  });
}

export interface DocumentSplitEditorController {
  view: EditorView;
  destroy: () => void;
  refreshEditable: () => void;
}

export function createDocumentSplitEditor(
  editor: Editor,
  mount: HTMLElement,
  mayEdit: () => boolean,
): DocumentSplitEditorController | null {
  if (editor.isDestroyed) return null;
  let destroyed = false;
  const dispatchTransaction = (transaction: Transaction) => {
    if (destroyed || editor.isDestroyed) return;
    if (!transaction.before.eq(editor.state.doc)) {
      secondary.updateState(splitProjectionState(editor.state));
      return;
    }
    transaction.setMeta(DOCUMENT_SPLIT_SOURCE_META, true);
    editor.view.dispatch(transaction);
  };
  const secondary = new EditorView(mount, {
    ...editor.view.props,
    state: splitProjectionState(editor.state),
    dispatchTransaction,
    editable: () => mayEdit() && editor.isEditable,
  });
  secondary.dom.setAttribute("data-document-split-secondary", "true");
  secondary.dom.setAttribute("data-document-view-mode", "web");

  const syncFromPrimary = ({ transaction }: { transaction: Transaction }) => {
    if (destroyed || editor.isDestroyed) return;
    let nextState = splitProjectionState(editor.state);
    if (
      transaction.getMeta(DOCUMENT_SPLIT_SOURCE_META) !== true &&
      secondary.state.doc.eq(transaction.before)
    ) {
      try {
        const selection = secondary.state.selection.map(
          nextState.doc,
          transaction.mapping,
        );
        if (!selection.eq(nextState.selection)) {
          nextState = nextState.apply(
            nextState.tr
              .setSelection(selection)
              .setMeta("addToHistory", false)
              .setMeta(DOCUMENT_SPLIT_SELECTION_META, true),
          );
        }
      } catch {
        nextState = splitProjectionState(editor.state);
      }
    }
    secondary.updateState(nextState);
  };
  editor.on("transaction", syncFromPrimary);

  return {
    view: secondary,
    refreshEditable: () => {
      if (destroyed || editor.isDestroyed) return;
      secondary.setProps({
        ...editor.view.props,
        state: secondary.state,
        dispatchTransaction,
        editable: () => mayEdit() && editor.isEditable,
      });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      editor.off("transaction", syncFromPrimary);
      secondary.destroy();
    },
  };
}

export default function DocumentSplitView({
  editor,
  canEdit,
  label,
}: {
  editor: Editor;
  canEdit: boolean;
  label: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canEditRef = useRef(canEdit);
  const controllerRef = useRef<DocumentSplitEditorController | null>(null);

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const controller = createDocumentSplitEditor(
      editor,
      mount,
      () => canEditRef.current,
    );
    controllerRef.current = controller;
    return () => {
      controller?.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [editor]);

  useLayoutEffect(() => {
    canEditRef.current = canEdit;
    controllerRef.current?.refreshEditable();
  }, [canEdit]);

  return (
    <section
      // Document content keeps its ltr geometry under an rtl interface.
      dir="ltr"
      className="document-split-view note-editor-body-main--sheeted"
      data-document-view-mode="web"
      data-testid="document-split-view"
      aria-label={label}
      role="region"
    >
      <div ref={mountRef} className="document-split-view__mount" />
    </section>
  );
}
