/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Office's windows stay on the web app's office surface
 * (apps/web/lib/product-surface.ts). The page's own bootstrap stamps
 * `data-surface="office"` when a loopback page is loaded with
 * `?surface=office` and remembers it (localStorage "mr-surface") until a load
 * with `?surface=note`. The shell makes that choice for the person, and keeps
 * it: every page document the app's own origin serves is loaded with
 * `surface=office`, a `surface=note` included (so nothing a page links to can
 * turn the app into MR Note), and the pages the office host has nothing of
 * its own for (apps/web/proxy.ts OFFICE_LANDING_PATHS: the home, the
 * workspace hub, the notebook library) lead to the person's most recent
 * notebook, as on https://mroffice.ai. No Electron here: the rules are tested
 * on their own (test/desktop-products.test.mjs).
 *
 * Only page documents: the API, Next's own files and the print pages the
 * shell draws exports with (src/classic/printer.ts) are left as they are;
 * a page navigating inside itself (client-side routing) keeps the stamp it
 * was loaded with.
 */

/** apps/web/proxy.ts OFFICE_LANDING_PATHS. */
const OFFICE_LANDING_PATHS = new Set(["/", "/app", "/workspace", "/app/notebooks", "/workspace/notebooks"]);
/** Where those lead (the office host's signed-in landing). */
const OFFICE_HOME = "/app/recent";
/** The web app's locales (apps/web/i18n/locale-list.json; the test holds them together). */
export const WEB_LOCALES: readonly string[] = [
  "en", "id", "da", "de", "en-GB", "es", "es-419", "fr", "it", "nl",
  "no", "pl", "pt-BR", "fi", "sv", "vi", "he", "th", "ko", "ja", "zh", "zh-TW", "ar", "ru", "tr", "uk", "cs", "pt-PT", "ro", "sr-Cyrl", "sr-Latn", "el", "hu", "bg", "hr", "lv", "sk", "ca", "ms", "sl", "sq", "az", "gl", "hy", "ur", "be", "eu", "si", "lo",
];
const LOCALE_PREFIX = new RegExp(`^/(?:${WEB_LOCALES.join("|")})(?=/|$)`);
const LEFT_ALONE = /^\/(?:_next|api|render|pyodide|fonts|proofing|marketing)(?:\/|$)|\.[A-Za-z0-9]{1,8}$/;

/** The route with `surface=office` in its query (a route, not a URL: "/app/recent?x=1#y"). */
export function withOfficeSurface(route: string): string {
  const url = new URL(route, "http://app.invalid");
  url.searchParams.set("surface", "office");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The URL a page document of the app's origin is loaded at instead, on the
 * office surface; null when it is loaded as it is.
 */
export function officeSurfaceRedirect(raw: string, webOrigin: string, method = "GET"): string | null {
  if (method !== "GET") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== webOrigin) return null;
  const locale = LOCALE_PREFIX.exec(url.pathname)?.[0] ?? "";
  const stripped = (url.pathname.slice(locale.length) || "/").replace(/(.)\/+$/, "$1");
  if (LEFT_ALONE.test(stripped)) return null;
  if (OFFICE_LANDING_PATHS.has(stripped)) {
    const home = new URL(`${locale}${OFFICE_HOME}`, webOrigin);
    home.searchParams.set("surface", "office");
    return home.href;
  }
  if (url.searchParams.getAll("surface").join(",") === "office") return null;
  url.searchParams.delete("surface");
  url.searchParams.set("surface", "office");
  return url.href;
}
