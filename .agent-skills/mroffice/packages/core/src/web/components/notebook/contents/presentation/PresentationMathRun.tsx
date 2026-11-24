"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One equation run of a slide's text (PowerPoint's Insert > Equation).
 *
 * The run's `text` is the characters the equation draws in the line (what the
 * server reads from the Office Math it writes); the page shows the LaTeX
 * rendered by KaTeX instead, as PowerPoint draws the built-up equation. The
 * element is one ATOM to the editing surface: it is not editable, and the
 * text readers (`lib/presentation/text-selection` and the live-text reader of
 * the window) take `data-presentation-math-text` as its characters rather than
 * what KaTeX puts inside, so a caret never lands between its glyphs and a
 * selection across it counts exactly the run's characters.
 */

import { useMemo, type CSSProperties, type ReactElement } from "react";
import "katex/dist/katex.min.css";
import "../../../office-equation/office-equation-format.css";
import { renderValidatedKatexMarkup } from "../../../console/editor/extensions/lazyKatex";
import { officeEquationBlockLatex } from "../../../console/editor/extensions/wordDisplayMath";

import { PRESENTATION_MATH_TEXT_ATTRIBUTE } from "../../../../lib/presentation/math-atom";
import {
  isPresentationEquationSlotSentinel,
  PRESENTATION_EQUATION_SLOT_ATTRIBUTE,
  PRESENTATION_EQUATION_SLOT_HEIGHT_VAR,
  PRESENTATION_EQUATION_SLOT_WIDTH_VAR,
} from "./presentationEquationSlot";
import { useInnerHtml } from "../../../../lib/stable-inner-html";
import {
  EQUATION_DECORATION_ATTRIBUTE,
  equationDecorationValue,
  equationFormatFromCss,
  equationLatexForFormat,
  type EquationCharacterFormat,
} from "../../../../lib/office-equation-format";

export function PresentationMathRun({
  text,
  latex,
  display,
  runIndex,
  style,
  startsLine = false,
}: {
  text: string;
  latex: string;
  display: boolean;
  runIndex: number;
  style?: CSSProperties;
  /**
   * The equation starts a line that a line break (`a:br`) or a display
   * equation ended: it gets a caret place BEFORE it as well (see below).
   */
  startsLine?: boolean;
}): ReactElement {
  // The run's own Bold / Underline / Strikethrough are the equation's: bold
  // math, and a line under (through) every glyph run, as Office formats the
  // math runs of a zone (`lib/office-equation-format`).
  const format = equationFormatFromCss(style);
  const bold = format.bold === true;
  const markup = useMemo(
    () => renderValidatedKatexMarkup(equationLatexForFormat(display ? officeEquationBlockLatex(latex) : latex, { bold }), display),
    [latex, display, bold],
  );
  const markupHtml = useInnerHtml(markup);
  const decoration = equationDecorationValue(format);
  const atomProps = {
    ...(decoration ? { [EQUATION_DECORATION_ATTRIBUTE]: decoration } : {}),
    "data-presentation-math": "",
    [PRESENTATION_MATH_TEXT_ATTRIBUTE]: text,
    "data-run-index": runIndex,
    "data-testid": "presentation-run-math",
    contentEditable: false as const,
    style: { ...style, display: display ? "block" : "inline-block", whiteSpace: "nowrap" as const },
    title: latex,
  };
  // A caret's place right after the equation: one zero-width character the
  // text readers skip (`data-trailing-line-box`). After an atom that is not
  // editable and ends its line WebKit had no place there -- the caret put
  // after the equation went back before it and the next letters were typed
  
  const caretAnchor = (
    <span data-trailing-line-box="" data-equation-caret-anchor="">
      {"\u200b"}
    </span>
  );
  // Before an in-line equation that starts a line after a break: the caret
  // there is between the break and an atom that is not editable, a place
  // Chromium and WebKit move to the end of the line ABOVE, so what was typed
  // before the equation went before the break (same caret place, same
  // reason, as after it).
  const leadingAnchor = startsLine && !display ? (
    <span data-trailing-line-box="" data-equation-caret-anchor="" data-equation-caret-anchor-before="">
      {"\u200b"}
    </span>
  ) : null;
  const atom =
    markup === null ? (
      // A LaTeX KaTeX cannot draw (the server keeps it as Office's linear
      // format): the characters themselves, still one atom.
      <span {...atomProps}>{text}</span>
    ) : (
      <span {...atomProps} dangerouslySetInnerHTML={markupHtml} />
    );
  if (!display) {
    return (
      <>
        {leadingAnchor}
        {atom}
        {caretAnchor}
      </>
    );
  }
  // A display equation is its own line, aligned as its paragraph is. The
  // line, not the atom, is the block: the atom sits in it as a word does, so
  // the caret has a place right after it on that line -- a press beside the
  // equation puts it there and typing goes on after it, as in PowerPoint
  // (the words then make it an inline equation, `reconcilePresentationTextBlock`).
  // The line is a full-width inline block, not a block: a block left the
  // paragraph break after it ("\n", a table cell's runs) a line of its own,
  
  // p20/p30: a column of numbers as oMathPara doubled its rows).
  return (
    <span data-presentation-equation-line="" style={{ display: "inline-block", width: "100%" }}>
      {markup === null ? (
        <span {...atomProps} style={{ ...atomProps.style, display: "inline-block" }}>{text}</span>
      ) : (
        <span {...atomProps} style={{ ...atomProps.style, display: "inline-block" }} dangerouslySetInnerHTML={markupHtml} />
      )}
      {caretAnchor}
    </span>
  );
}

