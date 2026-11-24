"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Small "what this does" scenes for options and menu rows, on the shared
 * MiniScene stage (read its house rules first):
 *
 *   - settings previews: a scene beside an option whose words alone do not
 *     show the difference, drawn from the option's CURRENT value and playing
 *     while on screen (theme, reduce motion, week start, clock, spelling,
 *     output wrap)
 *   - the conversation AI menu: each action acts itself out at the row's
 *     trailing edge while the row is hovered or focused
 *   - export menus: the page becoming the file the row writes, in place of
 *     the extension badge while the row is hovered or focused
 *
 * Every shape's CSS is its finished frame; the keyframes animate from the
 * hidden state, so a stilled scene is a complete picture.
 */

import type { CSSProperties, ReactNode } from "react";

import { MiniScene, miniSceneStyles as ms } from "./MiniScene";
import styles from "./OptionScenes.module.css";

/* ── settings previews ─────────────────────────────────────────────── */

const PREVIEW_WIDTH = 76;
const PREVIEW_HEIGHT = 40;

function Preview({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <MiniScene
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      play="view"
      tone="var(--option-scene-ink)"
      className={`${styles.preview} ${styles.toned}`}
    >
      <span className={styles.root} data-option-scene={kind}>
        {children}
      </span>
    </MiniScene>
  );
}

export type ThemePreviewChoice = "system" | "light" | "dark" | "high-contrast";

/** A tiny window whose surface is the chosen appearance; "system" is half
 * day, half night, the night sweeping across and back. */
export function ThemePreview({ choice }: { choice: ThemePreviewChoice }) {
  return (
    <Preview kind={`theme-${choice}`}>
      <span className={styles.themeWindow} data-mode={choice}>
        <span className={styles.themeSurface}>
          <i className={styles.themeBar} />
          <i className={styles.themeSide} />
          <i className={styles.themeLine} />
          <i className={styles.themeLine} />
          <i className={styles.themeLine} />
        </span>
        {choice === "system" ? (
          <span className={styles.themeNight}>
            <span className={styles.themeNightInner}>
              <i className={styles.themeBar} />
              <i className={styles.themeSide} />
              <i className={styles.themeLine} />
              <i className={styles.themeLine} />
              <i className={styles.themeLine} />
            </span>
          </span>
        ) : null}
        <i className={styles.themeBadge} />
      </span>
    </Preview>
  );
}

/** A block that bounces along when motion is on, and sits still (no trail)
 * when it is reduced. */
export function ReduceMotionPreview({ reduced }: { reduced: boolean }) {
  return (
    <Preview kind={reduced ? "motion-reduced" : "motion-full"}>
      <i className={styles.motionGround} />
      {reduced ? (
        <i className={`${styles.motionBlock} ${styles.motionBlockStill}`} />
      ) : (
        <>
          <svg viewBox="0 0 76 40" className={styles.motionTrail}>
            <path
              d="M8 31c4-18 12-18 16 0M24 31c3-12 9-12 12 0"
              pathLength="1"
            />
          </svg>
          <i className={`${styles.motionBlock} ${styles.motionBlockBounce}`} />
        </>
      )}
    </Preview>
  );
}

/** A row of four commands: tight for a mouse, spaced out for a finger. */
export function TouchModePreview({ on }: { on: boolean }) {
  return (
    <Preview kind={on ? "touch-on" : "touch-off"}>
      <span className={styles.touchRow} data-on={on || undefined}>
        <i className={styles.touchKey} />
        <i className={styles.touchKey} />
        <i className={styles.touchKey} />
        <i className={styles.touchKey} />
      </span>
    </Preview>
  );
}

/** A week of seven cells: the weekend tinted, the first day lit. Monday
 * first leaves both weekend days at the end; Sunday first splits them. */
export function WeekStartPreview({ sundayFirst }: { sundayFirst: boolean }) {
  // 0 = Sunday … 6 = Saturday
  const days = sundayFirst ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  return (
    <Preview kind={sundayFirst ? "week-sunday" : "week-monday"}>
      <span className={`${ms.paper} ${styles.weekCard}`}>
        <i className={styles.weekHead} />
        <span className={styles.weekRow}>
          <b className={styles.weekRing} />
          {days.map((day, index) => (
            <i
              key={day}
              className={styles.weekCell}
              data-weekend={day === 0 || day === 6 ? "" : undefined}
              data-first={index === 0 ? "" : undefined}
              style={{ "--i": index } as CSSProperties}
            />
          ))}
        </span>
      </span>
    </Preview>
  );
}

