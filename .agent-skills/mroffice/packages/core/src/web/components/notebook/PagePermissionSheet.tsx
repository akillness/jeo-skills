"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** File access is one revision-bound, complete named audience, not Window Use. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "../../../host/next-intl";
import {
  Check,
  Globe2,
  Lock,
  PenLine,
  ShieldCheck,
  UsersRound,
} from "../office-ribbon/icons/houseIcons";

import { CupertinoSheet, sheetStyles } from "./CupertinoSheet";
import styles from "./PagePermissionSheet.module.css";
import { Reveal } from "../../__cut__/m29998b7df8";
import { SlidingSegmentedControl } from "../console/SlidingSegmentedControl";
import {
  followNotebookPageAccess,
  getPageAccessFollow,
  getPageAccessPolicy,
  getPageCollab,
  replacePageAccessPolicy,
  type PageAccessFollow,
  type PageAccessGrant,
  type PageAccessPolicy,
  type PageCollabState,
  type PageVisibility,
} from "../../lib/page-collab-sdk";
import { ApiRequestError } from "../../lib/api";
import { subscribeAuthState } from "../../lib/auth-state";
import { usePageWorkspaceId } from "../../lib/collab/page-writable";
import {
  collaborationRequestAbortError,
  runCollaborationRequestWithTimeout,
} from "../../lib/collaboration-windows/request-timeout";
import { listNotebookMembers } from "../../lib/collaboration-sdk";
import { boxWithin, watchGlideLayout } from "../../lib/glide-geometry";
import UserAvatar from "../console/UserAvatar";
import type { UserAvatarSource } from "../../lib/user-avatar";
import { announcePageFileShared } from "../../lib/collaboration-windows/page-file-shared";
import { pageFollowText } from "../../lib/page-follow-text";
import { useProductSurface } from "../../lib/use-product-surface";

const TIERS: PageVisibility[] = [
  "private",
  "shared_readonly",
  "shared_editable",
];
const TIER_ICON: Record<PageVisibility, typeof Lock> = {
  private: Lock,
  shared_readonly: PenLine,
  shared_editable: Globe2,
};
/** How long a finished save keeps saying so before its control folds away. */
const SAVED_HOLD_MS = 1200;

type MemberAccess = "none" | "view" | "edit";

/**
 * What the last save changed, for the moment after it lands: the save
 * control says "Saved" and the rows it touched catch a brief light.
 */
interface SaveFeedback {
  readonly rows: ReadonlySet<string>;
  readonly tier: PageVisibility | null;
}

export interface PagePermissionMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  isOwner: boolean;
  isSelf: boolean;
  accentColor?: string | null;
  avatar?: UserAvatarSource | null;
}

interface EditorProps {
  /** Reads run only while the hosting surface is open. */
  open: boolean;
  pageId: string;
  notebookId: string | null;
  workspaceId?: string | null;
  state: PageCollabState;
  onChanged: (next: PageCollabState) => void;
  /** Inject only a roster; policy reads and saves still require real authority. */
  membersOverride?: PagePermissionMember[];
  /** Explicit public demonstration: no reads, writes or fabricated authority. */
  preview?: boolean;
  /** The parent closes this sheet and opens its existing sibling hand-over sheet. */
  onRequestHandOver?: () => void;
  /**
   * People to pre-select as "Can view" when the sheet opens (an @mention of
   * someone who cannot open the page: Microsoft's "Share and notify"). Only a
   * draft — nothing is saved until the owner presses Save. A private page is
   * pre-set to specific people.
   */
  suggestedViewerUserIds?: readonly string[];
}

interface Props extends EditorProps {
  onOpenChange: (open: boolean) => void;
}

/** The file permission editor shown inside another sheet (a page window's share sheet). */
export interface PagePermissionEditorProps extends EditorProps {
  /** Replaces the "who can see" heading of the first group. */
  heading?: string;
}

interface EditorScopeProps extends EditorProps {
  heading?: string;
  /** The signed-in account changed: the draft is retired and the host closes. */
  onAccountRetired?: () => void;
  /** Wraps the editor's groups; without it they render in place. */
  shell?: (
    body: ReactNode,
    draft: { visibility: PageVisibility; saving: boolean },
  ) => ReactNode;
}

