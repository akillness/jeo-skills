"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document COMMENT THREADS (Word/WPS "comments" parity) — pure logic.
 *
 * A user selects text and adds a COMMENT. The selected range gets an inline
 * "comment" mark carrying a `threadId`; a thread record holds the comment plus
 * any replies and a resolved flag. Threads are persisted as an ADDITIVE optional
 * field on the top-level document node's `attrs.commentThreads` (see
 * commentExtension.ts), so existing documents — which carry no thread array —
 * still validate and round-trip unchanged.
 *
 * Everything in THIS module is intentionally framework-free: it operates on
 * plain JSON-shaped values so the normalize/cap/sanitize/reply/resolve behavior
 * can be unit-tested headlessly. The TipTap mark/extension that wires this into
 * the live editor lives in commentExtension.ts.
 *
 * SECURITY: author + text are user-supplied and round-trip through persisted
 * JSON. They are always rendered as TEXT (never HTML) and are scrubbed of
 * control bytes + clamped here, so a forged document can never smuggle markup,
 * attribute-breaking payloads, or an unbounded blob past this edge.
 */

/** The inline mark name. Kept in a constant so the extension + tests agree. */
export const COMMENT_MARK_NAME = "comment";

/** Caps. Generous enough for real use but bound what a forged doc can carry. */
export const MAX_COMMENT_AUTHOR_LENGTH = 80;
export const MAX_COMMENT_TEXT_LENGTH = 4_000;
export const MAX_COMMENTS_PER_THREAD = 200;
export const MAX_COMMENT_THREADS = 500;
/** A thread id is an opaque token; bound its length so the DOM attr is sane. */
export const MAX_THREAD_ID_LENGTH = 64;
/** Stable identity and reaction caps for one comment/reply record. */
export const MAX_COMMENT_ID_LENGTH = 64;
export const MAX_COMMENT_REACTIONS = 500;
export const MAX_COMMENT_ACTOR_ID_LENGTH = 128;
export const MAX_COMMENT_ACTOR_PROVIDER_LENGTH = 64;
export const COMMENT_REACTION_PROVIDER = "MRNote";

// Control-byte scrubbers, written with \u escapes (NOT literal control
// bytes, which are fragile to round-trip in source) so the intent is explicit.
//
// COMMENT TEXT may be multi-line (replies), so it PRESERVES tab (\u0009) and
// newline (\u000a) and strips every other C0 control, DEL (\u007f), and the
// C1 control block (\u0080-\u009f). The two preserved bytes are carved out of
// the C0 range below.
const TEXT_CONTROL_BYTE_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]+/g;
// AUTHOR labels are single-line, so they strip the FULL C0/C1 + DEL range
// (including \t / \n) and then collapse all whitespace runs.
const AUTHOR_CONTROL_BYTE_RE = /[\u0000-\u001f\u007f-\u009f]+/g;
// A thread id is restricted to a URL/attribute-safe token alphabet so it can
// never break out of the `data-thread-id` attribute or inject markup.
const THREAD_ID_DISALLOWED_RE = /[^A-Za-z0-9_-]+/g;
const COMMENT_ID_RE = /^cm-([0-9A-F]{8})$/;
const ACTOR_ID_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]+/g;
const REACTION_IDENTITY_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
const NATIVE_DATE_TIME_RE =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|\+00:00)$/;
// A Word `w:date` exactly as the source wrote it: UTC `Z`, an offset, or the
// zone-less local time older Word writes. Mirrors the API's
// document_docx_comments.COMMENT_WORD_DATE_RE.
const WORD_DATE_TIME_RE =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
const INITIALS_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
/** Word's `w:initials` bound (mirrors the API's COMMENT_INITIALS_MAX). */
export const MAX_COMMENT_INITIALS_LENGTH = 20;

export type CommentReactionType = "like";

export interface CommentReaction {
  type: CommentReactionType;
  actorId: string;
  actorName: string;
  actorProvider: string;
  /** Exact optional Word reactionInfo dateUtc value. */
  dateUtc?: string;
}

export interface CommentRecord {
  /** Stable per-comment identity used by reactions and deep links. */
  id?: string;
  author: string | null;
  /** Authenticated creator provenance. Legacy/imported comments omit it. */
  actorId?: string;
  actorProvider?: string;
  text: string;
  timestamp: number | null;
  /** Exact optional Word commentExtensible dateUtc value. */
  nativeDateUtc?: string;
  




