"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import {
  normalizeReferenceStyles,
  type ReferenceStyleMap,
} from "./referenceStyles";

function read(editor: Editor): ReferenceStyleMap | null {
  return normalizeReferenceStyles(
    (editor.state.doc.attrs as { referenceStyles?: unknown }).referenceStyles,
  );
}

/**
 * The document's modified TOC N / Table of Figures styles, re-read on every
 * update (a node view does not re-render when only a doc attr changes).
 */
export function useReferenceStyles(editor: Editor): ReferenceStyleMap | null {
  const [styles, setStyles] = useState<ReferenceStyleMap | null>(() =>
    read(editor),
  );
  useEffect(() => {
    const refresh = () => {
      const next = read(editor);
      setStyles((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor]);
  return styles;
}
