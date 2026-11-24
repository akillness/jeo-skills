/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, SVGProps } from "react";

import { OfficeIconGlyph } from "../../office-ribbon/icons/officeIconGlyphs";
import type { OfficeSemanticIconId } from "../../office-ribbon/icons/officeIconRegistry";
import officeIconStyles from "../../office-ribbon/icons/officeSemanticIcon.module.css";

/**
 * Office-style, two-tone glyphs for the document editor's Home ribbon.
 *
 * Lucide remains the general application icon language. Home-ribbon commands
 * need denser semantic previews (list markers, line alignment, font treatment,
 * clipboard layers), so these glyphs share a purpose-built 24px drawing grid.
 * Their colours are supplied by note-editor.css and remain legible in active,
 * hover and disabled states without changing geometry.
 */
export const DOCS_HOME_ICON_NAMES = [
  "paste",
  "cut",
  "copy",
  "formatPainter",
  "growFont",
  "shrinkFont",
  "rubyGuide",
  "clearFormatting",
  "bold",
  "italic",
  "underline",
  // Word's Underline gallery previews the LINE ITSELF on every row, so these
  // five draw the concrete decoration rather than a generic command glyph.
  "underlineStyleSingle",
  "underlineStyleDouble",
  "underlineStyleDotted",
  "underlineStyleWavy",
  "underlineColorClear",
  "strikethrough",
  "superscript",
  "subscript",
  "changeCase",
  // Word's Change Case menu shows the result of each command beside its name;
  // these draw that result (the letter shapes, the character cell) rather than
  // repeating the "Ab" command glyph on every row.
  "changeCaseSentence",
  "changeCaseUpper",
  "changeCaseLower",
  "changeCaseTitle",
  "changeCaseToggle",
  "characterWidthHalf",
  "characterWidthFull",
  "textEffects",
  "highlight",
  "fontColor",
  "charShading",
  "charBorder",
  "smallCaps",
  "allCaps",
  "emphasisDots",
  "enclosedCharacter",
  "eastAsianLayout",
  "bulletList",
  "numberedList",
  "multilevelList",
  "outdent",
  "indent",
  "textDirectionLtr",
  "textDirectionRtl",
  "paragraphSort",
  "firstLineIndent",
  "hangingIndent",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignJustify",
  "alignDistribute",
  "lineSpacing",
  "bordersShading",
  "paragraphShading",
  "formattingMarks",
  "taskList",
  "paragraphDialog",
  "pageMargins",
  "pageOrientation",
  "pageSize",
  "pageColumns",
  "pageBreaks",
  "lineNumbers",
  "hyphenation",
  "indentLeftValue",
  "indentRightValue",
  "spaceBeforeValue",
  "spaceAfterValue",
  "pageBorder",
  "pageColor",
  "tableOfContents",
  "footnote",
  "endnote",
  "noteNavigation",
  "showNotes",
  "citation",
  "sourceManager",
  "caption",
  "crossReference",
  "indexEntry",
  "index",
  "dialogLauncher",
  "find",
  "replace",
  "selectAll",
  "galleryMore",
  "stylePane",
  "dictation",
  "sensitivity",
  "addIns",
  "editor",
] as const;

export type DocsHomeIconName = (typeof DOCS_HOME_ICON_NAMES)[number];

/**
 * Names on this table render the shared registry glyph instead of the local
 * one below, which is what keeps a command that exists in several editors
 * looking like one command.
 *
 * A name is added only after the two glyphs were put side by side and the
 * shared one was judged an equal or better reading of the command.
 *
 * `highlight` is deliberately left off: the local glyph is Word's marker
 * pen, while text.highlight is three text strokes under a warm bar. So is
 * `fontColor`: the ribbons draw the live colour as a bar under the glyph
 * themselves, so the glyph is Office's bare letter A and the bar below it is
 * the colour (the shared text.fontColor carries its own bar, for ribbons
 * that draw none).
 */
const DOCS_HOME_SEMANTIC_ICON_IDS = {
  bold: "text.bold",
  italic: "text.italic",
  underline: "text.underline",
  strikethrough: "text.strikethrough",
  superscript: "text.superscript",
  subscript: "text.subscript",
  alignLeft: "paragraph.align.left",
  alignCenter: "paragraph.align.center",
  alignRight: "paragraph.align.right",
  alignJustify: "paragraph.align.justify",
  firstLineIndent: "paragraph.indent.firstLine",
  lineSpacing: "paragraph.spacing.line",
  formatPainter: "format.painter",
  find: "edit.find",
  replace: "edit.replace",
} as const satisfies Partial<Record<DocsHomeIconName, OfficeSemanticIconId>>;

export const DOCS_HOME_ICON_STROKE_WIDTH = 1;

interface DocsHomeIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: DocsHomeIconName;
  size?: number;
}

function LetterA({
  className = "docs-home-icon__ink",
}: {
  className?: string;
}) {
  return (
    <g className={className}>
      <path d="M4.4 18.8 9.1 5.2h1.8l4.7 13.6" />
      <path d="M6.4 13.3h7.2" />
    </g>
  );
}

