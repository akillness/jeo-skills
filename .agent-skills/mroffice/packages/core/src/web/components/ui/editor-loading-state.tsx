"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Bookmark,
  CalendarDays,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileType2,
  ImageIcon,
  LayoutDashboard,
  LibraryBig,
  List,
  MessagesSquare,
  Network,
  PanelsTopLeft,
  Presentation,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Users,
  type HouseIcon,
} from "../office-ribbon/icons/houseIcons";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "../../lib/utils";

import styles from "./editor-loading-state.module.css";
import { useLocalFilePreviewInScope } from "./local-file-preview-context";

// A file's own preview, over the card of a window whose page is still being
// made from it (lib/document-import/local-file-preview). Loaded only then.
const LocalFilePreviewLayer = lazy(
  () => import("../notebook/LocalFilePreviewLayer"),
);

/**
 * What is being loaded. The first eight are the editors and windows the
 * design was drawn for; the rest are the product's other surfaces, so a
 * page, a panel or a dialog that is not ready shows its own kind of thing
 * being put together, in the same card and the same rhythm:
 *
 *   library    a shelf of notebooks          (notebook and page libraries)
 *   list       rows with an icon and a name  (lists, pickers, history)
 *   messages   a conversation, both sides    (messages, threads, comments)
 *   calendar   a month with its events
 *   graph      nodes joined one by one       (memory, links, relations)
 *   settings   options switched on           (settings, billing, policies)
 *   people     a person and their members    (profiles, sharing, accounts)
 *   dashboard  figures and a chart           (home, admin, usage)
 *   media      a picture and its strip       (images, covers, galleries)
 *   app        the workspace itself          (routes, sign-in, first paint)
 */
export type EditorLoadingKind =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "code"
  | "ai"
  | "reference"
  | "generic"
  | "library"
  | "list"
  | "messages"
  | "calendar"
  | "graph"
  | "settings"
  | "people"
  | "dashboard"
  | "media"
  | "app";

/** Every kind, for galleries and tests. */
export const EDITOR_LOADING_KINDS: readonly EditorLoadingKind[] = [
  "document",
  "spreadsheet",
  "presentation",
  "pdf",
  "code",
  "ai",
  "reference",
  "generic",
  "library",
  "list",
  "messages",
  "calendar",
  "graph",
  "settings",
  "people",
  "dashboard",
  "media",
  "app",
];

export interface EditorLoadingStateProps {
  readonly kind: EditorLoadingKind;
  /** What is loading. Empty draws the card alone (pass `announce={false}`). */
  readonly label: string;
  readonly detail?: string;
  readonly compact?: boolean;
  /**
   * The card beside its label, in one row about 80px tall: for a list, a
   * section or a popover body that is not ready, where the full card would
   * be out of proportion. (A surface too small for the card takes this
   * form by itself.)
   */
  readonly minimal?: boolean;
  readonly className?: string;
  readonly testId?: string;
  readonly labelTestId?: string;
  readonly detailTestId?: string;
  /** A surrounding status surface can own the live announcement. */
  readonly announce?: boolean;
}

export type EditorLoadingDensity = "surface" | "compact" | "minimal";

export function editorLoadingDensityForSize(
  width: number,
  height: number,
): EditorLoadingDensity {
  if (width <= 0 || height <= 0 || width < 300 || height < 240) {
    return "minimal";
  }
  if (width < 480 || height < 560) return "compact";
  return "surface";
}

const KIND_ICONS: Readonly<Record<EditorLoadingKind, HouseIcon>> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  pdf: FileType2,
  code: FileCode2,
  ai: Sparkles,
  reference: Bookmark,
  generic: StickyNote,
  library: LibraryBig,
  list: List,
  messages: MessagesSquare,
  calendar: CalendarDays,
  graph: Network,
  settings: SlidersHorizontal,
  people: Users,
  dashboard: LayoutDashboard,
  media: ImageIcon,
  app: PanelsTopLeft,
};

/**
 * One piece of the page being built. `slot` (0–7) is when it arrives in
 * the shared cycle (every piece leaves together at the end); `from` is how
 * it arrives (grown from its left edge by default).
 */