  initials?: string;
  /** The imported comment had no `w:initials`: the writers leave it out. */
  nativeInitialsAbsent?: true;
  nativeDate?: string;
  /**
   * An imported Word comment's full `w:author` when it is longer than the 80
   * characters `author` shows (the Word 2013 preview wrote
   * "Name <Name <Name <mail>>>"). Kept only beside the author it shortens
   * to; the DOCX writer writes it back.
   */
  nativeAuthor?: string;
  /**
   * The author's Word presence (`word/people.xml` w15:presenceInfo) of an
   * imported comment. Source provenance only: it never grants ownership
   * (that is actorId/actorProvider); the DOCX writer writes it back.
   */
  nativePerson?: { providerId: string; userId: string };
  /**
   * An imported Word comment's own body XML when its text cannot hold what
   * the body shows (a field, a list paragraph, a table, run formatting).
   * Carried opaque: never rendered here; the DOCX writer writes it back
   * whole while the comment's text still reads the same, and drops it once
   * the text was edited (projection.comment_native_body_text).
   */
  nativeBody?: string;
  /**
   * The addresses the links of `nativeBody` name (`w:hyperlink r:id`):
   * relationship id -> address. Carried only with the body; the DOCX writer
   * relates them again in the package it builds.
   */
  nativeLinks?: Record<string, string>;
  /**
   * An imported REPLY's own Word `w15:done` when the file gave it one other
   * than its thread's (the thread's state is its root's). The DOCX writer
   * writes it back; resolving or reopening the thread clears it, as Word's
   * Resolve sets the whole thread.
   */
  nativeDone?: boolean;
  /**
   * An imported reply to a REPLY: the position in its thread of the comment
   * it answers (Word's `w15:paraIdParent`), when that is not the root. The
   * DOCX writer writes it back; a reply it no longer follows answers the root.
   */
  nativeReplyTo?: number;
  /**
   * An imported comment whose `w:commentReference` sits in a tracked
   * deletion (`w:del` / `w:moveFrom`) or insertion (`w:ins` / `w:moveTo`) of
   * the file, and that revision's `w:id` when it has one. Word keeps a
   * comment at its reference mark: accepting that deletion, or rejecting
   * that insertion, deletes the comment (a thread's root takes its replies).
   * The page has no reference mark, so the review commands read this
   * (trackChanges droppingCommentsOfReview); nothing writes it back.
   */
  nativeReference?: "deletion" | "insertion";
  nativeReferenceRevision?: string;
  /** Word Web currently exposes Like as the first reaction type. */
  reactions?: CommentReaction[];
}

export interface CommentThread {
  id: string;
  comments: CommentRecord[];
  resolved: boolean;
  sourceMediaDisposition?: "preserve-only";
  sourceMediaFingerprint?: string;
  sourceMediaKinds?: ["image"];
  sourceMediaCount?: number;
}

export type CommentThreadValidationIssueCode =
  | "invalid_store"
  | "invalid_thread_id"
  | "duplicate_thread_id"
  | "missing_parent"
  | "invalid_reply"
  | "invalid_source_media_authority"
  | "thread_limit_exceeded"
  | "comment_limit_exceeded";

export interface CommentThreadValidationIssue {
  code: CommentThreadValidationIssueCode;
  threadId: string | null;
  commentIndex?: number;
}

export interface CommentThreadValidationResult {
  threads: CommentThread[];
  issues: CommentThreadValidationIssue[];
}

/**
 * Strip control bytes and clamp comment text. Preserves newlines/tabs (replies
 * can be multi-line) but removes every other control byte so the value is safe
 * to render as a text node. Returns "" for anything that is not a string or is
 * blank after scrubbing — callers treat "" as "no comment to add".
 *
 * NOTE: this returns a STRING (possibly empty), not null, because empty text is
 * a meaningful "reject this entry" signal the callers (addReply / normalize)
 * branch on.
 */
export function sanitizeCommentText(value: unknown): string {
  if (typeof value !== "string") return "";
  // Replace runs of disallowed control bytes with a space, collapse runs of
  // spaces/tabs (but NOT newlines — multi-line comments are valid), then trim
  // leading/trailing whitespace.
  const cleaned = value
    .replace(TEXT_CONTROL_BYTE_RE, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > MAX_COMMENT_TEXT_LENGTH
    ? cleaned.slice(0, MAX_COMMENT_TEXT_LENGTH)
    : cleaned;
}

/**
 * Strip control bytes, collapse whitespace, and clamp an author display name.
 * Returns null for anything that is not a non-empty string after scrubbing, so
 * an absent/blank/forged author renders as nothing (anonymous) rather than as a
 * dangerous attribute value. Mirrors trackChanges.sanitizeChangeAuthor.
 */
export function sanitizeCommentAuthor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(AUTHOR_CONTROL_BYTE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_COMMENT_AUTHOR_LENGTH
    ? cleaned.slice(0, MAX_COMMENT_AUTHOR_LENGTH)
    : cleaned;
}

/**
 * Coerce a timestamp to a finite, non-negative integer (epoch millis) or null.
 * Rejects NaN/Infinity/negatives and non-numeric strings.
 */
export function sanitizeCommentTimestamp(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    n = Number(value);
  }
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Preserve an exact, calendar-valid XML Schema dateTime used by Word. */
export function sanitizeCommentNativeDateUtc(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = NATIVE_DATE_TIME_RE.exec(value);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && day <= daysInMonth[month - 1] ? value : null;
}

/** Keep an imported comment author's exact Word presence identity. */
export function sanitizeCommentNativePerson(
  value: unknown,
): { providerId: string; userId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !("providerId" in record) || !("userId" in record)) {
    return null;
  }
  const providerId = exactReactionIdentity(record.providerId, 64);
  const userId = exactReactionIdentity(record.userId, 128);
  return providerId && userId ? { providerId, userId } : null;
}

/**
 * The custody bound of a comment's own body XML (mirrors the API's
 * COMMENT_NATIVE_BODY_MAX_CHARS): Word spells a long rich comment's every run
 * with its rsid and properties (a 26-paragraph note of 3,823 characters is
 * 68,680 characters of XML, corpus R491-D27), and a body dropped here is a
 * comments part the save can no longer write.
 */
