/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document CITATIONS / BIBLIOGRAPHY (Word/WPS parity) — pure logic.
 *
 * A user inserts a CITATION: an inline `citation` mark (carrying a `sourceId`,
 * and optional locator/prefix) is dropped at the caret, referencing a SOURCE
 * record in a document-level source store. Sources are stored as a CSL-JSON-like
 * shape (a small, well-known subset of the Citation Style Language item schema)
 * persisted as an ADDITIVE optional field on the top-level document node's
 * `attrs.sources` (see citationExtension.ts), so existing documents — which carry
 * no source array — still validate and round-trip unchanged. A document-level
 * `citationStyle` attribute (one of CITATION_STYLES, Word's Style list) picks
 * how both the in-text marker and the bibliography entries are rendered.
 *
 * Styles are formatted IN-HOUSE (no citation library): a deliberately small,
 * dependency-free subset of each style, good enough for the common source
 * kinds the editor can author. The list is Word's References > Style list:
 *
 *   - APA  : in-text = (Author, Year); bibliography sorted alphabetically by the
 *            first author's family name then year.
 *   - MLA  : in-text = (Author locator); works cited sorted like APA, unnumbered.
 *   - IEEE : in-text = [n] where n is the 1-based order the source is FIRST cited
 *            in the document; bibliography numbered in that same citation order.
 *   - Chicago, GB7714, GOST (name / title sort), Harvard - Anglia, ISO 690
 *     (first element and date / numerical reference), SIST02, Turabian: the
 *     text Word's own stylesheet of that name produces for these source kinds
 *     (docs/microsoft-office-replication/WORD-CITATION-STYLES.md).
 *
 * Everything in THIS module is framework-free: it operates on plain JSON-shaped
 * values so the normalize/cap/sanitize/format behaviour can be unit-tested
 * headlessly. The TipTap mark/node/extension that wires this into the live editor
 * lives in citationExtension.ts.
 *
 * SECURITY: every source field is user-supplied and round-trips through persisted
 * JSON. Every field is always rendered as TEXT (never HTML) and is scrubbed of
 * control bytes + clamped here, so a forged document can never smuggle markup,
 * attribute-breaking payloads, or an unbounded blob past this edge. The source id
 * is restricted to an attribute-safe token alphabet so it can never break out of
 * the `data-source-id` attribute. Mirrors the comment/footnote models.
 */

/** The inline mark name. Kept in a constant so the extension + tests agree. */
export const CITATION_MARK_NAME = "citation";

/**
 * The supported citation styles: Word's References > Style list, in the
 * alphabetical order Word shows it.
 */
export const CITATION_STYLES = [
  "apa",
  "chicago",
  "gb7714",
  "gost-name",
  "gost-title",
  "harvard-anglia",
  "ieee",
  "iso690",
  "iso690-numerical",
  "mla",
  "sist02",
  "turabian",
] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];
export const DEFAULT_CITATION_STYLE: CitationStyle = "apa";

/**
 * The name Word shows for each style. These are the proper names Word's
 * stylesheets give themselves; Word shows them untranslated in every UI
 * language, so they are not message-catalog entries.
 */
export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  apa: "APA",
  chicago: "Chicago",
  gb7714: "GB7714",
  "gost-name": "GOST - Name Sort",
  "gost-title": "GOST - Title Sort",
  "harvard-anglia": "Harvard - Anglia",
  ieee: "IEEE",
  iso690: "ISO 690 - First Element and Date",
  "iso690-numerical": "ISO 690 - Numerical Reference",
  mla: "MLA",
  sist02: "SIST02",
  turabian: "Turabian",
};

/** Styles whose citations are the source's number in first-citation order. */
export function isNumericCitationStyle(
  style: CitationStyle,
): style is "ieee" | "iso690-numerical" {
  return style === "ieee" || style === "iso690-numerical";
}

/** The CSL item kinds we render. Others normalize to "document" (generic). */
export const CSL_SOURCE_TYPES = [
  "article-journal",
  "book",
  "chapter",
  "paper-conference",
  "webpage",
  "document",
] as const;
export type CslSourceType = (typeof CSL_SOURCE_TYPES)[number];
export const DEFAULT_CSL_SOURCE_TYPE: CslSourceType = "document";

/** Caps. Generous enough for real bibliographic data but bound a forged doc. */
export const MAX_SOURCES = 1_000;
export const MAX_AUTHORS_PER_SOURCE = 50;
export const MAX_CSL_FIELD_LENGTH = 1_000;
export const MAX_LOCATOR_LENGTH = 120;
/** A source id is an opaque token; bound its length so the DOM attr is sane. */
export const MAX_SOURCE_ID_LENGTH = 64;

// Single-line text fields strip the FULL C0/C1 + DEL range (incl. tab/newline)
// and collapse whitespace runs. Written with \u escapes (NOT literal control
// bytes, which are fragile to round-trip in source) so the intent is explicit.
const FIELD_CONTROL_BYTE_RE = /[\u0000-\u001f\u007f-\u009f]+/g;
// A source id is restricted to a URL/attribute-safe token alphabet so it can
// never break out of the `data-source-id` attribute or inject markup.
const SOURCE_ID_DISALLOWED_RE = /[^A-Za-z0-9_-]+/g;
// A safe http(s) URL for the optional `URL` field. Anything else (javascript:,
// data:, relative, ...) is dropped so a rendered link can never carry an unsafe
// scheme. The bibliography renders the URL as TEXT (never as an href), but we
// still gate the scheme so a future linkified renderer cannot regress.
const SAFE_URL_RE = /^https?:\/\/[^\s]+$/i;

/** A single contributor name, CSL "name-variable" subset (family + given). */
export interface CslName {
  family: string;
  given: string;
}

/** A CSL-JSON-like source item (the subset the editor authors + renders). */
export interface CslSource {
  id: string;
  type: CslSourceType;
  title: string;
  author: CslName[];
  /** Issue year as a string ("2021"), or "" when unknown (CSL "issued"). */
  year: string;
  containerTitle: string;
  publisher: string;
  volume: string;
  issue: string;
  page: string;
  url: string;
}

/** One ordered Word CITATION segment (the first Tag plus every `\\m` source). */
export interface CitationSegment {
  sourceId: string;
  locale: string;
  volume: string;
  locator: string;
  prefix: string;
  suffix: string;
  suppressAuthor: boolean;
  suppressTitle: boolean;
  suppressYear: boolean;
}

/** Versioned document store. `nativeAuthority` is an authenticated opaque receipt. */
export interface CitationSourceStoreEnvelope {
  version: 1;
  items: CslSource[];
  nativeAuthority?: Record<string, unknown>;
}

const MAX_NATIVE_AUTHORITY_JSON_LENGTH = 6_000_000;

function normalizeNativeAuthority(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.partName !== "string" ||
    typeof record.namespace !== "string" ||
    typeof record.sourcePartSha256 !== "string" ||
    typeof record.rawXmlB64 !== "string" ||
    !Array.isArray(record.entries) ||
    !Array.isArray(record.partReceipts)
  ) {
    return undefined;
  }
  try {
    const serialized = JSON.stringify(record);
    if (serialized.length > MAX_NATIVE_AUTHORITY_JSON_LENGTH) return undefined;
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function normalizeSourceStore(
  value: unknown,
): CitationSourceStoreEnvelope {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const items = normalizeSources(record?.version === 1 ? record.items : value);
  const nativeAuthority = normalizeNativeAuthority(record?.nativeAuthority);
  return {
    version: 1,
    items,
    ...(nativeAuthority ? { nativeAuthority } : {}),
  };
}

export function sourceStoreIsEditable(value: unknown): boolean {
  const authority = normalizeSourceStore(value).nativeAuthority;
  return (
    authority === undefined ||
    (typeof authority.editableStyle === "string" &&
      (CITATION_STYLES as readonly string[]).includes(authority.editableStyle))
  );
}

export function normalizeCitationSegments(
  value: unknown,
  fallbackSourceId?: unknown,
): CitationSegment[] {
  const candidates = Array.isArray(value)
    ? value
    : fallbackSourceId !== undefined
      ? [{ sourceId: fallbackSourceId }]
      : [];
  const out: CitationSegment[] = [];
  for (const candidate of candidates) {
    if (out.length >= 32 || !candidate || typeof candidate !== "object") break;
    const record = candidate as Record<string, unknown>;
    const sourceId = sanitizeSourceId(record.sourceId);
    if (!sourceId) return [];
    const locale = sanitizeCslField(record.locale).slice(0, 35);
    if (locale && !/^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8}){0,3}$/.test(locale)) {
      return [];
    }
    out.push({
      sourceId,
      locale,
      volume: sanitizeCslField(record.volume),
      locator: sanitizeLocator(record.locator),
      prefix: sanitizeCslField(record.prefix),
      suffix: sanitizeCslField(record.suffix),
      suppressAuthor: record.suppressAuthor === true,
      suppressTitle: record.suppressTitle === true,
      suppressYear: record.suppressYear === true,
    });
  }
  return out;
}

