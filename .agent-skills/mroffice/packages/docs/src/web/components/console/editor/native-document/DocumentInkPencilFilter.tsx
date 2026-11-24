"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createElement } from "react";

import type { DocumentInkFilter } from "@mrnote/core/web/lib/document-ink.ts";

const reactName = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function reactAttrs(attrs: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [reactName(key), value]));
}

/**
 * The pencil texture as a React `<filter>`, for the strokes previewed while
 * drawing; the placed ink is painted by the shape painter from the same
 * {@link DocumentInkFilter}, so a stroke looks the same before and after it
 * lands.
 */
export function DocumentInkPencilFilter({ id, filter }: { id: string; filter: DocumentInkFilter }) {
  return createElement(
    "filter",
    { id, ...reactAttrs(filter.attrs) },
    filter.primitives.map((primitive, index) =>
      createElement(primitive.tag, { key: index, ...reactAttrs(primitive.attrs) }),
    ),
  );
}