export const COMMENT_NATIVE_BODY_MAX_CHARS = 262_144;

/** Carry an imported comment's own body XML as it is, or null. */
export function sanitizeCommentNativeBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value || value.length > COMMENT_NATIVE_BODY_MAX_CHARS) return null;
  // Only Word paragraphs and tables, never a DOCTYPE or an entity declaration.
  if (!/^<w:(p|tbl)[\s>]/.test(value) || value.includes("<!")) return null;
  return value;
}

const MAX_COMMENT_NATIVE_LINKS = 64;
const MAX_COMMENT_LINK_CHARS = 2_000;

/**
 * Keep an imported comment body's link addresses (relationship id -> address)
 * when every entry is one the server's writer relates (comment_native_links).
 */
export function sanitizeCommentNativeLinks(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_COMMENT_NATIVE_LINKS) return null;
  const links: Record<string, string> = {};
  for (const [key, target] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,254}$/.test(key)) return null;
    if (
      typeof target !== "string" ||
      !target ||
      target !== target.trim() ||
      target.length > MAX_COMMENT_LINK_CHARS ||
      /[\u0000-\u0020\u007f-\u009f]/.test(target)
    ) {
      return null;
    }
    links[key] = target;
  }
  return links;
}

/** Keep an imported comment's exact Word initials (may be empty). */
export function sanitizeCommentInitials(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_COMMENT_INITIALS_LENGTH ||
    INITIALS_CONTROL_RE.test(value)
  ) {
    return null;
  }
  return value;
}

/** The longest full `w:author` a comment record carries beside its author. */
export const MAX_COMMENT_NATIVE_AUTHOR_LENGTH = 255;

/**
 * Keep an imported comment's full Word author only beside the author it
 * shortens to (so an edited or forged author never writes someone else's
 * name back).
 */
export function sanitizeCommentNativeAuthor(value: unknown, author: string | null): string | null {
  if (
    typeof value !== "string" ||
    author === null ||
    value.length <= MAX_COMMENT_AUTHOR_LENGTH ||
    value.length > MAX_COMMENT_NATIVE_AUTHOR_LENGTH ||
    value.trim() !== value ||
    INITIALS_CONTROL_RE.test(value) ||
    value.slice(0, MAX_COMMENT_AUTHOR_LENGTH).trimEnd() !== author.trimEnd()
  ) {
    return null;
  }
  return value;
}

/** Keep an imported comment's exact, calendar-valid Word `w:date` string. */
export function sanitizeCommentWordDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = WORD_DATE_TIME_RE.exec(value);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && day <= daysInMonth[month - 1] ? value : null;
}

/**
 * Normalize an arbitrary thread-id candidate to a bounded, attribute-safe token.
 * Strips every character outside [A-Za-z0-9_-] and clamps the length. Returns
 * null when nothing usable remains, so a forged/blank id never reaches the DOM.
 */
export function sanitizeThreadId(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = value
      .replace(THREAD_ID_DISALLOWED_RE, "")
      .slice(0, MAX_THREAD_ID_LENGTH);
    if (cleaned) return cleaned;
  }
  return null;
}

/** Normalize a durable comment/reply id to the same URL-safe token alphabet. */
export function sanitizeCommentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = COMMENT_ID_RE.exec(value);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return number > 0 && number < 0x7fffffff ? value : null;
}

/**
 * Reaction actors are compared as opaque authenticated user identities. Keep
 * their server-issued punctuation, but remove controls/whitespace and cap the
 * value before it enters the persisted comment graph.
 */
export function sanitizeCommentActorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(ACTOR_ID_CONTROL_RE, "")
    .replace(/\s+/g, "")
    .slice(0, MAX_COMMENT_ACTOR_ID_LENGTH);
  return cleaned || null;
}

/** Provider is part of Word's reaction-user identity, alongside the actor id. */
export function sanitizeCommentActorProvider(value: unknown): string | null {
  return exactReactionIdentity(value, MAX_COMMENT_ACTOR_PROVIDER_LENGTH);
}

function exactReactionIdentity(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > maximumLength ||
    REACTION_IDENTITY_CONTROL_RE.test(value)
  ) {
    return null;
  }
  return value;
}

function exactReactionActorId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_COMMENT_ACTOR_ID_LENGTH &&
    !/\s/.test(value) &&
    !REACTION_IDENTITY_CONTROL_RE.test(value)
    ? value
    : null;
}

/** Strictly normalize Like reactions and dedupe one actor per comment. */
export function normalizeCommentReactions(
  value: unknown,
): CommentReaction[] {
  if (!Array.isArray(value)) return [];
  const out: CommentReaction[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (out.length >= MAX_COMMENT_REACTIONS) break;
    const record =
      candidate && typeof candidate === "object"
        ? (candidate as Record<string, unknown>)
        : null;
    if (!record || record.type !== "like") continue;
    const actorId = exactReactionActorId(record.actorId);
    const actorName = exactReactionIdentity(
      record.actorName,
      MAX_COMMENT_AUTHOR_LENGTH,
    );
    const actorProvider = exactReactionIdentity(
      record.actorProvider,
      MAX_COMMENT_ACTOR_PROVIDER_LENGTH,
    );
    const actorKey = `${actorProvider ?? ""}\u0000${actorId ?? ""}`;
    if (!actorId || !actorName || !actorProvider || seen.has(actorKey)) continue;
    seen.add(actorKey);
    const reaction: CommentReaction = {
      type: "like",
      actorId,
      actorName,
      actorProvider,
    };
    const dateUtc = sanitizeCommentNativeDateUtc(record.dateUtc);
    if (dateUtc) reaction.dateUtc = dateUtc;
    out.push(reaction);
  }
  return out;
}

