"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Sunrise, Sunset } from "lucide-react";

import { OfficeHomeCommandStack } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeRibbonNumberField } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonNumberField.tsx";
import {
  MAX_PRESENTATION_MEDIA_FADE_MS,
  type PersistedPresentationMediaPlaybackSettings,
} from "@mrnote/core/web/lib/presentation-embed.ts";

/**
 * Playback ▸ Editing ▸ Fade Duration: Fade In / Fade Out, in seconds.
 *
 * PowerPoint (both media kinds) shows two spin boxes under "Fade Duration"
 * beside Trim ("Trim a video, music clip, or sound clip", Microsoft Support;
 * the 16.86 Playback tab: "淡入: 00.00", "淡出: 00.00"). The values are
 * `p:cMediaNode`'s `p14:fade/@in|@out` in milliseconds, which the playback
 * model already reads, saves and writes (`fadeInMs` / `fadeOutMs`); this is
 * only the desktop control for them.
 *
 * A typed value is seconds with up to two decimals (PowerPoint's own
 * precision); anything that does not parse, or falls outside 0 ..
 * MAX_PRESENTATION_MEDIA_FADE_MS, is dropped rather than clamped so a typo
 * never silently becomes a different fade.
 */
export function presentationMediaFadeMsFromSeconds(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d*)?$|^\.\d+$/u.test(trimmed)) return null;
  const ms = Math.round(Number(trimmed) * 100) * 10;
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_PRESENTATION_MEDIA_FADE_MS) {
    return null;
  }
  return ms;
}

export function presentationMediaFadeSecondsLabel(ms: number): string {
  return (ms / 1000).toFixed(2);
}

export function PresentationMediaFadeFields({
  fadeInMs,
  fadeOutMs,
  disabled,
  labels,
  onCommit,
}: {
  fadeInMs: number;
  fadeOutMs: number;
  disabled: boolean;
  labels: { group: string; fadeIn: string; fadeOut: string };
  onCommit: (patch: PersistedPresentationMediaPlaybackSettings) => void;
}) {
  const fields = [
    { key: "fadeInMs" as const, value: fadeInMs, label: labels.fadeIn, icon: <Sunrise size={16} aria-hidden="true" /> },
    { key: "fadeOutMs" as const, value: fadeOutMs, label: labels.fadeOut, icon: <Sunset size={16} aria-hidden="true" /> },
  ];
  return (
    <div role="group" aria-label={labels.group} data-testid="presentation-ribbon-media-fade">
      <OfficeHomeCommandStack>
        {fields.map((field) => (
          <OfficeRibbonNumberField
            key={field.key}
            icon={field.icon}
            label={field.label}
            visibleLabel={field.label}
            testId={`presentation-ribbon-media-${field.key === "fadeInMs" ? "fade-in" : "fade-out"}`}
            value={presentationMediaFadeSecondsLabel(field.value)}
            min={0}
            max={MAX_PRESENTATION_MEDIA_FADE_MS / 1000}
            step={0.25}
            disabled={disabled}
            onCommit={(raw) => {
              const ms = presentationMediaFadeMsFromSeconds(raw);
              if (ms === null || ms === field.value) return;
              onCommit({ [field.key]: ms });
            }}
          />
        ))}
      </OfficeHomeCommandStack>
    </div>
  );
}
