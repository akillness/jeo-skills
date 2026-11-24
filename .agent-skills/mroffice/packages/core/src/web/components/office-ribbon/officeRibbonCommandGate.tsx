"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Ribbon command gate: the host says which controls cannot act on what is
 * selected, and the shared control primitives grey those out with the
 * reason in their accessible name, as Word greys Change Case with an
 * equation selected or Bold with a picture selected.
 *
 * The gate is keyed by the control's test id (the one stable identity every
 * ribbon control already carries), so a host needs no per-control wiring:
 * it provides one function and every `OfficeRibbonButton`,
 * `OfficeHomeCommand` and `OfficeHomeMenuTrigger` beneath it consults it.
 * A control the caller already disabled keeps its own reason; a control the
 * gate does not name is untouched. No provider means no gate at all, so the
 * other editors' ribbons are unchanged until they opt in.
 */

import { createContext, useContext, type ReactNode } from "react";

/** The reason `testId` cannot act on the current selection, or nothing. */
export type OfficeRibbonCommandGate = (testId: string) => string | undefined;

const OfficeRibbonCommandGateContext =
  createContext<OfficeRibbonCommandGate | null>(null);

export function OfficeRibbonCommandGateProvider({
  gate,
  children,
}: {
  gate: OfficeRibbonCommandGate | null;
  children: ReactNode;
}) {
  return (
    <OfficeRibbonCommandGateContext.Provider value={gate}>
      {children}
    </OfficeRibbonCommandGateContext.Provider>
  );
}

/**
 * The host's gate itself, for a control that is not one of the shared
 * primitives (a raw menu item, a submenu trigger): the caller asks it by
 * test id and disables itself. Null when no host provides one.
 */
export function useOfficeRibbonCommandGateFn(): OfficeRibbonCommandGate | null {
  return useContext(OfficeRibbonCommandGateContext);
}

/**
 * The disabled state a control renders: its own when it is already disabled,
 * else the gate's verdict for its test id.
 */
export function useOfficeRibbonCommandGate(
  testId: string | undefined,
  disabled: boolean | undefined,
  disabledReason: string | undefined,
): { disabled: boolean | undefined; disabledReason: string | undefined } {
  const gate = useContext(OfficeRibbonCommandGateContext);
  if (disabled || !gate || !testId) return { disabled, disabledReason };
  const reason = gate(testId);
  return reason ? { disabled: true, disabledReason: reason } : { disabled, disabledReason };
}
