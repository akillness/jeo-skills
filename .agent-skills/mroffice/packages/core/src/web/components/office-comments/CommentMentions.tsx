"use client";



















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ForwardedRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "../../../host/next-intl";

import UserAvatar from "../console/UserAvatar";
import { PagePermissionSheet } from "../notebook/PagePermissionSheet";
import { usePopupPortalTarget } from "../ui/portal-host";
import {
  publishPageCollabAuthority,
  usePageWorkspaceId,
} from "../../lib/collab/page-writable";
import { useSelfCollabIdentity } from "../../lib/collab/self-identity";
import {
  applyMentionPick,
  cachedMentionCandidates,
  candidateMatches,
  commentMentionId,
  findMentionTrigger,
  newlyMentionedUserIds,
  postCommentMentions,
  removeMentionEndingAt,
  resolveCommentMentions,
  type MentionCandidate,
  type MentionPerson,
  type MentionSpan,
  type MentionTrigger,
} from "../../lib/comment-mentions";
import { getPageCollab, type PageCollabState } from "../../lib/page-collab-sdk";
import { boxWithin } from "../../lib/glide-geometry";

import styles from "./CommentMentions.module.css";

const SEARCH_DEBOUNCE_MS = 150;
const PICKER_ROWS = 8;
const SHARED_NOTICE_MS = 5_000;
const MAX_NAME_LOOKUPS = 20;

// --- controller ----------------------------------------------------------------

export interface CommentMentionPost {
  /** Where the comment lives on the page: the thread / comment id the editor
   *  selects it by. */
  threadRef: string;
  /** The editor's stable id for this message, when it has one. */
  messageRef?: string | null;
  /** The text the editor saved. */
  text: string;
  /** An edit's text before the edit: only mentions it lacked notify. */
  previousText?: string | null;
}

export type CommentMentionNoticeState =
  | {
      kind: "needsAccess";
      threadRef: string;
      commentId: string;
      excerpt: string;
      people: MentionCandidate[];
      canShare: boolean;
      notebookId: string | null;
    }
  | { kind: "shared"; threadRef: string; people: MentionCandidate[] }
  | { kind: "failed"; threadRef: string };

export class MentionNoticeStore {
  notice: CommentMentionNoticeState | null = null;
  private slots: Array<{ id: number; threadRef: string | null }> = [];
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  set(notice: CommentMentionNoticeState | null) {
    this.notice = notice;
    this.emit();
  }

  /** A surface that can show the notice; returns its release. */
  register(id: number, threadRef: string | null): () => void {
    this.slots.push({ id, threadRef });
    this.emit();
    return () => {
      this.slots = this.slots.filter((slot) => slot.id !== id);
      this.emit();
    };
  }

  /** The one mounted slot that shows the notice: the latest one on the
   *  notice's own thread, else the latest one of all. */
  ownerSlot(): number | null {
    const notice = this.notice;
    if (!notice || this.slots.length === 0) return null;
    const own = this.slots.filter((slot) => slot.threadRef === notice.threadRef);
    const pool = own.length > 0 ? own : this.slots;
    return pool[pool.length - 1]?.id ?? null;
  }
}

export interface CommentMentionsController {
  readonly pageId: string;
  readonly workspaceId: string | null;
  readonly selfId: string;
  /** Everyone a mention can resolve to on this page, the viewer included. */
  readonly roster: readonly MentionPerson[];
  /** False while the page has more people than one roster request returns. */
  readonly rosterComplete: boolean;
  /** A loaded person by account id, with their avatar: comment authors are
   *  drawn in person, not as initials, when the roster knows them. */
  personFor?: (userId: string) => MentionCandidate | null;
  resolve: (text: string) => MentionSpan[];
  search: (query: string) => Promise<MentionCandidate[]>;
  rememberPick: (person: MentionCandidate) => void;
  /** Look a name up when text mentions someone the roster has not loaded. */
  lookupName: (word: string) => void;
  notifyPosted: (post: CommentMentionPost) => void;
  /** Re-send a mention (after sharing the page with those people). */
  resend: (
    notice: Extract<CommentMentionNoticeState, { kind: "needsAccess" }>,
  ) => Promise<void>;
  readonly notices: MentionNoticeStore;
}

