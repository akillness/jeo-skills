/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, type CSSProperties, type ReactNode, type SVGProps } from "react";

import { OfficeIconGlyph } from "@mrnote/core/web/components/office-ribbon/icons/officeIconGlyphs.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import officeIconStyles from "@mrnote/core/web/components/office-ribbon/icons/officeSemanticIcon.module.css";

/**
 * Code-owned ribbon glyphs drawn on the same 24 px / 1 px / semantic-colour
 * grammar as the document, spreadsheet and presentation ribbons. Names are
 * command semantics rather than library glyph names, so distinct actions do
 * not accidentally share a merely similar metaphor.
 */
export const CODE_RIBBON_ICON_NAMES = [
  "sourceImport",
  "sourceDownload",
  "codeFile",
  "save",
  "versionHistory",
  "rename",
  "encoding",
  "savedCheck",
  "undo",
  "redo",
  "copilot",
  "console",
  "runFile",
  "stop",
  "explorer",
  "quickOpen",
  "findInFiles",
  "problems",
  "find",
  "formatDocument",
  "formatSelection",
  "toggleComment",
  "lineActions",
  "moveLineUp",
  "moveLineDown",
  "copyLineUp",
  "copyLineDown",
  "joinLines",
  "sortAscending",
  "sortDescending",
  "removeDuplicates",
  "trimWhitespace",
  "changeAllOccurrences",
  "expandSelection",
  "shrinkSelection",
  "addCursors",
  "addCursorAbove",
  "addCursorBelow",
  "addNextOccurrence",
  "transform",
  "goBack",
  "goForward",
  "goToLine",
  "symbols",
  "definition",
  "typeDefinition",
  "implementation",
  "findReferences",
  "incomingCalls",
  "outgoingCalls",
  "peekDefinition",
  "peekReferences",
  "showHover",
  "quickFix",
  "refactor",
  "refactorUndo",
  "organizeImports",
  "compare",
  "previousChange",
  "nextChange",
  "acceptCurrent",
  "accept",
  "acceptBoth",
  "acceptAllIncoming",
  "acceptAll",
  "applyMerge",
  "runSelection",
  "testExplorer",
  "stdin",
  "restartRuntime",
  "showOutput",
  "clearOutput",
  "latexCompiler",
  "recompileFromScratch",
  "compileLog",
  "goToPdf",
  "debugStart",
  "debugRestart",
  "debugStop",
  "runToCursor",
  "breakpoint",
  "debugContinue",
  "stepOver",
  "stepInto",
  "stepOut",
  "step",
  "outline",
  "split",
  "minimap",
  "wordWrap",
  "whitespace",
  "stickyScroll",
  "bracketColors",
  "indentGuides",
  "bracketPairGuides",
  "zoomOut",
  "zoomReset",
  "zoomIn",
  "settings",
  "commandPalette",
  "newWindow",
  "arrangeAll",
  "sideBySide",
  "synchronousScrolling",
  "help",
  "helpSupport",
  "helpFeedback",
  // The run output's own chrome: its header, the run history and the More menu.
  "outputCopy",
  "outputCopied",
  "outputFloat",
  "outputDock",
  "outputMore",
  "outputClose",
  "outputSearch",
  "outputWrap",
  "outputDownload",
  "outputReceipt",
  "outputMaximize",
  "outputRestore",
  "runRerun",
  "runSave",
  "runRemove",
  "runSucceeded",
  "runFailed",
  "runClearHistory",
] as const;

export type CodeRibbonIconName = (typeof CODE_RIBBON_ICON_NAMES)[number];

interface CodeRibbonIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: CodeRibbonIconName;
  size?: number;
}

/**
 * `removeDuplicates` is the one obvious-looking candidate left off: what the
 * code editor dedupes is lines, and table.removeDuplicates draws a worksheet.
 * The local page-and-cross glyph says the right thing here.
 */
const SHARED_ICON_IDS = {
  accept: "review.change.accept",
  compare: "review.compare",
  find: "edit.find",
  outline: "view.navigationPane",
  savedCheck: "selection.check",
  sortAscending: "table.sortAscending",
  sortDescending: "table.sortDescending",
  split: "view.window",
  // Word's View > Window commands and the Help group: the same semantic
  // glyphs the document ribbon draws for them.
  newWindow: "view.document",
  sideBySide: "view.document",
  synchronousScrolling: "view.reading",
  help: "help.search",
  helpSupport: "help.support",
  helpFeedback: "help.feedback",
} as const satisfies Partial<Record<CodeRibbonIconName, OfficeSemanticIconId>>;

const ink = "docs-home-icon__ink";
const soft = "docs-home-icon__ink-soft";
const accent = "docs-home-icon__accent";
const accentFill = "docs-home-icon__accent-fill";
const accentSoftFill = "docs-home-icon__accent-soft-fill";
const warm = "docs-home-icon__warm";
const warmFill = "docs-home-icon__warm-fill";
const danger = "docs-home-icon__danger";
const paper = "docs-home-icon__paper";

function CodePage({ children }: { children?: ReactNode }) {
  return (
    <>
      <path className={paper} d="M5.5 2.75h8.25L18.5 7.5v13.75h-13z" />
      <path className={accentSoftFill} d="M13.75 2.75V7.5h4.75z" />
      <path className={accent} d="M13.75 2.75V7.5h4.75" />
      <path className={soft} d="M8 11.25h7.75M8 14.25h7.75M8 17.25h5" />
      {children}
    </>
  );
}

