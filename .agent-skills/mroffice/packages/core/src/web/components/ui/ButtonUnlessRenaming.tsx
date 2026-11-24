/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ButtonHTMLAttributes, Ref } from "react";

type ButtonUnlessRenamingProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The row's name is an open rename field right now. */
  renaming: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * A row's main button (a folder, a file, a Selection Pane item) that steps
 * aside while its name is being edited in place.
 *
 * A text field inside a button is not allowed content, and browsers treat a
 * key typed in it as a press on the button: Space released in the name
 * clicked the button, so renaming a folder opened it, renaming a file opened
 * the file and renaming a Selection Pane item selected the object. A press
 * dragged inside the field could also start the row's drag. While renaming,
 * the same box (class, style, title, data attributes) is drawn as a plain
 * element with none of the button's handlers; the field is its only control.
 */
export function ButtonUnlessRenaming({
  renaming,
  children,
  ref,
  ...props
}: ButtonUnlessRenamingProps) {
  if (!renaming) {
    return (
      <button ref={ref} {...props}>
        {children}
      </button>
    );
  }
  const passive: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      key === "className" ||
      key === "style" ||
      key === "title" ||
      key === "id" ||
      key.startsWith("data-")
    ) {
      passive[key] = value;
    }
  }
  return (
    <div {...passive} data-renaming="true">
      {children}
    </div>
  );
}
