/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { landingPageType, type LandingPageType } from "./windows/generatedPageTypes";

export const IN_PLACE_REVIEW_META_PREFIX = "review_";
/**
 * A review window that took the live draft page's window over names that page,
 * for its title bar only (Window.tsx): never what is confirmed.
 */
export const LIVE_DRAFT_PAGE_META = "live_draft_page_id";
/** Marks the review window state synthesized for an open page's window. */
export const IN_PLACE_REVIEW_MARKER = "in_place_review";

/** The review keys a page window carries, without their prefix. */
const REVIEW_KEYS = [
  "proposal_id",
  "agent_run_ref",
  "workspace_id",
  "title",
  "page_type",
  "content_markdown",
  "preview_document_format",
  "preview_rows",
  "preview_slides",
  "preview_notices",
  // Made ready out of sight (lib/page-draft-staging): the window keeps
  // showing the run's live edit until the review is ready.
  "staged",
] as const;

type Meta = Readonly<Record<string, string | undefined>>;

export interface InPlaceReviewRequest {
  readonly proposal_id?: string;
  readonly agent_run_ref?: string;
  readonly notebook_id?: string;
  readonly page_id?: string;
  readonly page_type?: string;
  readonly mode?: string;
  readonly title?: string;
  readonly workspace_id?: string;
  readonly content_markdown?: string;
  readonly preview_document_format?: string;
  readonly preview_rows?: string;
  readonly preview_slides?: string;
  readonly preview_notices?: string;
  readonly staged?: string;
}

interface PageWindowLike {
  readonly id: string;
  readonly type: string;
  readonly zIndex: number;
  readonly minimized?: boolean;
  readonly collaboration?: unknown;
  readonly meta: Meta;
}

export function isInPlaceReviewKey(key: string): boolean {
  return key.startsWith(IN_PLACE_REVIEW_META_PREFIX);
}

/** The proposal a page window is reviewing in place, if any. */
export function inPlaceReviewOf(meta: Meta): { proposalId: string; agentRunRef: string } | null {
  const proposalId = meta[`${IN_PLACE_REVIEW_META_PREFIX}proposal_id`];
  const agentRunRef = meta[`${IN_PLACE_REVIEW_META_PREFIX}agent_run_ref`];
  return proposalId && agentRunRef ? { proposalId, agentRunRef } : null;
}

/** The page window meta that puts a review in place (prefixed keys only). */
export function inPlaceReviewMeta(request: InPlaceReviewRequest): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const key of REVIEW_KEYS) {
    const value = request[key];
    if (typeof value === "string" && value) meta[`${IN_PLACE_REVIEW_META_PREFIX}${key}`] = value;
  }
  return meta;
}

/**
 * A window's meta as it may leave this canvas (a shared window's room): the
 * review is this member's own, so no other member's window ever shows it.
 */
export function withoutInPlaceReviewMeta(meta: Meta): Record<string, string> {
  const shared: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string" && !isInPlaceReviewKey(key)) shared[key] = value;
  }
  return shared;
}

/**
 * A shared window's meta as the room sends it, applied to this canvas: the
 * room's review keys (never this member's) are dropped and this window's own
 * review stays where it is.
 */
export function withLocalInPlaceReview(remote: Meta, local: Meta | undefined): Record<string, string> {
  const meta = withoutInPlaceReviewMeta(remote);
  for (const [key, value] of Object.entries(local ?? {})) {
    if (typeof value === "string" && isInPlaceReviewKey(key)) meta[key] = value;
  }
  return meta;
}

/** The meta update that takes every review key off a page window. */
export function clearedInPlaceReviewMeta(meta: Meta): Record<string, null> {
  const cleared: Record<string, null> = {};
  for (const key of Object.keys(meta)) if (isInPlaceReviewKey(key)) cleared[key] = null;
  return cleared;
}

/**
 * The review window meta a page window's in-place review stands for: what
 * the review surface reads, bound to the page this window shows. Null when
 * the window reviews nothing, or a proposal of another page type.
 */
