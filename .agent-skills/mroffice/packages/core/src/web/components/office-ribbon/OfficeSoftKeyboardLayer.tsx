"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";

import { ChevronDown, Keyboard } from "./icons/houseIcons";
import {
  hideSoftKeyboard,
  watchSoftKeyboard,
  type SoftKeyboardState,
} from "../../lib/soft-keyboard";

import styles from "./OfficeSoftKeyboardLayer.module.css";














export function OfficeSoftKeyboardLayer({
  rootRef,
  children,
  testId = "office-soft-keyboard-bar",
}: {
  rootRef: RefObject<HTMLElement | null>;
  children?: ReactNode;
  testId?: string;
}) {
  const t = useTranslations("console-notebooks");
  const [keyboard, setKeyboard] = useState<SoftKeyboardState>({ inset: 0, keyboardTop: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return watchSoftKeyboard(root, setKeyboard);
  }, [rootRef]);

  if (keyboard.inset === 0 || typeof document === "undefined") return null;
  const label = t("toolbar.softKeyboardHide");
  return createPortal(
    <div
      className={`floating-toolbar ${styles.bar}`}
      role="toolbar"
      aria-label={label}
      data-testid={testId}
      style={{ top: keyboard.keyboardTop }}
      // the field keeps the focus (and the keyboard) while a key is pressed
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
      <button
        type="button"
        className={`floating-toolbar-btn ${styles.key}`}
        aria-label={label}
        title={label}
        data-testid={`${testId}-hide`}
        onClick={() => hideSoftKeyboard()}
      >
        <span className={styles.hideGlyph} aria-hidden>
          <Keyboard size={18} />
          <ChevronDown size={10} />
        </span>
      </button>
    </div>,
    document.body,
  );
}

/** One extra key for the bar (`children` above): the bar's own face and
 *  44 px target; it never takes the focus from the field. */
export function OfficeSoftKeyboardKey({
  name,
  onPress,
  children,
  testId,
}: {
  name: string;
  onPress: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`floating-toolbar-btn ${styles.key} ${styles.extraKey}`}
      aria-label={name}
      title={name}
      data-testid={testId}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
