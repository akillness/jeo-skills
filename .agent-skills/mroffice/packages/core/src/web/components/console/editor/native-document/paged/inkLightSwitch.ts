/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Whether a window draws handwriting at rest from the note's data
 * (inkLightLayer): the `docs-ink-light` switch, never for a page being
 * printed or rendered (its copy stands on the strokes themselves), never
 * with `window.__mraiNoInkLight` (an A/B in one build). Read once per window.
 */
import { textEngineEnabled } from "../../../../../lib/text-engine/flags";

const wanted = new WeakMap<Window, boolean>();

export function inkLightWanted(win: Window | null | undefined): boolean {
  if (!win) return false;
  let value = wanted.get(win);
  if (value === undefined) {
    value =
      !(win as Window & { __mraiNoInkLight?: boolean }).__mraiNoInkLight &&
      !win.location.pathname.includes("/render/") &&
      textEngineEnabled("docs-ink-light");
    wanted.set(win, value);
  }
  return value;
}
