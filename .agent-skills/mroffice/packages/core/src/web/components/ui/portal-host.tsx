"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext, type ReactNode } from "react";

/** Undefined keeps the ordinary body portal; null is an explicitly scoped
 * host that is not mounted/open. A pending host must never leak to body. */
export type PortalHost = Element | DocumentFragment | null | undefined;
const PortalHostContext = createContext<PortalHost>(undefined);

export function PortalHostProvider({ host, children }: { host: PortalHost; children: ReactNode }) {
  return <PortalHostContext.Provider value={host}>{children}</PortalHostContext.Provider>;
}

export function usePortalHostContainer(explicit?: PortalHost) {
  const inherited = useContext(PortalHostContext);
  // An existing explicit DOM container wins. Null without a scoped provider
  // retains Radix's original body fallback for existing callers.
  const container = explicit ?? inherited;
  return { container, pending: container === null };
}

/**
 * A layer of its own on top of the page (a document's chart workbook opened
 * as a standalone window layer). Everything that pops up from inside it must
 * open inside it as well: a menu, dialog or palette portalled to <body> or to
 * the workspace root paints under the layer and looks as if its opener hid
 * it. Undefined outside any layer; null while the layer's host is mounting.
 */
const PortalLayerContext = createContext<HTMLElement | null | undefined>(undefined);

export function PortalLayerProvider({
  layer,
  children,
}: {
  layer: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalLayerContext.Provider value={layer}>
      <PortalHostProvider host={layer}>{children}</PortalHostProvider>
    </PortalLayerContext.Provider>
  );
}

/** The enclosing layer's host, null while it mounts, undefined outside one. */
export function usePortalLayer(): HTMLElement | null | undefined {
  return useContext(PortalLayerContext);
}

/** Where a hand-portalled popup goes: the enclosing layer, else <body>. */
export function usePopupPortalTarget(): HTMLElement | null {
  const layer = useContext(PortalLayerContext);
  if (layer !== undefined) return layer;
  return typeof document === "undefined" ? null : document.body;
}