/**
 * Coerce a citation-style candidate to one of the whitelisted styles, else null.
 * A forged/blank/unknown value yields null so callers fall back to the default.
 */
export function sanitizeCitationStyle(value: unknown): CitationStyle | null {
  return typeof value === "string" &&
    (CITATION_STYLES as readonly string[]).includes(value)
    ? (value as CitationStyle)
    : null;
}

/** Resolve a citation-style candidate to a concrete style (default when bad). */
export function resolveCitationStyle(value: unknown): CitationStyle {
  return sanitizeCitationStyle(value) ?? DEFAULT_CITATION_STYLE;
}

/** Coerce a source-type candidate to the whitelist; unknown -> "document". */
export function sanitizeSourceType(value: unknown): CslSourceType {
  return typeof value === "string" &&
    (CSL_SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as CslSourceType)
    : DEFAULT_CSL_SOURCE_TYPE;
}

/**
 * Strip control bytes, collapse whitespace, and clamp a single-line CSL text
 * field (title, publisher, ...). Returns "" for anything that is not a non-empty
 * string after scrubbing. Markup is preserved verbatim as TEXT (the renderer
 * escapes it); this only removes control bytes and bounds the length.
 */
export function sanitizeCslField(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(FIELD_CONTROL_BYTE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > MAX_CSL_FIELD_LENGTH
    ? cleaned.slice(0, MAX_CSL_FIELD_LENGTH)
    : cleaned;
}

/**
 * Normalize a CSL "issued" year to a bare year string. Accepts a number, a year
 * string, or a CSL date-parts object ({ "date-parts": [[2021, ...]] }) and
 * extracts the 4-ish-digit year. Returns "" when no plausible year is present.
 */
export function sanitizeCslYear(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? String(n) : "";
  }
  if (typeof value === "string") {
    const match = value.match(/\d{1,4}/);
    return match ? match[0] : "";
  }
  if (value && typeof value === "object") {
    const parts = (value as { "date-parts"?: unknown })["date-parts"];
    if (Array.isArray(parts) && Array.isArray(parts[0])) {
      return sanitizeCslYear(parts[0][0]);
    }
  }
  return "";
}

/**
 * Normalize a single contributor candidate to a CslName, or null when nothing
 * usable remains. Accepts the CSL { family, given } shape OR a plain string
 * ("Jane Doe" / "Doe, Jane"). A literal CSL `literal`/`name` field (an
 * organisation) maps to a family-only name.
 */
export function normalizeCslName(value: unknown): CslName | null {
  if (typeof value === "string") {
    return parseNameString(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const family = sanitizeCslField(record.family);
    const given = sanitizeCslField(record.given);
    if (family || given) return { family, given };
    // CSL `literal` (organisation) or a generic `name` string -> family-only.
    const literal = sanitizeCslField(record.literal ?? record.name);
    if (literal) return parseNameString(literal);
  }
  return null;
}

/**
 * Parse a free-form author string into { family, given }. Supports both
 * "Family, Given" (comma form) and "Given Family" (space form). A single token
 * is treated as a family-only name (e.g. an organisation). Always returns a name
 * when the input scrubs to anything non-empty, else null.
 */
export function parseNameString(value: unknown): CslName | null {
  const cleaned = sanitizeCslField(value);
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const [family, given = ""] = cleaned.split(",", 2).map((p) => p.trim());
    return { family: family || cleaned, given: given.slice(0, MAX_CSL_FIELD_LENGTH) };
  }
  const tokens = cleaned.split(" ");
  if (tokens.length === 1) return { family: tokens[0], given: "" };
  const family = tokens[tokens.length - 1];
  const given = tokens.slice(0, -1).join(" ");
  return { family, given };
}

/**
 * The inverse of {@link parseNameString}: the text an author field shows for
 * a name so that saving it unchanged reads back the SAME name. A family-only
 * name of several words (an organisation, "World Health Organization") keeps
 * the trailing comma that marks its given name as empty; without it the next
 * save would read the last word as the family name.
 */
export function formatCslNameForEditing(name: CslName): string {
  if (name.family && name.given) return `${name.family}, ${name.given}`;
  if (name.family) return name.family.includes(" ") ? `${name.family},` : name.family;
  return name.given;
}

/**
 * Normalize an arbitrary source-id candidate to a bounded, attribute-safe token.
 * Strips every character outside [A-Za-z0-9_-] and clamps the length. Returns
 * null when nothing usable remains, so a forged/blank id never reaches the DOM.
 */
export function sanitizeSourceId(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = value
      .replace(SOURCE_ID_DISALLOWED_RE, "")
      .slice(0, MAX_SOURCE_ID_LENGTH);
    if (cleaned) return cleaned;
  }
  return null;
}

let sourceIdCounter = 0;

/**
 * Generate a fresh, attribute-safe source id. When a usable `seed` is supplied it
 * is reused; otherwise a new id is minted via crypto.randomUUID when available,
 * else a timestamp+counter fallback. Funneled through sanitizeSourceId so it is
 * always within the safe alphabet + length bound. Mirrors footnoteIdFor.
 */
export function sourceIdFor(seed?: unknown): string {
  const fromSeed = sanitizeSourceId(seed);
  if (fromSeed) return fromSeed;
  let raw: string;
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as { randomUUID?: () => string } | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    raw = cryptoObj.randomUUID();
  } else {
    sourceIdCounter += 1;
    raw = `src-${Date.now().toString(36)}-${sourceIdCounter.toString(36)}`;
  }
  const safe = sanitizeSourceId(raw);
  if (safe) return safe;
  sourceIdCounter += 1;
  return `src${sourceIdCounter}`;
}

/**
 * The tag Word proposes for a new source: the first three letters of the
 * first author's family name and the last two digits of the year ("Smi20");
 * with no author, the first letters of the title; with neither,
 * "Placeholder1". A tag already in the document takes a numeric suffix
 * ("Smi201", "Smi202", ...). Letters outside the id alphabet are dropped
 * first, so a name with none of them falls through to the next rule.
 */
export function defaultSourceTag(
  candidate: {
    author?: readonly unknown[];
    title?: unknown;
    year?: unknown;
  },
  taken: Iterable<string>,
): string {
  const occupied = new Set(taken);
  const letters = (value: string): string =>
    value.replace(SOURCE_ID_DISALLOWED_RE, "").replace(/[_-]+/g, "").slice(0, 3);
  const firstAuthor = normalizeCslName(candidate.author?.[0]);
  const stem =
    letters(firstAuthor ? firstAuthor.family || firstAuthor.given : "") ||
    letters(sanitizeCslField(candidate.title));
  if (!stem) {
    for (let n = 1; n <= occupied.size + 1; n += 1) {
      if (!occupied.has(`Placeholder${n}`)) return `Placeholder${n}`;
    }
  }
  const base = `${stem}${sanitizeCslYear(candidate.year).slice(-2)}`;
  if (!occupied.has(base)) return base;
  for (let suffix = 1; suffix <= occupied.size + 1; suffix += 1) {
    const candidateTag = `${base}${suffix}`;
    if (!occupied.has(candidateTag)) return candidateTag;
  }
  return sourceIdFor();
}

