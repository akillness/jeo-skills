"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Insert > Icons gallery every editor opens (PowerPoint's Insert Icons:
 * categories to jump between, a search box, several icons chosen and
 * inserted together). The catalog is `lib/office-icons/catalog`; the
 * drawings are loaded from `lib/office-icons/glyphs` only when the gallery
 * opens. The dialog only names what was chosen; the host inserts each one
 * (`onInsert`), as an SVG graphic its Fill recolours.
 */
import { EditorLoadingState } from "../ui/editor-loading-state";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeDialogParts } from "./officeDialogChrome";
import styles from "./OfficeIconGalleryDialog.module.css";
import {
  OFFICE_ICON_CATEGORIES,
  searchOfficeIcons,
  type OfficeIconCategory,
  type OfficeIconEntry,
} from "../../lib/office-icons/catalog";

export interface OfficeIconChoice {
  readonly id: string;
  readonly label: string;
  readonly Icon: LucideIcon;
}

export interface OfficeIconGalleryDialogProps {
  readonly open: boolean;
  readonly onInsert: (icons: readonly OfficeIconChoice[]) => void | Promise<void>;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly container?: HTMLElement | null;
  readonly testIdPrefix?: string;
}

/** PowerPoint inserts at most this many icons at once. */
export const OFFICE_ICON_GALLERY_MAX_SELECTION = 32;

let glyphsPromise: Promise<Readonly<Record<string, LucideIcon>>> | null = null;

function loadOfficeIconGlyphs(): Promise<Readonly<Record<string, LucideIcon>>> {
  glyphsPromise ??= import("../../lib/office-icons/glyphs")
    .then((module) => module.OFFICE_ICON_GLYPHS)
    .catch((error) => {
      glyphsPromise = null;
      throw error;
    });
  return glyphsPromise;
}

export function OfficeIconGalleryDialog({
  open,
  onInsert,
  onCancel,
  returnFocusRef,
  container,
  testIdPrefix = "office-icon-gallery",
}: OfficeIconGalleryDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const chinese = useLocale().toLowerCase().startsWith("zh");
  const [glyphs, setGlyphs] = useState<Readonly<Record<string, LucideIcon>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<OfficeIconCategory | "all">("all");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [inserting, setInserting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory("all");
    setSelected([]);
    setInserting(false);
    let cancelled = false;
    loadOfficeIconGlyphs().then(
      (loaded) => {
        if (!cancelled) {
          setGlyphs(loaded);
          setFailed(false);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Each icon's name in the reader's language (`iconGallery.icon.<id>`).
  const label = useCallback(
    (entry: OfficeIconEntry) => {
      const key = `iconGallery.icon.${entry.id}`;
      return t.has(key) ? t(key) : chinese ? entry.zh : entry.en;
    },
    [chinese, t],
  );
  const results = useMemo(
    () => searchOfficeIcons(query, category, label),
    [query, category, label],
  );

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= OFFICE_ICON_GALLERY_MAX_SELECTION
          ? current
          : [...current, id],
    );

  const insert = async () => {
    if (!glyphs || selected.length === 0 || inserting) return;
    const byId = new Map(searchOfficeIcons("").map((entry) => [entry.id, entry]));
    const choices = selected.flatMap((id) => {
      const entry = byId.get(id);
      const Icon = entry ? glyphs[entry.glyph] : undefined;
      return entry && Icon ? [{ id: entry.id, label: label(entry), Icon }] : [];
    });
    setInserting(true);
    try {
      await onInsert(choices);
    } finally {
      setInserting(false);
    }
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("iconGallery.title")}
      description={t("iconGallery.description")}
      defaultActionLabel={
        selected.length
          ? t("iconGallery.insertCount", { count: selected.length })
          : t("iconGallery.insert")
      }
      cancelActionLabel={t("toolbar.cancel")}
      defaultActionDisabled={!glyphs || selected.length === 0}
      onDefaultAction={() => void insert()}
      onCancel={onCancel}
      busy={inserting}
      busyActionLabel={t("iconGallery.inserting")}
      initialFocusRef={searchRef}
      returnFocusRef={returnFocusRef}
      container={container}
      testIdPrefix={testIdPrefix}
      defaultActionTestId={`${testIdPrefix}-insert`}
      className={styles.dialog}
    >
      <div className={styles.body}>
        <input
          ref={searchRef}
          type="search"
          className={officeDialogParts.field}
          value={query}
          placeholder={t("iconGallery.search")}
          aria-label={t("iconGallery.search")}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={`${testIdPrefix}-search`}
        />
        <div className={styles.columns}>
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("iconGallery.categories")}
            className={styles.categories}
          >
            {(["all", ...OFFICE_ICON_CATEGORIES] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={category === id}
                className={styles.category}
                onClick={() => setCategory(id)}
                data-testid={`${testIdPrefix}-category-${id}`}
              >
                {t(`iconGallery.category.${id}` as "iconGallery.category.all")}
              </button>
            ))}
          </div>
          <div className={styles.panel} role="tabpanel">
            {failed ? (
              <p className={officeDialogParts.error} role="alert">
                {t("iconGallery.loadFailed")}
              </p>
            ) : !glyphs ? (
              <EditorLoadingState
                kind="media"
                compact
                label={t("iconGallery.loading")}
              />
            ) : results.length === 0 ? (
              <p className={styles.note} role="status">
                {t("iconGallery.empty")}
              </p>
            ) : (
              <div
                className={styles.grid}
                role="group"
                aria-label={t("iconGallery.title")}
                data-testid={`${testIdPrefix}-grid`}
              >
                {results.map((entry) => {
                  const Icon = glyphs[entry.glyph];
                  if (!Icon) return null;
                  const chosen = selected.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={chosen}
                      title={label(entry)}
                      className={styles.item}
                      onClick={() => toggle(entry.id)}
                      data-icon-id={entry.id}
                      data-testid={`${testIdPrefix}-item-${entry.id}`}
                    >
                      <Icon size={28} strokeWidth={1.6} aria-hidden="true" />
                      <span className={styles.itemLabel}>{label(entry)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <p className={styles.status} role="status" data-testid={`${testIdPrefix}-selected`}>
          {t("iconGallery.selected", { count: selected.length })}
        </p>
      </div>
    </OfficeDialogShell>
  );
}

export default OfficeIconGalleryDialog;
