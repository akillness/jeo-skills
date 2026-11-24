"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A text box's textarea that holds the letters typed in it itself.
 *
 * A controlled textarea is put back to its `value` after each change, so every
 * letter had to reach the deck's window and come back through its render (50 ms
 * of a key on a 60-slide deck). Here the letters typed since the window last
 * drew this box are this small component's own, until the window gives them
 * back whole.
 *
 * A `value` it sent itself is only behind, not news: the window's draw of the
 * letters so far can come after the next key (a part arriving mid-word draws
 * them), and putting the box back to it took the newer letter out of the box and
 * so out of what the next key sent. Any other `value` is someone else's.
 */

import { useState, type ChangeEvent, type ComponentProps } from "react";

/** More than a burst of typing between two of the window's draws. */
const MAX_SENT = 400;

export function PresentationTypingTextarea({
  value,
  onChange,
  ...rest
}: ComponentProps<"textarea"> & { value: string }) {
  const [typed, setTyped] = useState<{ words: string; sent: readonly string[] } | null>(null);
  // The window has them all: an Undo that returns to an earlier `value` is not
  // to be taken for this typing's echo.
  if (typed !== null && value === typed.words) setTyped(null);
  return (
    <textarea
      {...rest}
      value={typed !== null && typed.sent.includes(value) ? typed.words : value}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        const words = event.currentTarget.value;
        setTyped((held) => ({
          words,
          sent: [...(held !== null && held.sent.includes(value) ? held.sent : [value]), words].slice(-MAX_SENT),
        }));
        onChange?.(event);
      }}
    />
  );
}
