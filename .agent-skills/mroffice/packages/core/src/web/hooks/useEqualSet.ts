"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useInsertionEffect, useRef } from "react";

/** Whether two sets hold the same members. */
export function sameSetMembers<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const member of a) if (!b.has(member)) return false;
  return true;
}

/**
 * The set as last returned while its members stay the same: a set rebuilt
 * on every edit (the rows a sheet hides) keeps its identity, so what is
 * derived from it (row offsets, the page layout map) is not rebuilt with it.
 * The comparison is linear in the set, never in the sheet.
 */
export function useEqualSet<T>(next: ReadonlySet<T>): ReadonlySet<T> {
  const last = useRef(next);
  // eslint-disable-next-line react-hooks/refs -- a value cache, published only on commit
  const previous = last.current;
  const stable = sameSetMembers(previous, next) ? previous : next;
  useInsertionEffect(() => { last.current = stable; });
  return stable;
}
