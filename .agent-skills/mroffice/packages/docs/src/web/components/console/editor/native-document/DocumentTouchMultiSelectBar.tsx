"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

import { OfficeTouchMultiSelectBar } from "@mrnote/core/web/components/office-ribbon/OfficeTouchMultiSelectBar.tsx";
import { touchMultiSelectScopeFor, useTouchMultiSelectActive } from "@mrnote/core/web/lib/touch-multi-select.ts";

import { documentShapeMultiSelection } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";

/** Shapes selected now: the multi-selection, or the one selected shape. */
function selectedShapeCount(state: EditorState): number {
  const positions = documentShapeMultiSelection(state);
  if (positions.length > 0) return positions.length;
  const selection = state.selection;
  return selection instanceof NodeSelection && selection.node.type.name === "documentShape"
    ? 1
    : 0;
}







export function DocumentTouchMultiSelectBar({
  editor,
  anchorRef,
}: {
  editor: Editor;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const scope = touchMultiSelectScopeFor(editor);
  const active = useTouchMultiSelectActive(scope);
  const [count, setCount] = useState(() => selectedShapeCount(editor.state));

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      const next = selectedShapeCount(editor.state);
      setCount(next);
      if (next === 0) scope.exit();
    };
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [active, editor, scope]);

  if (!active || count === 0) return null;
  return (
    <OfficeTouchMultiSelectBar
      count={count}
      anchorRef={anchorRef}
      testId="document-touch-multi-select-bar"
      onDone={scope.exit}
    />
  );
}
