"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import {
  AlertTriangle,
  Check,
  CirclePause,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestionMark,
  Save,
} from "lucide-react";
import {
  OfficeRibbonQuickStrip,
  type OfficeRibbonQuickStripTestIds,
} from "./OfficeRibbonQuickStrip";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";
import {
  officeAutosaveEnabled,
  setOfficeAutosaveEnabled,
  subscribeOfficeAutosave,
  type OfficeAutosaveLabels,
} from "../../lib/office-autosave-preference";
import { saveTouchMode, useTouchMode } from "../../lib/touch-mode";
import { useCompactEditorChrome } from "../../lib/narrow-window";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import styles from "./OfficeEditorActionRail.module.css";

export interface OfficeRailAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  title?: string;
  ariaLabel?: string;
  testId?: string;
  pressed?: boolean;
  expanded?: boolean;
  keyShortcuts?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * The page's own verdict on a document its confirmation just published: the
 * readback settles off the request, so the pill starts at "Checking…" and
 * turns into "Verified" (or the failure) as the page reports it.
 * `unverified`: the document was handed over without the check at all (its
 * renderer could not run), and the pill says so rather than staying silent.
 * `notice`: published with things that only look different or could not be
 * proven; `action` is the one plain verb that deals with them.
 */
export interface OfficeRailVerification {
  status: "pending" | "verified" | "failed" | "unverified" | "notice";
  label: string;
  /** The full account, for the tooltip and assistive technology. */
  detail?: string;
  testId?: string;
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
}

/**
 * A quiet fact about how the page came to be, beside the save face: e.g. the
 * AI task that wrote it stopped after section N and handed it over.
 */
export interface OfficeRailNote {
  label: string;
  detail?: string;
  testId?: string;
  /** A way into what the note is about (a deck's recoverable copy). */
  action?: { label: string; onClick: () => void; testId?: string };
}

export interface OfficeRailSave {
  /** The AutoSave switch's strings; without them the face has no switch. */
  autosave?: OfficeAutosaveLabels;
  /** Whose AutoSave switch this face is (`officeAutosaveEnabled`'s scope);
   * without one, the switch the editors share. */
  autosaveScope?: string;
  status: string;
  statusLabel: string;
  actionLabel: string;
  actionAriaLabel?: string;
  onSave: () => void;
  disabled?: boolean;
  disabledReason?: string;
  actionTestId?: string;
  statusTestId?: string;
  verification?: OfficeRailVerification;
  note?: OfficeRailNote;
  /**
   * Why the last save did not land, beside the face while the status is a
   * problem (the editor's translated refusal or the server's word). Without
   * it the face said only "Unsaved · Save" (acceptance finding 6).
   */
  failureReason?: string;
  failureTestId?: string;
  /**
   * What the save is still doing, in the face's tip and its accessible name
   * only (the face keeps its status): a deck's slides still being written into
   * its PowerPoint file (TRIAGE 55).
   */
  statusDetail?: string;
}

export interface OfficeEditorActionRailProps {
  /** Commands the editor keeps in the row ahead of everything else (the
   * spreadsheet's import and export). */
  leading?: ReactNode;
  /** The title bar's command search (Excel's "Search", Alt+Q): an icon face
   * in the row ahead of the history pair. */
  search?: OfficeRailAction;
  undo?: OfficeRailAction;
  redo?: OfficeRailAction;
  save?: OfficeRailSave;
  ai?: OfficeRailAction;
  primary?: OfficeRailAction & {
    kind: "comments" | "present" | "run" | "stop";
  };
  overflow?: ReactNode;
  /** Commands that close the row after the primary action (the slide editor's
   * presenter-view chevron and its Comments button): always in the row, at the
   * far right, the way the spreadsheet's Comments primary sits last. */
  trailing?: ReactNode;
  overflowLabel: string;
  ariaLabel?: string;
  overflowOpen?: boolean;
  onOverflowOpenChange?: (open: boolean) => void;
  testIds?: OfficeRibbonQuickStripTestIds;
}

function actionTitle(action: OfficeRailAction): string {
  return (
    action.title ??
    (action.disabled && action.disabledReason
      ? `${action.label} — ${action.disabledReason}`
      : action.label)
  );
}

