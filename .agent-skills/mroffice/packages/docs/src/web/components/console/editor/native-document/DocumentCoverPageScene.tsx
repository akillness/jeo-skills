"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Paints one {@link CoverScene}: the gallery thumbnails, the cover atom on the
 * page and an imported Word cover all come through here, so what the gallery
 * shows is exactly what the insert command puts on the page.
 *
 * Shapes are SVG paths in a 100 x 100 box stretched over each item (strokes
 * keep their physical width); text frames are HTML so a field can be typed
 * into. A field shows its property's value, or the control's placeholder
 * while the property is empty.
 */

import { EMU_PER_PX, PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import {
  formatCoverDate,
  type CoverFieldKey,
  type CoverScene,
  type CoverSceneItem,
  type CoverScenePaint,
  type CoverSceneRun,
} from "@mrnote/core/web/lib/document-cover-pages/coverPages.ts";

import styles from "./DocumentCoverPageScene.module.css";


export interface CoverSceneFieldEditing {
  /** Whether field text can be typed into (a live, editable document). */
  editable: boolean;
  onInput: (field: CoverFieldKey, text: string) => void;
  /**
   * The field was left with `text`. `next`: the cover field the focus went to
   * (Tab), by property and its place among that property's fields on the
   * cover, so the host can give it the focus back once the write redraws it.
   */
  onCommit: (
    field: CoverFieldKey,
    text: string,
    next?: { field: CoverFieldKey; index: number } | null,
  ) => void;
}

export interface DocumentCoverPageSceneProps {
  scene: CoverScene;
  /** Property values by field; an absent or empty value shows the placeholder. */
  values: Partial<Record<CoverFieldKey, string>>;
  /** CSS pixels per EMU (1 / EMU_PER_PX is 100 %). */
  scale: number;
  fontFamily?: string;
  editing?: CoverSceneFieldEditing;
  className?: string;
  testId?: string;
}

function paintCss(
  paint: CoverScenePaint | null | undefined,
  gradientId: string,
): { fill: string; opacity?: number } {
  if (!paint) return { fill: "none" };
  if ("color" in paint) {
    return {
      fill: paint.color,
      ...(paint.alpha !== undefined ? { opacity: paint.alpha } : {}),
    };
  }
  return { fill: `url(#${gradientId})` };
}

function GradientDefinition({
  id,
  paint,
}: {
  id: string;
  paint: CoverScenePaint | null | undefined;
}) {
  if (!paint || "color" in paint) return null;
  // DrawingML `a:lin/@ang` is clockwise from the +x axis; 90° runs top down.
  const radians = (paint.gradient.angle * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return (
    <linearGradient
      id={id}
      x1={0.5 - dx}
      y1={0.5 - dy}
      x2={0.5 + dx}
      y2={0.5 + dy}
    >
      {paint.gradient.stops.map((stop, index) => (
        <stop
          key={index}
          offset={stop.pos}
          stopColor={stop.color}
          stopOpacity={stop.alpha ?? 1}
        />
      ))}
    </linearGradient>
  );
}

function ShapeGraphic({ item, idPrefix }: { item: CoverSceneItem; idPrefix: string }) {
  const fillId = `${idPrefix}-fill`;
  const lineId = `${idPrefix}-line`;
  const fill = paintCss(item.fill, fillId);
  const line = item.line ? paintCss(item.line.paint, lineId) : null;
  const strokeWidthPx = item.line ? Math.max(0.25, item.line.widthPt * PX_PER_PT) : 0;
  if (item.kind === "picture" && item.src) {
    const [left, top, right, bottom] = item.crop ?? [0, 0, 0, 0];
    const visibleWidth = Math.max(0.01, 1 - left - right);
    const visibleHeight = Math.max(0.01, 1 - top - bottom);
    const clipId = `${idPrefix}-clip`;
    return (
      <svg
        className={styles.graphic}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {item.paths?.length ? (
          <defs>
            <clipPath id={clipId}>
              {item.paths.map((path, index) => (
                <path key={index} d={path.d} />
              ))}
            </clipPath>
          </defs>
        ) : null}
        <image
          href={item.src}
          x={(-left / visibleWidth) * 100}
          y={(-top / visibleHeight) * 100}
          width={100 / visibleWidth}
          height={100 / visibleHeight}
          preserveAspectRatio="none"
          clipPath={item.paths?.length ? `url(#${clipId})` : undefined}
        />
      </svg>
    );
  }
  if (item.kind === "picture") {
    return (
      <svg
        className={styles.graphic}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="100" fill="#f2f2f2" />
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="none"
          stroke="#a6a6a6"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M38 60 L46 50 L52 56 L58 47 L66 60 Z M44 43 A3 3 0 1 1 44.01 43"
          fill="#bfbfbf"
        />
      </svg>
    );
  }
  return (
    <svg
      className={styles.graphic}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <GradientDefinition id={fillId} paint={item.fill} />
        {item.line ? <GradientDefinition id={lineId} paint={item.line.paint} /> : null}
      </defs>
      {(item.paths ?? []).map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill === "none" ? "none" : fill.fill}
          fillOpacity={path.fill === "none" ? undefined : fill.opacity}
          stroke={line && path.stroke !== false ? line.fill : "none"}
          strokeOpacity={line?.opacity}
          strokeWidth={strokeWidthPx}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function runStyle(run: CoverSceneRun, scale: number): CSSProperties {
  const px = run.sizePt * PX_PER_PT * scale * EMU_PER_PX;
  return {
    fontSize: `${px}px`,
    color: run.color,
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textTransform: run.caps ? "uppercase" : undefined,
    letterSpacing: run.spacingPt
      ? `${run.spacingPt * PX_PER_PT * scale * EMU_PER_PX}px`
      : undefined,
    fontFamily: run.fontFamily,
  };
}

function fieldText(run: CoverSceneRun, value: string): string {
  return run.dateFormat ? formatCoverDate(value, run.dateFormat) : value;
}

/**
 * One typed-into field. Its text is written imperatively and never while it
 * has focus, so a re-render caused by its own keystroke (the property
 * changed) cannot move the caret; every other copy bound to the same
 * property re-renders with the new value.
 */
function FieldText({
  run,
  value,
  style,
  editing,
}: {
  run: CoverSceneRun;
  value: string;
  style: CSSProperties;
  editing: CoverSceneFieldEditing | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const field = run.field as CoverFieldKey;
  const shown = value ? fieldText(run, value) : "";
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.ownerDocument.activeElement === element) return;
    if (element.textContent !== shown) element.textContent = shown;
  }, [shown]);
  const live = editing?.editable === true;
  return (
    <span
      ref={ref}
      className={styles.field}
      style={style}
      data-cover-field={field}
      data-placeholder={run.placeholder ?? ""}
      data-empty={value ? undefined : "true"}
      contentEditable={live ? true : undefined}
      suppressContentEditableWarning
      spellCheck={false}
      role={live ? "textbox" : undefined}
      aria-label={run.placeholder}
      tabIndex={live ? 0 : undefined}
      onFocus={(event) => {
        // A date shows its picture; while typing it shows what is stored.
        if (run.dateFormat && value) event.currentTarget.textContent = value;
      }}
      onInput={(event) => {
        const text = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ");
        event.currentTarget.dataset.empty = text ? "" : "true";
        editing?.onInput(field, text);
      }}
      onBlur={(event) => {
        const text = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        const target = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
        const nextField = target?.getAttribute("data-cover-field") as CoverFieldKey | null;
        const scene = event.currentTarget.closest("[data-cover-scene-root]") ?? event.currentTarget.parentElement;
        const next =
          target && nextField && scene
            ? {
                field: nextField,
                index: Array.from(scene.querySelectorAll(`[data-cover-field="${nextField}"]`)).indexOf(target),
              }
            : null;
        editing?.onCommit(field, text, next && next.index >= 0 ? next : null);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        // A cover control is one line of plain text.
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain").replace(/\s+/g, " ");
        const selection = event.currentTarget.ownerDocument.getSelection();
        if (!selection?.rangeCount) return;
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(text));
        selection.collapseToEnd();
        const next = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ");
        event.currentTarget.dataset.empty = next ? "" : "true";
        editing?.onInput(field, next);
      }}
    />
  );
}

function TextFrame({
  item,
  values,
  scale,
  editing,
}: {
  item: CoverSceneItem;
  values: Partial<Record<CoverFieldKey, string>>;
  scale: number;
  editing: CoverSceneFieldEditing | undefined;
}) {
  const body = item.text;
  if (!body) return null;
  const [left, top, right, bottom] = body.inset;
  return (
    <div
      className={styles.textFrame}
      data-anchor={body.anchor}
      style={{
        paddingLeft: left * scale,
        paddingTop: top * scale,
        paddingRight: right * scale,
        paddingBottom: bottom * scale,
      }}
    >
      <div className={styles.textFlow}>
        {body.paragraphs.map((paragraph, paragraphIndex) => (
          <p
            key={paragraphIndex}
            className={styles.paragraph}
            style={{
              textAlign: paragraph.align,
              marginTop: (paragraph.beforePt ?? 0) * PX_PER_PT * scale * EMU_PER_PX,
              marginBottom: (paragraph.afterPt ?? 0) * PX_PER_PT * scale * EMU_PER_PX,
              lineHeight: paragraph.lineHeight ?? 1.15,
              ...(paragraph.borderBottom
                ? {
                    // Word draws the rule `w:space` under the last line,
                    // above the space after (R467-D04's cover title).
                    paddingBottom: paragraph.borderBottom.spacePt * PX_PER_PT * scale * EMU_PER_PX,
                    borderBottom: `${paragraph.borderBottom.widthPt * PX_PER_PT * scale * EMU_PER_PX}px solid ${paragraph.borderBottom.color}`,
                  }
                : {}),
            }}
          >
            {paragraph.runs.map((run, runIndex) => {
              const style = runStyle(run, scale);
              if (!run.field) {
                return (
                  <span key={runIndex} style={style}>
                    {run.text}
                  </span>
                );
              }
              return (
                <FieldText
                  key={runIndex}
                  run={run}
                  value={(values[run.field] ?? "").trim() ? (values[run.field] ?? "") : ""}
                  style={style}
                  editing={editing}
                />
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}

export function DocumentCoverPageScene({
  scene,
  values,
  scale,
  fontFamily,
  editing,
  className,
  testId,
}: DocumentCoverPageSceneProps) {
  const idPrefix = useId().replace(/[^A-Za-z0-9_-]/g, "");
  return (
    <div
      className={[styles.scene, className].filter(Boolean).join(" ")}
      data-testid={testId}
      data-cover-scene-root=""
      style={{
        width: scene.widthEmu * scale,
        height: scene.heightEmu * scale,
        fontFamily,
      }}
    >
      {scene.items.map((item, index) => {
        const transform = [
          item.rotation ? `rotate(${item.rotation}deg)` : "",
          item.flipH ? "scaleX(-1)" : "",
          item.flipV ? "scaleY(-1)" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const lineOnly = item.w === 0 || item.h === 0;
        return (
          <div
            key={`${item.id}-${index}`}
            className={styles.item}
            data-cover-item={item.kind}
            data-behind={item.behind ? "true" : undefined}
            style={{
              left: item.x * scale,
              top: item.y * scale,
              width: Math.max(item.w * scale, lineOnly ? 1 : 0),
              height: Math.max(item.h * scale, lineOnly ? 1 : 0),
              transform: transform || undefined,
            }}
          >
            {item.kind !== "text" ? (
              <ShapeGraphic item={item} idPrefix={`${idPrefix}-${index}`} />
            ) : null}
            {item.text ? (
              <TextFrame item={item} values={values} scale={scale} editing={editing} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default DocumentCoverPageScene;
