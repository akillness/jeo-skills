"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Suspense, lazy, memo, useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";

import { DropdownMenuItem } from "../ui/dropdown-menu";
import {
  OFFICE_SHAPE_CATEGORIES,
  OFFICE_SHAPE_PRESETS,
  officeShapeDefinition,
  officeShapeMatchesSearch,
  parseOfficeShapeRecents,
  pushOfficeShapeRecent,
  type OfficeShapeCategoryId,
  type OfficeShapePreset,
} from "../../lib/office-shape-catalog";
import {
  HOLLOW_PATH_KINDS,
  gradientVector,
  normalizePresentationConnectorSpec,
  shapeMultiParts,
  shapePathD,
  shapePolygonPoints,
  type PresentationConnectorEnd,
  type PresentationConnectorEndSize,
  type ShapeKind,
  type StrokeStyle,
} from "../../lib/presentation-shapes";
import {
  PRESENTATION_CUSTOM_GEOMETRY_TOOLS,
  presentationCustomPathToSvgPath,
  type PresentationCustomGeometryTool,
  type PresentationCustomPath,
} from "../../lib/presentation-freeform";
import {
  OfficeLineEndCarriers,
  OfficeLineEndMarkers,
  officeLineEnd,
} from "./OfficeLineEndMarkers";
import type { OfficeStrokeAlign } from "../../lib/office-shape-line-align";
import { officeGradientAngle, officeGradientDrawnStops } from "../../lib/office-shape-paint";
import type { OfficeStrokeCompound } from "../../lib/office-stroke-detail";

import styles from "./OfficeShapeCatalogPanel.module.css";

export { styles as officeShapeCatalogStyles };

/**
 * The gallery tile of a drawing TOOL (Lines > Curve, Freeform: Shape,
 * Freeform: Scribble): a gesture, not a geometry, so it draws a sample stroke
 * and never impersonates an `a:prstGeom`. Shared by the three editors.
 */
