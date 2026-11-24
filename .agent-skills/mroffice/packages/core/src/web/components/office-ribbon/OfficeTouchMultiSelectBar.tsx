"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";

import styles from "./OfficeTouchMultiSelectBar.module.css";

/**
 * The status bar of the touch multi-select mode (lib/touch-multi-select,
 * P-11): "n selected · Done". Done (or Escape) ends the mode and keeps the
 * selection, as PowerPoint for iPad leaves the objects selected.
 *
 * With `anchorRef` the bar floats over the bottom centre of that element (an
 * editor's window), portalled so no window clip or transform moves it;
 * without one it renders in place (a dialog's own toolbar).
 */
export function OfficeTouchMultiSelectBar({
  count,
  onDone,
  anchorRef,
  testId = "office-touch-multi-select-bar",
}: {
  count: number;
  onDone: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  testId?: string;
}) {
  const t = useTranslations("console-notebooks");
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    doneRef.current = onDone;
  });
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") doneRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      setPlace({
        left: rect.left + rect.width / 2,
        bottom: Math.min(rect.bottom, visibleBottom) - 16,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef]);

  const bar = (
    <div
      className={`floating-toolbar ${styles.bar}${anchorRef ? ` ${styles.floating}` : ""}`}
      role="status"
      aria-label={t("toolbar.touchMultiSelectLabel")}
      data-testid={testId}
      style={place ? { left: place.left, top: place.bottom } : undefined}
    >
      <span className={styles.count} data-testid={`${testId}-count`}>
        {t("toolbar.touchMultiSelectCount", { count })}
      </span>
      <button
        type="button"
        className={styles.done}
        data-testid={`${testId}-done`}
        onClick={() => doneRef.current()}
      >
        {t("toolbar.touchMultiSelectDone")}
      </button>
    </div>
  );
  if (!anchorRef) return bar;
  if (typeof document === "undefined" || !place) return null;
  return createPortal(bar, document.body);
}