function Piece({
  slot,
  className,
  from,
  tone,
  style,
  children,
}: {
  readonly slot: number;
  readonly className?: string;
  readonly from?: "grow" | "rise" | "pop" | "drop" | "lift";
  /** A second or third colour of the kind (a book, an event, a node). */
  readonly tone?: number;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}) {
  return (
    <span
      className={cn(styles.piece, styles[`s${slot}`], className)}
      data-from={from ?? "grow"}
      data-tone={tone}
      style={style}
    >
      {children}
    </span>
  );
}

const px = (value: number) => `${value}px`;

/** A written line: its bar grows from the left. */
function Line({
  slot,
  width,
  className,
}: {
  readonly slot: number;
  readonly width: number;
  readonly className?: string;
}) {
  return (
    <Piece
      slot={slot}
      className={cn(styles.line, className)}
      style={{ width: px(width) }}
    />
  );
}

/**
 * The caret that writes the lines: it rides each written line's end as
 * that line grows, in the same slots (`writes[i]` is slot i's row, the x
 * where that line ends and, if not 0, where it starts), then waits at the
 * last one.
 */
function Caret({
  writes,
  pitch,
  className,
}: {
  readonly writes: ReadonlyArray<
    readonly [row: number, endX: number, startX?: number]
  >;
  readonly pitch: number;
  readonly className?: string;
}) {
  const vars: Record<string, string> = { "--caret-pitch": px(pitch) };
  for (let index = 0; index < 7; index += 1) {
    const [row, endX, startX = 0] = writes[Math.min(index, writes.length - 1)];
    vars[`--caret-r${index}`] = String(row);
    vars[`--caret-x${index}`] = px(endX);
    // past the last write it waits at that line's end
    vars[`--caret-s${index}`] = px(index >= writes.length ? endX : startX);
  }
  return (
    <span
      className={cn(styles.caret, className)}
      style={vars as CSSProperties}
    />
  );
}

function DocumentBuild() {
  const widths = [100, 94, 100, 62];
  return (
    <div className={styles.doc}>
      <Line slot={0} width={66} className={styles.heading} />
      {widths.map((width, index) => (
        <Line key={index} slot={index + 1} width={width} />
      ))}
      <span className={styles.gap} />
      <Line slot={5} width={100} />
      <Line slot={6} width={78} />
      <Caret
        pitch={11}
        writes={[
          [0, 66],
          ...widths.map((width, index) => [index + 1, width] as const),
          [6, 100],
          [7, 78],
        ]}
      />
    </div>
  );
}

const SHEET_FILLED = new Set([6, 9, 12, 13, 17]);

function SpreadsheetBuild() {
  return (
    <div className={styles.sheet}>
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const index = row * 5 + col;
          return (
            <Piece
              key={index}
              slot={row === 0 ? 0 : row + 1}
              from="pop"
              className={cn(
                styles.cell,
                row === 0 && styles.cellHead,
                SHEET_FILLED.has(index) && styles.cellFilled,
              )}
              style={{ "--cell-col": col } as CSSProperties}
            />
          );
        }),
      )}
      <span className={styles.selection} />
    </div>
  );
}

