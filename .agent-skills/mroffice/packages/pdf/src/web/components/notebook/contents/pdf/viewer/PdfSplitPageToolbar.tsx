"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useState } from "react";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  CheckSquare,
  LogOut,
  Settings,
  SquareMinus,
  SquarePlus,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { PdfPageSplitParity } from "../../../../../lib/pdf/page-split-mode";

import type {
  PdfSplitLineRequest,
  PdfSplitModeSettings,
  usePdfSplitPageMode,
} from "./hooks/usePdfSplitPageMode";
import styles from "./PdfSplitPage.module.css";

type SplitMode = ReturnType<typeof usePdfSplitPageMode>;
type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

const POPOVER_CHROME = officeDialogClassName({ tone: "pdf", size: "sm" });

/**
 * The floating toolbar of WPS 分割页面 mode, beside the page: 添加分割线 ·
 * 删除分割线 · 页面设置 · 立即分割 · 退出分割, the first and third with
 * their popovers.
 */
export function PdfSplitPageToolbar({
  mode,
  pageCount,
  currentPage,
  onSplit,
  t,
}: {
  readonly mode: SplitMode;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly onSplit: () => void;
  readonly t: Translate;
}) {
  if (!mode.active) return null;
  const busy = mode.busy;
  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("pdf.splitPage.toolbar")}
      data-testid="pdf-split-toolbar"
    >
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className={styles.toolButton}
          aria-expanded={mode.popover === "lines"}
          aria-haspopup="dialog"
          disabled={busy}
          data-testid="pdf-split-add-lines"
          onClick={() => mode.setPopover(mode.popover === "lines" ? null : "lines")}
        >
          <SquarePlus size={16} aria-hidden="true" />
          {t("pdf.splitPage.addLines")}
        </button>
        {mode.popover === "lines" ? (
          <PdfSplitAddLinesPopover
            mode={mode}
            currentPage={currentPage}
            t={t}
          />
        ) : null}
      </div>
      <button
        type="button"
        className={styles.toolButton}
        disabled={busy || !mode.selected}
        title={mode.selected ? undefined : t("pdf.splitPage.deleteLineHint")}
        data-testid="pdf-split-delete-line"
        onClick={() => mode.deleteSelected()}
      >
        <SquareMinus size={16} aria-hidden="true" />
        {t("pdf.splitPage.deleteLine")}
      </button>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className={styles.toolButton}
          aria-expanded={mode.popover === "settings"}
          aria-haspopup="dialog"
          disabled={busy}
          data-testid="pdf-split-page-settings"
          onClick={() => mode.setPopover(mode.popover === "settings" ? null : "settings")}
        >
          <Settings size={16} aria-hidden="true" />
          {t("pdf.splitPage.pageSettings")}
        </button>
        {mode.popover === "settings" ? (
          <PdfSplitSettingsPopover mode={mode} pageCount={pageCount} currentPage={currentPage} t={t} />
        ) : null}
      </div>
      <button
        type="button"
        className={styles.toolButton}
        disabled={busy}
        aria-busy={busy}
        data-testid="pdf-split-now"
        onClick={onSplit}
      >
        <CheckSquare size={16} aria-hidden="true" />
        {busy ? t("pdf.splitPage.splitting") : t("pdf.splitPage.splitNow")}
      </button>
      <button
        type="button"
        className={styles.toolButton}
        disabled={busy}
        data-testid="pdf-split-exit"
        onClick={() => mode.exit()}
      >
        <LogOut size={16} aria-hidden="true" />
        {t("pdf.splitPage.exit")}
      </button>
    </div>
  );
}

