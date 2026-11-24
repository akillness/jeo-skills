"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useId, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { OfficeLineEndMarkers, officeLineEnd } from "./OfficeLineEndMarkers";
import {
  applyOfficeLineEnds,
  officeLineEndGalleryId,
  officeLineEndsEqual,
  OFFICE_LINE_END_GALLERY,
  OFFICE_LINE_END_SIZE_CHOICES,
  OFFICE_LINE_END_TYPES,
  type OfficeLineEndSize,
  type OfficeLineEndType,
  type OfficeLineEndsState,
} from "../../lib/office-line-ends";

import styles from "./OfficeLineEndsPicker.module.css";

/** One tile / one preview: a short line wearing the two decorations. */
function OfficeLineEndPreview({
  headEnd,
  tailEnd,
  headEndWidth,
  headEndLength,
  tailEndWidth,
  tailEndLength,
}: OfficeLineEndsState) {
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const markerId = `office-line-end-preview-${instanceId}`;
  const fields = {
    headEnd,
    tailEnd,
    headEndWidth,
    headEndLength,
    tailEndWidth,
    tailEndLength,
  };
  const head = officeLineEnd(fields, "head");
  const tail = officeLineEnd(fields, "tail");
  return (
    <svg
      viewBox="0 0 100 24"
      className={styles.preview}
      aria-hidden="true"
      focusable="false"
    >
      <OfficeLineEndMarkers
        id={markerId}
        head={head}
        tail={tail}
        stroke="currentColor"
      />
      <path
        d="M16 12 L84 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        markerStart={head ? `url(#${markerId}-head)` : undefined}
        markerEnd={tail ? `url(#${markerId}-tail)` : undefined}
      />
    </svg>
  );
}

export interface OfficeLineEndsPickerProps {
  /** The selection's ends, or null when the selection does not agree. */
  readonly value: OfficeLineEndsState | null;
  readonly disabled?: boolean;
  /** Why the control is off — shown to the user, so it has to be true. */
  readonly disabledReason?: string;
  readonly onChange: (next: OfficeLineEndsState) => void;
  /**
   * Where More Arrows… goes. A host that keeps its own dialog mount — a menu
   * cannot host a modal without the two fighting over focus — passes this and
   * renders {@link OfficeLineEndsDialog} itself.
   */
  readonly onMoreArrows?: () => void;
  readonly testIdPrefix: string;
}

const EMPTY: OfficeLineEndsState = { headEnd: "none", tailEnd: "none" };

/**
 * Office's Shape Outline ▸ Arrows: a gallery of begin/end combinations, then
 * More Arrows… for the four settings Format Shape ▸ Line offers.
 *
 * The panel owns no persistence. Each editor passes the selection's ends in
 * and stores what comes back, through its own writer.
 */
export function OfficeLineEndsPicker({
  value,
  disabled = false,
  disabledReason,
  onChange,
  onMoreArrows,
  testIdPrefix,
}: OfficeLineEndsPickerProps) {
  const t = useTranslations("console-notebooks");
  const [dialogOpen, setDialogOpen] = useState(false);
  const state = value ?? EMPTY;
  const selected = value ? officeLineEndGalleryId(value) : null;
  return (
    <div
      className={styles.panel}
      data-testid={`${testIdPrefix}-arrows`}
      role="group"
      aria-label={t("officeArrows.arrows")}
    >
      <div className={styles.heading}>{t("officeArrows.arrows")}</div>
      <div className={styles.gallery}>
        {OFFICE_LINE_END_GALLERY.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.tile}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            aria-pressed={selected === item.id}
            aria-label={
              item.headEnd === "none" && item.tailEnd === "none"
                ? t("officeArrows.noArrows")
                : t("officeArrows.tile", {
                    begin: t(`officeArrows.type.${item.headEnd}` as "officeArrows.type.none"),
                    end: t(`officeArrows.type.${item.tailEnd}` as "officeArrows.type.none"),
                  })
            }
            data-testid={`${testIdPrefix}-arrows-${item.id}`}
            onClick={() =>
              onChange(
                applyOfficeLineEnds(state, {
                  headEnd: item.headEnd,
                  tailEnd: item.tailEnd,
                }),
              )
            }
          >
            <OfficeLineEndPreview
              headEnd={item.headEnd}
              tailEnd={item.tailEnd}
              headEndWidth={state.headEndWidth}
              headEndLength={state.headEndLength}
              tailEndWidth={state.tailEndWidth}
              tailEndLength={state.tailEndLength}
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.more}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        data-testid={`${testIdPrefix}-arrows-more`}
        onClick={() => (onMoreArrows ? onMoreArrows() : setDialogOpen(true))}
      >
        {t("officeArrows.moreArrows")}
      </button>
      {disabled && disabledReason ? (
        <p
          className={styles.reason}
          data-testid={`${testIdPrefix}-arrows-reason`}
        >
          {disabledReason}
        </p>
      ) : null}
      <OfficeLineEndsDialog
        open={!onMoreArrows && dialogOpen && !disabled}
        value={state}
        onApply={(next) => {
          setDialogOpen(false);
          if (!officeLineEndsEqual(next, state)) onChange(next);
        }}
        onCancel={() => setDialogOpen(false)}
        testIdPrefix={testIdPrefix}
      />
    </div>
  );
}

