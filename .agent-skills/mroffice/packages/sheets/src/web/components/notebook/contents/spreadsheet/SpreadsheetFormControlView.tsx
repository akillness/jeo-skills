"use client";











/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import { type CSSProperties, type ReactNode } from "react";
import {
  formControlCheckState,
  formControlItems,
  formControlSelectedIndex,
  formControlValue,
  type FormControlCellText,
  type SpreadsheetFormControl,
} from "../../../../lib/spreadsheet/form-control-drawing";

const PT = PX_PER_PT;
const FACE = "#f0f0f0";
const SHADE = "#a0a0a0";
const RAISED = `inset -1px -1px #000000, inset 1px 1px #ffffff, inset -2px -2px ${SHADE}`;
const SUNKEN = `inset 1px 1px ${SHADE}, inset -1px -1px #ffffff, inset 2px 2px #696969, inset -2px -2px #e3e3e3`;
const LIST_FONT = 'Tahoma, "Segoe UI", Arial, sans-serif';
const ITEM_HEIGHT = 13;
const BOX = 13;

function labelStyle(control: SpreadsheetFormControl): CSSProperties {
  return {
    fontFamily: control.textFace ? `"${control.textFace}", ${LIST_FONT}` : LIST_FONT,
    fontSize: (control.textSizePt ?? 8) * PT,
    fontWeight: control.textBold ? 700 : 400,
    fontStyle: control.textItalic ? "italic" : "normal",
    // Underline (single or double) and strikethrough of the label's font,
    // as Excel draws them (X-142).
    ...(control.textUnderline || control.textStrike
      ? {
          textDecorationLine: [control.textUnderline ? "underline" : "", control.textStrike ? "line-through" : ""].filter(Boolean).join(" "),
          ...(control.textUnderline === "double" ? { textDecorationStyle: "double" as const } : {}),
        }
      : {}),
    color: control.textColor ?? "#000000",
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "hidden",
  };
}

function Arrow({ direction, size, color }: { direction: "up" | "down" | "left" | "right"; size: number; color: string }) {
  const s = Math.max(3, Math.round(size));
  const points = {
    up: `0,${s / 2} ${s},${s / 2} ${s / 2},0`,
    down: `0,0 ${s},0 ${s / 2},${s / 2}`,
    left: `${s / 2},0 ${s / 2},${s} 0,${s / 2}`,
    right: `0,0 0,${s} ${s / 2},${s / 2}`,
  }[direction];
  const vertical = direction === "up" || direction === "down";
  return (
    <svg width={vertical ? s : s / 2} height={vertical ? s / 2 : s} aria-hidden style={{ display: "block" }}>
      <polygon points={points} fill={color} />
    </svg>
  );
}

