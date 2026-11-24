"use client";













































/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "../../../host/next-intl";

import { PointerContextMenu } from "../ui/PointerContextMenu";
import { ToastAction } from "../ui/toast";
import { toast } from "../../hooks/use-toast";
import { inkPointerArbiter } from "../../lib/ink-pointer-policy";
import { WET_INK_SETTLE_MS } from "../../lib/office-wet-ink";
import {
  createOfficeInkStrokeGrouper,
  isOfficeInkRecognitionMode,
  officeInkSameLine,
  OFFICE_INK_CONVERSION_MAX_STROKES,
  OFFICE_INK_CONVERSION_PAUSE_MS,
  OFFICE_INK_MATH_CONTINUE_MS,
  OFFICE_INK_MATH_MAX_STROKES,
  OFFICE_INK_MATH_PAUSE_MAX_MS,
  OFFICE_INK_MATH_PAUSE_MS,
  OFFICE_INK_PAUSE_LEARNING_FACTOR,
  OFFICE_INK_TEXT_PAUSE_MAX_MS,
  officeInkBoundsEndingAt,
  officeInkBoundsMoved,
  officeInkContinuesLine,
  officeInkStrokesFitted,
  type OfficeInkBounds,
  type OfficeInkConversionMode,
  type OfficeInkRecognitionMode,
  officeInkSeparateEquations,
  type OfficeInkStrokeGrouper,
} from "../../lib/office-ink-conversion";
import {
  INK_MATH_PRIVACY_STORAGE_KEY,
  inkMathPrivacyAcknowledged,
  officeInkReadingNeedsConsent,
  type InkMathPoint,
} from "../../lib/office-ink-math";
import {
  startOfficeInkFlight,
  type OfficeInkFlight,
  type OfficeInkFlightStroke,
  type OfficeInkLanding,
} from "../../lib/office-ink-flight";
import { loadOfficeInkRecognitionCapability, readOfficeInkStrokes } from "../../lib/office-ink-recognition";

export interface OfficeInkConversionHost<T> {
  /** The page whose server reads the strokes. */
  readonly pageId: string | null | undefined;
  readonly mode: OfficeInkConversionMode | null;
  /** Each stroke of the group as it stands now (one space for all), or null when one is gone. */
  readonly measure: (group: readonly T[]) => readonly (readonly InkMathPoint[])[] | null;
  /**
   * Replace the group's strokes by the reading where they were, one Undo
   * step. False (and nothing changed) when a stroke changed meanwhile.
   * `context.keep` is writing still waiting to be read: where the editor's
   * layout moves it, the editor puts it back where it was on screen (and
   * says so through `context.replaced`).
   */
  readonly apply: (
    group: readonly T[],
    mode: OfficeInkRecognitionMode,
    value: string,
    context?: OfficeInkApplyContext<T>,
  ) => boolean;
  readonly testIdPrefix: string;
  /**
   * The element the group's ink scrolls and zooms with (the page column, the
   * slide, the grid): the conversion's motion is drawn in it, so it moves
   * with the page. Without it the motion is pinned to the viewport.
   */
  readonly flightLayer?: (group: readonly T[]) => Element | null;
  /**
   * The group as drawn on screen (client pixels, colour, width), for the
   * conversion's motion (lib/office-ink-flight). Without it the reading
   * replaces the ink with no motion.
   */
  readonly clientStrokes?: (group: readonly T[]) => readonly OfficeInkFlightStroke[] | null;
  /** Where the last applied reading landed on screen, read after it rendered. */
  readonly landed?: (group: readonly T[], mode: OfficeInkRecognitionMode) => OfficeInkLanding | null;
  /**
   * More writing right after the equation just made: replace that equation
   * by the reading of all the writing and remove `group`'s strokes, one Undo
   * step. False (nothing changed) when the equation is gone; the reading is
   * then placed as a new one. Without it every pause makes its own equation.
   * `landed` must then answer where that equation stands now.
   */
  readonly extendLastEquation?: (group: readonly T[], latex: string) => boolean;
  /**
   * Converted text the writer may correct from the recogniser's other
   * readings (Ink to Text). Without it a reading's alternatives are dropped.
   */
  readonly corrections?: OfficeInkCorrectionHost;
}

/**
 * Where an editor keeps the text a reading became, for its correction menu:
 * a key it finds that text by again (a tracked range, a text box's id).
 */
