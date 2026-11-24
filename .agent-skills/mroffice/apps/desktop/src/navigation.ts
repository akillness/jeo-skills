/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a navigation may go, decided from the URL alone (no Electron here, so
 * it is unit-tested in test/navigation.test.mjs).
 *
 * - The site's own pages load in the app.
 * - Google sign-in leaves the app: Google refuses embedded browsers, so the
 *   person signs in in their default browser and the app is handed the
 *   session back (google-signin.ts). Linking Google to an account (Settings)
 *   opens that page in the browser.
 * - Stripe's checkout and billing pages load in the app: they return to the
 *   site, which should stay signed in the window that started the payment.
 * - Any other web, mail or phone link opens in the default browser / mail
 *   app; every other scheme (file:, custom app schemes, javascript:, data:)
 *   goes nowhere.
 */

export const DEFAULT_ORIGIN = "https://mr-note.com";










export const FORMER_ORIGINS: readonly string[] = [];



export const APP_PROTOCOL = "mroffice-oss";

/** Third-party pages that return to the site and so stay in the window. */
const IN_APP_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);

const GOOGLE_AUTHORIZE_PATH = "/api/v1/auth/google/authorize";

export type NavigationVerdict =
  | { readonly kind: "app" }
  | { readonly kind: "google-signin"; readonly next: string }
  | { readonly kind: "google-connect"; readonly next: string }
  | { readonly kind: "in-app" }
  /** The site's page at a former origin: load the same page here instead. */
  | { readonly kind: "moved"; readonly url: string }
  | { readonly kind: "external" }
  | { readonly kind: "block" };

/** The site's origin from the environment (http(s) only), else the default.
 * A former origin is the site's current one. */
export function resolveOrigin(raw: string | undefined): string {
  if (!raw) return DEFAULT_ORIGIN;
  try {
    const url = new URL(raw);
    if (FORMER_ORIGINS.includes(url.origin)) return DEFAULT_ORIGIN;
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_ORIGIN;
}

/**
 * The same page on the site's current origin for a URL at a former origin,
 * else null. Only for the production site: a development origin has no
 * former one.
 */
export function movedAppUrl(rawUrl: string, origin: string): string | null {
  try {
    const url = new URL(rawUrl);
    const current = new URL(origin);
    if (current.origin !== DEFAULT_ORIGIN || !FORMER_ORIGINS.includes(url.origin)) return null;
    return `${current.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Whether a URL is the site's own (its pages may call the app). */
export function isAppUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** A same-site path the sign-in may return to; anything else is /app. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/app";
  }
  return value;
}

export function classifyNavigation(rawUrl: string, origin: string): NavigationVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "block" };
  }
  if (isAppUrl(url.href, origin)) {
    if (url.pathname === GOOGLE_AUTHORIZE_PATH) {
      const next = safeNextPath(url.searchParams.get("next"));
      return url.searchParams.get("mode") === "connect"
        ? { kind: "google-connect", next }
        : { kind: "google-signin", next };
    }
    return { kind: "app" };
  }
  const moved = movedAppUrl(url.href, origin);
  if (moved) {
    // Google sign-in stays a browser trip, from its current address.
    const verdict = classifyNavigation(moved, origin);
    return verdict.kind === "app" ? { kind: "moved", url: moved } : verdict;
  }
  if (url.protocol === "https:" && IN_APP_HOSTS.has(url.hostname)) return { kind: "in-app" };
  if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return { kind: "external" };
  return { kind: "block" };
}

export type WindowOpenVerdict =
  /** A blank popup the page writes into (print, presenter view): a child window. */
  | { readonly kind: "popup" }
  /** A page of the site in a window of its own. */
  | { readonly kind: "app-window"; readonly route: string }
  | { readonly kind: "external" }
  | { readonly kind: "block" };

/**
 * window.open / target=_blank. `disposition` is Electron's: "new-window" is a
 * sized popup the opener keeps a handle on, the tab dispositions are links.
 */
export function classifyWindowOpen(rawUrl: string, disposition: string, origin: string): WindowOpenVerdict {
  if (rawUrl === "" || rawUrl === "about:blank") return { kind: "popup" };
  const verdict = classifyNavigation(rawUrl, origin);
  if (verdict.kind === "moved") return classifyWindowOpen(verdict.url, disposition, origin);
  if (verdict.kind === "app") {
    if (disposition === "new-window") return { kind: "popup" };
    const url = new URL(rawUrl);
    return { kind: "app-window", route: `${url.pathname}${url.search}${url.hash}` || "/app" };
  }
  if (verdict.kind === "in-app" || verdict.kind === "external") return { kind: "external" };
  if (verdict.kind === "google-signin" || verdict.kind === "google-connect") return { kind: "block" };
  return { kind: "block" };
}