/** Sanitize the optional URL: only a safe http(s) URL survives, else "". */
export function sanitizeCslUrl(value: unknown): string {
  const cleaned = sanitizeCslField(value);
  return SAFE_URL_RE.test(cleaned) ? cleaned : "";
}

/**
 * Normalize a single source candidate to a clean CslSource, or null when it has
 * no usable id OR no minimally-citable content (needs at least a title or one
 * author — a source with neither cannot be rendered as a reference). All fields
 * sanitized; the author list is capped.
 */
export function normalizeSource(value: unknown): CslSource | null {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = sanitizeSourceId(record.id);
  if (!id) return null;

  const rawAuthors = Array.isArray(record.author)
    ? record.author
    : Array.isArray((record as { authors?: unknown }).authors)
      ? ((record as { authors: unknown[] }).authors)
      : [];
  const author: CslName[] = [];
  for (const candidate of rawAuthors) {
    if (author.length >= MAX_AUTHORS_PER_SOURCE) break;
    const name = normalizeCslName(candidate);
    if (name) author.push(name);
  }

  const title = sanitizeCslField(record.title);
  // A source with neither a title nor any author carries no citable
  // information; drop it so a dangling citation mark degrades to a bare marker.
  if (!title && author.length === 0) return null;

  return {
    id,
    type: sanitizeSourceType(record.type),
    title,
    author,
    year: sanitizeCslYear(record.year ?? record.issued),
    containerTitle: sanitizeCslField(
      record.containerTitle ?? record["container-title"],
    ),
    publisher: sanitizeCslField(record.publisher),
    volume: sanitizeCslField(record.volume),
    issue: sanitizeCslField(record.issue),
    page: sanitizeCslField(record.page),
    url: sanitizeCslUrl(record.url ?? record.URL),
  };
}

/**
 * Normalize + dedupe an array of source candidates. The first occurrence of any
 * given (sanitized) id wins; later duplicates are discarded. Caps the total
 * source count. Always returns an array (never throws), so garbage yields [].
 */
export function normalizeSources(value: unknown): CslSource[] {
  const candidates =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { version?: unknown; items?: unknown }).version === 1
        ? (value as { items?: unknown }).items
        : null
      : value;
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: CslSource[] = [];
  for (const candidate of candidates) {
    if (out.length >= MAX_SOURCES) break;
    const source = normalizeSource(candidate);
    if (!source) continue;
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    out.push(source);
  }
  return out;
}

/**
 * Add or REPLACE a source in the store (keyed by id), returning a NEW sources
 * array. The candidate is normalized; an unusable candidate is a no-op (same
 * reference). When the id already exists its entry is replaced in place (an edit);
 * otherwise the source is appended. Caps the total source count on insert.
 */
export function upsertSource(
  sources: CslSource[],
  candidate: unknown,
): CslSource[] {
  const next = normalizeSource(candidate);
  if (!next) return sources;
  const index = sources.findIndex((source) => source.id === next.id);
  if (index >= 0) {
    const replaced = sources.slice();
    replaced[index] = next;
    return replaced;
  }
  if (sources.length >= MAX_SOURCES) return sources;
  return [...sources, next];
}

/**
 * Remove the source with the given id, returning a NEW sources array. A no-op
 * (same reference) when the source is missing. The caller is responsible for also
 * stripping any matching citation marks from the document.
 */
export function removeSource(
  sources: CslSource[],
  sourceId: unknown,
): CslSource[] {
  const id = sanitizeSourceId(sourceId);
  if (!id) return sources;
  const next = sources.filter((source) => source.id !== id);
  return next.length === sources.length ? sources : next;
}

/** Look up a source by (sanitized) id, or null when absent. */
export function findSource(
  sources: CslSource[],
  sourceId: unknown,
): CslSource | null {
  const id = sanitizeSourceId(sourceId);
  if (!id) return null;
  return sources.find((source) => source.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared by APA + IEEE).
// ---------------------------------------------------------------------------

/** The first author's family name (for sorting / in-text author), or "". */
export function firstAuthorFamily(source: CslSource): string {
  return source.author[0]?.family ?? "";
}







function firstLetter(part: string): string {
  const match = /^\p{L}\p{M}*/u.exec(part.normalize("NFC"));
  return match ? match[0] : "";
}

/** Whether a letter is a capital (a letter of a script without case is not). */
function isCapital(letter: string): boolean {
  return letter !== letter.toLowerCase() && letter === letter.toUpperCase();
}








function initials(given: string): string {
  const tokens = given.normalize("NFC").split(/[\s.]+/u).filter(Boolean);
  return tokens
    .map((token) => {
      const pieces = token.split("-").filter(Boolean);
      const letters: string[] = [];
      pieces.forEach((piece, index) => {
        const letter = firstLetter(piece);
        if (!letter) return;
        if (index === 0 || isCapital(letter)) letters.push(letter);
      });
      return letters.map((letter) => `${letter.toUpperCase()}.`).join("-");
    })
    .filter(Boolean)
    .join(" ");
}

/** Whether two sources name the same people, in the same order. */
function sameAuthors(left: CslSource, right: CslSource): boolean {
  if (left.author.length !== right.author.length) return false;
  return left.author.every((name, index) => {
    const other = right.author[index];
    return (
      name.family.toLowerCase() === other.family.toLowerCase() &&
      name.given.toLowerCase() === other.given.toLowerCase()
    );
  });
}

/**
 * The order of two author lists, as a reference list files them: by the
 * first author's family name, then -- one author against the same one -- a
 * work with fewer authors before one with more (APA 7 §9.46: "Smith, J." before
 * "Smith, J., & Jones, A."), then each following author in turn (OFL-054).
 * Family names compare case-folded, given names break a tie. 0 for the same
 * list.
 */
function compareAuthorLists(left: CslSource, right: CslSource): number {
  const count = Math.max(left.author.length, right.author.length);
  for (let index = 0; index < count; index += 1) {
    const a = left.author[index];
    const b = right.author[index];
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const fa = a.family.toLowerCase();
    const fb = b.family.toLowerCase();
    if (fa !== fb) return fa < fb ? -1 : 1;
    const ga = a.given.toLowerCase();
    const gb = b.given.toLowerCase();
    if (ga !== gb) return ga < gb ? -1 : 1;
  }
  return 0;
}

/** "Doe, J." (family + given initials). Family-only -> "Doe". */
function apaAuthor(name: CslName): string {
  const init = initials(name.given);
  return init ? `${name.family}, ${init}` : name.family;
}

/** "J. Doe" (given initials + family). Family-only -> "Doe". */
function ieeeAuthor(name: CslName): string {
  const init = initials(name.given);
  return init ? `${init} ${name.family}` : name.family;
}

/** "Doe, Jane Q." for the first MLA author; family-only -> "Doe". */
function mlaFirstAuthor(name: CslName): string {
  return name.given ? `${name.family}, ${name.given}` : name.family;
}

/** "Jane Q. Doe" for a subsequent MLA author; family-only -> "Doe". */
function mlaFollowingAuthor(name: CslName): string {
  return name.given ? `${name.given} ${name.family}` : name.family;
}

/**
 * Join an author list with a style-specific separator and an "et al." cutoff.
 * APA uses ", & " before the last of <=20 authors, two included (we cap simpler
 * at 7, then "et al."); IEEE joins two with " and " and puts ", and " before the
 * last of 3-6, then "et al.". `pairConjunction` joins exactly two names and
 * defaults to `conjunction`.
 */
function joinAuthors(
  names: string[],
  conjunction: string,
  maxBeforeEtAl: number,
  pairConjunction: string = conjunction,
): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length > maxBeforeEtAl) {
    return `${names[0]}, et al.`;
  }
  if (names.length === 2) return `${names[0]}${pairConjunction}${names[1]}`;
  const head = names.slice(0, -1).join(", ");
  const tail = names[names.length - 1];
  return `${head}${conjunction}${tail}`;
}

