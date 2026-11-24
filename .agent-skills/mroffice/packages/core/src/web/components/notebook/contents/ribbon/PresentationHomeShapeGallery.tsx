"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "../../../../../host/next-intl";

import {
  OfficeCustomToolPreview as PresentationCustomToolPreview,
  OfficeShapeCatalogView,
  type OfficeShapePreviewProps,
} from "../../../office-ribbon/OfficeShapeCatalogPanel";
import { DropdownMenuItem } from "../../../ui/dropdown-menu";
import type { ShapeKind, StrokeStyle } from "../../../../lib/presentation-shapes";
import {
  PRESENTATION_SHAPE_CATALOG,
  PRESENTATION_SHAPE_CATALOG_VERSION,
  PRESENTATION_SHAPE_CATEGORY_IDS,
  PRESENTATION_SHAPE_DEFAULT_KIND,
  PRESENTATION_SHAPE_DEFAULT_RECENTS,
  PRESENTATION_SHAPE_RECENT_STORAGE_KEY,
  parsePresentationShapeRecents,
  presentationShapeCatalogByCategory,
  presentationShapeCatalogEntry,
  presentationShapeMatchesSearch,
  pushPresentationShapeRecent,
  type PresentationShapeCatalogEntry,
  type PresentationShapeCatalogSelection,
  type PresentationShapeCategoryId,
} from "../../../../lib/presentation-shape-catalog";
import {
  PRESENTATION_CUSTOM_GEOMETRY_TOOLS,
  type PresentationCustomGeometryTool,
} from "../../../../lib/presentation-freeform";

import styles from "./PresentationHomeShapeGallery.module.css";
import { presentationCanChangeToShape } from "../../../../lib/presentation-shape-style-adapter";
import { PresentationPresetShapePreview } from "../presentation/PresentationPresetShapePreview";
export { PresentationOutlinePreview } from "./PresentationOutlinePreview";

export { PresentationPresetShapePreview as PresentationShapePreview };
export type { OfficeShapePreviewProps as PresentationShapePreviewProps };

export interface PresentationHomeShapeCategory {
  readonly id: PresentationShapeCategoryId;
  readonly kinds: readonly PresentationShapeCatalogSelection[];
}

/**
 * The bounded PowerPoint Home shape gallery, grouped in the same conceptual
 * families users scan in Office. Every entry is one of the existing authorable
 * ShapeKind values; this is presentation only, not a parallel shape model.
 */
export const PRESENTATION_HOME_SHAPE_CATEGORIES = Object.freeze(
  PRESENTATION_SHAPE_CATEGORY_IDS.map((id) =>
    Object.freeze({
      id,
      kinds: Object.freeze(
        presentationShapeCatalogByCategory(id).map((entry) => entry.selection),
      ),
    }),
  ),
) satisfies readonly PresentationHomeShapeCategory[];

/** Semantic previews for transient drawing tools; none impersonates prstGeom.
 * The one shared tile (`OfficeCustomToolPreview`), under the deck's old name. */
export { PresentationCustomToolPreview };
const PRESENTATION_CUSTOM_GEOMETRY_TOOL_SET: ReadonlySet<string> = new Set(
  PRESENTATION_CUSTOM_GEOMETRY_TOOLS,
);

function isPresentationCustomGeometryTool(
  selection: PresentationShapeCatalogSelection,
): selection is PresentationCustomGeometryTool {
  return PRESENTATION_CUSTOM_GEOMETRY_TOOL_SET.has(selection);
}

function presentationHomeShapeCatalogEntry(
  selection: PresentationShapeCatalogSelection,
): PresentationShapeCatalogEntry | null {
  if (!isPresentationCustomGeometryTool(selection)) {
    return presentationShapeCatalogEntry(selection);
  }
  return (
    PRESENTATION_SHAPE_CATALOG.find(
      (entry) =>
        entry.geometry === "custom-tool" && entry.selection === selection,
    ) ?? null
  );
}