/**
 * The same atom as a DOM element, for a surface that paints its runs itself
 * (a table cell's rich-text host): the attributes the atom-aware readers
 * (`lib/presentation/math-atom`) count it by, KaTeX markup inside, not
 * editable. `style` is the run's CSS (size, colour); the display flag draws
 * the equation on its own line as `PresentationMathRun` does.
 */
export function createPresentationMathAtomElement(
  document: Document,
  {
    text,
    latex,
    display,
    runIndex,
    format,
  }: { text: string; latex: string; display: boolean; runIndex: number; format?: EquationCharacterFormat },
): HTMLSpanElement {
  const atom = document.createElement("span");
  if (isPresentationEquationSlotSentinel(latex)) {
    // The place of an equation being written among a field's words (a sheet
    // shape's text field): the open field's size, set on the field by its
    // host, still one atom to the text readers.
    atom.setAttribute("data-presentation-math", "");
    atom.setAttribute(PRESENTATION_MATH_TEXT_ATTRIBUTE, text);
    atom.setAttribute("data-run-index", String(runIndex));
    atom.setAttribute(PRESENTATION_EQUATION_SLOT_ATTRIBUTE, latex);
    atom.setAttribute("contenteditable", "false");
    atom.style.display = display ? "block" : "inline-block";
    atom.style.width = `var(${PRESENTATION_EQUATION_SLOT_WIDTH_VAR}, 1px)`;
    atom.style.height = `var(${PRESENTATION_EQUATION_SLOT_HEIGHT_VAR}, 1em)`;
    atom.style.verticalAlign = "middle";
    if (display) atom.style.marginInline = "auto";
    return atom;
  }
  atom.setAttribute("data-presentation-math", "");
  atom.setAttribute(PRESENTATION_MATH_TEXT_ATTRIBUTE, text);
  atom.setAttribute("data-run-index", String(runIndex));
  atom.setAttribute("data-testid", "presentation-run-math");
  atom.setAttribute("contenteditable", "false");
  atom.title = latex;
  atom.style.display = display ? "block" : "inline-block";
  atom.style.whiteSpace = "nowrap";
  const decoration = equationDecorationValue(format);
  if (decoration) atom.setAttribute(EQUATION_DECORATION_ATTRIBUTE, decoration);
  const markup = renderValidatedKatexMarkup(equationLatexForFormat(display ? officeEquationBlockLatex(latex) : latex, format), display);
  if (markup === null) atom.textContent = text;
  else atom.innerHTML = markup;
  return atom;
}
