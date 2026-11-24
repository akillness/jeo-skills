/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isSavableDocumentUrl } from "../../../../lib/document-url-rules";

/**
 * A link or picture address as Insert accepts it: a bare host gets https://,
 * a scheme must be a safe one (links: web, mail, phone, file; pictures: web
 * only, never data:), and the result must be an address the page's save
 * accepts (a web address names a host: `https://` alone is refused, WUA 024).
 * Spaces inside become %20, as Word writes them. Null when refused.
 */
export function normalizeDocumentUrl(
  raw: string,
  kind: "image" | "link",
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Control characters other than the space are never part of an address.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
  const value = trimmed.replace(/ /g, "%20");
  const schemeMatch = value.match(/^([a-z][a-z0-9+\-.]*):/i);
  if (!schemeMatch) {
    const address = /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)
      ? `https://${value}`
      : value;
    return isSavableDocumentUrl(address) ? address : null;
  }

  const scheme = schemeMatch[1].toLowerCase();
  if (kind === "image" && scheme === "data") return null;
  const safeSchemes =
    kind === "link"
      ? new Set(["http", "https", "mailto", "tel", "sms", "ftp", "ftps", "file"])
      : new Set(["http", "https"]);
  return safeSchemes.has(scheme) && isSavableDocumentUrl(value) ? value : null;
}