export function PresentationHomeShapeGallery({
  disabled = false,
  labelFor,
  onSelect,
  mode = "insert",
  selectedKind,
}: {
  readonly disabled?: boolean;
  readonly labelFor: (selection: PresentationShapeCatalogSelection) => string;
  readonly onSelect: (
    selection: PresentationShapeCatalogSelection,
  ) => boolean | void;
  readonly mode?: "insert" | "change";
  readonly selectedKind?: ShapeKind | null;
}) {
  const t = useTranslations("console-notebooks");
  const isChange = mode === "change";
  const eligible = (selection: PresentationShapeCatalogSelection) =>
    !isChange ||
    (!isPresentationCustomGeometryTool(selection) &&
      presentationCanChangeToShape(selection));
  const categories = PRESENTATION_HOME_SHAPE_CATEGORIES.map((category) => ({
    id: category.id,
    label: t(`presentation.shapeGallery.category.${category.id}`),
    selections: category.kinds.filter(eligible),
  })).filter((category) => category.selections.length > 0);
  return (
    <OfficeShapeCatalogView
      ariaLabel={t(
        isChange
          ? "presentation.changeShape"
          : "presentation.shapeGallery.label",
      )}
      categories={categories}
      disabled={disabled}
      emptyLabel={t("presentation.shapeGallery.noResults")}
      labelFor={labelFor}
      matchesSearch={(selection, query, localizedLabel) => {
        const entry = presentationHomeShapeCatalogEntry(selection);
        return entry
          ? presentationShapeMatchesSearch(entry, query, localizedLabel)
          : false;
      }}
      onSelect={(selection) =>
        eligible(selection) ? onSelect(selection) : false
      }
      parseRecents={(value) =>
        // Never used yet: PowerPoint's own first row (PPT-A112).
        (value === null && !isChange
          ? parsePresentationShapeRecents([...PRESENTATION_SHAPE_DEFAULT_RECENTS])
          : parsePresentationShapeRecents(value)
        ).filter(eligible)
      }
      pushRecent={pushPresentationShapeRecent}
      recentLabel={t("presentation.shapeGallery.recent")}
      recentStorageKey={
        isChange
          ? `${PRESENTATION_SHAPE_RECENT_STORAGE_KEY}.change`
          : PRESENTATION_SHAPE_RECENT_STORAGE_KEY
      }
      recentsTestId={
        isChange
          ? "presentation-change-shape-recents"
          : "presentation-home-shape-recents"
      }
      selectedSelection={isChange ? selectedKind : undefined}
      renderPreview={(selection) => {
        const entry = presentationHomeShapeCatalogEntry(selection);
        if (!entry) return null;
        return entry.geometry === "custom-tool" ? (
          <PresentationCustomToolPreview tool={entry.tool} />
        ) : (
          <PresentationPresetShapePreview
            kind={entry.kind}
            fill="color-mix(in srgb, currentColor 12%, transparent)"
            stroke="currentColor"
            strokeWidth={1.95}
          />
        );
      }}
      rootDataAttributes={{
        "data-presentation-shape-catalog-version":
          PRESENTATION_SHAPE_CATALOG_VERSION,
        "data-presentation-shape-catalog-size": categories.reduce(
          (total, category) => total + category.selections.length,
          0,
        ),
        "data-presentation-shape-default": PRESENTATION_SHAPE_DEFAULT_KIND,
      }}
      rootTestId={
        isChange
          ? "presentation-change-shape-gallery"
          : "presentation-home-shape-gallery"
      }
      searchLabel={t("presentation.shapeGallery.search")}
      searchPlaceholder={t("presentation.shapeGallery.searchPlaceholder")}
      searchTestId={
        isChange
          ? "presentation-change-shape-search"
          : "presentation-home-shape-search"
      }
      tileDataAttributes={(selection) => {
        const entry = presentationHomeShapeCatalogEntry(selection);
        return {
          "data-presentation-shape-kind":
            entry && entry.geometry !== "custom-tool" ? entry.kind : undefined,
          "data-presentation-custom-geometry-tool":
            entry?.geometry === "custom-tool" ? entry.tool : undefined,
          "data-presentation-shape-preset":
            entry && entry.geometry !== "custom-tool"
              ? entry.drawingMlPreset
              : undefined,
        };
      }}
      tileTestId={(selection, location) =>
        isChange
          ? `presentation-ribbon-edit-shape-${location === "recent" ? "recent-" : ""}${selection}`
          : location === "recent"
            ? `presentation-ribbon-home-shape-recent-${selection}`
            : `presentation-ribbon-home-shape-${selection}`
      }
    />
  );
}

export function PresentationFillPreview({
  mode,
}: {
  readonly mode: "none" | "solid" | "gradient" | "picture" | "pattern";
}) {
  return (
    <svg viewBox="0 0 28 18" className={styles.menuPreview} aria-hidden="true">
      <defs>
        <linearGradient
          id={`presentation-home-fill-${mode}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0" stopColor="#f8ddd4" />
          <stop offset="1" stopColor="#c43e1c" />
        </linearGradient>
        <pattern
          id="presentation-home-fill-pattern"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 4L4 0" stroke="#8b8b8b" strokeWidth="1" />
        </pattern>
      </defs>
      <rect
        x="2"
        y="2"
        width="24"
        height="14"
        rx="2"
        fill={
          mode === "none"
            ? "#fff"
            : mode === "gradient"
              ? "url(#presentation-home-fill-gradient)"
              : mode === "pattern"
                ? "url(#presentation-home-fill-pattern)"
                : mode === "picture"
                  ? "#e8f2fb"
                  : "#c43e1c"
        }
        stroke="#59636e"
        strokeWidth="1"
      />
      {mode === "none" ? (
        <path d="M3 15L25 3" stroke="#c43e1c" strokeWidth="1.6" />
      ) : null}
      {mode === "picture" ? (
        <path d="M4 14L10 8L14 11L18 6L24 14Z" fill="#6792b5" stroke="none" />
      ) : null}
    </svg>
  );
}

/** Radix close autofocus is deliberately overridden so the exact rendered
 * trigger, not a DOM query or stale event target, regains focus. */
export function restorePresentationHomeMenuFocus(
  event: { preventDefault: () => void },
  trigger: HTMLButtonElement | null,
) {
  event.preventDefault();
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
}
