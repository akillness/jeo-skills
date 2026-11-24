"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { X } from "./icons/houseIcons";
import { useTranslations } from "../../../host/next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "../../lib/utils";

import {
  officeDialogClassName,
  officeDialogParts,
  useOfficeDialogChrome,
} from "./officeDialogChrome";

export interface OfficeDialogShellProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly children?: ReactNode;
  readonly defaultActionLabel: ReactNode;
  readonly cancelActionLabel: ReactNode;
  readonly onDefaultAction: () => void;
  readonly onCancel: () => void;
  readonly defaultActionDisabled?: boolean;
  /** An action at the start of the footer, before Cancel and the default
   * action (Excel's Options…, PowerPoint's Reset): it never submits. */
  readonly footerStart?: ReactNode;
  /** An action between Cancel and the default action (PowerPoint's Header
   * and Footer: Cancel, Apply, Apply to All): it never submits. */
  readonly footerBeforeDefault?: ReactNode;
  readonly busy?: boolean;
  readonly busyActionLabel?: ReactNode;
  readonly initialFocus?: "default" | "cancel";
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusTarget?: () => HTMLElement | null;
  readonly container?: HTMLElement | null;
  readonly className?: string;
  readonly testIdPrefix?: string;
  readonly defaultActionTestId?: string;
  /** `data-*` attributes on the default action, for a dialog whose OK
   * changes meaning in place (Goal Seek's Solve becomes Apply result). */
  readonly defaultActionData?: Readonly<Record<`data-${string}`, string>>;
  /** A dialog that predates the shell keeps its Cancel button's test id
   * (`document-font-dialog-cancel`) instead of `<prefix>-cancel`. */
  readonly cancelActionTestId?: string;
  /** False for a dialog whose only way out is its default action (Word's
   * Word Count and Tabs close with one button); Escape and a press outside
   * still call `onCancel`. */
  readonly showCancelAction?: boolean;
  /** Test id of the dimmed backdrop, for a dialog whose tests address the
   * layer it used to paint itself (`document-font-dialog-layer`). */
  readonly overlayTestId?: string;
  /** A tab strip (or any control row) between the title and the body, so it
   * stays put while a long page scrolls, as a Word dialog's tabs do. */
  readonly tabStrip?: ReactNode;
  /** Extra classes on the body (a scroll region, a grid). */
  readonly bodyClassName?: string;
}

/** Enter keeps its own meaning on these targets instead of pressing OK. */
export function enterKeepsNativeMeaning(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.closest(
      "a[href], button, summary, textarea, select, [contenteditable]:not([contenteditable='false']), [role='button'], [role='checkbox'], [role='combobox'], [role='grid'], [role='link'], [role='listbox'], [role='menu'], [role='option'], [role='radio'], [role='slider'], [role='spinbutton'], [role='switch'], [role='tab'], [role='tree']",
    )
  ) {
    return true;
  }
  if (!(target instanceof HTMLInputElement)) return false;
  return [
    "button",
    "checkbox",
    "color",
    "file",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(target.type);
}

function focusAvailable(candidate: HTMLElement | null | undefined): boolean {
  if (!candidate || !candidate.isConnected) return false;
  if (
    candidate.hasAttribute("disabled") ||
    candidate.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }
  // Without scrolling: the launcher sits in a ribbon that is sticky inside
  // the document's scroll box, and a scrolling focus() pulled the page to
  // the ribbon's layout position on every dialog close.
  candidate.focus({ preventScroll: true });
  return document.activeElement === candidate;
}

/**
 * Editor-neutral modal frame for Office-style commands.
 *
 * The caller owns domain state and transactions. This shell owns only modal
 * interaction: accessible labelling, focus containment/restoration to an
 * explicit caller-owned trigger (with an active-element fallback),
 * default/cancel keyboard semantics, and a fail-closed busy boundary. It
 * intentionally contains no editor switch or save/undo logic.
 *
 * The dimmed backdrop is already here: `DialogContent` portals to the console
 * shell root and paints the shared Radix overlay (`fixed inset-0`, dimmed and
 * blurred) behind the card. Callers must not add a backdrop of their own, and
 * an editor that renders its own in-place dimmer for cards it positions itself
 * must not point it at these dialogs either — the two would stack into a
 * double grey.
 *
 * Under an `OfficeDialogChromeProvider` the same structure is drawn with the
 * shared Office dialog chrome (officeDialogChrome.tsx) instead of the generic
 * console card, so an editor's shell dialogs match its native-window cards.
 * Only class names change; the elements, test ids and focus order do not.
 */
export function OfficeDialogShell(
  props: OfficeDialogShellProps,
): React.JSX.Element | null {
  // An editor mounts dozens of closed shells and re-renders them with every
  // keystroke. One that has never opened has nothing on screen and no focus
  // to hand back, so it builds no frame; once opened it stays mounted, so its
  // closing animation and focus return are exactly as before.
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  if (!opened && !props.open) return null;
  return <OfficeDialogShellFrame {...props} />;
}