let threadIdCounter = 0;

/**
 * Generate a fresh, attribute-safe thread id. When a usable `seed` is supplied
 * (already a safe token) it is reused; otherwise a new id is minted via
 * crypto.randomUUID when available (browser + modern Node), else a
 * timestamp+counter fallback so the value is still unique within a session. The
 * result is funneled through sanitizeThreadId so it is always within the safe
 * alphabet + length bound.
 */
export function threadIdFor(seed?: unknown): string {
  const fromSeed = sanitizeThreadId(seed);
  if (fromSeed) return fromSeed;
  let raw: string;
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as { randomUUID?: () => string } | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    raw = cryptoObj.randomUUID();
  } else {
    threadIdCounter += 1;
    raw = `c-${Date.now().toString(36)}-${threadIdCounter.toString(36)}`;
  }
  // randomUUID contains hyphens (safe) and hex; strip anything else + clamp.
  // Always yields a non-empty token, but guard with a final fallback in case a
  // pathological generator returns only disallowed characters.
  const safe = sanitizeThreadId(raw);
  if (safe) return safe;
  threadIdCounter += 1;
  return `c${threadIdCounter}`;
}

function stableCommentHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * Resolve the durable identity of a comment. Legacy records predate comment
 * ids, so they receive a deterministic identity derived from their immutable
 * thread position and content. The next comment-store write persists it.
 */
export function resolvedCommentId(
  threadId: unknown,
  commentIndex: number,
  comment: CommentRecord,
  salt = 0,
  hashComment: (signature: string) => number = stableCommentHash,
): string | null {
  const existing = sanitizeCommentId(comment.id);
  if (existing) return existing;
  const thread = sanitizeThreadId(threadId);
  if (!thread || !Number.isInteger(commentIndex) || commentIndex < 0) {
    return null;
  }
  let invalidRetry = 0;
  while (true) {
    const signatureParts: unknown[] = [
      thread,
      commentIndex,
      comment.author,
      comment.text,
      comment.timestamp,
    ];
    if (salt > 0) signatureParts.push(salt);
    if (invalidRetry > 0) signatureParts.push("invalid-hash", invalidRetry);
    const number = hashComment(JSON.stringify(signatureParts)) & 0x7fffffff;
    if (number > 0 && number < 0x7fffffff) {
      const hash = number.toString(16).padStart(8, "0").toUpperCase();
      return sanitizeCommentId(`cm-${hash}`);
    }
    invalidRetry += 1;
  }
}

/**
 * Build a single sanitized CommentRecord, or null when the text is empty after
 * scrubbing (an empty comment is dropped). Used by normalize + addReply so the
 * same scrub applies on every edge.
 *
 * The one exception is a record whose text is exactly "": an imported Word
 * comment may hold nothing but its author, date and range (Word shows such an
 * empty balloon), and the importer stores it that way. The editor never
 * creates one — addThread / addReply / editCommentMessage refuse empty input.
 */
export function normalizeComment(value: unknown): CommentRecord | null {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const text = sanitizeCommentText(record.text);
  if (!text && record.text !== "") return null;
  const normalized: CommentRecord = {
    author: sanitizeCommentAuthor(record.author),
    text,
    timestamp: sanitizeCommentTimestamp(record.timestamp),
  };
  const id = sanitizeCommentId(record.id);
  if (id) normalized.id = id;
  const actorId = sanitizeCommentActorId(record.actorId);
  const actorProvider = sanitizeCommentActorProvider(record.actorProvider);
  // Provenance is an authorization boundary, so malformed values are dropped
  // rather than silently canonicalized into the current user's identity.
  if (
    actorId &&
    actorProvider &&
    record.actorId === actorId &&
    record.actorProvider === actorProvider
  ) {
    normalized.actorId = actorId;
    normalized.actorProvider = actorProvider;
  }
  const nativeDateUtc = sanitizeCommentNativeDateUtc(record.nativeDateUtc);
  if (nativeDateUtc) normalized.nativeDateUtc = nativeDateUtc;
  const initials = sanitizeCommentInitials(record.initials);
  if (initials !== null) normalized.initials = initials;
  else if (record.nativeInitialsAbsent === true) normalized.nativeInitialsAbsent = true;
  const nativeDate = sanitizeCommentWordDate(record.nativeDate);
  if (nativeDate) normalized.nativeDate = nativeDate;
  const nativeAuthor = sanitizeCommentNativeAuthor(record.nativeAuthor, normalized.author);
  if (nativeAuthor) normalized.nativeAuthor = nativeAuthor;
  if (typeof record.nativeDone === "boolean") normalized.nativeDone = record.nativeDone;
  if (
    typeof record.nativeReplyTo === "number" &&
    Number.isSafeInteger(record.nativeReplyTo) &&
    record.nativeReplyTo >= 1
  ) {
    normalized.nativeReplyTo = record.nativeReplyTo;
  }
  if (record.nativeReference === "deletion" || record.nativeReference === "insertion") {
    normalized.nativeReference = record.nativeReference;
    if (
      typeof record.nativeReferenceRevision === "string" &&
      /^[0-9]{1,10}$/.test(record.nativeReferenceRevision)
    ) {
      normalized.nativeReferenceRevision = record.nativeReferenceRevision;
    }
  }
  const nativeBody = sanitizeCommentNativeBody(record.nativeBody);
  if (nativeBody) {
    normalized.nativeBody = nativeBody;
    const nativeLinks = sanitizeCommentNativeLinks(record.nativeLinks);
    if (nativeLinks) normalized.nativeLinks = nativeLinks;
  }
  // Carried only under the exact author name it was recorded for.
  const nativePerson = sanitizeCommentNativePerson(record.nativePerson);
  if (nativePerson && normalized.author !== null && normalized.author === record.author) {
    normalized.nativePerson = nativePerson;
  }
  const reactions = normalizeCommentReactions(record.reactions);
  if (reactions.length > 0) normalized.reactions = reactions;
  return normalized;
}

