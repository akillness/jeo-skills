"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
// The scroll lock Radix's own overlay uses (the same hoisted copy, so nested
// locks from Radix menus still stack with this one); see `DialogOverlay`.
import { RemoveScroll } from "react-remove-scroll";
import { useTranslations } from "../../../host/next-intl";

import { cn } from "../../lib/utils";
import { DOCUMENT_FLAGS, holdDocumentFlag } from "../../lib/document-flag";
import { usePortalLayer } from "./portal-host";
import { useKeyboardDismissOnDrag } from "../../hooks/useKeyboardDismissOnDrag";

/**
 * Where a closed dialog's focus goes back to. Radix returns it to the
 * trigger with a plain `focus()`, which scrolls the trigger's scroll box to
 * the trigger's layout position (a ribbon control sticky inside the
 * document's scroller: the page jumped on every close). The wrapper returns
 * focus itself without scrolling, under Radix's own rule: not after the user
 * interacted outside a non-modal dialog, never when a site handled
 * `onCloseAutoFocus` itself. Same mechanism as `components/ui/dropdown-menu`.
 */
const DialogFocusContext = React.createContext<{
  trigger: React.MutableRefObject<HTMLElement | null>;
  interactedOutside: React.MutableRefObject<boolean>;
  modal: boolean;
  /** Whether the dialog is open: the scrim is drawn here rather than by
   * Radix (see `DialogOverlay`), so it reads the state from this wrapper. */
  open: boolean;
} | null>(null);

const Dialog = ({
  modal = true,
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  const trigger = React.useRef<HTMLElement | null>(null);
  const interactedOutside = React.useRef(false);
  // An uncontrolled dialog (opened by its DialogTrigger) keeps its state
  // here, where the scrim can see it; Radix is always driven controlled.
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const value = React.useMemo(
    () => ({ trigger, interactedOutside, modal, open }),
    [modal, open],
  );
  return (
    <DialogFocusContext.Provider value={value}>
      <DialogPrimitive.Root
        modal={modal}
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DialogFocusContext.Provider>
  );
};

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => {
  const focus = React.useContext(DialogFocusContext);
  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      if (focus) focus.trigger.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [focus, ref],
  );
  return <DialogPrimitive.Trigger {...props} ref={setRef} />;
});
DialogTrigger.displayName = DialogPrimitive.Trigger.displayName;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;






















const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    /** The dialog's content: scrolling inside it stays free. */
    contentRef?: React.RefObject<HTMLElement | null>;
    /** Its fade-in waits with the content's (see `useEntranceHold`). */
    entranceHeld?: boolean;
  }
>(({ className, style, contentRef, entranceHeld = false, ...props }, ref) => {
  const dialog = React.useContext(DialogFocusContext);
  const open = dialog?.open ?? true;
  return (
    <RemoveScroll
      ref={ref as React.Ref<HTMLElement>}
      forwardProps
      allowPinchZoom
      removeScrollBar={false}
      shards={contentRef ? [contentRef] : undefined}
    >
      <div
        data-state={open ? "open" : "closed"}
        data-entrance-hold={entranceHeld ? "" : undefined}
        className={cn(
          "fixed inset-0 z-50 bg-black/25 backdrop-blur-sm data-[state=open]:duration-[220ms] data-[state=closed]:duration-[160ms] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          ENTRANCE_HOLD_CLASS,
          className,
        )}
        // A modal dialog makes the page outside it inert (body
        // pointer-events: none); the scrim still takes the press that
        // dismisses the dialog, as Radix's overlay did.
        style={{ pointerEvents: "auto", ...style }}
        {...props}
      />
    </RemoveScroll>
  );
});
DialogOverlay.displayName = "DialogOverlay";

/**
 * A pointer that lands in another modal layer is not a click outside this
 * dialog. Radix only knows the layers in its own React tree; a confirmation or
 * an editor's native command card opened over this dialog from elsewhere is
 * outside it, and pressing that layer's button used to dismiss this dialog as
 * well.
 */
const OTHER_MODAL_LAYER = '[aria-modal="true"], [data-modal-layer], .app-modal-overlay';

function landsInAnotherModalLayer(event: Event & { detail?: { originalEvent?: Event } }): boolean {
  const target = event.detail?.originalEvent?.target ?? event.target;
  return target instanceof Element && target.closest(OTHER_MODAL_LAYER) !== null;
}
