function AlignmentLines({
  mode,
}: {
  mode: "left" | "center" | "right" | "justify";
}) {
  const rows =
    mode === "left"
      ? [18, 13, 18, 10]
      : mode === "center"
        ? [18, 12, 18, 12]
        : mode === "right"
          ? [18, 13, 18, 10]
          : [18, 18, 18, 18];
  return (
    <g className="docs-home-icon__ink">
      {rows.map((width, index) => {
        const y = 5 + index * 4.7;
        const x =
          mode === "center"
            ? 12 - width / 2
            : mode === "right"
              ? 21 - width
              : 3;
        return <path key={`${mode}-${y}`} d={`M${x} ${y}h${width}`} />;
      })}
    </g>
  );
}

function ParagraphDirectionMark({ mode }: { mode: "ltr" | "rtl" }) {
  const markOffset = mode === "ltr" ? 4 : -6;
  return (
    <>
      <g
        className="docs-home-icon__ink docs-home-icon__type-heavy"
        transform={`translate(${markOffset} 0)`}
      >
        <path d="M13 4v16M17 4v16M13 4H9.5a4.5 4.5 0 0 0 0 9H13" />
      </g>
      <path
        className="docs-home-icon__accent"
        d={
          mode === "ltr"
            ? "M2.5 12h5.5M5.5 9.5 8 12l-2.5 2.5"
            : "M21.5 12H16M18.5 9.5 16 12l2.5 2.5"
        }
      />
    </>
  );
}

/**
 * The Underline gallery's row previews (Word's "Underline" split-button menu).
 *
 * Word draws the DECORATION ITSELF on each row — a solid rule, two parallel
 * rules, a dotted rule, a wave — above nothing else, so the reader picks a line
 * by looking at it rather than by reading a label. These previews do the same:
 * a muted text-sample strip standing in for the word, and the concrete line
 * below it.
 *
 * Deliberately UNCLASSED: every stroke inherits the SVG root's
 * `stroke="currentColor"` instead of the two-tone `docs-home-icon__*` palette,
 * because these rows live inside a dropdown whose selected/hover/disabled
 * states repaint their own text colour. A palette-locked ink would stay dark
 * on an inverted selected row; `currentColor` follows the row.
 */
function UnderlineStylePreview({
  name,
}: {
  name:
    | "underlineStyleSingle"
    | "underlineStyleDouble"
    | "underlineStyleDotted"
    | "underlineStyleWavy"
    | "underlineColorClear";
}) {
  return (
    <>
      {/* Text sample the decoration belongs to — muted so the line reads first. */}
      <path d="M4.5 8.5h11M4.5 11.5h15" opacity="0.32" strokeWidth="1.6" />
      {name === "underlineStyleSingle" ? (
        <path d="M4 16.5h16" strokeWidth="1.8" />
      ) : null}
      {name === "underlineStyleDouble" ? (
        <path d="M4 15h16M4 18.5h16" strokeWidth="1.5" />
      ) : null}
      {name === "underlineStyleDotted" ? (
        <path
          d="M4 16.5h16"
          strokeWidth="1.9"
          strokeDasharray="0.1 3"
          strokeLinecap="round"
        />
      ) : null}
      {name === "underlineStyleWavy" ? (
        <path
          d="M4 16.5q1.5-2.4 3 0t3 0t3 0t3 0t3 0"
          fill="none"
          strokeWidth="1.5"
        />
      ) : null}
      {name === "underlineColorClear" ? (
        <>
          <path d="M4 16.5h16" strokeWidth="1.8" />
          {/* Word's "No Color": the swatch crossed out. */}
          <path d="m5.5 20.5 13-7" strokeWidth="1.5" />
        </>
      ) : null}
    </>
  );
}