/**
 * Whether the source's title names a part of a larger work (a journal article,
 * a chapter, a conference paper, a web page). MLA and IEEE quote those titles
 * and italicize whole works (books, and the generic "document", which is
 * Word's Misc); the cache is plain text, so a whole work's title is unquoted.
 */
function titleIsPartOfWork(source: CslSource): boolean {
  return (
    source.type === "article-journal" ||
    source.type === "chapter" ||
    source.type === "paper-conference" ||
    source.type === "webpage"
  );
}

/**
 * Whether the reference names the source's publisher. A journal article's
 * reference ends with its journal, volume, issue and pages (APA 7 §10.1, IEEE,
 * MLA 9; Word's Journal Article form has no Publisher field): a publisher kept
 * from the source's earlier type (a book turned into an article) is kept for a
 * later switch back, never printed after the page range (WUA 238).
 */
function referenceNamesPublisher(source: CslSource): boolean {
  return Boolean(source.publisher) && source.type !== "article-journal";
}

/** Ensure a string ends with a period (without doubling one). */
function withPeriod(value: string): string {
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

// ---------------------------------------------------------------------------
// In-text citation.
// ---------------------------------------------------------------------------

/** Optional per-citation extras stored on the mark (page locator / prefix). */
export interface CitationLocator {
  locator?: string;
  prefix?: string;
}

/** Sanitize a per-citation locator (e.g. "p. 12"). "" when blank/forged. */
export function sanitizeLocator(value: unknown): string {
  const cleaned = sanitizeCslField(value);
  return cleaned.length > MAX_LOCATOR_LENGTH
    ? cleaned.slice(0, MAX_LOCATOR_LENGTH)
    : cleaned;
}

/**
 * Render an APA in-text citation for a source: "(Doe, 2021)". With a locator it
 * becomes "(Doe, 2021, p. 12)"; with a prefix "(see Doe, 2021)". Multiple authors
 * use "&": "(Doe & Roe, 2021)"; 3+ collapse to "(Doe et al., 2021)". A source
 * with no author falls back to a short title; no year -> "n.d.".
 */
export function formatApaInText(
  source: CslSource,
  locator?: CitationLocator,
  yearSuffix = "",
  /** The document's sources, for the names another author shares. */
  sources?: readonly CslSource[],
): string {
  const namePart = apaInTextNames(source, sources ?? []);
  const year = apaYear(source, yearSuffix);
  const inner = [namePart, year];
  const loc = sanitizeLocator(locator?.locator);
  // APA 7 (§8.13): "p. 4" for one page, "pp. 4-6" for a range. A bare number
  // was printed as is, "(Audit, 2021, 4)" (live Word audit WUA 124); a
  // locator that already names its unit stays as written.
  if (loc) inner.push(pagesLocator(loc));
  const prefix = sanitizeCslField(locator?.prefix);
  const body = inner.join(", ");
  return `(${prefix ? `${prefix} ` : ""}${body})`;
}

/**
 * Render an IEEE in-text citation: "[n]" where n is the source's 1-based number
 * in the citation order (its position in `orderedIds`). With a locator it becomes
 * "[n, p. 12]". A source with no number (not yet ordered) renders "[?]".
 */
export function formatIeeeInText(
  source: CslSource,
  orderedIds: string[],
  locator?: CitationLocator,
): string {
  const n = sourceNumberFor(orderedIds, source.id);
  const label = n === null ? "?" : String(n);
  const loc = sanitizeLocator(locator?.locator);
  return loc ? `[${label}, ${pagesLocator(loc)}]` : `[${label}]`;
}

/**
 * Render an MLA in-text citation: "(Doe 12)". The stored locator is already a
 * user-authored display value, so "p. 12" remains "(Doe p. 12)" rather than
 * being guessed or rewritten. Two authors are joined with "and" ("(Doe and
 * Roe)"); three or more collapse to "et al.".
 */
export function formatMlaInText(
  source: CslSource,
  locator?: CitationLocator,
  /** The document's sources, for a second work by the same author. */
  sources?: readonly CslSource[],
): string {
  const authorPart =
    source.author.length === 0
      ? shortTitle(source)
      : source.author.length === 1
        ? source.author[0].family
        : source.author.length === 2
          ? `${source.author[0].family} and ${source.author[1].family}`
          : `${source.author[0].family} et al.`;
  // MLA 9 (§6.8): two works by the same author(s) are told apart by a
  // shortened title after the name, "(Smith, Zebra Handbook 12)" against
  // "(Smith, Alpha Handbook 12)"; one work keeps the compact "(Smith 12)"
  
  const anotherWork =
    source.author.length > 0 &&
    (sources ?? []).some((other) => other.id !== source.id && sameAuthors(other, source));
  const namePart = anotherWork ? `${authorPart}, ${shortTitle(source)}` : authorPart;
  const loc = sanitizeLocator(locator?.locator);
  const prefix = sanitizeCslField(locator?.prefix);
  return `(${[prefix, namePart, loc].filter(Boolean).join(" ")})`;
}

/**
 * The author part of an APA in-text citation. One or two authors: the family
 * names; three or more: the first and "et al.". Another work of the document
 * by DIFFERENT people that would read the same takes more: a shared surname
 * gets the author's initials, "(J. Smith, 2020)" against "(A. Smith, 2019)"
 * (APA 7 §8.20); a shared "Smith et al." lists as many names as tell the two
 * apart, "(Smith, Jones, et al., 2020)" (§8.18). Two works by the same people
 * are told apart by their year letters, never here (OFL-052).
 */
function apaInTextNames(source: CslSource, sources: readonly CslSource[]): string {
  const authors = source.author;
  if (authors.length === 0) return shortTitle(source);
  const others = sources.filter(
    (other) =>
      other.id !== source.id && other.author.length > 0 && !sameAuthors(other, source),
  );
  const plain = (names: readonly CslName[]) =>
    names.length === 1
      ? names[0].family
      : names.length === 2
        ? `${names[0].family} & ${names[1].family}`
        : `${names[0].family} et al.`;
  const label = plain(authors);
  const clashing = others.filter((other) => plain(other.author) === label);
  if (clashing.length === 0) return label;
  if (authors.length <= 2) {
    // The surname another person shares takes that author's initials.
    const named = authors.map((name, index) => {
      const shared = clashing.some((other) => {
        const theirs = other.author[index];
        return (
          theirs !== undefined &&
          theirs.family.toLowerCase() === name.family.toLowerCase() &&
          theirs.given.toLowerCase() !== name.given.toLowerCase()
        );
      });
      const init = initials(name.given);
      return shared && init ? `${init} ${name.family}` : name.family;
    });
    return named.length === 1 ? named[0] : `${named[0]} & ${named[1]}`;
  }
  // Three or more: as many of the first names as make the list its own.
  const families = (names: readonly CslName[], count: number) =>
    names.slice(0, count).map((name) => name.family.toLowerCase()).join("\u0000");
  for (let count = 2; count <= authors.length; count += 1) {
    const prefix = families(authors, count);
    const stillShared = clashing.some(
      (other) => other.author.length >= count && families(other.author, count) === prefix,
    );
    if (!stillShared) {
      const listed = authors.slice(0, count).map((name) => name.family).join(", ");
      return count === authors.length ? listed : `${listed}, et al.`;
    }
  }
  return label;
}

/** A short title for an authorless source: first few words, italicised by the UI. */
export function shortTitle(source: CslSource): string {
  const words = source.title.split(" ").filter(Boolean);
  return words.slice(0, 4).join(" ") || source.id;
}

/**
 * Render the in-text citation for a source in the active style. IEEE needs the
 * citation order to resolve its number, so `orderedIds` is always threaded
 * through (ignored by APA).
 */
export function formatInText(
  style: CitationStyle,
  source: CslSource,
  orderedIds: string[],
  locator?: CitationLocator,
  /** The document's sources, for APA's same-author-same-year letters. */
  sources?: readonly CslSource[],
): string {
  if (style === "ieee") return formatIeeeInText(source, orderedIds, locator);
  if (style === "mla") return formatMlaInText(source, locator, sources);
  if (style === "apa") {
    return formatApaInText(
      source,
      locator,
      sources ? apaYearSuffixes(sources).get(source.id) : "",
      sources,
    );
  }
  return formatWordStyleInText(style, source, orderedIds, locator);
}

/** APA's year with its letter: "2026a", "n.d.-a". */
function apaYear(source: CslSource, suffix = ""): string {
  if (!suffix) return source.year || "n.d.";
  return source.year ? `${source.year}${suffix}` : `n.d.-${suffix}`;
}

/** APA orders same-author works of one year by title, without A / An / The. */
function apaTitleSortKey(source: CslSource): string {
  return source.title.toLowerCase().replace(/^(?:a|an|the)\s+/u, "");
}

/** 0 -> a, 25 -> z, 26 -> aa. */
function suffixLetters(index: number): string {
  let value = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}







export function apaYearSuffixes(sources: readonly CslSource[]): Map<string, string> {
  const groups = new Map<string, CslSource[]>();
  for (const source of sources) {
    if (source.author.length === 0) continue;
    const key = JSON.stringify([
      source.author.map((name) => [name.family.toLowerCase(), name.given.toLowerCase()]),
      source.year,
    ]);
    const group = groups.get(key);
    if (group) group.push(source);
    else groups.set(key, [source]);
  }
  const suffixes = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = group.slice().sort((a, b) => {
      const ka = apaTitleSortKey(a);
      const kb = apaTitleSortKey(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    ordered.forEach((source, index) => suffixes.set(source.id, suffixLetters(index)));
  }
  return suffixes;
}

// ---------------------------------------------------------------------------
// Bibliography entries.
// ---------------------------------------------------------------------------

/**
 * Render an APA bibliography entry for a source. Best-effort across kinds:
 *   Doe, J., & Roe, A. (2021). Title of the work. Journal, 12(3), 45-67. URL
 * Missing parts are gracefully omitted. Always plain text.
 */
export function formatApaReference(source: CslSource, yearSuffix = ""): string {
  return formatApaReferenceRuns(source, yearSuffix)
    .map((run) => run.text)
    .join("");
}

/**
 * APA 7 (§9.8): a reference names up to twenty authors, "&" before the last;
 * from twenty-one on, the first nineteen, an ellipsis, and the last. Word's
 * APA stylesheet does the same. A fixed "first author, et al." after seven
 * authors dropped the other names of an eight-author work (OFL-055).
 */
function apaReferenceAuthors(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) {
    return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
}

/** One piece of a reference, with the format the style gives it. */
export interface BibliographyRun {
  text: string;
  italic?: boolean;
}

/** `runs` with a period after the last one, unless it already ends one. The
 * period after an italic title is set in roman (APA 7 §6.22), as its own run. */
function runsWithPeriod(runs: BibliographyRun[]): BibliographyRun[] {
  const text = runs.map((run) => run.text).join("");
  if (!text) return runs;
  if (/[.!?]$/.test(text)) return runs;
  const last = runs[runs.length - 1];
  if (last.italic) return [...runs, { text: "." }];
  return [...runs.slice(0, -1), { ...last, text: `${last.text}.` }];
}






export function formatApaReferenceRuns(
  source: CslSource,
  yearSuffix = "",
): BibliographyRun[] {
  const authors = apaReferenceAuthors(source.author.map(apaAuthor));
  const year = apaYear(source, yearSuffix);
  const groups: BibliographyRun[][] = [];
  if (authors) groups.push([{ text: withPeriod(authors) }]);
  groups.push([{ text: `(${year}).` }]);
  const container = source.containerTitle;
  const titleIsItalic = !titleIsPartOfWork(source);
  if (source.title) {
    groups.push(
      titleIsItalic
        ? runsWithPeriod([{ text: source.title, italic: true }])
        : [{ text: withPeriod(source.title) }],
    );
  }
  if (source.type === "article-journal" && container) {
    const line: BibliographyRun[] = [{ text: container, italic: true }];
    if (source.volume) line.push({ text: ", " }, { text: source.volume, italic: true });
    if (source.issue) line.push({ text: `(${source.issue})` });
    if (source.page) line.push({ text: `, ${source.page}` });
    groups.push(runsWithPeriod(line));
  } else if (
    (source.type === "chapter" || source.type === "paper-conference") &&
    container
  ) {
    const line: BibliographyRun[] = [{ text: "In " }, { text: container, italic: true }];
    if (source.page) line.push({ text: ` (pp. ${source.page})` });
    groups.push(runsWithPeriod(line));
  }
  if (referenceNamesPublisher(source)) groups.push([{ text: withPeriod(source.publisher) }]);
  if (source.url) groups.push([{ text: source.url }]);
  // The groups read with one space between them, as the plain entry did.
  const runs: BibliographyRun[] = [];
  groups.forEach((group, index) => {
    if (index > 0) runs.push({ text: " " });
    for (const run of group) {
      const text = run.text.replace(/\s+/g, " ");
      if (!text) continue;
      const previous = runs[runs.length - 1];
      if (previous && Boolean(previous.italic) === Boolean(run.italic)) {
        previous.text += text;
      } else {
        runs.push({ text, italic: run.italic });
      }
    }
  });
  if (runs.length > 0) {
    runs[0].text = runs[0].text.replace(/^\s+/, "");
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
  }
  return runs.filter((run) => run.text);
}

/**
 * Render an IEEE bibliography entry (the numbering "[n]" prefix is added by the
 * renderer, not here):
 *   J. Doe and A. Roe, "Title of the work," Journal, vol. 12, no. 3, pp. 45-67,
 *   2021. URL
 * A part's title is quoted; a whole work's is not ("A. Adams, Earlier work,
 * Books Ltd, 2019."). Missing parts are gracefully omitted. Always plain text.
 */
export function formatIeeeReference(source: CslSource): string {
  const authors = joinAuthors(source.author.map(ieeeAuthor), ", and ", 6, " and ");
  const parts: string[] = [];
  if (authors) parts.push(`${authors},`);
  if (source.title) {
    parts.push(titleIsPartOfWork(source) ? `"${source.title},"` : `${source.title},`);
  }
  const container = source.containerTitle;
  if (container) parts.push(`${container},`);
  if (source.volume) parts.push(`vol. ${source.volume},`);
  if (source.issue) parts.push(`no. ${source.issue},`);
  if (source.page) parts.push(`pp. ${source.page},`);
  if (referenceNamesPublisher(source)) parts.push(`${source.publisher},`);
  if (source.year) parts.push(`${source.year}.`);
  let entry = parts.join(" ").replace(/\s+/g, " ").trim();
  // Ensure the entry ends with a period (when the year was absent).
  entry = withPeriod(entry.replace(/,$/, ""));
  if (source.url) entry += ` ${source.url}`;
  return entry.trim();
}

/**
 * Render a bounded MLA works-cited entry from the fields the editor actually
 * owns. No unavailable edition/access-date data is invented. A part's title is
 * quoted (Doe, Jane. "Title." Journal, ...); a whole work's is not.
 */
export function formatMlaReference(source: CslSource): string {
  const authors =
    source.author.length === 0
      ? ""
      : source.author.length === 1
        ? mlaFirstAuthor(source.author[0])
        : source.author.length === 2
          ? `${mlaFirstAuthor(source.author[0])}, and ${mlaFollowingAuthor(
              source.author[1],
            )}`
          : `${mlaFirstAuthor(source.author[0])}, et al.`;
  const parts: string[] = [];
  if (authors) parts.push(withPeriod(authors));
  if (source.title) {
    const title = withPeriod(source.title);
    parts.push(titleIsPartOfWork(source) ? `"${title}"` : title);
  }
  if (source.containerTitle) parts.push(`${source.containerTitle},`);
  if (source.volume) parts.push(`vol. ${source.volume},`);
  if (source.issue) parts.push(`no. ${source.issue},`);
  if (referenceNamesPublisher(source)) parts.push(`${source.publisher},`);
  if (source.year) parts.push(`${source.year},`);
  if (source.page) parts.push(`pp. ${source.page}.`);
  let entry = parts.join(" ").replace(/\s+/g, " ").trim();
  entry = withPeriod(entry.replace(/,$/, ""));
  if (source.url) entry += ` ${source.url}`;
  return entry.trim();
}

// ---------------------------------------------------------------------------
// The other styles of Word's Style list. Each reproduces the plain text of
// what Word's stylesheet of that name writes for the source kinds the editor
// authors (measured with Word 16; see WORD-CITATION-STYLES.md). The model has
// no city, so the styles that print a place show Word's "s.l." (sine loco).
// Word sets a no-break space before " :", " -" and " /" in the ISO 690 and
// GOST families; it is written \u00a0 here.
// ---------------------------------------------------------------------------

type WordCitationStyle = Exclude<CitationStyle, "apa" | "mla" | "ieee">;

/** A name with a family part: a given-only name reads as a single name. */
function wordName(name: CslName): CslName {
  return name.family ? name : { family: name.given, given: "" };
}

function wordNames(source: CslSource): CslName[] {
  return source.author.map(wordName);
}

/** "Doe, Jane Quinn"; a single name stays as it is. */
function nameFamilyFirst(name: CslName, separator = ", "): string {
  return name.given ? `${name.family}${separator}${name.given}` : name.family;
}

/** "A", "A and B", "A, B and C" (`last` is the final conjunction). */
function joinNames(names: string[], last: string, separator = ", "): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(separator)}${last}${names[names.length - 1]}`;
}

/** Whether a page value names more than one page ("45-67", "3, 9"). */
function isPageRange(pages: string): boolean {
  return /[-‐-―,;&\s]/.test(pages);
}

/** "p. 77" / "pp. 45-67" with the style's own abbreviations. */
function pagesLabel(pages: string, one = "p. ", many = "pp. "): string {
  return `${isPageRange(pages) ? many : one}${pages}`;
}

/**
 * A citation's locator the way these styles print it: Word puts "p." / "pp."
 * before the pages. A locator that already says what it counts ("ch. 3",
 * "p. 12") is kept as written.
 */
function pagesLocator(locator: string, one = "p. ", many = "pp. "): string {
  return /^\d[\d\s,;‐-―-]*$/.test(locator)
    ? pagesLabel(locator, one, many)
    : locator;
}

/** Journal articles and conference papers lead with their title in ISO 690. */
function leadsWithTitle(source: CslSource): boolean {
  return (
    (source.type === "article-journal" || source.type === "paper-conference") &&
    source.title !== ""
  );
}

function isIsoStyle(style: WordCitationStyle): boolean {
  return style === "gb7714" || style === "iso690" || style === "iso690-numerical";
}

/** Drop empty parts and join the rest. */
function joinParts(parts: Array<string | false>, separator: string): string {
  return parts.filter(Boolean).join(separator);
}

function formatWordStyleInText(
  style: WordCitationStyle,
  source: CslSource,
  orderedIds: string[],
  locator?: CitationLocator,
): string {
  const names = wordNames(source).map((name) => name.family);
  const loc = sanitizeLocator(locator?.locator);
  const prefix = sanitizeCslField(locator?.prefix);
  const lead = prefix ? `${prefix} ` : "";

  if (style === "chicago" || style === "turabian") {
    const who =
      names.length === 0
        ? source.title || source.id
        : names.length > 3
          ? `${names[0]}, et al.`
          : joinNames(names, " and ");
    return `(${lead}${who} ${source.year || "n.d."}${loc ? `, ${loc}` : ""})`;
  }
  if (style === "harvard-anglia") {
    const who =
      names.length === 0
        ? "Anon."
        : names.length > 2
          ? `${names[0]}, et al.`
          : joinNames(names, " & ");
    return `(${lead}${who}, ${source.year || "n.d."}${
      loc ? `, ${pagesLocator(loc)}` : ""
    })`;
  }
  if (style === "iso690-numerical") {
    const n = sourceNumberFor(orderedIds, source.id);
    return `(${lead}${n === null ? "?" : n}${loc ? ` ${pagesLocator(loc)}` : ""})`;
  }
  if (style === "sist02") {
    const who = leadsWithTitle(source)
      ? source.title
      : names.length > 1
        ? `${names[0]}et al.`
        : (names[0] ?? "");
    const body =
      joinParts([who, source.year], "，") || source.title || source.id;
    return `（${lead}${body}${loc ? pagesLocator(loc, "p.", "pp.") : ""}）`;
  }
  // GB7714, ISO 690 (first element and date), GOST: "(First, Year)".
  const who =
    isIsoStyle(style) && leadsWithTitle(source)
      ? source.title
      : names.length > 1
        ? `${names[0]}, et al.`
        : (names[0] ?? "");
  const body = joinParts([who, source.year], ", ") || source.title || source.id;
  return `(${lead}${body}${loc ? ` ${pagesLocator(loc)}` : ""})`;
}

/** Chicago / Turabian author list: "Doe, Jane, Amy Roe, and Bo Poe". */
function chicagoAuthors(source: CslSource, style: "chicago" | "turabian"): string {
  const names = wordNames(source).map((name, index) =>
    index === 0
      ? nameFamilyFirst(name)
      : name.given
        ? `${name.given} ${name.family}`
        : name.family,
  );
  if (style === "turabian" && names.length > 6) return `${names[0]}, et al.`;
  if (names.length > 10) return `${names.slice(0, 7).join(", ")}, et al.`;
  if (names.length === 2) return `${names[0]}, and ${names[1]}`;
  return joinNames(names, ", and ");
}

function quotedTitle(source: CslSource): string {
  return source.title ? `"${withPeriod(source.title)}"` : "";
}

function formatChicagoReference(source: CslSource): string {
  const { containerTitle: container, volume, issue, page, publisher } = source;
  const parts: Array<string | false> = [
    withPeriod(chicagoAuthors(source, "chicago")),
    withPeriod(source.year || "n.d."),
  ];
  if (source.type === "book") {
    parts.push(withPeriod(source.title), withPeriod(publisher));
  } else if (source.type === "article-journal") {
    let line = container;
    if (volume) line += ` ${volume}`;
    if (issue) line += ` (${issue})`;
    if (page) line += volume || issue ? `: ${page}` : ` ${page}`;
    parts.push(quotedTitle(source), withPeriod(line.trim()));
  } else if (source.type === "chapter") {
    const line = joinParts([container && `In ${container}`, page], ", ");
    parts.push(quotedTitle(source), withPeriod(line), withPeriod(publisher));
  } else if (source.type === "paper-conference") {
    parts.push(
      quotedTitle(source),
      withPeriod(container),
      withPeriod(publisher),
      withPeriod(page),
    );
  } else if (source.type === "webpage") {
    parts.push(quotedTitle(source), source.url && `${source.url}.`);
  } else {
    parts.push(quotedTitle(source), withPeriod(publisher));
  }
  return joinParts(parts, " ");
}

function formatTurabianReference(source: CslSource): string {
  const { containerTitle: container, volume, issue, page, publisher } = source;
  const date = source.year || "n.d.";
  const published = withPeriod(joinParts([publisher, date], ", "));
  const parts: Array<string | false> = [
    withPeriod(chicagoAuthors(source, "turabian")),
  ];
  if (source.type === "book") {
    parts.push(withPeriod(source.title), published);
  } else if (source.type === "article-journal") {
    let line = container;
    if (volume || issue) {
      if (volume) line += ` ${volume}`;
      if (issue) line += `, no. ${issue}`;
      line += ` (${date})`;
    } else {
      line += `, ${date}`;
    }
    if (page) line += `: ${page}`;
    parts.push(quotedTitle(source), withPeriod(line.replace(/^[,\s]+/, "")));
  } else if (source.type === "chapter") {
    const line = joinParts([container && `In ${container}`, page], ", ");
    parts.push(quotedTitle(source), withPeriod(line), published);
  } else if (source.type === "paper-conference") {
    parts.push(
      quotedTitle(source),
      withPeriod(container),
      published,
      withPeriod(page),
    );
  } else if (source.type === "webpage") {
    parts.push(
      quotedTitle(source),
      withPeriod(date),
      source.url && `${source.url}.`,
    );
  } else {
    parts.push(quotedTitle(source), published);
  }
  return joinParts(parts, " ");
}

function formatHarvardReference(source: CslSource): string {
  const { containerTitle: container, volume, issue, publisher } = source;
  const names = wordNames(source).map((name) => {
    const init = initials(name.given);
    return init ? `${name.family}, ${init}` : name.family;
  });
  const authors =
    names.length === 0
      ? "Anon."
      : names.length > 4
        ? `${names[0]} et al.`
        : joinNames(names, " & ");
  const pages = source.page ? pagesLabel(source.page) : "";
  const title = withPeriod(source.title);
  const parts: Array<string | false> = [
    `${authors}, ${withPeriod(source.year || "n.d.")}`,
    title,
  ];
  if (source.type === "article-journal") {
    const numbering =
      volume && issue
        ? `${volume}(${issue})`
        : volume
          ? `Volume ${volume}`
          : issue
            ? `Issue ${issue}`
            : "";
    parts.push(withPeriod(joinParts([container, numbering, pages], ", ")));
  } else if (source.type === "chapter") {
    parts.push(
      container && `In: ${withPeriod(container)}`,
      withPeriod(joinParts([`s.l.:${publisher || "s.n."}`, pages], ", ")),
    );
  } else if (source.type === "paper-conference") {
    parts.push(withPeriod(joinParts(["s.l.", publisher || "s.n.", pages], ", ")));
  } else if (source.type === "webpage") {
    parts.push(
      source.url ? `[Online] Available at: ${source.url}` : "[Online].",
    );
  } else {
    parts.push(withPeriod(`s.l.:${publisher || "s.n."}`));
  }
  return joinParts(parts, " ");
}

/** GB7714 and both ISO 690 styles; the numerical one has no leading date. */
function formatIsoReference(source: CslSource, withDate: boolean): string {
  const { containerTitle: container, volume, issue, publisher, year } = source;
  const names = wordNames(source).map((name) => nameFamilyFirst(name));
  const authors = withPeriod(
    names.length > 3 ? `${names[0]}, et al.` : joinNames(names, " and "),
  );
  const date = withDate && year ? `${year}.` : "";
  const title = withPeriod(source.title);
  const published = publisher
    ? joinParts([`s.l.\u00a0: ${publisher}`, year], ", ")
    : year;
  const pages = source.page ? pagesLabel(source.page) : "";
  let parts: Array<string | false>;
  if (source.type === "article-journal") {
    parts = [
      title,
      authors,
      date,
      withPeriod(
        joinParts([issue, year, container, volume && `Vol. ${volume}`, pages], ", "),
      ),
    ];
  } else if (source.type === "paper-conference") {
    parts = [
      title,
      authors,
      date,
      withPeriod(published),
      withPeriod(container),
      withPeriod(pages),
    ];
  } else if (source.type === "chapter") {
    parts = [
      authors,
      date,
      title,
      withPeriod(container),
      withPeriod(joinParts([published, pages], ", ")),
    ];
  } else if (source.type === "webpage") {
    parts = [
      authors,
      date,
      title,
      "[Online]",
      year && `${year}.`,
      source.url && `${source.url}.`,
    ];
  } else {
    parts = [authors, date, title, withPeriod(published)];
  }
  return joinParts(parts, " ");
}

/** The kind GOST prints after the title; Word prints none for Misc. */
const GOST_KIND: Record<CslSourceType, string> = {
  "article-journal": "[Journal]",
  book: "[Book]",
  chapter: "[Book Section]",
  "paper-conference": "[Conference]",
  webpage: "[Online]",
  document: "",
};

function formatGostReference(source: CslSource, titleFirst: boolean): string {
  const { containerTitle: container, volume, issue, publisher, year } = source;
  const names = wordNames(source).map((name) => nameFamilyFirst(name, " "));
  const authors =
    names.length > 3 ? `${names[0]} [et al.]` : joinNames(names, " and ");
  const titled = joinParts([source.title, GOST_KIND[source.type]], " ");
  let head = titleFirst
    ? joinParts([titled, authors && `/ auth. ${authors}`], "\u00a0")
    : joinParts([authors, titled], " ");
  const published = publisher
    ? joinParts([`[s.l.]\u00a0: ${publisher}`, year], ", ")
    : year;
  const pages = source.page ? pagesLabel(source.page) : "";
  let segments: Array<string | false>;
  if (source.type === "article-journal") {
    segments = [
      year,
      volume && issue ? `${issue}\u00a0: Vol. ${volume}` : volume ? `Vol. ${volume}` : issue,
      pages,
    ];
  } else if (source.type === "paper-conference") {
    segments = [published, pages];
  } else if (source.type === "webpage") {
    segments = [year, source.url];
  } else {
    segments = [published];
  }
  if (
    container &&
    (source.type === "article-journal" ||
      source.type === "chapter" ||
      source.type === "paper-conference")
  ) {
    head = joinParts([head, `// ${container}`], "\u00a0");
  }
  return `${joinParts([head, ...segments], ".\u00a0- ")}.`;
}

