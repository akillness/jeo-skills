"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's "Create New Building Block" dialog (Insert > Quick Parts > Save
 * Selection to Quick Part Gallery): Name (Word proposes the selection's
 * first words), Gallery, Category (General, the document's categories, or
 * Create New Category...), Description, Save in (this document — the only
 * place a building block can live here), and Options (Insert content only /
 * Insert content in its own paragraph / Insert content in its own page).
 */

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  QUICK_PART_BEHAVIORS,
  QUICK_PART_GALLERIES,
  type QuickPartBehavior,
  type QuickPartGallery,
} from "@mrnote/core/web/components/console/editor/native-document/documentQuickParts.ts";

export interface BuildingBlockDialogValue {
  name: string;
  gallery: QuickPartGallery;
  category: string;
  description: string;
  behavior: QuickPartBehavior;
}

export interface DocumentBuildingBlockDialogProps {
  readonly initial: BuildingBlockDialogValue;
  /** Categories already used in the document (besides General). */
  readonly categories: readonly string[];
  readonly canEdit: boolean;
  readonly onSave: (value: BuildingBlockDialogValue) => boolean;
  readonly onCancel: () => void;
}

const NEW_CATEGORY = "__new__";

export function DocumentBuildingBlockDialog({
  initial,
  categories,
  canEdit,
  onSave,
  onCancel,
}: DocumentBuildingBlockDialogProps) {
  const t = useTranslations("console-notebooks");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState<BuildingBlockDialogValue>(initial);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const categoryOptions = useMemo(
    () => ["General", ...categories.filter((entry) => entry !== "General")],
    [categories],
  );
  const category = newCategory !== null ? newCategory.trim() : value.category;
  const valid = canEdit && value.name.trim() !== "" && category !== "";
  return (
    <OfficeDialogShell
      open
      testIdPrefix="document-quick-parts-save"
      title={t("toolbar.buildingBlockTitle")}
      description={t("toolbar.buildingBlockDescription")}
      defaultActionLabel={t("toolbar.dialogOk")}
      defaultActionTestId="document-toolbar-quick-parts-save-apply"
      cancelActionLabel={t("toolbar.cancel")}
      cancelActionTestId="document-toolbar-quick-parts-save-cancel"
      defaultActionDisabled={!valid}
      onDefaultAction={() => {
        if (!valid) return;
        onSave({ ...value, name: value.name.trim(), category });
      }}
      onCancel={onCancel}
      initialFocusRef={nameRef}
      className="sm:max-w-[460px]"
    >
      <div className="note-editor-command-dialog__grid" data-testid="document-toolbar-quick-parts-save-form">
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockName")}
          <input
            ref={nameRef}
            type="text"
            maxLength={120}
            value={value.name}
            disabled={!canEdit}
            data-testid="document-toolbar-quick-parts-name-input"
            onChange={(event) => setValue({ ...value, name: event.target.value })}
          />
        </label>
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockGallery")}
          <select
            value={value.gallery}
            disabled={!canEdit}
            data-testid="document-quick-parts-gallery"
            onChange={(event) =>
              setValue({ ...value, gallery: event.target.value as QuickPartGallery })
            }
          >
            {QUICK_PART_GALLERIES.map((gallery) => (
              <option key={gallery} value={gallery}>
                {t(`toolbar.buildingBlockGallery_${gallery}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockCategory")}
          <select
            value={newCategory !== null ? NEW_CATEGORY : value.category}
            disabled={!canEdit}
            data-testid="document-quick-parts-category"
            onChange={(event) => {
              if (event.target.value === NEW_CATEGORY) {
                setNewCategory("");
                return;
              }
              setNewCategory(null);
              setValue({ ...value, category: event.target.value });
            }}
          >
            {categoryOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "General" ? t("toolbar.buildingBlockCategoryGeneral") : entry}
              </option>
            ))}
            <option value={NEW_CATEGORY}>{t("toolbar.buildingBlockNewCategory")}</option>
          </select>
        </label>
        {newCategory !== null ? (
          <label className={officeDialogParts.field}>
            {t("toolbar.buildingBlockNewCategoryName")}
            <input
              type="text"
              maxLength={120}
              value={newCategory}
              data-testid="document-quick-parts-new-category"
              onChange={(event) => setNewCategory(event.target.value)}
            />
          </label>
        ) : null}
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockDescriptionLabel")}
          <input
            type="text"
            maxLength={500}
            value={value.description}
            disabled={!canEdit}
            data-testid="document-quick-parts-description"
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
        </label>
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockSaveIn")}
          <select value="document" disabled data-testid="document-quick-parts-save-in">
            <option value="document">{t("toolbar.buildingBlockSaveInDocument")}</option>
          </select>
        </label>
        <label className={officeDialogParts.field}>
          {t("toolbar.buildingBlockOptions")}
          <select
            value={value.behavior}
            disabled={!canEdit}
            data-testid="document-quick-parts-options"
            onChange={(event) =>
              setValue({ ...value, behavior: event.target.value as QuickPartBehavior })
            }
          >
            {QUICK_PART_BEHAVIORS.map((behavior) => (
              <option key={behavior} value={behavior}>
                {t(`toolbar.buildingBlockBehavior_${behavior}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </OfficeDialogShell>
  );
}
