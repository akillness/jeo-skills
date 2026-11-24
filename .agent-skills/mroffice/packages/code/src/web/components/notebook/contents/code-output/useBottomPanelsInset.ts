/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, type RefObject } from "react";

/**
 * The run output floats over the editor's bottom edge, but the Debug and
 * Console panels stand in the same column under the editor, in the flow.
 * The lift is what lies between the editor (the column's stretching child)
 * and the column's bottom edge; it is published as `--code-output-below` on
 * the element, so the card (and the hidden output's pill) sits above those
 * panels instead of over them. Re-measured when a panel opens, closes or is
 * resized.
 */
export function useBottomPanelsInset(
  ref: RefObject<HTMLElement | null>,
  active = true,
): void {
  useLayoutEffect(() => {
    const node = ref.current;
    const column = node?.parentElement;
    if (!node || !column || !active) return;
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    const place = () => {
      let editor: HTMLElement | null = null;
      for (const child of Array.from(column.children)) {
        if (!(child instanceof HTMLElement) || child === node) continue;
        resize?.observe(child);
        const style = getComputedStyle(child);
        if (
          !editor &&
          style.display !== "none" &&
          style.position !== "absolute" &&
          style.position !== "fixed" &&
          Number.parseFloat(style.flexGrow) > 0
        ) {
          editor = child;
        }
      }
      const below = editor
        ? Math.max(
            0,
            Math.round(
              column.getBoundingClientRect().bottom -
                editor.getBoundingClientRect().bottom,
            ),
          )
        : 0;
      node.style.setProperty("--code-output-below", `${below}px`);
    };
    place();
    resize?.observe(column);
    // A panel mounting, unmounting or showing (`hidden`) under the editor.
    const mutations =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(place);
    mutations?.observe(column, {
      childList: true,
      subtree: false,
    });
    for (const child of Array.from(column.children)) {
      mutations?.observe(child, { attributes: true, attributeFilter: ["hidden"] });
    }
    return () => {
      resize?.disconnect();
      mutations?.disconnect();
      node.style.removeProperty("--code-output-below");
    };
  }, [ref, active]);
}
