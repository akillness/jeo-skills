"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";

import styles from "./PdfSurfaceRibbon.module.css";

/** Menus, dialogs and pickers a command inside the panel opens are portalled
 * elsewhere; a press in one of them is not a press outside the panel. */
const NESTED_SURFACE_SELECTOR =
  "[data-radix-popper-content-wrapper], [role='menu'], [role='dialog'], [role='alertdialog'], [role='listbox']";

/**
 * A collapsed group (pdfRibbonFit): one large button with the group's icon
 * and name that opens the group, as it stands on the band, in a panel under
 * it -- Office's collapsed ribbon group. A command run from the panel closes
 * it; one that opens a menu or a dialog of its own leaves it open under that.
 *
 * The panel is drawn in the ribbon's shell, outside the band (which clips),
 * inside a copy of the ribbon's own skin and surface, so its commands wear
 * exactly the faces they wear on the band.
 */
export function PdfRibbonGroupFlyout({
  children,
  icon,
  label,
  renderGroup,
  renderTrigger,
  testId,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
  /** The group's large button (PdfSurfaceRibbonCommand, passed in so this
   * file does not import the one that imports it). */
  renderTrigger: (props: {
    active: boolean;
    ariaExpanded: boolean;
    buttonRef: (node: HTMLButtonElement | null) => void;
    icon: ReactNode;
    label: string;
    onClick: () => void;
    testId: string | undefined;
  }) => ReactNode;
  /** The group as the band draws it, around the panel's commands. */
  renderGroup: (commands: ReactNode) => ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<{
    container: HTMLElement;
    skinClass: string;
    skinData: Record<string, string>;
    surfaceClass: string;
    surfaceData: Record<string, string>;
    surfaceStyle: string | null;
  } | null>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const toggle = useCallback(() => {
    const trigger = triggerRef.current;
    if (open || !trigger) {
      setOpen(false);
      return;
    }
    const shell = trigger.closest<HTMLElement>(".pdf-office-ribbon-shell");
    const skin = trigger.closest<HTMLElement>(".office-ribbon-skin");
    const surface = trigger.closest<HTMLElement>(
      "[data-office-home-density], [data-office-insert-surface]",
    );
    if (!shell || !skin || !surface) return;
    const data = (element: HTMLElement) =>
      Object.fromEntries(
        Array.from(element.attributes)
          .filter((attribute) => attribute.name.startsWith("data-") && attribute.name !== "data-testid")
          .map((attribute) => [attribute.name, attribute.value]),
      );
    setHost({
      container: shell,
      skinClass: skin.className,
      skinData: data(skin),
      surfaceClass: surface.className,
      surfaceData: data(surface),
      surfaceStyle: surface.getAttribute("style"),
    });
    setOpen(true);
  }, [open]);

  // Placed under its button: measured where it lands at the shell's origin,
  // then moved by the difference (the window may be moved or scaled by the
  // notebook canvas; this needs neither).
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!open || !panel || !trigger) return;
    panel.style.left = "0px";
    panel.style.top = "0px";
    const origin = panel.getBoundingClientRect();
    const scale = panel.offsetWidth > 0 ? origin.width / panel.offsetWidth : 1;
    const anchor = trigger.getBoundingClientRect();
    const view = document.documentElement.clientWidth;
    const left = Math.max(4, Math.min(anchor.left, view - origin.width - 4));
    panel.style.left = `${(left - origin.left) / scale}px`;
    panel.style.top = `${(anchor.bottom + 2 - origin.top) / scale}px`;
    panel.style.visibility = "visible";
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(NESTED_SURFACE_SELECTOR)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A menu of the panel's own closes first (it takes the key itself).
      if (document.activeElement?.closest(NESTED_SURFACE_SELECTOR)) return;
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <span className={styles.flyoutTrigger} data-pdf-ribbon-flyout-open={open || undefined}>
        {renderTrigger({
          active: open,
          ariaExpanded: open,
          buttonRef: (node) => {
            triggerRef.current = node;
          },
          icon: (
            <span className={styles.flyoutGlyph}>
              {icon}
              <OfficeSemanticIcon semanticId="menu.chevron.down" size={10} />
            </span>
          ),
          label,
          onClick: toggle,
          testId: testId ? `${testId}-collapsed` : undefined,
        })}
      </span>
      {open && host
        ? createPortal(
            <div
              ref={panelRef}
              className={styles.flyoutPanel}
              role="dialog"
              aria-label={label}
              data-testid={testId ? `${testId}-flyout` : undefined}
              style={{ visibility: "hidden" }}
              onClick={(event) => {
                // A command run from the panel closes it; one that opens a
                // menu, a dialog or a picker of its own leaves it open.
                const button = event.target instanceof Element ? event.target.closest("button") : null;
                if (!button || !panelRef.current?.contains(button)) return;
                if (button.getAttribute("aria-haspopup") || button.hasAttribute("aria-expanded")) return;
                window.setTimeout(() => close(false), 0);
              }}
            >
              <section className={host.skinClass} {...host.skinData}>
                <div
                  className={host.surfaceClass}
                  {...host.surfaceData}
                  ref={(node) => {
                    if (node && host.surfaceStyle !== null) node.setAttribute("style", host.surfaceStyle);
                  }}
                >
                  <div className="note-editor-ribbon-track">{renderGroup(children)}</div>
                </div>
              </section>
            </div>,
            host.container,
          )
        : null}
    </>
  );
}