/**
 * Normalize a single thread candidate to a clean CommentThread, or null when it
 * is unusable (no id, or no surviving comments). Caps the comment count per
 * thread; drops empty/blank comments; coerces `resolved` to a boolean.
 */
export function normalizeCommentThread(value: unknown): CommentThread | null {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const id = sanitizeThreadId(record.id);
  if (!id) return null;

  const rawComments = Array.isArray(record.comments) ? record.comments : [];
  // Index zero is the thread root. Never promote a later reply when a forged or
  // partially-corrupt store has no valid parent: doing so changes authorship and
  // produces an OOXML reply with no real parent on the next export.
  const parent = normalizeComment(rawComments[0]);
  if (!parent) return null;
  const comments: CommentRecord[] = [parent];
  for (let index = 1; index < rawComments.length; index += 1) {
    if (comments.length >= MAX_COMMENTS_PER_THREAD) break;
    const comment = normalizeComment(rawComments[index]);
    if (comment) comments.push(comment);
  }

  const normalized: CommentThread = {
    id,
    comments,
    resolved: record.resolved === true,
  };
  const mediaKeys = [
    "sourceMediaDisposition",
    "sourceMediaFingerprint",
    "sourceMediaKinds",
    "sourceMediaCount",
  ] as const;
  if (
    mediaKeys.some((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    if (
      record.sourceMediaDisposition !== "preserve-only" ||
      typeof record.sourceMediaFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.sourceMediaFingerprint) ||
      !Array.isArray(record.sourceMediaKinds) ||
      record.sourceMediaKinds.length !== 1 ||
      record.sourceMediaKinds[0] !== "image" ||
      typeof record.sourceMediaCount !== "number" ||
      !Number.isInteger(record.sourceMediaCount) ||
      record.sourceMediaCount < 1 ||
      record.sourceMediaCount > 16 ||
      comments.some((comment) => (comment.reactions?.length ?? 0) > 0)
    ) {
      return null;
    }
    normalized.sourceMediaDisposition = "preserve-only";
    normalized.sourceMediaFingerprint = record.sourceMediaFingerprint;
    normalized.sourceMediaKinds = ["image"];
    normalized.sourceMediaCount = record.sourceMediaCount;
  }
  return normalized;
}

export function isCommentMediaPreserveOnlyThread(
  thread: Pick<CommentThread, "sourceMediaDisposition"> | null | undefined,
): boolean {
  return thread?.sourceMediaDisposition === "preserve-only";
}

/**
 * Strict validation used at native-DOCX boundaries. The everyday editor
 * normalizer remains forgiving, but a file export must never silently drop an
 * invalid root, malformed reply, duplicate id, or capped record. Callers either
 * reject these issues or surface them in a fidelity/loss manifest.
 */
export function validateCommentThreadsForNativeExport(
  value: unknown,
): CommentThreadValidationResult {
  if (value === undefined || value === null) return { threads: [], issues: [] };
  if (!Array.isArray(value)) {
    return {
      threads: [],
      issues: [{ code: "invalid_store", threadId: null }],
    };
  }

  const threads: CommentThread[] = [];
  const issues: CommentThreadValidationIssue[] = [];
  const seen = new Set<string>();
  if (value.length > MAX_COMMENT_THREADS) {
    issues.push({ code: "thread_limit_exceeded", threadId: null });
  }
  for (const candidate of value) {
    const raw =
      candidate && typeof candidate === "object"
        ? (candidate as Record<string, unknown>)
        : null;
    const id = sanitizeThreadId(raw?.id);
    if (!raw || !id || raw.id !== id) {
      issues.push({ code: "invalid_thread_id", threadId: id });
      continue;
    }
    if (seen.has(id)) {
      issues.push({ code: "duplicate_thread_id", threadId: id });
      continue;
    }
    seen.add(id);
    const comments = Array.isArray(raw.comments) ? raw.comments : [];
    if (!normalizeComment(comments[0])) {
      issues.push({ code: "missing_parent", threadId: id, commentIndex: 0 });
      continue;
    }
    if (comments.length > MAX_COMMENTS_PER_THREAD) {
      issues.push({ code: "comment_limit_exceeded", threadId: id });
      continue;
    }
    let invalidReply = false;
    for (let index = 1; index < comments.length; index += 1) {
      if (normalizeComment(comments[index])) continue;
      issues.push({ code: "invalid_reply", threadId: id, commentIndex: index });
      invalidReply = true;
    }
    if (invalidReply) continue;
    const normalized = normalizeCommentThread(raw);
    if (normalized) threads.push(normalized);
    else
      issues.push({
        code: "invalid_source_media_authority",
        threadId: id,
      });
  }
  return { threads, issues };
}

/**
 * Normalize + dedupe an array of thread candidates. The first occurrence of any
 * given (sanitized) id wins; later duplicates are discarded so the store never
 * holds two threads claiming the same anchor. Caps the total thread count.
 * Always returns an array (never throws), so a forged/garbage value yields [].
 */
export function normalizeCommentThreads(value: unknown): CommentThread[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CommentThread[] = [];
  for (const candidate of value) {
    if (out.length >= MAX_COMMENT_THREADS) break;
    const thread = normalizeCommentThread(candidate);
    if (!thread) continue;
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    out.push(thread);
  }
  return out;
}

export interface CommentDeepLinkTarget {
  documentId: string;
  threadId: string;
  commentId: string;
}

const COMMENT_LINK_DOCUMENT_PARAM = "mrnote-document";
const COMMENT_LINK_THREAD_PARAM = "mrnote-thread";
const COMMENT_LINK_COMMENT_PARAM = "mrnote-comment";
const MAX_COMMENT_DOCUMENT_ID_LENGTH = 256;

function sanitizeCommentDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(ACTOR_ID_CONTROL_RE, "")
    .trim()
    .slice(0, MAX_COMMENT_DOCUMENT_ID_LENGTH);
  return cleaned || null;
}