function sameGrants(
  left: readonly PageAccessGrant[],
  right: readonly PageAccessGrant[],
) {
  return (
    left.length === right.length &&
    left.every((grant) =>
      right.some(
        (candidate) =>
          candidate.userId === grant.userId &&
          candidate.grantRole === grant.grantRole &&
          candidate.membershipIncarnation === grant.membershipIncarnation,
      ),
    )
  );
}

function uncertainMutation(error: unknown) {
  return (
    !(error instanceof ApiRequestError) ||
    error.status === 0 ||
    error.status >= 500
  );
}

function candidateIncarnation(member: PagePermissionMember) {
  return member.isOwner ? null : member.id;
}

function validatedMembers(
  members: PagePermissionMember[],
): PagePermissionMember[] {
  const canonical = (value: unknown, max: number): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= max &&
    value.normalize("NFC") === value && !/[\s\p{C}]/u.test(value);
  if (
    members.length > 501 ||
    new Set(members.map((member) => member.userId)).size !== members.length ||
    new Set(members.map((member) => member.id)).size !== members.length ||
    members.filter((member) => member.isOwner).length > 1 ||
    members.some(
      (member) =>
        !canonical(member.id, member.isOwner ? 262 : 36) ||
        !canonical(member.userId, 256) ||
        typeof member.isOwner !== "boolean" ||
        typeof member.isSelf !== "boolean" ||
        typeof member.name !== "string" ||
        typeof member.email !== "string" ||
        !["viewer", "editor", "manager"].includes(member.role) ||
        (member.isOwner
          ? member.id !== `owner:${member.userId}`
          : member.id.length > 36),
    )
  )
    throw new Error("File recipient membership is unavailable");
  return members.map((member) => ({ ...member }));
}

function currentGrants(
  policy: PageAccessPolicy,
  members: PagePermissionMember[],
) {
  return policy.grants.flatMap((grant): PageAccessGrant[] => {
    const member = members.find(
      (candidate) =>
        candidate.userId === grant.userId &&
        candidate.userId !== policy.ownerUserId &&
        candidateIncarnation(candidate) === grant.membershipIncarnation,
    );
    return member
      ? [
          {
            ...grant,
            grantRole: member.role === "viewer" ? "view" : grant.grantRole,
          },
        ]
      : [];
  });
}



function roleGrants(
  members: PagePermissionMember[],
  ownerUserId: string,
): PageAccessGrant[] {
  return members
    .filter((member) => member.userId !== ownerUserId)
    .map((member) => ({
      userId: member.userId,
      grantRole: member.role === "viewer" ? "view" : "edit",
      membershipIncarnation: candidateIncarnation(member),
    }));
}

/** The people whose shown access differs between two complete grant sets. */
function changedRecipients(
  before: readonly PageAccessGrant[],
  after: readonly PageAccessGrant[],
): Set<string> {
  const role = (grants: readonly PageAccessGrant[], userId: string) =>
    grants.find((grant) => grant.userId === userId)?.grantRole ?? "none";
  return new Set(
    [...before, ...after]
      .map((grant) => grant.userId)
      .filter((userId) => role(before, userId) !== role(after, userId)),
  );
}

