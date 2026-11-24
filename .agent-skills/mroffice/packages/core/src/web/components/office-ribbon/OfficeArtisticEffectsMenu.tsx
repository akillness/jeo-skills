"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  OFFICE_ARTISTIC_EFFECT_IDS,
  officeArtisticEffectCss,
  officeArtisticEffectDrawable,
  officeArtisticEffectLabelKey,
  type OfficeArtisticEffectId,
} from "../../lib/office-artistic-effects";

import { OFFICE_PICTURE_STYLE_SAMPLE_SRC } from "./OfficePictureStyleGallery";
import { officePreviewIgnoresPointer } from "./officeFormatPreview";

export interface OfficeArtisticEffectsMenuProps {
  /** The ribbon trigger (each host's own Picture Format button). */
  readonly trigger: ReactNode;
  readonly value: OfficeArtisticEffectId | null;
  readonly disabled?: boolean;
  /** Named reason on every tile when the picture cannot take an effect. */
  readonly disabledReason?: string;
  readonly onCommit: (id: OfficeArtisticEffectId) => void;
  readonly onPreviewChange?: (id: OfficeArtisticEffectId | null) => void;
  readonly testIdPrefix: string;
  /** "Artistic Effects Options..." at the foot (the host's Format pane); none by default. */
  readonly options?: { readonly label: string; readonly onSelect: () => void };
}

/**
 * Picture Format > Adjust > Artistic Effects, one gallery for Docs, the deck
 * and the worksheet: None plus Office's 22 effects in Office's order, each
 * tile drawn by the same filter the canvas uses. An effect MRAI cannot draw is
 * listed, disabled, with the reason, rather than left out.
 */
export function OfficeArtisticEffectsMenu({
  trigger,
  value,
  disabled = false,
  disabledReason,
  onCommit,
  onPreviewChange,
  testIdPrefix,
  options,
}: OfficeArtisticEffectsMenuProps) {
  const t = useTranslations("console-notebooks");
  const unavailable = t("office.artisticEffect.cannotDraw");
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => (open ? undefined : onPreviewChange?.(null))}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="docs-cupertino-menu"
        data-testid={`${testIdPrefix}-menu`}
        onPointerLeave={() => onPreviewChange?.(null)}
      >
        <div
          role="group"
          aria-label={t("office.artisticEffect.groupLabel")}
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 64px)", gap: 6, padding: 6 }}
        >
          {OFFICE_ARTISTIC_EFFECT_IDS.map((id) => {
            const drawable = officeArtisticEffectDrawable(id);
            const label = t(officeArtisticEffectLabelKey(id));
            const reason = disabled ? disabledReason : drawable ? undefined : unavailable;
            return (
              <DropdownMenuItem
                key={id}
                disabled={disabled || !drawable}
                aria-label={reason ? `${label}: ${reason}` : label}
                title={reason ? `${label}: ${reason}` : label}
                aria-current={(value ?? "none") === id ? "true" : undefined}
                data-testid={`${testIdPrefix}-${id}`}
                data-disabled-reason={reason}
                onPointerEnter={(event) =>
                  drawable && !disabled && !officePreviewIgnoresPointer(event)
                    ? onPreviewChange?.(id)
                    : undefined
                }
                onFocus={() => (drawable && !disabled ? onPreviewChange?.(id) : undefined)}
                onSelect={() => onCommit(id)}
                style={{
                  padding: 2,
                  outline: (value ?? "none") === id ? "2px solid #d97706" : undefined,
                  justifyContent: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={OFFICE_PICTURE_STYLE_SAMPLE_SRC}
                  alt=""
                  aria-hidden="true"
                  width={58}
                  height={41}
                  style={{ display: "block", filter: officeArtisticEffectCss(id) || undefined, opacity: drawable ? 1 : 0.45 }}
                />
              </DropdownMenuItem>
            );
          })}
        </div>
        {options ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={options.onSelect} data-testid={`${testIdPrefix}-options`}>
              {options.label}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