function formatSistReference(source: CslSource): string {
  const STOP = "．";
  const COMMA = "，";
  const { containerTitle: container, volume, issue, publisher, year } = source;
  const stop = (value: string): string => (value ? `${value}${STOP}` : "");
  const names = wordNames(source).map((name) => nameFamilyFirst(name, ""));
  const authors = names.length > 3 ? `${names[0]}et al.` : names.join(", ");
  const title = stop(source.title);
  const published = publisher
    ? joinParts([`s.l.${COMMA}${publisher}`, year], COMMA)
    : year;
  const pages = source.page ? pagesLabel(source.page, "p.", "pp.") : "";
  let entry: string;
  if (source.type === "article-journal") {
    const tail = joinParts(
      [issue, year, container, volume && `Vol. ${volume}`, pages],
      COMMA,
    );
    entry = `${title}${title ? " " : ""}${authors}${stop(tail)}`;
  } else if (source.type === "paper-conference") {
    entry = `${title}${title ? " " : ""}${authors}${stop(published)}${stop(
      container,
    )}${stop(pages)}`;
  } else if (source.type === "chapter") {
    entry = `${authors}${title}${stop(container)}${stop(
      joinParts([published, pages], COMMA),
    )}`;
  } else if (source.type === "webpage") {
    entry = `${authors}${title}[Online]${stop(year)}${stop(source.url)}`;
  } else if (source.type === "book") {
    entry = `${authors}${authors && title ? " " : ""}${title}${stop(published)}`;
  } else {
    entry = `${authors}${title}${stop(published)}`;
  }
  return entry.trim();
}