/** Build a same-document URL whose hash addresses one exact comment/reply. */
export function buildCommentDeepLink(
  baseHref: string,
  target: CommentDeepLinkTarget,
): string | null {
  const documentId = sanitizeCommentDocumentId(target.documentId);
  const threadId = sanitizeThreadId(target.threadId);
  const commentId = sanitizeCommentId(target.commentId);
  if (!documentId || !threadId || !commentId) return null;
  try {
    const url = new URL(baseHref);
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    params.set(COMMENT_LINK_DOCUMENT_PARAM, documentId);
    params.set(COMMENT_LINK_THREAD_PARAM, threadId);
    params.set(COMMENT_LINK_COMMENT_PARAM, commentId);
    url.hash = params.toString();
    return url.toString();
  } catch {
    return null;
  }
}

/** Parse and validate a comment deep-link from an absolute URL. */
export function parseCommentDeepLink(
  href: string,
): CommentDeepLinkTarget | null {
  try {
    const url = new URL(href);
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const documentId = sanitizeCommentDocumentId(
      params.get(COMMENT_LINK_DOCUMENT_PARAM),
    );
    const threadId = sanitizeThreadId(params.get(COMMENT_LINK_THREAD_PARAM));
    const commentId = sanitizeCommentId(
      params.get(COMMENT_LINK_COMMENT_PARAM),
    );
    return documentId && threadId && commentId
      ? { documentId, threadId, commentId }
      : null;
  } catch {
    return null;
  }
}

/** Return one comment plus its live array index by durable identity. */
export function findCommentById(
  thread: CommentThread,
  commentId: unknown,
): { comment: CommentRecord; index: number } | null {
  const id = sanitizeCommentId(commentId);
  if (!id) return null;
  for (let index = 0; index < thread.comments.length; index += 1) {
    const comment = thread.comments[index];
    if (resolvedCommentId(thread.id, index, comment) === id) {
      return { comment, index };
    }
  }
  return null;
}

/**
 * Materialize every legacy comment's deterministic identity before a command
 * changes thread order or content. This makes a previously copied deep link
 * survive later reply deletion while keeping untouched legacy/new comments in
 * the original three-field canonical shape until identity is actually needed.
 */
export function materializeCommentIds(
  threads: CommentThread[],
): CommentThread[] {
  // Reserve every pre-existing canonical identity before allocating any
  // legacy one, including IDs that occur later in document order.
  const reserved = new Set<string>();
  for (const thread of threads) {
    for (const comment of thread.comments) {
      const id = sanitizeCommentId(comment.id);
      if (id) reserved.add(id);
    }
  }
  const claimedExisting = new Set<string>();
  let didChange = false;
  const next = threads.map((thread) => {
    if (isCommentMediaPreserveOnlyThread(thread)) return thread;
    let threadChanged = false;
    const comments = thread.comments.map((comment, index) => {
      const existing = sanitizeCommentId(comment.id);
      if (existing && !claimedExisting.has(existing)) {
        claimedExisting.add(existing);
        return comment;
      }
      let salt = 0;
      let id: string | null = null;
      const identitySource = existing ? { ...comment, id: undefined } : comment;
      do {
        id = resolvedCommentId(thread.id, index, identitySource, salt);
        salt += 1;
      } while (id && reserved.has(id));
      if (!id) return comment;
      reserved.add(id);
      didChange = true;
      threadChanged = true;
      return { ...comment, id };
    });
    return threadChanged ? { ...thread, comments } : thread;
  });
  return didChange ? next : threads;
}