export function pageDraftMetaFromInPlaceReview(meta: Meta): Record<string, string> | null {
  const review = inPlaceReviewOf(meta);
  const pageId = meta.pageId;
  const notebookId = meta.notebookId;
  if (!review || !pageId || !notebookId) return null;
  const pageType = landingPageType(meta.pageType ?? meta[`${IN_PLACE_REVIEW_META_PREFIX}page_type`]);
  const proposed = meta[`${IN_PLACE_REVIEW_META_PREFIX}page_type`];
  if (!pageType || (proposed && proposed !== pageType)) return null;
  const draft: Record<string, string> = {};
  for (const key of REVIEW_KEYS) {
    const value = meta[`${IN_PLACE_REVIEW_META_PREFIX}${key}`];
    if (value) draft[key] = value;
  }
  return {
    ...draft,
    notebook_id: notebookId,
    page_id: pageId,
    page_type: pageType,
    mode: "update",
    [IN_PLACE_REVIEW_MARKER]: "true",
  };
}

export type InPlaceReviewPlan =
  | {
      readonly kind: "in_place";
      readonly windowId: string;
      /** The window already shows this very review: only bring it forward. */
      readonly already: boolean;
      readonly minimized: boolean;
      /**
       * Another run's still-pending review this one displaces from the
       * window: it keeps today's behaviour, a review window of its own.
       */
      readonly displaced: Record<string, string> | null;
    }
  | {
      readonly kind: "window";
      readonly reason:
        | "not_update"
        | "not_run_scoped"
        | "unsupported_type"
        | "page_not_open"
        | "shared"
        | "settling"
        | "unsaved";
    };

/**
 * Where a review is shown: in the open page's own window, or (today's
 * behaviour) a review window of its own.
 *
 * In place only for a run-scoped update of a document, workbook or deck whose
 * page has a window on this canvas of this member's own, and only when that
 * window's editor has nothing unsaved: the editor is taken off while the
 * review shows, so unsaved work keeps the editor and the review opens beside
 * it.
 *
 * On a shared page the page's window is a collaboration instance. The
 * member's own instance qualifies (`ownsSharedWindow`): the review keys never
 * leave this canvas (withoutInPlaceReviewMeta / withLocalInPlaceReview at the
 * room boundary), so the other members keep seeing the page. Another
 * member's instance does not, and without `ownsSharedWindow` no shared
 * window does.
 */
export function planInPlaceReview<T extends PageWindowLike>(
  windows: readonly T[],
  request: InPlaceReviewRequest,
  options: {
    /** True when the window's editor holds nothing unsaved (or none is mounted). */
    readonly editorCanLeave: (windowId: string) => boolean;
    /** True while the window lands a confirmed review. */
    readonly isSettling?: (windowId: string) => boolean;
    /** True when a collaboration window is this member's own instance. */
    readonly ownsSharedWindow?: (windowId: string) => boolean;
  },
): InPlaceReviewPlan {
  if (request.mode !== "update" || !request.page_id) return { kind: "window", reason: "not_update" };
  if (!request.proposal_id || !request.agent_run_ref) return { kind: "window", reason: "not_run_scoped" };
  const requestedType = request.page_type ? landingPageType(request.page_type) : null;
  if (request.page_type && !requestedType) return { kind: "window", reason: "unsupported_type" };
  const pageWindows = windows.filter((item) =>
    item.type === "note" && item.meta.pageId === request.page_id &&
    (!request.notebook_id || !item.meta.notebookId || item.meta.notebookId === request.notebook_id));
  if (pageWindows.length === 0) return { kind: "window", reason: "page_not_open" };
  const own = pageWindows.filter((item) =>
    !item.collaboration || options.ownsSharedWindow?.(item.id) === true);
  if (own.length === 0) return { kind: "window", reason: "shared" };
  const sameReview = own.find((item) => {
    const review = inPlaceReviewOf(item.meta);
    return review !== null && review.proposalId === request.proposal_id && review.agentRunRef === request.agent_run_ref;
  });
  if (sameReview) {
    return { kind: "in_place", windowId: sameReview.id, already: true,
      minimized: Boolean(sameReview.minimized), displaced: null };
  }
  const target = own.reduce((front, item) => (item.zIndex > front.zIndex ? item : front));
  const windowType: LandingPageType | null = target.meta.pageType
    ? landingPageType(target.meta.pageType) : requestedType;
  if (!windowType || (requestedType && requestedType !== windowType)) {
    return { kind: "window", reason: "unsupported_type" };
  }
  if (options.isSettling?.(target.id)) return { kind: "window", reason: "settling" };
  const current = inPlaceReviewOf(target.meta);
  // A window already reviewing has no editor mounted, so nothing unsaved.
  if (!current && !options.editorCanLeave(target.id)) return { kind: "window", reason: "unsaved" };
  // The newest review takes the window. Within one run the older one was
  // superseded by this proposal (the API retires it); another run's is still
  // pending and goes back to a review window of its own.
  const displaced = current && current.agentRunRef !== request.agent_run_ref
    ? pageDraftMetaFromInPlaceReview(target.meta)
    : null;
  if (displaced) delete displaced[IN_PLACE_REVIEW_MARKER];
  return { kind: "in_place", windowId: target.id, already: false,
    minimized: Boolean(target.minimized), displaced };
}

