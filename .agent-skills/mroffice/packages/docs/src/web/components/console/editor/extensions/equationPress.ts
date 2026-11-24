/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word opens an equation where it is pressed: a primary-button press on the
 * rendered mathematics of an equation that is not selected opens its in-place
 * editor with the caret at the pressed point, and a drag from there selects
 * part of it. The document's own pointer gestures on equations (selecting a
 * range across them, moving a selected one) must stand aside for that press;
 * they keep an equation that is ALREADY selected, which a drag moves.
 */
export function pressOpensEquationEditor(
  target: EventTarget | null,
  event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
): boolean {
  if (!(target instanceof Element)) return false;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return false;
  }
  const preview = target.closest(".math-block-preview, .inline-math-preview");
  if (!preview) return false;
  const wrapper = preview.closest(".math-block-wrapper, .inline-math-wrapper");
  return (
    wrapper !== null &&
    !wrapper.hasAttribute("data-selected") &&
    !wrapper.hasAttribute("data-editing")
  );
}

/**
 * A drag that began beside an equation, on the empty part of its line, has
 * reached the mathematics: the equation opens its editor and the drag goes
 * on selecting INSIDE it, from the edge on the side it began (Word's math
 * zone fills the equation's line, so the press was already at its edge).
 * Dispatched on the equation's node view host.
 */
export const EQUATION_POINTER_SELECT_EVENT = "mrai:equation-pointer-select";

export interface EquationPointerSelectDetail {
  readonly x: number;
  readonly y: number;
  readonly edge: "start" | "end";
}

/**
 * A drag that selects inside an open equation has left it: the editor
 * closes and the document takes the drag over, holding the whole equation
 * and everything to the pointer (Word: a selection that leaves a math zone
 * takes all of it). Dispatched on the editor's root (`view.dom`).
 */
export const EQUATION_DRAG_OUT_EVENT = "mrai:equation-drag-out";

export interface EquationDragOutDetail {
  readonly pos: number;
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
}
