"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useContext, type ReactNode } from "react";

import { installOfficeDialogFit } from "../../lib/office-dialog-fit";
import { installOfficeDialogMotion } from "../../lib/office-dialog-motion";

import "./OfficeDialogChrome.css";

// A dialog's exit is played by one document-wide observer (the entrance is
// plain CSS), and another keeps a dialog inside the part of its window in
// view; every editor that draws this chrome gets both by loading it.
installOfficeDialogMotion();
installOfficeDialogFit();

/**
 * Office dialog chrome — the shared look of Office-style command dialogs.
 *
 * One stylesheet (OfficeDialogChrome.css) and the class names below. A dialog
 * opts in by putting {@link officeDialogClassName} on its card and the part
 * classes on its title, fields and buttons; the stylesheet then gives every
 * card the same title row, tab strip, fields, footer and buttons in light and
 * dark. It carries no behaviour: focus, keyboard, positioning and backdrop
 * stay with whoever renders the card (OfficeDialogShell, or a native-window
 * card centred by `.native-window__modal-dialog`).
 *
 * `OfficeDialogShell` switches to this chrome when an
 * {@link OfficeDialogChromeProvider} is above it, so an editor adopts it for
 * every shell dialog it renders with one provider and no per-call change.
 */

export type OfficeDialogSize = "sm" | "md" | "lg" | "xl" | "xxl";

/** The accent family a dialog borrows from the editor that opened it. */
export type OfficeDialogTone =
  | "neutral"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "code";

export const officeDialogParts = {
  form: "office-dialog__form",
  header: "office-dialog__header",
  title: "office-dialog__title",
  description: "office-dialog__description",
  close: "office-dialog__close",
  tabs: "office-dialog__tabs",
  tab: "office-dialog__tab",
  body: "office-dialog__body",
  group: "office-dialog__group",
  sectionTitle: "office-dialog__section-title",
  field: "office-dialog__field",
  row: "office-dialog__row",
  label: "office-dialog__label",
  hint: "office-dialog__hint",
  check: "office-dialog__check",
  list: "office-dialog__list",
  listItem: "office-dialog__list-item",
  /** A stack of alternatives to pick one from (Recommended Charts). */
  choices: "office-dialog__choices",
  /** One alternative: a selectable row holding its radio, never a card. */
  choice: "office-dialog__choice",
  /** An opaque well for content the dialog shows: a preview, a sample. */
  well: "office-dialog__well",
  /** A data table inside a well (a data preview): hairline cell rules, muted
   * header cells; `data-selected` / `data-skipped` on a cell tint it. */
  table: "office-dialog__table",
  /** A number box with its unit written beside it ("0 厘米", "100 % 字高"):
   * the box yields its width to the column, the unit keeps its own. */
  measure: "office-dialog__measure",
  /** A number box with its step buttons inside one field (Insert Table). */
  stepper: "office-dialog__stepper",
  /** A step button inside a stepper: an icon, no frame of its own. */
  stepperButton: "office-dialog__stepper-button",
  /** A field with an icon inside its one frame (a URL box). */
  inputGroup: "office-dialog__input-group",
  /** A field holding a formula or code: set in a monospaced face. */
  mono: "office-dialog__mono",
  message: "office-dialog__message",
  error: "office-dialog__error",
  footer: "office-dialog__footer",
  footerStart: "office-dialog__footer-start",
  button: "office-dialog__button",
  primaryButton: "office-dialog__button office-dialog__button--primary",
  compactButton: "office-dialog__button office-dialog__button--compact",
  /** A bare icon command in a row (an eye, a remove cross). */
  iconButton: "office-dialog__icon-button",
  /** A text command drawn as a link (Help on this function). */
  link: "office-dialog__link",
  /** A task pane's scrolling content under its fixed title row. */
  paneBody: "office-dialog__pane-body",
  /** A touch-size row's native checkbox or radio: an invisible 44px hit area
   * over a drawn `mark`. Exempt from the chrome's 14px native sizing and its
   * disabled fade, which would shrink or reveal the hit area. */
  markInput: "office-dialog__mark-input",
  /** The drawn box (or, with `data-shape="radio"`, the ring and dot) right
   * after a `markInput`, in the chrome's control and accent colours. */
  mark: "office-dialog__mark",
} as const;

export function officeDialogClassName({
  tone = "neutral",
  size,
  modal = false,
  pane = false,
}: {
  readonly tone?: OfficeDialogTone;
  readonly size?: OfficeDialogSize;
  /** A native-window card: centred by `.native-window__modal-dialog`. */
  readonly modal?: boolean;
  /** A task pane docked beside the sheet (placed by its host). */
  readonly pane?: boolean;
} = {}): string {
  return [
    modal ? "native-window__modal-dialog" : null,
    "office-dialog",
    pane ? "office-dialog--pane" : null,
    tone === "neutral" ? null : `office-dialog--tone-${tone}`,
    size ? `office-dialog--${size}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The class list of a spreadsheet task pane (Fields, Selection, Navigation). */
export function spreadsheetPaneClassName(): string {
  return officeDialogClassName({ tone: "spreadsheet", pane: true });
}

/** The class list of a spreadsheet command dialog's centred card. */
export function spreadsheetDialogClassName(size?: OfficeDialogSize): string {
  return officeDialogClassName({ tone: "spreadsheet", size, modal: true });
}

/** The class list of a slide editor command dialog's centred card. */
export function presentationDialogClassName(size?: OfficeDialogSize): string {
  return officeDialogClassName({ tone: "presentation", size, modal: true });
}

/** The class list of a document editor command dialog's centred card. */
export function documentDialogClassName(size?: OfficeDialogSize): string {
  return officeDialogClassName({ tone: "document", size, modal: true });
}

const OfficeDialogChromeContext = createContext<OfficeDialogTone | null>(null);

export function OfficeDialogChromeProvider({
  tone,
  children,
}: {
  readonly tone: OfficeDialogTone;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <OfficeDialogChromeContext.Provider value={tone}>
      {children}
    </OfficeDialogChromeContext.Provider>
  );
}

/** The tone of the enclosing provider, or null outside one. */
export function useOfficeDialogChrome(): OfficeDialogTone | null {
  return useContext(OfficeDialogChromeContext);
}