function RailAction({
  action,
  icon,
  kind,
  compact = false,
  testId,
}: {
  action: OfficeRailAction;
  icon: ReactNode;
  kind: string;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <button
      ref={action.buttonRef}
      type="button"
      className={`office-ribbon-control ${styles.action}`}
      data-office-control-part="button"
      data-rail-action={kind}
      // Searching reads the page: a read-only window (a shared view, or one
      // still verifying its edit right) keeps it, as it keeps find.
      data-collaboration-readonly-allowed={kind === "search" || undefined}
      data-compact={compact || undefined}
      data-testid={testId ?? action.testId}
      disabled={action.disabled}
      data-disabled-reason={action.disabled ? action.disabledReason : undefined}
      aria-label={action.ariaLabel ?? actionTitle(action)}
      title={actionTitle(action)}
      aria-pressed={action.pressed}
      aria-expanded={action.expanded}
      aria-keyshortcuts={action.keyShortcuts}
      onMouseDown={(event) => {
        if (event.button === 0) event.preventDefault();
      }}
      onClick={() => {
        if (!action.disabled) action.onClick();
      }}
    >
      {icon}
      <span className={styles.actionLabel}>{action.label}</span>
    </button>
  );
}

export interface OfficeRailButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  /** The command's name: its accessible name and its tooltip. */
  label: string;
  icon: ReactNode;
  /** Opens a menu: the face carries the menu chevron after its icon. */
  menu?: boolean;
  pressed?: boolean;
  /** Working (an import in flight): a spinner replaces the icon. */
  busy?: boolean;
  testId?: string;
  /** A longer tooltip than the name (a reason it is unavailable). */
  title?: string;
}

/**
 * A command an editor puts in the rail's `leading` slot (import, export,
 * print, version history): the same 32 px face and 18 px icon as undo and
 * redo, its name in the tooltip. A menu trigger (export) adds the chevron in
 * its own segment, drawn as a split's; it forwards its ref and props so it can
 * be a Radix trigger `asChild`.
 */
export const OfficeRailButton = forwardRef<HTMLButtonElement, OfficeRailButtonProps>(
  function OfficeRailButton(
    { label, icon, menu = false, pressed, busy = false, testId, title, className, onMouseDown, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`office-ribbon-control ${styles.action}${className ? ` ${className}` : ""}`}
        data-office-control-part="button"
        data-rail-action="leading"
        data-compact={menu ? undefined : true}
        data-rail-menu={menu || undefined}
        data-testid={testId}
        aria-label={rest["aria-label"] ?? label}
        title={title ?? label}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          // Keep the document's selection: a rail press never takes focus
          // from the page (as the history pair does).
          if (!menu && event.button === 0 && !event.defaultPrevented) {
            event.preventDefault();
          }
        }}
      >
        {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : icon}
        {menu ? (
          <span className={styles.menuRail} aria-hidden="true">
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={16} />
          </span>
        ) : null}
      </button>
    );
  },
);