function ChevronCode() {
  return (
    <>
      <path className={accent} d="m8.5 11-2 2 2 2M15.5 11l2 2-2 2" />
      <path className={soft} d="m13.25 10.5-2.5 5" />
    </>
  );
}

function Magnifier({ x = 14, y = 14 }: { x?: number; y?: number }) {
  return (
    <>
      <circle className={accentSoftFill} cx={x} cy={y} r="4" />
      <circle className={accent} cx={x} cy={y} r="4" />
      <path className={accent} d={`m${x + 2.8} ${y + 2.8} 3.2 3.2`} />
    </>
  );
}

function PlayMark({ x = 15, y = 14 }: { x?: number; y?: number }) {
  return (
    <path className={accentFill} d={`M${x - 2.25} ${y - 3.25}v6.5l5-3.25z`} />
  );
}

function SelectionFrame({ compact = false }: { compact?: boolean }) {
  const x = compact ? 7 : 5;
  const width = compact ? 10 : 14;
  return (
    <>
      <path
        className={soft}
        d={`M${x + 3} 5H${x}v3M${x + width - 3} 5h3v3M${
          x + 3
        } 19H${x}v-3M${x + width - 3} 19h3v-3`}
      />
      <rect
        className={accentSoftFill}
        x={x + 2}
        y="8"
        width={width - 4}
        height="8"
        rx="1"
      />
    </>
  );
}

function DirectionArrow({
  direction,
  double = false,
}: {
  direction: "down" | "left" | "right" | "up";
  double?: boolean;
}) {
  const rotation =
    direction === "right"
      ? 0
      : direction === "down"
        ? 90
        : direction === "left"
          ? 180
          : -90;
  return (
    <g transform={`rotate(${rotation} 12 12)`}>
      {double ? <path className={soft} d="M4.5 8.5h8" /> : null}
      <path className={ink} d="M5 12h13" />
      <path className={accent} d="m14 8 4 4-4 4" />
    </g>
  );
}

function CurvedHistoryArrow({ redo = false }: { redo?: boolean }) {
  return (
    <g transform={redo ? "translate(24 0) scale(-1 1)" : undefined}>
      <path className={accent} d="M8.5 7H4.25v-4" />
      <path className={ink} d="M4.75 7.25A8 8 0 1 1 5.5 17" />
      <circle className={accentFill} cx="5.5" cy="17" r="1.15" />
    </g>
  );
}

function ReferenceNode({
  mode,
}: {
  mode: "definition" | "implementation" | "type";
}) {
  return (
    <>
      <rect className={paper} x="3.5" y="7" width="7" height="10" rx="1.5" />
      <rect
        className={accentSoftFill}
        x="13.5"
        y="4"
        width="7"
        height="7"
        rx="1.5"
      />
      <rect
        className={accentSoftFill}
        x="13.5"
        y="14"
        width="7"
        height="6"
        rx="1.5"
      />
      <path
        className={soft}
        d="M10.5 12H12c2.5 0 2-4.5 2-4.5M12 12c2.5 0 2 5 2 5"
      />
      {mode === "definition" ? (
        <path className={accent} d="m6 10 1.75 2L6 14" />
      ) : null}
      {mode === "type" ? (
        <path className={accent} d="M5.25 10h3.5M7 10v4" />
      ) : null}
      {mode === "implementation" ? (
        <circle className={accentFill} cx="7" cy="12" r="1.5" />
      ) : null}
    </>
  );
}

function CallTree({ outgoing }: { outgoing: boolean }) {
  return (
    <>
      <circle className={paper} cx="6" cy="12" r="2.5" />
      <circle className={accentSoftFill} cx="18" cy="6.5" r="2.5" />
      <circle className={accentSoftFill} cx="18" cy="17.5" r="2.5" />
      <path
        className={soft}
        d="M8.5 12h3c2 0 2-5.5 4-5.5M11.5 12c2 0 2 5.5 4 5.5"
      />
      <path
        className={accent}
        d={
          outgoing
            ? "m17 4.5 2 2-2 2M17 15.5l2 2-2 2"
            : "m19 4.5-2 2 2 2M19 15.5l-2 2 2 2"
        }
      />
    </>
  );
}

function AcceptMark({
  mode,
}: {
  mode: "all" | "both" | "current" | "incoming";
}) {
  return (
    <>
      <rect className={paper} x="4" y="4" width="16" height="16" rx="2" />
      {mode === "both" || mode === "all" ? (
        <path className={soft} d="M12 5v14" />
      ) : null}
      <path
        className={accent}
        d={mode === "current" ? "m16.5 9-6 6-3-3" : "m7.5 12 3 3 6-6"}
      />
      {mode === "incoming" || mode === "all" ? (
        <path className={accent} d="M12 7h5v5" />
      ) : null}
    </>
  );
}

function DebugBug({ mark }: { mark: "play" | "restart" | "stop" }) {
  return (
    <>
      <ellipse className={warmFill} cx="10" cy="12" rx="4" ry="5" />
      <path
        className={warm}
        d="M10 7V4.5M7 7 5.5 5.5M13 7l1.5-1.5M6 10H3.5M6 14H3.5M14 10h2M14 14h2"
      />
      {mark === "play" ? <PlayMark x={18} y={14} /> : null}
      {mark === "stop" ? (
        <rect
          className={accentFill}
          x="16"
          y="11.5"
          width="5"
          height="5"
          rx=".7"
        />
      ) : null}
      {mark === "restart" ? (
        <path className={accent} d="M16 10a4 4 0 1 1-.25 5.9M16 10v3h3" />
      ) : null}
    </>
  );
}

