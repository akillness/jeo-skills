"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext } from "react";

import type { NotebookInteriorMode } from "../../lib/notebook-interior-mode";

/**
 * The notebook's interior design as the notebook route decided it
 * (NotebookInteriorMode.tsx holds the provider). Its own module, so the
 * canvas, the tray and the sidebar read it without the provider's imports.
 */
export interface NotebookInteriorState {
  /** What the interior shows now: the resolved mode, or until it is known
   * the mode this notebook last showed here (the workbench the first time). */
  readonly mode: NotebookInteriorMode;
  /** The mode is decided (plan and ownership are known). */
  readonly resolved: boolean;
  

  readonly canSwitch: boolean;
  

  readonly workbenchNeedsLargerScreen: boolean;
  /** Ask for a design: switches it and remembers the choice (on a phone the
   * workbench explains it needs a larger screen, in a panel beside `anchor`,
   * the switch that asked). */
  readonly requestMode: (mode: NotebookInteriorMode, anchor?: HTMLElement | null) => void;
  


  readonly memberAccessCapped: boolean;
}

export const WORKBENCH_ONLY: NotebookInteriorState = {
  mode: "workbench",
  resolved: true,
  canSwitch: false,
  workbenchNeedsLargerScreen: false,
  requestMode: () => {},
  memberAccessCapped: false,
};

export const NotebookInteriorContext = createContext<NotebookInteriorState>(WORKBENCH_ONLY);

/** The interior design of the notebook this surface is in; the workbench
 * outside a notebook route (previews, the dashboard). */
export function useNotebookInterior(): NotebookInteriorState {
  return useContext(NotebookInteriorContext);
}

