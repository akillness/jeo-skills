/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a navigation may go, decided from the URL alone (no Electron here, so
 * it is tested in test/navigation.test.mjs).
 *
 * - The editors' own pages (the app's loopback server, editors-server.ts)
 *   load in the app; nothing else ever does.
 * - A web, mail or phone link opens in the default browser or mail app.
 * - Every other scheme (file:, javascript:, data:, other apps' schemes) goes
 *   nowhere.
 */

export type NavigationVerdict = { readonly kind: "app" } | { readonly kind: "external" } | { readonly kind: "block" };

/** Whether a URL is one of the editors' own pages (they may call the app). */
export function isAppUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function classifyNavigation(rawUrl: string, origin: string): NavigationVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "block" };
  }
  if (isAppUrl(url.href, origin)) return { kind: "app" };
  if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return { kind: "external" };
  return { kind: "block" };
}

export type WindowOpenVerdict =
  /** A blank popup the page writes into (printing, a presenter view). */
  | { readonly kind: "popup" }
  | { readonly kind: "external" }
  | { readonly kind: "block" };

/** window.open / target=_blank: a blank popup for the page, a link for the
 * browser, never another page of the app in a window of its own. */
export function classifyWindowOpen(rawUrl: string, origin: string): WindowOpenVerdict {
  if (rawUrl === "" || rawUrl === "about:blank") return { kind: "popup" };
  const verdict = classifyNavigation(rawUrl, origin);
  return verdict.kind === "external" ? { kind: "external" } : { kind: "block" };
}
