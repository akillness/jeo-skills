"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Renders a text span's runs (per-run formatting over the inherited style),
 * with the contexts the text renderers read while they draw: the autofit font
 * scale, the slide number a field shows, and letter-by-letter animation play.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { effectTextUnitCount, effectTextWordPieces } from "@mrnote/core/web/lib/presentation-anim-effect-settings.ts";
import { createContext, Fragment, useContext, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { PRESENTATION_FIELD_TEXT_ATTRIBUTE } from "@mrnote/core/web/lib/presentation/math-atom.ts";
import { formatDeckDate, PRESENTATION_DATE_FIELD_FORMATS, type PresentationDateFieldFormat } from "@mrnote/core/web/lib/presentation-header-footer.ts";

function isPresentationDateFieldFormat(type: string): type is PresentationDateFieldFormat {
  return (PRESENTATION_DATE_FIELD_FORMATS as readonly string[]).includes(type);
}
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { PresentationMathRun } from "@mrnote/core/web/components/notebook/contents/presentation/PresentationMathRun.tsx";
import {
  PRESENTATION_EQUATION_SLOT_ATTRIBUTE,
  PresentationEquationSlotContext,
} from "@mrnote/core/web/components/notebook/contents/presentation/presentationEquationSlot.ts";
import {
  type TextRun,
  normalizeRunHyperlink,
  runSlideActionTarget,
  normalizeRuns,
} from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { parseSlideLinkTarget } from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { normalizeLinkTooltip } from "@mrnote/core/web/lib/presentation-link-settings.ts";
import { runStyleCss, runSymbolFontCss, type PresentationFontSizeUnit } from "../../../../lib/presentation/text-layout-css";
import { PRESENTATION_TAB_ATTRIBUTE, PresentationMeasuredTabsContext } from "../../../../lib/presentation-tab-stops";

/**
 * The autofit font scale in force for the text body being drawn, 1 when none.
 *
 * `a:normAutofit@fontScale` is "the percentage of the original font size to
 * which EACH RUN in the text body is scaled", and almost every real deck states
 * its sizes on the runs (`<a:rPr sz="4000">`). `withAutofitFontSize` layers the
 * scale onto the BLOCK's style, which an absolute per-run size then overrides,
 * so a 40pt label under `fontScale="62500"` was drawn at 40pt where PowerPoint
 * draws 25pt -- measured twice, in PowerPoint's own PDF of the probe and of its
 * PDF of our round-trip of it (SHAPE-IMPORT-AUDIT.md §35.1, §40.3).
 *
 * A context rather than a prop because a run style becomes CSS in exactly one
 * place ({@link runStyleCss}) while four surfaces reach it -- the editor canvas,
 * the present overlay, the paragraph list and the preview -- and the provider
 * belongs where the fit is computed for a block, beside its own text. Default 1
 * keeps every surface that never had a receipt byte-for-byte identical.
 */
export const PresentationAutofitScaleContext = createContext<number>(1);

/**
 * The number the slide being drawn carries (its deck place plus the deck's
 * first number), or undefined where no slide is being drawn. A native
 * `slidenum` field run shows this, not the text PowerPoint cached in the
 * file, so a reordered deck's fields follow the new order (PPT-B367).
 */
export const PresentationSlideNumberContext = createContext<number | undefined>(undefined);

/**
 * Render a span's per-run formatting as concatenated `<span>`s, each carrying
 * its run style layered over the inherited block/paragraph style. Renders the
 * plain `text` (a single span) when there are no usable runs, so a no-runs span
 * is byte-for-byte the same DOM as before. Pure + render-only; shared by the
 * present overlay, the editor canvas, the paragraph list and the preview so they
 * never drift.
 */
/** A character with no width, so a `pre-wrap` box lays out a final empty line. */
const TRAILING_LINE_BOX = "​";

/** `text`, with the empty line a final line break draws in PowerPoint made real. */
function withTrailingLineBox(text: string): string {
  return text.endsWith("\n") ? `${text}${TRAILING_LINE_BOX}` : text;
}

/**
 * An effect PowerPoint plays on text letter by letter (Whip, Drop, Color
 * Typewriter, Wave): every letter runs the effect's keyframe, each starting
 * `stepMs` after the one before.
 */
export interface LetterPlay {
  keyframe: string;
  durationMs: number;
  delayMs: number;
  stepMs: number;
  /** An entrance: a letter is not there until its own start. */
  hiddenUntilStart: boolean;
  /**
   * Effect Options > Animate text: By word (each run of non-space
   * characters is one unit) or By letter (each character that is not white
   * space). Absent: an effect that iterates by itself, every character but
   * a line break one unit, as before.
   */
  unit?: "word" | "letter";
  /** The units' easing (a hand-drawn effect's own, or Smooth start / end). */
  timingFunction?: string;
  /** Repeat / Auto-reverse / Rewind of the effect (Effect Options). */
  timing?: { iterationCount: string; direction: "normal" | "alternate"; rewind: boolean };
}

/** The letter-by-letter play of the text being drawn; `null` everywhere else. */
export const PresentationLetterPlayContext = createContext<LetterPlay | null>(null);

/** The letters of a text: its characters without the line breaks. */
/**
 * Whether the run after `previous` starts a line of its own: `previous` ends
 * in a line break, or is a display equation (drawn as its own line).
 */
function startsLineAfterBreak(previous: TextRun | undefined): boolean {
  if (!previous) return false;
  if (previous.math) return previous.math.display === true;
  return /[\n\v]$/.test(previous.text);
}

export function letterCount(text: string): number {
  let count = 0;
  for (const character of text) if (character !== "\n") count += 1;
  return count;
}

/** The units of `text` a play steps through (`LetterPlay.unit`). */
export function letterPlayUnitCount(text: string, play: LetterPlay): number {
  if (play.unit) return effectTextUnitCount(text, play.unit);
  return letterCount(text);
}

/** `text` as one animated box per letter (or word), counting from `base`. */
function letterPlayNodes(text: string, play: LetterPlay, base: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = base;
  let key = 0;
  const box = (content: string) => (
    <span
      key={key}
      data-letter-play={index}
      // The reduced-motion reset for inline timeline animations.
      className="presentation-present__block--motion"
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        ...(play.hiddenUntilStart ? { visibility: "hidden" } : {}),
        animationName: play.keyframe,
        animationDuration: `${play.durationMs}ms`,
        animationDelay: `${Math.round(play.delayMs + index * play.stepMs)}ms`,
        animationTimingFunction: play.timingFunction ?? "linear",
        // Not `backwards`: the first frame of an entrance already shows the
        // letter, and it must stay hidden until its own start. A rewound
        // effect does not hold its end.
        animationFillMode: play.timing?.rewind ? "none" : "forwards",
        ...(play.timing
          ? {
              animationIterationCount: play.timing.iterationCount,
              animationDirection: play.timing.direction,
            }
          : {}),
      }}
    >
      {content}
    </span>
  );
  if (play.unit === "word") {
    // PowerPoint's words (letters and digits of a script run together, each
    // other mark alone); the white space between is drawn as it is.
    for (const piece of effectTextWordPieces(text)) {
      if (!piece.word) {
        nodes.push(piece.text);
        continue;
      }
      nodes.push(box(piece.text));
      index += 1;
      key += 1;
    }
    return nodes;
  }
  for (const character of text) {
    if (character === "\n" || (play.unit === "letter" && /\s/u.test(character))) {
      nodes.push(character);
      continue;
    }
    nodes.push(box(character));
    index += 1;
    key += 1;
  }
  return nodes;
}

