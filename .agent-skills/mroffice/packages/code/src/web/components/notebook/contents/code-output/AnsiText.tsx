"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";

import { hasAnsiOrCr, parseAnsi } from "@mrnote/core/web/lib/code-runner/ansi.ts";

/**
 * One runner-output log line with ANSI SGR colours applied (Jupyter parity).
 *
 * Plain lines render as the bare string (the caller's `<pre>` keeps its
 * existing byte-for-byte output); only lines that actually carry escape
 * codes or carriage-return rewrites pay for parsing. Styling is inline-only
 * (colour/weight/style/decoration) — no markup from the output is ever
 * interpreted, so a hostile string cannot become HTML.
 */
export default function AnsiText({ text }: { text: string }) {
  const segments = useMemo(
    () => (hasAnsiOrCr(text) ? parseAnsi(text) : null),
    [text],
  );
  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) => {
        const styled =
          segment.color ||
          segment.background ||
          segment.bold ||
          segment.italic ||
          segment.underline ||
          segment.dim;
        if (!styled) return <span key={index}>{segment.text}</span>;
        return (
          <span
            key={index}
            style={{
              color: segment.color,
              backgroundColor: segment.background,
              fontWeight: segment.bold ? 600 : undefined,
              fontStyle: segment.italic ? "italic" : undefined,
              textDecoration: segment.underline ? "underline" : undefined,
              opacity: segment.dim ? 0.65 : undefined,
            }}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
