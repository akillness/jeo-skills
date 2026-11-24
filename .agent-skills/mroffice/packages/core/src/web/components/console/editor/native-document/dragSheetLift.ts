/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export interface SheetLift {
  /** The drag went `dy` (screen px): the pages it leaves are drawn over the ones it goes to. */
  follow(dy: number): void;
  /** The drag ended: the pages go back to their order. */
  lower(): void;
}

const SHEET = "article[data-page-sheet]";
/** Over every order the pages hold at rest (floatingTextBoxLayout
 * `orderOverhangingPages`, at most twice the page count), inside the paged
 * content's own stacking context. */
const DRAG_LIFT_Z = 1_000_000;

function sheetSelector(sheet: HTMLElement): string | null {
  const parent = sheet.parentElement;
  if (!parent) return null;
  const index = Array.prototype.indexOf.call(parent.children, sheet);
  if (index < 0) return null;
  const scope = parent.classList.contains("note-editor-content") ? ".note-editor-content" : "*";
  return `${scope} > ${SHEET}:nth-child(${index + 1})`;
}

export function liftSheetsDuringDrag(elements: Iterable<Element | null | undefined>): SheetLift {
  const sheets: HTMLElement[] = [];
  for (const element of elements) {
    const sheet = element?.closest?.(SHEET);
    if (sheet instanceof HTMLElement && !sheets.includes(sheet)) sheets.push(sheet);
  }
  // In page order.
  sheets.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const selectors = sheets.map(sheetSelector);
  const head = sheets[0]?.ownerDocument.head ?? null;
  let style: HTMLStyleElement | null = null;
  let down: boolean | null = null;
  const follow = (dy: number) => {
    const next = dy >= 0;
    if (next === down || !head) return;
    down = next;
    const rules = selectors.flatMap((selector, index) =>
      // Raised, and drawn whole: a sheet is `content-visibility: auto`
      // off WebKit (note-editor.css), which contains its paint, and the part
      // of a picture carried past the seam was clipped away under the pointer
      
      selector
        ? [`${selector} { z-index: ${DRAG_LIFT_Z + (next ? selectors.length - 1 - index : index)} !important; content-visibility: visible !important; }`]
        : [],
    );
    if (rules.length === 0) return;
    if (!style) {
      style = head.ownerDocument.createElement("style");
      style.setAttribute("data-drag-sheet-lift", "");
      head.appendChild(style);
    }
    style.textContent = rules.join("\n");
  };
  follow(0);
  let lowered = false;
  return {
    follow,
    lower() {
      if (lowered) return;
      lowered = true;
      style?.remove();
      style = null;
    },
  };
}
