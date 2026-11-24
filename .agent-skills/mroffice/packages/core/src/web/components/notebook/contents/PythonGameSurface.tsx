"use client";













/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import { useTranslations } from "../../../../host/next-intl";

import {
  sendPythonGameInput,
  stopPythonGame,
  subscribePythonGame,
  type PythonGameFrame,
  type PythonGameInput,
} from "../../../lib/code-runner/python-runner";

/** Keys the page would otherwise take (scrolling, focus moves) while playing. */
const GAME_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab", "PageUp", "PageDown", "Home", "End", "Backspace",
]);

export function PythonGameSurface({ namespace }: { namespace: string }) {
  const t = useTranslations("console-notebooks");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [caption, setCaption] = useState("");
  const [running, setRunning] = useState(false);
  const [cloud, setCloud] = useState(false);
  const pendingRef = useRef<PythonGameInput[]>([]);
  const flushRef = useRef<number | null>(null);

  const draw = useCallback((frame: PythonGameFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== frame.width) canvas.width = frame.width;
    if (canvas.height !== frame.height) canvas.height = frame.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (frame.bitmap) {
      try {
        context.drawImage(frame.bitmap, 0, 0);
      } catch {
        /* a picture already released for the next one */
      }
      return;
    }
    if (frame.pixels) context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
  }, []);

  useEffect(() => {
    let focused = false;
    return subscribePythonGame(namespace, (signal) => {
      if (signal.kind === "ended") {
        setRunning(false);
        return;
      }
      const { frame } = signal;
      if (!sizeRef.current || sizeRef.current.width !== frame.width || sizeRef.current.height !== frame.height) {
        sizeRef.current = { width: frame.width, height: frame.height };
        setSize(sizeRef.current);
      }
      setRunning(true);
      setCloud(frame.cloud === true);
      setCaption(frame.caption);
      // The canvas mounts with the first frame; draw once it is there.
      if (canvasRef.current) draw(frame);
      else requestAnimationFrame(() => draw(frame));
      if (!focused) {
        focused = true;
        requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
      }
    });
  }, [draw, namespace]);

  useEffect(
    () => () => {
      if (flushRef.current !== null) cancelAnimationFrame(flushRef.current);
    },
    [],
  );

  /** Inputs go once per animation frame, in order. */
  const send = useCallback(
    (event: PythonGameInput) => {
      pendingRef.current.push(event);
      if (flushRef.current !== null) return;
      flushRef.current = requestAnimationFrame(() => {
        flushRef.current = null;
        const events = pendingRef.current.splice(0);
        if (events.length) sendPythonGameInput(namespace, events);
      });
    },
    [namespace],
  );

  const point = useCallback((event: MouseEvent<HTMLCanvasElement> | WheelEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    const frame = sizeRef.current;
    if (!frame || box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(frame.width - 1, Math.floor(((event.clientX - box.left) / box.width) * frame.width))),
      y: Math.max(0, Math.min(frame.height - 1, Math.floor(((event.clientY - box.top) / box.height) * frame.height))),
    };
  }, []);

  const key = (kind: "kd" | "ku") => (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!running) return;
    if (GAME_KEYS.has(event.key) || event.key.length === 1) event.preventDefault();
    event.stopPropagation();
    send({
      t: kind,
      key: event.key,
      code: event.code,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      meta: event.metaKey,
      repeat: event.repeat,
    });
  };

  if (!size) return null;
  return (
    <div
      data-testid="python-game"
      data-running={running ? "true" : "false"}
      style={{ margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 6, fontFamily: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <strong style={{ fontWeight: 600 }}>{caption || t(cloud ? "code.cloudGui.window" : "code.game.window")}</strong>
        <span style={{ color: "var(--console-text-secondary, #626262)" }}>
          {running ? t(cloud ? "code.cloudGui.hint" : "code.game.hint") : t("code.game.ended")}
        </span>
        {running ? (
          <button
            type="button"
            data-testid="python-game-stop"
            onClick={() => stopPythonGame(namespace)}
            style={{
              marginLeft: "auto",
              padding: "2px 10px",
              borderRadius: 6,
              border: "1px solid var(--console-border, #d4d4d4)",
              background: "var(--bg-raised, #fff)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t("code.game.stop")}
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        tabIndex={0}
        aria-label={caption || t(cloud ? "code.cloudGui.window" : "code.game.window")}
        data-testid="python-game-canvas"
        onKeyDown={key("kd")}
        onKeyUp={key("ku")}
        onBlur={() => running && send({ t: "blur" })}
        onMouseMove={(event) => running && send({ t: "mm", ...point(event) })}
        onMouseDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          if (running) send({ t: "md", button: event.button + 1, ...point(event) });
        }}
        onMouseUp={(event) => running && send({ t: "mu", button: event.button + 1, ...point(event) })}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={(event) => running && send({ t: "wheel", dy: event.deltaY, ...point(event) })}
        style={{
          // Its own shape at any size (no letterbox), so a click maps exactly.
          display: "block",
          width: `min(100%, ${size.width}px, calc(70vh * ${size.width / size.height}))`,
          height: "auto",
          // A game's pixels stay sharp; a desktop window's text is smoothed.
          imageRendering: cloud ? "auto" : "pixelated",
          background: "#000",
          borderRadius: 8,
          outline: "none",
          boxShadow: "0 0 0 1px var(--console-border, #e5e5e5)",
          cursor: running ? "crosshair" : "default",
        }}
      />
    </div>
  );
}
