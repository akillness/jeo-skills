"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  presentationTableShadowLayers,
  presentationTableShadowSilhouette,
} from "@mrnote/core/web/lib/presentation-table-effects.ts";
import { tableStyleLookShadowEffect } from "@mrnote/core/web/lib/presentation-table-style.ts";
import { tableDrawnStyleLook } from "../../../../lib/presentation/table-canvas-layout";
import type { PresentationTableBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";

/** One painted box of the table, relative to the table's own box: its opacity in `a`. */
interface PaintPiece {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly a: number;
}

interface Silhouette {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly PaintPiece[];
}

/** What a table paints with: its own box (Table Background), its cells, and the strips its lines are drawn with. */
const PAINTED = "table, td, th, [data-testid='presentation-table-stroke'], [data-testid^='presentation-table-compound-']";

/** A computed CSS colour's opacity (0 for `transparent` or unreadable). */
function colorAlpha(value: string): number {
  if (!value || value === "transparent") return 0;
  const match = /rgba?\(([^)]*)\)/.exec(value);
  if (!match) return 1;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return 1;
  const alpha = parts[3].endsWith("%") ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3]);
  return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
}

/**
 * The table's painted silhouette: every box that paints a fill or a line, at
 * its paint's opacity, in the table's own px (the canvas's zoom taken off).
 * Text is in none of them, so it casts nothing.
 */
function measureSilhouette(frame: HTMLElement): Silhouette | null {
  const table = frame.querySelector("table");
  if (!table) return null;
  const box = table.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  const scale = table.offsetWidth > 0 ? box.width / table.offsetWidth : 1;
  if (!(scale > 0) || !(box.width > 0) || !(box.height > 0)) return null;
  const pieces: PaintPiece[] = [];
  const seen = new Set<string>();
  const round = (value: number) => Math.round(value * 100) / 100;
  const push = (x: number, y: number, w: number, h: number, a: number) => {
    if (!(w > 0 && h > 0 && a > 0)) return;
    const piece = { x: round(x), y: round(y), w: round(w), h: round(h), a: Math.round(a * 1000) / 1000 };
    // One line two cells share is one piece (each cell states it): drawn twice, a translucent line would cast twice.
    const key = `${piece.x}|${piece.y}|${piece.w}|${piece.h}`;
    if (seen.has(key)) return;
    seen.add(key);
    pieces.push(piece);
  };
  // Collapsed borders (the table's own layout): the cells' boxes meet on the middle of the line they share, which
  // is drawn half in each; a cell's line is centred on its box's edge. Each cell stating the line inside its own
  
  // grid's inside lines cast twice PowerPoint's shadow, its outside ones the same).
  const collapsed = getComputedStyle(table).borderCollapse === "collapse";
  for (const element of [table, ...Array.from(table.querySelectorAll<HTMLElement>(PAINTED))]) {
    const css = getComputedStyle(element);
    if (css.visibility === "hidden" || css.display === "none") continue;
    const rect = element.getBoundingClientRect();
    const x = (rect.left - box.left) / scale;
    const y = (rect.top - box.top) / scale;
    const w = rect.width / scale;
    const h = rect.height / scale;
    const fill = css.backgroundImage && css.backgroundImage !== "none" ? 1 : colorAlpha(css.backgroundColor);
    push(x, y, w, h, fill);
    if (element === table) continue;
    // A cell's own lines (one its table's stroke plan did not take over).
    const side = (name: "Top" | "Right" | "Bottom" | "Left") => {
      const style = css.getPropertyValue(`border-${name.toLowerCase()}-style`);
      if (!style || style === "none" || style === "hidden") return 0;
      const width = Number.parseFloat(css.getPropertyValue(`border-${name.toLowerCase()}-width`)) || 0;
      return colorAlpha(css.getPropertyValue(`border-${name.toLowerCase()}-color`)) > 0 ? width : 0;
    };
    const alphaOf = (name: string) => colorAlpha(css.getPropertyValue(`border-${name}-color`));
    const top = side("Top"), right = side("Right"), bottom = side("Bottom"), left = side("Left");
    if (collapsed) {
      if (top) push(x - left / 2, y - top / 2, w + left / 2 + right / 2, top, alphaOf("top"));
      if (bottom) push(x - left / 2, y + h - bottom / 2, w + left / 2 + right / 2, bottom, alphaOf("bottom"));
      if (left) push(x - left / 2, y - top / 2, left, h + top / 2 + bottom / 2, alphaOf("left"));
      if (right) push(x + w - right / 2, y - top / 2, right, h + top / 2 + bottom / 2, alphaOf("right"));
    } else {
      if (top) push(x, y, w, top, alphaOf("top"));
      if (bottom) push(x, y + h - bottom, w, bottom, alphaOf("bottom"));
      if (left) push(x, y, left, h, alphaOf("left"));
      if (right) push(x + w - right, y, right, h, alphaOf("right"));
    }
  }
  return {
    left: round((box.left - frameBox.left) / scale),
    top: round((box.top - frameBox.top) / scale),
    width: round(box.width / scale),
    height: round(box.height / scale),
    pieces,
  };
}

