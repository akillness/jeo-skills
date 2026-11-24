"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  OFFICE_PICTURE_STYLE_CATALOG,
  officePictureStyle,
  officePictureStyleLabelKey,
  type OfficePictureStyleEntry,
  type OfficePictureStyleId,
} from "../../lib/office-picture-styles/catalog";

import { OfficePictureStyleGraphic } from "./OfficePictureStyleGraphic";
import { OfficeStyleGallery } from "./OfficeStyleGallery";

export interface OfficePictureStyleGalleryLabels {
  /** The gallery's accessible name ("Picture Styles"). */
  readonly ariaLabel: string;
  readonly more: string;
  /** Unused: each style is named from the catalogue (`office.pictureStyle.*`). */
  readonly style?: (entry: OfficePictureStyleEntry, index: number) => string;
}

export interface OfficePictureStyleGalleryProps {
  readonly application: "docs" | "spreadsheet" | "presentation";
  readonly value: OfficePictureStyleId | null;
  readonly labels: OfficePictureStyleGalleryLabels;
  readonly disabled?: boolean;
  /** Named reason shown on every thumbnail when the gallery is disabled. */
  readonly disabledReason?: string;
  readonly onPreviewChange: (id: OfficePictureStyleId | null) => void;
  readonly onCommit: (id: OfficePictureStyleId) => void;
  /** Whole thumbnails the ribbon strip shows; the rest scroll. */
  readonly visibleItemCount?: number;
  readonly className?: string;
  readonly testIdPrefix: string;
}

// Repository-authored landscape exemplar; Microsoft's gallery artwork is not copied.
export const OFFICE_PICTURE_STYLE_SAMPLE_SRC =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170"><rect width="240" height="170" fill="#8bc9ed"/><path d="M0 100 C30 52 49 60 69 79 C88 41 114 49 137 76 C177 55 208 67 240 94 V170 H0Z" fill="#fff"/><path d="M0 156 L65 112 Q86 96 112 119 Q143 142 169 118 Q202 87 240 105 V170 H0Z" fill="#9fdcb0" stroke="#409360" stroke-width="5"/></svg>',
  );

/** One thumbnail of one style, drawn by the renderer every editor's canvas uses. */
export function OfficePictureStyleThumbnail({
  styleId,
}: {
  readonly styleId: OfficePictureStyleId;
}) {
  return (
    <OfficePictureStyleGraphic
      styleId={styleId}
      src={OFFICE_PICTURE_STYLE_SAMPLE_SRC}
      widthPx={240}
      heightPx={170}
      decorative
      fillParent
      preview
      testId="office-picture-style-thumbnail"
      imageTestId="office-picture-style-thumbnail-image"
    />
  );
}

/**
 * Office's Picture Styles gallery, one component for Docs, Spreadsheet and
 * Presentation: the 28 built-in styles, an eight-thumbnail ribbon strip, and
 * the frameless seven-column popup (`menuTile="picture"`). Each editor keeps
 * its own authority, preview and commit behind `onPreviewChange`/`onCommit`.
 */
export function OfficePictureStyleGallery({
  application,
  value,
  labels,
  disabled = false,
  disabledReason,
  onPreviewChange,
  onCommit,
  visibleItemCount = 8,
  className,
  testIdPrefix,
}: OfficePictureStyleGalleryProps) {
  const t = useTranslations("console-notebooks");
  const ids = OFFICE_PICTURE_STYLE_CATALOG.map((entry) => entry.id);
  return (
    <OfficeStyleGallery<OfficePictureStyleId>
      application={application}
      className={className}
      ariaLabel={
        disabled && disabledReason
          ? `${labels.ariaLabel}: ${disabledReason}`
          : labels.ariaLabel
      }
      disabled={disabled}
      menuTile="picture"
      groups={[{ id: "styles", label: labels.ariaLabel, itemIds: ids }]}
      items={OFFICE_PICTURE_STYLE_CATALOG.map((entry) => ({
        id: entry.id,
        label: t(officePictureStyleLabelKey(entry.id)),
        disabledReason: disabled ? disabledReason : undefined,
      }))}
      labels={{ more: labels.more }}
      quickIds={ids.slice(0, 8)}
      visibleItemCount={visibleItemCount}
      value={officePictureStyle(value) ? value : null}
      renderPreview={(item): ReactNode => (
        <OfficePictureStyleThumbnail styleId={item.id} />
      )}
      onCommit={(id) => {
        if (!disabled && officePictureStyle(id)) onCommit(id);
      }}
      onPreviewChange={(id) =>
        onPreviewChange(id && officePictureStyle(id) ? id : null)
      }
      testIdPrefix={testIdPrefix}
    />
  );
}
