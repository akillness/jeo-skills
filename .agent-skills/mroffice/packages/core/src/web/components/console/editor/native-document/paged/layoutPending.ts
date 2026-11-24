/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
const pending = new WeakMap<Element, Set<string>>();
const settlers = new WeakMap<Element, Map<string, () => void>>();

export function markLayoutPending(root: Element, owner: string): void {
  let owners = pending.get(root);
  if (!owners) pending.set(root, (owners = new Set()));
  owners.add(owner);
}

export function clearLayoutPending(root: Element, owner: string): void {
  pending.get(root)?.delete(owner);
}

export function layoutPending(root: Element): boolean {
  return (pending.get(root)?.size ?? 0) > 0;
}

/** A projection's way to lay its part of `root` out now, from scratch. */
export function registerLayoutSettler(root: Element, owner: string, settle: () => void): () => void {
  let owners = settlers.get(root);
  if (!owners) settlers.set(root, (owners = new Map()));
  owners.set(owner, settle);
  return () => {
    if (settlers.get(root)?.get(owner) === settle) settlers.get(root)?.delete(owner);
  };
}

/** Every registered projection of `root` lays its part out now. */
export function settleLayoutNow(root: Element): void {
  for (const settle of settlers.get(root)?.values() ?? []) {
    try {
      settle();
    } catch {
      // One projection that cannot measure now keeps what it drew.
    }
  }
}
