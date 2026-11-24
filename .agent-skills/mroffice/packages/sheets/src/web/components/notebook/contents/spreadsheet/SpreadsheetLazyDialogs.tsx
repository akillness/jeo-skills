"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { reloadPage } from "@mrnote/core/web/lib/reload-reason.ts";
import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SpreadsheetFunctionDialogsProps } from "./SpreadsheetFunctionDialogs";
import type { FormulaEvaluationDialogProps } from "../../../../lib/spreadsheet/FormulaEvaluationDialog";
import type { ErrorCheckPanelProps } from "../../../../lib/spreadsheet/ErrorCheckPanel";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";

const panelStyle = { position: "absolute" as const, top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 240, background: "var(--surface, #ffffff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8 };

class DialogLoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** A worded button: the toolbar class alone is an icon's 28 x 28 square. */
const WORDED_BUTTON_STYLE = { width: "auto", padding: "0 10px", flexBasis: "auto", flexShrink: 0, whiteSpace: "nowrap" } as const;

/** "saved" means every draft reached the model and the page is saved, so a
 * reload loses nothing; "unsaved" keeps the page as it is. */

export type SpreadsheetLazyRecovery = () => Promise<"saved" | "unsaved">;
export type SpreadsheetLazyRecoveryState = "idle" | "saving" | "unsaved";
// Module scope on purpose: an arrow created inside the unregister closure
// would share that registration's context, so a module-level reload kept
// after unregistering would hold the closed window's recover closure (and its
// whole render scope, grid DOM and workbook) alive.
const reloadWindow = () => reloadPage("spreadsheet_dialog");
interface SpreadsheetLazyWriter {
  recover: SpreadsheetLazyRecovery;
  reload: () => void;
  /** Synchronous: nothing new is unsaved since this writer last said "saved". */
  settled?: () => boolean;
}
// One entry per mounted editor, keyed by an owner token private to that
// registration. The reload is page-wide, so every live writer must be secured,
// not the one that happened to register last. Unregistering deletes only its
// own entry; nothing that belonged to a closed window stays reachable.
const writers = new Map<object, SpreadsheetLazyWriter>();
let writersRevision = 0;

/** A chunk that failed once stays failed in the module map of both runtimes
 * that host the editor, so an in-place retry cannot fetch it again. Each
 * editor instance registers how to make a reload safe for itself: flush and
 * save every draft first. The failure notice offers a reload only while a
 * recovery is registered, reloads only after EVERY registered editor reports
 * saved, and never reloads on its own. */
export function registerSpreadsheetLazyRecovery(recover: SpreadsheetLazyRecovery, reload: () => void = reloadWindow, settled?: () => boolean) {
  const owner = {};
  writers.set(owner, { recover, reload, settled });
  writersRevision += 1;
  return () => { if (writers.delete(owner)) writersRevision += 1; };
}

/** Save barrier over all live writers. An editor that opens or closes, or an
 * edit that lands while the saves are in flight, runs another round; unsaved
 * work that is still there after that refuses the reload. */
export async function secureEveryWriter(): Promise<(() => void) | null> {
  for (let round = 0; round < 3; round += 1) {
    const revision = writersRevision;
    const live = [...writers.values()];
    if (live.length === 0) return null;
    const results = await Promise.all(live.map(writer => writer.recover().catch(() => "unsaved" as const)));
    if (results.some(result => result !== "saved")) return null;
    if (revision === writersRevision && live.every(writer => writer.settled?.() ?? true)) return live[live.length - 1]!.reload;
  }
  return null;
}

/** One import promise per panel; retry replaces React.lazy's cached rejection.
 * The surrounding Window/Suspense and all worksheet draft state stay mounted. */
export function createSpreadsheetLazyDialog<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  close: (props: P) => void,
  renderFailure?: (retry: () => void, close: () => void, reload: (() => void) | null, recovering: SpreadsheetLazyRecoveryState) => ReactNode,
) {
  let pending: ReturnType<typeof load> | undefined;
  let loaded: { default: ComponentType<P> } | undefined;
  const preload = () => pending ??= load().then(
    (module) => { loaded = module; return module; },
    (error) => { pending = undefined; throw error; },
  );
  // A module already fetched (warmed, or opened before) is handed to React at
  // once: the panel renders in the same commit instead of suspending a frame.
  const lazyView = () => lazy(() => {
    const ready = loaded;
    return ready ? ({ then(resolve: (value: { default: ComponentType<P> }) => void) { resolve(ready); } } as unknown as ReturnType<typeof load>) : preload();
  });
  let current = lazyView();
  const reset = () => { pending = undefined; current = lazyView(); return current; };
  function LazyDialog(props: P) {
    const t = useTranslations("console-notebooks");
    // Initial suspension can discard local state: retain the initial lazy type
    // at module/factory scope rather than recreating it on each retry render.
    const [attempt, setAttempt] = useState(() => ({ View: current, key: 0 }));
    const [recovering, setRecovering] = useState<SpreadsheetLazyRecoveryState>("idle");
    const { View } = attempt;
    const retry = () => setAttempt(previous => ({ View: reset(), key: previous.key + 1 }));
    const dismiss = () => { reset(); close(props); };
    const recover = writers.size > 0;
    const reload = recover && recovering !== "saving" ? () => {
      setRecovering("saving");
      void secureEveryWriter().catch(() => null).then(reloadPage => {
        if (reloadPage) reloadPage(); else setRecovering("unsaved");
      });
    } : null;
    return <DialogLoadBoundary key={attempt.key} fallback={renderFailure ? renderFailure(retry, dismiss, reload, recovering) : (
      <div role="alert" style={{ ...panelStyle, padding: 12 }} data-testid="spreadsheet-dialog-load-error">
        <p className="text-sm">{t("spreadsheet.dialogLoadFailed")}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="note-editor-office-toolbar__button" style={WORDED_BUTTON_STYLE} onClick={retry}>{t("window.error.retry")}</button>
          <button type="button" className="note-editor-office-toolbar__button" style={WORDED_BUTTON_STYLE} onClick={dismiss}>{t("common.close")}</button>
          {recover ? <button type="button" className="note-editor-office-toolbar__button" style={WORDED_BUTTON_STYLE} disabled={recovering === "saving"} onClick={reload ?? undefined} data-testid="spreadsheet-dialog-load-reload">{t("spreadsheet.dialogLoadReload")}</button> : null}
        </div>
        {recovering === "unsaved" ? <p className="mt-2 text-xs" role="status" data-testid="spreadsheet-dialog-load-reload-blocked">{t("spreadsheet.dialogLoadReloadBlocked")}</p> : null}
      </div>
    )}><View {...props} /></DialogLoadBoundary>;
  }
  return { Component: LazyDialog, preload: () => { void preload().catch(() => {}); }, load: () => preload().then(() => undefined) };
}

