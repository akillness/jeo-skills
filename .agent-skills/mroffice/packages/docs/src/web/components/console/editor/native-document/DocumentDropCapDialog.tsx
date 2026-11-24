"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  formatPresentationMeasurement,
  parsePresentationMeasurement,
  type PresentationMeasurementUnit,
} from "@mrnote/core/web/lib/presentation-measurement.ts";
import { DocumentDialogIcon, type DocumentDialogIconSource } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import type { DropCapPosition } from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";

/**
 * Word's Drop Cap dialog (Insert > Drop Cap > Drop Cap Options…): Position
 * None / Dropped / In margin, then the Options Word keeps unavailable under
 * None -- the cap's Font (the first letter's own font; Word lists the
 * paragraph's), Lines to drop (1 to 10, default 3) and Distance from text
 * (0 by default), shown in the system length unit.
 */
export interface DocumentDropCapValue {
  readonly position: DropCapPosition | null;
  /** The cap letter's font family, or null to leave the letter's own. */
  readonly fontFamily: string | null;
  readonly lines: number;
  readonly distancePt: number;
}

export interface DocumentDropCapFontOption {
  readonly value: string;
  readonly label: string;
}

export interface DocumentDropCapDialogProps {
  readonly open: boolean;
  readonly canEdit?: boolean;
  readonly initial: DocumentDropCapValue;
  /** The letter's current font, shown first when it is not in the list. */
  readonly currentFontLabel: string;
  readonly fonts: readonly DocumentDropCapFontOption[];
  readonly unit: PresentationMeasurementUnit;
  readonly unitLabel: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (value: DocumentDropCapValue) => boolean;
  readonly onClose: () => void;
}

const EMU_PER_POINT = EMU_PER_PT;
/** Word's largest Distance from text: 22 inches. */
const MAX_DISTANCE_PT = 1584;
const POSITIONS: readonly (DropCapPosition | "none")[] = ["none", "dropped", "margin"];

// Each position wears the ribbon Drop Cap menu's own picture.
const DROP_CAP_ICON = {
  none: { insert: "dropCapNone" },
  dropped: { insert: "dropCap" },
  margin: { insert: "dropCapInMargin" },
} as const satisfies Record<DropCapPosition | "none", DocumentDialogIconSource>;
const CURRENT_FONT = "__current";

export function DocumentDropCapDialog({
  open,
  canEdit = true,
  initial,
  currentFontLabel,
  fonts,
  unit,
  unitLabel,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentDropCapDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.dropCapDialog.title"),
      description: t("toolbar.dropCapDialog.description"),
      position: t("toolbar.dropCapDialog.position"),
      positions: {
        none: t("toolbar.dropCapNone"),
        dropped: t("toolbar.dropCapDropped"),
        margin: t("toolbar.dropCapInMargin"),
      },
      options: t("toolbar.dropCapDialog.options"),
      font: t("toolbar.dropCapDialog.font"),
      lines: t("toolbar.dropCapDialog.lines"),
      distance: t("toolbar.dropCapDialog.distance"),
      ok: t("toolbar.dropCapDialog.ok"),
      cancel: t("toolbar.dropCapDialog.cancel"),
      invalidLines: t("toolbar.dropCapDialog.invalidLines"),
      invalidDistance: t("toolbar.dropCapDialog.invalidDistance"),
      rejected: t("toolbar.dropCapDialog.rejected"),
    }),
    [t],
  );
  const firstRef = useRef<HTMLInputElement | null>(null);
  const [position, setPosition] = useState<DropCapPosition | "none">(
    initial.position ?? "none",
  );
  const [font, setFont] = useState(initial.fontFamily ?? CURRENT_FONT);
  const [lines, setLines] = useState(String(initial.lines));
  const [distance, setDistance] = useState(
    formatPresentationMeasurement(initial.distancePt * EMU_PER_POINT, unit),
  );
  const [error, setError] = useState<string | null>(null);
  const optionsDisabled = !canEdit || position === "none";

  const submit = useCallback(() => {
    if (!canEdit) return;
    let value: DocumentDropCapValue = {
      position: null,
      fontFamily: null,
      lines: 3,
      distancePt: 0,
    };
    if (position !== "none") {
      const parsedLines = Number(lines.trim());
      if (!Number.isInteger(parsedLines) || parsedLines < 1 || parsedLines > 10) {
        setError(copy.invalidLines);
        return;
      }
      const emu = parsePresentationMeasurement(distance, unit);
      const points = emu === null ? null : Math.round((emu / EMU_PER_POINT) * 100) / 100;
      if (points === null || points > MAX_DISTANCE_PT) {
        setError(copy.invalidDistance);
        return;
      }
      value = {
        position,
        fontFamily: font === CURRENT_FONT ? null : font,
        lines: parsedLines,
        distancePt: points,
      };
    }
    if (!onSubmit(value)) {
      setError(copy.rejected);
      return;
    }
    onClose();
  }, [canEdit, copy, distance, font, lines, onClose, onSubmit, position, unit]);

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.ok}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={firstRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-drop-cap"
      defaultActionTestId="document-drop-cap-apply"
    >
      <fieldset className={parts.group} disabled={!canEdit}>
        <legend className={parts.sectionTitle}>{copy.position}</legend>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map((value, index) => (
            <label key={value} className={`${parts.choice} flex items-center gap-2`}>
              <input
                ref={index === 0 ? firstRef : undefined}
                type="radio"
                name="document-drop-cap-position"
                value={value}
                checked={position === value}
                data-testid={`document-drop-cap-position-${value}`}
                onChange={() => {
                  setPosition(value);
                  setError(null);
                }}
              />
              <DocumentDialogIcon icon={DROP_CAP_ICON[value]} />
              <span>{copy.positions[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={parts.group} disabled={optionsDisabled}>
        <legend className={parts.sectionTitle}>{copy.options}</legend>
        <label className={parts.field}>
          <span className={parts.label}>{copy.font}</span>
          <select
            value={font}
            data-testid="document-drop-cap-font"
            onChange={(event) => {
              setFont(event.target.value);
              setError(null);
            }}
          >
            <option value={CURRENT_FONT}>{currentFontLabel}</option>
            {fonts.map((option) => (
              <option key={option.value} value={option.value} style={{ fontFamily: option.value }}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={parts.field}>
            <span className={parts.label}>{copy.lines}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              value={lines}
              className={documentValueInputClassName("min-w-0")}
              data-testid="document-drop-cap-lines"
              aria-invalid={error === copy.invalidLines ? "true" : undefined}
              onChange={(event) => {
                setLines(event.target.value);
                setError(null);
              }}
            />
          </label>
          <label className={parts.field}>
            <span className={parts.label}>{copy.distance}</span>
            <span className={parts.measure}>
              <input
                type="text"
                inputMode="decimal"
                value={distance}
                className={documentValueInputClassName("min-w-0 flex-1")}
                data-testid="document-drop-cap-distance"
                aria-invalid={error === copy.invalidDistance ? "true" : undefined}
                onChange={(event) => {
                  setDistance(event.target.value);
                  setError(null);
                }}
              />
              <span className={parts.hint}>{unitLabel}</span>
            </span>
          </label>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className={parts.error} data-testid="document-drop-cap-error">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