function PagePermissionEditorScope({
  open,
  pageId,
  notebookId,
  workspaceId,
  state,
  onChanged,
  membersOverride,
  preview = false,
  onRequestHandOver,
  suggestedViewerUserIds,
  heading,
  onAccountRetired,
  shell,
}: EditorScopeProps) {
  const t = useTranslations("console-notebooks");
  const [loaded, setLoaded] = useState<{
    policy: PageAccessPolicy;
    members: PagePermissionMember[];
    /** null: the follow state could not be read (the tier is not offered) */
    follow: PageAccessFollow | null;
  } | null>(null);
  // the page's language (<html lang>, set by the locale layout)
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  const followProduct = useProductSurface() === "office" ? "office" : "note";
  const [draftFollow, setDraftFollow] = useState(false);
  const [visibility, setVisibility] = useState(state.visibility);
  const [grants, setGrants] = useState<readonly PageAccessGrant[]>([]);
  const [confirmedLegacy, setConfirmedLegacy] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "failed">(
    "loading",
  );
  const [error, setError] = useState<"loadFailed" | "saveFailed" | null>(null);
  const [accountRetired, setAccountRetired] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const tiersRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const retiredRef = useRef(false);
  const onAccountRetiredRef = useRef(onAccountRetired);
  useEffect(() => {
    onAccountRetiredRef.current = onAccountRetired;
  }, [onAccountRetired]);
  const saving = phase === "saving";

  // "Saved" holds briefly, then the save control folds away. A new change
  // in the meantime simply turns it back into "Save".
  useEffect(() => {
    if (!saveFeedback) return;
    const timer = window.setTimeout(
      () => setSaveFeedback((current) => (current === saveFeedback ? null : current)),
      SAVED_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  // The selection highlight is one surface that glides to the chosen tier.
  // Only its geometry is measured here; the motion is a CSS transition, so
  // reduced motion lands it at once, and the choice itself never waits.
  useLayoutEffect(() => {
    const root = tiersRef.current;
    if (!root) return;
    const place = () => {
      const row = root.querySelector<HTMLElement>(
        `[data-tier="${draftFollow ? "follow" : visibility}"]`,
      );
      if (!row) return;
      // Measured as drawn, in the list's own pixels: offsetTop put the
      // highlight below its row where the engine answers it already zoomed
      
      const box = boxWithin(row, root);
      root.style.setProperty("--tier-glide-y", `${box.y}px`);
      root.style.setProperty("--tier-glide-h", `${box.height}px`);
      if (!root.dataset.glide) root.dataset.glide = "placed";
    };
    place();
    // Anything that moves the rows without a new choice (zoom, a wrapped
    // label, fonts, Touch mode) puts the highlight back at once, no glide.
    return watchGlideLayout(root, () => {
      const settled = root.dataset.glide === "ready";
      if (settled) root.dataset.glide = "placed";
      place();
      if (settled) {
        window.requestAnimationFrame(() => {
          if (root.dataset.glide === "placed") root.dataset.glide = "ready";
        });
      }
    });
  }, [draftFollow, visibility]);
  useEffect(() => {
    // The first position is where the highlight starts, not somewhere it
    // travels to: transitions switch on only after it has been drawn once.
    const root = tiersRef.current;
    if (!root) return;
    const frame = window.requestAnimationFrame(() => {
      root.dataset.glide = "ready";
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const retireRequest = useCallback(() => {
    const request = requestRef.current;
    requestRef.current = null;
    request?.abort(
      collaborationRequestAbortError("File permission scope changed"),
    );
  }, []);

  useEffect(() => {
    retiredRef.current = false;
    const unsubscribe = subscribeAuthState(() => {
      // Retire synchronously, before a late request can publish to another account.
      retiredRef.current = true;
      retireRequest();
      setAccountRetired(true);
      setLoaded(null);
      setPhase("failed");
      setError("loadFailed");
      onAccountRetiredRef.current?.();
    });
    return () => {
      retiredRef.current = true;
      retireRequest();
      unsubscribe();
    };
  }, [retireRequest]);

  const suggestionsRef = useRef(suggestedViewerUserIds);
  const install = useCallback(
    (
      policy: PageAccessPolicy,
      members: PagePermissionMember[],
      follow: PageAccessFollow | null,
    ) => {
      setLoaded({ policy, members, follow });
      setDraftFollow(Boolean(follow?.followsNotebook));
      // Old NULL/old-incarnation grants are never rebound to today's roster.
      const grants = currentGrants(policy, members);
      // Suggestions apply once, to the first policy this sheet loads.
      const suggested = suggestionsRef.current ?? [];
      suggestionsRef.current = undefined;
      const additions = members
        .filter(
          (member) =>
            suggested.includes(member.userId) &&
            member.userId !== policy.ownerUserId &&
            !grants.some((grant) => grant.userId === member.userId),
        )
        .map(
          (member): PageAccessGrant => ({
            userId: member.userId,
            grantRole: "view",
            membershipIncarnation: candidateIncarnation(member),
          }),
        );
      setVisibility(
        additions.length > 0 && policy.visibility === "private"
          ? "shared_readonly"
          : policy.visibility,
      );
      setGrants(additions.length > 0 ? [...grants, ...additions] : grants);
      setConfirmedLegacy(false);
      setPhase("ready");
    },
    [],
  );

  const reload = useCallback(async () => {
    retireRequest();
    setLoaded(null);
    setConfirmedLegacy(false);
    setError(null);
    if (preview || !open || !state.isOwner) {
      setPhase("ready");
      return;
    }
    if (
      !notebookId ||
      !workspaceId ||
      state.pageId !== pageId ||
      retiredRef.current
    ) {
      setPhase("failed");
      setError("loadFailed");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase("loading");
    try {
      const [policy, members, follow] = await runCollaborationRequestWithTimeout(
        controller,
        async (signal) => {
          const roster = membersOverride
            ? Promise.resolve(validatedMembers(membersOverride))
            : listNotebookMembers(notebookId, { signal, workspaceId }).then(
                (records) =>
                  validatedMembers(
                    records.map((record) => ({
                      id: record.id,
                      userId: record.userId,
                      name: record.displayName || record.email.split("@", 1)[0],
                      email: record.email,
                      role: record.role,
                      isOwner: record.isOwner,
                      isSelf: record.isSelf,
                      accentColor: record.accentColor,
                      avatar: record.avatar ?? null,
                    })),
                  ),
              );
          return Promise.all([
            getPageAccessPolicy(
              pageId,
              { notebookId, ownerUserId: state.owner.userId },
              { signal },
              workspaceId,
            ),
            roster,
            // Not offered when it cannot be read (an older server).
            Promise.resolve()
              .then(() => getPageAccessFollow(pageId, { signal }, workspaceId))
              .catch(() => null),
          ]);
        },
        "File permission read timed out",
      );
      if (requestRef.current === controller && !retiredRef.current)
        install(policy, members, follow);
    } catch {
      if (requestRef.current === controller && !retiredRef.current) {
        setPhase("failed");
        setError("loadFailed");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [
    install,
    membersOverride,
    notebookId,
    open,
    pageId,
    preview,
    retireRequest,
    state.isOwner,
    state.owner.userId,
    state.pageId,
    workspaceId,
  ]);

  useEffect(() => {
    // This reset begins an external, cancellable policy/roster load. Its
    // dependencies are source identities, not any of the draft state it sets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return retireRequest;
  }, [reload, retireRequest]);

  const candidates = useMemo(
    () =>
      (loaded?.members ?? []).filter(
        (member) => member.userId !== state.owner.userId,
      ),
    [loaded, state.owner.userId],
  );
  const canManage =
    !preview &&
    state.isOwner &&
    state.canEdit &&
    !!loaded &&
    phase === "ready" &&
    loaded.members.some(
      (member) =>
        member.userId === loaded.policy.ownerUserId && member.role !== "viewer",
    );
  const legacy = loaded?.policy.viewScope === "notebook_members_legacy";
  const staleRecipients =
    !!loaded &&
    currentGrants(loaded.policy, loaded.members).length !==
      loaded.policy.grants.length;
  const savedFollow = Boolean(loaded?.follow?.followsNotebook);
  const changed =
    !!loaded &&
    (draftFollow
      ? !savedFollow
      : savedFollow ||
        legacy ||
        visibility !== loaded.policy.visibility ||
        !sameGrants(grants, loaded.policy.grants));

  const save = async () => {
    if (
      !canManage ||
      !changed ||
      !loaded ||
      !workspaceId ||
      requestRef.current ||
      retiredRef.current ||
      (legacy && !confirmedLegacy && !draftFollow)
    )
      return;
    if (draftFollow) {
      await saveFollow();
      return;
    }
    const intent = {
      visibility,
      grants: grants.map((grant) => ({ ...grant })),
      confirmLegacyConversion: legacy === true && confirmedLegacy,
    };
    const feedback: SaveFeedback = {
      rows: changedRecipients(
        currentGrants(loaded.policy, loaded.members),
        intent.grants,
      ),
      tier:
        intent.visibility !== loaded.policy.visibility ? intent.visibility : null,
    };
    let controller = new AbortController();
    requestRef.current = controller;
    setPhase("saving");
    setError(null);
    setSaveFeedback(null);
    const active = () =>
      requestRef.current === controller && !retiredRef.current;
    try {
      let policy: PageAccessPolicy;
      try {
        policy = await runCollaborationRequestWithTimeout(
          controller,
          (signal) =>
            replacePageAccessPolicy(
              loaded.policy,
              intent,
              { signal },
              workspaceId,
            ),
          "File permission update timed out",
        );
      } catch (mutationError) {
        if (!active() || !uncertainMutation(mutationError)) throw mutationError;
        controller = new AbortController();
        requestRef.current = controller;
        policy = await runCollaborationRequestWithTimeout(
          controller,
          (signal) =>
            getPageAccessPolicy(pageId, loaded.policy, { signal }, workspaceId),
          "File permission reconciliation timed out",
        );
        if (
          policy.viewScope !== "explicit_grants" ||
          policy.visibility !== intent.visibility ||
          policy.aclRevision < loaded.policy.aclRevision ||
          !sameGrants(policy.grants, intent.grants)
        ) {
          throw new Error("File permission update was not confirmed");
        }
      }
      if (!active()) return;
      const next = await runCollaborationRequestWithTimeout(
        controller,
        (signal) => getPageCollab(pageId, { signal }, workspaceId),
        "File edit authority refresh timed out",
      );
      if (!active()) return;
      if (
        next.pageId !== pageId ||
        next.owner.userId !== policy.ownerUserId ||
        next.visibility !== policy.visibility ||
        !next.isOwner
      ) {
        throw new Error("File edit authority changed");
      }
      // An explicit choice for this file ends following the notebook.
      install(policy, loaded.members, loaded.follow
        ? { ...loaded.follow, followsNotebook: false, aclRevision: policy.aclRevision }
        : null);
      setSaveFeedback(feedback);
      onChanged(next); // Only the fresh server's seven-field writable verdict.
      // Its owner's open windows of the page follow the file onto desks.
      if (next.visibility !== "private") announcePageFileShared(pageId);
    } catch {
      if (active()) {
        setLoaded(null);
        setPhase("failed");
        setError("saveFailed");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

   
  const saveFollow = async () => {
    if (!loaded || !workspaceId) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase("saving");
    setError(null);
    setSaveFeedback(null);
    const active = () =>
      requestRef.current === controller && !retiredRef.current;
    try {
      const follow = await runCollaborationRequestWithTimeout(
        controller,
        (signal) =>
          followNotebookPageAccess(pageId, loaded.policy.aclRevision, { signal }, workspaceId),
        "File permission update timed out",
      );
      if (!active()) return;
      const [policy, next] = await runCollaborationRequestWithTimeout(
        controller,
        (signal) =>
          Promise.all([
            getPageAccessPolicy(pageId, loaded.policy, { signal }, workspaceId),
            getPageCollab(pageId, { signal }, workspaceId),
          ]),
        "File edit authority refresh timed out",
      );
      if (!active()) return;
      install(policy, loaded.members, follow);
      setSaveFeedback({ rows: new Set(), tier: null });
      onChanged(next);
      announcePageFileShared(pageId);
    } catch {
      if (active()) {
        setLoaded(null);
        setPhase("failed");
        setError("saveFailed");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  const chooseFollow = () => {
    if (!canManage || !loaded) return;
    setDraftFollow(true);
    setConfirmedLegacy(false);
    setVisibility("shared_editable");
    setGrants(
      savedFollow
        ? currentGrants(loaded.policy, loaded.members)
        : roleGrants(loaded.members, loaded.policy.ownerUserId),
    );
  };

  const changeTier = (next: PageVisibility) => {
    if (!canManage) return;
    setDraftFollow(false);
    setVisibility(next);
    setConfirmedLegacy(false);
    setGrants(
      next === "private"
        ? []
        : grants.map((grant) => ({
            ...grant,
            grantRole: next === "shared_readonly" ? "view" : grant.grantRole,
          })),
    );
  };
  const changeGrant = (member: PagePermissionMember, role: string) => {
    if (
      !canManage ||
      draftFollow ||
      visibility === "private" ||
      !["none", "view", "edit"].includes(role) ||
      (role === "edit" &&
        (member.role === "viewer" || visibility !== "shared_editable"))
    )
      return;
    const next = grants.filter((grant) => grant.userId !== member.userId);
    if (role === "view" || role === "edit")
      next.push({
        userId: member.userId,
        grantRole: role,
        membershipIncarnation: candidateIncarnation(member),
      });
    setGrants(next);
    setConfirmedLegacy(false);
  };
  const tierLabel = (tier: PageVisibility) =>
    t(
      tier === "private"
        ? "pageCollab.visibility.private"
        : tier === "shared_readonly"
          ? "pageCollab.sheet.explicitReadonly"
          : "pageCollab.sheet.explicitEditable",
    );

  const accessOf = (member: PagePermissionMember): MemberAccess =>
    grants.find((grant) => grant.userId === member.userId)?.grantRole ??
    "none";
  // The save control is contextual: it unfolds while there is something to
  // save, says so while saving, says "Saved" for a moment, then folds away.
  const saveFace: "idle" | "saving" | "saved" = saving
    ? "saving"
    : !changed && saveFeedback
      ? "saved"
      : "idle";
  const saveShown =
    !preview &&
    state.isOwner &&
    phase !== "failed" &&
    (changed || saveFace !== "idle");
  const flashed = saveFace === "saved" ? saveFeedback : null;
  const showReload = !preview && state.isOwner && phase === "failed";
  const showHandOver = canManage && Boolean(onRequestHandOver);

  const whoCanSee = heading ?? t("pageCollab.sheet.whoCanSee");
  const body = (
    <>
      <section className={sheetStyles.group}>
        <h3 className={sheetStyles.groupLabel}>{whoCanSee}</h3>
        <div
          ref={tiersRef}
          className={styles.tiers}
          role="radiogroup"
          aria-label={whoCanSee}
          data-disabled={!canManage || undefined}
        >
          <span className={styles.tierGlide} aria-hidden="true" />
          {loaded?.follow ? (
            <button
              type="button"
              role="radio"
              aria-checked={draftFollow}
              disabled={!canManage}
              className={styles.tier}
              data-tier="follow"
              data-active={draftFollow || undefined}
              data-testid="page-tier-follow"
              onClick={chooseFollow}
            >
              <UsersRound size={15} aria-hidden="true" />
              <span>{pageFollowText("tier", locale, followProduct)}</span>
              <span
                className={styles.tierCheck}
                data-on={draftFollow || undefined}
                aria-hidden="true"
              >
                <Check size={15} />
              </span>
            </button>
          ) : null}
          {TIERS.map((tier) => {
            const Icon = TIER_ICON[tier];
            const active = !draftFollow && visibility === tier;
            return (
              <button
                key={tier}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canManage}
                className={styles.tier}
                data-tier={tier}
                data-active={active || undefined}
                data-flash={flashed?.tier === tier || undefined}
                data-testid={`page-tier-${tier}`}
                onClick={() => changeTier(tier)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{tierLabel(tier)}</span>
                <span
                  className={styles.tierCheck}
                  data-on={active || undefined}
                  aria-hidden="true"
                >
                  <Check size={15} />
                </span>
              </button>
            );
          })}
        </div>
        {loaded?.follow ? (
          <p className={styles.hint} data-testid="page-follow-state" data-follows={savedFollow || undefined}>
            {pageFollowText(savedFollow ? "stateFollow" : "stateCustom", locale, followProduct)}
            {draftFollow ? ` · ${pageFollowText("hint", locale, followProduct)}` : ""}
          </p>
        ) : null}
        {!state.isOwner || preview ? (
          <p className={styles.hint}>{t("pageCollab.sheet.viewerNotice")}</p>
        ) : null}
        {state.isOwner && !state.canEdit && !preview ? (
          <p className={styles.hint}>{t("pageCollab.sheet.readerOnly")}</p>
        ) : null}
        {phase === "loading" && !preview ? (
          <p role="status" className={styles.hint}>
            {t("pageCollab.sheet.loadingPolicy")}
          </p>
        ) : null}
      </section>
      {/* The roster folds away for a private file instead of vanishing, and
          unfolds when the file is shared again. Embedded in a sheet that
          scrolls as a whole, it takes its natural height instead of growing
          into (and scrolling inside) it. */}
      <Reveal
        show={Boolean(loaded) && visibility !== "private"}
        className={
          shell ? `${sheetStyles.fold} ${sheetStyles.foldGrow}` : sheetStyles.fold
        }
      >
        <section
          className={
            shell ? `${sheetStyles.group} ${sheetStyles.groupGrow}` : sheetStyles.group
          }
        >
          <div className={styles.pickerHead}>
            <h3 className={sheetStyles.groupLabel}>
              {t("pageCollab.sheet.recipients")}
            </h3>
            <div className={styles.bulk}>
              <button
                type="button"
                disabled={!canManage || draftFollow || candidates.length === 0}
                data-testid="page-editors-select-all"
                onClick={() => {
                  setGrants(
                    candidates.map((member) => ({
                      userId: member.userId,
                      membershipIncarnation: candidateIncarnation(member),
                      grantRole:
                        visibility === "shared_editable" &&
                        member.role !== "viewer"
                          ? "edit"
                          : "view",
                    })),
                  );
                  setConfirmedLegacy(false);
                }}
              >
                {t("pageCollab.sheet.selectAll")}
              </button>
              <button
                type="button"
                disabled={!canManage || draftFollow}
                data-testid="page-editors-clear"
                onClick={() => {
                  setGrants([]);
                  setConfirmedLegacy(false);
                }}
              >
                {t("pageCollab.sheet.clearAll")}
              </button>
            </div>
          </div>
          <div className={sheetStyles.card} data-testid="page-editor-picker">
            <div className={styles.row} data-owner="1">
              <span className={styles.avatar} aria-hidden="true">
                <UserAvatar
                  size={32}
                  name={state.owner.name}
                  accentColor={state.owner.accentColor}
                  avatar={state.owner.avatar}
                />
              </span>
              <span className={styles.rowCopy}>
                <strong>{state.owner.name}</strong>
                <small>{t("pageCollab.sheet.ownerRow")}</small>
              </span>
              <span className={styles.lockedMark} aria-hidden="true">
                <Check size={15} />
              </span>
            </div>
            {candidates.map((member) => {
              const access = accessOf(member);
              return (
                <div
                  key={member.userId}
                  className={`${styles.row} ${styles.memberRow}`}
                  data-flash={flashed?.rows.has(member.userId) || undefined}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    <UserAvatar
                      size={32}
                      name={member.name}
                      email={member.email}
                      accentColor={member.accentColor}
                      avatar={member.avatar}
                    />
                  </span>
                  <span className={styles.rowCopy}>
                    <strong>{member.name}</strong>
                    <small>{member.email}</small>
                    {/* Said where the greyed 可编辑 is, so whoever shares
                        knows why it cannot be chosen for this person. */}
                    {member.role === "viewer" ? (
                      <small
                        className={styles.readerNote}
                        data-testid={`page-access-${member.userId}-notebook-readonly`}
                      >
                        {t("pageCollab.sheet.memberNotebookReadOnly")}
                      </small>
                    ) : null}
                  </span>
                  <SlidingSegmentedControl<MemberAccess>
                    size="compact"
                    className={styles.roleControl}
                    value={access}
                    disabled={!canManage || draftFollow || visibility === "private"}
                    ariaLabel={member.name}
                    testId={`page-access-${member.userId}`}
                    options={[
                      {
                        value: "none",
                        label: t("pageCollab.sheet.accessNone"),
                        testId: `page-access-${member.userId}-none`,
                      },
                      {
                        value: "view",
                        label: t("pageCollab.sheet.accessView"),
                        testId: `page-access-${member.userId}-view`,
                      },
                      {
                        value: "edit",
                        label: t("pageCollab.sheet.accessEdit"),
                        testId: `page-access-${member.userId}-edit`,
                        // Editing exists only in the editable tier, and never
                        // for a notebook reader: shown, but not choosable.
                        disabled:
                          visibility !== "shared_editable" ||
                          member.role === "viewer",
                      },
                    ]}
                    onChange={(next) => {
                      if (next !== access) changeGrant(member, next);
                    }}
                  />
                </div>
              );
            })}
            {candidates.length === 0 ? (
              <div className={styles.empty}>{t("pageCollab.noMembers")}</div>
            ) : null}
          </div>
        </section>
      </Reveal>
      {legacy && !draftFollow ? (
        <section className={sheetStyles.group}>
          <p className={styles.hint}>{t("pageCollab.sheet.legacyNotice")}</p>
          <label className={styles.policyConfirmation}>
            <input
              type="checkbox"
              className={styles.check}
              checked={confirmedLegacy}
              disabled={!canManage}
              data-testid="page-policy-legacy-confirm"
              onChange={(event) => setConfirmedLegacy(event.target.checked)}
            />
            <span>{t("pageCollab.sheet.legacyConfirm")}</span>
          </label>
        </section>
      ) : null}
      {staleRecipients ? (
        <p className={styles.hint}>{t("pageCollab.sheet.staleRecipients")}</p>
      ) : null}
      <Reveal show={Boolean(error)} className={sheetStyles.fold}>
        {error ? (
          <p className={styles.error} role="alert">
            {t(`pageCollab.sheet.${error}`)}
          </p>
        ) : null}
      </Reveal>
      <Reveal
        show={saveShown}
        className={`${sheetStyles.fold} ${styles.saveFold}`}
      >
        <div className={styles.saveBar}>
          <button
            type="button"
            className={styles.saveButton}
            data-state={saveFace}
            data-testid="page-policy-save"
            aria-busy={saving || undefined}
            disabled={
              saveFace !== "idle" ||
              !canManage ||
              !changed ||
              (legacy && !confirmedLegacy)
            }
            onClick={() => void save()}
          >
            <span className={styles.saveFaces}>
              <span
                className={styles.saveFace}
                data-face="idle"
                aria-hidden={saveFace !== "idle" || undefined}
              >
                {t("pageCollab.sheet.save")}
              </span>
              <span
                className={styles.saveFace}
                data-face="saving"
                aria-hidden={saveFace !== "saving" || undefined}
              >
                {t("pageCollab.sheet.saving")}
              </span>
              <span
                className={styles.saveFace}
                data-face="saved"
                aria-hidden={saveFace !== "saved" || undefined}
              >
                <Check size={16} aria-hidden="true" />
                {t("pageCollab.sheet.saved")}
              </span>
            </span>
            <span className={styles.saveProgress} aria-hidden="true" />
          </button>
          <span className={styles.srOnly} role="status">
            {saveFace === "saving"
              ? t("pageCollab.sheet.saving")
              : saveFace === "saved"
                ? t("pageCollab.sheet.saved")
                : null}
          </span>
        </div>
      </Reveal>
      <Reveal show={showReload || showHandOver} className={sheetStyles.fold}>
        <section className={`${sheetStyles.group} ${styles.policyActions}`}>
          {showReload ? (
            <button
              type="button"
              className={styles.handOverConfirm}
              data-testid="page-policy-reload"
              disabled={accountRetired}
              onClick={() => void reload()}
            >
              {t("pageCollab.sheet.reload")}
            </button>
          ) : null}
          {showHandOver ? (
            <button
              type="button"
              className={styles.handOverConfirm}
              data-testid="page-hand-over-open"
              onClick={onRequestHandOver}
            >
              {t("pageCollab.handOver.open")}
            </button>
          ) : null}
        </section>
      </Reveal>
    </>
  );

  return shell ? shell(body, { visibility, saving }) : body;
}

/** One draft per exact file, owner verdict and account-visible scope. */
function useEditorScope(props: EditorProps) {
  const contextualWorkspaceId = usePageWorkspaceId();
  const workspaceId =
    props.workspaceId === undefined ? contextualWorkspaceId : props.workspaceId;
  const scopeKey = JSON.stringify([
    props.pageId,
    props.notebookId,
    workspaceId,
    props.state.owner.userId,
    props.state.isOwner,
    props.state.canEdit,
    props.open,
    props.preview === true,
  ]);
  return { workspaceId, scopeKey };
}

/**
 * The file permission editor without a sheet of its own: the same reads,
 * validation and saves as PagePermissionSheet, for a host that already is
 * one (a page window's share sheet, where the file's permission is the
 * window's).
 */
export function PagePermissionEditor(props: PagePermissionEditorProps) {
  const { workspaceId, scopeKey } = useEditorScope(props);
  return (
    <PagePermissionEditorScope
      key={scopeKey}
      {...props}
      workspaceId={workspaceId}
    />
  );
}

export function PagePermissionSheet({ onOpenChange, ...props }: Props) {
  const { workspaceId, scopeKey } = useEditorScope(props);
  const t = useTranslations("console-notebooks");
  return (
    <PagePermissionEditorScope
      key={scopeKey}
      {...props}
      workspaceId={workspaceId}
      onAccountRetired={() => onOpenChange(false)}
      shell={(body, draft) => (
        <CupertinoSheet
          open={props.open}
          onOpenChange={onOpenChange}
          busy={draft.saving}
          fitContent={draft.visibility === "private"}
          eyebrow={t("pageCollab.sheet.eyebrow")}
          title={t(`pageCollab.visibilityShort.${draft.visibility}`)}
          subtitle={t("pageCollab.sheet.subtitle", {
            name: props.state.owner.name,
          })}
          icon={<ShieldCheck size={22} />}
          closeLabel={t("library.sharedMembersClose")}
          testId={`page-permission-sheet-${props.pageId}`}
        >
          {body}
        </CupertinoSheet>
      )}
    />
  );
}