function formatWordStyleReference(
  style: WordCitationStyle,
  source: CslSource,
): string {
  switch (style) {
    case "chicago":
      return formatChicagoReference(source);
    case "turabian":
      return formatTurabianReference(source);
    case "harvard-anglia":
      return formatHarvardReference(source);
    case "gost-name":
      return formatGostReference(source, false);
    case "gost-title":
      return formatGostReference(source, true);
    case "sist02":
      return formatSistReference(source);
    case "iso690-numerical":
      return formatIsoReference(source, false);
    default:
      return formatIsoReference(source, true);
  }
}

/**
 * What an unnumbered Word style sorts its bibliography by: the authors, or
 * the title of a source that has none. GOST - Title Sort always sorts by
 * title, and the ISO 690 family sorts a title-led entry by its title.
 * Harvard files an authorless source under "Anon.".
 */
function wordStyleSortKey(style: WordCitationStyle, source: CslSource): string {
  const title = source.title.toLowerCase();
  if (style === "gost-title") return title;
  if ((isIsoStyle(style) || style === "sist02") && leadsWithTitle(source)) {
    return title;
  }
  const authors = wordNames(source)
    .map((name) => `${name.family} ${name.given}`.trim())
    .join("; ")
    .toLowerCase();
  if (authors) return authors;
  return style === "harvard-anglia" ? "anon." : title;
}