/** The published document's readback verdict, beside the save face it follows. */
function RailVerification({
  verification,
}: {
  verification: OfficeRailVerification;
}) {
  const Icon =
    verification.status === "verified"
      ? ShieldCheck
      : verification.status === "failed" || verification.status === "notice"
        ? ShieldAlert
        : verification.status === "unverified"
          ? ShieldQuestionMark
          : Shield;
  const action = verification.action;
  return (
    <>
      <span
        className={styles.verification}
        data-status={verification.status}
        role="status"
        title={verification.detail ?? verification.label}
        aria-label={verification.detail}
        data-testid={verification.testId}
      >
        <Icon size={14} aria-hidden="true" />
        <span className={styles.verificationLabel}>{verification.label}</span>
      </span>
      {action ? (
        <button
          type="button"
          className={`office-ribbon-control ${styles.verificationAction}`}
          data-office-control-part="button"
          data-testid={action.testId}
          title={action.label}
          onMouseDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </>
  );
}

/**
 * Work in progress beside the primary action (a compile and how long it has
 * run), in the same quiet pill as the readback verdict. A timer, not a live
 * region: a count that changes every second is not read out each time.
 */
export function OfficeRailStatus({
  label,
  detail,
  testId,
}: {
  label: ReactNode;
  detail?: string;
  testId?: string;
}) {
  return (
    <span
      className={styles.verification}
      data-status="pending"
      role="timer"
      title={detail}
      data-testid={testId}
    >
      <Loader2 size={14} aria-hidden="true" className="animate-spin" />
      <span className={styles.verificationLabel}>{label}</span>
    </span>
  );
}

/** How the page came to be, in the same quiet pill as the readback verdict. */
function RailNote({ note }: { note: OfficeRailNote }) {
  return (
    <span
      className={styles.verification}
      data-status="note"
      role="note"
      title={note.detail ?? note.label}
      aria-label={note.detail}
      data-testid={note.testId}
    >
      <CirclePause size={14} aria-hidden="true" />
      <span className={styles.verificationLabel}>{note.label}</span>
      {note.action ? (
        <button
          type="button"
          className={styles.noteAction}
          data-testid={note.action.testId}
          onMouseDown={(event) => event.preventDefault()}
          onClick={note.action.onClick}
        >
          {note.action.label}
        </button>
      ) : null}
    </span>
  );
}

/** How long the save face is held to switch AutoSave. */
export const OFFICE_AUTOSAVE_HOLD_MS = 650;

/**
 * The one save face. Saved, it reads as a status and nobody needs to press
 * it; with anything unsaved (or a save that failed) it IS the Save button.
 * There is no menu to open first.
 *
 * Holding it switches AutoSave. The ring around its icon is that control:
 * solid while AutoSave is on, dashed while it is off, and it fills round as
 * the button is held, so the hold reads before anyone is told about it; the
 * hover hint names it. Shift+Enter does the same from the keyboard.
 */
const RAIL_SAVE_SPINNER_AFTER_MS = 800;

function RailSave({ save }: { save: OfficeRailSave }) {
  const saving = save.status === "saving";
  // A spinner is a frame every 16 ms for the whole window, under the very typing
  // that keeps a deck saving: it says something only of a save that takes a while.
  const [savingLong, setSavingLong] = useState(false);
  useEffect(() => {
    if (!saving) return;
    const timer = window.setTimeout(() => setSavingLong(true), RAIL_SAVE_SPINNER_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setSavingLong(false);
    };
  }, [saving]);
  // "synced": not yet written to the file, but the server holds every edit
  // (the page's live room); a status, never a problem.
  const synced = save.status === "synced";
  const saved = save.status === "saved" || synced;
  const problem = ["error", "failed", "conflict", "offline"].includes(
    save.status,
  );
  const autosaveScope = save.autosaveScope;
  const autosave = useSyncExternalStore(
    subscribeOfficeAutosave,
    () => officeAutosaveEnabled(autosaveScope),
    () => true,
  );
  const labels = save.autosave;
  const [holding, setHolding] = useState(false);
  // The switch just made, said in the label for a moment.
  const [announced, setAnnounced] = useState<string | null>(null);
  // Where the face sits on screen when the switch is said: the bubble is
  
  // ribbon's tab row, Safari put it behind the ribbon panel and cut it off).
  const [announcedAt, setAnnouncedAt] = useState<{ top: number; left: number } | null>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const announceTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
    },
    [],
  );
  const toggleAutosave = () => {
    const next = !officeAutosaveEnabled(autosaveScope);
    setOfficeAutosaveEnabled(next, autosaveScope);
    if (!labels) return;
    const rect = hostRef.current?.getBoundingClientRect();
    setAnnouncedAt(rect ? { top: rect.bottom + 6, left: rect.left + rect.width / 2 } : null);
    setAnnounced(next ? labels.on : labels.off);
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
    announceTimerRef.current = window.setTimeout(() => setAnnounced(null), 1800);
  };
  const endHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setHolding(false);
  };
  const beginHold = () => {
    if (!labels) return;
    heldRef.current = false;
    endHold();
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      heldRef.current = true;
      setHolding(false);
      toggleAutosave();
    }, OFFICE_AUTOSAVE_HOLD_MS);
  };
  const Icon = problem ? AlertTriangle : saved ? Check : savingLong ? Loader2 : Save;
  // Saved, the face reads as a status; a click still asks the editor to save
  // (a code file's save transforms run on a saved buffer too), it is only
  // never needed. While saving or without authority it does nothing.
  const clickable = !saving && !save.disabled;
  const actionable = clickable && !saved;
  // It names the action only while it can do it: without authority (a guest,
  // a read-only page) it stays the status it is.
  const faceLabel = actionable && !problem ? save.actionLabel : save.statusLabel;
  const hint = labels ? (autosave ? labels.holdToTurnOff : labels.holdToTurnOn) : undefined;
  const failureReason = problem && save.failureReason ? save.failureReason : null;
  // The hover tip names what the button does, which does not change while
  // the pointer rests on it: a browser keeps a tip it is showing, so a
  
  // face says the status.
  const title = [
    save.disabledReason ?? save.actionLabel,
    failureReason,
    save.statusDetail,
    hint,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className={styles.saveHost} ref={hostRef}>
    <button
      type="button"
      className={`office-ribbon-control ${styles.action} ${styles.save}`}
      data-office-control-part="button"
      data-rail-action="save"
      data-save-problem={problem || undefined}
      data-save-actionable={actionable || undefined}
      data-autosave={labels ? (autosave ? "on" : "off") : undefined}
      data-holding={holding || undefined}
      data-testid={save.actionTestId}
      data-disabled-reason={save.disabled || saving ? save.disabledReason : undefined}
      aria-label={save.actionAriaLabel ?? [save.statusLabel, save.statusDetail, save.actionLabel].filter(Boolean).join(" · ")}
      disabled={save.disabled}
      aria-disabled={!clickable || undefined}
      aria-keyshortcuts={labels ? "Shift+Enter" : undefined}
      title={title}
      style={{ ["--office-autosave-hold-ms" as string]: `${OFFICE_AUTOSAVE_HOLD_MS}ms` }}
      onPointerDown={(event) => {
        // The primary button (a synthetic pointer reports none at all).
        if (!event.button) beginHold();
      }}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onMouseDown={(event) => {
        // A rail press never takes focus from the page: pressed, the face
        // turns disabled once the save lands and the focus fell to the body,
        // so Cmd+Z right after Save reached no editor.
        if (event.button === 0) event.preventDefault();
      }}
      onContextMenu={(event) => {
        // A touch hold raises the context menu: the hold is the switch.
        if (labels) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (labels && event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          toggleAutosave();
        }
      }}
      onClick={(event) => {
        if (heldRef.current) {
          // The hold switched AutoSave; its release is not a Save.
          heldRef.current = false;
          event.preventDefault();
          return;
        }
        if (event.shiftKey && event.detail === 0) return;
        if (clickable) save.onSave();
      }}
    >
      <span className={styles.saveRing} aria-hidden="true">
        <Icon size={14} className={savingLong ? styles.saveSpinner : undefined} />
      </span>
      <span
        className={styles.saveLabel}
        role="status"
        data-status={save.status}
        data-state={save.status}
        data-testid={save.statusTestId}
      >
        {faceLabel}
      </span>
    </button>
      {announced ? (() => {
        // The switch just made, said under the face: the face itself keeps
        // its width and its label. Drawn on the page's top layer, never
        // under the ribbon panel or clipped by the tab row.
        const toast = (
          <span
            className={`${styles.saveToast} ${announcedAt ? styles.saveToastFloating : ""}`}
            role="status"
            data-testid="office-autosave-toast"
            style={announcedAt ? { top: announcedAt.top, left: announcedAt.left } : undefined}
          >
            {announced}
          </span>
        );
        return announcedAt && typeof document !== "undefined" ? createPortal(toast, document.body) : toast;
      })() : null}
      {failureReason ? (
        // The reason the save did not land, in the readback verdict's pill;
        // the whole sentence is its tooltip.
        <span
          className={`${styles.verification} ${styles.saveFailure}`}
          data-status="failed"
          role="status"
          title={failureReason}
          data-testid={save.failureTestId ?? "office-save-failure-reason"}
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span className={styles.verificationLabel}>{failureReason}</span>
        </span>
      ) : null}
    </span>
  );
}

