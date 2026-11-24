"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState } from "react";

import { OfficeTaskPane, officeTaskPaneParts } from "./OfficeTaskPane";

/**
 * The Alt Text task pane Word, Excel and PowerPoint open from Picture Format
 * > Alt Text or the object's "View Alt Text" (Microsoft Support, "Add
 * alternative text to a shape, picture, chart, SmartArt graphic, or other
 * object").
 *
 * Behaviour reproduced:
 *   - a docked, non-modal pane at the right of the window: the document
 *     stays editable behind it, and it follows the selection (select another
 *     object and the pane shows that object's description);
 *   - one description box, focused when the pane opens, with the guidance
 *     that one or two sentences describe the object and its context;
 *   - no OK or Cancel: every edit is written to the object as it is typed,
 *     and the pane's X (or Escape, where the editor closes panes on it)
 *     only closes it;
 *   - with nothing it can describe selected, the box is unavailable and the
 *     pane says what to select.
 *
 *   - "Mark as decorative" (`decorative`, for a host whose object model and
 *     file format carry the flag): checked, the description box is greyed
 *     but keeps its text, and unchecking brings that text back as the
 *     object's description.
 *
 * Office's "Generate a description for me" is not here. The host owns the object: `value` is the selected object's current
 * description, `targetKey` names that object (a new key reseeds the box), and
 * `onChange` writes each edit through the host's own authority check; it is
 * given the key the pane showed, so a host whose selection moved on before
 * the pane caught up writes nothing to an object the user was not looking at.
 */
export interface OfficeAltTextPaneProps {
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  /** `<prefix>-pane` and `<prefix>-pane-close`. */
  readonly testIdPrefix: string;
  readonly label: string;
  readonly hint: string;
  /** Guidance shown inside the empty description box (PowerPoint lists what
   * to describe there); none by default. */
  readonly placeholder?: string;
  /** Non-null when there is nothing to describe: the box is disabled and
   * this says why. */
  readonly unavailableMessage: string | null;
  readonly value: string;
  readonly targetKey: string | null;
  readonly onChange: (value: string, targetKey: string | null) => void;
  readonly maxLength: number;
  readonly inputTestId?: string;
  /** A new number puts the keyboard in the box (the ribbon command pressed
   * again while the pane is open). */
  readonly focusRequest?: number;
  readonly dockRight?: boolean;
  readonly className?: string;
  /** Office's "Mark as decorative". Leave it out when the host's object model
   * or file format cannot carry the flag. */
  readonly decorative?: OfficeAltTextPaneDecorative;
}

export interface OfficeAltTextPaneDecorative {
  readonly label: string;
  readonly checked: boolean;
  /** Shown instead of the hint while the object is marked decorative. */
  readonly hint: string;
  readonly onChange: (checked: boolean, targetKey: string | null) => void;
  readonly testId?: string;
}

export function OfficeAltTextPane({
  title,
  closeLabel,
  onClose,
  testIdPrefix,
  label,
  hint,
  placeholder,
  unavailableMessage,
  value,
  targetKey,
  onChange,
  maxLength,
  inputTestId,
  focusRequest,
  dockRight,
  className,
  decorative,
}: OfficeAltTextPaneProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // What the user typed: the host stores a tidied copy (trimmed, one line),
  // so the box keeps the raw keystrokes while the user is in it.
  const [draft, setDraft] = useState(value);
  const [draftKey, setDraftKey] = useState(targetKey);
  if (draftKey !== targetKey) {
    setDraftKey(targetKey);
    setDraft(value);
  }
  const markedDecorative = decorative?.checked === true;
  // A change from elsewhere (Undo, a collaborator) shows when the user is
  // not typing in the box. While the object is decorative the greyed box
  // keeps the text it had, whatever the host stores meanwhile.
  useEffect(() => {
    if (markedDecorative) return;
    if (
      typeof document !== "undefined" &&
      document.activeElement === inputRef.current
    ) {
      return;
    }
    setDraft(value);
  }, [markedDecorative, value]);

  useEffect(() => {
    if (focusRequest === undefined) return;
    const input = inputRef.current;
    if (input && !input.disabled) input.focus();
  }, [focusRequest]);

  const unavailable = unavailableMessage !== null;
  const hintText =
    unavailableMessage ?? (decorative?.checked ? decorative.hint : hint);
  return (
    <OfficeTaskPane
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      testIdPrefix={testIdPrefix}
      dockRight={dockRight}
      className={className}
    >
      <div className={officeTaskPaneParts.section}>
        <label className={officeTaskPaneParts.field}>
          {label}
          <textarea
            ref={inputRef}
            rows={6}
            className="w-full resize-y"
            value={unavailable ? "" : draft}
            maxLength={maxLength}
            placeholder={unavailable || markedDecorative ? undefined : placeholder}
            disabled={unavailable || markedDecorative}
            data-testid={inputTestId}
            onChange={(event) => {
              setDraft(event.target.value);
              onChange(event.target.value, targetKey);
            }}
          />
        </label>
        {decorative ? (
          <label className={officeTaskPaneParts.check}>
            <input
              type="checkbox"
              checked={markedDecorative}
              disabled={unavailable}
              data-testid={decorative.testId}
              onChange={(event) => {
                const checked = event.target.checked;
                decorative.onChange(checked, targetKey);
                // The description comes back with the box.
                if (!checked && draft !== value) onChange(draft, targetKey);
              }}
            />
            {decorative.label}
          </label>
        ) : null}
        {hintText ? <p className={officeTaskPaneParts.hint}>{hintText}</p> : null}
      </div>
    </OfficeTaskPane>
  );
}