export interface UseCommentMentionsOptions {
  /** The notebook page the comments belong to. */
  pageId: string | null | undefined;
  /** The page's workspace scope; the enclosing window's by default. */
  workspaceId?: string | null;
  /** False for guests, public previews and read-only demos. */
  enabled?: boolean;
  /**
   * The signed-in person, when the host already resolved them (its comment
   * actor). Omitted: the session's own identity. Null: nobody is signed in,
   * so there are no mentions.
   */
  self?: { id: string; name: string } | null;
}

function uniquePeople(people: readonly MentionPerson[]): MentionPerson[] {
  const seen = new Set<string>();
  const out: MentionPerson[] = [];
  for (const person of people) {
    const key = `${person.userId}\u0000${person.displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: person.userId, displayName: person.displayName });
  }
  return out;
}

/**
 * One page's mention controller, or null when mentions cannot work here.
 * Every composer and thread of the page shares the candidate cache.
 */
export function useCommentMentions({
  pageId,
  workspaceId: explicitWorkspaceId,
  enabled = true,
  self: explicitSelf,
}: UseCommentMentionsOptions): CommentMentionsController | null {
  const contextualWorkspaceId = usePageWorkspaceId();
  const workspaceId =
    (explicitWorkspaceId === undefined
      ? contextualWorkspaceId
      : explicitWorkspaceId) || null;
  const sessionSelf = useSelfCollabIdentity();
  const self =
    explicitSelf === undefined
      ? sessionSelf
      : { id: explicitSelf?.id ?? "", name: explicitSelf?.name ?? "" };
  const active = enabled && !!pageId && !!self.id;
  const scopeKey = active ? `${workspaceId ?? ""}\u0000${pageId}` : "";

  const [loaded, setLoaded] = useState<{
    key: string;
    people: MentionCandidate[];
    complete: boolean;
  } | null>(null);
  const [extra, setExtra] = useState<{ key: string; people: MentionCandidate[] }>({
    key: "",
    people: [],
  });
  const [picks, setPicks] = useState<{ key: string; people: MentionCandidate[] }>({
    key: "",
    people: [],
  });
  const [notices] = useState(() => new MentionNoticeStore());
  const lookedUp = useRef<{ key: string; words: Set<string> }>({
    key: "",
    words: new Set(),
  });
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !pageId) return;
    let cancelled = false;
    cachedMentionCandidates(pageId, "", workspaceId)
      .then((page) => {
        if (!cancelled) {
          setLoaded({ key: scopeKey, people: page.items, complete: page.complete });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, pageId, scopeKey, workspaceId]);

  const rosterPeople = useMemo(
    () => (loaded?.key === scopeKey ? loaded.people : []),
    [loaded, scopeKey],
  );
  const rosterLoaded = loaded?.key === scopeKey;
  const rosterComplete = rosterLoaded ? loaded.complete : false;
  const extraPeople = useMemo(
    () => (extra.key === scopeKey ? extra.people : []),
    [extra, scopeKey],
  );
  const pickedPeople = useMemo(
    () => (picks.key === scopeKey ? picks.people : []),
    [picks, scopeKey],
  );
  const roster = useMemo(
    () =>
      uniquePeople([
        ...rosterPeople,
        ...extraPeople,
        ...pickedPeople,
        ...(self.id && self.name
          ? [{ userId: self.id, displayName: self.name }]
          : []),
      ]),
    [extraPeople, pickedPeople, rosterPeople, self.id, self.name],
  );

  const rememberPick = useCallback(
    (person: MentionCandidate) => {
      setPicks((current) => {
        const people = current.key === scopeKey ? current.people : [];
        if (people.some((item) => item.userId === person.userId)) return current;
        return { key: scopeKey, people: [...people, person] };
      });
    },
    [scopeKey],
  );

  const lookupName = useCallback(
    (word: string) => {
      // Only a loaded roster that was cut short needs a name looked up.
      if (!active || !pageId || !rosterLoaded || rosterComplete) return;
      const needle = word.trim().slice(0, 40);
      if (!needle) return;
      if (lookedUp.current.key !== scopeKey) {
        lookedUp.current = { key: scopeKey, words: new Set() };
      }
      const words = lookedUp.current.words;
      const folded = needle.toLocaleLowerCase();
      if (words.has(folded) || words.size >= MAX_NAME_LOOKUPS) return;
      words.add(folded);
      cachedMentionCandidates(pageId, needle, workspaceId)
        .then((page) => {
          if (!mountedRef.current || page.items.length === 0) return;
          setExtra((current) => {
            const people = current.key === scopeKey ? current.people : [];
            const fresh = page.items.filter(
              (item) => !people.some((known) => known.userId === item.userId),
            );
            return fresh.length
              ? { key: scopeKey, people: [...people, ...fresh] }
              : current;
          });
        })
        .catch(() => undefined);
    },
    [active, pageId, rosterComplete, rosterLoaded, scopeKey, workspaceId],
  );

  const search = useCallback(
    async (query: string): Promise<MentionCandidate[]> => {
      if (!active || !pageId) return [];
      if (rosterComplete) {
        return rosterPeople.filter((person) => candidateMatches(person, query));
      }
      const page = await cachedMentionCandidates(pageId, query, workspaceId);
      return page.items;
    },
    [active, pageId, rosterComplete, rosterPeople, workspaceId],
  );

  const resolve = useCallback(
    (text: string) => resolveCommentMentions(text, roster, pickedPeople),
    [pickedPeople, roster],
  );

  const peopleById = useMemo(() => {
    const byId = new Map<string, MentionCandidate>();
    for (const person of [...pickedPeople, ...extraPeople, ...rosterPeople]) {
      byId.set(person.userId, person);
    }
    return byId;
  }, [extraPeople, pickedPeople, rosterPeople]);
  const personFor = useCallback(
    (userId: string) => peopleById.get(userId) ?? null,
    [peopleById],
  );

  const notifyPosted = useCallback(
    (post: CommentMentionPost) => {
      if (!active || !pageId) return;
      const userIds = newlyMentionedUserIds(
        post.text,
        post.previousText,
        roster,
        pickedPeople,
      ).filter((id) => id !== self.id);
      if (userIds.length === 0) return;
      const commentId = commentMentionId(post.threadRef, post.messageRef);
      postCommentMentions(
        pageId,
        { commentId, userIds, excerpt: post.text },
        { workspaceId },
      )
        .then((receipt) => {
          if (!mountedRef.current || receipt.needsAccess.length === 0) return;
          notices.set({
            kind: "needsAccess",
            threadRef: post.threadRef,
            commentId,
            excerpt: post.text,
            people: receipt.needsAccess,
            canShare: receipt.canShare,
            notebookId: receipt.notebookId,
          });
        })
        .catch(() => {
          if (mountedRef.current) {
            notices.set({ kind: "failed", threadRef: post.threadRef });
          }
        });
    },
    [active, notices, pageId, pickedPeople, roster, self.id, workspaceId],
  );

  const resend = useCallback(
    async (
      notice: Extract<CommentMentionNoticeState, { kind: "needsAccess" }>,
    ) => {
      if (!active || !pageId) return;
      let receipt;
      try {
        receipt = await postCommentMentions(
          pageId,
          {
            commentId: notice.commentId,
            userIds: notice.people.map((person) => person.userId),
            excerpt: notice.excerpt,
          },
          { workspaceId },
        );
      } catch {
        if (mountedRef.current) {
          notices.set({ kind: "failed", threadRef: notice.threadRef });
        }
        return;
      }
      if (!mountedRef.current) return;
      const still = notice.people.filter((person) =>
        receipt.needsAccess.some((left) => left.userId === person.userId),
      );
      const reached = notice.people.filter((person) =>
        receipt.notified.includes(person.userId),
      );
      if (still.length > 0) {
        notices.set({ ...notice, people: still, canShare: receipt.canShare });
      } else {
        notices.set({ kind: "shared", threadRef: notice.threadRef, people: reached });
      }
    },
    [active, notices, pageId, workspaceId],
  );

  return useMemo(
    () =>
      active && pageId
        ? {
            pageId,
            workspaceId,
            selfId: self.id,
            roster,
            rosterComplete,
            personFor,
            resolve,
            search,
            rememberPick,
            lookupName,
            notifyPosted,
            resend,
            notices,
          }
        : null,
    [
      active,
      lookupName,
      notices,
      notifyPosted,
      pageId,
      personFor,
      rememberPick,
      resend,
      resolve,
      roster,
      rosterComplete,
      search,
      self.id,
      workspaceId,
    ],
  );
}

// --- rendering posted text ------------------------------------------------------

/** Words typed after "@" that the roster could not resolve (for lookups). */
function unresolvedMentionWords(text: string, spans: readonly MentionSpan[]): string[] {
  const words: string[] = [];
  const pattern = /(^|[\s\p{P}\p{S}])@([^\s\p{P}\p{S}]{1,40})/gu;
  for (const match of text.matchAll(pattern)) {
    const at = (match.index ?? 0) + match[1].length;
    if (spans.some((span) => span.start === at)) continue;
    words.push(match[2]);
  }
  return words;
}

export interface MentionTextProps {
  text: string;
  mentions?: CommentMentionsController | null;
}

/**
 * A posted comment's text with each mention drawn as a chip. Without a
 * controller (guests, previews) the text is returned untouched.
 */
export function MentionText({ text, mentions }: MentionTextProps): ReactNode {
  const spans = useMemo(
    () => (mentions ? mentions.resolve(text) : []),
    [mentions, text],
  );
  const lookupName = mentions?.lookupName;
  const rosterComplete = mentions?.rosterComplete ?? true;
  useEffect(() => {
    if (!lookupName || rosterComplete || !text.includes("@")) return;
    for (const word of unresolvedMentionWords(text, spans)) lookupName(word);
  }, [lookupName, rosterComplete, spans, text]);
  if (!mentions || spans.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    const self = span.userId !== null && span.userId === mentions.selfId;
    parts.push(
      <span
        key={`${span.start}-${index}`}
        className={styles.chip}
        data-self={self ? "true" : undefined}
        data-testid="comment-mention-chip"
        data-user-id={span.userId ?? undefined}
      >
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// --- the comment box --------------------------------------------------------------

type FieldElement = HTMLTextAreaElement | HTMLInputElement;

interface PickerState {
  trigger: MentionTrigger;
  caret: number;
  items: MentionCandidate[];
  active: number;
  loading: boolean;
}

function setFieldValue(element: FieldElement, next: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, next);
  else element.value = next;
  // React's onChange listens for `input`; the host's controlled state follows.
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Above every layer the box sits in (it is portalled out of them). */
function layerAbove(node: HTMLElement): number {
  let highest = 99;
  for (let current: HTMLElement | null = node; current; current = current.parentElement) {
    const z = Number.parseInt(getComputedStyle(current).zIndex, 10);
    if (Number.isFinite(z)) highest = Math.max(highest, z);
  }
  return highest + 1;
}

const THEME_TOKENS = [
  "--office-dialog-surface",
  "--office-dialog-ink",
  "--office-dialog-muted",
  "--office-dialog-divider",
  "--office-comments-accent",
  "--user-theme-accent",
] as const;

function themeTokens(element: HTMLElement): CSSProperties {
  const computed = getComputedStyle(element);
  const tokens: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const value = computed.getPropertyValue(token).trim();
    if (value) tokens[token] = value;
  }
  return tokens as CSSProperties;
}

const MIRRORED_STYLE = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "tabSize",
  "wordSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "direction",
  "textAlign",
] as const;

/** Wrapping is mirrored only for a textarea; an input never wraps. */
const MIRRORED_WRAP = ["whiteSpace", "overflowWrap", "wordBreak"] as const;

/**
 * Tints the recognised mentions in the box. It is a sibling drawn exactly
 * over the field with transparent text — the field itself is not restyled.
 */
function MentionFieldOverlay({
  field,
  spans,
  value,
  multiline,
}: {
  field: FieldElement;
  spans: readonly MentionSpan[];
  value: string;
  multiline: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const unitRef = useRef(1);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const place = () => {
      const computed = getComputedStyle(field);
      const style = overlay.style as unknown as Record<string, string>;
      const source = computed as unknown as Record<string, string>;
      for (const property of MIRRORED_STYLE) style[property] = source[property];
      if (multiline) {
        for (const property of MIRRORED_WRAP) style[property] = source[property];
      }
      overlay.style.borderColor = "transparent";
      // Sized from the field's border box whatever its own box-sizing is.
      overlay.style.boxSizing = "border-box";
      if (!multiline) {
        // An input centres its one line vertically; so does the overlay.
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
      }
      // Measured as drawn, in the overlay's own CSS pixels: under stacked
      // zooms (Touch mode in a zoomed page) WebKit answers offsets already
      // zoomed, and the overlay stood off its field (lib/glide-geometry).
      const host = overlay.offsetParent;
      const box = host instanceof HTMLElement ? boxWithin(field, host) : null;
      overlay.style.left = `${box ? box.x : field.offsetLeft}px`;
      overlay.style.top = `${box ? box.y : field.offsetTop}px`;
      overlay.style.width = `${box ? box.width : field.offsetWidth}px`;
      overlay.style.height = `${box ? box.height : field.offsetHeight}px`;
      // offset/client/scroll answers per CSS pixel
      unitRef.current = box && box.width > 0 ? field.offsetWidth / box.width || 1 : 1;
      // A scrollbar narrows the field's text box; narrow the overlay's too.
      const borders =
        (Number.parseFloat(computed.borderLeftWidth) || 0) +
        (Number.parseFloat(computed.borderRightWidth) || 0);
      const scrollbar = Math.max(0, (field.offsetWidth - field.clientWidth) / unitRef.current - borders);
      overlay.style.paddingRight = `${(Number.parseFloat(computed.paddingRight) || 0) + scrollbar}px`;
      const content = contentRef.current;
      if (content) {
        content.style.transform = `translate(${-field.scrollLeft / unitRef.current}px, ${-field.scrollTop / unitRef.current}px)`;
      }
    };
    place();
    const onScroll = () => {
      const content = contentRef.current;
      if (content) {
        content.style.transform = `translate(${-field.scrollLeft / unitRef.current}px, ${-field.scrollTop / unitRef.current}px)`;
      }
    };
    field.addEventListener("scroll", onScroll);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(field);
    return () => {
      field.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [field, multiline, value]);

  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) parts.push(value.slice(cursor, span.start));
    parts.push(
      <mark key={`${span.start}-${index}`} className={styles.fieldMention}>
        {value.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });
  parts.push(value.slice(cursor));
  // A trailing newline needs a character after it to take up its line.
  if (multiline && value.endsWith("\n")) parts.push(" ");

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className={styles.fieldOverlay}
      data-multiline={multiline ? "true" : undefined}
      data-testid="comment-mention-field-overlay"
    >
      <div ref={contentRef} className={styles.fieldOverlayContent}>
        {parts}
      </div>
    </div>
  );
}

function MentionPicker({
  field,
  listId,
  picker,
  onHover,
  onPick,
}: {
  field: FieldElement;
  listId: string;
  picker: PickerState;
  onHover: (index: number) => void;
  onPick: (person: MentionCandidate) => void;
}) {
  const t = useTranslations("console-notebooks");
  const layerTarget = usePopupPortalTarget();
  // A modal dialog (Radix) treats a press outside its own DOM as a dismissal
  // and leaves <body> inert: inside one, the list opens inside the dialog.
  const modal = field.closest<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"], [role="alertdialog"]',
  );
  const target = modal ?? layerTarget;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const rect = field.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 240), 340, window.innerWidth - 16);
      const height = panel.offsetHeight || 0;
      const below = window.innerHeight - rect.bottom;
      const top =
        below < height + 8 && rect.top > below
          ? Math.max(8, rect.top - height - 4)
          : Math.min(rect.bottom + 4, window.innerHeight - height - 8);
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      panel.style.width = `${width}px`;
      if (modal) {
        // Positioned inside the dialog's own box (it may be transformed).
        const box = modal.getBoundingClientRect();
        panel.style.position = "absolute";
        panel.style.left = `${left - box.left - modal.clientLeft + modal.scrollLeft}px`;
        panel.style.top = `${Math.max(8, top) - box.top - modal.clientTop + modal.scrollTop}px`;
      } else {
        panel.style.left = `${left}px`;
        panel.style.top = `${Math.max(8, top)}px`;
      }
      panel.style.zIndex = String(layerAbove(field));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [field, modal, picker.items.length]);

  useEffect(() => {
    const row = panelRef.current?.querySelector<HTMLElement>(
      `[data-active="true"]`,
    );
    row?.scrollIntoView?.({ block: "nearest" });
  }, [picker.active]);

  if (!target) return null;
  return createPortal(
    <div
      ref={panelRef}
      className={styles.picker}
      style={themeTokens(field)}
      data-testid="comment-mention-picker"
      onMouseDown={(event) => event.preventDefault()}
    >
      <ul
        id={listId}
        role="listbox"
        aria-label={t("commentMentions.listLabel")}
        className={styles.pickerList}
      >
        {picker.items.map((person, index) => (
          <li
            key={person.userId}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === picker.active}
            data-active={index === picker.active ? "true" : undefined}
            data-testid="comment-mention-option"
            className={styles.pickerRow}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(person)}
          >
            <UserAvatar
              name={person.displayName}
              email={person.email}
              accentColor={person.accentColor}
              avatar={person.avatar}
              size={24}
            />
            <span className={styles.pickerCopy}>
              <strong>{person.displayName}</strong>
              {!person.canView ? (
                <small>{t("commentMentions.noAccessHint")}</small>
              ) : person.email ? (
                <small>{person.email}</small>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>,
    target,
  );
}

interface MentionFieldHandlers<E extends FieldElement> {
  onChange?: (event: React.ChangeEvent<E>) => void;
  onKeyDown?: (event: KeyboardEvent<E>) => void;
  onSelect?: (event: SyntheticEvent<E>) => void;
  onClick?: (event: React.MouseEvent<E>) => void;
  onBlur?: (event: React.FocusEvent<E>) => void;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/** The picker, the overlay and the key handling, for a textarea or an input. */
function useMentionField<E extends FieldElement>(
  mentions: CommentMentionsController | null | undefined,
  value: string,
  handlers: MentionFieldHandlers<E>,
  forwardedRef: ForwardedRef<E>,
  maxLength: number | undefined,
) {
  const [field, setField] = useState<E | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const pendingCaret = useRef<{ text: string; caret: number } | null>(null);
  // The text a pick just produced: until it changes, the "@Name " the pick
  // inserted must not reopen the list (the pick may not be in the roster yet).
  const lastPick = useRef<string | null>(null);
  const searchSeq = useRef(0);
  const debounce = useRef<number | null>(null);
  const listId = `${useId().replace(/:/g, "")}-mentions`;
  const spans = useMemo(
    () => (mentions && value ? mentions.resolve(value) : []),
    [mentions, value],
  );

  const setRef = useCallback(
    (node: E | null) => {
      setField(node);
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(
    () => () => {
      if (debounce.current !== null) window.clearTimeout(debounce.current);
    },
    [],
  );

  // After a pick or a removal the host re-renders with the new text; the caret
  // goes where the edit left it.
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending || !field || field.value !== pending.text) return;
    pendingCaret.current = null;
    field.setSelectionRange(pending.caret, pending.caret);
  }, [field, value]);

  const close = useCallback(() => {
    searchSeq.current += 1;
    if (debounce.current !== null) window.clearTimeout(debounce.current);
    debounce.current = null;
    setPicker(null);
  }, []);

  const refresh = useCallback(
    (element: E) => {
      if (!mentions || element.disabled || element.readOnly) {
        if (picker) close();
        return;
      }
      if (lastPick.current !== null) {
        if (element.value === lastPick.current) {
          if (picker) close();
          return;
        }
        lastPick.current = null;
      }
      const caret = element.selectionStart ?? element.value.length;
      if (element.selectionEnd !== caret) {
        if (picker) close();
        return;
      }
      const trigger = findMentionTrigger(
        element.value,
        caret,
        mentions.resolve(element.value),
      );
      if (!trigger) {
        if (picker) close();
        return;
      }
      const seq = searchSeq.current + 1;
      searchSeq.current = seq;
      setPicker((current) => ({
        trigger,
        caret,
        items:
          current && current.trigger.start === trigger.start ? current.items : [],
        active: 0,
        loading: true,
      }));
      const run = () => {
        debounce.current = null;
        void mentions
          .search(trigger.query)
          .then((items) => {
            if (searchSeq.current !== seq) return;
            const ordered = [
              ...items.filter((item) => item.canView),
              ...items.filter((item) => !item.canView),
            ]
              .filter((item) => item.userId !== mentions.selfId)
              .slice(0, PICKER_ROWS);
            if (ordered.length === 0 && /\s/.test(trigger.query)) {
              setPicker(null);
              return;
            }
            setPicker({ trigger, caret, items: ordered, active: 0, loading: false });
          })
          .catch(() => {
            if (searchSeq.current === seq) setPicker(null);
          });
      };
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      if (mentions.rosterComplete) run();
      else debounce.current = window.setTimeout(run, SEARCH_DEBOUNCE_MS);
    },
    [close, mentions, picker],
  );

  const pick = useCallback(
    (person: MentionCandidate) => {
      if (!field || !picker || !mentions) return;
      const next = applyMentionPick(field.value, picker.trigger, picker.caret, person);
      close();
      if (maxLength !== undefined && maxLength >= 0 && next.text.length > maxLength) {
        return;
      }
      mentions.rememberPick(person);
      pendingCaret.current = next;
      lastPick.current = next.text;
      setFieldValue(field, next.text);
      field.focus();
    },
    [close, field, maxLength, mentions, picker],
  );

  const onKeyDown = (event: KeyboardEvent<E>) => {
    const composing =
      (event.nativeEvent as { isComposing?: boolean }).isComposing ||
      event.keyCode === 229;
    if (mentions && !composing && !event.altKey && !event.metaKey && !event.ctrlKey) {
      if (picker) {
        const count = picker.items.length;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (count > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          event.stopPropagation();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setPicker({ ...picker, active: (picker.active + step + count) % count });
          return;
        }
        if (count > 0 && (event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          pick(picker.items[picker.active] ?? picker.items[0]);
          return;
        }
      }
      if (event.key === "Backspace" && field && !event.shiftKey) {
        const caret = field.selectionStart ?? 0;
        if (caret === field.selectionEnd) {
          const removed = removeMentionEndingAt(field.value, caret, spans);
          if (removed) {
            event.preventDefault();
            event.stopPropagation();
            pendingCaret.current = removed;
            setFieldValue(field, removed.text);
            return;
          }
        }
      }
    }
    handlers.onKeyDown?.(event);
  };

  const fieldProps = {
    ref: setRef,
    onKeyDown,
    onChange: (event: React.ChangeEvent<E>) => {
      handlers.onChange?.(event);
      refresh(event.currentTarget);
    },
    onSelect: (event: SyntheticEvent<E>) => {
      handlers.onSelect?.(event);
      if (picker || event.currentTarget.value.includes("@")) refresh(event.currentTarget);
    },
    onClick: (event: React.MouseEvent<E>) => {
      handlers.onClick?.(event);
      refresh(event.currentTarget);
    },
    onBlur: (event: React.FocusEvent<E>) => {
      handlers.onBlur?.(event);
      close();
    },
    ...(mentions
      ? {
          "aria-autocomplete": "list" as const,
          "aria-controls": picker && picker.items.length > 0 ? listId : undefined,
          "aria-activedescendant":
            picker && picker.items.length > 0
              ? `${listId}-${picker.active}`
              : undefined,
        }
      : {}),
  };

  const extras =
    mentions && field ? (
      <>
        {spans.length > 0 ? (
          <MentionFieldOverlay
            field={field}
            spans={spans}
            value={value}
            multiline={field instanceof HTMLTextAreaElement}
          />
        ) : null}
        {picker && picker.items.length > 0 ? (
          <MentionPicker
            field={field}
            listId={listId}
            picker={picker}
            onHover={(index) => setPicker({ ...picker, active: index })}
            onPick={pick}
          />
        ) : null}
      </>
    ) : null;

  return { fieldProps, extras };
}

export type MentionTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  /** The page's mention controller; null/undefined = an ordinary textarea. */
  mentions?: CommentMentionsController | null;
};

/** A comment box with @mentions. Without a controller it is a plain textarea. */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea(
    { mentions, value, onChange, onKeyDown, onSelect, onClick, onBlur, ...rest },
    ref,
  ) {
    const { fieldProps, extras } = useMentionField<HTMLTextAreaElement>(
      mentions,
      value,
      { onChange, onKeyDown, onSelect, onClick, onBlur },
      ref,
      rest.maxLength,
    );
    return (
      <>
        <textarea {...rest} value={value} {...fieldProps} />
        {extras}
      </>
    );
  },
);

export type MentionInputProps = InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  mentions?: CommentMentionsController | null;
};

/** A one-line comment box (a reply field) with @mentions. */
export const MentionInput = forwardRef<HTMLInputElement, MentionInputProps>(
  function MentionInput(
    { mentions, value, onChange, onKeyDown, onSelect, onClick, onBlur, ...rest },
    ref,
  ) {
    const { fieldProps, extras } = useMentionField<HTMLInputElement>(
      mentions,
      value,
      { onChange, onKeyDown, onSelect, onClick, onBlur },
      ref,
      rest.maxLength,
    );
    return (
      <>
        <input {...rest} value={value} {...fieldProps} />
        {extras}
      </>
    );
  },
);

// --- after posting: people who cannot open the page ----------------------------

function useNames(people: readonly MentionCandidate[]): string {
  const locale = useLocale();
  return useMemo(() => {
    const names = people.map((person) => person.displayName);
    try {
      return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
        names,
      );
    } catch {
      return names.join(", ");
    }
  }, [locale, people]);
}

let nextNoticeSlot = 0;

export interface CommentMentionNoticeProps {
  mentions: CommentMentionsController | null | undefined;
  /** The thread this surface shows; the notice prefers its own thread. */
  threadRef?: string | null;
  className?: string;
}

/**
 * What happened to a mention that could not reach everyone. Several surfaces
 * of one page may render this; exactly one of them shows it.
 */
export function CommentMentionNotice({
  mentions,
  threadRef = null,
  className,
}: CommentMentionNoticeProps) {
  const store = mentions?.notices ?? null;
  const [slotId] = useState(() => {
    nextNoticeSlot += 1;
    return nextNoticeSlot;
  });
  // Registering bumps the store's version, which re-renders this surface.
  useEffect(() => store?.register(slotId, threadRef), [slotId, store, threadRef]);
  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(listener) : () => undefined),
    [store],
  );
  useSyncExternalStore(
    subscribe,
    () => store?.getVersion() ?? 0,
    () => 0,
  );
  const notice = store?.notice ?? null;
  if (!mentions || !store || !notice || store.ownerSlot() !== slotId) {
    return null;
  }
  return (
    <CommentMentionNoticeCard
      key={`${notice.kind}-${notice.threadRef}`}
      className={className}
      mentions={mentions}
      notice={notice}
      onDismiss={() => {
        if (store.notice === notice) store.set(null);
      }}
    />
  );
}

function CommentMentionNoticeCard({
  className,
  mentions,
  notice,
  onDismiss,
}: {
  className?: string;
  mentions: CommentMentionsController;
  notice: CommentMentionNoticeState;
  onDismiss: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const people = notice.kind === "failed" ? [] : notice.people;
  const names = useNames(people);
  const [sheet, setSheet] = useState<
    | { phase: "closed" }
    | { phase: "opening" }
    | { phase: "open"; state: PageCollabState }
    | { phase: "failed" }
  >({ phase: "closed" });
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (notice.kind !== "shared") return;
    const timer = window.setTimeout(onDismiss, SHARED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice.kind, onDismiss]);

  const openShare = async () => {
    setSheet({ phase: "opening" });
    try {
      const state = await getPageCollab(
        mentions.pageId,
        undefined,
        mentions.workspaceId,
      );
      setSheet(state.isOwner ? { phase: "open", state } : { phase: "failed" });
    } catch {
      setSheet({ phase: "failed" });
    }
  };

  const classes = [styles.notice, className].filter(Boolean).join(" ");

  if (notice.kind === "failed") {
    return (
      <div className={classes} role="status" data-testid="comment-mention-notice" data-kind="failed">
        <p>{t("commentMentions.failed")}</p>
        <div className={styles.noticeActions}>
          <button type="button" onClick={onDismiss}>
            {t("commentMentions.dismiss")}
          </button>
        </div>
      </div>
    );
  }

  if (notice.kind === "shared") {
    return (
      <div className={classes} role="status" data-testid="comment-mention-notice" data-kind="shared">
        <p>
          {people.length > 0
            ? t("commentMentions.shared", { names })
            : t("commentMentions.sharedNobody")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={classes}
      role="status"
      data-testid="comment-mention-notice"
      data-kind={notice.canShare ? "share" : "ask-owner"}
    >
      <p>
        {t("commentMentions.needsAccess", { names })}
        {notice.canShare ? null : ` ${t("commentMentions.askOwner")}`}
      </p>
      {sheet.phase === "failed" ? (
        <p className={styles.noticeError} role="alert">
          {t("commentMentions.shareUnavailable")}
        </p>
      ) : null}
      <div className={styles.noticeActions}>
        {notice.canShare ? (
          <>
            <button type="button" onClick={onDismiss}>
              {t("commentMentions.notNow")}
            </button>
            <button
              type="button"
              data-primary="true"
              disabled={sheet.phase === "opening" || resending || !notice.notebookId}
              data-testid="comment-mention-share"
              onClick={() => void openShare()}
            >
              {t("commentMentions.share")}
            </button>
          </>
        ) : (
          <button type="button" data-primary="true" onClick={onDismiss}>
            {t("commentMentions.dismiss")}
          </button>
        )}
      </div>
      {sheet.phase === "open" && notice.notebookId ? (
        <PagePermissionSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet({ phase: "closed" });
          }}
          pageId={mentions.pageId}
          notebookId={notice.notebookId}
          workspaceId={mentions.workspaceId}
          state={sheet.state}
          suggestedViewerUserIds={people.map((person) => person.userId)}
          onChanged={(next) => {
            publishPageCollabAuthority(mentions.pageId, next, mentions.workspaceId);
            setSheet({ phase: "closed" });
            setResending(true);
            mentions
              .resend(notice)
              .catch(() => undefined)
              .finally(() => setResending(false));
          }}
        />
      ) : null}
    </div>
  );
}
