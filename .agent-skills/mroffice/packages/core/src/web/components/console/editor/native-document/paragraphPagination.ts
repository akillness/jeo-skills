/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Raw absence inherits; explicit false is a real override. Imported
 * paragraphs materialize their native effective flags at the import boundary. */
export function paragraphKeepFlag(
  node: {type: string | {name: string}; attrs?: Record<string, unknown>} | null | undefined,
  key: "keepNext" | "keepLines",
): boolean {
  if (!node) return false;
  const value = node.attrs?.[key];
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  // Earlier DOCX imports persisted true but omitted effective false. Keep
  // that legacy representation stable; new imports persist both booleans.
  const source = node.attrs?.source;
  if (source && typeof source === "object" && !Array.isArray(source) &&
      (source as Record<string, unknown>).adapter === "docx") return false;
  const type = typeof node.type === "string" ? node.type : node.type.name;
  return type === "heading";
}
