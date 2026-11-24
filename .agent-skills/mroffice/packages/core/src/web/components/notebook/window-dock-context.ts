"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext } from "react";
import type { DockSide } from "@/lib/window-dock";

/**
 * Which side of an editor this window is docked to, or null when it floats.
 * The AI window reads it to switch to its narrow side-panel layout.
 */
export const WindowDockContext = createContext<DockSide | null>(null);

export function useWindowDockSide(): DockSide | null {
  return useContext(WindowDockContext);
}

/**
 * The element in this window's titlebar that content may portal its own
 * controls into, or null outside a canvas window. The AI window puts its
 * conversation picker there instead of drawing a second header row.
 */
export const WindowTitlebarSlotContext = createContext<HTMLElement | null>(null);

export function useWindowTitlebarSlot(): HTMLElement | null {
  return useContext(WindowTitlebarSlotContext);
}

/**
 * The editor window this window is docked to, and how to leave that dock,
 * or null when it floats. The docked AI window uses it to point back into
 * the editor it sits beside (locating a proposed change) and to offer an
 * explicit undock next to its conversation controls.
 */
export interface WindowDockTarget {
  targetId: string;
  undock: () => void;
  


  switchSide?: () => void;
}

/** The classic interior's assistant standing as a tab of its own: the way
 * back beside the page in front (Window.tsx). Null elsewhere. */
export interface WindowClassicTab {
  dockBeside: () => void;
}
export const WindowClassicTabContext = createContext<WindowClassicTab | null>(null);
export function useWindowClassicTab(): WindowClassicTab | null {
  return useContext(WindowClassicTabContext);
}

export const WindowDockTargetContext = createContext<WindowDockTarget | null>(null);

export function useWindowDockTarget(): WindowDockTarget | null {
  return useContext(WindowDockTargetContext);
}
