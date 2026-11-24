"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type ComponentPropsWithoutRef,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "../office-ribbon/icons/houseIcons";
import { useTranslations } from "../../../host/next-intl";
import { reportHiddenDocumentIssues } from "../../lib/office-experience-report";
import styles from "./DocumentIssueNotice.module.css";

export interface DocumentIssue {
  key: string;
  label: string;
  description?: string;
  tone?: "warning" | "error";
  testId?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

const HostContext = createContext<{
  host: HTMLElement | null;
  setHost: (host: HTMLElement | null) => void;
  ownerName?: string;
  ownerPageId?: string | null;
} | null>(null);

/** A stable destination outside the editor's scroll area and read-only shield. */
export function DocumentIssueScope({
  children,
  ownerName,
  ownerPageId,
}: {
  children: ReactNode;
  ownerName?: string;
  ownerPageId?: string | null;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ host, setHost, ownerName, ownerPageId }),
    [host, ownerName, ownerPageId],
  );
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

/** Display identity supplied by this window, never inferred from another DOM surface. */
export function useDocumentIssueOwnerName(): string | undefined {
  return useContext(HostContext)?.ownerName;
}

export function DocumentIssueHost() {
  const context = useContext(HostContext);
  return (
    <span
      ref={context?.setHost}
      className={styles.host}
      data-document-issue-host
    />
  );
}

/** A persistent, out-of-flow layer belonging to this shell, never the desk. */
export function DocumentIssueOverlayHost() {
  return (
    <div className={styles.overlayHost} data-window-notice-layer>
      <div
        className={styles.backdrop}
        data-window-notice-backdrop
        aria-hidden="true"
      />
      {/* Reports shown without the window's lease (`passive`), in its corner. */}
      <div className={styles.passiveStack} data-window-notice-passive-stack />
    </div>
  );
}

interface LocalLayer {
  panels: {
    panel: HTMLDivElement;
    onPresentedChange?: (presented: boolean) => void;
  }[];
  blocked: Map<HTMLElement, boolean>;
  observer: MutationObserver | null;
}

// View-only FIFO leases. Each window has one visible report and one dimmer;
// pending reports stay hidden/inert until the preceding report retires.
const localLayers = new WeakMap<HTMLElement, LocalLayer>();

function enterLocalLayer(
  host: HTMLElement,
  panel: HTMLDivElement,
  onPresentedChange?: (presented: boolean) => void,
) {
  const owner = host.parentElement;
  if (!owner) return () => {};
  let layer = localLayers.get(host);
  if (!layer) {
    layer = { panels: [], blocked: new Map(), observer: null };
    localLayers.set(host, layer);
    const current = layer;
    const blockBody = () => {
      for (const node of Array.from(owner.children)) {
        if (
          !(node instanceof HTMLElement) ||
          node === host ||
          node.classList.contains("wm-titlebar")
        )
          continue;
        if (!current.blocked.has(node))
          current.blocked.set(node, node.hasAttribute("inert"));
        node.setAttribute("inert", "");
      }
    };
    blockBody();
    if (typeof MutationObserver !== "undefined") {
      current.observer = new MutationObserver(blockBody);
      current.observer.observe(owner, { childList: true });
    }
  }
  const current = layer;
  const sync = () => {
    host.setAttribute("data-window-notice-active", "true");
    current.panels.forEach((entry, index) => {
      const active = index === 0;
      entry.panel.hidden = !active;
      entry.panel.toggleAttribute("inert", !active);
      entry.panel.setAttribute("aria-hidden", String(!active));
      entry.panel.style.zIndex = "1";
      entry.onPresentedChange?.(active);
    });
  };
  current.panels.push({ panel, onPresentedChange });
  sync();
  return () => {
    panel.hidden = true;
    onPresentedChange?.(false);
    current.panels = current.panels.filter(
      (entry) => entry.panel !== panel && entry.panel.isConnected,
    );
    if (current.panels.length) {
      sync();
      return;
    }
    current.observer?.disconnect();
    current.blocked.forEach((wasInert, element) => {
      if (!wasInert) element.removeAttribute("inert");
    });
    host.removeAttribute("data-window-notice-active");
    localLayers.delete(host);
  };
}








function openModalDialogHost(doc: Document | null): HTMLElement | null {
  if (!doc) return null;
  const modals = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"][data-state="open"]',
    ),
  ).filter(
    (element) =>
      element.isConnected &&
      !element.hidden &&
      !element.closest("[data-window-notice-in-modal]"),
  );
  return modals.at(-1) ?? null;
}

interface DocumentIssueDialogContentProps extends ComponentPropsWithoutRef<"div"> {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  focusOnOpen?: boolean;
  onPresentedChange?: (presented: boolean) => void;
  







  passive?: boolean;
}

