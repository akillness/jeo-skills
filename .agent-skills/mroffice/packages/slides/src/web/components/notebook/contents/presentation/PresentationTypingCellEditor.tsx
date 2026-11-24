"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A table cell's words that hold the letters typed in them, as
 * `PresentationTypingTextarea` does for a text box: the letters since the deck's
 * window last drew this cell are this small component's own, until the window
 * gives them back whole. A value it sent itself is only behind; any other is
 * someone else's.
 */

import { forwardRef, useState, type ComponentProps } from "react";

import PresentationCellRichTextEditor, { type PresentationCellTextElement } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";

type EditorProps = ComponentProps<typeof PresentationCellRichTextEditor>;

/** More than a burst of typing between two of the window's draws. */
const MAX_SENT = 400;

export const PresentationTypingCellEditor = forwardRef<PresentationCellTextElement, EditorProps>(
  function PresentationTypingCellEditor({ value, runs, onChange, ...rest }, ref) {
    const [typed, setTyped] = useState<{
      value: string;
      runs: EditorProps["runs"];
      sent: readonly string[];
    } | null>(null);
    if (typed !== null && value === typed.value) setTyped(null);
    const held = typed !== null && typed.sent.includes(value);
    return (
      <PresentationCellRichTextEditor
        {...(rest as EditorProps)}
        ref={ref}
        value={held ? typed.value : value}
        runs={held ? typed.runs : runs}
        onChange={(event) => {
          setTyped((before) => ({
            value: event.target.value,
            runs: event.target.runs,
            sent: [...(before !== null && before.sent.includes(value) ? before.sent : [value]), event.target.value].slice(-MAX_SENT),
          }));
          onChange(event);
        }}
      />
    );
  },
);