/** The same afternoon time read on either clock: 14:05, or 2:05 with the
 * lower (afternoon) of two dots lit. Numerals only. */
export function ClockPreview({ hour12 }: { hour12: boolean }) {
  const digits = hour12 ? ["2", ":", "0", "5"] : ["1", "4", ":", "0", "5"];
  return (
    <Preview kind={hour12 ? "clock-12" : "clock-24"}>
      <span className={`${ms.paper} ${styles.clockFace}`}>
        <span className={styles.clockDigits}>
          {digits.map((digit, index) => (
            <span
              key={index}
              className={digit === ":" ? styles.clockColon : styles.clockDigit}
              style={{ "--i": index } as CSSProperties}
            >
              {digit}
            </span>
          ))}
        </span>
        {hour12 ? (
          <span className={styles.clockHalf}>
            <i />
            <i data-on="" />
          </span>
        ) : null}
      </span>
    </Preview>
  );
}

/** Lines of writing; with spelling checked, a wavy underline marks a word. */
export function SpellcheckPreview({ on }: { on: boolean }) {
  return (
    <Preview kind={on ? "spell-on" : "spell-off"}>
      <span className={`${ms.paper} ${styles.spellPage}`}>
        <i className={`${ms.line} ${styles.spellLine}`} />
        <span className={styles.spellWords}>
          <i className={`${ms.line} ${styles.spellWord}`} />
          <i
            className={`${ms.line} ${styles.spellWord}`}
            data-flag={on ? "" : undefined}
          />
          <i className={`${ms.line} ${styles.spellWord}`} />
        </span>
        {on ? (
          <svg viewBox="0 0 16 4" className={styles.spellWave}>
            <path
              d="M1 2.6c1-1.6 2-1.6 3 0s2 1.6 3 0 2-1.6 3 0 2 1.6 3 0 2-1.6 2 0"
              pathLength="1"
            />
          </svg>
        ) : null}
        <i
          className={`${ms.line} ${styles.spellLine} ${styles.spellLineShort}`}
        />
      </span>
    </Preview>
  );
}

/** Run output with one long line: wrapped, it folds onto a second line in
 * the panel; unwrapped, it runs past the edge over a scroll bar. */
export function OutputWrapPreview({ wrap }: { wrap: boolean }) {
  return (
    <Preview kind={wrap ? "wrap-on" : "wrap-off"}>
      <span className={styles.wrapPanel} data-wrap={wrap ? "" : undefined}>
        <i className={styles.wrapPrompt} />
        <i className={`${styles.wrapRun} ${styles.wrapRunA}`} />
        {wrap ? (
          <>
            <svg viewBox="0 0 8 8" className={styles.wrapArrow}>
              <path d="M6 1v3.2H1.6M3.4 2.4 1.6 4.2 3.4 6" pathLength="1" />
            </svg>
            <i className={`${styles.wrapRun} ${styles.wrapRunB}`} />
          </>
        ) : (
          <i className={styles.wrapScroll} />
        )}
        <i className={`${styles.wrapRun} ${styles.wrapRunC}`} />
      </span>
    </Preview>
  );
}

/* ── the conversation AI menu ──────────────────────────────────────── */

export type MessageAISceneAction =
  | "summarize"
  | "decisions"
  | "tasks"
  | "draft_reply";

/** A hover scene for one conversation-AI action, revealed and played only
 * while its menu row is hovered or focused. */
export function MessageAIScene({ action }: { action: MessageAISceneAction }) {
  return (
    <span className={`${styles.reveal} ${styles.aiReveal}`} aria-hidden="true">
      <MiniScene
        width={44}
        height={26}
        play="hover"
        tone="var(--option-scene-ink)"
        className={`${styles.toned} ${styles.aiTone}`}
      >
        <span className={styles.root} data-option-scene={`ai-${action}`}>
          {null}
        </span>
      </MiniScene>
    </span>
  );
}

