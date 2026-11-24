/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// next/navigation for a host without a router: the page is the editor.
export function useRouter() {
  return {
    push: (href: string) => window.location.assign(href),
    replace: (href: string) => window.location.replace(href),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => {},
    prefetch: () => {},
  };
}
export function usePathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}
export function useParams(): Record<string, string> {
  return {};
}
export function redirect(href: string): never {
  window.location.assign(href);
  throw new Error("redirect");
}
export function notFound(): never {
  throw new Error("not found");
}