export interface OfficeInkCorrectionHost {
  /** The text the reading just applied became: its key, or null. Asked right after `apply` succeeded. */
  readonly landed: () => string | null;
  /** The text at `key` now; null when it is gone. */
  readonly textOf: (key: string) => string | null;
  /** The row (client rect) of the text at `key` a client point is on, or null when it is not on it. */
  readonly rowAt: (key: string, clientX: number, clientY: number) => OfficeInkTextRow | null;
  /** Put `text` in place of the text at `key`, one Undo step; false when it cannot. */
  readonly replace: (key: string, text: string) => boolean;
}

/** A row of converted text on screen (client pixels). */
export interface OfficeInkTextRow {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * A tap's own click (a pen's or finger's compatibility click lands where
 * the menu now is) does not pick a correction: only a choice made after
 * this long since the menu opened.
 */
export const OFFICE_INK_CORRECTION_ARM_MS = 400;

export interface OfficeInkApplyContext<T> {
  /** Strokes still waiting to be read, or being read: they stay where they are on screen. */
  readonly keep: readonly T[];
  /** The editor rewrote kept stroke `from` (to hold it still): `to` stands for it from now on. */
  readonly replaced: (from: T, to: T) => void;
}

export interface OfficeInkConversion<T> {
  /**
   * A stroke landed as ink. True when it joined a piece of writing waiting
   * to be read (the mode is on and the server reads handwriting).
   */
  readonly strokeCommitted: (stroke: T) => boolean;
  /**
   * Read these strokes now and replace them (ink selected, then Ink to Math
   * or Ink to Text pressed: `pressOfficeInkConvert`). Asks for the consent
   * first where one is needed and not given; says so when nothing could be
   * read (the ink stays).
   */
  readonly convertNow: (group: readonly T[], mode: OfficeInkRecognitionMode) => void;
  /** A reading is in flight. */
  readonly reading: boolean;
  /**
   * A tap at a client point (a pen's tap while drawing, a click otherwise):
   * on text a reading became, and that has not been edited since, it opens
   * the correction menu and is taken (true); anywhere else it is not.
   */
  readonly correctionTap: (clientX: number, clientY: number) => boolean;
  /** The correction menu while it is open (the editor renders it). */
  readonly correctionMenu: ReactNode;
}

/** The most converted texts an editor keeps correctable (the latest ones). */
export const OFFICE_INK_CORRECTIONS_KEPT = 50;

type Capability = "unknown" | "available" | "unavailable";
type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

/** The codes that mean the server cannot read handwriting (no reader installed, or the workspace does not let it). */
function unavailableCode(code: string | null): boolean {
  return Boolean(
    code &&
      (code.startsWith("workspace_ai_egress") ||
        code.startsWith("ai_egress") ||
        code.startsWith("ink_recognizer_")),
  );
}

function showUnavailableNotice(t: Translate, mode: OfficeInkRecognitionMode): void {
  toast({ title: t(mode === "math" ? "toolbar.inkMath.unavailable" : "toolbar.inkText.unavailable") });
}

function showPrivacyNotice(t: Translate, prefix: string, onAgree: () => void): void {
  const agree = t("toolbar.inkMath.privacyAgree");
  toast({
    title: t("toolbar.inkMath.privacy"),
    duration: Number.POSITIVE_INFINITY,
    action: (
      <ToastAction altText={agree} data-testid={`${prefix}-ink-privacy-agree`} onClick={onAgree}>
        {agree}
      </ToastAction>
    ),
  });
}

type ScreenBox = OfficeInkBounds;

function screenBox(strokes: readonly Pick<OfficeInkFlightStroke, "points">[] | null): ScreenBox | null {
  let box: ScreenBox | null = null;
  for (const stroke of strokes ?? []) {
    for (const { x, y } of stroke.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      box = box
        ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) }
        : { left: x, top: y, right: x, bottom: y };
    }
  }
  return box;
}

