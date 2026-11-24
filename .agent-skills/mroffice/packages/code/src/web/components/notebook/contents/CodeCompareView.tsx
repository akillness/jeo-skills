"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CodeCompareView — a side-by-side DIFF / MERGE surface for the code editor
 * (VSCode "Compare" / Word-style document compare parity).
 *
 * A thin React wrapper around CodeMirror 6's {@link MergeView} (`@codemirror/merge`).
 * It mounts two read-only editors next to each other, aligns their unchanged
 * lines, highlights the changed chunks between them, and marks every changed line
 * in a gutter. The diff is computed by `@codemirror/merge` itself (Myers diff),
 * so this component owns no diff logic of its own.
 *
 * Scope (intentionally minimal — see the GAP note in CodeMirrorEditor):
 *  - Existing two-source review remains compatible. Optional base/current/
 *    incoming inputs add a bounded, explicit three-way conflict review without
 *    invoking Git or a host filesystem.
 *  - The A (left) side is the CURRENT code; the B (right) side is the OTHER
 *    source. Both panes reject direct typing. When `onApplyCurrent` is supplied,
 *    B→A chunk controls and the imperative accept methods update the throwaway A
 *    snapshot, then publish its complete text to the real CodeMirrorEditor. The
 *    host applies that text through one ordinary CM6 transaction, so autosave,
 *    diagnostics, collaboration hooks, and Undo all stay on the existing path.
 *  - `goToNextChunk` / `goToPreviousChunk` power keyboard chunk navigation; the
 *    host renders prev/next buttons that call {@link CodeCompareHandle}.
 *
 * The view is built imperatively (MergeView is a vanilla CM6 class, not a React
 * component) into a container <div> and torn down on unmount / when any input
 * that changes the diff (either text, language, theme) changes. Theme styling
 * reuses `themeExtension`; language highlighting uses the same lazy grammar
 * cache as the main editor. A missing or failed chunk therefore mounts a usable
 * plain-text diff immediately rather than blocking MergeView construction.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import styles from "./CodeEditorChrome.module.css";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { EditorView } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import {
  MergeView,
  diff,
  goToNextChunk,
  goToPreviousChunk,
} from "@codemirror/merge";

import { themeExtension } from "../../../lib/code-runner/codemirror-config";
import {
  languageLoadFailed,
  loadConfiguredLanguageExtension,
  peekLanguageExtension,
} from "../../../lib/code-runner/language-loader";
import {
  createThreeWayMergePlan,
  renderThreeWayMerge,
  type ThreeWayConflictResolution,
  type ThreeWayMergeConflict,
  type ThreeWayMergePlan,
} from "../../../lib/code-runner/three-way-merge";
import { downloadTextFile } from "@mrnote/core/web/lib/download-file.ts";
import {
  createUnifiedDiffExport,
  UNIFIED_DIFF_EXPORT_FILENAME,
} from "../../../lib/code-runner/unified-diff-export";

export interface CodeCompareTextChange {
  from: number;
  to: number;
  insert: string;
}

export interface CodeCompareApplication {
  /** Exact A-side snapshot the changes were computed against. */
  before: string;
  /** Complete A-side text after the accepted change(s). */
  after: string;
  /** Minimal, sorted CM6 changes in `before` coordinates. */
  changes: readonly CodeCompareTextChange[];
}

