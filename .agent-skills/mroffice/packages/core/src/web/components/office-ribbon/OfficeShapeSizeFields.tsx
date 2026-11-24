"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { OfficeRibbonNumberField } from "./OfficeRibbonNumberField";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import styles from "./OfficeShapeSizeFields.module.css";
export function OfficeShapeSizeFields({
  values,
  labels,
  disabled,
  disabledReason,
  mixed,
  mixedLabel,
  onCommit,
  onRemember,
  testIdPrefix,
  min = 0.01,
  max = 500,
  heightFirst = false,
  unitLabel = "cm",
  step = 0.1,
}: {
  values: { width: string; height: string };
  labels: { width: string; height: string };
  disabled: boolean;
  /** Machine-readable reason for a greyed field (`data-disabled-reason`). */
  disabledReason?: string;
  /**
   * Per axis: the selection does not agree on this measurement. PowerPoint
   * applies a typed Height/Width to EVERY selected object ("select all objects
   * you want to have the same dimensions, and then enter the dimensions in the
   * Height and Width boxes"), so the box must be writable while it reads as
   * mixed rather than claiming one object's number for all of them.
   */
  mixed?: { width: boolean; height: boolean };
  mixedLabel?: string;
  onCommit: (axis: "width" | "height", value: string) => void;
  onRemember?: () => void;
  testIdPrefix: string;
  min?: number;
  max?: number;
  heightFirst?: boolean;
  /** Centimetres as the host's locale writes the unit ("厘米", "cm", "公分"). */
  unitLabel?: string;
  /** Arrow step in the field's unit (PowerPoint: 0.01" or 0.1 cm). */
  step?: number;
}) {
  return (
    <div className={styles.stack} onPointerDownCapture={onRemember}>
      {(heightFirst ? ["height", "width"] as const : ["width", "height"] as const).map((axis) => (
        <OfficeRibbonNumberField
          key={axis}
          icon={
            <OfficeSemanticIcon
              semanticId={axis === "width" ? "object.width" : "object.height"}
              size={18}
            />
          }
          visibleLabel={labels[axis]}
          classNames={{ label: styles.label }}
          label={`${labels[axis]} (${unitLabel})`}
          unit={unitLabel}
          value={values[axis]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          disabledReason={disabledReason}
          mixed={mixed?.[axis] ?? false}
          mixedLabel={mixedLabel}
          onRememberSelection={onRemember}
          onCommit={(value) => onCommit(axis, value)}
          testId={`${testIdPrefix}-${axis}`}
        />
      ))}
    </div>
  );
}