function glyph(name: DocsHomeIconName) {
  switch (name) {
    case "paste":
      return (
        <>
          <rect
            className="docs-home-icon__warm-fill"
            x="3.3"
            y="5.5"
            width="13.2"
            height="15.2"
            rx="1.7"
          />
          <path className="docs-home-icon__warm" d="M7 5.5V3.7h5.8v1.8" />
          <rect
            className="docs-home-icon__paper"
            x="8.1"
            y="8.4"
            width="12.6"
            height="13"
            rx="1.4"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M11 12h6.7M11 15.4h6.7M11 18.8h4.4"
          />
        </>
      );
    case "cut":
      return (
        <>
          <circle
            className="docs-home-icon__accent-soft"
            cx="5.2"
            cy="6"
            r="2.2"
          />
          <circle
            className="docs-home-icon__accent-soft"
            cx="5.2"
            cy="18"
            r="2.2"
          />
          <path
            className="docs-home-icon__ink"
            d="m7.2 7.1 12.1 10.3M7.2 16.9 19.3 6.6"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="11.7"
            cy="12"
            r="1.15"
          />
        </>
      );
    case "copy":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="3.5"
            width="12"
            height="14"
            rx="1.7"
          />
          <rect
            className="docs-home-icon__paper"
            x="8.5"
            y="7.5"
            width="12"
            height="13"
            rx="1.7"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="M11.6 11.3h5.8M11.6 14.5h5.8M11.6 17.7h3.8"
          />
        </>
      );
    case "formatPainter":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4.2 4.4h12.2v5.1H4.2zM6 9.5v3.2h8.6V9.5"
          />
          <path
            className="docs-home-icon__warm-fill"
            d="m7 12.7 6.7.1-1 4.2-1.7 2.7-3.2-1.1-1-2.8z"
          />
          <path
            className="docs-home-icon__warm"
            d="M7.1 12.7h6.5l-.9 4.3-1.7 2.7-3.2-1.1-1-2.8z"
          />
          <path className="docs-home-icon__ink-soft" d="m9.1 16.4 2.3.8" />
        </>
      );
    case "growFont":
    case "shrinkFont": {
      // Office's Grow/Shrink Font: the letter A with a small solid arrow head
      // at its shoulder, up to grow and down to shrink.
      const up = name === "growFont";
      return (
        <>
          <LetterA />
          <path
            className="docs-home-icon__accent-fill"
            d={up ? "M20.5 4.2 24 8.8h-7z" : "M20.5 14.4 17 9.8h7z"}
          />
          <path
            className="docs-home-icon__accent"
            d={up ? "M20.5 8.8v5.4" : "M20.5 9.8V4.4"}
            strokeWidth="1.6"
          />
        </>
      );
    }
    case "rubyGuide":
      return (
        <>
          <text
            className="docs-home-icon__accent-text"
            x="3"
            y="7.5"
            fontFamily="Arial, sans-serif"
            fontSize="6.4"
            fontWeight="750"
            letterSpacing="0.25"
          >
            abc
          </text>
          <text
            className="docs-home-icon__type-text"
            x="5.4"
            y="20.2"
            fontFamily="Arial, sans-serif"
            fontSize="16.2"
            fontWeight="650"
          >
            A
          </text>
          <path className="docs-home-icon__accent" d="M2.8 9.5h14.4" />
        </>
      );
    case "clearFormatting":
      return (
        <>
          <LetterA />
          <path
            className="docs-home-icon__magenta-fill"
            d="m14.4 14.6 4.9-4.9 2.8 2.8-4.9 4.9z"
          />
          <path
            className="docs-home-icon__magenta"
            d="m13.5 15.5 5.8-5.8 2.8 2.8-5.8 5.8h-2.8z"
          />
          <path className="docs-home-icon__muted" d="M13.5 18.3h8" />
        </>
      );
    case "bold":
      return (
        <text
          className="docs-home-icon__type-text"
          x="4.5"
          y="19.2"
          fontFamily="Arial, sans-serif"
          fontSize="19"
          fontWeight="800"
        >
          B
        </text>
      );
    case "italic":
      return (
        <text
          className="docs-home-icon__type-text"
          x="7"
          y="19"
          fontFamily="Georgia, serif"
          fontSize="20"
          fontStyle="italic"
          fontWeight="600"
        >
          I
        </text>
      );
    case "underline":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3.7"
            y="17.2"
            fontFamily="Arial, sans-serif"
            fontSize="17.5"
            fontWeight="600"
          >
            U
          </text>
          <path className="docs-home-icon__ink" d="M3.5 21h17" />
        </>
      );
    case "underlineStyleSingle":
    case "underlineStyleDouble":
    case "underlineStyleDotted":
    case "underlineStyleWavy":
    case "underlineColorClear":
      return <UnderlineStylePreview name={name} />;
    case "strikethrough":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3"
            y="17.2"
            fontFamily="Arial, sans-serif"
            fontSize="15"
            fontWeight="550"
          >
            ab
          </text>
          <path className="docs-home-icon__ink" d="M2.5 12h19" />
        </>
      );
    case "superscript":
    case "subscript": {
      const superScript = name === "superscript";
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="3"
            y="18"
            fontFamily="Arial, sans-serif"
            fontSize="17"
          >
            x
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="14"
            y={superScript ? "9" : "22"}
            fontFamily="Arial, sans-serif"
            fontSize="9.5"
            fontWeight="750"
          >
            2
          </text>
        </>
      );
    }
    case "changeCase":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="2.7"
            y="18.1"
            fontFamily="Arial, sans-serif"
            fontSize="15.6"
            fontWeight="650"
          >
            Ab
          </text>
          <path className="docs-home-icon__accent" d="m18 8 2.5-2.5L23 8" />
          <path className="docs-home-icon__accent-soft" d="M20.5 5.8v8.5" />
        </>
      );
    case "changeCaseSentence":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="1.6"
            y="18.4"
            fontFamily="Arial, sans-serif"
            fontSize="16"
            fontWeight="650"
          >
            A
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="11.6"
            y="18.4"
            fontFamily="Arial, sans-serif"
            fontSize="11"
            fontWeight="600"
          >
            bc
          </text>
        </>
      );
    case "changeCaseUpper":
      return (
        <text
          className="docs-home-icon__type-text"
          x="1.2"
          y="18.2"
          fontFamily="Arial, sans-serif"
          fontSize="14.5"
          fontWeight="650"
        >
          AB
        </text>
      );
    case "changeCaseLower":
      return (
        <text
          className="docs-home-icon__type-text"
          x="2.4"
          y="18.2"
          fontFamily="Arial, sans-serif"
          fontSize="16.5"
          fontWeight="600"
        >
          ab
        </text>
      );
    case "changeCaseTitle":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="1.4"
            y="11.6"
            fontFamily="Arial, sans-serif"
            fontSize="11"
            fontWeight="650"
          >
            Ab
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="9.2"
            y="21.4"
            fontFamily="Arial, sans-serif"
            fontSize="11"
            fontWeight="650"
          >
            Cd
          </text>
        </>
      );
    case "changeCaseToggle":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="1.4"
            y="18.4"
            fontFamily="Arial, sans-serif"
            fontSize="13.5"
            fontWeight="650"
          >
            aB
          </text>
          <path className="docs-home-icon__accent" d="M20.6 5.6v12.8" />
          <path
            className="docs-home-icon__accent-soft"
            d="m18.4 7.8 2.2-2.2 2.2 2.2M18.4 16.2l2.2 2.2 2.2-2.2"
          />
        </>
      );
    case "characterWidthHalf":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="8.5"
            y="4.5"
            width="7"
            height="15"
            rx="1.2"
          />
          <path
            className="docs-home-icon__accent"
            d="m1.8 9.5 2.5 2.5-2.5 2.5M22.2 9.5 19.7 12l2.5 2.5"
          />
          <path className="docs-home-icon__ink-soft" d="M10.5 12h3" />
        </>
      );
    case "characterWidthFull":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="4.5"
            y="4.5"
            width="15"
            height="15"
            rx="1.2"
          />
          <path
            className="docs-home-icon__accent"
            d="m2.6 9.5-1.6 2.5 1.6 2.5M21.4 9.5l1.6 2.5-1.6 2.5"
          />
          <path className="docs-home-icon__ink-soft" d="M9 12h6" />
        </>
      );
    case "textEffects":
      return (
        <>
          <LetterA className="docs-home-icon__accent" />
          <path className="docs-home-icon__warm" d="M18.7 3.2v5.4M16 5.9h5.4" />
          <path
            className="docs-home-icon__muted"
            d="M18.5 13.4v3.8M16.6 15.3h3.8M20.2 19.1v2.2M19.1 20.2h2.2"
          />
        </>
      );
    case "highlight":
      return (
        // raised 1.4 so the pen and its colour bar centre on the canvas
        <g transform="translate(0 -1.4)">
          <path
            className="docs-home-icon__ink"
            d="m6 15 8.6-10.2 4.1 3.5L10 18.4z"
          />
          <path
            className="docs-home-icon__highlight-fill"
            d="M4 19h15.5v3H4z"
          />
          <path className="docs-home-icon__accent-soft" d="m9.9 10.4 4 3.4" />
        </g>
      );
    case "fontColor":
      // Word's Font Color: a heavy centred A standing on the colour bar the
      // ribbon draws under it (the bar is the colour, so the letter alone
      // must read at once as "text" and not as another of the A commands).
      return (
        <g className="docs-home-icon__ink docs-home-icon__font-color-letter">
          <path d="M5.2 18.4 10.8 3.9h2.4l5.6 14.5" />
          <path d="M7.6 12.9h8.8" />
        </g>
      );
    case "charShading":
      return (
        <>
          <rect
            className="docs-home-icon__muted-fill"
            x="3"
            y="4.5"
            width="18"
            height="15.5"
            rx="1.6"
          />
          <LetterA />
        </>
      );
    case "charBorder":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="3"
            y="3"
            width="18"
            height="18"
            rx="1.4"
          />
          <LetterA className="docs-home-icon__accent" />
        </>
      );
    case "smallCaps":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M3 19 8.2 5h1.6L15 19M5.1 13.7h7.8"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="m14 19 3.1-8h1.3l3.1 8M15.2 15.8h5"
          />
        </>
      );
    case "allCaps":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M2.5 19 6.8 6h1.7l4.3 13M4.2 14h6.9"
          />
          <path
            className="docs-home-icon__accent-soft"
            d="M12.8 19 17 6h1.7L23 19M14.4 14h6.9"
          />
        </>
      );
    case "emphasisDots":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4 16 8.1 5h1.5l4.1 11M5.6 11.5h6.5"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="6"
            cy="20"
            r="1.2"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="11"
            cy="20"
            r="1.2"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="16"
            cy="20"
            r="1.2"
          />
        </>
      );
    case "enclosedCharacter":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="12" cy="12" r="9" />
          <text
            className="docs-home-icon__accent-text"
            x="7.7"
            y="16.6"
            fontFamily="Arial, sans-serif"
            fontSize="13"
            fontWeight="650"
          >
            A
          </text>
        </>
      );
    case "eastAsianLayout":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="2.5"
            y="4"
            width="12.5"
            height="16"
            rx="1.5"
          />
          <text
            className="docs-home-icon__type-text"
            x="3.6"
            y="15.5"
            fontFamily="Arial, sans-serif"
            fontSize="8.8"
            fontWeight="650"
            letterSpacing="-0.35"
          >
            Aa
          </text>
          <path
            className="docs-home-icon__accent"
            d="M19 4v16M16.5 6.5 19 4l2.5 2.5M16.5 17.5 19 20l2.5-2.5"
          />
        </>
      );
    case "bulletList":
      return (
        <>
          {[6, 12, 18].map((y) => (
            <circle
              key={y}
              className="docs-home-icon__accent-fill"
              cx="3.8"
              cy={y}
              r="1.45"
            />
          ))}
          <path className="docs-home-icon__ink" d="M8 6h13M8 12h13M8 18h10" />
        </>
      );
    case "numberedList":
      return (
        <>
          {["1", "2", "3"].map((marker, index) => (
            <text
              key={marker}
              className="docs-home-icon__index-text"
              x="1.4"
              y={7.9 + index * 6}
              fontFamily="Arial, sans-serif"
              fontSize="7.6"
              fontWeight="800"
            >
              {marker}
            </text>
          ))}
          <path
            className="docs-home-icon__ink"
            d="M8.5 6h12.5M8.5 12h12.5M8.5 18h10"
          />
        </>
      );
    case "multilevelList":
      return (
        <>
          {[
            ["1", 1.2, 7.8],
            ["a", 4.8, 13.8],
            ["i", 8.6, 19.8],
          ].map(([marker, x, y]) => (
            <text
              key={marker}
              className="docs-home-icon__index-text"
              x={x}
              y={y}
              fontFamily="Arial, sans-serif"
              fontSize="7.4"
              fontWeight="800"
            >
              {marker}
            </text>
          ))}
          <path
            className="docs-home-icon__ink"
            d="M7.5 6h13.5M11 12h10M14.5 18H21"
          />
        </>
      );
    case "outdent":
    case "indent": {
      const points = name === "outdent" ? "8,9 4,12 8,15" : "4,9 8,12 4,15";
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M3 5h18M11 10h10M11 15h10M3 20h18"
          />
          <polyline className="docs-home-icon__accent" points={points} />
        </>
      );
    }
    case "textDirectionLtr":
      return <ParagraphDirectionMark mode="ltr" />;
    case "textDirectionRtl":
      return <ParagraphDirectionMark mode="rtl" />;
    case "paragraphSort":
      return (
        <>
          <text
            className="docs-home-icon__type-text"
            x="2.6"
            y="9.3"
            fontFamily="Arial, sans-serif"
            fontSize="8.8"
            fontWeight="750"
          >
            A
          </text>
          <text
            className="docs-home-icon__type-text"
            x="2.6"
            y="20.8"
            fontFamily="Arial, sans-serif"
            fontSize="8.8"
            fontWeight="750"
          >
            Z
          </text>
          <path
            className="docs-home-icon__accent"
            d="M16.8 3.2v16.9M13.5 16.8l3.3 3.3 3.3-3.3"
          />
        </>
      );
    case "firstLineIndent":
    case "hangingIndent": {
      const first = name === "firstLineIndent";
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d={
              first
                ? "M9 5h12M3 10h18M3 15h18M3 20h14"
                : "M3 5h18M9 10h12M9 15h12M9 20h8"
            }
          />
          <path
            className="docs-home-icon__accent"
            d={first ? "M3 5h4M5 3l2 2-2 2" : "M3 12h4M5 10l2 2-2 2"}
          />
        </>
      );
    }
    case "alignLeft":
      return <AlignmentLines mode="left" />;
    case "alignCenter":
      return <AlignmentLines mode="center" />;
    case "alignRight":
      return <AlignmentLines mode="right" />;
    case "alignJustify":
      return <AlignmentLines mode="justify" />;
    case "alignDistribute":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M7 6h10M6 10h12M7 14h10M6 18h12"
          />
          <path
            className="docs-home-icon__accent"
            d="M3 4v16M21 4v16M3 12h3M18 12h3M5 10l-2 2 2 2M19 10l2 2-2 2"
          />
        </>
      );
    case "lineSpacing":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M10 5h11M10 9.7h11M10 14.3h11M10 19h11"
          />
          <path
            className="docs-home-icon__accent"
            d="M5 4v16M2.5 6.5 5 4l2.5 2.5M2.5 17.5 5 20l2.5-2.5"
          />
        </>
      );
    case "bordersShading":
      return (
        <>
          <rect
            className="docs-home-icon__ink"
            x="3.5"
            y="3.5"
            width="17"
            height="17"
          />
          <path
            className="docs-home-icon__muted"
            d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"
          />
          <path className="docs-home-icon__accent" d="M3.5 20.5h17" />
        </>
      );
    case "paragraphShading":
      return (
        // raised 1.6 so the bucket and its colour bar centre on the canvas
        <g transform="translate(0 -1.6)">
          <path
            className="docs-home-icon__ink"
            d="m4.2 13.2 8-8 6.1 6.1-8 8H4.2z"
          />
          <path className="docs-home-icon__accent-soft" d="m8.1 9.3 6.1 6.1" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M3 20h15.2v2H3z"
          />
          <path
            className="docs-home-icon__accent"
            d="M20.1 14.2s2 2.2 2 3.6a2 2 0 0 1-4 0c0-1.4 2-3.6 2-3.6Z"
          />
        </g>
      );
    case "formattingMarks":
      return (
        <>
          <path
            className="docs-home-icon__ink docs-home-icon__type-heavy"
            d="M13 4v16M17 4v16M13 4H9.5a4.5 4.5 0 0 0 0 9H13"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="17"
            cy="4"
            r="1.1"
          />
        </>
      );
    case "taskList":
      return (
        <>
          <rect
            className="docs-home-icon__accent-soft"
            x="3"
            y="4"
            width="4.5"
            height="4.5"
            rx="0.8"
          />
          <rect
            className="docs-home-icon__accent-soft"
            x="3"
            y="10"
            width="4.5"
            height="4.5"
            rx="0.8"
          />
          <rect
            className="docs-home-icon__accent-soft"
            x="3"
            y="16"
            width="4.5"
            height="4.5"
            rx="0.8"
          />
          <path
            className="docs-home-icon__accent"
            d="m4 6 1.1 1.1L7 5M4 12l1.1 1.1L7 11"
          />
          <path
            className="docs-home-icon__ink"
            d="M10 6.3h11M10 12.3h11M10 18.3h8"
          />
        </>
      );
    case "paragraphDialog":
      return (
        <>
          <path
            className="docs-home-icon__ink"
            d="M4 5h16M4 10h16M4 15h10M4 20h7"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="8"
            cy="5"
            r="1.6"
          />
          <circle
            className="docs-home-icon__accent-fill"
            cx="15"
            cy="10"
            r="1.6"
          />
          <path className="docs-home-icon__accent" d="M15 20h5v-5M20 15l-6 6" />
        </>
      );
    case "dialogLauncher":
      return (
        <>
          <path
            className="docs-home-icon__muted"
            d="M5 5h8v2H7v10h10v-6h2v8H5z"
          />
          <path className="docs-home-icon__accent" d="M11 5h8v8M19 5l-9 9" />
        </>
      );
    case "find":
      return (
        <>
          <circle className="docs-home-icon__ink" cx="10.5" cy="10.5" r="6.5" />
          <path className="docs-home-icon__accent" d="m15.2 15.2 5 5" />
          <path className="docs-home-icon__muted" d="M7.7 8.5h5.6M7.7 11.5h4" />
        </>
      );
    case "replace":
      return (
        <>
          <text
            className="docs-home-icon__accent-text"
            x="2.2"
            y="10"
            fontFamily="Arial, sans-serif"
            fontSize="9.5"
            fontWeight="750"
          >
            b
          </text>
          <text
            className="docs-home-icon__accent-text"
            x="16.1"
            y="21"
            fontFamily="Arial, sans-serif"
            fontSize="9.5"
            fontWeight="750"
          >
            c
          </text>
          <path
            className="docs-home-icon__ink"
            d="M9 6.5h10M16.2 3.8 19 6.5l-2.8 2.7M15 17.5H5M7.8 14.8 5 17.5l2.8 2.7"
          />
        </>
      );
    case "selectAll":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3.5"
            y="3.5"
            width="13"
            height="13"
            rx="1.4"
            strokeDasharray="2.2 2.2"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m10 8 10.2 5.2-4.5 1.5-2 4.5z"
          />
          <path
            className="docs-home-icon__ink"
            d="m10 8 10.2 5.2-4.5 1.5-2 4.5z"
          />
        </>
      );
    case "galleryMore":
      return (
        <>
          <rect
            className="docs-home-icon__muted"
            x="3"
            y="3.5"
            width="5"
            height="5"
            rx="0.8"
          />
          <rect
            className="docs-home-icon__muted"
            x="10"
            y="3.5"
            width="5"
            height="5"
            rx="0.8"
          />
          <rect
            className="docs-home-icon__muted"
            x="3"
            y="10.5"
            width="5"
            height="5"
            rx="0.8"
          />
          <rect
            className="docs-home-icon__muted"
            x="10"
            y="10.5"
            width="5"
            height="5"
            rx="0.8"
          />
          <path
            className="docs-home-icon__accent"
            d="M20 4v15M16.8 15.8 20 19l3.2-3.2"
          />
        </>
      );
    case "stylePane":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 3.5h11v16h-11z" />
          <path
            className="docs-home-icon__muted"
            d="M6.5 7h5M6.5 10h5M6.5 13h3"
          />
          <path
            className="docs-home-icon__ink"
            d="m13.2 17.5 5.9-7 2.5 2.1-5.9 7-3.1 1z"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m12.6 20.5.6-3 2.5 2.1z"
          />
        </>
      );
    case "pageMargins":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 2.8h14v18.4H5z" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M7.8 5.5h8.4v13H7.8z"
          />
          <path
            className="docs-home-icon__accent"
            d="M7.8 5.5h8.4v13H7.8M5 7.4h2.8M16.2 7.4H19M5 16.6h2.8M16.2 16.6H19"
          />
        </>
      );
    case "pageOrientation":
      return (
        <>
          <path className="docs-home-icon__muted" d="M3 4h8v13H3z" />
          <path className="docs-home-icon__paper" d="M8 9h13v10H8z" />
          <path
            className="docs-home-icon__accent"
            d="M14 4.5a7.5 7.5 0 0 1 5.5 2.4M17.6 4.8l2.1 2.1-2.8.8"
          />
        </>
      );
    case "pageSize":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 3h14v18H5z" />
          <path className="docs-home-icon__muted" d="M8 7h8M8 10h5" />
          <path
            className="docs-home-icon__accent"
            d="M3 3h-1v18h1M21 3h1v18h-1M2 12h4M18 12h4M4 10l2 2-2 2M20 10l-2 2 2 2"
          />
        </>
      );
    case "pageColumns":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3 3h18v18H3z" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M5.5 6h5v12h-5zM13.5 6h5v12h-5z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M6.5 8h3M6.5 11h3M6.5 14h3M14.5 8h3M14.5 11h3M14.5 14h3"
          />
        </>
      );
    case "pageBreaks":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 2.8h16v6.4H4zM4 14.8h16v6.4H4z" />
          <path
            className="docs-home-icon__accent"
            d="M2.5 12h19"
            strokeDasharray="2 2"
          />
          <path className="docs-home-icon__warm" d="m9.4 9.8 2.6 2.4 2.6-2.4" />
        </>
      );
    case "lineNumbers":
      return (
        <>
          <path className="docs-home-icon__accent" d="M3.3 6h2v4M3.2 14.5c.4-.7 2.5-.8 2.5.4 0 1.1-2.4 2.1-2.4 3.1h2.6" />
          <path className="docs-home-icon__ink" d="M9 6h12M9 10h9M9 15h12M9 19h8" />
        </>
      );
    case "hyphenation":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 2.8h16v18.4H4z" />
          <path
            className="docs-home-icon__ink-soft"
            d="M7 6.5h10M7 10.5h4M14 10.5h3M7 14.5h10M7 18.5h7"
          />
          <path
            className="docs-home-icon__accent docs-home-icon__type-heavy"
            d="M11.6 10.5h1.2"
          />
          <path className="docs-home-icon__warm" d="m11 8.2 2 2.3-2 2.3" />
        </>
      );
    case "indentLeftValue":
    case "indentRightValue": {
      const left = name === "indentLeftValue";
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M4 5h16M7 9h13M7 13h13M4 17h16M7 21h13" />
          <path
            className="docs-home-icon__accent docs-home-icon__type-heavy"
            d={left ? "M3 11h7M6 8l-3 3 3 3" : "M21 11h-7M18 8l3 3-3 3"}
          />
        </>
      );
    }
    case "spaceBeforeValue":
    case "spaceAfterValue": {
      const before = name === "spaceBeforeValue";
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M7 5h13M7 9h10M7 15h13M7 19h10" />
          <path
            className="docs-home-icon__accent docs-home-icon__type-heavy"
            d={before ? "M3 13V5M1 7l2-2 2 2" : "M3 11v8M1 17l2 2 2-2"}
          />
        </>
      );
    }
    case "pageBorder":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 2.8h16v18.4H4z" />
          <path
            className="docs-home-icon__accent docs-home-icon__type-heavy"
            d="M6.8 5.8h10.4v12.4H6.8z"
          />
          <path className="docs-home-icon__muted" d="M9 8h6M9 11h6M9 14h4" />
        </>
      );
    case "tableOfContents":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h16v18H4z" />
          <path className="docs-home-icon__accent" d="M7 7h2M7 11h2M7 15h2" />
          <path className="docs-home-icon__ink-soft" d="M11 7h6M11 11h6M11 15h6M7 18h10" />
        </>
      );
    case "footnote":
    case "endnote": {
      const endnote = name === "endnote";
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h16v18H4z" />
          <path className="docs-home-icon__ink-soft" d="M7 8h10M7 11h8M7 14h10" />
          <path className="docs-home-icon__accent docs-home-icon__type-heavy" d={endnote ? "M14 18h4M16 16v4" : "M6 5h4M8 3v4"} />
        </>
      );
    }
    case "noteNavigation":
      return (
        <>
          <path className="docs-home-icon__paper" d="M5 3h12v18H5z" />
          <path className="docs-home-icon__ink-soft" d="M8 7h6M8 11h6M8 15h4" />
          <path className="docs-home-icon__accent" d="M17 9h4M19 7l2 2-2 2M21 15h-4M19 13l-2 2 2 2" />
        </>
      );
    case "showNotes":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h12v18H4z" />
          <path className="docs-home-icon__ink-soft" d="M7 7h6M7 11h6M7 15h4" />
          <path className="docs-home-icon__accent" d="M14 16c1.7-2.4 5.3-2.4 7 0-1.7 2.4-5.3 2.4-7 0Z" />
          <circle className="docs-home-icon__accent-fill" cx="17.5" cy="16" r="1" />
        </>
      );
    case "citation":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 4h16v16H4z" />
          <path className="docs-home-icon__ink-soft" d="M8 8h8M8 12h6M8 16h4" />
          <path className="docs-home-icon__accent docs-home-icon__type-heavy" d="M5.5 5.5h3v3h-3zM15.5 15.5h3v3h-3z" />
        </>
      );
    case "sourceManager":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3.5 5h8v14h-8zM12.5 3h8v16h-8z" />
          <path className="docs-home-icon__ink-soft" d="M6 9h3M6 12h3M15 7h3M15 10h3M15 13h3" />
          <path className="docs-home-icon__accent" d="M8 19v2h10v-2" />
        </>
      );
    case "caption":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3" y="4" width="18" height="12" rx="1.5" />
          <path className="docs-home-icon__accent-soft-fill" d="m5.5 13 4-4 3 3 2-2 4 3v1H5.5z" />
          <path className="docs-home-icon__ink-soft" d="M6 19h12" />
        </>
      );
    case "crossReference":
      return (
        <>
          <path className="docs-home-icon__paper" d="M3 4h8v16H3zM13 4h8v16h-8z" />
          <path className="docs-home-icon__ink-soft" d="M5.5 8h3M5.5 11h3M15.5 8h3M15.5 11h3" />
          <path className="docs-home-icon__accent docs-home-icon__type-heavy" d="M8.5 15h7M13 12.5l2.5 2.5-2.5 2.5" />
        </>
      );
    case "indexEntry":
    case "index": {
      const insert = name === "index";
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 3h16v18H4z" />
          <path className="docs-home-icon__ink-soft" d="M8 7h9M8 11h7M8 15h9M8 18h6" />
          <path className="docs-home-icon__accent docs-home-icon__type-heavy" d={insert ? "M3 8h3M4.5 6.5v3" : "M3 15h3M4.5 13.5v3"} />
        </>
      );
    }
    case "pageColor":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4.5 3h13l2 2v16h-15z" />
          <path className="docs-home-icon__ink-soft" d="M17.5 3v3h2M8 8h8M8 11h6" />
          <path
            className="docs-home-icon__accent-soft-fill"
            d="M6.5 14h11v5h-11z"
          />
          <path className="docs-home-icon__accent" d="M6.5 14h11v5h-11" />
          <path className="docs-home-icon__warm-fill" d="m18.2 10.4 2 2.7-2 2.7-2-2.7z" />
        </>
      );
    case "dictation":
      return (
        <>
          <rect
            className="docs-home-icon__accent-soft-fill"
            x="8"
            y="2.5"
            width="8"
            height="13"
            rx="4"
          />
          <rect
            className="docs-home-icon__accent"
            x="8"
            y="2.5"
            width="8"
            height="13"
            rx="4"
          />
          <path
            className="docs-home-icon__ink"
            d="M5 11.5a7 7 0 0 0 14 0M12 18.5v3M8.5 21.5h7"
          />
        </>
      );
    case "sensitivity":
      return (
        <>
          <path
            className="docs-home-icon__muted-fill"
            d="M12 2.8 20 6v5.2c0 5.2-3.2 8.5-8 10-4.8-1.5-8-4.8-8-10V6z"
          />
          <path
            className="docs-home-icon__muted"
            d="M12 2.8 20 6v5.2c0 5.2-3.2 8.5-8 10-4.8-1.5-8-4.8-8-10V6z"
          />
          <rect
            className="docs-home-icon__ink-soft"
            x="8.8"
            y="10.5"
            width="6.4"
            height="5.4"
            rx="1"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M10.2 10.5V9.1a1.8 1.8 0 0 1 3.6 0v1.4"
          />
        </>
      );
    case "addIns":
      return (
        <>
          <rect
            className="docs-home-icon__danger"
            x="3"
            y="3"
            width="8"
            height="8"
          />
          <rect
            className="docs-home-icon__danger"
            x="13"
            y="3"
            width="8"
            height="8"
          />
          <rect
            className="docs-home-icon__danger"
            x="3"
            y="13"
            width="8"
            height="8"
          />
          <rect
            className="docs-home-icon__danger"
            x="13"
            y="13"
            width="8"
            height="8"
          />
        </>
      );
    case "editor":
      return (
        <>
          <path
            className="docs-home-icon__accent"
            d="m5 17 1.2-4.1L16.9 2.2l4.9 4.9L11.1 17.8z"
          />
          <path
            className="docs-home-icon__accent-fill"
            d="m5 17 1.2-4.1 4.9 4.9z"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M3 21h18M13 12.2h8M15.5 16h5.5"
          />
        </>
      );
  }

  const exhaustiveName: never = name;
  return exhaustiveName;
}

export function DocsHomeIcon({
  name,
  size = 18,
  className,
  style,
  ...props
}: DocsHomeIconProps) {
  const semanticId = DOCS_HOME_SEMANTIC_ICON_IDS[
    name as keyof typeof DOCS_HOME_SEMANTIC_ICON_IDS
  ] as OfficeSemanticIconId | undefined;
  const rootClassName = [
    "docs-home-icon",
    semanticId ? officeIconStyles.root : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      className={rootClassName}
      data-docs-home-icon={name}
      data-office-icon-mirror={semanticId ? "none" : undefined}
      data-office-icon-state={semanticId ? "default" : undefined}
      data-office-semantic-icon={semanticId}
      fill="none"
      focusable="false"
      height={size}
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={DOCS_HOME_ICON_STROKE_WIDTH}
      style={
        semanticId
          ? ({ ...style, "--office-icon-size": `${size}px` } as CSSProperties)
          : style
      }
      viewBox="0 0 24 24"
      width={size}
    >
      {semanticId ? (
        <g data-office-icon-glyph={semanticId}>
          <OfficeIconGlyph semanticId={semanticId} />
        </g>
      ) : (
        glyph(name)
      )}
    </svg>
  );
}
