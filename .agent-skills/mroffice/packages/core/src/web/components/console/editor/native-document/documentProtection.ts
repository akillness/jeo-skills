/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure logic for the document-level READ-ONLY / RESTRICT-EDITING protection
 * (Word/WPS «限制编辑» → "Restrict Editing → Allow only this type of editing →
 * No changes (Read only)"). A user toggle puts the editor into a read-only mode
 * the whole surface honors; toggling it off unlocks editing again.
 *
 * The state is a tiny normalized bag persisted on the top-level `doc` node's
 * attrs (like the page-setup attrs), so it survives getJSON/setContent round-
 * trips and an HTML round-trip. A read-only lock disables editing; a tracked-
 * changes lock keeps editing available while forcing revision recording and
 * blocking resolution. OFF is represented uniformly as `null`.
 *
 * DOCX round-trip maps the closed `readOnly` / `trackedChanges` / `forms` modes
 * to an enforced `<w:documentProtection>` in `word/settings.xml`. Only the first
 * two are reachable from a user toggle; `forms` arrives from an imported Word
 * document and is carried through unchanged so export does not rewrite it.
 *
 * NOTE: this is an EDITING-AFFORDANCE lock (it makes the editor read-only for the
 * person editing), NOT a security/access-control boundary — it carries no
 * password hash and a determined user can clear it, exactly like Word's
 * unprotected "Read only" restriction.
 *
 * Dependency-free (no React / no DOM) so the state logic is unit-testable in
 * isolation and reused by the extension's parse/render, the command, NoteEditor's
 * `setEditable` wiring, the DOCX exporter and the DOCX importer.
 */

import { embedAllowsRevisionResolution, embedImposedDocumentProtection } from "../../../../lib/embed/session-access";
























export const DOCUMENT_PROTECTION_MODES = [
  "readOnly",
  "trackedChanges",
  "forms",
  "formatting",
  // Word's "Comments" restriction: only comments may be added. There is no
  
  "comments",
] as const;

export type DocumentProtectionMode = (typeof DOCUMENT_PROTECTION_MODES)[number];

const PROTECTION_MODE_SET: ReadonlySet<string> = new Set(
  DOCUMENT_PROTECTION_MODES,
);

/**
 * The persisted protection state. Present only when protection is ON; the field
 * is `null` (absent) when the document is editable, so an unprotected document
 * stores nothing.
 */
export interface DocumentProtection {
  /** Always `true` when present (an OFF lock is represented as `null`, not `{enabled:false}`). */
  enabled: true;
  /** The closed passwordless restriction mode. */
  mode: DocumentProtectionMode;
  /** Word's formatting restriction enforced beside an editing `mode`. */
  formatting?: true;
  /**
   * A Word file protected with a password (a password to modify, or a
   * restriction locked with one): Word's own `w:writeProtection` /
   * `w:documentProtection` attributes, carried verbatim. The password cannot
   * be checked here, so the page is read-only (as Word's Read Only) and the
   * protection can be neither lifted nor changed; every export keeps it.
   */
  credentials?: DocumentProtectionCredentials;
  /**
   * Filling in forms only: the sections (by index, as `sectionLayouts`
   * counts them) Word's "Select sections" leaves free (`w:formProt
   * w:val="0"`). A reader edits them like any text.
   */
  unprotectedSections?: readonly number[];
}

export type DocumentProtectionCredentials = Partial<
  Record<"documentProtection" | "writeProtection", Readonly<Record<string, string>>>
>;

const PROTECTION_ELEMENT_ATTRS: ReadonlySet<string> = new Set([
  "edit", "formatting", "enforcement", "recommended",
  "cryptProviderType", "cryptAlgorithmClass", "cryptAlgorithmType", "cryptAlgorithmSid",
  "cryptSpinCount", "cryptProvider", "algIdExt", "algIdExtSource", "cryptProviderTypeExt",
  "cryptProviderTypeExtSource", "hash", "salt", "algorithmName", "hashValue", "saltValue",
  "spinCount",
]);
const PROTECTION_VALUE_RE = /^[A-Za-z0-9+/=._{}\- \r\n]{0,512}$/;

/** The verbatim password-protection attributes, or null when malformed (the
 * same closed shape the API's normalize_docx_protection_credentials takes). */
export function normalizeProtectionCredentials(value: unknown): DocumentProtectionCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, Readonly<Record<string, string>>> = {};
  for (const [element, raw] of Object.entries(value as Record<string, unknown>)) {
    if (element !== "documentProtection" && element !== "writeProtection") return null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const attrs: Record<string, string> = {};
    for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
      if (!PROTECTION_ELEMENT_ATTRS.has(key) || typeof item !== "string" || !PROTECTION_VALUE_RE.test(item)) return null;
      attrs[key] = item;
    }
    out[element] = attrs;
  }
  return Object.keys(out).length ? out : null;
}