export interface CodeCompareViewProps {
  /** The CURRENT cell's text — rendered on the A (left) side. */
  current: string;
  /**
   * The text to compare against in the existing two-way mode. Omit only when
   * BOTH `base` and `incoming` are supplied for a three-way merge.
   */
  other?: string;
  /** Common ancestor for optional base/current/incoming three-way review. */
  base?: string;
  /** Incoming variant for optional base/current/incoming three-way review. */
  incoming?: string;
  /** Language id for syntax highlighting on BOTH sides. */
  language: string;
  /** Polite status shown while the optional syntax grammar is loading. */
  grammarLoadingLabel?: string;
  /** Recoverable status shown when the plain-text comparison stays active. */
  grammarFailedLabel?: string;
  /** Label for retrying the current language's grammar in place. */
  grammarRetryLabel?: string;
  /** Selects the dark theme for both panes (mirrors the editor's `isDark`). */
  isDark?: boolean;
  /**
   * Enables review/merge controls. Called with the exact source snapshot,
   * resulting text, and minimal CM6 changes after one/all chunks are accepted
   * from `other`. Direct typing in either comparison pane remains disabled.
   */
  onApplyCurrent?: (application: CodeCompareApplication) => boolean;
  /** Accessible label for each B→A chunk control. */
  applyChunkLabel?: string;
  /**
   * Receives one fully-resolved three-way merge. Unlike `onApplyCurrent`,
   * conflict choices remain local until this explicit final apply.
   */
  onApplyMerged?: (application: CodeCompareApplication) => boolean;
  /** Reports explicit conflict-resolution state without reaching into the DOM. */
  onConflictStateChanged?: (state: CodeCompareConflictState) => void;
  /** Optional audit hook fired whenever one conflict choice changes. */
  onResolveConflict?: (
    conflict: ThreeWayMergeConflict,
    resolution: ThreeWayConflictResolution,
  ) => void;
  baseLabel?: string;
  currentLabel?: string;
  incomingLabel?: string;
  acceptCurrentLabel?: string;
  acceptIncomingLabel?: string;
  acceptBothLabel?: string;
  applyMergeLabel?: string;
  mergeUnavailableLabel?: string;
  /** Accessible name of the conflict review region. */
  conflictsLabel?: string;
  /** Accessible name of the conflict picker. */
  activeConflictLabel?: string;
  previousConflictLabel?: string;
  nextConflictLabel?: string;
  noConflictsLabel?: string;
  /**
   * Count-dependent copy. Function props (not preformatted strings) so a host
   * can route them through its own plural-aware message catalogue.
   */
  conflictCountLabel?: (count: number) => string;
  resolvedCountLabel?: (count: number) => string;
  /** Names one conflict by its 1-based position. */
  conflictLabel?: (position: number) => string;
  /**
   * Called after the merge view (re)builds with the number of changed chunks
   * between the two sources (0 == identical). Lets the host show a "N changes"
   * label without reaching into the imperative MergeView. Fires on every rebuild
   * (any input that changes the diff), so the label always tracks the diff.
   */
  onChunksChanged?: (count: number) => void;
}

export interface CodeCompareConflictState {
  total: number;
  resolved: number;
  unresolved: number;
  activeIndex: number;
  canApply: boolean;
  unavailable: boolean;
}

/** Imperative handle the host uses to drive chunk navigation from its toolbar. */
export interface CodeCompareHandle {
  /** Move to the next changed chunk/conflict; false when nothing moved. */
  goToNextChunk: () => boolean;
  /** Move to the previous changed chunk/conflict; false when nothing moved. */
  goToPreviousChunk: () => boolean;
  /** Accept the changed chunk under/after the current A-side caret. */
  applyCurrentChunk: () => boolean;
  /** Accept every remaining change from B into A in one transaction. */
  applyAllChunks: () => boolean;
  /** Resolve the active three-way conflict without mutating the live editor. */
  resolveActiveConflict: (
    resolution: ThreeWayConflictResolution,
  ) => boolean;
  /** Resolve every three-way conflict to the same side. */
  resolveAllConflicts: (resolution: ThreeWayConflictResolution) => boolean;
  /** Apply the fully-resolved three-way result as one host transaction. */
  applyResolvedMerge: () => boolean;
}

/** Read-only guard shared by both panes — a compare surface never edits in place. */
const READ_ONLY = [EditorView.editable.of(false), EditorState.readOnly.of(true)];
const EMPTY_THREE_WAY_RESOLUTIONS = new Map<
  string,
  ThreeWayConflictResolution
>();

// Module-level defaults keep the fallback copy referentially stable, so a host
// that localizes nothing never re-renders the review surface for a new closure.
const defaultConflictCountLabel = (count: number) => `${count} conflicts`;
const defaultResolvedCountLabel = (count: number) => `${count} resolved`;
const defaultConflictLabel = (position: number) => `Conflict ${position}`;

