"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  OfficeStyleGallery,
  type OfficeStyleGalleryGroup,
  type OfficeStyleGalleryItem,
} from "./OfficeStyleGallery";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  webTableStyleGallerySlots,
  type WebTableStyleGroup,
} from "../../lib/presentation-table-web-gallery";

import styles from "./OfficeTableStyleGallery.module.css";

/**
 * The Office table-style gallery every editor shows: PowerPoint's 74 built-in
 * styles in its own order — "Best Match for Document" (No Style and the
 * Themed Styles), then Light, Medium and Dark, seven colour columns each
 * (neutral, then accents 1-6) — followed by the document's own styles and
 * Clear. Each editor supplies only its thumbnails and what a choice does.
 */
export type OfficeTableStyleGalleryItemId =
  | `web:${number}`
  | `deck:${string}`
  | `current:${string}`
  | "clear";

export interface OfficeTableStyleGalleryDocumentItem {
  readonly id: `deck:${string}` | `current:${string}`;
  readonly label: string;
  /**
   * A built-in style's catalogue key (`office.tableStyle.*`): the item shows
   * the style's name in the UI's language, whatever language the file stores
   * it in (readings row 893 stores PowerPoint's English name).
   */
  readonly labelKey?: string;
  readonly preview: ReactNode;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export interface OfficeTableStyleGalleryLabels {
  readonly ariaLabel: string;
  readonly more: string;
  readonly clear: string;
  /** The group of the document's own styles. */
  readonly document: string;
}

export interface OfficeTableStyleGalleryProps {
  readonly application: "presentation" | "docs";
  readonly labels: OfficeTableStyleGalleryLabels;
  readonly renderSlotPreview: (slot: number) => ReactNode;
  readonly documentItems?: readonly OfficeTableStyleGalleryDocumentItem[];
  readonly value: OfficeTableStyleGalleryItemId | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly className?: string;
  readonly testIdPrefix: string;
  readonly onPreviewChange: (id: OfficeTableStyleGalleryItemId | null) => void;
  readonly onCommit: (id: OfficeTableStyleGalleryItemId) => void;
}

const GROUPS: readonly WebTableStyleGroup[] = ["best", "light", "medium", "dark"];
const QUICK_IDS: readonly OfficeTableStyleGalleryItemId[] = [
  "web:0",
  "web:1",
  "web:2",
  "web:3",
  "web:4",
  "web:5",
  "web:6",
];

export function officeTableStyleGallerySlot(
  id: OfficeTableStyleGalleryItemId | null,
): number | null {
  if (!id?.startsWith("web:")) return null;
  const slot = Number(id.slice(4));
  return Number.isInteger(slot) ? slot : null;
}

export function OfficeTableStyleGallery({
  application,
  labels,
  renderSlotPreview,
  documentItems = [],
  value,
  disabled = false,
  disabledReason,
  className,
  testIdPrefix,
  onPreviewChange,
  onCommit,
}: OfficeTableStyleGalleryProps) {
  const t = useTranslations("console-notebooks");
  const model = useMemo(() => {
    const titles = {
      best: t("office.tableStyleGallery.bestMatch"),
      light: t("office.tableStyleGallery.light"),
      medium: t("office.tableStyleGallery.medium"),
      dark: t("office.tableStyleGallery.dark"),
    };
    const slots = webTableStyleGallerySlots();
    const items: OfficeStyleGalleryItem<OfficeTableStyleGalleryItemId>[] = [];
    const groups: OfficeStyleGalleryGroup<OfficeTableStyleGalleryItemId>[] = [];
    for (const group of GROUPS) {
      const itemIds = slots
        .filter((entry) => entry.group === group)
        .map((entry) => {
          const id = `web:${entry.slot}` as const;
          items.push({ id, label: t(entry.labelKey), groupId: group });
          return id;
        });
      groups.push({
        id: group,
        label:
          group === "best"
            ? `${labels.ariaLabel}\n\n${titles[group]}`
            : titles[group],
        itemIds,
      });
    }
    const documentIds = documentItems.map((item) => {
      items.push({
        id: item.id,
        label: item.labelKey ? t(item.labelKey) : item.label,
        groupId: "deck",
        ...(item.disabled ? { disabled: true } : {}),
        ...(item.disabledReason ? { disabledReason: item.disabledReason } : {}),
      });
      return item.id;
    });
    if (documentIds.length) {
      groups.push({ id: "deck", label: labels.document, itemIds: documentIds });
    }
    items.push({ id: "clear", label: labels.clear, groupId: "clear" });
    groups.push({ id: "clear", label: "", itemIds: ["clear"], placement: "footer" });
    const documentPreviews = new Map(
      documentItems.map((item) => [item.id, item.preview] as const),
    );
    return { items, groups, documentPreviews };
  }, [documentItems, labels, t]);

  return (
    <OfficeStyleGallery
      application={application}
      ariaLabel={labels.ariaLabel}
      className={[styles.gallery, className].filter(Boolean).join(" ")}
      menuClassName={styles.menu}
      // Office's Table Styles sheet: seven 60 x 40 swatches a row under
      // their headings, Clear below the rule.
      menuGrid={{ columns: 7, thumbnail: [60, 40] }}
      disabled={disabled}
      groups={model.groups}
      items={model.items.map((item) => ({
        ...item,
        disabledReason:
          item.disabledReason ?? (disabled ? disabledReason : undefined),
      }))}
      labels={{ more: labels.more }}
      menuMode="preview-only"
      groupHeadings
      onCommit={onCommit}
      onPreviewChange={onPreviewChange}
      quickIds={QUICK_IDS}
      renderPreview={(item) => {
        if (item.id === "clear") {
          return (
            <span className={styles.clear}>
              <OfficeSemanticIcon semanticId="format.clear" size={18} />
              {labels.clear}
            </span>
          );
        }
        const slot = officeTableStyleGallerySlot(item.id);
        return slot !== null
          ? renderSlotPreview(slot)
          : (model.documentPreviews.get(
              item.id as OfficeTableStyleGalleryDocumentItem["id"],
            ) ?? null);
      }}
      testIdPrefix={testIdPrefix}
      value={value}
    />
  );
}

/** A 5 x 5 sample table, the thumbnail every host draws its recipe into. */
export function OfficeTableStylePreviewTable({
  tableStyle,
  cellStyle,
}: {
  readonly tableStyle?: CSSProperties;
  readonly cellStyle: (row: number, column: number) => CSSProperties;
}) {
  return (
    <table className={styles.preview} aria-hidden="true" style={tableStyle}>
      <tbody>
        {Array.from({ length: 5 }, (_, row) => (
          <tr key={row}>
            {Array.from({ length: 5 }, (_, column) => (
              <td key={column} style={cellStyle(row, column)}>
                —
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
