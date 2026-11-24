"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Morph by Words or by Characters (Transitions > Effect Options; Microsoft
 * Support, "Morph transition: Tips and tricks": "Words" moves each word that
 * stays to its new place, "Characters" each character, an anagram).
 *
 * Each matched object's words are read from the slide's own drawing of them,
 * the first slide's and the second's, in hidden frames at their own size;
 * the two runs of words (or characters) are paired in order (the longest
 * common run), and each pair is drawn travelling from its place on the first
 * slide to its place on the second, taking the second's size and colour on
 * the way; a word only on the first fades out, one only on the second fades
 * in. The objects themselves still morph; their own words are hidden while
 * these travel.
 *
 * Every movement is a CSS transition, so a recording sets its time like the
 * rest of the show.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { MorphGeo } from "../../../../lib/presentation-morph";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";
import { geometryNumber } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { PresentationBlockView } from "./PresentationBlockView";

export type MorphTextPair = {
  readonly id: string;
  readonly from: PresentationBlock;
  readonly to: PresentationBlock;
  readonly fromGeo: MorphGeo;
  readonly toGeo: MorphGeo;
};

type Token = {
  text: string;
  /** Centre, in design px of the slide. */
  x: number;
  y: number;
  /** Turn of the object the word stands in, degrees. */
  rotation: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  fontSize: number;
  color: string;
  letterSpacing: string;
};

/** More words than this travel as their objects do. */
const MAX_TOKENS = 600;

function segmenter(mode: "words" | "characters"): (text: string) => Array<{ segment: string; index: number }> {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: mode === "words" ? "word" : "grapheme" });
    return (text) => Array.from(segments.segment(text), ({ segment, index }) => ({ segment, index }));
  }
  const pattern = mode === "words" ? /\S+/gu : /\S/gu;
  return (text) => Array.from(text.matchAll(pattern), (match) => ({ segment: match[0], index: match.index ?? 0 }));
}

/** The words (or characters) drawn in `frame`, placed on the slide by `geo`. */
function readTokens(frame: HTMLElement, geo: MorphGeo, mode: "words" | "characters"): Token[] {
  const box = frame.getBoundingClientRect();
  const split = segmenter(mode);
  const tokens: Token[] = [];
  const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  const left = geo.left / AUTOFIT_EMU_PER_PX;
  const top = geo.top / AUTOFIT_EMU_PER_PX;
  const width = geo.width / AUTOFIT_EMU_PER_PX;
  const height = geo.height / AUTOFIT_EMU_PER_PX;
  const centreX = left + width / 2;
  const centreY = top + height / 2;
  const turn = (geo.rotation * Math.PI) / 180;
  for (let node = walker.nextNode(); node && tokens.length < MAX_TOKENS; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (!parent || !text.trim()) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none") continue;
    for (const { segment, index } of split(text)) {
      if (!segment.trim()) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width <= 0) continue;
      // The word's centre in the object's frame, then turned with it.
      const localX = left + (rect.left - box.left) + rect.width / 2;
      const localY = top + (rect.top - box.top) + rect.height / 2;
      const dx = localX - centreX;
      const dy = localY - centreY;
      tokens.push({
        text: segment,
        x: centreX + dx * Math.cos(turn) - dy * Math.sin(turn),
        y: centreY + dx * Math.sin(turn) + dy * Math.cos(turn),
        rotation: geo.rotation,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        fontSize: Number.parseFloat(style.fontSize) || 16,
        color: style.color,
        letterSpacing: style.letterSpacing,
      });
      if (tokens.length >= MAX_TOKENS) break;
    }
  }
  return tokens;
}