/** Persist identities only for one thread while reserving against the graph. */
export function materializeCommentIdsForThread(
  threads: CommentThread[],
  threadId: unknown,
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return threads;
  const materialized = materializeCommentIds(threads);
  const targetIndex = threads.findIndex((thread) => thread.id === id);
  if (
    targetIndex < 0 ||
    materialized[targetIndex] === threads[targetIndex]
  ) {
    return threads;
  }
  return threads.map((thread, index) =>
    index === targetIndex ? materialized[index] : thread,
  );
}

/**
 * Toggle the authenticated actor's Like on one exact comment/reply. The first
 * write materializes the target's durable id so links remain stable thereafter.
 */
export function toggleCommentLike(
  threads: CommentThread[],
  threadId: unknown,
  commentId: unknown,
  actor: { id: unknown; name: unknown; provider: unknown },
  writable: boolean,
): CommentThread[] {
  const normalizedThreadId = sanitizeThreadId(threadId);
  const normalizedCommentId = sanitizeCommentId(commentId);
  const actorId = sanitizeCommentActorId(actor.id);
  const actorName = sanitizeCommentAuthor(actor.name);
  const actorProvider = sanitizeCommentActorProvider(actor.provider);
  if (
    writable !== true ||
    !normalizedThreadId ||
    !normalizedCommentId ||
    !actorId ||
    !actorName ||
    !actorProvider
  ) {
    return threads;
  }

  let didChange = false;
  const next = threads.map((thread) => {
    if (thread.id !== normalizedThreadId) return thread;
    if (isCommentMediaPreserveOnlyThread(thread)) return thread;
    const target = findCommentById(thread, normalizedCommentId);
    if (!target) return thread;
    const reactions = normalizeCommentReactions(target.comment.reactions);
    const existingIndex = reactions.findIndex(
      (reaction) =>
        reaction.type === "like" &&
        reaction.actorId === actorId &&
        reaction.actorProvider === actorProvider,
    );
    if (existingIndex < 0 && reactions.length >= MAX_COMMENT_REACTIONS) {
      return thread;
    }
    const nextReactions =
      existingIndex >= 0
        ? reactions.filter((_, index) => index !== existingIndex)
        : [
            ...reactions,
            {
              type: "like" as const,
              actorId,
              actorName,
              actorProvider,
            },
          ];
    didChange = true;
    return {
      ...thread,
      comments: thread.comments.map((comment, index) => {
        if (index !== target.index) return comment;
        if (nextReactions.length > 0) {
          return {
            ...comment,
            id: normalizedCommentId,
            reactions: nextReactions,
          };
        }
        const withoutReactions = { ...comment };
        delete withoutReactions.reactions;
        return { ...withoutReactions, id: normalizedCommentId };
      }),
    };
  });
  return didChange ? next : threads;
}

/**
 * Append a reply to the thread with the given id, returning a NEW threads array
 * (immutable). The reply is sanitized; an empty reply is a no-op (the original
 * array reference is returned unchanged). A reply to a missing thread is also a
 * no-op. Caps the per-thread comment count (a reply past the cap is dropped).
 */
export function addReply(
  threads: CommentThread[],
  threadId: unknown,
  reply: {
    actorId?: unknown;
    actorProvider?: unknown;
    author?: unknown;
    text: unknown;
    timestamp?: unknown;
  },
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return threads;
  const target = threads.find((thread) => thread.id === id);
  // Word resolved threads are inactive until explicitly reopened. Enforce that
  // in the domain helper as well as the panel so any command caller fails closed.
  if (
    !target ||
    isCommentMediaPreserveOnlyThread(target) ||
    target.resolved ||
    target.comments.length >= MAX_COMMENTS_PER_THREAD
  ) {
    return threads;
  }
  if (!sanitizeCommentText(reply.text)) return threads;
  const comment = normalizeComment(reply);
  if (!comment) return threads;

  let didChange = false;
  const next = threads.map((thread) => {
    if (thread.id !== id) return thread;
    didChange = true;
    return { ...thread, comments: [...thread.comments, comment] };
  });
  return didChange ? next : threads;
}

/**
 * Remove one reply from a thread by its authenticated array index. Index zero
 * is the thread root and can never be removed through this helper. Returns the
 * original array reference when the id/index is unusable or no reply exists,
 * allowing command callers to fail closed without creating a transaction.
 */
export function removeReplyAt(
  threads: CommentThread[],
  threadId: unknown,
  replyIndex: unknown,
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (
    !id ||
    typeof replyIndex !== "number" ||
    !Number.isInteger(replyIndex) ||
    replyIndex < 1
  ) {
    return threads;
  }

  let didChange = false;
  const next = threads.map((thread) => {
    if (
      thread.id !== id ||
      isCommentMediaPreserveOnlyThread(thread) ||
      replyIndex >= thread.comments.length
    )
      return thread;
    didChange = true;
    return {
      ...thread,
      comments: [
        ...thread.comments.slice(0, replyIndex),
        ...thread.comments.slice(replyIndex + 1),
      ],
    };
  });
  return didChange ? next : threads;
}

