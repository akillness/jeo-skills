/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";













export function useChangedState<T>(
  initial: T | (() => T),
  /** When two values are the same (default: Object.is); a module-level
   * function keeps the setter stable. */
  same: (next: T, current: T) => boolean = Object.is,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const latest = useRef(value);
  const set = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function" ? (action as (current: T) => T)(latest.current) : action;
    if (Object.is(next, latest.current) || same(next, latest.current)) return;
    latest.current = next;
    setValue(next);
  }, [same]);
  return [value, set];
}

/** Two empty containers (Map, Set or array) are the same value: a reset to a
 * new empty one keeps the empty one held, and renders nothing. */
export function sameEmptyContainer(next: unknown, current: unknown): boolean {
  const size = (value: unknown) =>
    value instanceof Map || value instanceof Set ? value.size : Array.isArray(value) ? value.length : -1;
  return size(next) === 0 && size(current) === 0;
}