/** The five editors provide commands and authority, never header geometry. */
export function OfficeEditorActionRail({
  leading,
  search,
  undo,
  redo,
  save,
  ai,
  primary,
  overflow,
  trailing,
  overflowLabel,
  ariaLabel,
  overflowOpen,
  onOverflowOpenChange,
  testIds,
}: OfficeEditorActionRailProps) {
  const t = useTranslations("console-notebooks");
  const touchModeOn = useTouchMode();
  // The compact chrome (a phone, an embedded mobile editor): the row keeps
  // Undo, Redo and Save; every other command of the rail moves behind More,
  // worded there, so nothing is lost to a narrow row.
  const compact = useCompactEditorChrome();
  const primaryIcon =
    primary?.kind === "comments" ? (
      <OfficeSemanticIcon semanticId="review.comment" size={18} />
    ) : primary?.kind === "stop" ? (
      <OfficeSemanticIcon semanticId="media.stop" size={18} />
    ) : (
      <OfficeSemanticIcon semanticId="media.play" size={18} />
    );
  const searchAction = search ? (
    <RailAction
      action={search}
      icon={<OfficeSemanticIcon semanticId="edit.find" size={18} />}
      kind="search"
      compact={!compact}
    />
  ) : null;
  // Office's Touch/Mouse Mode, where its Quick Access Toolbar keeps it:
  // after Undo and Redo, before Save (lib/touch-mode).
  const touchModeAction = (
    <RailAction
      action={{
        label: t("pages.touchMode"),
        // One accessible name; the pressed state says whether it is on.
        ariaLabel: t("pages.touchMode"),
        title: touchModeOn ? t("pages.touchModeTurnOff") : t("pages.touchModeTurnOn"),
        pressed: touchModeOn,
        onClick: () => saveTouchMode(!touchModeOn),
        testId: "office-rail-touch-mode",
      }}
      icon={<OfficeSemanticIcon semanticId="edit.hand" size={18} />}
      kind="touch-mode"
      compact={!compact}
    />
  );
  const aiAction = false ? (
    <RailAction
      action={ai}
      icon={<OfficeSemanticIcon semanticId="ai.assistant" size={18} />}
      kind="ai"
    />
  ) : null;
  const primaryAction = primary ? (
    <RailAction action={primary} icon={primaryIcon} kind={primary.kind} />
  ) : null;
  // No overflow commands: the "more" button would open an empty flyout, so
  // the rail does not draw it.
  const hasOverflow =
    overflow !== undefined && overflow !== null && overflow !== false;
  const utilities = compact ? (
    <div className={styles.utilities} data-compact-rail-overflow="true">
      {leading ? (
        <div className={styles.leading} data-office-editor-action-rail-leading="true">
          {leading}
        </div>
      ) : null}
      {save?.verification ? <RailVerification verification={save.verification} /> : null}
      {save?.note ? <RailNote note={save.note} /> : null}
      {searchAction}
      {touchModeAction}
      {aiAction}
      {primaryAction}
      {trailing}
      {hasOverflow ? overflow : null}
    </div>
  ) : (
    <div className={styles.utilities}>{overflow}</div>
  );
  const history = (
    <div className={styles.history}>
      {undo ? (
        <RailAction
          action={undo}
          icon={<OfficeSemanticIcon semanticId="edit.undo" size={18} />}
          kind="undo"
          compact
        />
      ) : null}
      {redo ? (
        <RailAction
          action={redo}
          icon={<OfficeSemanticIcon semanticId="edit.redo" size={18} />}
          kind="redo"
          compact
        />
      ) : null}
    </div>
  );
  if (compact) {
    return (
      <OfficeRibbonQuickStrip
        alwaysOverflow
        className={styles.rail}
        ariaLabel={ariaLabel ?? overflowLabel}
        overflowLabel={overflowLabel}
        overflowOpen={overflowOpen}
        onOverflowOpenChange={onOverflowOpenChange}
        tail={utilities}
        testIds={testIds}
      >
        <div className={styles.core} data-office-editor-action-rail="true" data-compact-rail="true">
          {history}
          {save ? <RailSave save={save} /> : null}
        </div>
      </OfficeRibbonQuickStrip>
    );
  }
  return (
    <OfficeRibbonQuickStrip
      alwaysOverflow
      className={styles.rail}
      ariaLabel={ariaLabel ?? overflowLabel}
      overflowLabel={overflowLabel}
      overflowOpen={overflowOpen}
      onOverflowOpenChange={onOverflowOpenChange}
      tail={hasOverflow ? utilities : undefined}
      testIds={testIds}
    >
      <div className={styles.core} data-office-editor-action-rail="true">
        {leading ? (
          <>
            <div className={styles.leading} data-office-editor-action-rail-leading="true">
              {leading}
            </div>
            <span className={styles.divider} aria-hidden="true" />
          </>
        ) : null}
        {searchAction}
        {history}
        {touchModeAction}
        {

}
        {save ? <RailSave save={save} /> : null}
        {save?.verification ? (
          <RailVerification verification={save.verification} />
        ) : null}
        {save?.note ? <RailNote note={save.note} /> : null}
        {primary ? (
          <span className={styles.divider} aria-hidden="true" />
        ) : null}
        {aiAction}
        {primaryAction}
        {trailing}
      </div>
    </OfficeRibbonQuickStrip>
  );
}