export function OfficeCustomToolPreview({
  tool,
}: {
  readonly tool: PresentationCustomGeometryTool;
}) {
  const d =
    tool === "curve"
      ? "M7 76 C25 14 52 91 93 25"
      : tool === "scribble"
        ? "M7 72 C18 22 32 84 43 34 C55 5 61 90 72 50 C82 25 86 65 94 23"
        : "M7 78 L28 23 L53 68 L76 18 L94 58";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-presentation-custom-tool-preview={tool}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.95"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A catalog selection naming a drawing tool rather than a preset. */
type OfficeShapeToolSelection = `tool.${PresentationCustomGeometryTool}`;
type OfficeShapePanelSelection = OfficeShapePreset | OfficeShapeToolSelection;

function officeShapeToolOf(selection: string): PresentationCustomGeometryTool | null {
  if (!selection.startsWith("tool.")) return null;
  const tool = selection.slice(5);
  return (PRESENTATION_CUSTOM_GEOMETRY_TOOLS as readonly string[]).includes(tool)
    ? (tool as PresentationCustomGeometryTool)
    : null;
}

export interface OfficeShapePreviewProps {
  readonly fillGradient?: import("../../lib/office-shape-paint").OfficeShapeGradient;
  /** Format Shape > Fill > Pattern fill: Office's preset, drawn as the shared tile. */
  readonly fillPattern?: import("../../lib/office-chart-shape-paint").OfficeChartFillPattern | null;
  /** Format Shape > Line > Gradient line: the line's stops along its angle. */
  readonly strokeGradient?: import("../../lib/office-shape-paint").OfficeShapeGradient | null;
  /**
   * A picture the shape is FILLED with — Excel's "Picture or texture fill", an
   * `a:blipFill` in the shape's own `a:spPr`. It paints the geometry, so it is
   * clipped to the outline the preset draws rather than laid over it as a
   * rectangle, and `a:stretch`/`a:fillRect` means it is STRETCHED to the box
   * rather than letterboxed (SHAPE-IMPORT-AUDIT.md §41).
   */
  readonly fillImage?: string;
  /** The picture fill's Format Shape options (tile, offsets, Transparency,
   * Rotate with shape), in the shared model; absent: stretched, opaque. */
  readonly fillImageOptions?: import("../../lib/office-picture-fill-options").OfficePictureFillOptions;
  /** The shape's clockwise rotation in degrees (a picture that does not turn
   * with it is drawn upright). */
  readonly fillImageRotation?: number;
  readonly kind: ShapeKind;
  /**
   * An explicit closed outline in the preview's own 0..100 box, as SVG polygon
   * points. Supplied by a caller whose shape carries its OWN geometry — a
   * SmartArt member the engine drew as a real path rather than as a preset —
   * and it wins over `kind`, which then only names the nearest preset for
   * anything that still has to fall back to one.
   */
  readonly points?: string;
  /**
   * The shape's OWN outline in the shared persisted envelope — an imported
   * `a:custGeom`. Like `points` it wins over `kind`; the shared converter
   * returns `d` already in this preview's 0..100 box.
   */
  readonly customPath?: PresentationCustomPath | null;
  /**
   * The shape's dragged adjust handles (`a:avLst`), substituted by name into
   * the preset program a host canvas evaluates; a gallery tile has none.
   */
  readonly adjustments?: Readonly<Record<string, number>> | null;
  /**
   * The shape's own `a:ln` decorations. `kind` names WHICH ends are decorated;
   * these name WHICH decoration (all six `a:ST_LineEndType` members) and its
   * optional `@w` / `@len`. A gallery tile passes none and keeps drawing the
   * ends its kind implies (docs/office-graphics/SHAPE-IMPORT-AUDIT.md §7.4).
   */
  readonly headEnd?: PresentationConnectorEnd;
  readonly tailEnd?: PresentationConnectorEnd;
  readonly headEndWidth?: PresentationConnectorEndSize;
  readonly headEndLength?: PresentationConnectorEndSize;
  readonly tailEndWidth?: PresentationConnectorEndSize;
  readonly tailEndLength?: PresentationConnectorEndSize;
  /**
   * A drawing at its real size (`boxWidthPx` / `boxHeightPx`): its ends are
   * multiples of its line's weight, as Office draws them (`a:ST_LineEndWidth`),
   * not the gallery tile's fixed box (a sheet's dimension arrows, lookwin
   * probe p13). A gallery tile leaves it off.
   */
  readonly lineEndsAtLineWeight?: boolean;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: StrokeStyle;
  /** The line's exact dash and cap (`officeOutlineDashPaint`), over the
   * family's sample pattern above. */
  readonly dashArray?: string;
  readonly dashCap?: "round" | "butt" | "square";
  /** `a:ln@cmpd` and the line's join, drawn by the preset preview. */
  readonly compound?: OfficeStrokeCompound;
  readonly join?: { readonly join: "round" | "bevel" | "miter"; readonly miterLimit?: number };
  /**
   * `a:ln@algn`, in the shared vocabulary (`@/lib/office-shape-line-align`).
   * An INSET pen keeps its whole stroke inside the geometry path, which is
   * what Office's `LineFormat.InsetPen` states; a gallery tile passes none and
   * keeps the centred ink every preview has always drawn.
   */
  readonly strokeAlign?: OfficeStrokeAlign | null;
  readonly shadow?: boolean;
  readonly className?: string;
  /**
   * The drawing's OWN box, in pixels. A host CANVAS passes it so the preset
   * program is evaluated at the shape's real aspect ratio, which is the only
   * way `ss = min(w, h)` quantities — corner radii, arrow-head widths, border
   * thickness — come out the size Word, Excel and PowerPoint draw them
   * (SHAPE-IMPORT-AUDIT.md §2.9). A gallery TILE omits it and keeps the square
   * sample every tile has always shown.
   */
  readonly boxWidthPx?: number;
  readonly boxHeightPx?: number;
}

/** One model-derived SVG preview shared by every Office shape catalog,
 * memoized: it depends on its props alone, inside ribbons that re-render
 * with every edit of their host. */
export const OfficeShapePreview = memo(function OfficeShapePreview({
  kind,
  fill = "#f6ddd5",
  stroke = "#a33417",
  strokeWidth = 4,
  strokeStyle = "solid",
  dashArray: exactDashArray,
  dashCap,
  compound: _compound,
  join: _join,
  shadow = false,
  fillGradient,
  points,
  customPath,
  className,
  ...lineEndFields
}: OfficeShapePreviewProps) {
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const normalizedFill = fillGradient ? `url(#${instanceId}-fill)` : fill === "none" ? "transparent" : fill;
  const normalizedStroke = stroke === "none" ? "transparent" : stroke;
  const dashArray =
    exactDashArray ??
    (strokeStyle === "dashed"
      ? "14 9"
      : strokeStyle === "dotted"
        ? "3 8"
        : undefined);
  const common = {
    fill: normalizedFill,
    stroke: normalizedStroke,
    strokeWidth,
    strokeDasharray: dashArray,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  // An exact dash brings its own cap (flat dashes, Round Dot's round dots).
  const linecap = exactDashArray && dashCap ? dashCap : "round";
  const polygon = shapePolygonPoints(kind);
  const path = shapePathD(kind);
  const parts = shapeMultiParts(kind);
  const connector = normalizePresentationConnectorSpec({ shape: kind });

  const customPathD = customPath
    ? presentationCustomPathToSvgPath(customPath)
    : null;
  let graphic: ReactNode;
  if (customPathD) {
    // An OPEN outline of the shape's own is a line — Excel's Curve, Freeform
    // and Scribble sit in the Lines group — so it wears the ends its file
    // states, exactly where Office draws them (SHAPE-IMPORT-AUDIT.md §7.10).
    // A CLOSED one has no ends and draws none, which is what Office does.
    const markerId = `office-shape-preview-arrow-${instanceId}`;
    const head = officeLineEnd(lineEndFields, "head");
    const tail = officeLineEnd(lineEndFields, "tail");
    graphic = (
      <>
        <OfficeLineEndMarkers
          id={markerId}
          head={head}
          tail={tail}
          stroke={normalizedStroke}
        />
        <path d={customPathD} strokeLinecap={linecap} {...common} />
        <OfficeLineEndCarriers
          id={markerId}
          paths={[{ d: customPathD, stroke: true }]}
          head={head}
          tail={tail}
          strokeWidth={strokeWidth}
        />
      </>
    );
  } else if (points) {
    graphic = <polygon points={points} {...common} />;
  } else if (connector) {
    const markerId = `presentation-shape-preview-arrow-${kind}-${instanceId}`;
    const connectorPath =
      connector.route === "elbow"
        ? "M5 78H50V22H95"
        : connector.route === "curved"
          ? "M5 78C25 15 75 85 95 22"
          : "M5 78L95 22";
    graphic = (
      <>
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0L10,5L0,10Z" fill={normalizedStroke} />
          </marker>
        </defs>
        <path
          d={connectorPath}
          {...common}
          fill="none"
          strokeLinecap={linecap}
          markerStart={
            connector.headEnd === "triangle" ? `url(#${markerId})` : undefined
          }
          markerEnd={
            connector.tailEnd === "triangle" ? `url(#${markerId})` : undefined
          }
          data-presentation-connector-route={connector.route}
          data-presentation-connector-head={connector.headEnd}
          data-presentation-connector-tail={connector.tailEnd}
        />
      </>
    );
  } else if (kind === "ellipse") {
    graphic = <ellipse cx="50" cy="50" rx="45" ry="40" {...common} />;
  } else if (kind === "rectangle" || kind === "rounded-rectangle") {
    graphic = (
      <rect
        x="5"
        y="9"
        width="90"
        height="82"
        rx={kind === "rounded-rectangle" ? 17 : 2}
        {...common}
      />
    );
  } else if (parts) {
    graphic = parts.map((part, index) => (
      <path
        key={`${kind}-${index}`}
        d={part.d}
        fill={
          part.role === "body"
            ? normalizedFill
            : part.role === "ink"
              ? normalizedStroke
              : "none"
        }
        stroke={part.role === "ink" ? "none" : normalizedStroke}
        strokeWidth={part.role === "ink" ? 0 : strokeWidth}
        strokeDasharray={part.role === "body" ? dashArray : undefined}
        strokeLinecap={linecap}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    ));
  } else if (path) {
    graphic = (
      <path
        d={path}
        fillRule={HOLLOW_PATH_KINDS.has(kind) ? "evenodd" : "nonzero"}
        {...common}
      />
    );
  } else if (polygon) {
    graphic = <polygon points={polygon} {...common} />;
  } else {
    graphic = <rect x="5" y="9" width="90" height="82" rx="2" {...common} />;
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      // The outline is centred on the path, so half the line weight lands
      // outside this 0..100 box. An outermost `<svg>` is `overflow: hidden` by
      // UA default, which cut it flat at every edge the outline touched; Office
      // clips a shape's own ink nowhere.
      overflow="visible"
      data-presentation-shape-preview={kind}
      data-office-shape-custom-outline={points || customPathD ? "yes" : undefined}
      style={
        shadow
          ? { filter: "drop-shadow(4px 4px 3px rgba(15,23,42,.28))" }
          : undefined
      }
    >
      {fillGradient?<defs><linearGradient id={`${instanceId}-fill`} {...gradientVector(officeGradientAngle(fillGradient))}>{officeGradientDrawnStops(fillGradient.stops).map(s=><stop key={s.position} offset={s.position} stopColor={s.color}/>)}</linearGradient></defs>:null}
      {graphic}
    </svg>
  );
});

type OfficeShapeCatalogDataAttributes = Readonly<
  Record<`data-${string}`, string | number | boolean | undefined>
>;

export interface OfficeShapeCatalogViewCategory<Selection extends string> {
  readonly id: string;
  readonly label: string;
  readonly selections: readonly Selection[];
}

export interface OfficeShapeCatalogViewProps<Selection extends string> {
  readonly ariaLabel: string;
  readonly categories: readonly OfficeShapeCatalogViewCategory<Selection>[];
  readonly disabled?: boolean;
  readonly emptyLabel: string;
  readonly labelFor: (selection: Selection) => string;
  readonly matchesSearch: (
    selection: Selection,
    query: string,
    localizedLabel: string,
  ) => boolean;
  readonly onSelect: (selection: Selection) => boolean | void;
  readonly parseRecents: (value: unknown) => Selection[];
  readonly pushRecent: (
    current: readonly Selection[],
    selection: Selection,
  ) => Selection[];
  readonly recentLabel: string;
  readonly recentStorageKey: string;
  readonly recentsTestId: string;
  readonly renderPreview: (selection: Selection) => ReactNode;
  readonly rootDataAttributes?: OfficeShapeCatalogDataAttributes;
  readonly rootTestId: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly searchTestId: string;
  readonly selectedSelection?: Selection | null;
  readonly tileDataAttributes?: (
    selection: Selection,
  ) => OfficeShapeCatalogDataAttributes;
  readonly tileTestId: (
    selection: Selection,
    location: "catalog" | "recent",
  ) => string;
}

/**
 * Shared catalog behaviour and DOM. Editors provide only their vocabulary and
 * command adapter; this view remains the sole owner of search, recents,
 * categories, keyboard movement and the viewport-scrolling panel.
 */
export function OfficeShapeCatalogView<Selection extends string>({
  ariaLabel,
  categories,
  disabled = false,
  emptyLabel,
  labelFor,
  matchesSearch,
  onSelect,
  parseRecents,
  pushRecent,
  recentLabel,
  recentStorageKey,
  recentsTestId,
  renderPreview,
  rootDataAttributes,
  rootTestId,
  searchLabel,
  searchPlaceholder,
  searchTestId,
  selectedSelection,
  tileDataAttributes,
  tileTestId,
}: OfficeShapeCatalogViewProps<Selection>) {
  const categoryIdBase = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const [query, setQuery] = useState("");
  const [recentSelections, setRecentSelections] = useState<Selection[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return parseRecents(window.localStorage.getItem(recentStorageKey));
    } catch {
      return [];
    }
  });
  const visibleCategories = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          selections: category.selections.filter((selection) =>
            matchesSearch(selection, query, labelFor(selection)),
          ),
        }))
        .filter((category) => category.selections.length > 0),
    [categories, labelFor, matchesSearch, query],
  );
  const visibleRecents = useMemo(
    () =>
      recentSelections.filter((selection) =>
        matchesSearch(selection, query, labelFor(selection)),
      ),
    [labelFor, matchesSearch, query, recentSelections],
  );

  const selectShape = (selection: Selection) => {
    if (onSelect(selection) === false) return;
    const next = pushRecent(recentSelections, selection);
    setRecentSelections(next);
    try {
      window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
    } catch {
      // Private/locked storage must not block the editor command.
    }
  };

  const renderTile = (selection: Selection, location: "catalog" | "recent") => {
    const label = labelFor(selection);
    return (
      <DropdownMenuItem
        key={`${location}-${selection}`}
        className={styles.tile}
        disabled={disabled}
        aria-current={selectedSelection === selection ? "true" : undefined}
        aria-label={label}
        title={label}
        data-selected={selectedSelection === selection || undefined}
        data-testid={tileTestId(selection, location)}
        {...tileDataAttributes?.(selection)}
        onSelect={() => selectShape(selection)}
      >
        <span className={styles.preview}>{renderPreview(selection)}</span>
        <span className={styles.label}>{label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <div
      className={styles.panel}
      aria-label={ariaLabel}
      data-testid={rootTestId}
      {...rootDataAttributes}
    >
      <label className={styles.search}>
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={query}
          maxLength={80}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          data-testid={searchTestId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget
                .closest<HTMLElement>(`[data-testid='${rootTestId}']`)
                ?.querySelector<HTMLElement>(
                  '[role="menuitem"]:not([data-disabled])',
                )
                ?.focus();
            } else if (event.key !== "Escape") {
              event.stopPropagation();
            }
          }}
        />
      </label>
      {visibleRecents.length > 0 ? (
        <section
          className={styles.section}
          aria-labelledby={`${categoryIdBase}-recent`}
          data-testid={recentsTestId}
        >
          <div id={`${categoryIdBase}-recent`} className={styles.sectionTitle}>
            {recentLabel}
          </div>
          <div className={styles.grid} role="group" aria-label={recentLabel}>
            {visibleRecents.map((selection) => renderTile(selection, "recent"))}
          </div>
        </section>
      ) : null}
      {visibleCategories.map((category) => (
        <section
          key={category.id}
          className={styles.section}
          aria-labelledby={`${categoryIdBase}-${category.id}`}
        >
          <div
            id={`${categoryIdBase}-${category.id}`}
            className={styles.sectionTitle}
          >
            {category.label}
          </div>
          <div className={styles.grid} role="group" aria-label={category.label}>
            {category.selections.map((selection) =>
              renderTile(selection, "catalog"),
            )}
          </div>
        </section>
      ))}
      {visibleRecents.length === 0 && visibleCategories.length === 0 ? (
        <p className={styles.noResults} role="status">
          {emptyLabel}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The deck's preset preview, loaded when a gallery first opens: every tile is
 * drawn from the shape's real preset geometry in one square box, so the
 * worksheet's, the document's and the deck's galleries show the same tiles.
 * It is a dynamic import because that module draws through this one (its
 * fallback is `OfficeShapePreview`), and because the preset programs are too
 * heavy for a ribbon that has not opened a gallery yet. Until it arrives the
 * schematic preview stands in.
 */
const LazyPresetShapePreview = lazy(() =>
  import("../notebook/contents/presentation/PresentationPresetShapePreview").then((module) => ({
    default: module.PresentationPresetShapePreview,
  })),
);

function OfficeShapeCatalogTilePreview(props: OfficeShapePreviewProps) {
  return (
    <Suspense fallback={<OfficeShapePreview {...props} />}>
      <LazyPresetShapePreview {...props} />
    </Suspense>
  );
}

export interface OfficeShapeCatalogPanelProps {
  application: "document" | "spreadsheet";
  disabled?: boolean;
  onSelect: (preset: OfficeShapePreset) => boolean | void;
  /**
   * Lines > Curve / Freeform: Shape / Freeform: Scribble (Word, Excel and
   * PowerPoint all list them). Given, the three tools close the Lines group
   * and a pick arms the host's drawing surface; absent (Change Shape), they
   * are not offered, as Office does not.
   */
  onSelectTool?: (tool: PresentationCustomGeometryTool) => void;
  recentStorageKey: string;
  selectedPreset?: OfficeShapePreset | null;
  /** Root/search/recents test-id prefix, ending in `insert-shape` etc. */
  testIdPrefix: string;
  tileIdentity?: (preset: OfficeShapePreset) => string;
  /** Optional historical tile order, e.g. Docs `shape-change`. */
  tileTestIdPrefix?: string;
  /** What draws a tile; the deck's preset preview unless a host says otherwise. */
  Preview?: (props: OfficeShapePreviewProps) => ReactNode;
  /**
   * Gallery groups a host does not offer. Crop to Shape lists no Lines in
   * Office (a line encloses nothing to show a picture through), so its
   * gallery leaves them out, and its recents with them.
   */
  excludeCategories?: readonly OfficeShapeCategoryId[];
  /** The gallery's accessible name; the shape gallery's own by default. */
  ariaLabel?: string;
}

export function OfficeShapeCatalogPanel({
  application,
  disabled = false,
  onSelect,
  onSelectTool,
  recentStorageKey,
  selectedPreset,
  testIdPrefix,
  tileIdentity = (preset) => preset,
  tileTestIdPrefix = testIdPrefix,
  Preview = OfficeShapeCatalogTilePreview,
  excludeCategories,
  ariaLabel,
}: OfficeShapeCatalogPanelProps) {
  const t = useTranslations("console-notebooks");
  const labelFor = useCallback(
    (selection: OfficeShapePanelSelection) => {
      const tool = officeShapeToolOf(selection);
      const key = `presentation.shape.${
        tool ?? officeShapeDefinition(selection as OfficeShapePreset).previewKind
      }` as "presentation.shape.rectangle";
      return t(key);
    },
    [t],
  );
  const excludedKey = excludeCategories?.join(" ") ?? "";
  const offered = useMemo(() => {
    const excluded = new Set(excludedKey ? excludedKey.split(" ") : []);
    const categories = OFFICE_SHAPE_CATEGORIES.filter(
      (category) => !excluded.has(category.id),
    );
    return {
      categories,
      presets: new Set<string>(categories.flatMap((category) => category.presets)),
    };
  }, [excludedKey]);
  const categories = useMemo(
    () =>
      offered.categories.map((category) => ({
        id: category.id,
        label: t(`presentation.shapeGallery.category.${category.id}`),
        selections:
          category.id === "lines" && onSelectTool
            ? [
                ...category.presets,
                ...PRESENTATION_CUSTOM_GEOMETRY_TOOLS.map(
                  (tool) => `tool.${tool}` as OfficeShapeToolSelection,
                ),
              ]
            : (category.presets as readonly OfficeShapePanelSelection[]),
      })),
    [offered, onSelectTool, t],
  );

  return (
    <OfficeShapeCatalogView<OfficeShapePanelSelection>
      ariaLabel={ariaLabel ?? t("presentation.shapeGallery.label")}
      categories={categories}
      disabled={disabled}
      emptyLabel={t("presentation.shapeGallery.noResults")}
      labelFor={labelFor}
      matchesSearch={(selection, query, label) => {
        const tool = officeShapeToolOf(selection);
        if (!tool) return officeShapeMatchesSearch(selection as OfficeShapePreset, query, label);
        const needle = query.trim().toLowerCase();
        return !needle || `${label} ${tool}`.toLowerCase().includes(needle);
      }}
      onSelect={(selection) => {
        const tool = officeShapeToolOf(selection);
        if (tool) {
          onSelectTool?.(tool);
          return false;
        }
        return onSelect(selection as OfficeShapePreset);
      }}
      parseRecents={(value) =>
        parseOfficeShapeRecents(value).filter((preset) =>
          offered.presets.has(preset),
        )
      }
      pushRecent={(current, selection) =>
        pushOfficeShapeRecent(
          current as readonly OfficeShapePreset[],
          selection as OfficeShapePreset,
        )
      }
      recentLabel={t("presentation.shapeGallery.recent")}
      recentStorageKey={recentStorageKey}
      recentsTestId={`${testIdPrefix}-recents`}
      renderPreview={(selection) => {
        const tool = officeShapeToolOf(selection);
        if (tool) return <OfficeCustomToolPreview tool={tool} />;
        const definition = officeShapeDefinition(selection as OfficeShapePreset);
        return (
          // The deck's gallery look in every editor: the outline in ink
          // over a light wash of it, so a shape reads as its contour (a
          // solid tile made the rounded and snipped rectangles look alike).
          <Preview
            kind={definition.previewKind}
            fill="color-mix(in srgb, currentColor 12%, transparent)"
            stroke="currentColor"
            strokeWidth={1.95}
          />
        );
      }}
      rootDataAttributes={{
        "data-office-shape-catalog-size": OFFICE_SHAPE_PRESETS.length,
        "data-document-shape-catalog-size":
          application === "document" ? OFFICE_SHAPE_PRESETS.length : undefined,
      }}
      rootTestId={`${testIdPrefix}-catalog`}
      searchLabel={t("presentation.shapeGallery.search")}
      searchPlaceholder={t("presentation.shapeGallery.searchPlaceholder")}
      searchTestId={`${testIdPrefix}-search`}
      selectedSelection={selectedPreset}
      tileDataAttributes={(selection) => {
        const tool = officeShapeToolOf(selection);
        if (tool) return { "data-office-shape-tool": tool };
        const definition = officeShapeDefinition(selection as OfficeShapePreset);
        return {
          "data-office-shape-kind": definition.previewKind,
          "data-office-shape-preset": definition.drawingPreset,
          "data-document-shape-kind":
            application === "document" ? definition.previewKind : undefined,
          "data-document-shape-preset":
            application === "document" ? definition.drawingPreset : undefined,
        };
      }}
      tileTestId={(selection, location) => {
        const tool = officeShapeToolOf(selection);
        const identity = tool ? `tool-${tool}` : tileIdentity(selection as OfficeShapePreset);
        return location === "recent"
          ? `${tileTestIdPrefix}-recent-${identity}`
          : `${tileTestIdPrefix}-${identity}`;
      }}
    />
  );
}