function AIScene({ action }: { action: MessageAISceneAction }) {
  switch (action) {
    case "summarize":
      // four lines of talk fold into a two-line gist
      return (
        <span className={`${ms.paper} ${styles.aiPage}`}>
          <i className={`${ms.line} ${ms.lead} ${styles.sumLine}`} data-n="1" />
          <i className={`${ms.line} ${styles.sumLine}`} data-n="2" />
          <i className={`${ms.line} ${styles.sumLine}`} data-n="3" />
          <i className={`${ms.line} ${styles.sumLine}`} data-n="4" />
        </span>
      );
    case "decisions":
      // three lines; a check lands on the one that was settled
      return (
        <span className={`${ms.paper} ${styles.aiPage}`}>
          <i className={`${ms.line} ${styles.decLine}`} />
          <i className={`${ms.line} ${styles.decLine} ${styles.decPicked}`} />
          <i className={`${ms.line} ${styles.decLine}`} />
          <svg viewBox="0 0 10 10" className={styles.decCheck}>
            <path
              className={ms.stroke}
              d="M2 5.4 4.2 7.6 8.4 2.6"
              pathLength="1"
            />
          </svg>
        </span>
      );
    case "tasks":
      // three boxes ticked one after another
      return (
        <span className={`${ms.paper} ${styles.aiPage}`}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={styles.taskRow}
              style={{ "--i": index } as CSSProperties}
            >
              <svg viewBox="0 0 6 6" className={styles.taskBox}>
                <rect x="0.6" y="0.6" width="4.8" height="4.8" rx="1.2" />
                <path
                  className={ms.stroke}
                  d="M1.6 3.1 2.6 4.1 4.5 1.9"
                  pathLength="1"
                />
              </svg>
              <i className={`${ms.line} ${styles.taskLine}`} />
            </span>
          ))}
        </span>
      );
    case "draft_reply":
      // a reply bubble written line by line, the pen moving along
      return (
        <span className={styles.draftBubble}>
          <i className={`${ms.line} ${styles.draftLine}`} />
          <i className={`${ms.line} ${styles.draftLine}`} />
          <i className={styles.draftPen} />
        </span>
      );
  }
}

/* ── export menus ──────────────────────────────────────────────────── */

export type ExportSceneKind =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "markdown"
  | "text"
  | "html"
  | "csv"
  | "image";

/**
 * The trailing slot of an export row: the extension badge at rest; while
 * the row is hovered or focused, a scene of a page becoming that file takes
 * the badge's place. The slot keeps one width either way, so nothing moves.
 */
export function ExportSceneTrail({
  kind,
  children,
}: {
  kind: ExportSceneKind;
  /** The resting content: the row's badge. */
  children?: ReactNode;
}) {
  return (
    <span className={styles.trail} data-export-scene={kind}>
      {children}
      <span
        className={`${styles.reveal} ${styles.trailScene}`}
        aria-hidden="true"
      >
        <ExportScene kind={kind} />
      </span>
    </span>
  );
}

/** A page becoming the given file type (the hover scene on its own). */
export function ExportScene({ kind }: { kind: ExportSceneKind }) {
  return (
    <MiniScene
      width={44}
      height={30}
      play="hover"
      tone="var(--option-scene-ink)"
      className={`${styles.toned} ${styles[`tone-${kind}`]}`}
    >
      <span className={styles.root} data-option-scene={`export-${kind}`}>
        <ExportShapes kind={kind} />
      </span>
    </MiniScene>
  );
}

