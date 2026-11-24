/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect } from "react";

export const TOOLBAR_STACK_BLOCK_SIZE_PROPERTY = "--note-editor-toolbar-stack-block-size";
export const SCROLLPORT_BLOCK_SIZE_PROPERTY = "--note-editor-scrollport-block-size";
export const RIBBON_FOCUS_ATTRIBUTE = "data-ribbon-focus";

/**
 * The document ribbon is sticky at the top of the editor's scrollport, so the
 * scrollport's `scroll-padding-top` must keep carets and navigation targets
 * clear of exactly the ribbon (note-editor.css). A fixed 30vh reserve went far
 * below the ribbon, and the browser's drag-selection autoscroll honours that
 * padding: an upward drag with the pointer on visible text under the ribbon
 * kept scrolling the page, and the selection head raced through the document
 * after it. Publish the ribbon's real height; it wraps, collapses and grows.
 */
export function useScrollportToolbarInset(stack: HTMLElement | null): void {
  useLayoutEffect(() => {
    const scrollport = stack?.closest<HTMLElement>(".note-window-scroll");
    if (!stack || !scrollport) return;
    const publish = () => {
      const next = `${Math.ceil(stack.offsetHeight)}px`;
      if (scrollport.style.getPropertyValue(TOOLBAR_STACK_BLOCK_SIZE_PROPERTY) !== next) {
        scrollport.style.setProperty(TOOLBAR_STACK_BLOCK_SIZE_PROPERTY, next);
      }
      // The scrollport's own height: what a pane that sticks under the
      // ribbon may fill. The viewport (100dvh) overstates it whenever the
      // editor is a window smaller than the browser's.
      const height = `${Math.floor(scrollport.clientHeight)}px`;
      if (scrollport.style.getPropertyValue(SCROLLPORT_BLOCK_SIZE_PROPERTY) !== height) {
        scrollport.style.setProperty(SCROLLPORT_BLOCK_SIZE_PROPERTY, height);
      }
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(stack);
    observer?.observe(scrollport);
    // A field in the ribbon sits inside that padding: while one has focus the
    // browser treats it as hidden behind the ribbon, and typing in it (an
    // indent, a spacing, a font size) or focusing it scrolled the page to
    // "reveal" it. Word keeps the page still, so the padding is off while
    // focus is in the ribbon.
    const onFocusIn = () => scrollport.setAttribute(RIBBON_FOCUS_ATTRIBUTE, "true");
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && stack.contains(next)) return;
      scrollport.removeAttribute(RIBBON_FOCUS_ATTRIBUTE);
    };
    stack.addEventListener("focusin", onFocusIn);
    stack.addEventListener("focusout", onFocusOut);
    if (stack.contains(stack.ownerDocument.activeElement)) onFocusIn();
    // A page wider than the window (a zoomed or landscape page) scrolls the
    // scrollport sideways, and the ribbon scrolled away with it: it is
    // sticky only at the top. Word's ribbon never moves, so the stack is
    // carried back by the same distance the page went. `translate` only while
    // the page is scrolled sideways: a translated box is the containing block
    // of fixed descendants, which none of the ribbon's need at rest.
    const holdInline = () => {
      const left = scrollport.scrollLeft;
      const next = left !== 0 ? `${left}px 0px` : "";
      if (stack.style.getPropertyValue("translate") === next) return;
      if (next) stack.style.setProperty("translate", next);
      else stack.style.removeProperty("translate");
    };
    holdInline();
    scrollport.addEventListener("scroll", holdInline, { passive: true });
    return () => {
      observer?.disconnect();
      scrollport.removeEventListener("scroll", holdInline);
      stack.style.removeProperty("translate");
      stack.removeEventListener("focusin", onFocusIn);
      stack.removeEventListener("focusout", onFocusOut);
      scrollport.removeAttribute(RIBBON_FOCUS_ATTRIBUTE);
      scrollport.style.removeProperty(TOOLBAR_STACK_BLOCK_SIZE_PROPERTY);
      scrollport.style.removeProperty(SCROLLPORT_BLOCK_SIZE_PROPERTY);
    };
  }, [stack]);
}
