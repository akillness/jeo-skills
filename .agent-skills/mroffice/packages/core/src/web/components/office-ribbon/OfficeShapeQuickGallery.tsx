"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";
import { OfficeShapePreview } from "./OfficeShapeCatalogPanel";
import { OfficeRibbonGallery } from "./OfficeRibbonGallery";
import {
  officeShapeDefinition,
  type OfficeShapePreset,
} from "../../lib/office-shape-catalog";
import styles from "./OfficeShapeQuickGallery.module.css";

// Frequent native presets; geometry and labels stay owned by the shared catalog.
const QUICK_SHAPES = [
  "line",
  "lineArrow",
  "rect",
  "ellipse",
  "roundRect",
  "triangle",
  "rtTriangle",
  "parallelogram",
  "diamond",
  "rightArrow",
  "downArrow",
  "leftRightArrow",
  "trapezoid",
  "heart",
  "cloud",
  "star5",
  "flowChartDocument",
  "wedgeRectCallout",
] as const satisfies readonly OfficeShapePreset[];

export function OfficeShapeQuickGallery({
  columns = 6,
  rows = 2,
  disabled,
  onSelect,
  onRememberSelection,
  more,
  testIdPrefix,
}: {
  columns?: 3 | 4 | 6;
  rows?: 2 | 3;
  disabled?: boolean;
  onSelect: (preset: OfficeShapePreset) => boolean | void;
  onRememberSelection?: () => void;
  more: ReactNode;
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const itemHeight = rows === 3 ? "20px" : "24px";
  return (
    <OfficeRibbonGallery
      className={styles.gallery}
      style={{ "--shape-quick-columns": columns, "--shape-quick-rows": rows, "--shape-quick-item-height": itemHeight } as CSSProperties}
      disclosurePlacement={rows === 3 ? "end" : "bottom"}
      ariaLabel={t("presentation.shapeGallery.label")}
      testId={`${testIdPrefix}-quick-gallery`}
      // The rows are the module's (`.gallery .items`), from the two custom
      // properties above.
      viewport={<div className={styles.items}>
        {QUICK_SHAPES.map((preset) => {
          const definition = officeShapeDefinition(preset);
          const label = t(
            `presentation.shape.${definition.previewKind}` as "presentation.shape.rectangle",
          );
          return (
            <button
              key={preset}
              type="button"
              aria-label={label}
              title={label}
              disabled={disabled}
              onPointerDown={onRememberSelection}
              onClick={() => {
                if (!disabled) onSelect(preset);
              }}
              data-testid={`${testIdPrefix}-quick-${preset}`}
            >
              {/* Office's Insert Shapes gallery draws each shape as an
                  outline in the ribbon's ink, not as a filled silhouette. */}
              <OfficeShapePreview
                kind={definition.previewKind}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>}
      more={more}
    />
  );
}
