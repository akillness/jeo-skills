"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CalculationWebImage } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import type { CalculationExternalDatum } from "@mrnote/core/web/lib/spreadsheet/external-data.ts";
import { startTransition, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackgroundCalculationClient } from "@mrnote/core/web/lib/spreadsheet/background-calculation-client.ts";
import { BackgroundCalculationHost, shouldCalculateSpreadsheetInBackground, type BackgroundCalculationHostBinding, type BackgroundCalculationDirtyJournal } from "@mrnote/core/web/lib/spreadsheet/background-calculation-host.ts";
import { BackgroundCalculationUnavailableError, sameCalculationToken, type CalculationRuleRequest, type CalculationUnavailableReason } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { resetRemoteCalculationBackoff } from "@mrnote/core/web/lib/spreadsheet/remote-calculation-worker.ts";
import type { WorksheetCalculationToken, WorksheetFormulaCoordinate } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import type { BackgroundCalculationPlanRequest, BackgroundCalculationPlanResult } from "@/lib/spreadsheet/background-calculation-plans";
import type { EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { settleCalculationPivots, type CalculationPivots } from "@mrnote/core/web/lib/spreadsheet/calculation-pivots.ts";
import { firstPaintFormulaResults, localArithmeticResults, storedFormulaResults, withArithmeticHints } from "@mrnote/core/web/lib/spreadsheet/stored-formula-results.ts";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

const EMPTY_PENDING_RESULTS: ReadonlyMap<string, EngineValue> = new Map();
/** The workbook's PivotTables as the session should hold them, read from an
 * answer (calculation-pivots); null when there are none. */
export type DeriveCalculationPivots = (bindings: readonly BackgroundCalculationHostBinding[],
  results: ReadonlyMap<string, EngineValue>) => CalculationPivots | null;

interface Source {
  readonly bindings: readonly BackgroundCalculationHostBinding[];
  readonly token: WorksheetCalculationToken | null;
  readonly enabled: boolean;
  readonly activeSheetHasFormulas: boolean;
  /** The conditional-format formulas answered with the calculation. */
  readonly rulesKey: string;
  /** The refused IMAGE sources the calculation is told ("" when the host gives none). */
  readonly imagesKey: string;
  /** The WEBSERVICE / IMPORTRANGE data's revision ("" when the host gives none). */
  readonly externalKey: string;
  readonly derivePivots?: DeriveCalculationPivots;
}
/** How long a settled sheet reports its rule formulas as on their way. */
const RULES_AWAITED_MS = 20_000;
/**
 * A print's one budget for rule formulas, shared by all its sheets: the print
 * page starts it per job (`startRuleAnswerBudget`), so a workbook with rules
 * on every sheet waits RULES_AWAITED_MS in all, not per sheet. Rules not
 * answered within it are counted (`unanswered`): the sheet prints with them
 * as they stand and the print says so.
 */
const ruleAnswerBudget = { deadline: 0, unanswered: 0 };
export function startRuleAnswerBudget(): void {
  ruleAnswerBudget.deadline = Date.now() + RULES_AWAITED_MS;
  ruleAnswerBudget.unanswered = 0;
}
/** How many sheets of this print gave up on their rule formulas. */
export function unansweredRuleSheets(): number {
  return ruleAnswerBudget.unanswered;
}

interface Settled {
  readonly token: WorksheetCalculationToken;
  readonly results: ReadonlyMap<string, EngineValue>;
  /** Conditional-format formula values (see BackgroundCalculationResult). */
  readonly ruleValues?: ReadonlyMap<string, ReadonlyMap<string, EngineValue>>;
  readonly rulesKey?: string;
  readonly imagesKey?: string;
  readonly externalKey?: string;
  /** The rules `ruleValues` answers (a value outside a rule's range is not answered). */
  readonly rules?: readonly CalculationRuleRequest[];
  /** Settled locally, its rule formulas still on their way from the session. */
  readonly rulesInFlight?: boolean;
  readonly bindings: readonly BackgroundCalculationHostBinding[];
  readonly coordinates: readonly WorksheetFormulaCoordinate[];
  readonly derivePivots?: DeriveCalculationPivots;
  /** The session's PivotTables did not settle within MAX_PIVOT_REPLACEMENTS:
   * formulas reading a report may hold an older reading (S4 shows it). */
  readonly pivotStale?: boolean;
}
interface Outcome {
  readonly source: Source;
  readonly phase: "ready" | "bypass" | "failed";
  /** Why a failed calculation was not answered (C4). */
  readonly reason?: CalculationUnavailableReason;
}
/** While a calculation is unanswered, how often it is asked again (C4); the
 * remote worker's back-off decides whether the server is actually asked. */
export const CALCULATION_RETRY_MS = 15_000;
interface Running {
  readonly source: Source;
  promise: Promise<boolean>;
  done: boolean;
  cancelled: boolean;
}

/** The longest a window's first calculation waits for an idle moment (ms). */
const FIRST_START_IDLE_MS = 1500;

export function useSpreadsheetBackgroundCalculation(options: {
  bindings: readonly BackgroundCalculationHostBinding[];
  token: WorksheetCalculationToken | null;
  /** Read the existing authority ref at consumption time, including before React commits. */
  getCurrentToken(): WorksheetCalculationToken | null;
  enabled: boolean;
  /**
   * Whether the sheet on screen holds any formula. With none, no result the
   * worker could produce is ever displayed, so the source is not pending for
   * a moment: it settles as a bypass in the same render, instead of showing
   * "calculating" from the sheet switch until the transition that publishes
   * the empty request lands. Omitted, the sheet is assumed to hold formulas.
   */
  activeSheetHasFormulas?: boolean;
  journal: BackgroundCalculationDirtyJournal;
  /** Conditional-format formulas the session evaluates with each
   * calculation (C2): the grid paints from their values. */
  rules?: readonly CalculationRuleRequest[];
  /** The workbook reads serials in the 1904 date system. The host advances
   * the token's topology when it changes, so a new snapshot carries it. */
  date1904?: ExcelDateSystemArg;
  /** The workbook's file name (CELL("filename"), a reference's book in
   * CELL("address")); read when a snapshot is made. */
  workbookName?: string;
  /** The folder of the workbook's location (CELL("filename"), X-194). */
  workbookFolder?: string;
  /** Enable iterative calculation and its limits (calcPr@iterate); a change
   * advances the token's topology like the date system. */
  iteration?: { readonly maxIterations: number; readonly maxChange: number; readonly seeds?: ReadonlyArray<readonly [string, number, number, number]> };
  /** Given when the workbook holds a PivotTable: the session lays the
   * reports over its cells, and an answer settles once the reports read
   * from it are the ones it was calculated with. */
  derivePivots?: DeriveCalculationPivots;
  /** The IMAGE sources this tab was refused (it fetches the pictures): the
   * session answers those cells, and what reads them, with the error. A
   * change calculates again. */
  webImages?: readonly CalculationWebImage[];
  /** What WEBSERVICE / IMPORTRANGE read, as this tab fetched it, under the
   * store's revision (`key`): the session holds it, and a change
   * calculates again. */
  externalData?: { readonly key: string; readonly data: readonly CalculationExternalDatum[] };
  /** The calls an answer read without their data: the host fetches them. */
  onExternalDataRequests?: (keys: readonly string[]) => void;
}) {
  const optionsRef = useRef(options);
  const tokenKey = options.token ? JSON.stringify(options.token) : "";
  const activeSheetHasFormulas = options.activeSheetHasFormulas !== false;
  const rulesKey = options.rules?.length ? JSON.stringify(options.rules) : "";
  const imagesKey = options.webImages ? JSON.stringify(options.webImages) : "";
  const externalKey = options.externalData?.key ?? "";
  const source = useMemo<Source>(() => ({ bindings: options.bindings, token: tokenKey ? JSON.parse(tokenKey) as WorksheetCalculationToken : null, enabled: options.enabled, activeSheetHasFormulas, rulesKey, imagesKey, externalKey,
    ...(options.derivePivots ? { derivePivots: options.derivePivots } : {}) }), [options.bindings, tokenKey, options.enabled, activeSheetHasFormulas, rulesKey, imagesKey, externalKey, options.derivePivots]);
  const sourceRef = useRef(source);
  const mountedRef = useRef(true);
  const cancelledSourcesRef = useRef(new WeakSet<Source>());
  const committedRef = useRef<{ source: Source; phase: Outcome["phase"]; result: Settled | null } | null>(null);
  const commitWaitersRef = useRef<Array<{ source: Source; resolve(value: boolean): void }>>([]);
  // Invalidate old-source authority before any layout-driven focus/consumer.
  // No render-time ref publication: an aborted transition must not replace it.
  useInsertionEffect(() => {
    optionsRef.current = options;
    sourceRef.current = source;
    if (committedRef.current?.source !== source) committedRef.current = null;
    commitWaitersRef.current = commitWaitersRef.current.filter(waiter => {
      if (waiter.source !== source) { waiter.resolve(false); return false; }
      return true;
    });
  }, [options, source]);
  useInsertionEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; committedRef.current = null;
      commitWaitersRef.current.splice(0).forEach(waiter => waiter.resolve(false));
    };
  }, []);
  const clientRef = useRef<BackgroundCalculationClient | null>(null);
  const adapterRef = useRef(new BackgroundCalculationHost());
  const settledContextsRef = useRef<Settled[]>([]);
  const [settledContexts, setSettledContexts] = useState<Settled[]>([]);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const outcomeRef = useRef<Outcome | null>(null);
  // Index preparation is not a new visible result. Publishing it as state
  // forced a full grid render between the pending frame and worker settlement.
  // Result/bypass publication exposes the prepared coordinates atomically.
  const coordinateIndexRef = useRef<{ source: Source; coordinates: readonly WorksheetFormulaCoordinate[] } | null>(null);
  const coordinateIndex = coordinateIndexRef.current;
  const coordinates = coordinateIndex?.coordinates;
  const runningRef = useRef<Running | null>(null);
  /** What the adapter and client last advanced to: a source differing only
   * in rules or PivotTable labels sends no edit (and no new snapshot). */
  const advancedRef = useRef<{ bindings: readonly BackgroundCalculationHostBinding[]; token: WorksheetCalculationToken } | null>(null);

  const getCurrentToken = useCallback(() => optionsRef.current.getCurrentToken(), []);
  const sourceIsCurrent = useCallback((candidate: Source) => {
    const live = getCurrentToken();
    return mountedRef.current && !cancelledSourcesRef.current.has(candidate) && sourceRef.current === candidate && Boolean(live && candidate.token && sameCalculationToken(live, candidate.token));
  }, [getCurrentToken]);
  // The server's session holds PivotTables (calculation-pivots).
  const eligible = useCallback((candidate: Source) => candidate.enabled && candidate.activeSheetHasFormulas && Boolean(candidate.token) &&
    !candidate.bindings.some(binding => binding.input.options?.resolvePivotData), []);
  const publishOutcome = useCallback((next: Outcome) => {
    outcomeRef.current = next; // Prepared outcome, not a commit receipt.
    startTransition(() => setOutcome(next));
  }, []);

  // Both the effect and an early command barrier call the same idempotent start.
  // A command arriving before passive effects therefore waits for real work.
  const start = useCallback((candidate: Source): Promise<boolean> => {
    const existing = runningRef.current;
    if (!sourceIsCurrent(candidate)) return Promise.resolve(false);
    // Returning to a previously viewed context is safe only within the exact
    // version and immutable cell sources. Context identity includes every resolver.
    const retained = settledContextsRef.current.filter(entry => candidate.token &&
      sameCalculationToken(entry.token, candidate.token) && entry.bindings.length === candidate.bindings.length &&
      entry.bindings.every((binding, index) => binding.sheet === candidate.bindings[index].sheet));
    if (retained.length !== settledContextsRef.current.length) {
      settledContextsRef.current = retained; startTransition(() => setSettledContexts(retained));
    }
    if (existing?.source === candidate) return existing.promise;
    if (!eligible(candidate)) return Promise.resolve(true);
    const cached = settledContextsRef.current.find(entry => entry.bindings === candidate.bindings && (entry.rulesKey ?? "") === candidate.rulesKey && (entry.imagesKey ?? "") === candidate.imagesKey &&
      (entry.externalKey ?? "") === candidate.externalKey && entry.derivePivots === candidate.derivePivots);
    if (cached) {
      coordinateIndexRef.current = { source: candidate, coordinates: cached.coordinates };
      const cachedContexts = settledContextsRef.current;
      startTransition(() => {
        setSettled(cached);
        setSettledContexts(cachedContexts);
        publishOutcome({ source: candidate, phase: "ready" });
      });
      return Promise.resolve(true);
    }
    if (existing && !existing.done) { existing.cancelled = true; clientRef.current?.cancel(); }
    const client = clientRef.current ??= new BackgroundCalculationClient({ getCurrentToken });
    const running: Running = { source: candidate, promise: Promise.resolve(false), done: false, cancelled: false };
    runningRef.current = running;
    running.promise = (async () => {
      try {
        const token = candidate.token!;
        const last = advancedRef.current;
        let requested: readonly WorksheetFormulaCoordinate[];
        if (last && last.bindings === candidate.bindings && sameCalculationToken(last.token, token)) requested = adapterRef.current.coordinates();
        else {
          // A workbook the session refused as too large is refused unasked
          // until a reset, so this edit need not be worked out for it: a
          // 730,000-cell sort spent 2.2 s of the frames after it on a delta,
          
          // catches up by comparing, if the workbook's topology ever resets it.
          if (client.refusesWorkbook && last && last.token.pageId === token.pageId && last.token.loadEpoch === token.loadEpoch &&
              last.token.topologyRevision === token.topologyRevision) {
            throw new BackgroundCalculationUnavailableError("budget");
          }
          advancedRef.current = null;
          const advanced = adapterRef.current.advance(token, candidate.bindings, optionsRef.current.journal);
          if (advanced.ok) { client.applyDelta(advanced.delta); requested = advanced.coordinates; }
          else {
            const reset = adapterRef.current.reset(token, candidate.bindings, { name: optionsRef.current.workbookName, folder: optionsRef.current.workbookFolder }, optionsRef.current.date1904, optionsRef.current.iteration);
            if (!reset.ok) throw new Error(reset.reason);
            client.reset(reset.snapshot); requested = reset.coordinates;
            optionsRef.current.journal.clear();
          }
          advancedRef.current = { bindings: candidate.bindings, token };
        }
        coordinateIndexRef.current = { source: candidate, coordinates: requested };
        // Above 20,000 formulas the browser's worker gives up its warm start,
        // so the main thread took them, and so it did for a small sheet of
        // plain arithmetic. With the server's session (C1/C2) the grid
        // evaluates nothing: a small arithmetic sheet settles at once from the
        // bounded arithmetic evaluator when it can answer every formula, and
        // every other formula goes to the session.
        const arithmeticOnly = !shouldCalculateSpreadsheetInBackground(candidate.bindings, requested);
        // Rule formulas (conditional formats, validations, link locations)
        // are answered by the session only: they calculate even without a
        // formula cell (the session answers them beside a local arithmetic answer).
        const ruled = Boolean(candidate.rulesKey) && (optionsRef.current.rules?.length ?? 0) > 0;
        if (requested.length === 0 && !ruled) {
          publishOutcome({ source: candidate, phase: "bypass" });
          return true;
        }
        // A formula may read a PivotTable's report, which only the session
        // lays over the cells: no local arithmetic answer then.
        const local = arithmeticOnly && !candidate.derivePivots ? localArithmeticResults(candidate.bindings, requested) : null;
        const rules = candidate.rulesKey ? optionsRef.current.rules ?? [] : [];
        const webImages = candidate.imagesKey ? optionsRef.current.webImages : undefined;
        // An arithmetic sheet holds no IMAGE; a refusal still reaches the
        // session with the next calculation that goes to it.
        const externalData = candidate.externalKey ? optionsRef.current.externalData?.data : undefined;
        const calculation = { token, coordinates: requested, ...(rules.length ? { rules } : {}), ...(webImages ? { webImages } : {}),
          ...(externalData ? { externalData } : {}) };
        let answer = local ? null : await client.calculate(calculation);
        // Calls read without their data: fetched by the host, whose new data
        // calculates again (also when this answer is no longer the current one).
        if (answer?.externalRequests?.length) optionsRef.current.onExternalDataRequests?.(answer.externalRequests);
        // The session calculated with the PivotTables it holds; the reports
        // read from its answer may differ (their source changed): it gets
        // those, at most twice per edit (calculation-pivots).
        let pivotStale = false;
        const derive = candidate.derivePivots;
        if (answer && derive) {
          const settledPivots = await settleCalculationPivots(client, calculation, answer, (results) => derive(candidate.bindings, results),
            () => !running.cancelled && sourceIsCurrent(candidate));
          if (!settledPivots) return false;
          ({ answer, pivotStale } = settledPivots);
        }
        const results = local ?? answer!.results;
        if (running.cancelled || !sourceIsCurrent(candidate)) return false;
        const next: Settled = { token, results, bindings: candidate.bindings, coordinates: requested, rulesKey: candidate.rulesKey, imagesKey: candidate.imagesKey, externalKey: candidate.externalKey,
          ...(answer?.ruleValues ? { ruleValues: answer.ruleValues, rules } : {}),
          ...(local && rules.length ? { rulesInFlight: true } : {}),
          ...(candidate.derivePivots ? { derivePivots: candidate.derivePivots } : {}), ...(pivotStale ? { pivotStale: true } : {}) };
        const nextContexts = [next, ...settledContextsRef.current.filter(entry =>
          sameCalculationToken(entry.token, next.token) && entry.bindings !== next.bindings)].slice(0, 2);
        settledContextsRef.current = nextContexts;
        startTransition(() => {
          setSettled(next);
          setSettledContexts(nextContexts);
          publishOutcome({ source: candidate, phase: "ready" });
        });
        // A sheet that settled locally still has its rule formulas answered by
        // the session (C2). The sheet is ready meanwhile: the barrier does not
        // wait for them, and the grid paints the previous answer's values.
        // A later request on this client supersedes (cancels) this one.
        // Answered or not, the rules are no longer on their way (a printed
        // page waits for them: `rulesPending`).
        const rulesSettled = (ruleValues: Settled["ruleValues"] | undefined) => {
          if (!sourceIsCurrent(candidate) || !settledContextsRef.current.includes(next)) return;
          const { rulesInFlight: _answered, ...rest } = next;
          const withRules: Settled = ruleValues ? { ...rest, ruleValues, rules } : rest;
          const contexts = settledContextsRef.current.map(entry => entry === next ? withRules : entry);
          settledContextsRef.current = contexts;
          startTransition(() => { setSettled(current => current === next ? withRules : current); setSettledContexts(contexts); });
        };
        if (local && rules.length) {
          // A session that does not answer (slow, or retrying) never holds a
          // printed page past RULES_AWAITED_MS: it prints without them, as
          // the grid paints without them.
          const wait = ruleAnswerBudget.deadline
            ? Math.max(0, Math.min(RULES_AWAITED_MS, ruleAnswerBudget.deadline - Date.now()))
            : RULES_AWAITED_MS;
          const awaited = setTimeout(() => { ruleAnswerBudget.unanswered += 1; rulesSettled(undefined); }, wait);
          void client.calculate({ token, coordinates: requested, rules }).then(
            (ruled) => { clearTimeout(awaited); rulesSettled(ruled.ruleValues); },
            () => { clearTimeout(awaited); rulesSettled(undefined); });
        }
        return true;
      } catch (error) {
        if (!running.cancelled && sourceIsCurrent(candidate)) publishOutcome({ source: candidate, phase: "failed",
          reason: error instanceof BackgroundCalculationUnavailableError ? error.reason : "unavailable" });
        return false;
      } finally { running.done = true; }
    })();
    return running.promise;
  }, [eligible, getCurrentToken, publishOutcome, sourceIsCurrent]);

  // The window's first calculation starts once the page has opened: on open
  // the main thread is busy until the grid takes input, and a session's reset
  
  // P8), while the first paint shows the stored results. An idle moment comes
  // after the grid is editable, at the latest after FIRST_START_IDLE_MS; a
  // command meanwhile starts it itself (`start` is its barrier), and a source
  // that changes meanwhile is the one started. Later sources start at once.
  const startedRef = useRef(false);
  useEffect(() => {
    let idle: number | null = null;
    const requestIdle = typeof window === "undefined" ? undefined : window.requestIdleCallback;
    if (!startedRef.current && typeof requestIdle === "function") {
      idle = requestIdle.call(window, () => {
        idle = null;
        startedRef.current = true;
        void start(source);
      }, { timeout: FIRST_START_IDLE_MS });
    } else {
      startedRef.current = true;
      void start(source);
    }
    return () => {
      if (idle !== null) window.cancelIdleCallback?.(idle);
      const running = runningRef.current;
      if (running?.source === source && !running.done) {
        running.cancelled = true; clientRef.current?.cancel();
        // Strict Mode may replay this same source effect after its cleanup.
        runningRef.current = null;
      }
    };
  }, [source, start]);
  useEffect(() => () => {
    const running = runningRef.current; if (running) running.cancelled = true;
    commitWaitersRef.current.splice(0).forEach(waiter => waiter.resolve(false));
    clientRef.current?.dispose(); clientRef.current = null;
    adapterRef.current.clear(); runningRef.current = null; settledContextsRef.current = []; advancedRef.current = null;
  }, []);

  const getSettled = useCallback((): Settled | null => {
    const current = sourceRef.current;
    const receipt = committedRef.current;
    const result = receipt?.source === current && receipt.phase === "ready" ? receipt.result : null;
    return result && result.bindings === current.bindings && current.enabled && sourceIsCurrent(current) && current.token && sameCalculationToken(result.token, current.token) ? result : null;
  }, [sourceIsCurrent]);
  const matchingSettled = settledContexts.find(entry => entry.bindings === source.bindings && entry.derivePivots === source.derivePivots &&
    source.token && sameCalculationToken(entry.token, source.token));
  const ready = Boolean(matchingSettled && source.enabled && source.token && matchingSettled.bindings === source.bindings && sameCalculationToken(matchingSettled.token, source.token));
  const currentOutcome = outcome?.source === source ? outcome : null;
  const pending = eligible(source) && !ready && currentOutcome?.phase !== "bypass" && currentOutcome?.phase !== "failed";
  /** Ready, but the rule formulas (a conditional format's threshold) are
   * still on their way: a printed page waits for them, the grid does not. */
  const rulesPending = Boolean(ready && matchingSettled?.rulesInFlight);
  // C4: the calculation could not answer. The grid keeps the last results
  // (marked stale), edits go on, and the calculation is asked again every
  // CALCULATION_RETRY_MS (the remote back-off decides whether the server is
  // reached); `retry` asks now, past the back-off, and shows "Calculating".
  const failureReason = currentOutcome?.phase === "failed" && !ready ? currentOutcome.reason ?? "unavailable" : null;
  const rerun = useCallback(() => {
    const candidate = sourceRef.current;
    const running = runningRef.current;
    if (running?.source === candidate && running.done) runningRef.current = null;
    if (outcomeRef.current?.source === candidate && outcomeRef.current.phase === "failed") { outcomeRef.current = null; setOutcome(null); }
    void start(candidate);
  }, [start]);
  const retry = useCallback(() => { resetRemoteCalculationBackoff(); rerun(); }, [rerun]);
  useEffect(() => {
    if (!failureReason) return;
    const timer = setTimeout(rerun, CALCULATION_RETRY_MS);
    return () => clearTimeout(timer);
  }, [failureReason, currentOutcome, rerun]);
  const projection = useMemo(() => {
    if (!eligible(source) || currentOutcome?.phase === "bypass" || currentOutcome?.phase === "failed") return undefined;
    if (ready) return matchingSettled!.results;
    // Old values are visual hints only and never cross a page/load/topology boundary.
    const canCarry = source.token && settled && source.token.pageId === settled.token.pageId && source.token.loadEpoch === settled.token.loadEpoch && source.token.topologyRevision === settled.token.topologyRevision;
    // The evaluator checks the current raw cell before using an override, so
    // removed formulas and new literals cannot inherit old calculated values.
    // Missing formulas are already deferred by the pending evaluator. Reusing
    // this immutable visual map avoids an O(formulas) copy on every edit and
    // does not depend on whether the next coordinate index has been prepared.
    // A formula typed since (not in the carried map) that the bounded
    // arithmetic evaluator can read shows its provisional value at once (C2).
    // The arithmetic evaluator reads cells without the PivotTables' reports
    // (only the session lays them): no provisional value when there are any.
    if (canCarry) {
      if (source.derivePivots) return settled.results;
      // Only the cells the dirty journal names as edited since: a render
      // never scans a sheet. (A broken chain names none: no hints.)
      const journal = optionsRef.current.journal;
      return withArithmeticHints(source.bindings, settled.results, (index) => {
        const before = settled.bindings[index]?.sheet;
        const after = source.bindings[index].sheet;
        return before && before.id === after.id ? journal.keys(after.id, before.cells, after.cells) : null;
      });
    }
    // First paint of an open (nothing calculated yet in this view): what the
    // saved cells already show (their stamped display / numeric result),
    // until the calculation answers (C1). Later topology changes keep the
    // deferred blanks: an edited cell may still carry its old stamp.
    return !settled
      ? source.derivePivots ? storedFormulaResults(source.bindings) : firstPaintFormulaResults(source.bindings)
      : EMPTY_PENDING_RESULTS;
  }, [currentOutcome, eligible, ready, matchingSettled, settled, source]);

  // Only this layout effect certifies that Window has committed an evaluator
  // built from the same source/token/bindings. Task resolution or a RAF cannot.
  useLayoutEffect(() => {
    const valid = sourceIsCurrent(source);
    const phase: Outcome["phase"] | null = !valid ? null : !eligible(source) ? "bypass"
      : ready ? "ready" : currentOutcome?.phase === "bypass" ? "bypass"
        : currentOutcome?.phase === "failed" ? "failed" : null;
    committedRef.current = phase ? { source, phase, result: phase === "ready" ? matchingSettled! : null } : null;
    commitWaitersRef.current = commitWaitersRef.current.filter(waiter => {
      if (waiter.source !== source || !valid) { waiter.resolve(false); return false; }
      if (phase) { waiter.resolve(phase !== "failed"); return false; }
      return true;
    });
  }, [source, sourceIsCurrent, eligible, ready, matchingSettled, currentOutcome]);

  const waitForCommit = useCallback((candidate: Source): Promise<boolean> => {
    if (!sourceIsCurrent(candidate)) return Promise.resolve(false);
    const receipt = committedRef.current;
    if (receipt?.source === candidate) return Promise.resolve(receipt.phase !== "failed");
    return new Promise(resolve => commitWaitersRef.current.push({ source: candidate, resolve }));
  }, [sourceIsCurrent]);
  const wait = useCallback(async (): Promise<boolean> => {
    const candidate = sourceRef.current;
    if (!sourceIsCurrent(candidate)) return false;
    if (!eligible(candidate)) return waitForCommit(candidate);
    if (getSettled()) return true;
    const status = outcomeRef.current;
    if (status?.source === candidate && status.phase === "failed") return false;
    const result = status?.source === candidate && status.phase === "bypass" ? true : await start(candidate);
    return result && sourceIsCurrent(candidate) ? waitForCommit(candidate) : false;
  }, [eligible, getSettled, sourceIsCurrent, start, waitForCommit]);
  const plan = useCallback(async (request: BackgroundCalculationPlanRequest): Promise<BackgroundCalculationPlanResult> => {
    const candidate = sourceRef.current;
    if (!candidate.token || !sameCalculationToken(request.token, candidate.token) || !await wait() || !sourceIsCurrent(candidate)) throw new Error("Calculation plan requires the current supported source.");
    // Plans consume the caller's already resolved matrix. Manual calculation
    // keeps its existing frozen ledger; it must not disable sorting that matrix.
    const client = clientRef.current ??= new BackgroundCalculationClient({ getCurrentToken });
    const result = await client.plan(request);
    if (!sourceIsCurrent(candidate) || !sameCalculationToken(result.token, request.token)) throw new Error("Calculation plan source changed.");
    return result;
  }, [getCurrentToken, sourceIsCurrent, wait]);
  /**
   * The ONE barrier a command awaits before it reads formula results in the
   * same tick (C2): resolves once the evaluator Window committed is built from
   * the current source -- the server's answer for this workbook revision is
   * applied and `formulaWorkbook` reads it (a ValueStore, nothing evaluates).
   * `results` is that answer, or null where this source is not calculated in
   * the session (no formula on screen, the outage
   * switch). `ok` false: the source changed meanwhile or the calculation
   * failed -- the command must not use what it would read.
   */
  const settledView = useCallback(async (): Promise<{ ok: boolean; results: ReadonlyMap<string, EngineValue> | null }> => {
    const ok = await wait();
    return { ok, results: ok ? getSettled()?.results ?? null : null };
  }, [getSettled, wait]);
  /**
   * Expressions typed at one cell, evaluated by the calculation session
   * against the workbook as it is now (Evaluate Formula, Function Arguments;
   * C2): each value, `undefined` where the engine refuses one. Null when the
   * session cannot take it (failing, the source changed meanwhile): the
   * caller shows no value (nothing evaluates in the browser, C3).
   */
  /**
   * A session for one call when the automatic calculation holds none (a
   * sheet without formulas, Manual mode): the workbook as it is now (with
   * its PivotTables' reports), opened, asked and closed. Null when it cannot
   * be carried or the source moved on.
   */
  const oneShot = useCallback(async <T,>(candidate: Source, run: (client: BackgroundCalculationClient) => Promise<T | null>): Promise<T | null> => {
    const token = candidate.token;
    if (!token || candidate.bindings.some((binding) => binding.input.options?.resolvePivotData)) return null;
    const host = new BackgroundCalculationHost();
    const prepared = host.reset(token, candidate.bindings, undefined, optionsRef.current.date1904, optionsRef.current.iteration);
    host.clear();
    if (!prepared.ok) return null;
    const client = new BackgroundCalculationClient({ getCurrentToken: () => sourceIsCurrent(candidate) ? token : null });
    try {
      client.reset(prepared.snapshot);
      // The workbook's PivotTables: the one-call session lays their reports
      // over the cells first (calculate, then the reports read from that
      // answer), so a GETPIVOTDATA it is asked about reads them.
      const derive = candidate.derivePivots;
      if (derive) {
        const calculation = { token, coordinates: prepared.coordinates };
        const first = await client.calculate(calculation).catch(() => null);
        const settledPivots = first && await settleCalculationPivots(client, calculation, first,
          (results) => derive(candidate.bindings, results), () => sourceIsCurrent(candidate)).catch(() => null);
        if (!settledPivots) return null;
      }
      const answer = await run(client).catch(() => null);
      return sourceIsCurrent(candidate) ? answer : null;
    } finally { client.dispose(); }
  }, [sourceIsCurrent]);
  /**
   * Goal Seek / Data Table / Scenario summary / Solver in the server's
   * calculation session, against the workbook as it is now (C2; a one-call
   * session where the automatic calculation holds none). Null when the
   * session cannot take it (the server path is off or failing, the source
   * changed meanwhile): the caller refuses, it never evaluates itself.
   */
  const whatIf = useCallback(async (input: Parameters<BackgroundCalculationClient["whatIf"]>[0]): Promise<unknown | null> => {
    const candidate = sourceRef.current;
    if (!eligible(candidate)) return oneShot(candidate, (client) => client.whatIf(input));
    if (!await wait() || !sourceIsCurrent(candidate)) return null;
    const client = clientRef.current ??= new BackgroundCalculationClient({ getCurrentToken });
    const answer = await client.whatIf(input).catch(() => null);
    return sourceIsCurrent(candidate) ? answer : null;
  }, [eligible, getCurrentToken, oneShot, sourceIsCurrent, wait]);
  const evaluate = useCallback(async (location: { sheetId: string; row: number; col: number }, expressions: readonly string[]): Promise<Array<EngineValue | undefined> | null> => {
    const candidate = sourceRef.current;
    if (!eligible(candidate)) return oneShot(candidate, (client) => client.evaluate({ token: candidate.token!, ...location, expressions }));
    if (!await wait() || !sourceIsCurrent(candidate)) return null;
    const client = clientRef.current ??= new BackgroundCalculationClient({ getCurrentToken });
    const answer = await client.evaluate({ token: candidate.token!, ...location, expressions }).catch(() => null);
    return sourceIsCurrent(candidate) ? answer : null;
  }, [eligible, getCurrentToken, oneShot, sourceIsCurrent, wait]);
  /**
   * Rule formulas over their ranges (advanced filter criteria; C2), against
   * the workbook as it is now: per rule key, the "row:col" values that are
   * not FALSE. Null when the session cannot take it (see `evaluate`): the
   * caller refuses (never evaluates them itself).
   */
  const evaluateRules = useCallback(async (rules: readonly CalculationRuleRequest[]): Promise<Map<string, ReadonlyMap<string, EngineValue>> | null> => {
    const candidate = sourceRef.current;
    if (!eligible(candidate)) return oneShot(candidate, (client) => client.evaluateRules({ token: candidate.token!, rules }));
    if (!await wait() || !sourceIsCurrent(candidate)) return null;
    const client = clientRef.current ??= new BackgroundCalculationClient({ getCurrentToken });
    const answer = await client.evaluateRules({ token: candidate.token!, rules }).catch(() => null);
    return sourceIsCurrent(candidate) ? answer : null;
  }, [eligible, getCurrentToken, oneShot, sourceIsCurrent, wait]);
  const coordinatesReady = Boolean(coordinateIndex?.source === source && source.token && coordinateIndex.source.token && sameCalculationToken(source.token, coordinateIndex.source.token));
  const cancel = useCallback(() => {
    // Explicit recalculation advances the authority token before cancelling.
    // Fence this source only; the next generation and Strict Mode replay remain usable.
    cancelledSourcesRef.current.add(sourceRef.current);
    committedRef.current = null;
    commitWaitersRef.current.splice(0).forEach(waiter => waiter.resolve(false));
    const running = runningRef.current;
    if (running) running.cancelled = true;
    clientRef.current?.cancel();
  }, []);
  // The latest answer published, whatever source it was for (value filters
  // read it by workbook revision; never an authority for a command).
  return { cancel, projection, pending, rulesPending, failure: failureReason ? { reason: failureReason } : null, retry, pivotStale: Boolean(ready && matchingSettled!.pivotStale), settled: ready ? matchingSettled! : null, latestAnswer: settled, settledView, evaluate, evaluateRules, getSettled, getCurrentToken, wait, plan, whatIf, coordinatesReady, coordinates };
}