/** More Arrows…: begin/end type and begin/end size, as Format Shape ▸ Line. */
export function OfficeLineEndsDialog({
  open,
  value,
  onApply,
  onCancel,
  testIdPrefix,
}: {
  readonly open: boolean;
  readonly value: OfficeLineEndsState;
  readonly onApply: (next: OfficeLineEndsState) => void;
  readonly onCancel: () => void;
  readonly testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<OfficeLineEndsState>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  // Its shell draws nothing until it first opens (OfficeDialogShell), and the
  // host renders it closed at each of its renders: neither are its 2 x 9
  // choices built until then.
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  if (!opened && !open) return null;
  const sizeValue = (side: "head" | "tail") => {
    const w = side === "head" ? draft.headEndWidth : draft.tailEndWidth;
    const len = side === "head" ? draft.headEndLength : draft.tailEndLength;
    return w && len ? `${w}-${len}` : "";
  };
  const sizeLabel = (w: OfficeLineEndSize, len: OfficeLineEndSize) =>
    t("officeArrows.sizeCell", {
      width: t(`officeArrows.width.${w}` as "officeArrows.width.sm"),
      length: t(`officeArrows.length.${len}` as "officeArrows.length.sm"),
    });
  return (
    <OfficeDialogShell
      open={open}
      title={t("officeArrows.dialogTitle")}
      description={t("officeArrows.dialogDescription")}
      defaultActionLabel={t("officeArrows.apply")}
      cancelActionLabel={t("officeArrows.cancel")}
      onDefaultAction={() => onApply(draft)}
      onCancel={onCancel}
      testIdPrefix={`${testIdPrefix}-arrows`}
    >
      <div className={styles.dialog}>
        <div className={styles.dialogPreview}>
          <OfficeLineEndPreview {...draft} />
        </div>
        {(
          [
            ["head", "begin"],
            ["tail", "end"],
          ] as const
        ).map(([side, label]) => {
          const type = side === "head" ? draft.headEnd : draft.tailEnd;
          return (
            <div key={side} className={styles.dialogRow}>
              <label className={styles.dialogField}>
                {t(`officeArrows.${label}Type` as "officeArrows.beginType")}
                <select
                  value={type}
                  data-testid={`${testIdPrefix}-arrows-${side}-type`}
                  onChange={(event) =>
                    setDraft((current) =>
                      applyOfficeLineEnds(current, {
                        [`${side}End`]: event.target
                          .value as OfficeLineEndType,
                      }),
                    )
                  }
                >
                  {OFFICE_LINE_END_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {t(`officeArrows.type.${item}` as "officeArrows.type.none")}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.dialogField}>
                {t(`officeArrows.${label}Size` as "officeArrows.beginSize")}
                <select
                  value={sizeValue(side)}
                  // An end with no decoration has nothing to size, and the save
                  // gate refuses a size written onto one.
                  disabled={type === "none"}
                  data-testid={`${testIdPrefix}-arrows-${side}-size`}
                  onChange={(event) => {
                    const [w, len] = event.target.value.split("-");
                    setDraft((current) =>
                      applyOfficeLineEnds(current, {
                        [`${side}EndSize`]:
                          w && len
                            ? {
                                w: w as OfficeLineEndSize,
                                len: len as OfficeLineEndSize,
                              }
                            : null,
                      }),
                    );
                  }}
                >
                  {/* The file may state no size at all — 161 of 6220 real
                      line-end elements do, written by Office itself — and
                      Office then draws medium. Keeping that choice is how an
                      untouched element stays untouched. */}
                  <option value="">{t("officeArrows.sizeDefault")}</option>
                  {OFFICE_LINE_END_SIZE_CHOICES.map((choice) => (
                    <option
                      key={`${choice.w}-${choice.len}`}
                      value={`${choice.w}-${choice.len}`}
                    >
                      {sizeLabel(choice.w, choice.len)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </OfficeDialogShell>
  );
}