/** Render a single bibliography entry in the active style (no number prefix). */
export function formatReference(
  style: CitationStyle,
  source: CslSource,
): string {
  if (style === "ieee") return formatIeeeReference(source);
  if (style === "mla") return formatMlaReference(source);
  if (style === "apa") return formatApaReference(source);
  return formatWordStyleReference(style, source);
}

/** A bibliography row projected for rendering: optional number + entry text. */
export interface BibliographyEntry {
  id: string;
  /** 1-based number in a numeric style, or null for an unnumbered one. */
  number: number | null;
  /** The number as the style prints it ("[1]", "1."), or null. */
  label: string | null;
  text: string;
  /** The entry's pieces with the format the style gives each (an APA book
   * title in italics); absent for a style the editor sets as plain text. The
   * runs' text is `text`. */
  runs?: readonly BibliographyRun[];
}

/** A numeric style's label for entry `n`: IEEE "[n]", ISO 690 "n.". */
export function bibliographyNumberLabel(
  style: CitationStyle,
  n: number,
): string {
  return style === "iso690-numerical" ? `${n}.` : `[${n}]`;
}

/** The styles in which Word replaces a repeated author with a dash. */
const REPEATED_AUTHOR_DASH_STYLES = new Set<CitationStyle>([
  "chicago",
  "turabian",
  "gb7714",
  "iso690",
  "sist02",
]);