/**
 * Windows landing a confirmed in-place review right now: their review keys
 * stay until the page has painted, and a newer review must not displace it.
 */
const settlingWindows = new Set<string>();

export function markInPlaceReviewSettling(windowId: string, settling: boolean): void {
  if (settling) settlingWindows.add(windowId);
  else settlingWindows.delete(windowId);
}

export function isInPlaceReviewSettling(windowId: string): boolean {
  return settlingWindows.has(windowId);
}

/**
 * The run reports a page proposal no longer pending (executed elsewhere,
 * rejected, superseded by a newer one, expired): a window reviewing it in
 * place goes back to its editor.
 */
export const PAGE_REVIEW_RETIRED_EVENT = "mrnote:page-review-retired";

export interface PageReviewRetiredDetail {
  readonly agentRunRef: string;
  readonly proposalId: string;
  /**
   * Confirmed elsewhere, as this page: a review window of a new page goes
   * onto it in its own frame instead of closing (useAgentDraftPageReviews).
   */
  readonly publishedPageId?: string;
}

export function dispatchPageReviewRetired(detail: PageReviewRetiredDetail): void {
  if (typeof window === "undefined" || !detail.agentRunRef || !detail.proposalId) return;
  window.dispatchEvent(new CustomEvent<PageReviewRetiredDetail>(PAGE_REVIEW_RETIRED_EVENT, { detail }));
}









const LIVE_RUN_KEY = `${IN_PLACE_REVIEW_META_PREFIX}live_run`;
const LIVE_STEPS_KEY = `${IN_PLACE_REVIEW_META_PREFIX}live_steps`;
const LIVE_WORKSPACE_KEY = `${IN_PLACE_REVIEW_META_PREFIX}live_workspace`;

export interface LiveEditOfWindow {
  readonly agentRunRef: string;
  readonly steps: number;
  readonly workspaceId: string | null;
}

/** The run writing an edit of this window's page, unless a review stands here. */
export function liveEditOf(meta: Meta): LiveEditOfWindow | null {
  const agentRunRef = meta[LIVE_RUN_KEY];
  if (!agentRunRef || inPlaceReviewOf(meta)) return null;
  const steps = Number(meta[LIVE_STEPS_KEY] ?? "0");
  return { agentRunRef, steps: Number.isFinite(steps) ? steps : 0,
    workspaceId: meta[LIVE_WORKSPACE_KEY] || null };
}

/** The run's live edit a staged review keeps on screen while it gets ready
 * out of sight (the review's own keys are present meanwhile). */
export function stagedLiveEditOf(meta: Meta): LiveEditOfWindow | null {
  const agentRunRef = meta[LIVE_RUN_KEY];
  if (!agentRunRef || meta[`${IN_PLACE_REVIEW_META_PREFIX}staged`] !== "true") return null;
  const steps = Number(meta[LIVE_STEPS_KEY] ?? "0");
  return { agentRunRef, steps: Number.isFinite(steps) ? steps : 0,
    workspaceId: meta[LIVE_WORKSPACE_KEY] || null };
}

/** A staged in-place review is ready: it shows, and the live edit goes. */
export function stagedInPlaceReviewShownMeta(): Record<string, null> {
  return { [`${IN_PLACE_REVIEW_META_PREFIX}staged`]: null, [LIVE_RUN_KEY]: null,
    [LIVE_STEPS_KEY]: null, [LIVE_WORKSPACE_KEY]: null };
}

/** The live-edit keys of a window (kept while its review is staged). */
export function isLiveEditKey(key: string): boolean {
  return key === LIVE_RUN_KEY || key === LIVE_STEPS_KEY || key === LIVE_WORKSPACE_KEY;
}

export const PAGE_LIVE_EDIT_EVENT = "mrnote:page-live-edit";