function OfficeDialogShellFrame({
  open,
  title,
  description,
  children,
  defaultActionLabel,
  cancelActionLabel,
  onDefaultAction,
  onCancel,
  defaultActionDisabled = false,
  footerStart,
  footerBeforeDefault,
  busy = false,
  busyActionLabel,
  initialFocus = "default",
  initialFocusRef,
  returnFocusRef,
  returnFocusTarget,
  container,
  className,
  testIdPrefix,
  defaultActionTestId,
  defaultActionData,
  cancelActionTestId,
  showCancelAction = true,
  overlayTestId,
  tabStrip,
  bodyClassName,
}: OfficeDialogShellProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const defaultActionRef = useRef<HTMLButtonElement | null>(null);
  const cancelActionRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const actionUnavailable = busy || defaultActionDisabled;
  const chromeTone = useOfficeDialogChrome();
  const officeChrome = chromeTone !== null;
  const t = useTranslations("console-notebooks");

  const requestDefaultAction = useCallback(() => {
    if (actionUnavailable) return;
    onDefaultAction();
  }, [actionUnavailable, onDefaultAction]);

  const requestCancel = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      requestDefaultAction();
    },
    [requestDefaultAction],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.nativeEvent.isComposing ||
        event.nativeEvent.keyCode === 229 ||
        enterKeepsNativeMeaning(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (actionUnavailable) return;
      event.currentTarget.requestSubmit(defaultActionRef.current ?? undefined);
    },
    [actionUnavailable],
  );

  const footerActions = (
    <>
      {showCancelAction ? (
        <button
          ref={cancelActionRef}
          type="button"
          data-testid={
            cancelActionTestId ??
            (testIdPrefix ? `${testIdPrefix}-cancel` : undefined)
          }
          onClick={requestCancel}
          disabled={busy}
          className={
            officeChrome
              ? officeDialogParts.button
              : "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background"
          }
        >
          {cancelActionLabel}
        </button>
      ) : null}
      {footerBeforeDefault}
      <button
        {...defaultActionData}
        ref={defaultActionRef}
        type="submit"
        data-testid={
          defaultActionTestId ??
          (testIdPrefix ? `${testIdPrefix}-default-action` : undefined)
        }
        onClick={(event) => {
          if (actionUnavailable) event.preventDefault();
        }}
        disabled={actionUnavailable}
        className={
          officeChrome
            ? officeDialogParts.primaryButton
            : "inline-flex h-9 items-center justify-center rounded-md border border-transparent bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary"
        }
      >
        {busy && busyActionLabel ? busyActionLabel : defaultActionLabel}
      </button>
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestCancel();
      }}
    >
      <DialogContent
        ref={contentRef}
        container={container}
        overlayTestId={overlayTestId}
        showCloseButton={false}
        skin={officeChrome ? "none" : "console"}
        tabIndex={-1}
        aria-modal="true"
        aria-busy={busy}
        data-testid={testIdPrefix ? `${testIdPrefix}-dialog` : undefined}
        className={cn(
          officeChrome ? officeDialogClassName({ tone: chromeTone }) : null,
          "sm:max-w-[520px]",
          className,
        )}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const activeElement = document.activeElement;
          restoreFocusRef.current =
            returnFocusRef !== undefined
              ? returnFocusRef.current
              : activeElement instanceof HTMLElement
                ? activeElement
                : null;
          if (focusAvailable(initialFocusRef?.current)) return;
          const preferred =
            initialFocus === "cancel"
              ? cancelActionRef.current
              : defaultActionRef.current;
          const fallback =
            initialFocus === "cancel"
              ? defaultActionRef.current
              : cancelActionRef.current;
          if (focusAvailable(preferred) || focusAvailable(fallback)) return;
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Closed to a collapsed RefEdit (Excel's Collapse Dialog): the
          // keyboard stays in its box, not back on the grid or the ribbon
          // (live audit S-195).
          const active = typeof document === "undefined" ? null : document.activeElement;
          if (active instanceof HTMLElement && active.closest("[data-ref-edit-collapsed]")) {
            restoreFocusRef.current = null;
            event.preventDefault();
            return;
          }
          const liveRestoreTarget = returnFocusTarget?.();
          if (focusAvailable(liveRestoreTarget)) {
            restoreFocusRef.current = null;
            event.preventDefault();
            return;
          }
          const restoreTarget = restoreFocusRef.current;
          restoreFocusRef.current = null;
          if (focusAvailable(restoreTarget)) event.preventDefault();
        }}
      >
        <form
          className={officeChrome ? officeDialogParts.form : undefined}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        >
          {officeChrome ? (
            <>
              <div className={officeDialogParts.header}>
                <DialogTitle
                  className={officeDialogParts.title}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-dialog-title` : undefined
                  }
                >
                  {title}
                </DialogTitle>
                {


}
                <button
                  type="button"
                  className="sr-only"
                  onClick={requestCancel}
                  disabled={busy}
                  aria-label={t("common.close")}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-dialog-close` : undefined
                  }
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <DialogDescription
                skin="none"
                className={officeDialogParts.description}
              >
                {description}
              </DialogDescription>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle
                data-testid={
                  testIdPrefix ? `${testIdPrefix}-dialog-title` : undefined
                }
              >
                {title}
              </DialogTitle>
              <DialogDescription className="empty:hidden">
                {description}
              </DialogDescription>
            </DialogHeader>
          )}

          {tabStrip ?? null}

          {children ? (
            <div
              className={cn(
                officeChrome ? officeDialogParts.body : "mt-4 grid gap-3",
                bodyClassName,
              )}
              data-testid={
                testIdPrefix ? `${testIdPrefix}-dialog-body` : undefined
              }
            >
              {children}
            </div>
          ) : null}

          {officeChrome ? (
            <div className={officeDialogParts.footer}>
              {footerStart ? (
                <div className={officeDialogParts.footerStart}>{footerStart}</div>
              ) : null}
              {footerActions}
            </div>
          ) : (
            <DialogFooter className="mt-6">
              {footerStart ? (
                <div className="mr-auto flex items-center gap-2">{footerStart}</div>
              ) : null}
              {footerActions}
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