function DebugStep({ mode }: { mode: "into" | "out" | "over" | "step" }) {
  return (
    <>
      <path className={soft} d="M4 18h16" />
      {mode === "over" ? (
        <path className={accent} d="M5 13c1-6 11-6 13-1M15 9l3 3-3 3" />
      ) : null}
      {mode === "into" ? (
        <path className={accent} d="M12 4v11m-4-4 4 4 4-4" />
      ) : null}
      {mode === "out" ? (
        <path className={accent} d="M12 17V6m-4 4 4-4 4 4" />
      ) : null}
      {mode === "step" ? (
        <path className={accent} d="M6 6v10l8-5zM17 6v10" />
      ) : null}
    </>
  );
}

function BracketGlyph({
  paired = false,
  rainbow = false,
}: {
  paired?: boolean;
  rainbow?: boolean;
}) {
  return (
    <>
      <path className={rainbow ? warm : ink} d="M9 4H6v16h3M15 4h3v16h-3" />
      {paired ? (
        <path className={accent} d="M11 7h2M11 12h2M11 17h2" />
      ) : (
        <path className={accent} d="m11 9-2 3 2 3m2-6 2 3-2 3" />
      )}
    </>
  );
}

function glyph(name: CodeRibbonIconName): ReactNode {
  switch (name) {
    case "sourceImport":
      return (
        <>
          <CodePage />
          <path className={accent} d="M3 18V9m-3 3 3-3 3 3" />
        </>
      );
    case "sourceDownload":
      return (
        <>
          <CodePage />
          <path className={accent} d="M3 8v9m-3-3 3 3 3-3M.5 20h5" />
        </>
      );
    case "codeFile":
      return (
        <CodePage>
          <ChevronCode />
        </CodePage>
      );
    case "save":
      return (
        <>
          <path className={paper} d="M4 3.5h13l3 3V20.5H4z" />
          <path className={accentSoftFill} d="M7 3.5h8v6H7z" />
          <path className={accent} d="M7 3.5v6h8v-6M8 20.5v-7h8v7" />
          <circle className={accentFill} cx="13" cy="6.5" r="1" />
        </>
      );
    case "versionHistory":
      return (
        <>
          <circle className={paper} cx="12" cy="12" r="8.5" />
          <path className={accent} d="M12 7v5l3.5 2M7 4.75H3.5v-3" />
          <path className={soft} d="M4 5a10 10 0 0 1 3-2.2" />
        </>
      );
    case "rename":
      return (
        <>
          <CodePage />
          <path className={warmFill} d="m10 18 1-3 6.75-6.75 2 2L13 17z" />
          <path
            className={warm}
            d="m10 18 1-3 6.75-6.75 2 2L13 17zM16.75 9.25l2 2"
          />
        </>
      );
    case "encoding":
      return (
        <>
          <CodePage />
          <circle className={accentFill} cx="9" cy="12" r=".85" />
          <circle className={accentFill} cx="12" cy="12" r=".85" />
          <circle className={accentFill} cx="15" cy="12" r=".85" />
          <path className={accent} d="M8 16h8" />
        </>
      );
    case "undo":
      return <CurvedHistoryArrow />;
    case "redo":
      return <CurvedHistoryArrow redo />;
    case "copilot":
      return (
        <>
          <path className={warmFill} d="m5 18 9-9 2 2-9 9z" />
          <path className={warm} d="m5 18 9-9 2 2-9 9z" />
          <path
            className={accent}
            d="m17.5 3 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM7 3l.5 1.5L9 5l-1.5.5L7 7l-.5-1.5L5 5l1.5-.5z"
          />
          <path className={soft} d="m12 13 2 2" />
        </>
      );
    case "console":
      return (
        <>
          <rect className={paper} x="3" y="4" width="18" height="16" rx="2" />
          <path className={accentSoftFill} d="M3 4h18v4H3z" />
          <path className={soft} d="M6 6h.01M8.5 6h.01" />
          <path className={accent} d="m7 11 3 2-3 2M12 16h5" />
        </>
      );
    case "runFile":
      return (
        <>
          <CodePage />
          <PlayMark x={16} y={16} />
        </>
      );
    case "stop":
      return (
        <>
          <circle className={accentSoftFill} cx="12" cy="12" r="8" />
          <rect
            className={accentFill}
            x="8"
            y="8"
            width="8"
            height="8"
            rx="1.5"
          />
        </>
      );
    case "explorer":
      return (
        <>
          <path className={warmFill} d="M2.75 6.5h7l2 2h9.5v10.75H2.75z" />
          <path className={warm} d="M2.75 6.5h7l2 2h9.5v10.75H2.75z" />
          <path className={accent} d="m10 12-2 2 2 2M15 12l2 2-2 2" />
        </>
      );
    case "quickOpen":
      return (
        <>
          <CodePage />
          <path className={accent} d="m8 14 2-2-2-2M14 10l2 2-2 2" />
          <circle className={warmFill} cx="18" cy="18" r="3" />
          <path className={warm} d="m20 20 2 2" />
        </>
      );
    case "findInFiles":
      return (
        <>
          <path className={paper} d="M3 3.5h10v14H3zM7 6.5h10v14H7" />
          <path className={soft} d="M9.5 10h5M9.5 13h4" />
          <Magnifier x={16} y={16} />
        </>
      );
    case "problems":
      return (
        <>
          <path className={warmFill} d="M12 3.25 21 20H3z" />
          <path className={danger} d="M12 3.25 21 20H3zM12 8v6" />
          <circle className={accentFill} cx="12" cy="17" r=".9" />
        </>
      );
    case "formatDocument":
      return (
        <>
          <CodePage />
          <path className={accent} d="M8 11h7M8 14h9M8 17h5" />
          <circle className={warmFill} cx="18.5" cy="18" r="2" />
        </>
      );
    case "formatSelection":
      return (
        <>
          <SelectionFrame />
          <path className={accent} d="M8 10h8M8 13h6" />
        </>
      );
    case "toggleComment":
      return (
        <>
          <path className={paper} d="M3.5 4.5h17v12h-9l-4.5 3v-3H3.5z" />
          <path className={accent} d="m8 8-2 2 2 2M16 8l2 2-2 2M13 7l-2 6" />
        </>
      );
    case "lineActions":
      return (
        <>
          <path className={ink} d="M7 6h13M7 12h10M7 18h13" />
          <circle className={accentFill} cx="3.5" cy="6" r="1" />
          <circle className={accentFill} cx="3.5" cy="12" r="1" />
          <circle className={accentFill} cx="3.5" cy="18" r="1" />
        </>
      );
    case "moveLineUp":
      return (
        <>
          <path className={soft} d="M10 7h10M10 12h10M10 17h10" />
          <path className={accent} d="M5 18V6m-3 3 3-3 3 3" />
        </>
      );
    case "moveLineDown":
      return (
        <>
          <path className={soft} d="M10 7h10M10 12h10M10 17h10" />
          <path className={accent} d="M5 6v12m-3-3 3 3 3-3" />
        </>
      );
    case "copyLineUp":
      return (
        <>
          <path className={paper} d="M9 7h11v12H9zM5 3h11v3" />
          <path className={accent} d="M5 19V8m-3 3 3-3 3 3" />
        </>
      );
    case "copyLineDown":
      return (
        <>
          <path className={paper} d="M9 5h11v12H9zM5 18h11v3" />
          <path className={accent} d="M5 5v11m-3-3 3 3 3-3" />
        </>
      );
    case "joinLines":
      return (
        <>
          <path className={soft} d="M4 7h8M4 17h8M16 7h4M16 17h4" />
          <path className={accent} d="M8 7c0 5 8 0 8 5s-8 0-8 5M13 9l3 3-3 3" />
        </>
      );
    case "sortAscending":
      return (
        <>
          <path className={ink} d="M10 6h10M10 11h7M10 16h4" />
          <path className={accent} d="M5 19V5m-3 3 3-3 3 3" />
        </>
      );
    case "sortDescending":
      return (
        <>
          <path className={ink} d="M10 6h4M10 11h7M10 16h10" />
          <path className={accent} d="M5 5v14m-3-3 3 3 3-3" />
        </>
      );
    case "removeDuplicates":
      return (
        <>
          <rect className={paper} x="4" y="4" width="10" height="12" rx="1" />
          <rect
            className={accentSoftFill}
            x="9"
            y="8"
            width="10"
            height="12"
            rx="1"
          />
          <path className={danger} d="m12 12 4 4M16 12l-4 4" />
        </>
      );
    case "trimWhitespace":
      return (
        <>
          <path className={ink} d="M4 7h13M4 12h9M4 17h11" />
          <path
            className={accent}
            d="m18 13 .6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6zM19 5l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4z"
          />
        </>
      );
    case "changeAllOccurrences":
      return (
        <>
          <SelectionFrame compact />
          <path className={accent} d="M9 9v6M15 9v6" />
          <path className={soft} d="M6 12H3m15 0h3" />
        </>
      );
    case "expandSelection":
      return (
        <>
          <SelectionFrame compact />
          <path
            className={accent}
            d="M8 8 5 5m0 0v3m0-3h3M16 8l3-3m0 0v3m0-3h-3M8 16l-3 3m0 0v-3m0 3h3M16 16l3 3m0 0v-3m0 3h-3"
          />
        </>
      );
    case "shrinkSelection":
      return (
        <>
          <SelectionFrame />
          <path
            className={accent}
            d="m5 5 3 3m0 0V5m0 3H5m14-3-3 3m0 0V5m0 3h3M5 19l3-3m0 0v3m0-3H5m14 3-3-3m0 0v3m0-3h3"
          />
        </>
      );
    case "addCursors":
      return (
        <>
          <path className={ink} d="M6 6h11M6 12h11M6 18h11" />
          <path className={accent} d="M4 4v4M4 10v4M4 16v4M20 8v8" />
        </>
      );
    case "addCursorAbove":
      // the caret already in the text (ink, below) and the one added on the
      // line above it (accent), the chevron pointing the way it went
      return (
        <>
          <path className={soft} d="M10 7h10M10 17h10" />
          <path className={ink} d="M6 14.5v5" />
          <path className={accent} d="M6 4.5v5m-2 3.5 2-1.75L8 13" />
        </>
      );
    case "addCursorBelow":
      return (
        <>
          <path className={soft} d="M10 7h10M10 17h10" />
          <path className={ink} d="M6 4.5v5" />
          <path className={accent} d="M6 14.5v5M4 11l2 1.75L8 11" />
        </>
      );
    case "addNextOccurrence":
      // the selected word and, beside it, the next match joining the selection
      return (
        <>
          <rect
            className={accentSoftFill}
            x="3"
            y="9"
            width="7"
            height="6"
            rx="1"
          />
          <path className={accent} d="M3.5 9v6M9.5 9v6" />
          <rect
            className={soft}
            x="13.5"
            y="9.5"
            width="7"
            height="5"
            rx="1"
          />
          <path className={accent} d="M17 3v4M15 5h4M13.5 18.5h7" />
        </>
      );
    case "transform":
      return (
        <>
          <path className={ink} d="M3.5 18 8 6l4.5 12M5 14h6" />
          <path
            className={accent}
            d="M15 8h6m-3-3 3 3-3 3M21 16h-6m3-3-3 3 3 3"
          />
        </>
      );
    case "goBack":
      return <DirectionArrow direction="left" />;
    case "goForward":
      return <DirectionArrow direction="right" />;
    case "goToLine":
      return (
        // lowered 1 so the drawing's middle is the canvas's
        <g transform="translate(0 1)">
          <path className={ink} d="M5 6h14M5 11h10M5 16h14" />
          <path className={accent} d="M12 3v16m-3-3 3 3 3-3" />
        </g>
      );
    case "symbols":
      return (
        <>
          <circle className={accentSoftFill} cx="6" cy="6" r="2" />
          <rect className={paper} x="13" y="4" width="7" height="4" rx="1" />
          <circle className={accentSoftFill} cx="9" cy="18" r="2" />
          <rect className={paper} x="15" y="16" width="5" height="4" rx="1" />
          <path className={soft} d="M6 8v5c0 3 3 3 3 3M8 6h5M11 18h4" />
        </>
      );
    case "definition":
      return <ReferenceNode mode="definition" />;
    case "typeDefinition":
      return <ReferenceNode mode="type" />;
    case "implementation":
      return <ReferenceNode mode="implementation" />;
    case "findReferences":
      return (
        <>
          <circle className={paper} cx="5" cy="12" r="2.5" />
          <circle className={accentSoftFill} cx="15" cy="6" r="2.5" />
          <circle className={accentSoftFill} cx="15" cy="18" r="2.5" />
          <path className={soft} d="m7.25 10.5 5.5-3M7.25 13.5l5.5 3" />
          <Magnifier x={18} y={12} />
        </>
      );
    case "incomingCalls":
      return <CallTree outgoing={false} />;
    case "outgoingCalls":
      return <CallTree outgoing />;
    case "peekDefinition":
      return (
        <>
          <path
            className={paper}
            d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z"
          />
          <circle className={accentSoftFill} cx="12" cy="12" r="2.5" />
          <path className={accent} d="m11 10.5-1 1.5 1 1.5m2-3 1 1.5-1 1.5" />
        </>
      );
    case "peekReferences":
      return (
        <>
          <CodePage />
          <Magnifier x={17} y={16} />
        </>
      );
    case "showHover":
      // the hover card standing over the caret, opened without a pointer
      return (
        <>
          <path className={paper} d="M4.5 3.5h15v9h-6l-1.5 2-1.5-2h-6z" />
          <path className={soft} d="M7.5 7h9M7.5 9.5h6" />
          <path className={accent} d="M12 16.5v4.5" />
        </>
      );
    case "quickFix":
      return (
        <>
          <path
            className={warmFill}
            d="M8 15c-2-1.5-3-3.2-3-5.3A7 7 0 0 1 19 10c0 2-1.2 3.8-3 5v2H8z"
          />
          <path
            className={warm}
            d="M8 15c-2-1.5-3-3.2-3-5.3A7 7 0 0 1 19 10c0 2-1.2 3.8-3 5v2H8zM8 20h8"
          />
          <path className={accent} d="m10 8-2 2 2 2M14 8l2 2-2 2" />
        </>
      );
    case "refactor":
      return (
        <>
          <path className={ink} d="m7 5-3 3 3 3M17 13l3 3-3 3" />
          <path className={soft} d="M4 8h8c4 0 4 8 8 8M20 8h-5c-3 0-4 2-5 4" />
          <circle className={accentFill} cx="13" cy="8" r="1.2" />
        </>
      );
    case "refactorUndo":
      return (
        <>
          <CurvedHistoryArrow />
          <path className={accent} d="m14 9-2 3 2 3m3-6 2 3-2 3" />
        </>
      );
    case "organizeImports":
      return (
        <>
          <path className={paper} d="M3.5 4h8v6h-8zM12.5 14h8v6h-8z" />
          <path
            className={accent}
            d="M7.5 10v3c0 2 2 2 5 2M10 12.5l2.5 2.5-2.5 2.5"
          />
          <path className={soft} d="M5.5 7h4M14.5 17h4" />
        </>
      );
    case "previousChange":
      return (
        // lowered 1 so the drawing's middle is the canvas's
        <g transform="translate(0 1)">
          <path className={ink} d="M5 5h14M5 11h9M5 17h14" />
          <path className={accent} d="M17 15V7m-3 3 3-3 3 3" />
        </g>
      );
    case "nextChange":
      return (
        <g transform="translate(0 1)">
          <path className={ink} d="M5 5h14M5 11h9M5 17h14" />
          <path className={accent} d="M17 7v8m-3-3 3 3 3-3" />
        </g>
      );
    case "acceptCurrent":
      return <AcceptMark mode="current" />;
    case "acceptBoth":
      return <AcceptMark mode="both" />;
    case "acceptAllIncoming":
      return <AcceptMark mode="incoming" />;
    case "acceptAll":
      return <AcceptMark mode="all" />;
    case "applyMerge":
      return (
        <>
          <circle className={accentFill} cx="6" cy="5" r="1.5" />
          <circle className={accentFill} cx="18" cy="5" r="1.5" />
          <circle className={accentFill} cx="12" cy="19" r="1.5" />
          <path
            className={ink}
            d="M6 6.5v3c0 3 6 2 6 7.5M18 6.5v3c0 3-6 2-6 7.5"
          />
          <path className={accent} d="m9 13 3 4 3-4" />
        </>
      );
    case "runSelection":
      return (
        <>
          <SelectionFrame />
          <PlayMark x={15} y={12} />
        </>
      );
    case "testExplorer":
      return (
        <>
          <path
            className={paper}
            d="M8 3.5h8M10 3.5v5l-5 9c-.8 1.5.2 3 2 3h10c1.8 0 2.8-1.5 2-3l-5-9v-5"
          />
          <path className={accentSoftFill} d="m7.5 16 2-3 2 1 2.5-2 3 4z" />
          <path className={accent} d="M7.5 16h9" />
          <circle className={warmFill} cx="17.5" cy="7" r="2" />
        </>
      );
    case "stdin":
      return (
        <>
          <rect className={paper} x="3" y="4" width="18" height="16" rx="2" />
          <path className={accent} d="m6 10 3 2-3 2M11 15h6" />
          <path className={soft} d="M8 2v4m-2-2 2 2 2-2" />
        </>
      );
    case "restartRuntime":
      return (
        <>
          <path className={accent} d="M18 8V3.5l-3 3A8 8 0 1 0 20 14" />
          <path className={ink} d="m10 8 6 4-6 4z" />
        </>
      );
    case "showOutput":
      return (
        <>
          <rect className={paper} x="3" y="4" width="18" height="16" rx="2" />
          <path className={accentSoftFill} d="M3 15h18v5H3z" />
          <path className={soft} d="M6 8h8M6 11h11" />
          <path className={accent} d="M6 17.5h12" />
        </>
      );
    case "clearOutput":
      return (
        <>
          <rect className={paper} x="3" y="4" width="15" height="12" rx="1.5" />
          <path className={soft} d="M6 8h9M6 11h7" />
          <path className={danger} d="M15 15.5h6M17 15.5v5h2v-5M16 13.5h4" />
        </>
      );
    case "latexCompiler":
      // The compile's engine: a source page and the cog that typesets it.
      return (
        <>
          <path className={paper} d="M5 2.75h8.25L17.5 7v4.5M5 2.75v18.5h7.5" />
          <path className={accent} d="M13.25 2.75V7h4.25" />
          <path className={soft} d="M7.75 10h6.5M7.75 13h4M7.75 16h3" />
          <circle className={accentSoftFill} cx="17" cy="17" r="3.25" />
          <circle className={accent} cx="17" cy="17" r="3.25" />
          <path className={accent} d="M17 12.5v1.25M17 20.25v1.25M12.5 17h1.25M20.25 17h1.25" />
          <circle className={accentFill} cx="17" cy="17" r="1" />
        </>
      );
    case "recompileFromScratch":
      // Compile again from a clean sheet: the restart arrow around a blank page.
      return (
        <>
          <path className={accent} d="M18 8V3.5l-3 3A8 8 0 1 0 20 14" />
          <path className={paper} d="M9.25 8.5h3.75l2 2v5.25H9.25z" />
          <path className={soft} d="M13 8.5v2h2" />
        </>
      );
    case "compileLog":
      // The compile's log: listed lines, one of them flagged.
      return (
        <>
          <rect className={paper} x="4" y="3" width="16" height="18" rx="2" />
          <path className={soft} d="M10 8h7M10 12h7M10 16h5" />
          <circle className={danger} cx="7" cy="8" r="1" />
          <path className={warm} d="m7 10.75 1.4 2.5H5.6z" />
          <path className={accent} d="M6.25 16h1.5" />
        </>
      );
    case "goToPdf":
      // From the line at the cursor to its place in the document.
      return (
        <>
          <path className={paper} d="M12.5 3h6l2.5 2.5V21h-8.5z" />
          <path className={accentSoftFill} d="M14.5 11h4.5v3h-4.5z" />
          <path className={soft} d="M14.5 7.5h4.5M14.5 17.5h4.5" />
          <path className={accent} d="M3 12.5h8m-3-3 3 3-3 3" />
        </>
      );
    case "debugStart":
      return <DebugBug mark="play" />;
    case "debugRestart":
      return <DebugBug mark="restart" />;
    case "debugStop":
      return <DebugBug mark="stop" />;
    case "runToCursor":
      return (
        <>
          <path className={ink} d="m5 3 8 8-4 1 2 5-2 1-2-5-3 3z" />
          <path className={accent} d="M15 7h6M18 4v6" />
          <PlayMark x={17} y={17} />
        </>
      );
    case "breakpoint":
      return (
        <>
          <path className={soft} d="M5 3v18M9 6h11M9 12h8M9 18h11" />
          <circle className={danger} cx="5" cy="12" r="3" />
          <circle className={accentFill} cx="5" cy="12" r="1.3" />
        </>
      );
    case "debugContinue":
      return (
        <>
          <path className={ink} d="M4 4v16" />
          <PlayMark x={12} y={12} />
          <path className={accent} d="M20 5v14" />
        </>
      );
    case "stepOver":
      return <DebugStep mode="over" />;
    case "stepInto":
      return <DebugStep mode="into" />;
    case "stepOut":
      return <DebugStep mode="out" />;
    case "step":
      return <DebugStep mode="step" />;
    case "minimap":
      return (
        <>
          <rect className={paper} x="3" y="3" width="18" height="18" rx="2" />
          <path className={ink} d="M6 7h7M6 10h9M6 13h6M6 16h8" />
          <rect
            className={accentSoftFill}
            x="16"
            y="5"
            width="3"
            height="12"
            rx="1"
          />
          <path className={accent} d="M17.5 7v7" />
        </>
      );
    case "wordWrap":
      return (
        // raised 1.5 so the drawing's middle is the canvas's
        <g transform="translate(0 -1.5)">
          <path className={ink} d="M3 6h15M3 11h14c4 0 4 7 0 7h-4" />
          <path className={accent} d="m16 15-3 3 3 3M3 16h6" />
        </g>
      );
    case "whitespace":
      return (
        <>
          <path className={ink} d="M15 4v16M15 4h4M10 4v8a4 4 0 0 1 0-8h5" />
          <circle className={accentFill} cx="4" cy="8" r="1" />
          <circle className={accentFill} cx="4" cy="13" r="1" />
          <circle className={accentFill} cx="4" cy="18" r="1" />
        </>
      );
    case "stickyScroll":
      return (
        <>
          <path className={paper} d="M5 4h14v16H5z" />
          <path className={accentSoftFill} d="M5 4h14v5H5z" />
          <path className={ink} d="M8 12h8M8 16h6" />
          <path className={accent} d="M12 5v3M10 6.5h4" />
        </>
      );
    case "bracketColors":
      return <BracketGlyph rainbow />;
    case "indentGuides":
      return (
        <>
          <path className={soft} strokeDasharray="1.5 2" d="M7 4v16M12 4v16" />
          <path className={ink} d="M4 7h9M9 12h10M14 17h6" />
          <path className={accent} d="m4 10 2 2-2 2" />
        </>
      );
    case "bracketPairGuides":
      return <BracketGlyph paired />;
    case "zoomOut":
      return (
        <>
          <Magnifier x={10} y={10} />
          <path className={accent} d="M7 10h6" />
        </>
      );
    case "zoomReset":
      return (
        <>
          <circle className={paper} cx="10" cy="10" r="6" />
          <path className={accent} d="M10 6.5V13M8 8l2-1.5" />
          <path className={ink} d="m14.5 14.5 5 5M19 11v4h-4" />
        </>
      );
    case "zoomIn":
      return (
        <>
          <Magnifier x={10} y={10} />
          <path className={accent} d="M7 10h6M10 7v6" />
        </>
      );
    case "settings":
      return (
        <>
          <circle className={accentSoftFill} cx="12" cy="12" r="3" />
          <path
            className={ink}
            d="M9.5 3.8h5l.7 2.2 2 .9 2.1-1.1 2.5 4.3-1.7 1.6v2.3l1.7 1.6-2.5 4.3-2.1-1.1-2 .9-.7 2.2h-5l-.7-2.2-2-.9-2.1 1.1-2.5-4.3L3.9 14v-2.3l-1.7-1.6 2.5-4.3 2.1 1.1 2-.9z"
          />
          <circle className={accent} cx="12" cy="12" r="3" />
        </>
      );
    case "commandPalette":
      return (
        <>
          <rect className={paper} x="3" y="4" width="18" height="16" rx="3" />
          <path className={accentSoftFill} d="M3 4h18v5H3z" />
          <path className={accent} d="M7 6.5h10M7 12h4M7 16h7" />
          <path className={warm} d="m17 12 2 2-2 2" />
        </>
      );
    case "arrangeAll":
      // Arrange All: the windows tiled into a grid, the front one accented.
      return (
        <>
          <rect className={paper} x="3" y="4" width="8" height="7" rx="1.5" />
          <rect className={paper} x="13" y="4" width="8" height="7" rx="1.5" />
          <rect className={paper} x="3" y="13" width="8" height="7" rx="1.5" />
          <rect
            className={accentSoftFill}
            x="13"
            y="13"
            width="8"
            height="7"
            rx="1.5"
          />
          <rect className={accent} x="13" y="13" width="8" height="7" rx="1.5" />
        </>
      );
    case "accept":
    case "compare":
    case "find":
    case "outline":
    case "outputCopy":
      // Two sheets: the copy lifted off the one behind it.
      return (
        <>
          <rect className={soft} x="8.75" y="3.25" width="11" height="13" rx="2.25" />
          <rect className={paper} x="4.25" y="7.75" width="11" height="13" rx="2.25" />
          <path className={accent} d="M7.25 12.25h5M7.25 15.25h5M7.25 18.25h3" />
        </>
      );
    case "outputCopied":
      return (
        <>
          <rect className={accentSoftFill} x="4.25" y="4.25" width="15.5" height="15.5" rx="3.5" />
          <rect className={accent} x="4.25" y="4.25" width="15.5" height="15.5" rx="3.5" />
          <path className={accent} d="m8.5 12.25 2.4 2.4 4.85-5.15" />
        </>
      );
    case "outputFloat":
      // The panel lifts off the window's bottom edge into a card of its own.
      return (
        <>
          <rect className={paper} x="3" y="3.75" width="18" height="16.5" rx="2.75" />
          <path className={soft} d="M6 7.5h7M6 10.25h4.5" />
          <rect className={accentSoftFill} x="10.25" y="11.25" width="8" height="6.25" rx="1.6" />
          <rect className={accent} x="10.25" y="11.25" width="8" height="6.25" rx="1.6" />
          <path className={accent} d="M5.75 16.75 8.5 14m0 0H6.25M8.5 14v2.25" />
        </>
      );
    case "outputDock":
      return (
        <>
          <rect className={paper} x="3" y="3.75" width="18" height="16.5" rx="2.75" />
          <path className={accentSoftFill} d="M3.5 14.25h17v3.25a2.25 2.25 0 0 1-2.25 2.25H5.75A2.25 2.25 0 0 1 3.5 17.5z" />
          <path className={accent} d="M3 14.25h18" />
          <path className={accent} d="M12 6.75v4.75m-2.25-2.25L12 11.5l2.25-2.25" />
        </>
      );
    case "outputMore":
      return (
        <>
          <circle className={accentFill} cx="6" cy="12" r="1.6" />
          <circle className={accentFill} cx="12" cy="12" r="1.6" />
          <circle className={accentFill} cx="18" cy="12" r="1.6" />
        </>
      );
    case "outputClose":
      return <path className={ink} d="m7.25 7.25 9.5 9.5m0-9.5-9.5 9.5" />;
    case "outputSearch":
      return (
        <>
          <rect className={paper} x="3" y="4" width="14" height="15" rx="2.25" />
          <path className={soft} d="M6 8h8M6 11h5" />
          <Magnifier x={15} y={15} />
        </>
      );
    case "outputWrap":
      return (
        <>
          <path className={soft} d="M4 6.5h16M4 17.5h4.5" />
          <path className={accent} d="M4 12h12.25a3 3 0 0 1 0 6h-3.5" />
          <path className={accent} d="m14.5 16-2 2 2 2" />
        </>
      );
    case "outputDownload":
      return (
        <>
          <path className={soft} d="M4.25 14.75v3.5a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-3.5" />
          <path className={accent} d="M12 3.75v10.5m-4.25-4.25L12 14.25 16.25 10" />
        </>
      );
    case "outputReceipt":
      // The signed receipt of the run: a ticket with a check.
      return (
        <>
          <path className={paper} d="M6 3.25h12v17.5l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
          <path className={soft} d="M8.75 7.5h6.5M8.75 10.25h4" />
          <path className={accent} d="m9.25 14.5 1.9 1.9 3.6-3.85" />
        </>
      );
    case "outputMaximize":
      return (
        <>
          <rect className={paper} x="3.25" y="3.25" width="17.5" height="17.5" rx="3" />
          <path className={accent} d="M13.5 6.75h3.75v3.75M10.5 17.25H6.75V13.5M17.25 6.75 13 11M6.75 17.25 11 13" />
        </>
      );
    case "outputRestore":
      return (
        <>
          <rect className={paper} x="3.25" y="3.25" width="17.5" height="17.5" rx="3" />
          <path className={accent} d="M17.25 10.5H13.5V6.75M6.75 13.5h3.75v3.75M13.5 10.5l3.75-3.75M10.5 13.5l-3.75 3.75" />
        </>
      );
    case "runRerun":
      return (
        <>
          <path className={accent} d="M19.25 12a7.25 7.25 0 1 1-2.12-5.13" />
          <path className={accent} d="M19.5 3.75v4h-4" />
          <PlayMark x={12.75} y={12} />
        </>
      );
    case "runSave":
      return (
        <>
          <path className={paper} d="M6.25 3.25h11.5v17.5L12 16.9l-5.75 3.85z" />
          <path className={accent} d="M12 6.75v6M9 9.75h6" />
        </>
      );
    case "runRemove":
      return (
        <>
          <path className={soft} d="M4.25 6.75h15.5M9.5 6.75V4.5h5v2.25" />
          <path className={paper} d="M6.5 6.75 7.6 19.4a1.75 1.75 0 0 0 1.75 1.6h5.3a1.75 1.75 0 0 0 1.75-1.6l1.1-12.65" />
          <path className={danger} d="M10.25 10.75v6.25M13.75 10.75v6.25" />
        </>
      );
    case "runSucceeded":
      return (
        <>
          <circle className={accentSoftFill} cx="12" cy="12" r="8.25" />
          <circle className={accent} cx="12" cy="12" r="8.25" />
          <path className={accent} d="m8.5 12.25 2.4 2.4 4.6-4.9" />
        </>
      );
    case "runFailed":
      return (
        <>
          <circle className={warmFill} cx="12" cy="12" r="8.25" />
          <path className={danger} d="M12 7.75v5" />
          <path className={danger} d="M12 16.1v.15" />
        </>
      );
    case "runClearHistory":
      return (
        <>
          <path className={soft} d="M4 6.5h9M4 10.5h7M4 14.5h5" />
          <path className={paper} d="M12.75 11.25h7.5l-.8 8.1a1.5 1.5 0 0 1-1.5 1.4h-2.9a1.5 1.5 0 0 1-1.5-1.4z" />
          <path className={danger} d="M11.75 11.25h9.5M15 9.25h3" />
        </>
      );
    case "savedCheck":
    case "split":
    case "newWindow":
    case "sideBySide":
    case "synchronousScrolling":
    case "help":
    case "helpSupport":
    case "helpFeedback":
      return null;
  }

  const exhaustiveName: never = name;
  return exhaustiveName;
}

/**
 * Memoized: ribbon icons take a name and a size, so a window render (every
 * content snapshot re-renders the code window) reuses each icon's SVG subtree
 * instead of re-creating its paths.
 */
export const CodeRibbonIcon = memo(CodeRibbonIconView);

function CodeRibbonIconView({
  name,
  size = 18,
  className,
  style,
  ...props
}: CodeRibbonIconProps) {
  const semanticId = SHARED_ICON_IDS[name as keyof typeof SHARED_ICON_IDS] as
    OfficeSemanticIconId | undefined;
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
      data-code-ribbon-icon={name}
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
      strokeWidth={1}
      style={
        semanticId
          ? ({ ...style, "--office-icon-size": `${size}px` } as CSSProperties)
          : style
      }
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
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