/**
 * Set the resolved flag on the thread with the given id, returning a NEW threads
 * array (immutable). `resolved` true marks it resolved (removes its visual
 * highlight at render time); false reopens it. A no-op (same reference) when the
 * thread is missing or already in the requested state.
 */
export function resolveThread(
  threads: CommentThread[],
  threadId: unknown,
  resolved: boolean,
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return threads;
  const want = resolved === true;

  let didChange = false;
  const next = threads.map((thread) => {
    if (thread.id !== id) return thread;
    if (isCommentMediaPreserveOnlyThread(thread)) return thread;
    if (thread.resolved === want) return thread;
    didChange = true;
    // Resolve / Reopen sets the whole thread, replies included.
    const comments = thread.comments.some((comment) => comment.nativeDone !== undefined)
      ? thread.comments.map((comment) => {
          if (comment.nativeDone === undefined) return comment;
          const next = { ...comment };
          delete next.nativeDone;
          return next;
        })
      : thread.comments;
    return { ...thread, resolved: want, comments };
  });
  return didChange ? next : threads;
}

/**
 * Add a brand-new thread (its first comment) to the store, returning a NEW
 * threads array. The thread id is sanitized; an empty comment or duplicate id is
 * a no-op. Caps the total thread count. Returns the original reference unchanged
 * on a no-op so callers can cheaply detect "nothing happened".
 */
export function addThread(
  threads: CommentThread[],
  threadId: unknown,
  comment: {
    actorId?: unknown;
    actorProvider?: unknown;
    author?: unknown;
    text: unknown;
    timestamp?: unknown;
  },
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return threads;
  if (threads.length >= MAX_COMMENT_THREADS) return threads;
  if (threads.some((thread) => thread.id === id)) return threads;
  if (!sanitizeCommentText(comment.text)) return threads;
  const first = normalizeComment(comment);
  if (!first) return threads;
  return [...threads, { id, comments: [first], resolved: false }];
}

/**
 * Edit one exact comment/reply only when its persisted creator provenance
 * matches the authenticated actor. Legacy/imported records intentionally fail
 * closed: a matching display name is not proof of ownership.
 */
export function editCommentMessage(
  threads: CommentThread[],
  threadId: unknown,
  commentId: unknown,
  text: unknown,
  actor: { id: unknown; provider: unknown },
  writable: boolean,
): CommentThread[] {
  const normalizedThreadId = sanitizeThreadId(threadId);
  const normalizedCommentId = sanitizeCommentId(commentId);
  const actorId = sanitizeCommentActorId(actor.id);
  const actorProvider = sanitizeCommentActorProvider(actor.provider);
  const nextText = sanitizeCommentText(text);
  if (
    writable !== true ||
    !normalizedThreadId ||
    !normalizedCommentId ||
    !actorId ||
    !actorProvider ||
    !nextText
  ) {
    return threads;
  }

  const rawThread = threads.find((thread) => thread.id === normalizedThreadId);
  if (
    !rawThread ||
    isCommentMediaPreserveOnlyThread(rawThread) ||
    rawThread.resolved
  )
    return threads;
  // The panel shows identities materialized over the WHOLE document: a legacy
  // id another comment already holds is given a fresh one there. Either that
  // shown id or the stored one names the comment; materializing never
  // reorders, so both name one index (OFL-005: the shown id of a conflicting
  // comment found nothing in the stored model and the edit was dropped).
  const shownThread = materializeCommentIds(threads).find(
    (thread) => thread.id === normalizedThreadId,
  );
  const located =
    (shownThread && findCommentById(shownThread, normalizedCommentId)) ??
    findCommentById(rawThread, normalizedCommentId);
  const rawTarget = located ? rawThread.comments[located.index] : undefined;
  if (
    !located ||
    !rawTarget ||
    rawTarget.actorId !== actorId ||
    rawTarget.actorProvider !== actorProvider ||
    rawTarget.text === nextText
  ) {
    return threads;
  }

  const materialized = materializeCommentIdsForThread(
    threads,
    normalizedThreadId,
  );
  return materialized.map((thread) => {
    if (thread.id !== normalizedThreadId) return thread;
    return {
      ...thread,
      comments: thread.comments.map((comment, index) =>
        index === located.index ? { ...comment, text: nextText } : comment,
      ),
    };
  });
}

/**
 * Remove the thread with the given id, returning a NEW threads array. A no-op
 * (same reference) when the thread is missing. The caller is responsible for
 * also stripping the matching comment mark from the document.
 */
export function removeThread(
  threads: CommentThread[],
  threadId: unknown,
): CommentThread[] {
  const id = sanitizeThreadId(threadId);
  if (!id) return threads;
  if (
    threads.some(
      (thread) => thread.id === id && isCommentMediaPreserveOnlyThread(thread),
    )
  )
    return threads;
  const next = threads.filter((thread) => thread.id !== id);
  return next.length === threads.length ? threads : next;
}

/** Look up a thread by (sanitized) id, or null when absent. */
export function findThread(
  threads: CommentThread[],
  threadId: unknown,
): CommentThread | null {
  const id = sanitizeThreadId(threadId);
  if (!id) return null;
  return threads.find((thread) => thread.id === id) ?? null;
}