function RaisedButton({ style, children }: { style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      style={{
        background: FACE,
        boxShadow: RAISED,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ScrollBar({
  horizontal,
  length,
  breadth,
  enabled,
  thumbAt,
}: {
  horizontal: boolean;
  length: number;
  breadth: number;
  enabled: boolean;
  /** 0..1 along the track, or null for no thumb. */
  thumbAt: number | null;
}) {
  const arrow = Math.max(4, Math.min(breadth, length / 2));
  const color = enabled ? "#000000" : SHADE;
  const glyph = Math.max(3, Math.round(breadth * 0.45));
  const track = Math.max(0, length - 2 * arrow);
  const thumb = Math.min(track, Math.max(8, breadth));
  const thumbOffset = thumbAt === null ? 0 : arrow + (track - thumb) * thumbAt;
  return (
    <div
      style={{
        position: "relative",
        width: horizontal ? length : breadth,
        height: horizontal ? breadth : length,
        background: FACE,
        flex: "none",
      }}
    >
      <RaisedButton
        style={{ position: "absolute", left: 0, top: 0, width: horizontal ? arrow : breadth, height: horizontal ? breadth : arrow }}
      >
        <Arrow direction={horizontal ? "left" : "up"} size={glyph} color={color} />
      </RaisedButton>
      {enabled && thumbAt !== null && track >= thumb && thumb > 0 ? (
        <RaisedButton
          style={{
            position: "absolute",
            left: horizontal ? thumbOffset : 0,
            top: horizontal ? 0 : thumbOffset,
            width: horizontal ? thumb : breadth,
            height: horizontal ? breadth : thumb,
          }}
        />
      ) : null}
      <RaisedButton
        style={{
          position: "absolute",
          left: horizontal ? length - arrow : 0,
          top: horizontal ? 0 : length - arrow,
          width: horizontal ? arrow : breadth,
          height: horizontal ? breadth : arrow,
        }}
      >
        <Arrow direction={horizontal ? "right" : "down"} size={glyph} color={color} />
      </RaisedButton>
    </div>
  );
}

function CheckMark({ state }: { state: "checked" | "unchecked" | "mixed" }) {
  if (state === "unchecked") return null;
  if (state === "mixed") {
    return <div style={{ position: "absolute", inset: 3, background: "#808080" }} />;
  }
  return (
    <svg viewBox="0 0 13 13" width={BOX} height={BOX} style={{ position: "absolute", inset: 0 }} aria-hidden>
      <polyline points="3,6.5 5.5,9 10,3.8" fill="none" stroke="#000000" strokeWidth={1.6} />
    </svg>
  );
}

export function SpreadsheetFormControlView({
  control,
  widthPx,
  heightPx,
  cellText,
}: {
  control: SpreadsheetFormControl;
  widthPx: number;
  heightPx: number;
  cellText: FormControlCellText;
}) {
  const width = Math.max(1, widthPx);
  const height = Math.max(1, heightPx);
  const threeD = control.threeD !== false;
  const frame: CSSProperties = threeD
    ? { boxShadow: SUNKEN }
    : { border: "1px solid #000000" };
  const inset = threeD ? 2 : 1;
  const root: CSSProperties = {
    position: "relative",
    width,
    height,
    boxSizing: "border-box",
    overflow: "hidden",
    userSelect: "none",
  };
  const testId = `spreadsheet-form-control-${control.objectType}`;
  const align = control.textAlign ?? "left";

  switch (control.objectType) {
    case "Button":
      return (
        <RaisedButton style={{ ...root, padding: 3 }}>
          <div data-testid={testId} style={{ ...labelStyle(control), textAlign: control.textAlign ?? "center", width: "100%" }}>
            {control.text ?? ""}
          </div>
        </RaisedButton>
      );
    case "CheckBox":
    case "Radio": {
      const state = formControlCheckState(control, cellText);
      const radio = control.objectType === "Radio";
      return (
        <div data-testid={testId} data-state={state} style={{ ...root, display: "flex", alignItems: "center", gap: 4, paddingLeft: 2 }}>
          <div
            style={{
              position: "relative",
              width: BOX,
              height: BOX,
              flex: "none",
              background: "#ffffff",
              boxSizing: "border-box",
              ...(radio
                ? { borderRadius: "50%", border: `1px solid ${threeD ? "#696969" : "#000000"}` }
                : frame),
            }}
          >
            {radio ? (
              state === "checked" ? (
                <div style={{ position: "absolute", left: 3.5, top: 3.5, width: 4, height: 4, borderRadius: "50%", background: "#000000" }} />
              ) : null
            ) : (
              <CheckMark state={state} />
            )}
          </div>
          <div style={{ ...labelStyle(control), flex: 1, minWidth: 0, textAlign: align, maxHeight: height }}>
            {control.text ?? ""}
          </div>
        </div>
      );
    }
    case "List": {
      const items = formControlItems(control, cellText);
      const selected = formControlSelectedIndex(control, cellText);
      const bar = Math.min(Math.max(8, control.scrollBarWidth ?? 16), Math.max(8, width / 2));
      const innerHeight = Math.max(0, height - 2 * inset);
      const visible = Math.max(1, Math.floor(innerHeight / ITEM_HEIGHT));
      const scrolls = items.length > visible;
      return (
        <div data-testid={testId} style={{ ...root, background: "#ffffff", ...frame }}>
          <div style={{ position: "absolute", left: inset, top: inset, right: inset + bar, bottom: inset, overflow: "hidden" }}>
            {items.slice(0, visible + 1).map((item, index) => (
              <div
                key={index}
                style={{
                  height: ITEM_HEIGHT,
                  lineHeight: `${ITEM_HEIGHT}px`,
                  paddingLeft: 2,
                  fontFamily: LIST_FONT,
                  fontSize: 8 * PT,
                  whiteSpace: "pre",
                  overflow: "hidden",
                  background: index === selected ? "#0078d7" : undefined,
                  color: index === selected ? "#ffffff" : "#000000",
                }}
              >
                {item}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", top: inset, right: inset, bottom: inset }}>
            <ScrollBar horizontal={false} length={innerHeight} breadth={bar} enabled={scrolls} thumbAt={scrolls ? 0 : null} />
          </div>
        </div>
      );
    }
    case "Drop": {
      const items = formControlItems(control, cellText);
      const selected = formControlSelectedIndex(control, cellText);
      const button = Math.min(Math.max(8, control.scrollBarWidth ?? 16), Math.max(8, width / 2));
      return (
        <div data-testid={testId} style={{ ...root, background: "#ffffff", ...frame }}>
          <div
            style={{
              position: "absolute",
              left: inset + 2,
              top: inset,
              right: inset + button,
              bottom: inset,
              display: "flex",
              alignItems: "center",
              fontFamily: LIST_FONT,
              fontSize: 8 * PT,
              whiteSpace: "pre",
              overflow: "hidden",
            }}
          >
            {selected >= 0 ? items[selected] ?? "" : ""}
          </div>
          <RaisedButton style={{ position: "absolute", top: inset, right: inset, bottom: inset, width: button }}>
            <Arrow direction="down" size={Math.max(3, Math.round(button * 0.45))} color="#000000" />
          </RaisedButton>
        </div>
      );
    }
    case "Spin": {
      const horizontal = control.horizontal === true;
      const half = horizontal ? width / 2 : height / 2;
      const glyph = Math.max(3, Math.round(Math.min(horizontal ? height : width, half) * 0.45));
      return (
        <div data-testid={testId} style={{ ...root, display: "flex", flexDirection: horizontal ? "row" : "column" }}>
          <RaisedButton style={{ flex: 1 }}>
            <Arrow direction={horizontal ? "left" : "up"} size={glyph} color="#000000" />
          </RaisedButton>
          <RaisedButton style={{ flex: 1 }}>
            <Arrow direction={horizontal ? "right" : "down"} size={glyph} color="#000000" />
          </RaisedButton>
        </div>
      );
    }
    case "Scroll": {
      const horizontal = control.horizontal === true || (control.horizontal === undefined && width > height);
      const min = control.min ?? 0;
      const max = Math.max(min, control.max ?? 100);
      const value = formControlValue(control, cellText);
      return (
        <div data-testid={testId} style={root}>
          <ScrollBar
            horizontal={horizontal}
            length={horizontal ? width : height}
            breadth={horizontal ? height : width}
            enabled
            thumbAt={max > min ? (value - min) / (max - min) : 0}
          />
        </div>
      );
    }
    case "GBox":
    case "Dialog": {
      const size = (control.textSizePt ?? 8) * PT;
      return (
        <div data-testid={testId} style={root}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: size * 0.6,
              bottom: 0,
              border: `1px solid ${SHADE}`,
              boxShadow: threeD ? "inset 1px 1px #ffffff, 1px 1px #ffffff" : undefined,
            }}
          />
          {control.text ? (
            <div style={{ ...labelStyle(control), position: "absolute", left: 6, top: 0, padding: "0 2px", background: "#ffffff", maxWidth: width - 12, whiteSpace: "pre" }}>
              {control.text}
            </div>
          ) : null}
        </div>
      );
    }
    case "EditBox":
      return (
        <div data-testid={testId} style={{ ...root, background: "#ffffff", ...frame, padding: inset + 1 }}>
          <div style={labelStyle(control)}>{control.text ?? ""}</div>
        </div>
      );
    case "Label":
    default:
      return (
        <div data-testid={testId} style={root}>
          <div style={{ ...labelStyle(control), textAlign: align, height: "100%" }}>{control.text ?? ""}</div>
        </div>
      );
  }
}