function ExportShapes({ kind }: { kind: ExportSceneKind }) {
  switch (kind) {
    case "pdf":
      // the page is fixed: a frame closes round it and a seal lands
      return (
        <>
          <span className={`${ms.paper} ${styles.exPage}`}>
            <i className={`${ms.line} ${ms.lead} ${styles.exLine}`} />
            <i className={`${ms.line} ${styles.exLine}`} />
            <i className={`${ms.line} ${styles.exLine}`} />
          </span>
          <svg viewBox="0 0 44 30" className={styles.pdfFrame}>
            <path
              d="M14.5 1.5h15a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3v-21a3 3 0 0 1 3-3Z"
              pathLength="1"
            />
          </svg>
          <i className={styles.pdfSeal} />
        </>
      );
    case "docx":
      // a heading, then the paragraph written line by line
      return (
        <span className={`${ms.paper} ${styles.exPage}`}>
          <i
            className={`${ms.line} ${ms.lead} ${styles.exLine} ${styles.docHead}`}
          />
          <i className={`${ms.line} ${styles.exLine} ${styles.docLine}`} />
          <i className={`${ms.line} ${styles.exLine} ${styles.docLine}`} />
          <i className={`${ms.line} ${styles.exLine} ${styles.docLine}`} />
        </span>
      );
    case "xlsx":
      // the page's lines become a grid, and its cells fill
      return (
        <span className={`${ms.paper} ${styles.exSheet}`}>
          {Array.from({ length: 9 }, (_, index) => (
            <i
              key={index}
              className={styles.gridCell}
              data-head={index < 3 ? "" : undefined}
              style={{ "--i": index } as CSSProperties}
            />
          ))}
        </span>
      );
    case "pptx":
      // the upright page turns into a wide slide with a title and a figure
      return (
        <span className={`${ms.paper} ${styles.exSlide}`}>
          <i className={styles.slideTitle} />
          <i className={styles.slideFigure} />
          <i className={styles.slideText} />
        </span>
      );
    case "markdown":
      // the styling drops away: plain lines under a heading mark
      return (
        <span className={`${ms.paper} ${styles.exPage}`}>
          <svg viewBox="0 0 6 6" className={styles.mdHash}>
            <path d="M2.1 0.6 1.6 5.4M4.4 0.6 3.9 5.4M0.6 2h4.8M0.4 4h4.8" />
          </svg>
          <FormattedLines kind="md" />
        </span>
      );
    case "text":
      // every line goes bare: one weight, one colour
      return (
        <span className={`${ms.paper} ${styles.exPage}`}>
          <FormattedLines kind="txt" />
        </span>
      );
    case "html":
      // the page is wrapped in a tag's angle brackets
      return (
        <>
          <span className={`${ms.paper} ${styles.exPage}`}>
            <i className={`${ms.line} ${ms.lead} ${styles.exLine}`} />
            <i className={`${ms.line} ${styles.exLine}`} />
            <i className={`${ms.line} ${styles.exLine}`} />
          </span>
          <svg
            viewBox="0 0 44 30"
            className={`${styles.htmlBracket} ${styles.htmlOpen}`}
          >
            <path
              className={ms.stroke}
              d="M9 10.5 4.5 15 9 19.5"
              pathLength="1"
            />
          </svg>
          <svg
            viewBox="0 0 44 30"
            className={`${styles.htmlBracket} ${styles.htmlClose}`}
          >
            <path
              className={ms.stroke}
              d="M35 10.5 39.5 15 35 19.5"
              pathLength="1"
            />
          </svg>
        </>
      );
    case "csv":
      // a table's cells come apart into values with commas between
      return (
        <span className={styles.csvRows}>
          {[0, 1, 2].map((row) => (
            <span key={row} className={styles.csvRow}>
              <i
                className={styles.csvValue}
                data-head={row === 0 ? "" : undefined}
              />
              <i
                className={styles.csvComma}
                style={{ "--i": row * 2 } as CSSProperties}
              />
              <i
                className={styles.csvValue}
                data-head={row === 0 ? "" : undefined}
              />
              <i
                className={styles.csvComma}
                style={{ "--i": row * 2 + 1 } as CSSProperties}
              />
              <i
                className={styles.csvValue}
                data-head={row === 0 ? "" : undefined}
              />
            </span>
          ))}
        </span>
      );
    case "image":
      // the page becomes a picture: hills rise and the sun comes up
      return (
        <span className={`${ms.paper} ${styles.exPicture}`}>
          <i className={styles.picSun} />
          <svg viewBox="0 0 26 20" className={styles.picHills}>
            <path d="M0 20V13l6-5 5 4 6-7 9 9v6Z" />
          </svg>
        </span>
      );
  }
}

/* Four lines that start styled (a heading, a bold line, a coloured one)
 * and end bare: each styled look is a layer over the bare line that fades
 * away, so the resting frame is the bare text. */
function FormattedLines({ kind }: { kind: "md" | "txt" }) {
  return (
    <span className={styles.fmtLines} data-kind={kind}>
      <i className={styles.fmtLine} data-style="head">
        <b className={styles.fmtInk} />
      </i>
      <i className={styles.fmtLine} data-style="bold">
        <b className={styles.fmtInk} />
      </i>
      <i className={styles.fmtLine} data-style="tint">
        <b className={styles.fmtInk} />
      </i>
      <i className={styles.fmtLine} data-style="plain" />
    </span>
  );
}