function PopoverHeader({
  title,
  titleId,
  onClose,
  t,
}: {
  readonly title: string;
  readonly titleId: string;
  readonly onClose: () => void;
  readonly t: Translate;
}) {
  return (
    <div className={officeDialogParts.header}>
      <h2 id={titleId} className={officeDialogParts.title}>
        {title}
      </h2>
      <button
        type="button"
        className={officeDialogParts.close}
        aria-label={t("common.close")}
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function LineDirectionFields({
  axis,
  value,
  onChange,
  sideCm,
  t,
}: {
  readonly axis: "rows" | "columns";
  readonly value: PdfSplitLineRequest;
  readonly onChange: (next: PdfSplitLineRequest) => void;
  readonly sideCm: number | null;
  readonly t: Translate;
}) {
  const name = useId();
  const horizontal = axis === "rows";
  return (
    <div className={officeDialogParts.group}>
      <label className={officeDialogParts.check}>
        <input
          type="checkbox"
          checked={value.enabled}
          data-testid={`pdf-split-${axis}-enabled`}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span>{horizontal ? t("pdf.splitPage.horizontalLines") : t("pdf.splitPage.verticalLines")}</span>
      </label>
      <div className={styles.optionRow}>
        <label className={officeDialogParts.check}>
          <input
            type="radio"
            name={name}
            checked={value.by === "count"}
            disabled={!value.enabled}
            onChange={() => onChange({ ...value, by: "count" })}
          />
          <span>{t("pdf.splitPage.set")}</span>
        </label>
        <input
          type="number"
          className={`${officeDialogParts.field} ${styles.numberField}`}
          min={1}
          max={7}
          step={1}
          value={value.count}
          disabled={!value.enabled || value.by !== "count"}
          aria-label={horizontal ? t("pdf.splitPage.horizontalCount") : t("pdf.splitPage.verticalCount")}
          data-testid={`pdf-split-${axis}-count`}
          onChange={(event) => {
            const count = Math.max(1, Math.min(7, Math.floor(Number(event.target.value) || 1)));
            onChange({ ...value, count });
          }}
        />
        <span className={styles.muted}>
          {horizontal ? t("pdf.splitPage.horizontalEven") : t("pdf.splitPage.verticalEven")}
        </span>
      </div>
      <div className={styles.optionRow}>
        <label className={officeDialogParts.check}>
          <input
            type="radio"
            name={name}
            checked={value.by === "spacing"}
            disabled={!value.enabled}
            onChange={() => onChange({ ...value, by: "spacing" })}
          />
          <span>{t("pdf.splitPage.spacing")}</span>
        </label>
        <input
          type="number"
          className={`${officeDialogParts.field} ${styles.numberField}`}
          min={0.5}
          step={0.1}
          value={value.spacingCm}
          disabled={!value.enabled || value.by !== "spacing"}
          aria-label={horizontal ? t("pdf.splitPage.horizontalSpacing") : t("pdf.splitPage.verticalSpacing")}
          data-testid={`pdf-split-${axis}-spacing`}
          onChange={(event) => {
            const spacing = Number(event.target.value);
            onChange({ ...value, spacingCm: Number.isFinite(spacing) && spacing > 0 ? spacing : value.spacingCm });
          }}
        />
        <span className={styles.muted}>
          {horizontal ? t("pdf.splitPage.horizontalEvery") : t("pdf.splitPage.verticalEvery")}
        </span>
      </div>
      {sideCm !== null ? (
        <p className={officeDialogParts.hint}>
          {horizontal
            ? t("pdf.splitPage.pageHeight", { size: sideCm.toFixed(1) })
            : t("pdf.splitPage.pageWidth", { size: sideCm.toFixed(1) })}
        </p>
      ) : null}
    </div>
  );
}

function PdfSplitAddLinesPopover({
  mode,
  currentPage,
  t,
}: {
  readonly mode: SplitMode;
  readonly currentPage: number;
  readonly t: Translate;
}) {
  const titleId = useId();
  const size = mode.pageSizeCm(currentPage);
  const [rows, setRows] = useState<PdfSplitLineRequest>(() => ({
    enabled: true,
    by: "count",
    count: 1,
    spacingCm: size?.height ?? 29.7,
  }));
  const [columns, setColumns] = useState<PdfSplitLineRequest>(() => ({
    enabled: true,
    by: "count",
    count: 1,
    spacingCm: size?.width ?? 21,
  }));
  return (
    <div
      className={`${POPOVER_CHROME} ${styles.popover}`}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="pdf-split-add-lines-popover"
    >
      <PopoverHeader
        title={t("pdf.splitPage.addLines")}
        titleId={titleId}
        onClose={() => mode.setPopover(null)}
        t={t}
      />
      <div className={officeDialogParts.body}>
        <LineDirectionFields axis="rows" value={rows} onChange={setRows} sideCm={size?.height ?? null} t={t} />
        <LineDirectionFields axis="columns" value={columns} onChange={setColumns} sideCm={size?.width ?? null} t={t} />
      </div>
      <div className={officeDialogParts.footer}>
        <button
          type="button"
          className={officeDialogParts.primaryButton}
          data-testid="pdf-split-add-lines-ok"
          onClick={() => mode.addLines({ rows, columns })}
        >
          {t("pdf.splitPage.ok")}
        </button>
      </div>
    </div>
  );
}

function PdfSplitSettingsPopover({
  mode,
  pageCount,
  currentPage,
  t,
}: {
  readonly mode: SplitMode;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly t: Translate;
}) {
  const titleId = useId();
  const rangeName = useId();
  const adjustName = useId();
  const originalName = useId();
  const [draft, setDraft] = useState<PdfSplitModeSettings>(mode.settings);
  const customText = draft.range.mode === "custom" ? draft.range.text : "";
  return (
    <div
      className={`${POPOVER_CHROME} ${styles.popover}`}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="pdf-split-settings-popover"
    >
      <PopoverHeader
        title={t("pdf.splitPage.pageSettings")}
        titleId={titleId}
        onClose={() => mode.setPopover(null)}
        t={t}
      />
      <div className={officeDialogParts.body}>
        <div className={officeDialogParts.group} role="radiogroup" aria-label={t("pdf.splitPage.pageRange")}>
          <p className={officeDialogParts.sectionTitle}>{t("pdf.splitPage.pageRange")}</p>
          <label className={officeDialogParts.check}>
            <input
              type="radio"
              name={rangeName}
              checked={draft.range.mode === "all"}
              data-testid="pdf-split-range-all"
              onChange={() => setDraft({ ...draft, range: { mode: "all" } })}
            />
            <span>{t("pdf.splitPage.allPages")}</span>
          </label>
          <div className={styles.optionRow} style={{ marginInlineStart: 0 }}>
            <label className={officeDialogParts.check}>
              <input
                type="radio"
                name={rangeName}
                checked={draft.range.mode === "custom"}
                data-testid="pdf-split-range-custom"
                // The page shown is the range to start from, as WPS fills it.
                onChange={() =>
                  setDraft({ ...draft, range: { mode: "custom", text: customText || String(currentPage) } })
                }
              />
              <span>{t("pdf.splitPage.customPages")}</span>
            </label>
            <input
              type="text"
              className={`${officeDialogParts.field} ${styles.rangeField}`}
              value={customText}
              placeholder="1"
              disabled={draft.range.mode !== "custom"}
              aria-label={t("pdf.splitPage.customPages")}
              data-testid="pdf-split-range-text"
              onChange={(event) =>
                setDraft({ ...draft, range: { mode: "custom", text: event.target.value } })
              }
            />
            <span className={styles.muted}>{t("pdf.splitPage.pageCount", { count: pageCount })}</span>
          </div>
          <p className={officeDialogParts.hint}>{t("pdf.splitPage.rangeExample")}</p>
        </div>
        <label className={officeDialogParts.row}>
          <span className={officeDialogParts.label}>{t("pdf.splitPage.applyTo")}</span>
          <select
            className={officeDialogParts.field}
            value={draft.parity}
            data-testid="pdf-split-parity"
            onChange={(event) =>
              setDraft({ ...draft, parity: event.target.value as PdfPageSplitParity })
            }
          >
            <option value="all">{t("pdf.splitPage.oddAndEven")}</option>
            <option value="odd">{t("pdf.splitPage.oddOnly")}</option>
            <option value="even">{t("pdf.splitPage.evenOnly")}</option>
          </select>
        </label>
        <div className={officeDialogParts.group} role="radiogroup" aria-label={t("pdf.splitPage.adjustScope")}>
          <p className={officeDialogParts.sectionTitle}>{t("pdf.splitPage.adjustScope")}</p>
          <div className={styles.optionRow} style={{ marginInlineStart: 0 }}>
            <label className={officeDialogParts.check}>
              <input
                type="radio"
                name={adjustName}
                checked={draft.adjust === "batch"}
                data-testid="pdf-split-adjust-batch"
                onChange={() => setDraft({ ...draft, adjust: "batch" })}
              />
              <span>{t("pdf.splitPage.adjustBatch")}</span>
            </label>
            <label className={officeDialogParts.check}>
              <input
                type="radio"
                name={adjustName}
                checked={draft.adjust === "current"}
                data-testid="pdf-split-adjust-current"
                onChange={() => setDraft({ ...draft, adjust: "current" })}
              />
              <span>{t("pdf.splitPage.adjustCurrent")}</span>
            </label>
          </div>
        </div>
        <div className={officeDialogParts.group} role="radiogroup" aria-label={t("pdf.splitPage.afterSplit")}>
          <p className={officeDialogParts.sectionTitle}>{t("pdf.splitPage.afterSplit")}</p>
          <div className={styles.optionRow} style={{ marginInlineStart: 0 }}>
            <label className={officeDialogParts.check}>
              <input
                type="radio"
                name={originalName}
                checked={!draft.keepOriginal}
                data-testid="pdf-split-delete-original"
                onChange={() => setDraft({ ...draft, keepOriginal: false })}
              />
              <span>{t("pdf.splitPage.deleteOriginal")}</span>
            </label>
            <label className={officeDialogParts.check}>
              <input
                type="radio"
                name={originalName}
                checked={draft.keepOriginal}
                data-testid="pdf-split-keep-original"
                onChange={() => setDraft({ ...draft, keepOriginal: true })}
              />
              <span>{t("pdf.splitPage.keepOriginal")}</span>
            </label>
          </div>
        </div>
      </div>
      <div className={officeDialogParts.footer}>
        <button
          type="button"
          className={officeDialogParts.primaryButton}
          data-testid="pdf-split-settings-ok"
          onClick={() => mode.applySettings(draft)}
        >
          {t("pdf.splitPage.ok")}
        </button>
      </div>
    </div>
  );
}