/** Whether the document is a password-protected Word file (read read-only,
 * or restricted to filling in its forms). */
export function isDocumentPasswordLocked(value: unknown): boolean {
  return normalizeDocumentProtection(value)?.credentials !== undefined;
}

/** Coerce an arbitrary value into a whitelisted protection mode, or null. */
export function normalizeProtectionMode(
  value: unknown,
): DocumentProtectionMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PROTECTION_MODE_SET.has(normalized)
    ? (normalized as DocumentProtectionMode)
    : null;
}

/**
 * Validate + normalize an arbitrary value into a {@link DocumentProtection}, or
 * `null` when protection is off / the value is malformed. Accepts:
 *  - `null` / `undefined` / `false` → null (off),
 *  - `true` → a default read-only lock (so a bare boolean toggle works),
 *  - an object `{ enabled, mode }` → a read-only lock ONLY when `enabled` is
 *    truthy AND `mode` is a known mode (an unknown mode falls back to readOnly so
 *    a forward-compat value still locks rather than silently unlocking).
 *
 * Anything else → null. Always returns the canonical shape (or null), never an
 * `{enabled:false}` object, so "off" is represented uniformly.
 */
export function normalizeDocumentProtection(
  value: unknown,
): DocumentProtection | null {
  if (value === null || value === undefined || value === false) return null;
  if (value === true) return { enabled: true, mode: "readOnly" };
  if (typeof value !== "object") return null;
  const bag = value as Record<string, unknown>;
  if (bag.enabled !== true) return null;
  if (bag.credentials !== undefined) {
    // Fail closed: a password lock that does not read is still read-only.
    const credentials = normalizeProtectionCredentials(bag.credentials);
    if (!credentials) return { enabled: true, mode: "readOnly" };
    // Filling in forms needs no password in Word: a lock whose restriction IS
    
    // (the server's credentials_allow_filling_forms). A "Comments" one is
    // still Comments: the password guards stopping it, not the comments.
    const forms =
      bag.mode === "forms" &&
      credentials.writeProtection === undefined &&
      credentials.documentProtection?.edit === "forms";
    const comments =
      bag.mode === "comments" &&
      credentials.writeProtection === undefined &&
      credentials.documentProtection?.edit === "comments";
    return {
      enabled: true,
      mode: forms ? "forms" : comments ? "comments" : "readOnly",
      credentials,
      ...(forms ? freeSections(bag.unprotectedSections) : {}),
    };
  }
  const mode = normalizeProtectionMode(bag.mode) ?? "readOnly";
  const base: DocumentProtection =
    bag.formatting === true && mode !== "formatting"
      ? { enabled: true, mode, formatting: true }
      : { enabled: true, mode };
  return mode === "forms" && base.formatting !== true
    ? { ...base, ...freeSections(bag.unprotectedSections) }
    : base;
}

/** The free sections of a forms restriction, kept only in the closed shape
 * the server's normalize_docx_document_protection takes (sorted, distinct,
 * non-negative integers); anything else frees none. */
function freeSections(value: unknown): Pick<DocumentProtection, "unprotectedSections"> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4096) return {};
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!Number.isInteger(item) || item < 0 || (index > 0 && item <= value[index - 1])) return {};
  }
  return { unprotectedSections: [...(value as number[])] };
}

/** The sections a forms restriction leaves free to edit (Word's Select sections). */
export function unprotectedFormSections(value: unknown): ReadonlySet<number> {
  const protection = normalizeDocumentProtection(value);
  if (protection?.mode !== "forms" || protection.formatting === true) return new Set();
  return new Set(protection.unprotectedSections ?? []);
}

/** Is any supported protection mode active? */
export function isDocumentProtected(value: unknown): boolean {
  return normalizeDocumentProtection(value) !== null;
}











export function isDocumentReadOnlyProtected(value: unknown): boolean {
  const protection = normalizeDocumentProtection(value);
  const mode = protection?.mode;
  return (
    mode === "readOnly" ||
    mode === "forms" ||
    mode === "formatting" ||
    mode === "comments" ||
    protection?.formatting === true
  );
}

/**
 * Word's "Comments" restriction (`w:edit="comments"`): the text is locked and
 * comments may still be written (commentOnlyLane.ts).
 */