/** Window-modal, not document-modal: no body lock, global Escape or focus trap. */
export function DocumentIssueDialogContent({
  open,
  onClose,
  triggerRef,
  focusOnOpen = false,
  onPresentedChange,
  passive = false,
  children,
  className,
  ...props
}: DocumentIssueDialogContentProps) {
  const context = useContext(HostContext);
  const t = useTranslations("common");
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreOnClose = useRef(false);
  const owner = context?.host?.closest<HTMLElement>("[data-window-id]");
  const host =
    Array.from(owner?.children ?? []).find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.hasAttribute("data-window-notice-layer"),
    ) ?? null;
  // A modal opened in another window is not this report's: a background
  // window's notice (another workbook's Document Recovery) stays in its own
  // window rather than jumping into, and over, the dialog the user opened in
  // the window in front (live audit S-194). Dialogs portal to the body, so
  // the owner is the window in front, the one they are opened from.
  const ownerInFront = !owner || owner.getAttribute("data-focused") !== "false";
  // A passive report joins no modal either: it would take that modal's
  // keyboard (its focus trap) as it takes the window's.
  const modalHost = open && ownerInFront && !passive
    ? openModalDialogHost(typeof document === "undefined" ? null : document)
    : null;
  const inModal = modalHost !== null;
  const passiveStack = passive
    ? host?.querySelector<HTMLElement>(":scope > [data-window-notice-passive-stack]") ?? null
    : null;
  const container =
    modalHost ??
    passiveStack ??
    (context
      ? host
      : typeof document === "undefined"
        ? null
        : document.body);
  // The window's FIFO lease (one visible report, the rest of the window
  // inert) applies to its own layer; inside a modal the modal owns that.
  // A passive report takes no lease: nothing of the window is held for it.
  const windowLayerHost = inModal || passive ? null : host;
  // The modal is read from the page while rendering, and nothing else
  // re-renders a report when a modal opens or closes around it: a report
  // would stay outside a modal that opened over it (unreachable behind its
  // focus trap), or leave with the element of a modal that closed and stay
  // "shown" with nothing on screen. Watch the page while the report is open
  // and render again whenever the modal it belongs in changes.
  const [, reconsiderContainer] = useReducer((tick: number) => tick + 1, 0);
  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const doc = document;
    const changed = () =>
      (ownerInFront && !passive ? openModalDialogHost(doc) : null) !== modalHost ||
      (!owner || owner.getAttribute("data-focused") !== "false") !== ownerInFront;
    if (changed()) {
      reconsiderContainer();
      return;
    }
    const View = doc.defaultView;
    if (!View?.MutationObserver) return;
    const observer = new View.MutationObserver(() => {
      if (!changed()) return;
      observer.disconnect();
      reconsiderContainer();
    });
    observer.observe(doc.body, {
      attributes: true,
      attributeFilter: ["data-state", "aria-modal", "hidden", "data-focused"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [open, modalHost, owner, ownerInFront, passive]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel || !container) return;
    restoreOnClose.current = false;
    const doc = panel.ownerDocument;
    const previousFocus =
      doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const shouldFocus =
      !passive &&
      (inModal || focusOnOpen || Boolean(owner?.contains(previousFocus)));
    const leave = windowLayerHost
      ? enterLocalLayer(windowLayerHost, panel, onPresentedChange)
      : () => onPresentedChange?.(false);
    if (!windowLayerHost) onPresentedChange?.(true);
    if (shouldFocus && !panel.hidden) panel.focus({ preventScroll: true });
    return () => {
      const restore =
        restoreOnClose.current || panel.contains(doc.activeElement);
      leave();
      if (!restore) return;
      // The trigger's titlebar remains usable for moving/closing the window.
      // Never pull focus back from another window after an asynchronous close.
      const restoreFocus = () => {
        if (
          doc.activeElement !== doc.body &&
          !panel.contains(doc.activeElement)
        )
          return;
        const target =
          (windowLayerHost &&
            localLayers.get(windowLayerHost)?.panels[0]?.panel) ||
          // A passive report was reached from what had the keyboard (the
          // page being typed into): the keyboard goes back there.
          ((inModal || passive) && previousFocus?.isConnected && !panel.contains(previousFocus)
            ? previousFocus
            : null) ||
          triggerRef.current ||
          previousFocus;
        if (target?.isConnected && !target.closest("[inert]"))
          target.focus({ preventScroll: true });
      };
      if (doc.defaultView?.requestAnimationFrame)
        doc.defaultView.requestAnimationFrame(restoreFocus);
      else queueMicrotask(restoreFocus);
    };
    // Focus intent is sampled only for this open episode, not on report updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    container,
    host,
    inModal,
    passive,
    owner,
    triggerRef,
    onPresentedChange,
    windowLayerHost,
  ]);

  const close = () => {
    const panel = panelRef.current;
    restoreOnClose.current = Boolean(
      panel?.contains(panel.ownerDocument.activeElement),
    );
    onClose();
  };

  if (!open || !container) return null;
  return createPortal(
    <div
      {...props}
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      tabIndex={-1}
      data-motion-surface="dialog"
      // The local lease reveals only the FIFO head before the browser paints.
      hidden={windowLayerHost ? true : undefined}
      data-window-local-dialog={windowLayerHost ? "true" : undefined}
      data-window-notice-in-modal={inModal ? "true" : undefined}
      data-window-notice-passive={passive ? "true" : undefined}
      data-collaboration-readonly-allowed="true"
      className={[styles.dialogPanel, className].filter(Boolean).join(" ")}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === "Tab" && !passive) {
          // A passive report holds no one: Tab goes on out of it.
          const panel = panelRef.current;
          if (!panel) return;
          const targets = Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, a[href], input:not([type="hidden"]), textarea, select, [tabindex]',
            ),
          ).filter(
            (element) =>
              element.tabIndex >= 0 &&
              !element.matches(":disabled") &&
              !element.closest("[hidden], [inert]"),
          );
          const first = targets[0],
            last = targets.at(-1);
          const active = panel.ownerDocument.activeElement;
          if (!first) {
            event.preventDefault();
            panel.focus();
          } else if (event.shiftKey && (active === first || active === panel)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && (active === last || active === panel)) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      {children}
      <button
        type="button"
        className={styles.dialogClose}
        aria-label={t("dialog.close")}
        onClick={close}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    container,
  );
}