/** The author run an entry of this style opens with, as its formatter writes it. */
function wordStyleAuthorLead(style: CitationStyle, source: CslSource): string {
  if (style === "chicago" || style === "turabian") {
    return chicagoAuthors(source, style);
  }
  if (style === "sist02") {
    const names = wordNames(source).map((name) => nameFamilyFirst(name, ""));
    return names.length > 3 ? `${names[0]}et al.` : names.join(", ");
  }
  const names = wordNames(source).map((name) => nameFamilyFirst(name));
  return names.length > 3 ? `${names[0]}, et al.` : joinNames(names, " and ");
}

/**
 * Word's bibliography writes a dash for the author of a work that follows
 * another by the same author ("—. 2013. Later book."), in the styles above.
 * Only entries that open with the author take it; an entry led by its title
 * keeps its text.
 */
function dashRepeatedAuthors(
  style: CitationStyle,
  ordered: readonly CslSource[],
  texts: readonly string[],
): string[] {
  if (!REPEATED_AUTHOR_DASH_STYLES.has(style)) return [...texts];
  let previousLead = "";
  return texts.map((text, index) => {
    const lead = wordStyleAuthorLead(style, ordered[index]);
    const opensWithAuthor = lead !== "" && text.startsWith(lead);
    const repeated = opensWithAuthor && lead === previousLead;
    previousLead = opensWithAuthor ? lead : "";
    if (!repeated) return text;
    const rest = text.slice(lead.length);
    if (/^[.．]/.test(rest)) return `—${rest}`;
    return `—${style === "sist02" ? "．" : "."}${rest}`;
  });
}

/**
 * Build the ordered, formatted bibliography for the cited sources.
 *
 *  - `orderedIds` is the list of source ids in the order their citation marks
 *    FIRST appear in the document (computed by the extension). Every source of
 *    the document is listed, as in Word; uncited ones come after the cited.
 *  - APA/MLA: entries sorted alphabetically by first-author family then year;
 *             no number prefix.
 *  - IEEE : entries in citation order, numbered [1], [2], ... matching the in-text
 *           markers.
 *
 * PURE: given the same store + order it always yields the same list.
 */
export function buildBibliography(
  style: CitationStyle,
  sources: CslSource[],
  orderedIds: string[],
): BibliographyEntry[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  // Cited sources in first-citation order, de-duplicated.
  const seen = new Set<string>();
  const cited: CslSource[] = [];
  for (const rawId of orderedIds) {
    const id = sanitizeSourceId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const source = byId.get(id);
    if (source) cited.push(source);
  }
  // Word's bibliography lists every source of the document, cited or not;
  // the uncited ones follow the cited ones where the style keeps citation
  // order, and are sorted in with them otherwise.
  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    cited.push(source);
  }

  if (isNumericCitationStyle(style)) {
    // Numbered in citation order.
    return cited.map((source, i) => ({
      id: source.id,
      number: i + 1,
      label: bibliographyNumberLabel(style, i + 1),
      text: formatReference(style, source),
    }));
  }

  if (style !== "apa" && style !== "mla") {
    const keyed = cited.map((source) => ({
      source,
      key: wordStyleSortKey(style, source),
    }));
    keyed.sort((a, b) => {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      if (a.source.year !== b.source.year) {
        return a.source.year < b.source.year ? -1 : 1;
      }
      const ta = a.source.title.toLowerCase();
      const tb = b.source.title.toLowerCase();
      return ta === tb ? 0 : ta < tb ? -1 : 1;
    });
    const texts = dashRepeatedAuthors(
      style,
      keyed.map(({ source }) => source),
      keyed.map(({ source }) => formatWordStyleReference(style, source)),
    );
    return keyed.map(({ source }, index) => ({
      id: source.id,
      number: null,
      label: null,
      text: texts[index],
    }));
  }

  // APA / MLA: alphabetical by the first author's family name, then by the
  // whole author list (one author before co-authors, each following author
  // in turn; OFL-054). The same people: APA by year, then title (§9.47); MLA
  // by title, an initial article ignored, whatever the years (MLA 9 §5.126;
  
  // author's place, an initial article ignored (APA 7 §9.44, MLA "source
  // with no author"): "Zebra guide" files under Z, not before every author.
  const leadKey = (source: CslSource) =>
    firstAuthorFamily(source).toLowerCase() || apaTitleSortKey(source);
  const sorted = cited.slice().sort((a, b) => {
    const fa = leadKey(a);
    const fb = leadKey(b);
    if (fa !== fb) return fa < fb ? -1 : 1;
    const byAuthors = compareAuthorLists(a, b);
    if (byAuthors !== 0) return byAuthors;
    const ka = apaTitleSortKey(a);
    const kb = apaTitleSortKey(b);
    if (style === "mla") {
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.year !== b.year) return a.year < b.year ? -1 : 1;
    } else {
      if (a.year !== b.year) return a.year < b.year ? -1 : 1;
      if (ka !== kb) return ka < kb ? -1 : 1;
    }
    return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
  });
  const suffixes = style === "apa" ? apaYearSuffixes(sources) : new Map<string, string>();
  return sorted.map((source) => {
    if (style === "mla") {
      return { id: source.id, number: null, label: null, text: formatMlaReference(source) };
    }
    const runs = formatApaReferenceRuns(source, suffixes.get(source.id));
    return {
      id: source.id,
      number: null,
      label: null,
      text: runs.map((run) => run.text).join(""),
      runs,
    };
  });
}

/**
 * The 1-based citation number for a source id given the document citation order,
 * or null when the id is not cited. Used by the IEEE in-text marker so it agrees
 * with the bibliography numbering.
 */
export function sourceNumberFor(
  orderedIds: string[],
  sourceId: unknown,
): number | null {
  const id = sanitizeSourceId(sourceId);
  if (!id) return null;
  const seen = new Set<string>();
  let n = 0;
  for (const rawId of orderedIds) {
    const candidate = sanitizeSourceId(rawId);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    n += 1;
    if (candidate === id) return n;
  }
  return null;
}
