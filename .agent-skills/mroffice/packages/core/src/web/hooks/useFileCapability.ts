"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Q7-PR0 UI Affordance Gate — capability hook.
 *
 * Subscribes a UI surface to the resolver-truth source for what
 * affordances render on an uploaded resource. Every editing-related
 * button / banner / tooltip / empty-state / CTA in
 * {@code apps/web/components/notebook/contents/},
 * {@code apps/web/components/notebook/ai-panel-tabs/},
 * {@code apps/web/components/console/editor/}, and
 * {@code WindowCanvas.tsx} consumes this hook (spec §3.2, §3.3
 * anti-bypass lint).
 *
 * Implementation style mirrors {@code useUniversalDocument.ts}
 * (useState + useEffect + cancellation ref). The project uses
 * {@code @tanstack/react-query} elsewhere, but the existing
 * {@code useUniversalDocument} sibling — which this hook coordinates
 * with for the editor-shell surface — uses the manual pattern; matching
 * it keeps both hooks SSR-safe and avoids inflicting a QueryClient
 * dependency on every consumer.
 */
import { useEffect, useRef, useState } from "react";

import { fetchFileCapability } from "../lib/file-capability/api";
import type { FileCapabilityState } from "@/lib/file-capability/types";

const LOADING_FILE_CAPABILITY_STATE: FileCapabilityState = { kind: "loading" };

interface ScopedCapabilityState {
  readonly resourceId: string | null;
  readonly value: FileCapabilityState;
}

/**
 * Subscribe a UI surface to the runtime capability resolution for
 * {@code resourceId}.
 *
 * Return-value contract (spec §3.1):
 * - {@code resourceId} is {@code null} / {@code undefined} →
 *   {@code &#123; kind: "loading" &#125;} indefinitely (no fetch is issued).
 *   SSR-safe; never optimistically renders edit chrome (§3.1 rule 2).
 * - On mount with a valid id → issues a single
 *   {@code GET /api/v1/resources/&#123;resource_id&#125;/capability} and
 *   transitions to one of {@code auth_required} / {@code not_found} /
 *   {@code resolver_unavailable} / {@code ready} per the §2.3 mapping
 *   implemented in {@code fetchFileCapability}.
 * - On {@code resourceId} change → cancels any in-flight request,
 *   resets to {@code loading}, and refetches.
 *
 * Auto-refetch invariants (spec §2.1 cache-key + §7.3 schema-version
 * pinning + acceptance #11 hook-test #14):
 * - The hook tracks the last-observed {@code claim_lock_revision} and
 *   {@code resolver_schema_version} per {@code resourceId}. If a later
 *   response carries a value that diverges from the cached one, the
 *   hook refetches once. Q6 lock rotation drives the
 *   {@code claim_lock_revision} bump; a Q-PR-level contract shift
 *   drives {@code resolver_schema_version}. The hook treats both as
 *   opaque strings per spec §1.3.
 *
 * Q7-PR0 does NOT poll; the {@code revalidateOnFocus} hint in spec §3.1
 * is satisfied by re-running the effect on subsequent mounts (the
 * editor shell remounts on file switch) plus the schema-version /
 * lock-revision divergence trigger. A timer-based revalidator is out
 * of scope for this PR (spec §12.3 future work).
 */
export function useFileCapability(
  resourceId: string | null | undefined,
): FileCapabilityState {
  const resourceKey = resourceId ?? null;
  const [state, setState] = useState<ScopedCapabilityState>(
    {
      resourceId: resourceKey,
      value: LOADING_FILE_CAPABILITY_STATE,
    },
  );
  // Per-resource last-seen (resolver_schema_version, claim_lock_revision).
  // Keying by resource id prevents cross-resource ghost invalidations.
  const seenRevisionsRef = useRef<
    Map<string, { schemaVersion: string; lockRevision: string }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;

    if (resourceId == null) {
      // No id → expose "loading" forever, per §3.1. The return value
      // below masks any resolved state from a prior resource on the
      // same render that flips the id to null, so edit affordances
      // cannot render against a missing resourceId.
      return () => {
        cancelled = true;
      };
    }

    // Real id → reset to "loading" before kicking the fetch so a
    // stale resolved state from a prior id can never leak across the
    // resourceId boundary. The setState is paired with ``runFetch``
    // below (the external-system synchronization seam) so this is the
    // legitimate pattern the rule docs explicitly carve out: the
    // effect is *synchronizing with the resourceId prop change
    // boundary*, not running a redundant render. The disable below is
    // scoped to the single line; the rule stays active project-wide.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resourceId-change boundary reset paired with async runFetch (external-system synchronization)
    setState({
      resourceId,
      value: LOADING_FILE_CAPABILITY_STATE,
    });

    // Spec §2.1 + §7.3: when the cached revisions diverge from the
    // server's truth, refetch once to make sure we are not rendering
    // stale-cache affordances. The guard {@code refetched} is scoped
    // to this effect run (i.e. one mount + one resourceId) so a
    // misbehaving backend that emits oscillating values can drive at
    // most one extra fetch per mount — not an indefinite loop.
    let refetched = false;

    const runFetch = async (): Promise<void> => {
      const next = await fetchFileCapability(resourceId);
      if (cancelled) return;

      if (next.kind === "ready") {
        const observed = {
          schemaVersion: next.resolution.resolver_schema_version,
          lockRevision: next.resolution.claim_lock_revision,
        };
        const cached = seenRevisionsRef.current.get(resourceId);
        const diverged =
          cached !== undefined &&
          (cached.schemaVersion !== observed.schemaVersion ||
            cached.lockRevision !== observed.lockRevision);

        // First sighting (cached === undefined) just seeds the cache.
        // A divergent later response triggers one auto-refetch; the
        // refetched result then settles regardless of whether it
        // diverges again (the §2.1 acceptance is "auto-refetch on
        // mismatch", not "loop until stable").
        seenRevisionsRef.current.set(resourceId, observed);
        if (diverged && !refetched) {
          refetched = true;
          await runFetch();
          return;
        }
      }

      setState({ resourceId, value: next });
    };

    void runFetch();

    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  if (resourceId == null) {
    return LOADING_FILE_CAPABILITY_STATE;
  }
  if (state.resourceId !== resourceId) {
    return LOADING_FILE_CAPABILITY_STATE;
  }
  return state.value;
}