/**
 * A run's text with each tab as its own span (`data-presentation-tab`), sized
 * after layout to the stop it reaches (`layoutPresentationTabs`), when the box
 * states custom tab stops; the text as it is otherwise. The span holds the tab
 * character itself, so every text reader sees the same characters.
 */
function withMeasuredTabs(text: string, measured: boolean): ReactNode {
  if (!measured || !text.includes("\t")) return text;
  return text.split("\t").flatMap((piece, pieceIndex) => {
    if (pieceIndex === 0) return [piece];
    const tab = (
      <span
        key={`tab-${pieceIndex}`}
        {...{ [PRESENTATION_TAB_ATTRIBUTE]: "" }}
        style={{ display: "inline-block", tabSize: 0, whiteSpace: "pre" }}
      >
        {"\t"}
      </span>
    );
    // A tab goes with the word after it: where the tab's stop is on the line
    // but the word is not, PowerPoint starts the next line with the tab
    
    // "\tmenos dois membros"). The two are one unbreakable piece; the
    // characters are the same.
    const word = /^[^\s\t]+/.exec(piece)?.[0] ?? "";
    if (!word) return [tab, piece];
    return [
      <span key={`tab-word-${pieceIndex}`} style={{ whiteSpace: "nowrap" }}>
        {tab}
        {word}
      </span>,
      piece.slice(word.length),
    ];
  });
}