function useEntranceHold(open: boolean): boolean {
  // Held anew on every open: the wrapper outlives a close (only Radix's
  // content unmounts), and a hold kept from the first open let every later
  // open pop in.
  const [held, setHeld] = React.useState(open);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setHeld(true);
  }
  React.useEffect(() => {
    if (!open) return;
    const start = performance.now();
    let frame = 0;
    let previous = -1;
    let frames = 0;
    const tick = (now: number) => {
      frames += 1;
      const flowing = frames >= 2 && previous >= 0 && now - previous < 50;
      if (flowing || now - start > 700) {
        setHeld(false);
        return;
      }
      previous = now;
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  return held && open;
}

/** The class that pauses a held entrance; `!` outranks a skin's own
 * `animation` shorthand (the notebook sheet's doubled-class rule). */
const ENTRANCE_HOLD_CLASS = "data-[entrance-hold]:![animation-play-state:paused]";

/** While a modal dialog is shown, the page knows it (an attribute on
 * <html>): floating cards such as a worksheet's comment card step under it
 * instead of over its buttons (live audit S-084). */
function ModalDialogOpenFlag() {
  React.useEffect(() => holdDocumentFlag(DOCUMENT_FLAGS.modalDialogOpen), []);
  return null;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    container?: HTMLElement | null;
    showCloseButton?: boolean;
    /** Test id of the dimmed overlay behind the card. */
    overlayTestId?: string;
    /** "none" leaves the card's look (edge, fill, shadow, padding, radius) to
     * the caller, as the Office dialog chrome draws it; placement and the
     * open/close motion stay. */
    skin?: "console" | "none";
    /** Under a finger the console card grows a quarter as one region
     * (styles/touch-sizing.css); false keeps a card the editor draws for
     * itself (the immersive reader) as drawn. */
    touchScale?: boolean;
  }
>(
  (
    {
      className,
      children,
      container,
      showCloseButton = true,
      overlayTestId,
      skin = "console",
      touchScale = true,
      onPointerDownOutside,
      onInteractOutside,
      onEscapeKeyDown,
      onCloseAutoFocus,
      onTouchStart,
      onTouchMove,
      ...props
    },
    ref,
  ) => {
    const t = useTranslations("common");
    const focus = React.useContext(DialogFocusContext);
    const modal = focus?.modal ?? true;
    const entranceHeld = useEntranceHold(focus?.open ?? true);
    // The content node, for the scrim's scroll lock to leave scrolling
    // inside it free (Radix's overlay read the same node from its context).
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const setContentRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    // iPad: scrolling a dialog closes its keyboard instead of being pulled
    // back to the focused field.
    const keyboardDismiss = useKeyboardDismissOnDrag();
    const layer = usePortalLayer();
    // Resolved on every render, not memoised: a dialog host that outlives
    // the page (the profile home in the workspace layout) kept the console
    // element of the page it mounted on, and after a client navigation that
    // node was detached — the dialog then opened into a node outside the
    // document (Radix: no title found, aria-hidden "not contained inside
    // body").
    const portalContainer: HTMLElement | undefined =
      typeof container !== "undefined"
        ? container ?? undefined
        : layer
          ? // Opened from a layer that sits over the page (a standalone
            // window layer): the dialog stays in it, or it would open under
            // its opener.
            layer
          : typeof document === "undefined"
            ? undefined
            : ((document.querySelector(
                "[data-theme='console']",
              ) as HTMLElement | null) ?? undefined);

    return (
      <DialogPortal container={portalContainer}>
        {modal ? (
          <DialogOverlay
            data-testid={overlayTestId}
            contentRef={contentRef}
            entranceHeld={entranceHeld}
          />
        ) : null}
        <DialogPrimitive.Content
          ref={setContentRef}
          data-entrance-hold={entranceHeld ? "" : undefined}
          data-touch-scale={
            skin === "console" && touchScale ? "region" : undefined
          }
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] data-[state=open]:duration-[220ms] data-[state=closed]:duration-[160ms] data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.975] data-[state=open]:zoom-in-[0.965] data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2",
            ENTRANCE_HOLD_CLASS,
            skin === "console" &&
              "gap-4 border border-white/40 bg-[var(--glass-float-bg)] [-webkit-backdrop-filter:var(--glass-float-blur)] [backdrop-filter:var(--glass-float-blur)] px-4 sm:px-6 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(255,255,255,0.3)] sm:rounded-lg dark:border-[var(--console-border)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]",
            className,
          )}
          onPointerDownOutside={(event) => {
            onPointerDownOutside?.(event);
            if (!event.defaultPrevented && landsInAnotherModalLayer(event)) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            onInteractOutside?.(event);
            if (!event.defaultPrevented && landsInAnotherModalLayer(event)) event.preventDefault();
            if (focus && !focus.modal && !event.defaultPrevented) focus.interactedOutside.current = true;
          }}
          // Focus goes back to the trigger without scrolling (see
          // `DialogFocusContext`); Radix's own scrolling return is pre-empted.
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented || !focus) return;
            event.preventDefault();
            if (!focus.interactedOutside.current) focus.trigger.current?.focus({ preventScroll: true });
            focus.interactedOutside.current = false;
          }}
          onTouchStart={(event) => {
            keyboardDismiss.onTouchStart(event);
            onTouchStart?.(event);
          }}
          onTouchMove={(event) => {
            keyboardDismiss.onTouchMove(event);
            onTouchMove?.(event);
          }}
          onEscapeKeyDown={(event) => {
            // Escape inside a report shown over this dialog closes that
            // report, not the dialog (and its draft) behind it.
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("[data-window-notice-in-modal]")
            ) {
              event.preventDefault();
              return;
            }
            onEscapeKeyDown?.(event);
          }}
          {...props}
        >
          {modal ? <ModalDialogOpenFlag /> : null}
          {children}
          {showCloseButton ? (
            
            // dialog closes by a press on the scrim around it, like the
            // sharing sheet). Assistive tech still needs a way out that does
            // not depend on pointing at the scrim.
            <DialogPrimitive.Close className="sr-only">
              {t("dialog.close")}
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    /** "none" leaves the text's size and colour to the caller. */
    skin?: "console" | "none";
  }
>(({ className, skin = "console", ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(skin === "console" && "text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