/** A panel the window mounts with no boundary of its own around it. Its first
 * open before the code has arrived must not reach a boundary above the window:
 * that hides the whole window for the wait and takes its refs away, so a panel
 * rendering in that moment reads the window's root as null (a Copilot opened on
 * a workbook still settling never took a circle, AI70H H177 C08). */
export function createSpreadsheetLazyPanel<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  close: (props: P) => void,
) {
  const dialog = createSpreadsheetLazyDialog<P>(load, close);
  function LazyPanel(props: P) {
    return <Suspense fallback={null}><dialog.Component {...props} /></Suspense>;
  }
  return { ...dialog, Component: LazyPanel };
}

const functions = createSpreadsheetLazyDialog<SpreadsheetFunctionDialogsProps>(() => import("./SpreadsheetFunctionDialogs").then((module) => ({ default: module.SpreadsheetFunctionDialogs })), props => { if (props.pickerOpen) props.onCancelPicker(); if (props.argumentFunction !== null) props.onCancelArguments(); props.returnFocusRef?.current?.focus(); });
const evaluation = createSpreadsheetLazyDialog<FormulaEvaluationDialogProps>(() => import("../../../../lib/spreadsheet/FormulaEvaluationDialog").then((module) => ({ default: module.FormulaEvaluationDialog })), props => props.onClose());
const errorCheck = createSpreadsheetLazyDialog<ErrorCheckPanelProps>(() => import("../../../../lib/spreadsheet/ErrorCheckPanel").then((module) => ({ default: module.ErrorCheckPanel })), props => props.onClose());

export const SpreadsheetFunctionDialogs = functions.Component;
export const FormulaEvaluationDialog = evaluation.Component;
export const ErrorCheckPanel = errorCheck.Component;
export const preloadSpreadsheetFunctionDialogs = functions.preload;
export const preloadFormulaEvaluationDialog = evaluation.preload;
export const preloadErrorCheckPanel = errorCheck.preload;

/** Keep a cold-open visible without stealing the existing trigger's focus. */
export function SpreadsheetDialogLoading({ label }: { label: string }) {
  return <div style={panelStyle}><EditorLoadingState kind="spreadsheet" compact label={label} testId="spreadsheet-dialog-loading" /></div>;
}