function boxOfRect(rect: { left: number; top: number; width: number; height: number }): ScreenBox {
  return { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
}

/**
 * Where the equation's symbols are on screen: the typeset math itself, not
 * what holds it. A display equation's block is as wide as the page and a
 * sheet's box as wide as the handwriting was; measured by those, "right
 * after the equation" was somewhere the writer never looked.
 */
function equationExtent(landing: OfficeInkLanding): ScreenBox {
  const element = landing.element;
  if (element && typeof element.querySelectorAll === "function") {
    let box: ScreenBox | null = null;
    for (const part of Array.from(element.querySelectorAll(".katex-html .base, .ML__base"))) {
      const rect = part.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      box = box
        ? {
            left: Math.min(box.left, rect.left),
            top: Math.min(box.top, rect.top),
            right: Math.max(box.right, rect.right),
            bottom: Math.max(box.bottom, rect.bottom),
          }
        : boxOfRect(rect);
    }
    if (box) return box;
  }
  return boxOfRect(landing.rect);
}

/**
 * A stroke belongs with writing whose reading is still out when it lands
 * next to it: within about one writing height of its box on each side (a
 * superscript to the upper right, a denominator below a bar). Without screen
 * geometry it does.
 */
function besideBox(previous: ScreenBox | null, next: ScreenBox | null): boolean {
  if (!previous || !next) return true;
  const reach = Math.max(24, previous.bottom - previous.top, next.bottom - next.top) * 1.2;
  return (
    next.left <= previous.right + reach &&
    next.right >= previous.left - reach &&
    next.top <= previous.bottom + reach &&
    next.bottom >= previous.top - reach
  );
}

/**
 * The hand is writing: a stroke is down, or one lifted so lately that it is
 * still wet ink on its way into the document (lib/office-wet-ink).
 */
export const OFFICE_INK_HAND_SETTLE_MS = WET_INK_SETTLE_MS + 240;

function inkHandBusy(): boolean {
  if (inkPointerArbiter.strokeRunning()) return true;
  const ended = inkPointerArbiter.lastStrokeEndedAt;
  if (ended === null) return false;
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  return now - ended >= 0 && now - ended < OFFICE_INK_HAND_SETTLE_MS;
}

/**
 * Where the strokes begun after `since` (performance time) began, as points
 * (client pixels): the pen's latest writing, some of it perhaps still wet.
 */
function strokesBegunSince(since: number): ScreenBox[] {
  return inkPointerArbiter
    .strokeStartsSince(since)
    .map(({ x, y }) => ({ left: x, top: y, right: x, bottom: y }));
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/**
 * Resolves once a piece of writing may be replaced while the hand goes on:
 * no stroke is being drawn, and the hand rests or writes elsewhere (no
 * stroke begun since `since` goes on with this piece -- `goesOn`: the same
 * line of text, an equation's neighbourhood; one may still be wet, on its
 * way into the document, and would come back as a second reading). `box` is
 * where the piece is now (null when it cannot be measured: then the hand
 * must rest).
 */
function clearOfTheHand(
  signal: AbortSignal,
  box: () => ScreenBox | null,
  since: number,
  goesOn: (piece: ScreenBox, start: ScreenBox) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (signal.aborted || !inkHandBusy()) {
        resolve();
        return;
      }
      if (!inkPointerArbiter.strokeRunning()) {
        const begun = strokesBegunSince(since);
        const starts = begun.length > 0 ? begun : strokesBegunSince(Number.NEGATIVE_INFINITY).slice(-1);
        const piece = box();
        if (piece && starts.length > 0 && !starts.some((start) => goesOn(piece, start))) {
          resolve();
          return;
        }
      }
      setTimeout(check, 60);
    };
    check();
  });
}

/** After the reading has rendered (two frames, as the ink's flight waits). */
function afterRender(run: () => void): void {
  if (typeof requestAnimationFrame !== "function") {
    setTimeout(run, 50);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(run));
}

/** The equation the last piece of writing became, for writing that goes on with it. */
interface MadeEquation {
  readonly pageId: string;
  /** Every stroke it was read from, as they stood on screen then (client px). */
  readonly strokes: readonly (readonly InkMathPoint[])[];
  /** What it was read as. */
  readonly latex: string;
  readonly box: ScreenBox;
  /** Where the equation stood once it had rendered. */
  landing: ScreenBox | null;
  /** When it was made (`Date.now()`). */
  readonly at: number;
  /** The pause that read it. */
  readonly pause: number;
}

/** A reading's strokes; the editor may rewrite one meanwhile (`OfficeInkApplyContext.replaced`). */
interface ReadingGroup<T> {
  group: readonly T[];
}

/** A reading a pause began, until it lands or is dropped. */
interface PausedReading<T> {
  readonly holder: ReadingGroup<T>;
  readonly mode: OfficeInkRecognitionMode;
  readonly box: ScreenBox | null;
  readonly began: number;
}

