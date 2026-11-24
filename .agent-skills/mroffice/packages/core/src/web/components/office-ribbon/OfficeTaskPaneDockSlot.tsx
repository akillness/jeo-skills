"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  OfficeTaskPaneDockSlotContext,
  officeTaskPaneDockSlotValue,
  type OfficeTaskPaneDockRegistry,
} from "./officeTaskPaneDock";

/**
 * One pane's place in a registry dock (officeTaskPaneDock.ts): mounted while
 * the pane is open, it registers the pane (a new tab, in front), renders it
 * into the dock's element, hides it while another pane is in front — kept
 * mounted, so what the user typed there survives — and gives the pane its
 * tab strip through context. OfficeTaskPane reads that context by itself; a
 * pane with its own header calls `useOfficeTaskPaneDockSlot`.
 *
 * Without a dock (a pane rendered on its own, as in its unit tests) the pane
 * renders where it is, as before.
 */
export function OfficeTaskPaneDockSlot({
  dock,
  id,
  children,
}: {
  readonly dock: OfficeTaskPaneDockRegistry | null | undefined;
  readonly id: string;
  readonly children: ReactNode;
}): React.JSX.Element | null {
  const register = dock?.register;
  const unregister = dock?.unregister;
  useLayoutEffect(() => {
    if (!register || !unregister) return;
    register(id);
    return () => unregister(id);
  }, [id, register, unregister]);

  const reportLabel = dock?.setLabel;
  const setLabel = useCallback(
    (label: string) => reportLabel?.(id, label),
    [id, reportLabel],
  );
  const reportCloser = dock?.setCloser;
  const setClose = useCallback(
    (close: (() => void) | null) => reportCloser?.(id, close),
    [id, reportCloser],
  );
  const value = dock ? officeTaskPaneDockSlotValue(dock, id, setLabel, setClose) : null;
  const hidden = value?.hidden ?? false;

  // A tab brought this pane forward: the pane that held the keyboard is now
  // hidden, so the keyboard moves to this pane's own tab.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const takeFocusRequest = dock?.takeFocusRequest;
  useLayoutEffect(() => {
    if (hidden || !takeFocusRequest?.(id)) return;
    wrapperRef.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
  }, [hidden, id, takeFocusRequest]);

  if (!dock || !value) return <>{children}</>;
  // A pane moved out of the tab renders into its own column.
  const host = value.separate ? (dock.separateHost?.(id) ?? null) : dock.host;
  if (!host) return null;
  return createPortal(
    <OfficeTaskPaneDockSlotContext.Provider value={value}>
      <div
        ref={wrapperRef}
        data-office-task-pane-slot={id}
        hidden={hidden || undefined}
        style={hidden ? undefined : { display: "contents" }}
      >
        {children}
      </div>
    </OfficeTaskPaneDockSlotContext.Provider>,
    host,
  );
}
