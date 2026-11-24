"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The stage for a small looping scene: a few shapes that act out, in three
 * or four seconds, what a control does or what an empty place is for (the
 * starter cards over the chat composer set the style).
 *
 * House rules, enforced here so every scene follows them:
 *   - a scene is decoration: aria-hidden, no text, never the only label
 *   - `play` says when it moves — "always" (a few on a page at most),
 *     "view" (only while on screen) or "hover" (only while its host
 *     control — the nearest button, link, menu item or
 *     [data-mini-scene-host] — is hovered or focused)
 *   - paused or stilled (reduced motion, the in-app switch) it must read as
 *     a finished picture: write each shape's CSS as its resting frame and
 *     animate FROM the hidden state, never park a shape at opacity 0
 *   - only transform, opacity and stroke-dashoffset move
 *   - a scene's keyframes live in its own CSS module (module keyframes are
 *     not shared between files)
 *
 * Colours: `--ink` (the scene's accent, from `tone` or the theme accent),
 * `--ink-soft`, `--paper`. Shared shapes: see MiniScene.module.css.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import styles from "./MiniScene.module.css";

export { styles as miniSceneStyles };

export function MiniScene({
  children,
  width = 112,
  height = 52,
  scale = 1,
  tone,
  play = "view",
  bare = false,
  className,
}: {
  children: ReactNode;
  /** The stage's native size; shapes are placed in these pixels. */
  width?: number;
  height?: number;
  /** Draws the native stage larger or smaller, proportions kept. */
  scale?: number;
  /** The scene's accent; the theme accent when omitted. */
  tone?: string;
  play?: "always" | "view" | "hover";
  /** No tinted ground behind the shapes. */
  bare?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [live, setLive] = useState(play === "always");

  useEffect(() => {
    const node = ref.current;
    if (!node || play === "always") return;
    if (play === "hover") {
      const host =
        node.closest<HTMLElement>(
          'button, a, [role="menuitem"], [role="option"], [data-mini-scene-host]',
        ) ?? node;
      const on = () => setLive(true);
      const off = () => setLive(false);
      host.addEventListener("pointerenter", on);
      host.addEventListener("pointerleave", off);
      host.addEventListener("focus", on);
      host.addEventListener("blur", off);
      return () => {
        host.removeEventListener("pointerenter", on);
        host.removeEventListener("pointerleave", off);
        host.removeEventListener("focus", on);
        host.removeEventListener("blur", off);
      };
    }
    if (typeof IntersectionObserver === "undefined") {
      // no observer (old engines, tests): let it play
      queueMicrotask(() => setLive(true));
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setLive(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [play]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      style={{ width: width * scale, height: height * scale }}
    >
      <span
        className={styles.stage}
        data-mini-scene=""
        data-play={play}
        data-still={live ? undefined : ""}
        data-bare={bare ? "" : undefined}
        style={
          {
            width,
            height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            ...(tone ? { "--ink": tone } : {}),
          } as CSSProperties
        }
      >
        {children}
      </span>
    </span>
  );
}

export default MiniScene;