export function useOfficeInkConversion<T>(host: OfficeInkConversionHost<T>): OfficeInkConversion<T> {
  const t = useTranslations("console-notebooks");
  // Ink to Text reads in the writer's language first: the language they use the app in.
  const locale = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const hostRef = useRef(host);
  hostRef.current = host;
  const tRef = useRef(t);
  tRef.current = t;
  const capabilityRef = useRef<Capability>("unknown");
  // Whether a reading sends the handwriting to an AI service (consent applies).
  const needsConsentRef = useRef(true);
  const privacyRef = useRef(false);
  const failedNoticeRef = useRef(false);
  const readingsRef = useRef(new Set<AbortController>());
  // The motion of each reading in flight (cancelled with it).
  const flightsRef = useRef(new Map<AbortController, OfficeInkFlight>());
  // The strokes of each reading in flight.
  const groupsRef = useRef(new Map<AbortController, ReadingGroup<T>>());
  // The readings the pen's pauses began, so a stroke landing next to one
  // that has not come back takes its strokes back.
  const pausedReadingsRef = useRef(new Map<AbortController, PausedReading<T>>());
  // When the pending piece of writing began (`Date.now()` at its first stroke).
  const pendingBeganRef = useRef<number | null>(null);
  // The pause as readings that turned out early have lengthened it.
  const learnedPauseRef = useRef(0);
  const [reading, setReading] = useState(false);
  const lastEquationRef = useRef<MadeEquation | null>(null);
  // The converted texts that can be corrected, oldest first: the text as
  // placed (a correction applies only while it still says that) and every
  // reading the recogniser offered for it.
  const correctionsRef = useRef(new Map<string, { text: string; choices: readonly string[] }>());
  const [correctionMenuAt, setCorrectionMenuAt] = useState<{
    key: string;
    x: number;
    y: number;
    openedAt: number;
    /** The text as it stands and the readings offered, when the menu opened. */
    text: string;
    choices: readonly string[];
  } | null>(null);
  const recognitionMode = isOfficeInkRecognitionMode(host.mode) ? host.mode : null;

  /** The consent stands: none is needed, or it was given. */
  const consented = useCallback((): boolean => {
    if (!needsConsentRef.current) return true;
    if (privacyRef.current || inkMathPrivacyAcknowledged()) {
      privacyRef.current = true;
      return true;
    }
    return false;
  }, []);

  // The grouper (made below, once), for the helpers that run before it exists.
  const grouperRef = useRef<OfficeInkStrokeGrouper<T> | null>(null);
  /** Every stroke still waiting to be read, or being read, but `controller`'s. */
  const keptWriting = useCallback((controller: AbortController): T[] => {
    const kept: T[] = [...(grouperRef.current?.pending() ?? [])];
    for (const [other, holder] of groupsRef.current) {
      if (other !== controller) kept.push(...holder.group);
    }
    return kept;
  }, []);
  /** The editor rewrote a waiting stroke to hold it still: every holder of it follows. */
  const replaceStroke = useCallback((from: T, to: T) => {
    grouperRef.current?.replace(from, to);
    for (const holder of groupsRef.current.values()) {
      if (holder.group.includes(from)) holder.group = holder.group.map((stroke) => (stroke === from ? to : stroke));
    }
  }, []);
  /** The readings still out redraw their writing where it is now. */
  const followWriting = useCallback(() => {
    for (const [controller, flight] of flightsRef.current) {
      const holder = groupsRef.current.get(controller);
      if (!holder) continue;
      try {
        const moved = hostRef.current.clientStrokes?.(holder.group);
        if (moved) flight.redraw(moved);
      } catch {
        /* the motion is only a courtesy */
      }
    }
  }, []);

  // `read` itself, for a reading that reads its strokes again on their own.
  const readRef = useRef<
    | ((
        group: readonly T[],
        mode: OfficeInkRecognitionMode,
        paused: { readonly began: number; readonly pause: number } | null,
        join?: boolean,
      ) => void)
    | null
  >(null);

  /**
   * Read one piece of writing and hand it to the editor. A mode's reading
   * (`paused`: the pause that began it, and when the writing began) is
   * dropped when the mode went off or changed meanwhile.
   */
  const read = useCallback(
    (
      group: readonly T[],
      mode: OfficeInkRecognitionMode,
      paused: { readonly began: number; readonly pause: number } | null,
      /** False: read these strokes alone, never with the equation just made. */
      join = true,
    ) => {
      const whileOn = paused !== null;
      const live = hostRef.current;
      const pageId = live.pageId;
      if (!pageId) return;
      const measured = live.measure(group);
      if (!measured || measured.length === 0) return;
      let screen: readonly OfficeInkFlightStroke[] | null = null;
      try {
        screen = live.clientStrokes?.(group) ?? null;
      } catch {
        screen = null;
      }
      const box = screenBox(screen);
      const written = screen ? screen.map((stroke) => stroke.points) : null;
      // Writing that goes on with the equation just made is read together
      // with what that equation was read from, laid where the writer sees it:
      // ending where the typeset equation ends when the new writing follows
      // that, else where its ink stood (the equation may have landed
      // elsewhere).
      const previous = lastEquationRef.current;
      let joined: readonly (readonly InkMathPoint[])[] | null = null;
      if (
        join &&
        mode === "math" &&
        paused &&
        live.extendLastEquation &&
        previous &&
        previous.pageId === pageId &&
        paused.began - previous.at <= OFFICE_INK_MATH_CONTINUE_MS &&
        box &&
        written
      ) {
        let equationNow: ScreenBox | null = null;
        try {
          const landing = live.landed?.(group, mode) ?? null;
          equationNow = landing ? equationExtent(landing) : null;
        } catch {
          equationNow = null;
        }
        if (equationNow && officeInkContinuesLine(equationNow, box)) {
          // (how much the page has zoomed since the equation landed)
          const zoom =
            previous.landing && previous.landing.bottom > previous.landing.top
              ? (equationNow.bottom - equationNow.top) / (previous.landing.bottom - previous.landing.top)
              : 1;
          joined = [
            ...officeInkStrokesFitted(
              previous.strokes,
              previous.box,
              officeInkBoundsEndingAt(previous.box, equationNow, zoom),
            ),
            ...written,
          ];
        } else {
          const inkNow =
            previous.landing && equationNow
              ? officeInkBoundsMoved(previous.box, previous.landing, equationNow)
              : previous.box;
          if (officeInkContinuesLine(inkNow, box)) {
            joined = [...officeInkStrokesFitted(previous.strokes, previous.box, inkNow), ...written];
          }
        }
      }
      const extending = joined !== null;
      const strokes = joined ?? measured;
      const controller = new AbortController();
      const holder: ReadingGroup<T> = { group };
      // When this writing was handed over: strokes begun after it beside it are more of it.
      const handedAt = performanceNow();
      readingsRef.current.add(controller);
      groupsRef.current.set(controller, holder);
      if (paused) pausedReadingsRef.current.set(controller, { holder, mode, box, began: paused.began });
      setReading(true);
      let flight: OfficeInkFlight | null = null;
      try {
        flight = startOfficeInkFlight(screen, live.flightLayer?.(group) ?? null);
      } catch {
        flight = null;
      }
      if (flight) flightsRef.current.set(controller, flight);
      // The server's answer (cached per page) comes first: strokes written
      // before it arrived were kept waiting rather than dropped.
      void loadOfficeInkRecognitionCapability(pageId)
        .then((capability) => {
          if (controller.signal.aborted) return { kind: "unread" as const };
          if (!capability.available) return { kind: "failed" as const, code: "ink_recognizer_not_installed" };
          needsConsentRef.current = officeInkReadingNeedsConsent(capability);
          if (!consented()) return { kind: "unread" as const };
          return readOfficeInkStrokes(pageId, mode, strokes, {
            signal: controller.signal,
            language: localeRef.current,
          });
        })
        .then(async (outcome) => {
          if (controller.signal.aborted) return;
          // Nothing is replaced under a pen that is writing: the reading
          // waits until no stroke is down and the hand rests or writes
          // elsewhere (the next line, the next equation), and a stroke that
          // lands beside it meanwhile drops it (its strokes wait with the new
          // ones).
          if (whileOn && outcome.kind === "read") {
            await clearOfTheHand(
              controller.signal,
              () => {
                try {
                  return screenBox(hostRef.current.clientStrokes?.(holder.group) ?? null);
                } catch {
                  return null;
                }
              },
              handedAt,
              mode === "text" ? officeInkSameLine : besideBox,
            );
          }
          if (controller.signal.aborted) return;
          // From here the writing is being replaced: a stroke landing now is
          // new writing, not this reading's.
          pausedReadingsRef.current.delete(controller);
          const now = hostRef.current;
          if (now.pageId !== pageId || (whileOn && now.mode !== mode)) return;
          if (outcome.kind === "read") {
            // Where the writing is now (the page may have scrolled), then
            // the reading in its place and the ink flying into it.
            const group = holder.group;
            try {
              const moved = now.clientStrokes?.(group);
              if (moved && flight) flight.redraw(moved);
            } catch {
              /* the motion is only a courtesy */
            }
            // Read together with the equation, the writing said nothing
            // more than the equation does: the new strokes are read on
            // their own and placed where they were written, rather than
            // vanishing into an equation that did not change.
            if (extending && previous && outcome.value.trim() === previous.latex.trim() && paused) {
              flightsRef.current.get(controller)?.cancel();
              flightsRef.current.delete(controller);
              readRef.current?.(group, mode, paused, false);
              return;
            }
            const extended =
              extending && now.extendLastEquation ? now.extendLastEquation(group, outcome.value) : false;
            const applied =
              extended ||
              now.apply(group, mode, outcome.value, {
                keep: keptWriting(controller),
                replaced: replaceStroke,
              });
            // Text the recogniser had other readings for can be corrected:
            
            const alternatives = outcome.alternatives ?? [];
            if (applied && !extended && mode === "text" && alternatives.length > 0 && now.corrections) {
              try {
                const key = now.corrections.landed();
                const placed = key === null ? null : now.corrections.textOf(key);
                if (key !== null && placed) {
                  const corrections = correctionsRef.current;
                  corrections.delete(key);
                  corrections.set(key, { text: placed, choices: [outcome.value, ...alternatives] });
                  while (corrections.size > OFFICE_INK_CORRECTIONS_KEPT) {
                    corrections.delete(corrections.keys().next().value as string);
                  }
                }
              } catch {
                /* the correction is a courtesy */
              }
            }
            // The other readings' motions follow their writing if it moved.
            if (applied) afterRender(followWriting);
            if (applied) {
              // The pause that read the first part was short for this
              // writer: longer from here on.
              if (extended && previous) {
                learnedPauseRef.current = Math.min(
                  OFFICE_INK_MATH_PAUSE_MAX_MS,
                  Math.max(learnedPauseRef.current, previous.pause * OFFICE_INK_PAUSE_LEARNING_FACTOR),
                );
              }
              const kept = extended && joined ? joined : written;
              const keptBox = kept ? screenBox(kept.map((points) => ({ points }))) : null;
              const made: MadeEquation | null =
                mode === "math" && paused && kept && keptBox
                  ? { pageId, strokes: kept, latex: outcome.value, box: keptBox, landing: null, at: Date.now(), pause: paused.pause }
                  : null;
              lastEquationRef.current = made;
              if (made) {
                afterRender(() => {
                  if (lastEquationRef.current !== made) return;
                  try {
                    const landing = hostRef.current.landed?.(group, mode) ?? null;
                    made.landing = landing ? equationExtent(landing) : null;
                  } catch {
                    made.landing = null;
                  }
                });
              }
            }
            if (applied && flight) {
              const landing = flight;
              flightsRef.current.delete(controller);
              landing.land(() => hostRef.current.landed?.(group, mode) ?? null);
            }
            return;
          }
          // Ink selected and converted on purpose that says nothing (a
          // drawing, a smudge): the writer hears so, and the ink stays. A
          // mode's pause that read nothing stays silent, as before.
          if (!whileOn && outcome.kind === "unread") {
            toast({
              title: tRef.current(mode === "math" ? "toolbar.inkMath.unrecognized" : "toolbar.inkText.unrecognized"),
            });
            return;
          }
          if (outcome.kind !== "failed" || failedNoticeRef.current) return;
          // Once per time the mode is on: the server cannot read now, or
          // has no reader; the ink stays.
          failedNoticeRef.current = true;
          if (unavailableCode(outcome.code)) {
            capabilityRef.current = "unavailable";
            showUnavailableNotice(tRef.current, mode);
            return;
          }
          toast({ title: tRef.current("toolbar.inkMath.failed"), variant: "destructive" });
        })
        .finally(() => {
          flightsRef.current.get(controller)?.cancel();
          flightsRef.current.delete(controller);
          pausedReadingsRef.current.delete(controller);
          readingsRef.current.delete(controller);
          groupsRef.current.delete(controller);
          if (readingsRef.current.size === 0) setReading(false);
        });
    },
    [consented, followWriting, keptWriting, replaceStroke],
  );
  useEffect(() => {
    readRef.current = read;
  }, [read]);

  const [grouper] = useState<OfficeInkStrokeGrouper<T>>(() =>
    createOfficeInkStrokeGrouper<T>({
      pauseMs: () =>
        hostRef.current.mode === "math"
          ? Math.max(OFFICE_INK_MATH_PAUSE_MS, learnedPauseRef.current)
          : OFFICE_INK_CONVERSION_PAUSE_MS,
      maxPauseMs: () =>
        hostRef.current.mode === "math" ? OFFICE_INK_MATH_PAUSE_MAX_MS : OFFICE_INK_TEXT_PAUSE_MAX_MS,
      maxStrokes: () =>
        hostRef.current.mode === "math" ? OFFICE_INK_MATH_MAX_STROKES : OFFICE_INK_CONVERSION_MAX_STROKES,
      // A stop is from one stroke's lift to the next one's touch.
      strokeStartedAt: () => inkPointerArbiter.lastStrokeBeganAt,
      onPause: (group, pause) => {
        const began = pendingBeganRef.current ?? Date.now();
        pendingBeganRef.current = null;
        const mode = hostRef.current.mode;
        if (isOfficeInkRecognitionMode(mode)) read(group, mode, { began, pause });
      },
      // A stroke still being drawn (or still wet) when the pause ends extends the group.
      isBusy: inkHandBusy,
      // Ink to Text: each line is its own piece, read once the pen has left it.
      regional: () => hostRef.current.mode === "text",
      boxOf: (strokes) => screenBox(hostRef.current.clientStrokes?.(strokes) ?? null),
      writingSince: strokesBegunSince,
    }),
  );
  useEffect(() => {
    grouperRef.current = grouper;
  }, [grouper]);

  const agree = useCallback(() => {
    privacyRef.current = true;
    try {
      window.localStorage.setItem(INK_MATH_PRIVACY_STORAGE_KEY, "true");
    } catch {
      // The consent then holds for this session only.
    }
  }, []);

  // Each time a reading mode turns on (or the page changes): a fresh piece
  // of writing, the server asked, the notices given once.
  useEffect(() => {
    grouper.cancel();
    for (const controller of readingsRef.current) controller.abort();
    readingsRef.current.clear();
    setReading(false);
    failedNoticeRef.current = false;
    lastEquationRef.current = null;
    pausedReadingsRef.current.clear();
    groupsRef.current.clear();
    pendingBeganRef.current = null;
    learnedPauseRef.current = 0;
    capabilityRef.current = "unknown";
    privacyRef.current = inkMathPrivacyAcknowledged();
    const pageId = host.pageId;
    if (!recognitionMode) return;
    let cancelled = false;
    const prefix = hostRef.current.testIdPrefix;
    const unavailable = () => {
      capabilityRef.current = "unavailable";
      showUnavailableNotice(tRef.current, recognitionMode);
    };
    if (!pageId) {
      unavailable();
      return;
    }
    void loadOfficeInkRecognitionCapability(pageId).then((capability) => {
      if (cancelled) return;
      if (!capability.available) {
        unavailable();
        return;
      }
      capabilityRef.current = "available";
      needsConsentRef.current = officeInkReadingNeedsConsent(capability);
      // Where the handwriting goes to an AI service, the Math Input
      // Control's consent, asked here once: until it is given, what is
      // written stays ink. The built-in readers ask nothing.
      if (!consented()) showPrivacyNotice(tRef.current, prefix, agree);
    });
    return () => {
      cancelled = true;
    };
  }, [agree, consented, grouper, host.pageId, recognitionMode]);

  // Another page: its texts are not this one's.
  useEffect(() => {
    correctionsRef.current.clear();
    setCorrectionMenuAt(null);
  }, [host.pageId]);

  const correctionTap = useCallback((clientX: number, clientY: number): boolean => {
    const corrections = hostRef.current.corrections;
    if (!corrections || correctionsRef.current.size === 0) return false;
    // The latest first: a text corrected over an older one's place is the one under the pen.
    for (const [key, entry] of [...correctionsRef.current].reverse()) {
      let now: string | null = null;
      try {
        now = corrections.textOf(key);
      } catch {
        now = null;
      }
      // Edited (or gone) since: its readings no longer apply to it. A
      // correction undone is one of them again.
      if (now === null || (now !== entry.text && !entry.choices.includes(now))) {
        correctionsRef.current.delete(key);
        continue;
      }
      const current = { ...entry, text: now };
      if (now !== entry.text) correctionsRef.current.set(key, current);
      let row: OfficeInkTextRow | null = null;
      try {
        row = corrections.rowAt(key, clientX, clientY);
      } catch {
        row = null;
      }
      if (row) {
        // Under the row, the word left in sight (as Office's suggestions
        // open beside the converted text, not over it).
        setCorrectionMenuAt({
          key,
          x: clientX,
          y: row.bottom + 4,
          openedAt: performance.now(),
          text: current.text,
          choices: current.choices,
        });
        return true;
      }
    }
    return false;
  }, []);

  const pickCorrection = useCallback((key: string, choice: string) => {
    const corrections = hostRef.current.corrections;
    const entry = correctionsRef.current.get(key);
    if (!corrections || !entry) return;
    const now = corrections.textOf(key);
    if (now === null || (now !== entry.text && !entry.choices.includes(now))) {
      correctionsRef.current.delete(key);
      return;
    }
    if (choice === now) return;
    if (corrections.replace(key, choice)) {
      const placed = corrections.textOf(key);
      if (placed) correctionsRef.current.set(key, { ...entry, text: placed });
      else correctionsRef.current.delete(key);
    }
  }, []);

  const menuEntry = correctionMenuAt;
  const correctionMenu: ReactNode =
    correctionMenuAt && menuEntry ? (
      <PointerContextMenu
        x={correctionMenuAt.x}
        y={correctionMenuAt.y}
        label={t("toolbar.inkText.suggestions")}
        heading={t("toolbar.inkText.suggestions")}
        testId={`${host.testIdPrefix}-ink-correction-menu`}
        onClose={() => setCorrectionMenuAt(null)}
        entries={[menuEntry.text, ...menuEntry.choices.filter((choice) => choice !== menuEntry.text)]
          .filter((choice, index, all) => all.indexOf(choice) === index)
          .map((choice, index) => ({
            id: `choice-${index}`,
            // A reading of several lines shows them on one row.
            label: choice.replace(/\n/g, " / "),
            checked: choice === menuEntry.text,
            testId: `${host.testIdPrefix}-ink-correction-${index}`,
            // Closed here, not by the menu: the opening tap's own click is ignored.
            keepOpen: true,
            onSelect: () => {
              if (performance.now() - correctionMenuAt.openedAt < OFFICE_INK_CORRECTION_ARM_MS) return;
              setCorrectionMenuAt(null);
              pickCorrection(correctionMenuAt.key, choice);
            },
          }))}
      />
    ) : null;

  // Leaving the editor drops what was waiting.
  useEffect(
    () => () => {
      grouper.cancel();
      for (const controller of readingsRef.current) controller.abort();
      readingsRef.current.clear();
    },
    [grouper],
  );

  const strokeCommitted = useCallback(
    (stroke: T): boolean => {
      const live = hostRef.current;
      if (!isOfficeInkRecognitionMode(live.mode)) return false;
      if (capabilityRef.current === "unavailable") return false;
      // Before the server has answered the strokes wait with the group (the
      // reading asks first); once it has, an unconsented reading is not started.
      if (capabilityRef.current === "available" && !consented()) return false;
      // The writer went on before the reading of what they had written came
      // back: that reading is dropped and its strokes wait with this one for
      // the next pause. Nothing is replaced under a pen that is still writing.
      if (pausedReadingsRef.current.size > 0) {
        let strokeBox: ScreenBox | null = null;
        try {
          strokeBox = screenBox(live.clientStrokes?.([stroke]) ?? null);
        } catch {
          strokeBox = null;
        }
        for (const [controller, paused] of [...pausedReadingsRef.current]) {
          if (paused.mode !== live.mode) continue;
          // Where that writing is now (the page may have scrolled since).
          let box = paused.box;
          try {
            box = screenBox(live.clientStrokes?.(paused.holder.group) ?? null) ?? paused.box;
          } catch {
            box = paused.box;
          }
          // Ink to Text: only writing on the same line goes on with it (the
          // next line is a reading of its own); an equation takes its
          // neighbourhood (a superscript, a denominator).
          const goesOn =
            paused.mode === "text" ? !box || !strokeBox || officeInkSameLine(box, strokeBox) : besideBox(box, strokeBox);
          if (!goesOn) continue;
          pausedReadingsRef.current.delete(controller);
          controller.abort();
          grouper.adopt(paused.holder.group);
          pendingBeganRef.current = Math.min(pendingBeganRef.current ?? paused.began, paused.began);
        }
      }
      if (grouper.pending().length === 0) pendingBeganRef.current = Date.now();
      grouper.strokeCommitted(stroke);
      return true;
    },
    [consented, grouper],
  );

  const convertNow = useCallback(
    (group: readonly T[], mode: OfficeInkRecognitionMode) => {
      if (group.length === 0) return;
      const pageId = hostRef.current.pageId;
      if (!pageId) {
        showUnavailableNotice(tRef.current, mode);
        return;
      }
      failedNoticeRef.current = false;
      // The mode may be off: the server is asked here, the answer cached.
      void loadOfficeInkRecognitionCapability(pageId).then((capability) => {
        if (hostRef.current.pageId !== pageId) return;
        if (!capability.available) {
          showUnavailableNotice(tRef.current, mode);
          return;
        }
        needsConsentRef.current = officeInkReadingNeedsConsent(capability);
        if (!consented()) {
          showPrivacyNotice(tRef.current, hostRef.current.testIdPrefix, agree);
          return;
        }
        // Equations selected apart (one line and another further down, or
        // after the text) are read and placed one by one, each where it was
        // written, never joined into one.
        const measured = mode === "math" ? hostRef.current.measure(group) : null;
        const equations =
          measured && measured.length === group.length ? officeInkSeparateEquations(measured) : [];
        if (equations.length < 2) {
          read(group, mode, null);
          return;
        }
        for (const members of equations) read(members.map((index) => group[index]!), mode, null, false);
      });
    },
    [agree, consented, read],
  );

  return { strokeCommitted, convertNow, reading, correctionTap, correctionMenu };
}