const RAISED_RUN_TEXT = { position: "relative" } as const;

/** Whether a character is symbol-encoded (U+F000-U+F0FF): drawn from the run's symbol font. */
function isSymbolEncoded(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0xf000 && code <= 0xf0ff;
}

/**
 * A run's text with its symbol-encoded characters drawn from its symbol font
 * (`symbolCss`), the rest in the run's own faces -- PowerPoint's `a:sym` rule.
 * The characters themselves are kept, so the text readers see the run's text.
 */
function withSymbolFont(text: string, symbolCss: CSSProperties | undefined, measuredTabs: boolean): ReactNode {
  if (!symbolCss || !Array.from(text).some(isSymbolEncoded)) return withMeasuredTabs(text, measuredTabs);
  const pieces: ReactNode[] = [];
  let start = 0;
  while (start < text.length) {
    const symbol = isSymbolEncoded(text[start]);
    let end = start + 1;
    while (end < text.length && isSymbolEncoded(text[end]) === symbol) end += 1;
    const piece = text.slice(start, end);
    pieces.push(symbol
      // A symbol in the line takes no height of its own in the box the line's
      // spacing already says: Symbol's taller ascent sat on the same line
      // height and pushed each such line 3 px further than its neighbours
      
      ? <span key={`sym-${start}`} data-run-symbol-font="" style={{ ...symbolCss, lineHeight: 0 }}>{piece}</span>
      : <Fragment key={`txt-${start}`}>{withMeasuredTabs(piece, measuredTabs)}</Fragment>);
    start = end;
  }
  return pieces;
}

/**
 * A text's runs as the slide shows them: a slide-number field shows the
 * slide's own number, a date field the current date (as PowerPoint redraws
 * both). Shared by the browser-flowed drawing and the text engine's, which
 * lays out these same characters. Undefined when there are no usable runs.
 */
export function presentationDisplayRuns(
  runs: readonly TextRun[] | undefined,
  slideNumber: number | undefined,
  now: Date,
): TextRun[] | undefined {
  const stored = normalizeRuns(runs);
  return stored?.map((run) => {
    if (run.field?.type === "slidenum" && slideNumber !== undefined && run.text.trim() !== "") {
      return { ...run, text: String(slideNumber) };
    }
    // Insert > Date & Time with Update automatically is a `datetimeN` field
    // (a fixed date is plain text): it shows the current date or time, as
    // PowerPoint redraws it on open and in the show. Its stored text is only
    
    const dateFormat = run.field?.type;
    if (dateFormat && isPresentationDateFieldFormat(dateFormat) && run.text.trim() !== "") {
      const locale = /^zh/i.test(run.style?.proofingLanguage ?? "") ? "zh-CN" : "en-US";
      const live = formatDeckDate({ mode: "auto", format: dateFormat, locale }, now);
      return live ? { ...run, text: live } : run;
    }
    return run;
  });
}