/** Pairs of indexes of the longest common run of equal words, in order. */
export function pairTokens(from: readonly string[], to: readonly string[]): Array<[number, number]> {
  const rows = from.length;
  const cols = to.length;
  const table: Uint16Array[] = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i]![j] = from[i] === to[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (from[i] === to[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

type Flight = { key: string; text: string; from: Token | null; to: Token | null };

export function PresentationMorphText({
  pairs,
  fromSlide,
  toSlide,
  theme,
  masters,
  bounds,
  durationMs,
  mode,
  playing,
}: {
  pairs: readonly MorphTextPair[];
  fromSlide: SlideModel;
  toSlide: SlideModel;
  theme?: DeckTheme;
  masters?: readonly SlideMaster[];
  bounds: { width: number; height: number };
  durationMs: number;
  mode: "words" | "characters";
  playing: boolean;
}) {
  const framesRef = useRef<HTMLDivElement | null>(null);
  const [flights, setFlights] = useState<Flight[] | null>(null);

  useLayoutEffect(() => {
    const frames = framesRef.current;
    if (flights || !frames) return;
    const out: Flight[] = [];
    pairs.forEach((pair, index) => {
      const fromFrame = frames.querySelector<HTMLElement>(`[data-morph-text="${index}-from"]`);
      const toFrame = frames.querySelector<HTMLElement>(`[data-morph-text="${index}-to"]`);
      if (!fromFrame || !toFrame) return;
      const before = readTokens(fromFrame, pair.fromGeo, mode);
      const after = readTokens(toFrame, pair.toGeo, mode);
      const matched = pairTokens(before.map((token) => token.text), after.map((token) => token.text));
      const takenBefore = new Set(matched.map(([a]) => a));
      const takenAfter = new Set(matched.map(([, b]) => b));
      for (const [a, b] of matched) out.push({ key: `${pair.id}-m${a}-${b}`, text: before[a]!.text, from: before[a]!, to: after[b]! });
      before.forEach((token, a) => {
        if (!takenBefore.has(a)) out.push({ key: `${pair.id}-o${a}`, text: token.text, from: token, to: null });
      });
      after.forEach((token, b) => {
        if (!takenAfter.has(b)) out.push({ key: `${pair.id}-i${b}`, text: token.text, from: null, to: token });
      });
    });
    setFlights(out);
  }, [flights, pairs, mode]);

  const designWidth = bounds.width / AUTOFIT_EMU_PER_PX;
  const designHeight = bounds.height / AUTOFIT_EMU_PER_PX;
  const transition =
    `left ${durationMs}ms ease-in-out, top ${durationMs}ms ease-in-out, ` +
    `font-size ${durationMs}ms ease-in-out, color ${durationMs}ms ease-in-out, ` +
    `transform ${durationMs}ms ease-in-out, opacity ${durationMs}ms ease-in-out`;
  const place = (token: Token, opacity: number): CSSProperties => ({
    position: "absolute",
    left: `${(token.x / designWidth) * 100}%`,
    top: `${(token.y / designHeight) * 100}%`,
    // Longhands only: a `font` shorthand beside them reset the line height
    // whenever the word took its end style (React warns of exactly this).
    fontFamily: token.fontFamily,
    fontWeight: token.fontWeight,
    fontStyle: token.fontStyle,
    fontSize: token.fontSize,
    color: token.color,
    letterSpacing: token.letterSpacing,
    whiteSpace: "pre",
    lineHeight: 1,
    transform: `translate(-50%, -50%) rotate(${token.rotation}deg)`,
    opacity,
    transition,
    pointerEvents: "none",
  });

  return (
    <>
      {!flights ? (
        // Off screen and transparent, not `visibility: hidden`: the words are
        // read where they are visible, and hidden would be inherited by all.
        <div ref={framesRef} aria-hidden="true" style={{ position: "fixed", left: -100_000, top: 0, opacity: 0, pointerEvents: "none" }}>
          {pairs.map((pair, index) => (
            <div key={pair.id}>
              {(["from", "to"] as const).map((side) => {
                const block = side === "from" ? pair.from : pair.to;
                return (
                  <div
                    key={side}
                    data-morph-text={`${index}-${side}`}
                    style={{
                      position: "relative",
                      width: Math.max(1, (geometryNumber(block, "width") ?? 0) / AUTOFIT_EMU_PER_PX),
                      height: Math.max(1, (geometryNumber(block, "height") ?? 0) / AUTOFIT_EMU_PER_PX),
                    }}
                  >
                    <PresentationBlockView
                      block={block}
                      bounds={bounds}
                      theme={theme}
                      slide={side === "from" ? fromSlide : toSlide}
                      masters={masters}
                      fillParent
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
      {flights ? (
        <div aria-hidden="true" data-testid="presentation-morph-text" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
          {flights.map((flight) => {
            const start = flight.from ?? flight.to!;
            const end = flight.to ?? flight.from!;
            const style = playing ? place(end, flight.to ? 1 : 0) : place(start, flight.from ? 1 : 0);
            return (
              <span key={flight.key} style={style}>
                {flight.text}
              </span>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
