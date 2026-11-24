/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
function firstTypeset(root: Element | null): Element | null {
  return root?.querySelector(".katex-html") ?? root?.querySelector(".katex") ?? null;
}

function centreOf(rect: DOMRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/**
 * The offset that moves the editor's formula onto the typeset one, in the
 * wrapper's own pixels (screen pixels over its scale: the page's zoom).
 * A display equation is centred, so it is matched on its centre; one among words
 * starts where it starts, and grows to the right as the words after it will.
 */
export function equationEditorOffset(
  typeset: DOMRect,
  editing: DOMRect,
  scale: number,
  centred: boolean,
): { x: number; y: number } {
  const target = centreOf(typeset);
  const held = centreOf(editing);
  const over = scale > 0 ? scale : 1;
  return {
    x: (centred ? target.x - held.x : typeset.left - editing.left) / over,
    y: (target.y - held.y) / over,
  };
}

/** Float `editor` over `preview`, which stays in the line unseen. Returns the undoing. */
export function holdEquationInPlace(wrapper: HTMLElement, preview: HTMLElement, editor: HTMLElement): () => void {
  preview.style.visibility = "hidden";
  Object.assign(editor.style, { position: "absolute", left: "0", top: "0", margin: "0", zIndex: "3" });
  wrapper.appendChild(editor);
  let offset = { x: 0, y: 0 };
  let frame = 0;
  const align = () => {
    frame = 0;
    if (!editor.isConnected) return;
    const typeset = firstTypeset(preview) ?? preview;
    const reference = editor.querySelector(".visual-math-editor__size-reference");
    const host = editor.querySelector(".visual-math-editor__field-host") ?? editor;
    const editing = firstTypeset(reference) ?? host;
    const box = typeset.getBoundingClientRect();
    const held = editing.getBoundingClientRect();
    if (box.width <= 0 && box.height <= 0) return;
    const scale = wrapper.offsetWidth > 0 ? wrapper.getBoundingClientRect().width / wrapper.offsetWidth : 1;
    const centred = getComputedStyle(wrapper).display === "block";
    const move = equationEditorOffset(box, held, scale, centred);
    if (Math.abs(move.x) < 0.05 && Math.abs(move.y) < 0.05) return;
    offset = { x: offset.x + move.x, y: offset.y + move.y };
    editor.style.transform = `translate(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px)`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(align);
  };
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  watch?.observe(editor);
  watch?.observe(preview);
  align();
  schedule();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    watch?.disconnect();
    preview.style.removeProperty("visibility");
  };
}