function PresentationBuild() {
  const bars = [0.42, 0.66, 0.54, 0.9];
  return (
    <div className={styles.slide}>
      <Line slot={0} width={74} className={styles.heading} />
      <div className={styles.slideBody}>
        <div className={styles.bullets}>
          {[56, 46, 52].map((width, index) => (
            <Piece key={index} slot={index + 1} className={styles.bullet}>
              <span className={styles.bulletDot} />
              <span className={styles.bulletBar} style={{ width: px(width) }} />
            </Piece>
          ))}
        </div>
        <div className={styles.chart}>
          {bars.map((height, index) => (
            <Piece
              key={index}
              slot={index + 3}
              from="rise"
              className={styles.chartBar}
              style={{ height: `${height * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PdfBuild() {
  return (
    <div className={styles.pdf}>
      <span className={styles.pdfTag}>PDF</span>
      <Line slot={0} width={58} className={styles.heading} />
      {[96, 100, 88, 100, 70].map((width, index) => (
        <Line key={index} slot={index + 1} width={width} />
      ))}
      <span className={styles.scan} />
    </div>
  );
}

/** One line of code: its tokens, each [width, colour role]. */
const CODE_LINES: ReadonlyArray<{
  indent: number;
  tokens: ReadonlyArray<readonly [number, "kw" | "id" | "str" | "fn" | "pun"]>;
}> = [
  { indent: 0, tokens: [[22, "kw"], [30, "fn"], [10, "pun"]] },
  { indent: 10, tokens: [[18, "kw"], [24, "id"], [36, "str"]] },
  { indent: 10, tokens: [[26, "id"], [8, "pun"], [30, "fn"]] },
  { indent: 20, tokens: [[20, "kw"], [44, "str"]] },
  { indent: 10, tokens: [[8, "pun"]] },
  { indent: 0, tokens: [[8, "pun"]] },
];

const CODE_TOKEN_GAP = 3;
const CODE_GUTTER = 14;

function CodeBuild() {
  const writes = CODE_LINES.map((line, index) => {
    const tokens = line.tokens.reduce((sum, [width]) => sum + width, 0);
    const gaps = Math.max(0, line.tokens.length - 1) * CODE_TOKEN_GAP;
    const start = CODE_GUTTER + line.indent;
    return [index, start + tokens + gaps, start] as const;
  });
  return (
    <div className={styles.code}>
      {CODE_LINES.map((line, index) => (
        <div key={index} className={styles.codeRow}>
          <span className={styles.gutter}>{index + 1}</span>
          <Piece
            slot={index}
            className={styles.codeLine}
            style={{ marginLeft: px(line.indent) }}
          >
            {line.tokens.map(([width, role], tokenIndex) => (
              <span
                key={tokenIndex}
                className={styles.token}
                data-role={role}
                style={{ width: px(width) }}
              />
            ))}
          </Piece>
        </div>
      ))}
      <Caret pitch={12} writes={writes} className={styles.codeCaret} />
    </div>
  );
}

function AiBuild() {
  return (
    <div className={styles.chat}>
      <Piece slot={0} from="lift" className={styles.prompt}>
        <span style={{ width: px(48) }} />
      </Piece>
      <span className={styles.thinking}>
        <span />
        <span />
        <span />
      </span>
      <Piece slot={3} from="lift" className={styles.answer}>
        <Line slot={3} width={92} />
        <Line slot={4} width={100} />
        <Line slot={5} width={70} />
      </Piece>
    </div>
  );
}

function ReferenceBuild() {
  return (
    <div className={styles.reference}>
      <Piece slot={0} from="drop" className={styles.ribbon} />
      <div className={styles.quote}>
        <Line slot={1} width={84} />
        <span className={styles.highlightRow}>
          <Line slot={2} width={92} />
          <Piece slot={5} className={styles.highlight} />
        </span>
        <Line slot={3} width={64} />
      </div>
      <Line slot={6} width={44} className={styles.source} />
    </div>
  );
}

function GenericBuild() {
  return (
    <div className={styles.note}>
      {[72, 88, 60, 80].map((width, index) => (
        <span key={index} className={styles.check}>
          <span className={styles.box}>
            <Piece slot={index * 2 + 1} from="pop" className={styles.tick} />
          </span>
          <Line slot={index * 2} width={width} />
        </span>
      ))}
    </div>
  );
}

/** Notebooks standing up on a shelf, a ribbon dropped into one. */
function LibraryBuild() {
  return (
    <div className={styles.library}>
      <div className={styles.shelf}>
        {[52, 64, 44, 58].map((height, index) => (
          <Piece
            key={index}
            slot={index}
            from="rise"
            tone={index}
            className={styles.book}
            style={{ height: px(height) }}
          >
            <span className={styles.bookLabel} />
          </Piece>
        ))}
        <Piece slot={5} from="drop" className={styles.bookRibbon} />
      </div>
      <Line slot={6} width={72} className={styles.shelfCaption} />
    </div>
  );
}

/** Rows arriving: each one's icon, then its name. */
function ListBuild() {
  return (
    <div className={styles.list}>
      {[78, 60, 86, 52].map((width, index) => (
        <span key={index} className={styles.listRow}>
          <Piece
            slot={index * 2}
            from="pop"
            tone={index}
            className={styles.listIcon}
          />
          <Line slot={index * 2 + 1} width={width} />
        </span>
      ))}
    </div>
  );
}

/** A conversation, one message after the other from both sides. */
function MessagesBuild() {
  return (
    <div className={styles.thread}>
      <Piece slot={0} from="lift" className={styles.bubbleIn}>
        <span style={{ width: px(52) }} />
      </Piece>
      <Piece slot={2} from="lift" className={styles.bubbleOut}>
        <span style={{ width: px(38) }} />
      </Piece>
      <Piece slot={4} from="lift" className={styles.bubbleIn}>
        <span style={{ width: px(64) }} />
        <span style={{ width: px(40) }} />
      </Piece>
      <Piece slot={6} from="lift" className={styles.bubbleOut}>
        <span style={{ width: px(30) }} />
      </Piece>
    </div>
  );
}

/** A month: today marked, then its events laid across the days. */
const CALENDAR_EVENTS: ReadonlyArray<
  readonly [row: number, column: number, span: number, tone: number]
> = [
  [0, 1, 2, 0],
  [1, 3, 3, 1],
  [2, 0, 2, 2],
  [2, 4, 2, 0],
  [3, 2, 3, 1],
];

function CalendarBuild() {
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHead}>
        <Line slot={0} width={46} className={styles.heading} />
        <span className={styles.calendarNav}>
          <span />
          <span />
        </span>
      </div>
      <div className={styles.calendarGrid}>
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} className={styles.calendarDay} />
        ))}
        <Piece slot={1} from="pop" className={styles.calendarToday} />
        {CALENDAR_EVENTS.map(([row, column, span, tone], index) => (
          <Piece
            key={index}
            slot={index + 2}
            tone={tone}
            className={styles.calendarEvent}
            style={
              {
                "--cal-row": row,
                "--cal-col": column,
                "--cal-span": span,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/** A graph: the centre, then each link drawn out to the node it reaches. */
const GRAPH_CENTER = { x: 63, y: 40 } as const;
const GRAPH_NODES: ReadonlyArray<{
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tone: number;
}> = [
  { x: 17, y: 15, size: 11, tone: 1 },
  { x: 107, y: 12, size: 9, tone: 2 },
  { x: 113, y: 63, size: 12, tone: 1 },
  { x: 21, y: 69, size: 9, tone: 2 },
  { x: 66, y: 80, size: 8, tone: 3 },
];

function GraphBuild() {
  return (
    <div className={styles.graph}>
      {GRAPH_NODES.map((node, index) => {
        const dx = node.x - GRAPH_CENTER.x;
        const dy = node.y - GRAPH_CENTER.y;
        return (
          <span
            key={`edge-${index}`}
            className={styles.graphEdge}
            style={{
              left: px(GRAPH_CENTER.x),
              top: px(GRAPH_CENTER.y),
              width: px(Math.round(Math.hypot(dx, dy))),
              transform: `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`,
            }}
          >
            <Piece slot={index + 1} className={styles.graphLink} />
          </span>
        );
      })}
      <Piece
        slot={0}
        from="pop"
        className={styles.graphCore}
        style={{ left: px(GRAPH_CENTER.x - 9), top: px(GRAPH_CENTER.y - 9) }}
      />
      {GRAPH_NODES.map((node, index) => (
        <Piece
          key={`node-${index}`}
          slot={index + 2}
          from="pop"
          tone={node.tone}
          className={styles.graphNode}
          style={{
            left: px(node.x - node.size / 2),
            top: px(node.y - node.size / 2),
            width: px(node.size),
            height: px(node.size),
          }}
        />
      ))}
    </div>
  );
}

/** Options: each one's name, then its switch turned on (one stays off). */
function SettingsBuild() {
  const rows: ReadonlyArray<readonly [width: number, on: boolean]> = [
    [64, true],
    [46, true],
    [72, false],
    [54, true],
  ];
  return (
    <div className={styles.settings}>
      {rows.map(([width, on], index) => (
        <span key={index} className={styles.settingRow}>
          <Line slot={index * 2} width={width} />
          <span className={styles.toggle}>
            {on ? (
              <Piece slot={index * 2 + 1} className={styles.toggleOn} />
            ) : null}
            <Piece
              slot={index * 2 + 1}
              from="pop"
              className={cn(styles.knob, on && styles.knobOn)}
            />
          </span>
        </span>
      ))}
    </div>
  );
}

/** A person, then the people with them. */
function PeopleBuild() {
  return (
    <div className={styles.people}>
      <div className={styles.person}>
        <Piece slot={0} from="pop" className={styles.avatar} />
        <span className={styles.personText}>
          <Line slot={1} width={58} className={styles.heading} />
          <Line slot={2} width={38} />
        </span>
      </div>
      <span className={styles.rule} />
      {[54, 68, 44].map((width, index) => (
        <span key={index} className={styles.member}>
          <Piece
            slot={index + 3}
            from="pop"
            tone={index + 1}
            className={styles.memberAvatar}
          />
          <Line slot={index + 4} width={width} />
        </span>
      ))}
    </div>
  );
}

/** Figures in their tiles, then the chart's bars rising. */
function DashboardBuild() {
  const bars = [0.4, 0.62, 0.5, 0.84, 0.66, 0.96];
  return (
    <div className={styles.dashboard}>
      <div className={styles.tiles}>
        {[0, 1, 2].map((index) => (
          <Piece
            key={index}
            slot={index}
            from="pop"
            tone={index}
            className={styles.tile}
          >
            <span className={styles.tileValue} />
            <span className={styles.tileLabel} />
          </Piece>
        ))}
      </div>
      <div className={styles.dashboardChart}>
        {bars.map((height, index) => (
          <Piece
            key={index}
            slot={Math.min(7, index + 3)}
            from="rise"
            className={styles.chartBar}
            style={{ height: `${height * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** A picture developing (sun, far hill, near hill), then its strip. */
function MediaBuild() {
  return (
    <div className={styles.media}>
      <div className={styles.frame}>
        <Piece slot={0} from="pop" className={styles.sun} />
        <Piece slot={1} from="rise" className={styles.hillFar} />
        <Piece slot={2} from="rise" className={styles.hillNear} />
      </div>
      <div className={styles.thumbs}>
        {[0, 1, 2, 3].map((index) => (
          <Piece
            key={index}
            slot={index + 4}
            from="pop"
            tone={index}
            className={styles.thumb}
          />
        ))}
      </div>
    </div>
  );
}

/** The workspace: its rail, then the page's heading, cards and lines. */
function AppBuild() {
  return (
    <div className={styles.app}>
      <Piece slot={0} from="rise" className={styles.appRail}>
        <span />
        <span />
        <span />
      </Piece>
      <div className={styles.appMain}>
        <Line slot={1} width={50} className={styles.heading} />
        <div className={styles.appCards}>
          {[0, 1, 2].map((index) => (
            <Piece
              key={index}
              slot={index + 2}
              from="pop"
              tone={index}
              className={styles.appCard}
            />
          ))}
        </div>
        <Line slot={5} width={98} />
        <Line slot={6} width={70} />
      </div>
    </div>
  );
}

function KindBuild({ kind }: { readonly kind: EditorLoadingKind }): ReactNode {
  switch (kind) {
    case "document":
      return <DocumentBuild />;
    case "spreadsheet":
      return <SpreadsheetBuild />;
    case "presentation":
      return <PresentationBuild />;
    case "pdf":
      return <PdfBuild />;
    case "code":
      return <CodeBuild />;
    case "ai":
      return null;
    case "reference":
      return <ReferenceBuild />;
    case "generic":
      return <GenericBuild />;
    case "library":
      return <LibraryBuild />;
    case "list":
      return <ListBuild />;
    case "messages":
      return <MessagesBuild />;
    case "calendar":
      return <CalendarBuild />;
    case "graph":
      return <GraphBuild />;
    case "settings":
      return <SettingsBuild />;
    case "people":
      return <PeopleBuild />;
    case "dashboard":
      return <DashboardBuild />;
    case "media":
      return <MediaBuild />;
    case "app":
      return <AppBuild />;
  }
}

/**
 * One card in the kind's colour, its page built in front of the reader:
 * pieces arrive one after another in a shared rhythm (lines written with a
 * caret, cells filled under a moving selection, a chart's bars rising, a
 * scan passing down a PDF, code typed in colour, a prompt answered), then
 * leave together and the build starts again. Motion is transform and
 * opacity only, so it keeps its pace while the editor's code loads; under
 * reduced motion the finished page stands still. Readiness, recovery text
 * and announcement ownership remain with the caller; there is no spinner
 * or simulated progress.
 */
export function EditorLoadingState({
  kind,
  label,
  detail,
  compact = false,
  minimal = false,
  className,
  testId,
  labelTestId,
  detailTestId,
  announce = true,
}: EditorLoadingStateProps) {
  const Icon = KIND_ICONS[kind];
  const rootRef = useRef<HTMLDivElement>(null);
  const [measuredDensity, setMeasuredDensity] = useState<EditorLoadingDensity>(
    minimal ? "minimal" : compact ? "compact" : "surface",
  );

  useEffect(() => {
    const element = rootRef.current;
    // A minimal state is minimal at any size: nothing to measure.
    if (minimal || !element || typeof ResizeObserver === "undefined") return;
    const update = (width: number, height: number) => {
      const next = editorLoadingDensityForSize(width, height);
      setMeasuredDensity((current) => (current === next ? current : next));
    };
    let frame: number | null = null;
    let pendingSize: readonly [number, number] | null = null;
    const scheduleUpdate = (width: number, height: number) => {
      pendingSize = [width, height];
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const size = pendingSize;
        pendingSize = null;
        if (size) update(size[0], size[1]);
      });
    };
    // The first size comes from the observer's own first report, after the
    // frame's layout: reading the box here forced a synchronous style and
    // layout of the whole page while it was mounting (a sheet opening over
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const borderBoxValue = entry.borderBoxSize as unknown as
        ResizeObserverSize | readonly ResizeObserverSize[];
      const borderBox = Array.isArray(borderBoxValue)
        ? borderBoxValue[0]
        : (borderBoxValue as ResizeObserverSize);
      if (borderBox) {
        scheduleUpdate(borderBox.inlineSize, borderBox.blockSize);
        return;
      }
      const rect = element.getBoundingClientRect();
      scheduleUpdate(rect.width, rect.height);
    });
    try {
      observer.observe(element, { box: "border-box" });
    } catch {
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [minimal]);

  const density: EditorLoadingDensity =
    minimal || measuredDensity === "minimal"
      ? "minimal"
      : compact || measuredDensity === "compact"
        ? "compact"
        : "surface";
  // Only a card standing for the page itself (its editor's kind, not a
  // chart's or a panel's, and not a one-line row) shows the file's preview.
  const preview = useLocalFilePreviewInScope();
  const showPreview = preview !== null && preview.kind === kind && density !== "minimal";

  return (
    <div
      ref={rootRef}
      role={announce ? "status" : undefined}
      aria-busy={announce ? true : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? true : undefined}
      data-editor-loading-kind={kind}
      data-editor-loading-density={density}
      data-editor-loading-motion="continuous"
      data-editor-loading-design="live-build"
      data-testid={testId ?? `editor-loading-${kind}`}
      className={cn(
        styles.root,
        density !== "surface" && styles.compact,
        density === "minimal" && styles.minimal,
        minimal && styles.row,
        className,
      )}
      style={showPreview ? { position: "relative" } : undefined}
    >
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.stage}>
          <span className={styles.halo} />
          <div className={styles.card} data-loading-page-kind={kind}>
            <div className={styles.cardHead}>
              <span className={styles.badge}>
                <Icon className={styles.badgeIcon} strokeWidth={2} />
              </span>
              <span className={styles.headTitle} />
              <span className={styles.headDots}>
                <span />
                <span />
                <span />
              </span>
            </div>
            <div className={styles.body}>
              <KindBuild kind={kind} />
            </div>
          </div>
        </div>
      </div>
      {label ? (
        <div className={styles.statusRow}>
          <span className={styles.label} data-testid={labelTestId}>
            {label}
          </span>
        </div>
      ) : null}
      {detail ? (
        <p className={styles.detail} data-testid={detailTestId}>
          {detail}
        </p>
      ) : null}
      {showPreview ? (
        <Suspense fallback={null}>
          <LocalFilePreviewLayer entry={preview} label={label} />
        </Suspense>
      ) : null}
    </div>
  );
}

export default EditorLoadingState;