const CodeCompareView = forwardRef<CodeCompareHandle, CodeCompareViewProps>(
  function CodeCompareView(
    {
      current,
      other,
      base,
      incoming,
      language,
      grammarLoadingLabel = "Loading syntax support…",
      grammarFailedLabel =
        "Syntax support did not load. The comparison remains available.",
      grammarRetryLabel = "Retry syntax support",
      isDark = false,
      onApplyCurrent,
      applyChunkLabel = "Apply this change to current code",
      onApplyMerged,
      onConflictStateChanged,
      onResolveConflict,
      baseLabel = "Base",
      currentLabel = "Current",
      incomingLabel = "Incoming",
      acceptCurrentLabel = "Accept current",
      acceptIncomingLabel = "Accept incoming",
      acceptBothLabel = "Accept both",
      applyMergeLabel = "Apply resolved merge",
      mergeUnavailableLabel = "This three-way merge exceeds the safe review limits.",
      conflictsLabel = "Merge conflicts",
      activeConflictLabel = "Active merge conflict",
      previousConflictLabel = "Previous conflict",
      nextConflictLabel = "Next conflict",
      noConflictsLabel = "No conflicts. Safe edits were merged automatically.",
      conflictCountLabel = defaultConflictCountLabel,
      resolvedCountLabel = defaultResolvedCountLabel,
      conflictLabel = defaultConflictLabel,
      onChunksChanged,
    },
    ref,
  ) {
    const t = useTranslations("console-notebooks");
    const hostRef = useRef<HTMLDivElement>(null);
    const mergeRef = useRef<MergeView | null>(null);
    const languageSlotsRef = useRef<{
      language: string;
      merge: MergeView;
      a: Compartment;
      b: Compartment;
    } | null>(null);
    const [grammarLoadState, setGrammarLoadState] = useState<{
      language: string;
      status: "ready" | "loading" | "failed";
    }>(() => ({
      language,
      status: peekLanguageExtension(language) === null ? "loading" : "ready",
    }));
    const [grammarRetryRequest, setGrammarRetryRequest] = useState(0);
    const grammarLoadStatus =
      grammarLoadState.language === language
        ? grammarLoadState.status
        : peekLanguageExtension(language) === null
          ? "loading"
          : "ready";
    const retryGrammarLoad = useCallback(() => {
      setGrammarLoadState({ language, status: "loading" });
      setGrammarRetryRequest((request) => request + 1);
    }, [language]);
    const threeWayMode = base !== undefined || incoming !== undefined;
    const validThreeWayInputs =
      typeof base === "string" && typeof incoming === "string";
    const comparedText =
      validThreeWayInputs ? incoming : (other ?? current);
    const [exportFailure, setExportFailure] = useState<{
      before: string;
      after: string;
      message: string;
    } | null>(null);
    const exportError =
      exportFailure?.before === current &&
      exportFailure.after === comparedText
        ? exportFailure.message
        : null;
    const downloadPatch = useCallback(() => {
      const fail = () => {
        setExportFailure({
          before: current,
          after: comparedText,
          message: t("toolbar.exportFailed", { format: ".patch" }),
        });
      };
      try {
        const receipt = createUnifiedDiffExport({
          before: current,
          after: comparedText,
          beforeLabel: currentLabel,
          afterLabel: incomingLabel,
        });
        if (
          !receipt.ok ||
          !downloadTextFile(
            UNIFIED_DIFF_EXPORT_FILENAME,
            receipt.ok ? receipt.patch : "",
            "text/x-diff;charset=utf-8",
          )
        ) {
          fail();
          return;
        }
        setExportFailure(null);
      } catch {
        fail();
      }
    }, [comparedText, current, currentLabel, incomingLabel, t]);

    // MergeView needs its extensions synchronously in the constructor. Build a
    // plain-text diff on a cache miss, then reconfigure BOTH live panes when the
    // shared grammar arrives. Do not rebuild here: replacing MergeView would
    // detach a revert button that a user may already be pressing during the
    // loading gap. A failure keeps that diff mounted, publishes a truthful
    // recoverable status, and lets the user retry the same live compartments.
    // Layout cleanup retires an A→B→A language request before an older import
    // continuation can publish status or reconfigure the replacement surface.
    useLayoutEffect(() => {
      const cached = peekLanguageExtension(language);
      if (cached !== null) return;
      let cancelled = false;
      void loadConfiguredLanguageExtension(language).then(() => {
        if (cancelled) return;
        const loaded = peekLanguageExtension(language);
        if (loaded === null) {
          setGrammarLoadState({
            language,
            status: languageLoadFailed(language) ? "failed" : "loading",
          });
          return;
        }
        const slots = languageSlotsRef.current;
        if (
          slots &&
          slots.language === language &&
          mergeRef.current === slots.merge
        ) {
          slots.merge.a.dispatch({ effects: slots.a.reconfigure(loaded) });
          slots.merge.b.dispatch({ effects: slots.b.reconfigure(loaded) });
        }
        // If the passive MergeView constructor has not run yet, it will seed
        // both panes from this now-populated cache in the same commit.
        setGrammarLoadState({ language, status: "ready" });
      });
      return () => {
        cancelled = true;
      };
    }, [grammarRetryRequest, language]);
    const threeWayPlanResult = useMemo(
      () =>
        validThreeWayInputs
          ? createThreeWayMergePlan(base, current, incoming)
          : null,
      [base, current, incoming, validThreeWayInputs],
    );
    const threeWayPlan: ThreeWayMergePlan | null =
      threeWayPlanResult?.ok === true ? threeWayPlanResult : null;
    const [resolutionState, setResolutionState] = useState<{
      base: string | undefined;
      current: string;
      incoming: string | undefined;
      values: Map<string, ThreeWayConflictResolution>;
    }>(() => ({
      base,
      current,
      incoming,
      values: new Map(),
    }));
    const [activeConflictIndex, setActiveConflictIndex] = useState(0);
    const resolutions =
      resolutionState.base === base &&
      resolutionState.current === current &&
      resolutionState.incoming === incoming
        ? resolutionState.values
        : EMPTY_THREE_WAY_RESOLUTIONS;
    // Imperative review commands can arrive more than once before React renders
    // the first state update. Mirror committed authority in layout; each command
    // also advances this ref before state, so a repeat remains a truthful no-op.
    const resolutionAuthorityRef = useRef({
      base,
      current,
      incoming,
      values: resolutions,
    });
    useLayoutEffect(() => {
      resolutionAuthorityRef.current = {
        base,
        current,
        incoming,
        values: resolutions,
      };
    }, [base, current, incoming, resolutions]);
    const conflictCount = threeWayPlan?.conflicts.length ?? 0;
    const safeActiveConflictIndex =
      conflictCount === 0
        ? -1
        : Math.min(Math.max(activeConflictIndex, 0), conflictCount - 1);
    const activeConflict =
      safeActiveConflictIndex >= 0
        ? (threeWayPlan?.conflicts[safeActiveConflictIndex] ?? null)
        : null;
    const activeConflictIndexRef = useRef(safeActiveConflictIndex);
    useLayoutEffect(() => {
      activeConflictIndexRef.current = safeActiveConflictIndex;
    }, [safeActiveConflictIndex]);
    const renderedThreeWay = useMemo(
      () =>
        threeWayPlan
          ? renderThreeWayMerge(threeWayPlan, resolutions)
          : null,
      [resolutions, threeWayPlan],
    );
    const resolvedConflictCount = threeWayPlan
      ? threeWayPlan.conflicts.reduce(
          (count, conflict) =>
            count + (resolutions.has(conflict.id) ? 1 : 0),
          0,
        )
      : 0;
    const unresolvedConflictCount =
      (threeWayPlan?.conflicts.length ?? 0) - resolvedConflictCount;
    // Read the chunk-count callback through a ref so a host passing a fresh
    // closure each render never rebuilds the MergeView (only the diff inputs do).
    // The ref is refreshed in an effect (not during render) so the latest closure
    // is always called; effects run in mount order, so the build effect below
    // (which fires onChunksChanged on first mount) still sees the initial value.
    const onChunksChangedRef = useRef(onChunksChanged);
    useEffect(() => {
      onChunksChangedRef.current = onChunksChanged;
    }, [onChunksChanged]);
    const onApplyCurrentRef = useRef(onApplyCurrent);
    // MergeView dispatches update listeners synchronously. Imperative accept
    // commands clear this slot before dispatch and consume the host's exact
    // acknowledgement afterwards, so a rejected stale-buffer application never
    // reports success merely because the throwaway A pane changed.
    const appliedCurrentReceiptRef = useRef<boolean | null>(null);
    useEffect(() => {
      onApplyCurrentRef.current = onApplyCurrent;
    }, [onApplyCurrent]);
    const onApplyMergedRef = useRef(onApplyMerged);
    useEffect(() => {
      onApplyMergedRef.current = onApplyMerged;
    }, [onApplyMerged]);
    const onResolveConflictRef = useRef(onResolveConflict);
    useEffect(() => {
      onResolveConflictRef.current = onResolveConflict;
    }, [onResolveConflict]);
    const onConflictStateChangedRef = useRef(onConflictStateChanged);
    useEffect(() => {
      onConflictStateChangedRef.current = onConflictStateChanged;
    }, [onConflictStateChanged]);
    const applyEnabled = !threeWayMode && Boolean(onApplyCurrent);

    useEffect(() => {
      if (!threeWayMode) return;
      const unavailable = !threeWayPlan || renderedThreeWay?.ok === false;
      const state: CodeCompareConflictState = {
        total: threeWayPlan?.conflicts.length ?? 0,
        resolved: resolvedConflictCount,
        unresolved: Math.max(0, unresolvedConflictCount),
        activeIndex: safeActiveConflictIndex,
        canApply:
          Boolean(onApplyMerged) &&
          !unavailable &&
          unresolvedConflictCount === 0,
        unavailable,
      };
      onConflictStateChangedRef.current?.(state);
      onChunksChangedRef.current?.(state.unresolved);
    }, [
      activeConflict,
      onApplyMerged,
      renderedThreeWay,
      resolvedConflictCount,
      safeActiveConflictIndex,
      threeWayMode,
      threeWayPlan,
      unresolvedConflictCount,
    ]);

    // Build (and rebuild) the MergeView imperatively. MergeView appends its own
    // DOM into `parent`; we keep the instance in a ref so the imperative handle
    // and the cleanup can reach it. Rebuilt whenever an input that affects the
    // rendered diff changes (texts, language, theme) — there is no cheap
    // in-place "set both docs" on MergeView, and a compare panel is opened on
    // demand (not per-keystroke), so a full rebuild is the simplest correct path.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const langExt = peekLanguageExtension(language) ?? [];
      const aLanguage = new Compartment();
      const bLanguage = new Compartment();
      const themeExt = themeExtension(isDark);
      const publishAppliedCurrent = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const changes: CodeCompareTextChange[] = [];
        update.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
          changes.push({ from, to, insert: inserted.toString() });
        });
        const accepted = onApplyCurrentRef.current?.({
          before: update.startState.doc.toString(),
          after: update.state.doc.toString(),
          changes,
        });
        appliedCurrentReceiptRef.current = accepted === true;
        if (accepted !== true) return;
        // MergeView updates its chunk model before EditorView listeners run.
        // Publish that new count immediately so host ribbon state never waits
        // for the controlled-value round trip/rebuild.
        onChunksChangedRef.current?.(mergeRef.current?.chunks.length ?? 0);
      });
      const view = new MergeView({
        a: {
          doc: current,
          extensions: [
            aLanguage.of(langExt),
            themeExt,
            READ_ONLY,
            applyEnabled ? publishAppliedCurrent : [],
          ],
        },
        b: {
          doc: comparedText,
          extensions: [bLanguage.of(langExt), themeExt, READ_ONLY],
        },
        parent: host,
        // A == current (left), B == other (right).
        orientation: "a-b",
        // B→A controls update only the throwaway CURRENT snapshot; the update
        // listener above immediately publishes the full next text to the host,
        // which applies it to the real editor through its normal transaction.
        revertControls: applyEnabled ? "b-to-a" : undefined,
        renderRevertControl: applyEnabled
          ? () => {
              const button = host.ownerDocument.createElement("button");
              button.type = "button";
              button.setAttribute("aria-label", applyChunkLabel);
              button.setAttribute("title", applyChunkLabel);
              button.setAttribute("data-testid", "code-compare-apply-chunk");
              button.textContent = "←";
              return button;
            }
          : undefined,
        // The gutter marker beside every changed line keeps chunks scannable.
        gutter: true,
        highlightChanges: true,
        // Collapse long unchanged stretches so a big file's few changes stay
        // close together (VSCode "fold unchanged regions" parity).
        collapseUnchanged: { margin: 3, minSize: 4 },
      });
      mergeRef.current = view;
      languageSlotsRef.current = {
        language,
        merge: view,
        a: aLanguage,
        b: bLanguage,
      };
      // Report the freshly-computed chunk count so the host's "N changes" label
      // tracks the diff (the chunks are computed synchronously in the ctor).
      if (!threeWayMode) {
        onChunksChangedRef.current?.(view.chunks.length);
      }
      return () => {
        if (languageSlotsRef.current?.merge === view) {
          languageSlotsRef.current = null;
        }
        mergeRef.current = null;
        view.destroy();
      };
    }, [
      applyChunkLabel,
      applyEnabled,
      comparedText,
      current,
      language,
      isDark,
      threeWayMode,
    ]);

    const resolveActiveConflict = useCallback(
      (resolution: ThreeWayConflictResolution): boolean => {
        if (!threeWayMode || !activeConflict) return false;
        const authority = resolutionAuthorityRef.current;
        if (authority.values.get(activeConflict.id) === resolution) return false;
        const values = new Map(authority.values);
        values.set(activeConflict.id, resolution);
        const next = { base, current, incoming, values };
        resolutionAuthorityRef.current = next;
        setResolutionState(next);
        onResolveConflictRef.current?.(activeConflict, resolution);
        return true;
      },
      [activeConflict, base, current, incoming, threeWayMode],
    );

    const resolveAllConflicts = useCallback(
      (resolution: ThreeWayConflictResolution): boolean => {
        if (
          !threeWayMode ||
          !threeWayPlan ||
          threeWayPlan.conflicts.length === 0
        ) {
          return false;
        }
        const authority = resolutionAuthorityRef.current;
        const changed = threeWayPlan.conflicts.filter(
          (conflict) => authority.values.get(conflict.id) !== resolution,
        );
        if (changed.length === 0) return false;
        const values = new Map<string, ThreeWayConflictResolution>();
        for (const conflict of threeWayPlan.conflicts) {
          values.set(conflict.id, resolution);
        }
        const next = { base, current, incoming, values };
        resolutionAuthorityRef.current = next;
        setResolutionState(next);
        for (const conflict of changed) {
          onResolveConflictRef.current?.(conflict, resolution);
        }
        return true;
      },
      [base, current, incoming, threeWayMode, threeWayPlan],
    );

    const moveActiveConflict = useCallback(
      (direction: -1 | 1): boolean => {
        const count = threeWayPlan?.conflicts.length ?? 0;
        const previous = activeConflictIndexRef.current;
        if (count <= 1 || previous < 0) return false;
        const next = (previous + direction + count) % count;
        if (next === previous) return false;
        activeConflictIndexRef.current = next;
        setActiveConflictIndex(next);
        return true;
      },
      [threeWayPlan],
    );

    const applyResolvedMerge = useCallback((): boolean => {
      if (
        !threeWayMode ||
        !threeWayPlan ||
        !renderedThreeWay?.ok ||
        unresolvedConflictCount !== 0 ||
        !onApplyMergedRef.current
      ) {
        return false;
      }
      return onApplyMergedRef.current({
        before: current,
        after: renderedThreeWay.text,
        changes: textChangesBetween(current, renderedThreeWay.text),
      });
    }, [
      current,
      renderedThreeWay,
      threeWayMode,
      threeWayPlan,
      unresolvedConflictCount,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        goToNextChunk: () => {
          if (threeWayMode) {
            return moveActiveConflict(1);
          }
          const view = mergeRef.current?.a;
          return view ? goToNextChunk(view) : false;
        },
        goToPreviousChunk: () => {
          if (threeWayMode) {
            return moveActiveConflict(-1);
          }
          const view = mergeRef.current?.a;
          return view ? goToPreviousChunk(view) : false;
        },
        applyCurrentChunk: () => {
          if (threeWayMode) return false;
          const merge = mergeRef.current;
          if (!merge || !onApplyCurrentRef.current || merge.chunks.length === 0) {
            return false;
          }
          const position = merge.a.state.selection.main.head;
          let chunkIndex = merge.chunks.findIndex(
            (chunk) => position >= chunk.fromA && position <= chunk.endA,
          );
          if (chunkIndex < 0) {
            chunkIndex = merge.chunks.findIndex(
              (chunk) => chunk.fromA >= position,
            );
          }
          appliedCurrentReceiptRef.current = null;
          const dispatched = applyChunkFromOther(
            merge,
            chunkIndex < 0 ? 0 : chunkIndex,
          );
          const accepted =
            dispatched && appliedCurrentReceiptRef.current === true;
          appliedCurrentReceiptRef.current = null;
          return accepted;
        },
        applyAllChunks: () => {
          if (threeWayMode) return false;
          const merge = mergeRef.current;
          if (!merge || !onApplyCurrentRef.current || merge.chunks.length === 0) {
            return false;
          }
          appliedCurrentReceiptRef.current = null;
          merge.a.dispatch({
            changes: merge.chunks.map((_, index) =>
              changeForChunkFromOther(merge, index),
            ),
            userEvent: "input.compare.acceptAll",
          });
          const accepted = appliedCurrentReceiptRef.current === true;
          appliedCurrentReceiptRef.current = null;
          return accepted;
        },
        resolveActiveConflict,
        resolveAllConflicts,
        applyResolvedMerge,
      }),
      [
        applyResolvedMerge,
        moveActiveConflict,
        resolveActiveConflict,
        resolveAllConflicts,
        threeWayMode,
      ],
    );

    const mergeHost = (
      <div
        ref={hostRef}
        data-testid="code-compare-view"
        style={compareHostStyle(isDark, threeWayMode)}
      />
    );
    const exportControl = !threeWayMode ? (
      // The view's own toolbar, in the dialogs' chrome of the Compare
      // surface it opens in: the export error as a chrome error, Download
      // as a compact chrome button.
      <div
        data-testid="code-compare-export-actions"
        className={styles.toolbar}
      >
        {exportError ? (
          <span
            role="alert"
            data-testid="code-compare-export-error"
            className={`${officeDialogParts.error} ${styles.toolbarStart}`}
          >
            {exportError}
          </span>
        ) : null}
        <button
          type="button"
          onClick={downloadPatch}
          disabled={current === comparedText}
          data-testid="code-compare-download-patch"
          title={t("code.download")}
          aria-label={t("code.download")}
          className={officeDialogParts.compactButton}
        >
          <Download size={12} aria-hidden="true" />
          {t("code.download")}
        </button>
      </div>
    ) : null;
    const grammarStatus =
      grammarLoadStatus === "ready" ? null : (
        <div
          role="status"
          aria-live="polite"
          data-testid="code-compare-grammar-status"
          data-state={grammarLoadStatus}
          data-tone={grammarLoadStatus === "failed" ? "warning" : undefined}
          className={`${officeDialogParts.message} ${styles.toolbar}`}
        >
          <span className={styles.toolbarStart}>
            {grammarLoadStatus === "failed"
              ? grammarFailedLabel
              : grammarLoadingLabel}
          </span>
          {grammarLoadStatus === "failed" ? (
            <button
              type="button"
              onClick={retryGrammarLoad}
              data-testid="code-compare-grammar-retry"
              className={officeDialogParts.compactButton}
            >
              {grammarRetryLabel}
            </button>
          ) : null}
        </div>
      );
    if (!threeWayMode) {
      return (
        <>
          {exportControl}
          {grammarStatus}
          {mergeHost}
        </>
      );
    }

    const unavailable =
      !validThreeWayInputs ||
      !threeWayPlan ||
      renderedThreeWay?.ok === false;
    const activeResolution = activeConflict
      ? resolutions.get(activeConflict.id)
      : undefined;
    return (
      <div data-testid="code-three-way-compare" className={styles.threeWay}>
        {grammarStatus}
        {mergeHost}
        {/* A multi-buffer host cell is only a few lines tall. The decisions
            outrank the panes: the panes shrink (to nothing if they must) and
            the review scrolls INSIDE this section, so the controls are never
            clipped out of the panel. */}
        <section
          data-testid="code-three-way-conflicts"
          aria-label={conflictsLabel}
          className={styles.conflicts}
        >
          {unavailable ? (
            <div
              role="alert"
              data-testid="code-three-way-unavailable"
              className={officeDialogParts.error}
            >
              {mergeUnavailableLabel}
            </div>
          ) : (
            <>
              {/* Pinned so the conflict counter and Apply stay reachable
                  while long previews scroll underneath. */}
              <div
                role="status"
                data-testid="code-three-way-summary"
                aria-live="polite"
                className={`${officeDialogParts.row} ${styles.summary}`}
              >
                <strong>
                  {conflictCountLabel(threeWayPlan.conflicts.length)}
                </strong>
                <span className={officeDialogParts.hint}>
                  {resolvedCountLabel(resolvedConflictCount)}
                </span>
                <select
                  data-testid="code-three-way-conflict-picker"
                  aria-label={activeConflictLabel}
                  value={activeConflict?.id ?? ""}
                  disabled={threeWayPlan.conflicts.length === 0}
                  onChange={(event) => {
                    const nextIndex = threeWayPlan.conflicts.findIndex(
                      (conflict) => conflict.id === event.target.value,
                    );
                    if (nextIndex >= 0) setActiveConflictIndex(nextIndex);
                  }}
                  className={styles.picker}
                >
                  {threeWayPlan.conflicts.map((conflict, index) => (
                    <option key={conflict.id} value={conflict.id}>
                      {conflictLabel(index + 1)}
                      {resolutions.has(conflict.id) ? " ✓" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => moveActiveConflict(-1)}
                  disabled={!activeConflict}
                  aria-label={previousConflictLabel}
                  title={previousConflictLabel}
                  data-testid="code-three-way-prev"
                  className={officeDialogParts.iconButton}
                >
                  <ArrowUp size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => moveActiveConflict(1)}
                  disabled={!activeConflict}
                  aria-label={nextConflictLabel}
                  title={nextConflictLabel}
                  data-testid="code-three-way-next"
                  className={officeDialogParts.iconButton}
                >
                  <ArrowDown size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={applyResolvedMerge}
                  disabled={
                    unresolvedConflictCount !== 0 ||
                    !renderedThreeWay?.ok ||
                    !onApplyMerged
                  }
                  data-testid="code-three-way-apply"
                  className={`${officeDialogParts.primaryButton} ${styles.pushEnd}`}
                >
                  {applyMergeLabel}
                </button>
              </div>
              {activeConflict ? (
                <div
                  role="group"
                  aria-label={conflictLabel(safeActiveConflictIndex + 1)}
                  data-testid="code-three-way-active-conflict"
                  className={styles.activeConflict}
                >
                  <div className={styles.previews}>
                    <ConflictPreview
                      label={baseLabel}
                      text={activeConflict.baseText}
                    />
                    <ConflictPreview
                      label={currentLabel}
                      text={activeConflict.currentText}
                    />
                    <ConflictPreview
                      label={incomingLabel}
                      text={activeConflict.incomingText}
                    />
                  </div>
                  {/* Pinned to the bottom for the same reason as the summary
                      row: the decision is the point of this surface. */}
                  <div className={styles.decisions}>
                    {(
                      [
                        ["current", acceptCurrentLabel],
                        ["incoming", acceptIncomingLabel],
                        ["both", acceptBothLabel],
                      ] as const
                    ).map(([resolution, label]) => (
                      <button
                        key={resolution}
                        type="button"
                        onClick={() => resolveActiveConflict(resolution)}
                        aria-pressed={activeResolution === resolution}
                        data-testid={`code-three-way-accept-${resolution}`}
                        className={officeDialogParts.compactButton}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p
                  data-testid="code-three-way-no-conflicts"
                  className={officeDialogParts.message}
                >
                  {noConflictsLabel}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    );
  },
);

const THREE_WAY_CONFLICT_PREVIEW_LIMIT = 4_000;

function boundedConflictPreview(text: string): string {
  return text.length <= THREE_WAY_CONFLICT_PREVIEW_LIMIT
    ? text
    : `${text.slice(0, THREE_WAY_CONFLICT_PREVIEW_LIMIT)}…`;
}

function ConflictPreview({ label, text }: { label: string; text: string }) {
  return (
    <div className={officeDialogParts.field}>
      <span className={officeDialogParts.label}>{label}</span>
      <pre
        data-testid="code-three-way-conflict-preview"
        className={`${officeDialogParts.well} ${officeDialogParts.mono} ${styles.preview}`}
      >
        {boundedConflictPreview(text)}
      </pre>
    </div>
  );
}

/** Minimal CM6 changes that transform one complete source into another. */
function textChangesBetween(
  before: string,
  after: string,
): readonly CodeCompareTextChange[] {
  return diff(before, after, {
    scanLimit: 50_000,
    timeout: 250,
  }).map((change) => ({
    from: change.fromA,
    to: change.toA,
    insert: after.slice(change.fromB, change.toB),
  }));
}

/**
 * Copy one complete changed line range from B into A. This mirrors MergeView's
 * own B→A gutter operation, including its trailing-line-break handling, while
 * letting the host ribbon accept whichever chunk the A-side caret identifies.
 */
function applyChunkFromOther(merge: MergeView, chunkIndex: number): boolean {
  const chunk = merge.chunks[chunkIndex];
  if (!chunk) return false;
  merge.a.dispatch({
    changes: changeForChunkFromOther(merge, chunkIndex),
    userEvent: "input.compare.accept",
  });
  return true;
}

function changeForChunkFromOther(
  merge: MergeView,
  chunkIndex: number,
): CodeCompareTextChange {
  const chunk = merge.chunks[chunkIndex]!;
  const source = merge.b;
  const destination = merge.a;
  let insert = source.state.sliceDoc(
    chunk.fromB,
    Math.max(chunk.fromB, chunk.toB - 1),
  );
  if (
    chunk.fromB !== chunk.toB &&
    chunk.toA <= destination.state.doc.length
  ) {
    insert += source.state.lineBreak;
  }
  return {
    from: chunk.fromA,
    to: Math.min(destination.state.doc.length, chunk.toA),
    insert,
  };
}

/** The scroll container for the merge panes; the panes size to it and scroll. */
function compareHostStyle(isDark: boolean, threeWayMode = false): CSSProperties {
  return {
    // Two-way owns the whole surface. Three-way shares it with the conflict
    // decisions below and yields height to them first (grow only, never claim
    // a minimum), so a short host still shows the controls.
    flex: threeWayMode ? "1 1 0" : 1,
    minHeight: 0,
    overflow: "auto",
    background: isDark ? "#1e2530" : "#ffffff",
  };
}

export default CodeCompareView;
