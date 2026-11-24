/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Restore the one inline run cut by pagination, matching ProseMirror's
 * Fragment append semantics. Other runs and inline atoms retain their identity.
 * Compare all non-text fields so source/mark boundaries are never discarded. */
export function joinInlineFragments<T extends Record<string, unknown>>(
  left: readonly T[],
  right: readonly T[],
): T[] {
  const last = left.at(-1);
  const first = right[0];
  if (
    last?.type === "text" && first?.type === "text" &&
    typeof last.text === "string" && typeof first.text === "string" &&
    JSON.stringify({ ...last, text: null }) === JSON.stringify({ ...first, text: null })
  ) {
    return [...left.slice(0, -1), { ...last, text: last.text + first.text }, ...right.slice(1)];
  }
  return [...left, ...right];
}