export function isDocumentCommentOnlyProtected(value: unknown): boolean {
  const protection = normalizeDocumentProtection(value);
  return protection?.mode === "comments" && protection.formatting !== true;
}

/**
 * Whether the restriction lets the page be saved: an editable document, or
 * one whose only edits are comments.
 */
export function documentProtectionAllowsSaves(value: unknown): boolean {
  
  return isEditorEditable(value) || isDocumentCommentOnlyProtected(value);
}

export function isDocumentTrackingLocked(value: unknown): boolean {
  return normalizeDocumentProtection(value)?.mode === "trackedChanges";
}

/**
 * The next protection state when the user TOGGLES the lock from a current (raw)
 * value: protected → null (unlock), unprotected → a read-only lock. Pure state
 * transition used by the command + the toolbar button.
 *
 * An imported `forms` restriction unlocks here rather than being re-labelled
 * `readOnly`: this is Word's passwordless "Stop Protection", and turning one
 * author-chosen restriction into a different one behind the user's back would
 * change what their exported document says.
 */
export function toggleDocumentProtection(
  current: unknown,
): DocumentProtection | null {
  const protection = normalizeDocumentProtection(current);
  if (protection?.mode === "trackedChanges") return protection;
  // A password lock is lifted only with its password, which is not checked here.
  if (protection?.credentials) return protection;
  return isDocumentReadOnlyProtected(protection)
    ? null
    : { enabled: true, mode: "readOnly" };
}

export function toggleDocumentTrackingLock(
  current: unknown,
): DocumentProtection | null {
  const protection = normalizeDocumentProtection(current);
  // A read-only restriction (`readOnly` or an imported `forms`) already forbids
  // the editing that a tracking lock would merely record, so leave it alone.
  if (isDocumentReadOnlyProtected(protection)) return protection;
  return protection?.mode === "trackedChanges"
    ? null
    : { enabled: true, mode: "trackedChanges" };
}

/**
 * Whether the editor should be EDITABLE given the (raw) protection state AND any
 * ambient read-only context (e.g. a guest/preview surface that is already read-
 * only for other reasons). The editor is editable only when it is not protected
 * AND not already forced read-only by the caller. Centralizes the boolean so
 * NoteEditor and tests agree on the rule.
 */
export function isEditorEditable(
  protection: unknown,
  forcedReadOnly = false,
): boolean {
  if (forcedReadOnly) return false;
  // Filling in forms: the surface is editable and every edit outside a
  
  return !isDocumentReadOnlyProtected(protection) || isDocumentFormsProtected(protection);
}

/** Word's "Filling in forms" restriction alone: only the form's fields are filled. */
export function isDocumentFormsProtected(value: unknown): boolean {
  const protection = normalizeDocumentProtection(value);
  return protection?.mode === "forms" && protection.formatting !== true;
}

/**
 * The DOCX `<w:documentProtection>` attribute values for a (raw) protection
 * state, or `null` when protection is off (so the exporter emits no element).
 * Word stores an enforced read-only restriction as
 * `<w:documentProtection w:edit="readOnly" w:enforcement="1"/>`.
 */
export function documentProtectionDocxAttrs(
  value: unknown,
): {
  edit?: Exclude<DocumentProtectionMode, "formatting">;
  formatting?: "1";
  enforcement: "1";
} | null {
  const protection = normalizeDocumentProtection(value);
  if (!protection) return null;
  if (protection.mode === "formatting") return { formatting: "1", enforcement: "1" };
  return {
    edit: protection.mode,
    ...(protection.formatting ? { formatting: "1" as const } : {}),
    enforcement: "1",
  };
}















export function effectiveDocumentProtection(stored: unknown): unknown {
  const imposed = embedImposedDocumentProtection();
  if (!imposed) return stored;
  const own = normalizeDocumentProtection(stored);
  if (own && (own.mode === "readOnly" || own.mode === "formatting" || own.formatting === true || own.credentials)) {
    return stored;
  }
  if (own && imposed.mode === "trackedChanges" && (own.mode === "comments" || own.mode === "forms")) return stored;
  return imposed;
}

/**
 * Whether tracked changes may not be accepted or rejected: the document's
 * own tracking lock (Word: a Tracked changes restriction blocks resolving),
 * or an embedded session without `permissions.acceptRejectChanges` (a review
 * session by default). A review session that is given it records every edit
 * and may resolve them.
 */
export function revisionResolutionLocked(stored: unknown): boolean {
  return isDocumentTrackingLocked(stored) || !embedAllowsRevisionResolution();
}