interface DocumentIssueNoticeProps {
  issues: readonly DocumentIssue[];
  sourceName?: string;
  scopeKey?: string;
  testId?: string;
  triggerTestId?: string;
}

/** Reuse the titlebar destination without placing a row in document flow. */
export function DocumentIssuePortal({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  const context = useContext(HostContext);
  // Never flash a standalone indicator while the window host is mounting.
  if (context && !context.host) return null;
  const entry = (
    <span
      {...props}
      className={[context ? styles.host : styles.standalone, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
  return context?.host ? createPortal(entry, context.host) : entry;
}







let informativeIssuesShownForTests = false;

/** Tests of what an editor reports read its informative issues on screen. */
export function showInformativeDocumentIssuesForTests(shown: boolean): void {
  informativeIssuesShownForTests = shown;
}

export default function DocumentIssueNotice(props: DocumentIssueNoticeProps) {
  const ownerPageId = useContext(HostContext)?.ownerPageId;
  const quietKeys = props.issues
    .filter((issue) => !issue.action)
    .map((issue) => issue.key);
  const quietSignature = quietKeys.join("\n");
  const surface = props.testId ?? "document-issue-notice";
  useEffect(() => {
    if (!quietSignature) return;
    reportHiddenDocumentIssues({
      pageId: ownerPageId ?? props.scopeKey ?? null,
      surface,
      keys: quietSignature.split("\n"),
    });
  }, [quietSignature, ownerPageId, props.scopeKey, surface]);
  const actionable = informativeIssuesShownForTests
    ? props.issues
    : props.issues.filter((issue) => issue.action);
  if (actionable.length === 0) return null;
  return <ActiveNotice key={props.scopeKey} {...props} issues={actionable} />;
}

function ActiveNotice({
  issues,
  sourceName,
  testId = "document-issue-notice",
  triggerTestId = "document-issue-toggle",
}: DocumentIssueNoticeProps) {
  const t = useTranslations("console-notebooks");
  const [open, setOpen] = useState(false);
  const [presented, setPresented] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  return (
    <DocumentIssuePortal
      data-testid={testId}
      data-collaboration-readonly-allowed="true"
    >
      <span className="wm-visually-hidden" role="status" aria-live="polite">
        {t("documentIssues.summary", { count: issues.length })}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        data-testid={triggerTestId}
        data-collaboration-readonly-allowed="true"
        title={t("documentIssues.summary", { count: issues.length })}
        aria-label={t("documentIssues.summary", { count: issues.length })}
        aria-haspopup="dialog"
        aria-expanded={presented}
        aria-controls={presented ? dialogId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          // A queued (not expanded) report stays queued when requested again.
          setOpen(!presented);
        }}
      >
        <AlertTriangle size={16} aria-hidden="true" />
        <span>{t("documentIssues.label")}</span>
      </button>
      <DocumentIssueDialogContent
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        focusOnOpen
        onPresentedChange={setPresented}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        className={styles.panel}
        data-collaboration-readonly-allowed="true"
        data-testid="document-issue-panel"
      >
        <h2 id={`${dialogId}-title`}>{t("documentIssues.title")}</h2>
        <p id={`${dialogId}-description`}>
          {sourceName || t("documentIssues.description")}
        </p>
        <ul className={styles.list}>
          {issues.map((issue) => (
            <li
              key={issue.key}
              className={styles.issue}
              data-testid={issue.testId}
              data-tone={issue.tone || "warning"}
            >
              <h3>{issue.label}</h3>
              {issue.description ? <p>{issue.description}</p> : null}
              {issue.action ? (
                <button
                  type="button"
                  className={styles.action}
                  disabled={issue.action.disabled}
                  onClick={issue.action.onClick}
                >
                  {issue.action.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </DocumentIssueDialogContent>
    </DocumentIssuePortal>
  );
}
