"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Text Effects for a document's words, as Word shows it from Text
 * Effects > 3-D Options… (Microsoft Support, "Format Text Effects - 3-D
 * Format pane"): the 3-D Format of the selected words -- top and bottom
 * bevels, Depth and Contour with their colours, Material, Lighting and its
 * Angle -- over the source's own Word 2010 statement (`w14:props3d` /
 * `w14:scene3d`), the shared section every host's pane shows
 * (`officeTextEffectsPaneSections`, `format`). Word offers no 3-D Rotation for
 * a document's words: its run camera states a preset alone.
 */

import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeShapeFormatPane } from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { officeTextEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";

import { textEffect3dEffects } from "@mrnote/core/web/components/console/editor/extensions/TextEffects.ts";

const DEFAULT_ACCENTS = {
  accent1: "#4472c4",
  accent2: "#ed7d31",
  accent3: "#a5a5a5",
  accent4: "#ffc000",
  accent5: "#5b9bd5",
  accent6: "#70ad47",
} as const;

export interface DocumentTextEffectsPaneProps {
  /** The selected words' `textEffects` mark attrs (null: none). */
  readonly textEffects: unknown;
  readonly canEdit: boolean;
  readonly onChange: (kind: "bevel" | "format3d", value: unknown) => void;
  readonly onClose: () => void;
}

export default function DocumentTextEffectsPane({
  textEffects,
  canEdit,
  onChange,
  onClose,
}: DocumentTextEffectsPaneProps) {
  const t = useTranslations("console-notebooks");
  const sections = officeTextEffectsPaneSections(
    {
      effects: textEffect3dEffects(textEffects),
      accentColors: DEFAULT_ACCENTS,
      labels: presentationEffectsPaneLabels(t),
      disabled: !canEdit,
      testIdPrefix: "document-text-effects",
      onChange: (kind, value) => {
        if (kind === "bevel" || kind === "format3d") onChange(kind, value);
      },
    },
    { threeD: "format" },
  ).filter((section) => section.id === "effects-bevel");
  return (
    <OfficeShapeFormatPane
      testIdPrefix="document-text-effects-pane"
      labels={{
        title: t("presentation.desktopMenu.formatTextEffects").replace(/[.…]+$/u, ""),
        close: t("common.close"),
        apply: t("presentation.ui.shapeFormatPane.apply"),
        cancel: t("common.cancel"),
      }}
      tabs={[{ id: "text-effects", label: t("presentation.textOptions.threeDFormat"), sections }]}
      writable={canEdit}
      onClose={onClose}
    />
  );
}