export interface PageLiveEditDetail {
  readonly agent_run_ref: string;
  /** Absent with `ended`: every window following the run goes back. */
  readonly page_id?: string;
  readonly notebook_id?: string;
  readonly workspace_id?: string;
  /** How many finished steps the run has written (a new number: read again). */
  readonly steps?: number;
  readonly ended?: boolean;
}

export function dispatchPageLiveEdit(detail: PageLiveEditDetail): void {
  if (typeof window === "undefined" || !detail.agent_run_ref) return;
  window.dispatchEvent(new CustomEvent<PageLiveEditDetail>(PAGE_LIVE_EDIT_EVENT, { detail }));
}

/**
 * The window meta changes one live-edit notice makes: which windows start,
 * follow or stop showing the run. A window reviewing a proposal, a shared
 * window that is not this member's own, or an editor holding unsaved work
 * is left alone; the live view never takes a window from anything.
 */
export function planLiveEdit<T extends PageWindowLike>(
  windows: readonly T[],
  detail: PageLiveEditDetail,
  options: {
    readonly editorCanLeave: (windowId: string) => boolean;
    readonly isSettling?: (windowId: string) => boolean;
    readonly ownsSharedWindow?: (windowId: string) => boolean;
  },
): { readonly windowId: string; readonly meta: Record<string, string | null> }[] {
  const following = windows.filter((item) => item.meta[LIVE_RUN_KEY] === detail.agent_run_ref);
  const cleared = { [LIVE_RUN_KEY]: null, [LIVE_STEPS_KEY]: null, [LIVE_WORKSPACE_KEY]: null };
  if (detail.ended || !detail.page_id) {
    // A review getting ready over the live view keeps it until it shows
    // (stagedInPlaceReviewShownMeta clears it then).
    return following
      .filter((item) => item.meta[`${IN_PLACE_REVIEW_META_PREFIX}staged`] !== "true")
      .map((item) => ({ windowId: item.id, meta: cleared }));
  }
  const changes: { windowId: string; meta: Record<string, string | null> }[] = [];
  // A run edits one page at a time: a window of another page stops following.
  for (const item of following) {
    if (item.meta.pageId !== detail.page_id) changes.push({ windowId: item.id, meta: cleared });
  }
  const steps = String(Math.max(0, Math.floor(detail.steps ?? 0)));
  const shown = following.find((item) => item.meta.pageId === detail.page_id);
  if (shown) {
    if (shown.meta[LIVE_STEPS_KEY] !== steps) changes.push({ windowId: shown.id, meta: { [LIVE_STEPS_KEY]: steps } });
    return changes;
  }
  const own = windows.filter((item) =>
    item.type === "note" && item.meta.pageId === detail.page_id &&
    (!detail.notebook_id || !item.meta.notebookId || item.meta.notebookId === detail.notebook_id) &&
    (!item.collaboration || options.ownsSharedWindow?.(item.id) === true));
  if (own.length === 0) return changes;
  const target = own.reduce((front, item) => (item.zIndex > front.zIndex ? item : front));
  if (!landingPageType(target.meta.pageType) || inPlaceReviewOf(target.meta) ||
      options.isSettling?.(target.id) || !options.editorCanLeave(target.id)) return changes;
  changes.push({ windowId: target.id, meta: {
    [LIVE_RUN_KEY]: detail.agent_run_ref,
    [LIVE_STEPS_KEY]: steps,
    ...(detail.workspace_id ? { [LIVE_WORKSPACE_KEY]: detail.workspace_id } : {}),
  } });
  return changes;
}

/**
 * A PDF find-and-replace being prepared for a page: the page's PDF window
 * highlights what it will change (usePdfLiveEditFind). `ended` lets go.
 */
export const PDF_LIVE_EDIT_EVENT = "mrnote:pdf-live-edit";

export interface PdfLiveEditDetail {
  readonly agent_run_ref: string;
  readonly page_id?: string;
  readonly find?: string;
  readonly replace?: string;
  readonly ended?: boolean;
}

export function dispatchPdfLiveEdit(detail: PdfLiveEditDetail): void {
  if (typeof window === "undefined" || !detail.agent_run_ref) return;
  window.dispatchEvent(new CustomEvent<PdfLiveEditDetail>(PDF_LIVE_EDIT_EVENT, { detail }));
}
