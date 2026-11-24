/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * `setPointerCapture` throws NotFoundError when the pointer is not active any
 * more (a synthetic pointerdown, a pointer released between the event and the
 * handler, a stale id). Capture is an optimisation for the drag that follows,
 * never a precondition, so the failure is swallowed.
 */
export function tryCapturePointer(target: Element | null | undefined, pointerId: number): boolean {
  if (!target || typeof (target as Element).setPointerCapture !== "function") return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}
