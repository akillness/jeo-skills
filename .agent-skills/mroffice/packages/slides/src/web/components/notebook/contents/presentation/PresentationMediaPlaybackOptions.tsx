"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  OfficeHomeCheckbox,
  OfficeHomeCommandStack,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import type {
  PersistedPresentationMediaPlaybackSettings,
  PresentationMediaPlaybackSettings,
} from "@mrnote/core/web/lib/presentation-embed.ts";

/** The check boxes of Playback ▸ Audio Options / Video Options. */
export type PresentationMediaPlaybackOption =
  | "playFullScreen"
  | "playAcrossSlides"
  | "hideDuringShow"
  | "loop"
  | "rewindAfterPlaying";

/**
 * Desktop order of the check boxes beside Volume and Start (the 16.86
 * Playback tab and PPT-A157). Video: Play Full Screen, Hide While Not
 * Playing, Loop until Stopped, Rewind after Playing. Audio: Play Across
 * Slides, Loop until Stopped, Hide During Show, Rewind after Playing.
 * Each is one `p:cMediaNode` / `p:cTn` attribute the playback model already
 * reads, saves and writes (`@fullScrn`, `@numSld`, `@showWhenStopped="0"`,
 * `@repeatCount`, `@fill`), so the controls are only the desktop shape of
 * values that already round-trip.
 */
export function presentationMediaPlaybackOptions(
  kind: "video" | "audio",
): readonly PresentationMediaPlaybackOption[] {
  return kind === "video"
    ? ["playFullScreen", "hideDuringShow", "loop", "rewindAfterPlaying"]
    : ["playAcrossSlides", "loop", "hideDuringShow", "rewindAfterPlaying"];
}

const OPTION_TEST_IDS: Record<PresentationMediaPlaybackOption, string> = {
  playFullScreen: "presentation-ribbon-media-full-screen",
  playAcrossSlides: "presentation-ribbon-media-play-across-slides",
  hideDuringShow: "presentation-ribbon-media-hide-while-not-playing",
  loop: "presentation-ribbon-media-loop",
  rewindAfterPlaying: "presentation-ribbon-media-rewind",
};

const OPTION_CONTROL_IDS: Record<PresentationMediaPlaybackOption, string> = {
  playFullScreen: "PPTCTL.CONTEXT.MEDIA.PLAYBACK.FULL_SCREEN",
  playAcrossSlides: "PPTCTL.CONTEXT.MEDIA.PLAYBACK.PLAY_ACROSS_SLIDES",
  hideDuringShow: "PPTCTL.CONTEXT.MEDIA.PLAYBACK.HIDE_DURING_SHOW",
  loop: "PPTCTL.CONTEXT.MEDIA.PLAYBACK.LOOP",
  rewindAfterPlaying: "PPTCTL.CONTEXT.MEDIA.PLAYBACK.REWIND",
};

export function PresentationMediaPlaybackOptions({
  kind,
  settings,
  disabled,
  labels,
  describe,
  onPatch,
}: {
  kind: "video" | "audio";
  settings: PresentationMediaPlaybackSettings | null;
  disabled: boolean;
  labels: Record<PresentationMediaPlaybackOption, string>;
  /** Adds the reason a closed command cannot apply, as the ribbon does. */
  describe: (label: string) => string;
  onPatch: (patch: PersistedPresentationMediaPlaybackSettings) => void;
}) {
  const options = presentationMediaPlaybackOptions(kind);
  // Two columns of two, as the desktop lays them out.
  const columns = [options.slice(0, 2), options.slice(2)];
  return (
    <>
      {columns.map((column, index) => (
        <OfficeHomeCommandStack key={index}>
          {column.map((option) => (
            <OfficeHomeCheckbox
              key={option}
              checked={settings?.[option] === true}
              disabled={disabled}
              label={labels[option]}
              title={disabled ? describe(labels[option]) : undefined}
              controlId={OPTION_CONTROL_IDS[option]}
              testId={OPTION_TEST_IDS[option]}
              onCheckedChange={(checked) => onPatch({ [option]: checked })}
            />
          ))}
        </OfficeHomeCommandStack>
      ))}
    </>
  );
}
