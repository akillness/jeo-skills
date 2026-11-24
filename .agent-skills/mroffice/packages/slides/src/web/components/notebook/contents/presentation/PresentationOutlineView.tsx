"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's Outline View (View > Outline View; audit PPT-E012): the
 * thumbnail pane becomes the deck's text outline while the slide stays on the
 * right. PowerPoint for the web has no Outline view ("Choose the right view
 * for the task in PowerPoint"); this follows PowerPoint for the desktop.
 *
 * Microsoft Support, "Create and print a presentation in Outline view":
 *  - each slide is its number, a slide icon and its title, with the main text
 *    (the body placeholder's paragraphs, by level) under it; pictures, shapes
 *    and other graphics are not in the outline, only marked on the icon;
 *  - typing in the outline edits the slide; Enter starts a new line at the
 *    same level (on a title, a new slide); Tab demotes a line one level and
 *    Shift+Tab promotes it.
 *
 * A VIEW over the deck: every keystroke goes back through the editor's own
 * text writers (`onTitleChange`, `onBodyChange`, `onLevelChange`,
 * `onNewSlideAfter`), so undo, autosave and the canvas see ordinary edits.
 * A slide whose title or body is not plain editable text (an imported
 * native text body the editor keeps as-is) shows it read-only.
 */

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import styles from "./PresentationOutlineView.module.css";
import { isImeCompositionKey } from "@mrnote/core/web/lib/code-runner/editor-keys.ts";

export interface PresentationOutlineLine {
  readonly key: string;
  readonly text: string;
  readonly level: number;
}

export interface PresentationOutlineSlide {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly titleEditable: boolean;
  readonly lines: readonly PresentationOutlineLine[];
  /** The body placeholder takes edits (null: the slide has none). */
  readonly bodyEditable: boolean;
  /** Levels can change (the body keeps per-paragraph structure). */
  readonly levelsEditable: boolean;
  readonly hasGraphics: boolean;
  readonly hidden: boolean;
}

export interface PresentationOutlineViewLabels {
  readonly region: string;
  readonly untitled: string;
  readonly slide: (number: number) => string;
}

export interface PresentationOutlineViewProps {
  readonly slides: readonly PresentationOutlineSlide[];
  readonly activeId: string | null;
  readonly readOnly: boolean;
  readonly labels: PresentationOutlineViewLabels;
  readonly onActivate: (slideId: string) => void;
  /** `caretAfter`: where the caret stands in `text` after the change (the
   *  room writes the key there, not where a comparison of the two texts
   *  would put it -- TRIAGE 49: "Hel" -> "Hell" is a guess without it). */
  readonly onTitleChange: (slideId: string, text: string, caretAfter?: number) => void;
  /** The body's paragraphs as plain lines, one per paragraph. */
  /** `caretAfter`: the caret in the lines joined by "\n" (see onTitleChange). */
  readonly onBodyChange: (slideId: string, lines: readonly string[], caretAfter?: number) => void;
  readonly onLevelChange: (slideId: string, lineIndex: number, delta: 1 | -1) => void;
  /** Enter on a title: a new slide after it; returns its id. */
  readonly onNewSlideAfter: (slideId: string) => string | null;
  readonly onContextMenu: (slideId: string, x: number, y: number) => void;
}

/** Where the caret should land after a structural edit. */
type PendingFocus = { slideId: string; line: number | "title"; caret: number };

export function PresentationOutlineView({
  slides,
  activeId,
  readOnly,
  labels,
  onActivate,
  onTitleChange,
  onBodyChange,
  onLevelChange,
  onNewSlideAfter,
  onContextMenu,
}: PresentationOutlineViewProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  const fieldFor = (slideId: string, line: number | "title") =>
    rootRef.current?.querySelector<HTMLInputElement>(
      `[data-outline-slide="${CSS.escape(slideId)}"][data-outline-line="${line}"]`,
    ) ?? null;

  // After an edit that adds or removes a line, put the caret where Office
  // leaves it once the new field exists.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const field = fieldFor(pending.slideId, pending.line);
    if (!field) return;
    pendingFocusRef.current = null;
    field.focus();
    const caret = Math.min(pending.caret, field.value.length);
    field.setSelectionRange?.(caret, caret);
  });

  // Entering the view puts the caret on the current slide's title.
  useEffect(() => {
    if (activeId) fieldFor(activeId, "title")?.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry only
  }, []);

  /** Every field in reading order, for Up / Down across slides. */
  const moveVertically = (from: HTMLInputElement, delta: 1 | -1) => {
    const fields = Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>("[data-outline-line]") ?? [],
    );
    const at = fields.indexOf(from);
    const next = fields[at + delta];
    if (!next) return false;
    next.focus();
    const caret = Math.min(from.selectionStart ?? 0, next.value.length);
    next.setSelectionRange?.(caret, caret);
    return true;
  };

  const onTitleKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    slide: PresentationOutlineSlide,
  ) => {
    // The keys of an IME composing in the title are the IME's: its Enter
    // confirms the words (it made a new slide) and its arrows walk the
    // candidates (they left the line).
    if (isImeCompositionKey(event.nativeEvent)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (readOnly) return;
      const created = onNewSlideAfter(slide.id);
      if (created) pendingFocusRef.current = { slideId: created, line: "title", caret: 0 };
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (moveVertically(event.currentTarget, event.key === "ArrowDown" ? 1 : -1)) {
        event.preventDefault();
      }
    }
  };

  const onLineKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    slide: PresentationOutlineSlide,
    index: number,
  ) => {
    // The IME's keys, as in a title.
    if (isImeCompositionKey(event.nativeEvent)) return;
    const field = event.currentTarget;
    const lines = slide.lines.map((line) => line.text);
    if (event.key === "Tab") {
      // Tab never leaves the outline from a line: it demotes / promotes.
      event.preventDefault();
      if (readOnly || !slide.levelsEditable) return;
      onLevelChange(slide.id, index, event.shiftKey ? -1 : 1);
      pendingFocusRef.current = {
        slideId: slide.id,
        line: index,
        caret: field.selectionStart ?? 0,
      };
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (readOnly || !slide.bodyEditable) return;
      const caret = field.selectionStart ?? field.value.length;
      const next = [
        ...lines.slice(0, index),
        field.value.slice(0, caret),
        field.value.slice(caret),
        ...lines.slice(index + 1),
      ];
      onBodyChange(slide.id, next);
      pendingFocusRef.current = { slideId: slide.id, line: index + 1, caret: 0 };
      return;
    }
    if (
      event.key === "Backspace" &&
      field.selectionStart === 0 &&
      field.selectionEnd === 0 &&
      index > 0 &&
      !readOnly &&
      slide.bodyEditable
    ) {
      event.preventDefault();
      const previous = lines[index - 1] ?? "";
      const next = [
        ...lines.slice(0, index - 1),
        previous + field.value,
        ...lines.slice(index + 1),
      ];
      onBodyChange(slide.id, next);
      pendingFocusRef.current = {
        slideId: slide.id,
        line: index - 1,
        caret: previous.length,
      };
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (moveVertically(field, event.key === "ArrowDown" ? 1 : -1)) event.preventDefault();
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.outline}
      role="region"
      aria-label={labels.region}
      data-testid="presentation-outline-view"
    >
      {slides.map((slide) => (
        <div
          key={slide.id}
          className={styles.slide}
          data-current={slide.id === activeId ? "true" : undefined}
          data-hidden={slide.hidden ? "true" : undefined}
          data-testid="presentation-outline-slide"
          onContextMenu={(event) => {
            if ((event.target as HTMLElement).closest("input")) return;
            event.preventDefault();
            onContextMenu(slide.id, event.clientX, event.clientY);
          }}
        >
          <div className={styles.titleRow}>
            <span className={styles.number}>{slide.number}</span>
            <span
              className={styles.icon}
              data-graphics={slide.hasGraphics ? "true" : undefined}
              aria-hidden="true"
              data-testid={slide.hasGraphics ? "presentation-outline-graphic-marker" : undefined}
            />
            <input
              className={styles.title}
              value={slide.title}
              placeholder={labels.untitled}
              readOnly={readOnly || !slide.titleEditable}
              aria-label={labels.slide(slide.number)}
              data-outline-slide={slide.id}
              data-outline-line="title"
              data-testid="presentation-outline-slide-title"
              onFocus={() => onActivate(slide.id)}
              onChange={(event) => onTitleChange(slide.id, event.target.value, event.target.selectionStart ?? undefined)}
              onKeyDown={(event) => onTitleKeyDown(event, slide)}
            />
          </div>
          {slide.lines.map((line, index) => (
            <input
              key={line.key}
              className={styles.line}
              style={{ marginInlineStart: 34 + line.level * 18 }}
              value={line.text}
              readOnly={readOnly || !slide.bodyEditable}
              aria-label={`${labels.slide(slide.number)}, ${index + 1}`}
              data-level={line.level}
              data-outline-slide={slide.id}
              data-outline-line={index}
              data-testid="presentation-outline-line"
              onFocus={() => onActivate(slide.id)}
              onChange={(event) => {
                const next = slide.lines.map((entry) => entry.text);
                next[index] = event.target.value;
                const caret = event.target.selectionStart;
                const lineStart = next.slice(0, index).reduce((length, text) => length + text.length + 1, 0);
                onBodyChange(slide.id, next, caret === null ? undefined : lineStart + caret);
              }}
              onKeyDown={(event) => onLineKeyDown(event, slide, index)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