const sameSilhouette = (a: Silhouette | null, b: Silhouette | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Table Design > Effects > Shadow, and a table style's background shadow,
 * drawn beside the table: an outer shadow as the silhouette of what the
 * table's cells paint (`presentationTableShadowSilhouette`: fills at their
 * opacity and lines, never text), measured from the drawn table and drawn
 * under it, blurred and moved / scaled as the shared shadow model moves a
 * shape's; an inner shadow on its layer over the cells
 * (`presentationTableShadowLayers`). A table with no shadow is returned as it is.
 */
export function PresentationTableShadowFrame({
  block,
  children,
}: {
  block: PresentationTableBlock;
  children: ReactNode;
}) {
  const styleShadow = tableStyleLookShadowEffect(tableDrawnStyleLook(block));
  const layers = presentationTableShadowLayers(block, styleShadow);
  const cast = presentationTableShadowSilhouette(block, styleShadow);
  const frameRef = useRef<HTMLDivElement>(null);
  const [silhouette, setSilhouette] = useState<Silhouette | null>(null);
  // Measured after every render (the cells' fills and lines follow the
  // block), and again whenever the table's size changes (a font arriving).
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!cast || !frame) return;
    const measure = () => {
      const next = measureSilhouette(frame);
      setSilhouette((current) => (sameSilhouette(current, next) ? current : next));
    };
    measure();
    const table = frame.querySelector("table");
    if (!table || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  });
  if (!cast && !layers.under && !layers.over) return <>{children}</>;
  const ink = cast ? /rgba?\(([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\)/.exec(cast.color) : null;
  const inkAlpha = ink?.[4] ? (ink[4].endsWith("%") ? Number.parseFloat(ink[4]) / 100 : Number.parseFloat(ink[4])) : 1;
  return (
    <div
      ref={frameRef}
      data-testid="presentation-table-shadow-frame"
      style={{ position: "relative", isolation: "isolate", height: "100%", minHeight: 0 }}
    >
      {cast && silhouette && ink ? (
        <svg
          aria-hidden="true"
          focusable="false"
          data-testid="presentation-table-shadow-silhouette"
          data-presentation-selection-ignore=""
          width={silhouette.width}
          height={silhouette.height}
          style={{
            position: "absolute",
            left: silhouette.left,
            top: silhouette.top,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: -1,
            transform: cast.transform,
            transformOrigin: cast.transformOrigin,
            filter: cast.filter || undefined,
            // The pieces composite with one another at their own opacity; the
            // shadow's own opacity is the whole silhouette's.
            opacity: inkAlpha,
          }}
        >
          <g fill={`rgb(${ink[1]} ${ink[2]} ${ink[3]})`}>
            {silhouette.pieces.map((piece, index) => (
              <rect
                key={index}
                x={piece.x}
                y={piece.y}
                width={piece.w}
                height={piece.h}
                {...(piece.a < 1 ? { fillOpacity: piece.a } : {})}
              />
            ))}
          </g>
        </svg>
      ) : null}
      {layers.under ? <span aria-hidden="true" data-testid="presentation-table-shadow-under" style={layers.under} /> : null}
      {children}
      {layers.over ? <span aria-hidden="true" data-testid="presentation-table-shadow-over" style={layers.over} /> : null}
    </div>
  );
}
