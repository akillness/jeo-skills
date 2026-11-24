"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import { useTranslations } from "../../../../../host/next-intl";

import type { PresentationImageBlock } from "../../../console/editor/native-document/documentCommands";
import { OfficeStyleGallery } from "../../../office-ribbon/OfficeStyleGallery";
import type { OfficeThemeGridColors } from "../../../../lib/office-theme-color-grid";
import {
  OFFICE_GRAPHIC_STYLE_ROWS,
  officeGraphicStyles,
  officeGraphicStyleValue,
  type OfficeGraphicStyle,
} from "../../../../lib/presentation-office-graphic-paint";

/** A stand-in graphic for each style tile, as Office's gallery draws one. */
function GraphicStyleSample({ style }: { style: OfficeGraphicStyle }) {
  const outlined = style.outline.color !== "none";
  return (
    <svg viewBox="0 0 32 24" width="40" height="30" aria-hidden="true">
      <path
        d="M16 2.5 19.6 9.2 27 10.3 21.5 15.5 22.9 22.5 16 19.1 9.1 22.5 10.5 15.5 5 10.3 12.4 9.2Z"
        fill={style.fill.color}
        stroke={outlined ? style.outline.color : "none"}
        strokeWidth={outlined ? 1.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Graphics Format > Graphics Styles (PPT-A161): the shared Office style
 * gallery over the graphic's theme presets. The strip shows four tiles; the
 * More button opens all 28, row by row.
 */
export function PresentationGraphicStyleGallery({
  block,
  themeColors,
  disabled,
  className,
  onCommit,
}: {
  readonly block: PresentationImageBlock;
  readonly themeColors: OfficeThemeGridColors;
  readonly disabled: boolean;
  readonly className?: string;
  readonly onCommit: (style: OfficeGraphicStyle) => void;
}) {
  const t = useTranslations("console-notebooks");
  const styles = useMemo(() => officeGraphicStyles(themeColors), [themeColors]);
  const byId = useMemo(
    () => new Map(styles.map((style) => [style.id, style] as const)),
    [styles],
  );
  const label = (style: OfficeGraphicStyle) =>
    t("office.shapeStyle.name", {
      effect: t(`presentation.officeGraphic.styleRow.${style.row}` as "presentation.officeGraphic.styleRow.fill"),
      color: t(`office.shapeStyle.color.${style.column}` as "office.shapeStyle.color.0"),
    });
  return (
    <OfficeStyleGallery<string>
      application="presentation"
      className={className}
      ariaLabel={t("presentation.officeGraphic.stylesGallery")}
      disabled={disabled}
      menuTile="picture"
      groups={OFFICE_GRAPHIC_STYLE_ROWS.map((row) => ({
        id: row,
        label: t(`presentation.officeGraphic.styleRow.${row}` as "presentation.officeGraphic.styleRow.fill"),
        itemIds: styles.filter((style) => style.row === row).map((style) => style.id),
      }))}
      items={styles.map((style) => ({ id: style.id, label: label(style) }))}
      labels={{ more: t("toolbar.quickOverflow") }}
      quickIds={styles.slice(0, 7).map((style) => style.id)}
      visibleItemCount={4}
      value={officeGraphicStyleValue(block, styles)}
      renderPreview={(item) => {
        const style = byId.get(item.id);
        return style ? <GraphicStyleSample style={style} /> : null;
      }}
      onPreviewChange={() => undefined}
      onCommit={(id) => {
        const style = byId.get(id);
        if (!disabled && style) onCommit(style);
      }}
      testIdPrefix="presentation-ribbon-graphic-styles"
    />
  );
}
