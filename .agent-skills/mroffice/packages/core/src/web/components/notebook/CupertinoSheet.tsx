"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The console's Cupertino sheet, as a component.
 *
 * Established by the notebook-members panel and extracted here so every
 * permission surface IS that sheet rather than a second thing that looks like
 * it. It composes the shared glass dialog (components/ui/dialog), which owns
 * the scrim, the outside-click dismissal, the focus trap and the
 * mounted-through-exit lifecycle — this adds the grabber, the large-title
 * hero, and the scrolling body with its inset "group" rhythm.
 *
 * Dismissal is the scrim around it: there is no close button in the corner,
 * only a visually-hidden one so assistive tech is not left guessing.
 */

import { useRef, type ComponentProps, type ReactNode, type RefObject } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";

import styles from "./CupertinoSheet.module.css";

export { styles as sheetStyles };

function focusAvailable(candidate: HTMLElement | null | undefined): boolean {
  if (!candidate || !candidate.isConnected) return false;
  if (
    candidate.hasAttribute("disabled") ||
    candidate.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }
  candidate.focus();
  return document.activeElement === candidate;
}

export function CupertinoSheet({
  open,
  onOpenChange,
  /** Small uppercase line above the title. */
  eyebrow,
  title,
  subtitle,
  icon,
  /** Trailing circular action in the hero (chat, settings…). */
  action,
  /** Accessible name for the hidden close control. */
  closeLabel,
  /**
   * True while a write is in flight: dismissal is held so the sheet cannot
   * disappear before the outcome is visible.
   */
  busy = false,
  /** Size the sheet to its content instead of a fixed tall card. */
  fitContent = false,
  compactHeader = false,
  className,
  testId,
  children,
  footer,
  initialFocusRef,
  returnFocusRef,
  onOpenAutoFocus,
  onCloseAutoFocus,
  embedded = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  action?: ReactNode;
  closeLabel: string;
  busy?: boolean;
  fitContent?: boolean;
  /** Same sheet chrome with a title-only header for small settings panels. */
  compactHeader?: boolean;
  /** Optional domain class; the shared sheet skin always remains applied. */
  className?: string;
  testId?: string;
  children: ReactNode;
  /** Optional fixed footer that stays outside the scrolling body. */
  footer?: ReactNode;
  /** Optional domain-owned initial focus target. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Optional live trigger restored when the sheet closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Allow a caller to hand focus between mutually exclusive sheets. */
  onOpenAutoFocus?: ComponentProps<typeof DialogContent>["onOpenAutoFocus"];
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
  /** In-place production surface for deterministic public previews. */
  embedded?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  if (embedded) {
    if (!open) return null;
    return (
      <section
        className={`${styles.sheet}${className ? ` ${className}` : ""}`}
        data-testid={testId}
        data-cupertino-sheet="true"
        data-fit={fitContent ? "content" : undefined}
        data-sheet-embedded="true"
        data-compact-header={compactHeader || undefined}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <header className={styles.hero}>
          {!compactHeader ? (
            <span className={styles.heroIcon} aria-hidden="true">{icon}</span>
          ) : null}
          <span className={styles.heroCopy}>
            {!compactHeader ? <small>{eyebrow}</small> : null}
            <h2 className={styles.heroTitle}>{title}</h2>
            <p className={styles.heroSubtitle}>{subtitle}</p>
          </span>
          {action}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        ref={contentRef}
        className={`${styles.sheet}${className ? ` ${className}` : ""}`}
        showCloseButton={false}
        tabIndex={-1}
        aria-busy={busy}
        data-testid={testId}
        data-cupertino-sheet="true"
        data-fit={fitContent ? "content" : undefined}
        data-compact-header={compactHeader || undefined}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        // Autofocusing the first control puts a caret in whatever input comes
        // first, which reads as a form rather than a panel. The sheet itself
        // takes focus instead.
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          const activeElement = document.activeElement;
          restoreFocusRef.current =
            returnFocusRef?.current ??
            (activeElement instanceof HTMLElement ? activeElement : null);
          if (focusAvailable(initialFocusRef?.current)) return;
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const restoreTarget = restoreFocusRef.current;
          restoreFocusRef.current = null;
          if (focusAvailable(restoreTarget)) event.preventDefault();
        }}
      >
        <DialogClose
          className={styles.srClose}
          data-cupertino-sheet-close="true"
          disabled={busy}
        >
          {closeLabel}
        </DialogClose>
        <span className={styles.grabber} aria-hidden="true" />

        <header className={styles.hero}>
          {!compactHeader ? (
            <span className={styles.heroIcon} aria-hidden="true">{icon}</span>
          ) : null}
          <span className={styles.heroCopy}>
            {!compactHeader ? <small>{eyebrow}</small> : null}
            <DialogTitle className={styles.heroTitle}>{title}</DialogTitle>
            <DialogDescription className={styles.heroSubtitle}>
              {subtitle}
            </DialogDescription>
          </span>
          {action}
        </header>

        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </DialogContent>
    </Dialog>
  );
}