export function PresentationRunsText({
  text,
  runs,
  fontSizeUnit = "design-px",
  colorOverride,
  slideIds,
  onNavigateToSlide,
  letterBase = 0,
  runCss: hostRunCss,
}: {
  text: string;
  runs?: readonly TextRun[];
  /**
   * A host that draws a run's format its own way (a worksheet shape: its
   * font stacks and its label's own format under each run). Absent: the
   * deck's run CSS.
   */
  runCss?: (style: TextRun["style"]) => CSSProperties;
  /** Letters of the block's text before this text, for a letter-by-letter play. */
  letterBase?: number;
  fontSizeUnit?: PresentationFontSizeUnit;
  /** Native Font Color emphasis overrides every child run while active/held. */
  colorOverride?: string;
  slideIds?: ReadonlySet<string>;
  onNavigateToSlide?: (slideId: string) => void;
}): ReactElement {
  const fontAliases = useContext(PresentationFontAliasesContext);
  const autofitScale = useContext(PresentationAutofitScaleContext);
  const slideNumber = useContext(PresentationSlideNumberContext);
  const letterPlay = useContext(PresentationLetterPlayContext);
  const equationSlot = useContext(PresentationEquationSlotContext);
  // Custom tab stops: each tab is its own span, sized after layout to the
  // stop it reaches (right / centre / decimal included).
  const measuredTabs = useContext(PresentationMeasuredTabsContext);
  const stored = normalizeRuns(runs);
  const normalized = presentationDisplayRuns(stored ?? undefined, slideNumber, new Date());
  if (!normalized) {
    if (letterPlay) {
      return <>{letterPlayNodes(withTrailingLineBox(text), letterPlay, letterBase)}</>;
    }
    // The placeholder is marked, so the editing readers do not take it for
    // text (`presentationAtomAwareText`).
    return text.endsWith("\n") ? (
      <>
        {withMeasuredTabs(text, measuredTabs)}
        <span data-trailing-line-box="">{TRAILING_LINE_BOX}</span>
      </>
    ) : (
      <>{withMeasuredTabs(text, measuredTabs)}</>
    );
  }
  // Each run's letters count on from the runs before it.
  const runLetterBases: number[] = [];
  if (letterPlay) {
    let count = letterBase;
    for (const run of normalized) {
      runLetterBases.push(count);
      count += letterPlayUnitCount(run.text, letterPlay);
    }
  }
  // A highlight is drawn UNDER every glyph of the box, as PowerPoint paints all
  // highlights before the text. A run's background paints with its line, so on
  // lines closer than the glyphs are tall (90 % spacing, an autofit reduction)
  
  // white-highlighted Poppins read 'strateaic'). Raised (positioned) text paints
  // after every in-flow background: a highlighted run keeps its background and
  // raises its text in an inner span; the box's other runs are raised as they are.
  const highlighted = normalized.some((run) => typeof run.style?.highlight === "string" && run.style.highlight.length > 0);
  const runContent = (run: TextRun, index: number): ReactNode => {
    const content = letterPlay
      ? letterPlayNodes(run.text, letterPlay, runLetterBases[index])
      : withSymbolFont(run.text, runSymbolFontCss(run.style, fontSizeUnit, fontAliases), measuredTabs);
    return highlighted && run.style?.highlight ? <span data-run-highlight-text="" style={RAISED_RUN_TEXT}>{content}</span> : content;
  };
  const last = normalized[normalized.length - 1];
  // A line break that ENDS the text (`a:br` before the paragraph end) is a
  // line in PowerPoint: an empty one, at the break's own size, which moves a
  // centred or bottom-anchored label up by its height. A trailing "\n" in a
  // `pre-wrap` box draws no line box at all, so it takes one character that
  
  
  const trailingLine = last && last.text.endsWith("\n") ? (
    <span
      data-trailing-line-box=""
      style={hostRunCss ? hostRunCss(last.style) : runStyleCss(last.style, fontSizeUnit, fontAliases, autofitScale)}
    >
      {TRAILING_LINE_BOX}
    </span>
  ) : null;
  return (
    <>
      {normalized.map((run, index) => {
        const href = normalizeRunHyperlink(run.style?.href, slideIds);
        const slideLinkTarget = href
          ? parseSlideLinkTarget(href, slideIds)
          : null;
        const runJumpTarget = runSlideActionTarget(href);
        const ownCss = hostRunCss ? hostRunCss(run.style) : runStyleCss(run.style, fontSizeUnit, fontAliases, autofitScale);
        // A line break (`a:br`) that ends a line with words on it is not part
        // of that line's height in PowerPoint: the line stands as tall as its
        
        
        // that line four times as tall, and the bottom-anchored title rose by
        // the difference).
        const previous = index > 0 ? normalized[index - 1] : undefined;
        const breakEndsWordedLine =
          /^\n+$/.test(run.text) &&
          !run.field &&
          !run.math &&
          !run.style?.href &&
          !!previous &&
          previous.text !== "" &&
          !previous.text.endsWith("\n") &&
          !previous.math;
        const previousCss = breakEndsWordedLine
          ? hostRunCss
            ? hostRunCss(previous.style)
            : runStyleCss(previous.style, fontSizeUnit, fontAliases, autofitScale)
          : undefined;
        const wordedLineBreakCss =
          previousCss && previousCss.fontSize !== undefined ? { ...ownCss, fontSize: previousCss.fontSize } : undefined;
        if (wordedLineBreakCss && run.text.length > 1) {
          // Breaks of one style merged into one run: the first ends the line
          // with words, the others stand alone at their own size.
          return (
            <Fragment key={index}>
              <span data-testid="presentation-run" data-run-index={index} style={wordedLineBreakCss}>
                {"\n"}
              </span>
              <span data-testid="presentation-run" data-run-index={index} style={ownCss}>
                {run.text.slice(1)}
              </span>
            </Fragment>
          );
        }
        const runCss = wordedLineBreakCss ?? ownCss;
        // A slide-number field drawn as the current number is an atom that
        // counts as its STORED characters to the text readers (PPT-B429).
        const storedText = stored?.[index]?.text;
        const fieldAtom =
          run.field && storedText !== undefined && storedText !== run.text
            ? { "data-presentation-field": run.field.type, [PRESENTATION_FIELD_TEXT_ATTRIBUTE]: storedText }
            : {};
        const props = {
          "data-testid": "presentation-run",
          "data-run-index": index,
          // A run's own WordArt draws over the box's (`[data-text-paint]`).
          ...(run.style?.textPaint ? { "data-run-text-paint": "true" } : {}),
          ...fieldAtom,
          // The link's ScreenTip (PPT-B010), shown on hover as PowerPoint shows it.
          title: href ? normalizeLinkTooltip(run.style?.linkTooltip) : undefined,
          style: {
            ...(colorOverride === undefined ? runCss : { ...runCss, color: colorOverride }),
            ...(highlighted && !run.style?.highlight ? RAISED_RUN_TEXT : {}),
          },
        };
        if (run.math && equationSlot && run.math.latex === equationSlot.sentinel) {
          // The equation being written: its place in the line, the open
          // field's size, still one atom to the text readers.
          const display = run.math.display === true;
          return (
            <span
              key={index}
              {...{ [PRESENTATION_EQUATION_SLOT_ATTRIBUTE]: equationSlot.sentinel }}
              data-presentation-math=""
              data-presentation-math-text={run.text}
              data-run-index={index}
              contentEditable={false}
              style={{
                ...props.style,
                display: display ? "block" : "inline-block",
                width: equationSlot.width,
                height: equationSlot.height,
                ...(display ? { marginInline: "auto" } : {}),
                verticalAlign: "middle",
              }}
            />
          );
        }
        if (run.math) {
          // An equation draws by its LaTeX, as one atom in the line: the
          // editor's text readers count it as its drawn characters.
          return (
            <PresentationMathRun
              key={index}
              text={run.text}
              latex={run.math.latex}
              display={run.math.display === true}
              runIndex={index}
              style={props.style}
              startsLine={startsLineAfterBreak(normalized[index - 1])}
            />
          );
        }
        if (slideLinkTarget || runJumpTarget) {
          if (!onNavigateToSlide) {
            return (
              <span key={index} {...props} data-slide-link={slideLinkTarget}>
                {runContent(run, index)}
              </span>
            );
          }
          const jump = (event: { stopPropagation: () => void; preventDefault: () => void }) => {
            // The run may sit inside the box's own external link (an anchor
            // around the whole text): the jump is this click's whole effect,
            // so the anchor must not open its address as well (PPT-B390).
            event.preventDefault();
            event.stopPropagation();
            onNavigateToSlide(slideLinkTarget ?? href!);
          };
          return (
            <span
              key={index}
              {...props}
              // A shape's label sits on an inert overlay: the link itself
              // takes the pointer (PPT-B269).
              style={{ ...props.style, pointerEvents: "auto" }}
              role="link"
              tabIndex={0}
              data-testid="presentation-present-run-slide-link"
              data-slide-link={slideLinkTarget}
              data-run-href={href}
              onClick={jump}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  jump(event);
                }
              }}
            >
              {runContent(run, index)}
            </span>
          );
        }
        return href ? (
          <a
            key={index}
            {...props}
            href={href}
            // What the editor's right-click Open Hyperlink reads (PPT-B414).
            data-run-href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {runContent(run, index)}
          </a>
        ) : (
          <span key={index} {...props}>
            {runContent(run, index)}
          </span>
        );
      })}
      {trailingLine}
    </>
  );
}
