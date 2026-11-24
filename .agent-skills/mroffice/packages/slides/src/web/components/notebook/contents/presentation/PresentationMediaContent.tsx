"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Media and picture drawing shared by the editor canvas and the slideshow: the
 * page/media contexts, background audio, trim/loop/end handling, the embed
 * (video, audio, iframe) player and the cropped image, and the imported
 * picture frame style.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { PresentationMetafileTextLayer, metafileTextRuns } from "./PresentationMetafileTextLayer";
import { metafileBlendLayer } from "../../../../lib/presentation/metafile-blend-layer";
import { getApiHttpBaseUrl } from "@mrnote/core/web/lib/env.ts";
import { smartArtPictureDisplaySrc, smartArtPictureOutputSrc } from "@mrnote/core/web/lib/office-smartart/model.ts";
import {
  normalizeOfficeArtisticEffect,
  officeArtisticEffectCss,
} from "@mrnote/core/web/lib/office-artistic-effects.ts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Film, Volume2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { PresentationOnlineVideo } from "./PresentationOnlineVideo";
import { PresentationPictureStyleGraphic } from "./PresentationPictureStyleGraphic";
import { presentationPictureOrientationCss } from "../../../../lib/presentation-picture-orientation";
import { PresentationPictureEffectsFrame } from "./PresentationPictureEffectsFrame";
import { PresentationClipShapeFrame, type ClipShapeStroke } from "./PresentationClipShapeFrame";
import { officePictureLineCompound, officePictureLineJoin, officePictureLineOutset } from "@mrnote/core/web/lib/office-picture-line.ts";
import { normalizePictureClipShape } from "../../../../lib/presentation-picture-crop-shape";
import { PresentationVideoPoster } from "./PresentationVideoPoster";
import { PresentationAudioIcon, PresentationVideoPlaceholder } from "./PresentationMediaStaticFace";
import { nativePictureStyle } from "@mrnote/core/web/lib/presentation-picture-style-native.ts";
import type { OfficeThemeGridColors } from "@mrnote/core/web/lib/office-theme-color-grid.ts";
import {
  videoBorderCss,
  videoBorderState,
  videoAdjustFilterSteps,
  videoPosterSource,
  videoStyleId,
} from "../../../../lib/presentation-video-format";
import { OfficeAdjustSvgFilter } from "@mrnote/core/web/components/office-ribbon/OfficeAdjustSvgFilter.tsx";
import {
  isOfficeRecolorPreset,
  officeAdjustFilterSteps,
  officeRecolorVariationDuotone,
  type OfficeAdjustFilterStep,
} from "@mrnote/core/web/lib/office-recolor-presets.ts";
import { officeClearColorStep, type OfficePictureFilterStep } from "@mrnote/core/web/lib/office-picture-adjust-filter.ts";
import { PresentationVideoStyleFrame } from "./PresentationVideoStyleFrame";
import { officeGraphicDisplayBlock, officeGraphicStretchedSrc } from "@mrnote/core/web/lib/presentation-office-graphic-paint.ts";
import { apiGet } from "@mrnote/core/web/lib/api.ts";
import { getSafeExternalUrl } from "@mrnote/core/web/lib/security.ts";
import {
  imageEffectsCss,
  effectivePresentationImageCornerRadius,
  resolveImageEffects,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import {
  MAX_PRESENTATION_MEDIA_TIME_MS,
  assetBackedPresentationMediaSource,
  assetBackedPresentationVideoSource,
  presentationOnlineVideo,
  resolveEmbed,
  resolvePresentationMediaPlaybackSettings,
  type PresentationMediaPlaybackSettings,
} from "@mrnote/core/web/lib/presentation-embed.ts";
import {
  nativePresentationAudioAuthority,
  nativePresentationVideoAuthority,
} from "@mrnote/core/web/lib/presentation-video-file.ts";
import {
  normalizePresentationMediaCaptionTracks,
  presentationMediaCaptionDataUrl,
} from "@mrnote/core/web/lib/presentation-media-captions.ts";
import { isImportedPptxBlock } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  cropToCss,
  isIdentityCrop,
  normalizeSignedCropRect,
  type CropRect,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import type {
  PresentationEmbedBlock,
  PresentationImageBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";

/** How many times a just-uploaded clip's playback ticket is asked for (about two minutes). */
const ASSET_VIDEO_TICKET_ATTEMPTS = 8;









const ASSET_VIDEO_TICKET_REUSE_MS = 60_000;
const assetVideoTickets = new Map<string, { url: string; at: number }>();

/** Forget every reused playback ticket (a test starts from none). */
export function clearAssetVideoTickets(): void {
  assetVideoTickets.clear();
}

function reusableAssetVideoTicket(custodyKey: string | null): string | null {
  if (!custodyKey) return null;
  const ticket = assetVideoTickets.get(custodyKey);
  if (!ticket) return null;
  if (Date.now() - ticket.at > ASSET_VIDEO_TICKET_REUSE_MS) {
    assetVideoTickets.delete(custodyKey);
    return null;
  }
  return ticket.url;
}

export function importedPptxPictureFrameStyle(
  block: PresentationImageBlock,
  positioned: boolean,
): CSSProperties | undefined {
  if (!positioned || !isImportedPptxBlock(block)) return undefined;
  return {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "fill",
  };
}

/**
 * Render a media / embed block's player. The SINGLE render path for iframe /
 * video / audio embeds, shared by the editor canvas and the read-only present
 * overlay so both surfaces enforce the SAME security policy:
 *
 *  - The URL is re-sanitized through {@link resolveEmbed} at the render edge.
 *    An unsafe / missing URL yields `url: null` and we render a non-interactive
 *    fallback placeholder rather than a broken or dangerous element — so even a
 *    deck that smuggled a `javascript:`/`data:` value past an older validator
 *    can never mount it.
 *  - The URL is set ONLY as the `src` attribute — never injected as innerHTML.
 *  - `iframe` embeds get the strict {@link EMBED_IFRAME_SANDBOX} sandbox (no
 *    top-navigation / popups / forms) + an origin-only `referrerPolicy`.
 *  - `video` / `audio` use the native `<video controls>` / `<audio controls>`
 *    elements (no third-party player, no extra deps).
 *
 * `interactive` is false in the editor canvas thumbnail so a click selects the
 * block instead of being captured by the player; present mode passes true.
 */
export const PresentationPageIdContext = createContext<string | null>(null);

export type PresentationMediaMetadataReporter = (
  blockId: string,
  durationMs: number | null,
) => void;

export const PresentationMediaMetadataContext =
  createContext<PresentationMediaMetadataReporter | null>(null);

export const PresentationShowMediaControlsContext = createContext(true);

const EMPTY_MANAGED_BACKGROUND_MEDIA_IDS: ReadonlySet<string> = new Set();

export const PresentationManagedBackgroundMediaContext = createContext<
  ReadonlySet<string>
>(EMPTY_MANAGED_BACKGROUND_MEDIA_IDS);

export interface PresentationBackgroundAudioSpec {
  readonly blockId: string;
  readonly sourceIndex: number;
  readonly src: string;
  readonly title: string;
  readonly playback: PresentationMediaPlaybackSettings;
  /** Where a clip carried on from its slide's own player goes on (seconds). */
  readonly startAtSec?: number;
}








export type PresentationCarryAudio = (
  spec: Omit<PresentationBackgroundAudioSpec, "sourceIndex">,
) => void;

export const PresentationCarryAudioContext =
  createContext<PresentationCarryAudio | null>(null);

function presentationMediaVolumeLevel(
  volume: PresentationMediaPlaybackSettings["volume"],
): number {
  return volume === "low" ? 0.25 : volume === "medium" ? 0.5 : 1;
}

function presentationMediaDurationMs(media: HTMLMediaElement): number | null {
  const durationMs = Math.round(media.duration * 1_000);
  return Number.isFinite(durationMs) &&
    durationMs > 0 &&
    durationMs <= MAX_PRESENTATION_MEDIA_TIME_MS
    ? durationMs
    : null;
}

function seekPresentationMediaToTrimStart(
  media: HTMLMediaElement,
  playback: PresentationMediaPlaybackSettings,
): void {
  const durationMs = presentationMediaDurationMs(media);
  if (durationMs === null) return;
  // Nothing trimmed off the start: no seek. A seek, even to 0, makes the
  // browser draw the clip's frame in place of its poster, so a Poster Frame
  
  // that starts later is sought as before; play rewinds to the start too.
  if (!(playback.trimStartMs > 0)) return;
  media.currentTime = Math.min(playback.trimStartMs, durationMs - 1) / 1_000;
}

function enforcePresentationMediaTrimEnd(
  media: HTMLMediaElement,
  playback: PresentationMediaPlaybackSettings,
): void {
  const trimEndMs = playback.trimEndMs;
  if (trimEndMs === null || media.currentTime * 1_000 < trimEndMs) return;
  if (playback.loop) {
    seekPresentationMediaToTrimStart(media, playback);
    void media.play().catch(() => undefined);
    return;
  }
  media.pause();
  if (playback.rewindAfterPlaying) {
    seekPresentationMediaToTrimStart(media, playback);
  }
}

/**
 * Play pressed on a clip that sits at (or past) its trim end, or before its
 * trim start: start again from the trim start. A one-shot clip without
 * "Rewind after playing" pauses on its end trim, and without this a second
 * Play ran on into the trimmed-off tail until `timeupdate` paused it again
 * (PPT-B012); after the natural end the browser restarts at 0, which is
 * before a start trim.
 */
function rewindPresentationMediaBeforePlay(
  media: HTMLMediaElement,
  playback: PresentationMediaPlaybackSettings,
): void {
  const atMs = media.currentTime * 1_000;
  if (
    (playback.trimEndMs !== null && atMs >= playback.trimEndMs) ||
    atMs < playback.trimStartMs
  ) {
    seekPresentationMediaToTrimStart(media, playback);
  }
}

/**
 * Whether the element may loop natively. The native `loop` attribute restarts
 * at 0, so it is only right when nothing is trimmed off the start; a loop with
 * a start trim is driven from `ended` instead (see
 * {@link handlePresentationMediaEnded}), so every round starts at the trim
 * start, including when the end trim is the natural end (`trimEndMs` null).
 */
function presentationMediaLoopsNatively(
  playback: PresentationMediaPlaybackSettings,
): boolean {
  return playback.loop && playback.trimStartMs <= 0;
}

/**
 * The natural end of the media was reached. A looping clip goes back to its
 * trim start and plays again; a one-shot clip rewinds to the trim start when
 * "Rewind after playing" is set, else it stays at the end.
 */
function handlePresentationMediaEnded(
  media: HTMLMediaElement,
  playback: PresentationMediaPlaybackSettings,
): void {
  if (playback.loop) {
    seekPresentationMediaToTrimStart(media, playback);
    void media.play().catch(() => undefined);
    return;
  }
  if (playback.rewindAfterPlaying) {
    seekPresentationMediaToTrimStart(media, playback);
  }
}

/**
 * The single persistent audio element for PowerPoint Web's Play in Background
 * preset. It is mounted outside the slide subtree, so advancing or replaying a
 * build never restarts the track. Exiting the slideshow unmounts it normally.
 */
export function PresentationBackgroundAudioPlayer({
  spec,
}: {
  spec: PresentationBackgroundAudioSpec;
}) {
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = spec.playback.volume === "mute";
    media.volume = presentationMediaVolumeLevel(spec.playback.volume);
  }, [spec.playback.volume, spec.src]);
  return (
    <audio
      ref={mediaRef}
      data-background-audio-block-id={spec.blockId}
      src={spec.src}
      autoPlay
      hidden
      loop={presentationMediaLoopsNatively(spec.playback)}
      muted={spec.playback.volume === "mute"}
      preload="auto"
      onLoadedMetadata={(event) => {
        if (spec.startAtSec !== undefined) {
          event.currentTarget.currentTime = spec.startAtSec;
        } else {
          seekPresentationMediaToTrimStart(event.currentTarget, spec.playback);
        }
      }}
      onTimeUpdate={(event) =>
        enforcePresentationMediaTrimEnd(event.currentTarget, spec.playback)
      }
      onPlay={(event) =>
        rewindPresentationMediaBeforePlay(event.currentTarget, spec.playback)
      }
      onEnded={(event) =>
        handlePresentationMediaEnded(event.currentTarget, spec.playback)
      }
      data-testid="presentation-present-background-audio"
      data-playback-loop={spec.playback.loop ? "true" : "false"}
      data-playback-trim-end={spec.playback.trimEndMs ?? undefined}
      data-presentation-block-id={spec.blockId}
      data-source-slide-index={spec.sourceIndex}
      data-playback-volume={spec.playback.volume}
      data-playback-across="true"
      aria-label={spec.title}
    />
  );
}

export function PresentationEmbedContent({
  themeColors,
  staticFace = false,
  ...props
}: Parameters<typeof PresentationEmbedDrawing>[0] & {
  themeColors?: OfficeThemeGridColors | null;
  /**
   * Draw the clip as its still face -- a video's poster frame (or a dark
   * frame with a play mark), an audio clip's speaker icon -- and mount no
   * player: a slide thumbnail must not fetch media once per tile.
   */
  staticFace?: boolean;
}) {
  // Video Format > Corrections and Color (PPT-A155): the movie -- playing or
  // as its poster -- drawn through PowerPoint's measured filter; its frame,
  // line and effects are not recoloured.
  const adjustId = `presentation-video-adjust-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const adjustSteps = videoAdjustFilterSteps(props.block, themeColors);
  const drawingOnly = adjustSteps.length ? (
    <span style={{ display: "block", width: "100%", height: "100%", filter: `url(#${adjustId})` }} data-testid="presentation-video-adjust">
      <OfficeAdjustSvgFilter id={adjustId} steps={adjustSteps} />
      {staticFace ? <PresentationEmbedStaticFace {...props} /> : <PresentationEmbedDrawing {...props} />}
    </span>
  ) : staticFace ? (
    <PresentationEmbedStaticFace {...props} />
  ) : (
    <PresentationEmbedDrawing {...props} />
  );
  // Video Format > Video Styles: the whole recipe frames the movie (its own
  // shape and border are the style's while one is applied).
  if (props.block.kind === "video" && videoStyleId(props.block)) {
    return (
      <PresentationVideoStyleFrame block={props.block} fillParent={props.fillParent}>
        {drawingOnly}
      </PresentationVideoStyleFrame>
    );
  }
  // Video Format > Video Shape and Video Border: the movie inside its
  // preset's outline, its line centred on its frame (PPT-A155) -- on a shaped
  
  // the rectangle the shape sits in.
  const videoShaped =
    props.block.kind === "video" &&
    normalizePictureClipShape((props.block as { clipShape?: unknown }).clipShape) !== null;
  const videoBorder = props.block.kind === "video" ? videoBorderState(props.block) : null;
  const border = videoShaped ? null : videoBorderCss(props.block);
  const shaped =
    props.block.kind === "video" ? (
      <PresentationClipShapeFrame
        clipShape={(props.block as { clipShape?: unknown }).clipShape}
        width={props.block.width}
        height={props.block.height}
        fillParent
        includeEllipse
        stroke={
          videoShaped && videoBorder?.visible
            ? { width: videoBorder.width, color: videoBorder.color, style: videoBorder.style }
            : null
        }
      >
        {drawingOnly}
      </PresentationClipShapeFrame>
    ) : (
      drawingOnly
    );
  const drawing = border ? (
    <span
      data-testid="presentation-video-border"
      style={{ position: "relative", display: "block", width: "100%", height: "100%", ...border }}
    >
      {shaped}
    </span>
  ) : (
    shaped
  );
  // Video Format > Video Effects frame the video as Picture Effects frame a
  // picture (PV #37).
  return props.block.kind === "video" && props.block.pictureEffects ? (
    <PresentationPictureEffectsFrame block={props.block} fillParent={props.fillParent}>
      {drawing}
    </PresentationPictureEffectsFrame>
  ) : (
    drawing
  );
}

/**
 * A linked video's first frame, drawn by a muted player that loads its
 * metadata only and never plays (the browser paints the first frame on its
 * own); the placeholder stands behind it until the frame is there and takes
 * over when the clip cannot be read. One such element per tile is one
 * metadata request the browser shares with the canvas's player.
 */
function PresentationVideoStill({
  url,
  title,
  style,
  placeholder,
}: {
  url: string;
  title: string;
  style: CSSProperties;
  placeholder: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === url) return <>{placeholder}</>;
  return (
    <span
      role="img"
      aria-label={title}
      data-testid="presentation-video-still"
      style={{ position: "relative", display: "block", overflow: "hidden", ...style }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        {placeholder}
      </span>
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden="true"
        onError={() => setFailed(url)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          pointerEvents: "none",
          display: "block",
        }}
      />
    </span>
  );
}

/**
 * A media object's still face, as PowerPoint draws it in a slide thumbnail:
 * a video's poster frame -- the one the user set, else an imported clip's own
 * -- or a dark frame with a play mark; an audio clip's speaker icon. Mounts
 * no player and fetches no media; an imported poster is the page's own
 * picture, as on the canvas.
 */
function PresentationEmbedStaticFace({
  block,
  fillParent,
  t,
}: Parameters<typeof PresentationEmbedDrawing>[0]) {
  const pageId = useContext(PresentationPageIdContext);
  const resolved = resolveEmbed({ kind: block.kind, url: block.url });
  const title =
    block.title?.trim() || t(`presentation.embed.kind.${resolved.kind}`);
  const frameStyle: CSSProperties = fillParent
    ? { width: "100%", height: "100%" }
    : { width: "100%", maxWidth: 560, aspectRatio: "16 / 9" };
  if (resolved.kind === "audio") {
    // A clip whose media the page cannot carry draws its own picture (the
    // speaker icon the file shows), as PowerPoint does (export look N15).
    const icon = videoPosterSource(block as PresentationEmbedBlock);
    if (icon) {
      return (
        <span
          className="presentation-window__audio-icon"
          data-testid="presentation-audio-poster"
          style={{ position: "relative", display: "block", ...frameStyle }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt={title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
        </span>
      );
    }
    return <PresentationAudioIcon label={title} style={frameStyle} />;
  }
  // An online video's thumbnail: its poster frame, else the dark frame with
  // a play mark -- never the provider's page fetched as a clip.
  if (presentationOnlineVideo(block)) {
    const onlinePoster = videoPosterSource(block);
    return onlinePoster ? (
      <span
        className="presentation-window__video-poster"
        data-testid="presentation-video-poster"
        data-poster-source="online"
        style={{ position: "relative", display: "block", ...frameStyle }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={onlinePoster}
          alt={title}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      </span>
    ) : (
      <PresentationVideoPlaceholder label={title} style={frameStyle} />
    );
  }
  if (resolved.kind === "video") {
    const placeholder = (
      <PresentationVideoPlaceholder label={title} style={frameStyle} />
    );
    const customPoster = videoPosterSource(block);
    if (customPoster) {
      return (
        <span
          className="presentation-window__video-poster"
          data-testid="presentation-video-poster"
          data-poster-source="custom"
          style={{ position: "relative", display: "block", ...frameStyle }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={customPoster}
            alt={title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
          />
        </span>
      );
    }
    const nativeVideo =
      !resolved.url || assetBackedPresentationVideoSource(block as Record<string, unknown>)
        ? nativePresentationVideoAuthority(block as unknown as Record<string, unknown>)
        : null;
    if (nativeVideo && pageId) {
      return (
        <PresentationVideoPoster
          pageId={pageId}
          blockId={block.id}
          fingerprint={nativeVideo.posterFingerprint}
          title={title}
          style={frameStyle}
          fallbackLabel={title}
          placeholder={placeholder}
          crop={(block as { posterCrop?: unknown }).posterCrop}
        />
      );
    }
    // A linked clip with no poster of its own: its first frame, as the
    // canvas shows it before it plays and as PowerPoint's thumbnail draws a
    
    // the slide showed the picture).
    if (resolved.url) {
      return <PresentationVideoStill url={resolved.url} title={title} style={frameStyle} placeholder={placeholder} />;
    }
    return placeholder;
  }
  return (
    <div
      className="presentation-window__embed-fallback"
      role="img"
      aria-label={title}
    >
      <Film size={20} aria-hidden="true" />
    </div>
  );
}

function PresentationEmbedDrawing({
  block,
  fillParent,
  interactive,
  t,
}: {
  block: PresentationEmbedBlock;
  fillParent: boolean;
  interactive: boolean;
  t: (key: string) => string;
}) {
  const pageId = useContext(PresentationPageIdContext);
  const reportMediaMetadata = useContext(PresentationMediaMetadataContext);
  const managedBackgroundMediaIds = useContext(
    PresentationManagedBackgroundMediaContext,
  );
  const showMediaControls = useContext(PresentationShowMediaControlsContext);
  const carryAudio = useContext(PresentationCarryAudioContext);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  // Hide While Not Playing (p:cMediaNode@showWhenStopped="0" on a video):
  // in the show the frame is visible only while the clip plays.
  const [videoPlaying, setVideoPlaying] = useState(false);
  const captionTrackElementRef = useRef<HTMLTrackElement | null>(null);
  /** How many captions the last effect run saw: 0 -> n is the first import. */
  const captionCountRef = useRef(0);
  const [activeAudioCaption, setActiveAudioCaption] = useState("");
  const captions =
    normalizePresentationMediaCaptionTracks(block.captions) ?? [];
  // A local video or an audio clip stored beside the deck: its DataItem
  // plays through a short-lived link the page's own route mints.
  const assetVideo = assetBackedPresentationMediaSource(
    block as Record<string, unknown>,
  );
  const assetVideoCustodyKey = assetVideo && pageId
    ? `${pageId}\u0000${assetVideo.assetId}\u0000${assetVideo.mimeType}\u0000${assetVideo.sizeBytes}`
    : null;
  const [assetVideoTicket, setAssetVideoTicket] = useState<{
    custodyKey: string;
    url: string;
  } | null>(() => {
    const url = reusableAssetVideoTicket(assetVideoCustodyKey);
    return url && assetVideoCustodyKey ? { custodyKey: assetVideoCustodyKey, url } : null;
  });
  // The custody key whose ticket requests all came back empty: only then is
  // the clip unplayable. Until then it is loading, and says nothing of the
  
  const [assetVideoGaveUp, setAssetVideoGaveUp] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!assetVideo || !pageId) {
      queueMicrotask(() => {
        if (!cancelled) setAssetVideoTicket(null);
      });
      return () => {
        cancelled = true;
      };
    }
    const expected = assetVideo;
    const custodyKey = `${pageId}\u0000${expected.assetId}\u0000${expected.mimeType}\u0000${expected.sizeBytes}`;
    const reusable = reusableAssetVideoTicket(custodyKey);
    if (reusable) {
      queueMicrotask(() => {
        if (!cancelled) setAssetVideoTicket({ custodyKey, url: reusable });
      });
      return () => {
        cancelled = true;
      };
    }
    // A clip just uploaded answers its first ticket request only once the
    // page's save has put the asset in custody; the one request made on
    // mount came back empty and the editor kept the "unsupported media"
    // placeholder until the page was reopened (PPT-B432). The request is
    // repeated with a growing pause until the asset answers.
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const scheduleRetry = () => {
      if (cancelled) return;
      if (attempt >= ASSET_VIDEO_TICKET_ATTEMPTS) {
        setAssetVideoGaveUp(custodyKey);
        return;
      }
      const delay = Math.min(15_000, 1_000 * 2 ** attempt);
      attempt += 1;
      retry = setTimeout(load, delay);
    };
    const load = () => void apiGet<{
      asset_id?: unknown;
      playback_url?: unknown;
      mime_type?: unknown;
      size_bytes?: unknown;
    }>(
      `/api/v1/pages/${encodeURIComponent(pageId)}/presentation-${expected.kind}/${encodeURIComponent(expected.assetId)}/playback`,
    )
      .then((item) => {
        if (cancelled) return;
        const rawPreviewUrl =
          item.asset_id === expected.assetId &&
          item.mime_type === expected.mimeType &&
          item.size_bytes === expected.sizeBytes &&
          typeof item.playback_url === "string"
            ? item.playback_url
            : null;
        const safeUrl =
          rawPreviewUrl && /^https?:\/\//i.test(rawPreviewUrl)
            ? getSafeExternalUrl(rawPreviewUrl)
            : null;
        const url =
          safeUrl && /^(?:https?):/i.test(safeUrl) ? safeUrl : null;
        if (url) assetVideoTickets.set(custodyKey, { url, at: Date.now() });
        setAssetVideoTicket(url ? { custodyKey, url } : null);
        if (!url) scheduleRetry();
      })
      .catch(() => {
        if (cancelled) return;
        setAssetVideoTicket(null);
        scheduleRetry();
      });
    load();
    return () => {
      cancelled = true;
      if (retry !== null) clearTimeout(retry);
    };
  }, [assetVideo?.assetId, assetVideo?.kind, assetVideo?.mimeType, assetVideo?.sizeBytes, pageId]);
  const resolved = resolveEmbed({ kind: block.kind, url: block.url });
  const playback = resolvePresentationMediaPlaybackSettings(
    block.playback,
    resolved.kind,
  );
  // An imported clip plays from its own package part, as PowerPoint plays
  // its p14:media (`presentation-native-media`): the canvas and the show get
  // a real player for it, which the show's media calls (Play, Pause, Stop)
  // and its playback settings drive. Its poster stays its package's picture.
  const nativeMediaReceipt =
    !assetVideo && !resolved.url && pageId
      ? block.kind === "video"
        ? nativePresentationVideoAuthority(block as unknown as Record<string, unknown>)
        : block.kind === "audio"
          ? nativePresentationAudioAuthority(block as unknown as Record<string, unknown>)
          : null
      : null;
  const nativeMediaUrl =
    nativeMediaReceipt && pageId
      ? `${getApiHttpBaseUrl()}/api/v1/pages/${encodeURIComponent(pageId)}/presentation-native-media/${encodeURIComponent(block.id)}`
      : null;
  const nativePosterUrl =
    nativeMediaUrl && block.kind === "video" && pageId
      ? `${getApiHttpBaseUrl()}/api/v1/pages/${encodeURIComponent(pageId)}/presentation-video-posters/${encodeURIComponent(block.id)}`
      : null;
  const resolvedUrl = assetVideo
    ? assetVideoTicket?.custodyKey === assetVideoCustodyKey
      ? assetVideoTicket.url
      : null
    : resolved.url || nativeMediaUrl;
  const handleMediaLoadedMetadata = useCallback(
    (media: HTMLMediaElement) => {
      if (!interactive) {
        reportMediaMetadata?.(block.id, presentationMediaDurationMs(media));
      }
      seekPresentationMediaToTrimStart(media, playback);
    },
    [block.id, interactive, playback, reportMediaMetadata],
  );
  const handleMediaTimeUpdate = useCallback(
    (media: HTMLMediaElement) => {
      enforcePresentationMediaTrimEnd(media, playback);
    },
    [playback],
  );
  const handleMediaError = useCallback(() => {
    if (!interactive) reportMediaMetadata?.(block.id, null);
  }, [block.id, interactive, reportMediaMetadata]);
  useEffect(() => {
    const element = captionTrackElementRef.current;
    const track = element?.track;
    if (!element || !track || captions.length === 0) {
      queueMicrotask(() => setActiveAudioCaption(""));
      return;
    }
    // Captions show when the first one arrives (PowerPoint turns a video's
    // captions on with its first track). After that the viewer's own choice
    // on the player's caption menu stands: a track the viewer turned off
    // stays off when another caption is added (PPT-B400).
    const previousCount = captionCountRef.current;
    captionCountRef.current = captions.length;
    if (resolved.kind === "audio") {
      track.mode = "hidden";
    } else if (previousCount === 0 || track.mode !== "disabled") {
      track.mode = "showing";
      // One language at a time: the first track shows and the others wait
      // for the viewer's choice on the caption menu. Left to the browser's
      // own selection, a show with two languages drew both over each other
      
      // the editor).
      if (previousCount === 0) {
        for (const other of Array.from(element.parentElement?.querySelectorAll("track") ?? [])) {
          if (other !== element && other.track) other.track.mode = "disabled";
        }
      }
    }
    const refresh = () => {
      if (resolved.kind !== "audio") {
        setActiveAudioCaption("");
        return;
      }
      const cueText = Array.from(track.activeCues ?? [])
        .map((cue) => {
          const value = (cue as unknown as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        })
        .filter(Boolean)
        .join("\n");
      setActiveAudioCaption(cueText);
    };
    element.addEventListener("cuechange", refresh);
    refresh();
    return () => element.removeEventListener("cuechange", refresh);
  }, [captions.length, captions[0]?.id, resolved.kind, resolvedUrl]);
  useEffect(() => {
    const media = mediaElementRef.current;
    if (!media) return;
    media.muted = playback.volume === "mute";
    media.volume = presentationMediaVolumeLevel(playback.volume);
  }, [playback.volume, resolved.kind, resolvedUrl]);
  const bindMediaElement = useCallback((media: HTMLMediaElement | null) => {
    mediaElementRef.current = media;
  }, []);
  const handleMediaEnded = useCallback(() => {
    const media = mediaElementRef.current;
    if (!media) return;
    handlePresentationMediaEnded(media, playback);
  }, [playback]);
  // Play Across Slides: a clip still playing when its slide goes plays on in
  // the show from where it was, its control on show or not, as PowerPoint's
  // does. Read as the slide unmounts, before its player stops.
  const carryAcross =
    interactive &&
    carryAudio !== null &&
    resolved.kind === "audio" &&
    playback.playAcrossSlides &&
    resolvedUrl !== null &&
    !managedBackgroundMediaIds.has(block.id);
  const carrySpecRef = useRef<Omit<PresentationBackgroundAudioSpec, "sourceIndex" | "startAtSec"> | null>(null);
  const carryTitle = block.title?.trim() || "Audio";
  useLayoutEffect(() => {
    carrySpecRef.current =
      carryAcross && resolvedUrl
        ? { blockId: block.id, src: resolvedUrl, title: carryTitle, playback }
        : null;
  });
  useLayoutEffect(() => {
    if (!carryAcross || !carryAudio) return;
    const bound = mediaElementRef.current;
    return () => {
      const media = mediaElementRef.current ?? bound;
      const spec = carrySpecRef.current;
      if (!media || !spec || media.paused || media.ended) return;
      carryAudio({ ...spec, startAtSec: media.currentTime });
    };
  }, [carryAcross, carryAudio]);
  const keepMediaClickOnSlide = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const toggleMediaPlaybackFromFrame = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.stopPropagation();
      const media = mediaElementRef.current;
      if (!media) return;
      if (media.paused) {
        void media.play().catch(() => undefined);
      } else {
        media.pause();
      }
    },
    [],
  );
  const title =
    block.title?.trim() || t(`presentation.embed.kind.${resolved.kind}`);
  const frameStyle: CSSProperties = fillParent
    ? { width: "100%", height: "100%", border: 0 }
    : { width: "100%", maxWidth: 560, aspectRatio: "16 / 9", border: 0 };
  // An imported video (no URL, its media in the package) draws as its poster
  // frame, as PowerPoint draws it until it plays (PPT-D004).
  const nativeVideo = !resolvedUrl
    ? nativePresentationVideoAuthority(block as unknown as Record<string, unknown>)
    : null;
  // Video Format > Poster Frame (PPT-A155): a poster the user set is what the
  // video shows until it plays.
  const customPoster = block.kind === "video" ? videoPosterSource(block) : null;
  if (nativeVideo && customPoster) {
    return (
      <span
        className="presentation-window__video-poster"
        data-testid="presentation-video-poster"
        data-poster-source="custom"
        style={{ position: "relative", display: "block", ...frameStyle }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customPoster}
          alt={title}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      </span>
    );
  }
  if (nativeVideo && pageId) {
    // While its poster loads, or with none, the video's own placeholder: an
    // imported movie is not an unsafe link (it said so while loading).
    return (
      <PresentationVideoPoster
        pageId={pageId}
        blockId={block.id}
        fingerprint={nativeVideo.posterFingerprint}
        title={title}
        style={frameStyle}
        fallbackLabel={t("presentation.embedUnsupported")}
        placeholder={<PresentationVideoPlaceholder label={title} style={frameStyle} />}
        crop={(block as { posterCrop?: unknown }).posterCrop}
      />
    );
  }
  // A clip just uploaded, or re-wrapped by a style change, while its playback
  // ticket is on its way: its poster frame if it has one, else the video
  // placeholder -- never a failure, which only a ticket that never came is.
  if (
    assetVideo &&
    !resolvedUrl &&
    assetVideoCustodyKey !== null &&
    assetVideoGaveUp !== assetVideoCustodyKey
  ) {
    return (
      <span
        data-testid="presentation-media-pending"
        aria-busy="true"
        style={{ position: "relative", display: "block", ...frameStyle }}
      >
        {customPoster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={customPoster}
            alt={title}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
          />
        ) : (
          <PresentationVideoPlaceholder label={title} style={frameStyle} />
        )}
      </span>
    );
  }
  // Imported audio plays from the package, not a link: its speaker icon, as
  // the thumbnail and PowerPoint draw it.
  if (
    !resolvedUrl &&
    resolved.kind === "audio" &&
    nativePresentationAudioAuthority(block as unknown as Record<string, unknown>)
  ) {
    return <PresentationAudioIcon label={title} style={frameStyle} />;
  }
  // An online video (Insert > Video > Online Video, or a PowerPoint online
  // video brought in by an import): its address is the provider's player,
  // never a clip a <video> can play. The canvas draws its poster frame with a
  
  
  
  const onlineVideo = !assetVideo ? presentationOnlineVideo(block) : null;
  if (onlineVideo) {
    return (
      <PresentationOnlineVideo
        key={onlineVideo.linkUrl}
        video={onlineVideo}
        title={title}
        posterSrc={videoPosterSource(block)}
        interactive={interactive}
        frameStyle={frameStyle}
        t={t}
      />
    );
  }
  // Any other web page: PowerPoint has no web-page object, and the app frames
  // no site but the two video players (its CSP, proxy.ts). The slide shows
  // the address as a link card that opens it in a new tab.
  if (resolved.kind === "iframe" && resolvedUrl) {
    return (
      <PresentationWebPageCard
        url={resolvedUrl}
        title={block.title?.trim() || ""}
        style={frameStyle}
        t={t}
      />
    );
  }
  // A video with no playable source here (an embedded WMV the import does
  
  // draws it until the video plays, and the canvas drew a failure notice
  // over an empty frame instead. Only the stored poster is mounted.
  if (!resolvedUrl && block.kind === "video" && customPoster) {
    return (
      <span
        className="presentation-window__video-poster"
        data-testid="presentation-video-poster"
        data-poster-source="unplayable"
        style={{ position: "relative", display: "block", ...frameStyle }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customPoster}
          alt={title}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      </span>
    );
  }
  // A persisted value that is unsafe for the resolved kind → render a safe,
  // non-interactive placeholder. Never mounts an element with the bad URL.
  if (!resolvedUrl) {
    return (
      <div
        className="presentation-window__embed-fallback"
        data-testid="presentation-embed-fallback"
        role="img"
        aria-label={t("presentation.embedUnsupported")}
      >
        <Film size={20} aria-hidden="true" />
        <span>{t("presentation.embedUnsupported")}</span>
      </div>
    );
  }
  // Play in Background owns one persistent hidden audio element outside the
  // keyed slide subtree. Suppress the in-slide duplicate on its source slide;
  // the surrounding block frame remains so authored geometry is unchanged.
  if (
    interactive &&
    resolved.kind === "audio" &&
    managedBackgroundMediaIds.has(block.id)
  ) {
    // A clip whose control is on show and that plays on from its slide keeps
    // its icon there when the show comes back: a click on it plays or pauses
    // the clip that is playing.
    if (!playback.hideDuringShow) {
      return (
        <button
          type="button"
          className="presentation-window__embed-fallback"
          data-testid="presentation-carried-audio-trigger"
          aria-label={title}
          onClick={(event) => {
            event.stopPropagation();
            const media = (event.currentTarget.ownerDocument ?? document).querySelector<HTMLAudioElement>(
              `audio[data-background-audio-block-id="${CSS.escape(block.id)}"]`,
            );
            if (!media) return;
            if (media.paused) void media.play().catch(() => undefined);
            else media.pause();
          }}
          style={{ ...frameStyle, background: "transparent", border: 0, cursor: "pointer", minHeight: 44 }}
        >
          <Volume2 size={20} aria-hidden="true" />
        </button>
      );
    }
    return (
      <span
        hidden
        data-testid="presentation-managed-background-audio-placeholder"
      />
    );
  }
  // The pointer-events guard lets the editor canvas keep block selection /
  // dragging working: in non-interactive (editor) mode the player can't grab
  // the click, so the surrounding block wrapper still receives it.
  const interactionStyle: CSSProperties = interactive
    ? {}
    : { pointerEvents: "none" };
  if (resolved.kind === "video") {
    // On the slide a clip fills its frame, its Crop (`a:srcRect`, the
    // poster's `posterCrop`) cut off, as PowerPoint draws a movie: the
    
    // 81 % x 87 % of the picture stretched over the frame).
    const videoCrop = fillParent ? normalizeSignedCropRect((block as { posterCrop?: unknown }).posterCrop) : null;
    const videoKeep = videoCrop && !isIdentityCrop(videoCrop) ? videoCrop : null;
    const video = (
      <video
        ref={bindMediaElement}
        src={resolvedUrl}
        poster={customPoster ?? nativePosterUrl ?? undefined}
        // The editor canvas never shows the browser's own controls: the
        // selected clip's media control bar drives it, as PowerPoint's
        // Normal view does. The show keeps its own choice.
        controls={interactive && showMediaControls}
        controlsList="nodownload"
        autoPlay={interactive && playback.start === "automatic"}
        loop={presentationMediaLoopsNatively(playback)}
        muted={playback.volume === "mute"}
        onEnded={() => {
          setVideoPlaying(false);
          handleMediaEnded();
        }}
        onLoadedMetadata={(event) =>
          handleMediaLoadedMetadata(event.currentTarget)
        }
        onDurationChange={(event) =>
          handleMediaLoadedMetadata(event.currentTarget)
        }
        onTimeUpdate={(event) => handleMediaTimeUpdate(event.currentTarget)}
        onPlay={(event) => {
          setVideoPlaying(true);
          rewindPresentationMediaBeforePlay(event.currentTarget, playback);
        }}
        onPause={() => setVideoPlaying(false)}
        onError={handleMediaError}
        // A click on the video belongs to the video, never to the show's
        // click-to-advance: without controls the frame plays / pauses it,
        // with controls the player's own click does (PPT-B038).
        onClick={
          interactive
            ? showMediaControls
              ? keepMediaClickOnSlide
              : toggleMediaPlaybackFromFrame
            : undefined
        }
        playsInline
        preload="metadata"
        data-testid="presentation-embed-video"
        data-playback-loop={playback.loop ? "true" : "false"}
        data-playback-trim-end={playback.trimEndMs ?? undefined}
        data-playback-volume={playback.volume}
        data-playback-start={playback.start}
        data-playback-rewind={playback.rewindAfterPlaying ? "true" : "false"}
        data-playback-hidden={playback.hideDuringShow ? "true" : "false"}
        aria-label={title}
        style={{
          ...(fillParent
            ? videoKeep
              ? // The block's own "video { max-height: 100% }" (native-page-window.css)
                // would cap the crop's taller-than-the-frame element: a top or
                // bottom crop then drew the poster short of the frame's foot
                
                // the kept rectangle over the whole frame).
                { ...cropToCss(videoKeep), display: "block", maxWidth: "none", maxHeight: "none" }
              : { width: "100%", height: "100%", objectFit: "fill" as const }
            : { width: "100%", maxWidth: 560 }),
          ...interactionStyle,
          ...(interactive && playback.hideDuringShow && !videoPlaying
            ? { visibility: "hidden" as const }
            : {}),
        }}
      >
        {captions.map((track, index) => (
          <track
            key={track.id}
            ref={index === 0 ? captionTrackElementRef : undefined}
            kind="captions"
            label={track.label}
            srcLang={track.language}
            src={presentationMediaCaptionDataUrl(track)}
            default={index === 0}
            data-testid="presentation-media-caption-track"
          />
        ))}
      </video>
    );
    return videoKeep ? (
      <span
        data-testid="presentation-embed-video-crop"
        style={{ position: "relative", display: "block", width: "100%", height: "100%", overflow: "hidden" }}
      >
        {video}
      </span>
    ) : (
      video
    );
  }
  if (resolved.kind === "audio") {
    const audio = (
      <audio
        ref={bindMediaElement}
        src={resolvedUrl}
        controls={interactive && showMediaControls}
        controlsList="nodownload"
        autoPlay={interactive && playback.start === "automatic"}
        // On the editor canvas the clip is its speaker icon (below) and the
        // player stays hidden for the media control bar to drive.
        hidden={
          !interactive ||
          !showMediaControls ||
          (playback.start === "automatic" && playback.hideDuringShow)
        }
        loop={presentationMediaLoopsNatively(playback)}
        muted={playback.volume === "mute"}
        onEnded={handleMediaEnded}
        onLoadedMetadata={(event) =>
          handleMediaLoadedMetadata(event.currentTarget)
        }
        onDurationChange={(event) =>
          handleMediaLoadedMetadata(event.currentTarget)
        }
        onTimeUpdate={(event) => handleMediaTimeUpdate(event.currentTarget)}
        onPlay={(event) =>
          rewindPresentationMediaBeforePlay(event.currentTarget, playback)
        }
        onError={handleMediaError}
        // The audio player's own clicks never advance the show (PPT-B038).
        onClick={interactive ? keepMediaClickOnSlide : undefined}
        preload="metadata"
        data-testid="presentation-embed-audio"
        data-playback-loop={playback.loop ? "true" : "false"}
        data-playback-trim-end={playback.trimEndMs ?? undefined}
        data-playback-volume={playback.volume}
        data-playback-start={playback.start}
        data-playback-across={playback.playAcrossSlides ? "true" : "false"}
        data-playback-hidden={playback.hideDuringShow ? "true" : "false"}
        data-playback-rewind={playback.rewindAfterPlaying ? "true" : "false"}
        aria-label={title}
        style={{ width: "100%", ...interactionStyle }}
      >
        {captions.map((track, index) => (
          <track
            key={track.id}
            ref={index === 0 ? captionTrackElementRef : undefined}
            kind="captions"
            label={track.label}
            srcLang={track.language}
            src={presentationMediaCaptionDataUrl(track)}
            default={index === 0}
            data-testid="presentation-media-caption-track"
          />
        ))}
      </audio>
    );
    if (interactive && !showMediaControls) {
      return (
        <>
          {audio}
          {playback.start === "automatic" && playback.hideDuringShow ? null : (
            <button
              type="button"
              className="presentation-window__embed-fallback"
              data-testid="presentation-embed-audio-trigger"
              onClick={toggleMediaPlaybackFromFrame}
              aria-label={title}
              style={{
                ...frameStyle,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              <Volume2 size={20} aria-hidden="true" />
              <span>{title}</span>
            </button>
          )}
        </>
      );
    }
    return (
      <>
        {audio}
        {!interactive ? <PresentationAudioIcon label={title} /> : null}
        {activeAudioCaption ? (
          <output
            className="presentation-window__media-caption"
            data-testid="presentation-media-audio-caption"
            aria-live="polite"
            style={{
              display: "block",
              marginTop: 6,
              padding: "6px 10px",
              borderRadius: 4,
              background: "rgba(0, 0, 0, 0.78)",
              color: "white",
              fontSize: 13,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
              textAlign: "center",
            }}
          >
            {activeAudioCaption}
          </output>
        ) : null}
      </>
    );
  }
  // Every iframe embed was drawn above: an online video by its player, any
  // other page as its link card.
  return null;
}

/**
 * A web page placed with the online-video box (or kept by an older deck):
 * its title and host, and a link that opens it in a new tab. No frame is
 * mounted -- the app never frames an arbitrary site under its own origin.
 */
function PresentationWebPageCard({
  url,
  title,
  style,
  t,
}: {
  url: string;
  title: string;
  style: CSSProperties;
  t: (key: string) => string;
}) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // resolveEmbed returned a parsed https URL; keep the text as it is.
  }
  return (
    <div
      className="presentation-window__embed-fallback presentation-online-video__web-page"
      data-testid="presentation-web-page-card"
      style={style}
    >
      <Film size={20} aria-hidden="true" />
      <span>{title || host}</span>
      <span>{t("presentation.onlineVideo.webPage")}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="presentation-online-video__open"
        data-testid="presentation-web-page-open"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {t("presentation.onlineVideo.openInNewTab")}
        <span className="sr-only"> ({host})</span>
      </a>
    </div>
  );
}

/**
 * Render an image block's `<img>`, applying an optional crop deterministically.
 *
 * With no (or an identity) crop, the image renders as before — a plain `<img>`
 * carrying the caller's `style` (so present-mode / editor sizing is unchanged).
 * With a real crop, the image is wrapped in an `overflow: hidden` box and
 * positioned via {@link cropToCss} so only the cropped sub-region is visible.
 * The crop math is pure (`lib/presentation-crop-group`) and signed-validates at
 * this render edge, so native Fit outsets survive while garbage cannot break
 * layout.
 */
/**
 * The SVG filter steps of a picture's Set Transparent Color and Office
 * Recolor tile beyond Grayscale, read from its file
 * (`source.pictureClearColor`, `source.pictureRecolorPreset`, import
 * evidence: the package keeps its own XML), in the deck's theme; empty for
 * none. The colour change first, as Office applies it.
 */
export function pictureRecolorPresetSteps(
  block: PresentationImageBlock,
  themeColors?: OfficeThemeGridColors | null,
): OfficePictureFilterStep[] {
  const source = (block as { source?: unknown }).source;
  const record = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>) : null;
  const clear = officeClearColorStep(record?.pictureClearColor, record?.pictureClearTolerance);
  const recolor = pictureRecolorTileSteps(record, themeColors);
  return clear ? [clear, ...recolor] : recolor;
}

function pictureRecolorTileSteps(
  record: Record<string, unknown> | null,
  themeColors?: OfficeThemeGridColors | null,
): OfficeAdjustFilterStep[] {
  const preset = record ? record.pictureRecolorPreset : null;
  if (!isOfficeRecolorPreset(preset)) {
    // Recolor > More Variations: a tile's duotone around a colour no tile
    // names (`source.pictureRecolorVariation`).
    const variation = record?.pictureRecolorVariation as { variation?: unknown; color?: unknown } | undefined;
    // Any other duotone in its two colours as the slide's theme read them
    // (`source.pictureDuotone`, readings row 858: a template's dk2 band,
    // plain black to white), as PowerPoint draws every duotone.
    const stated = record?.pictureDuotone;
    const pair =
      variation && (variation.variation === "dark" || variation.variation === "light") && typeof variation.color === "string"
        ? officeRecolorVariationDuotone(variation.variation, variation.color)
        : Array.isArray(stated) && stated.length === 2 && stated.every((value) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value))
          ? ([stated[0], stated[1]] as const)
          : null;
    return pair ? officeAdjustFilterSteps({ duotone: pair }) : [];
  }
  if (preset === "grayscale" || preset === "washout") return [];
  return officeAdjustFilterSteps({ recolor: preset }, themeColors);
}

/**
 * The picture's own fill (Format Picture > Fill, an imported `p:spPr`
 * solid fill), or null: none stated, "none", or an SVG graphic (whose
 * Graphics Fill is its own paint).
 */
export function presentationPictureFillColor(block: PresentationImageBlock): string | null {
  const fill = (block as { fill?: unknown }).fill;
  if (block.officeGraphicKind === "svg" || typeof fill !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : null;
}

export function CroppedImageContent(props: Parameters<typeof CroppedImageDrawing>[0]) {
  // Graphics Fill / Outline (PPT-A161): an SVG graphic draws a recoloured
  // copy of its vector; the server rewrites the package's part.
  // ... stretched over its frame as PowerPoint draws a picture's blip.
  const displayBlock = useMemo(() => {
    const painted = officeGraphicDisplayBlock(props.block);
    if (painted.officeGraphicKind !== "svg") return painted;
    const src = officeGraphicStretchedSrc(painted.src);
    return src === painted.src ? painted : { ...painted, src };
  }, [props.block]);
  // Picture Border: drawn by the frame around the picture, where PowerPoint
  // draws it (`lib/office-picture-line`): outside the picture (centred on a
  // 3-D one), with its compound lines and corners. On a picture cropped to a
  // shape it follows the shape, and the picture itself draws no rectangular
  
  const clipShape = (props.block as { clipShape?: unknown }).clipShape;
  const clipCustomPath = (props.block as { clipCustomPath?: unknown }).clipCustomPath;
  const shapeStroke = useMemo((): ClipShapeStroke | null => {
    if (nativePictureStyle(props.block.pictureStylePreset)) return null;
    const effects = resolveImageEffects({
      ...props.block,
      cornerRadius: effectivePresentationImageCornerRadius(props.block),
    });
    if (!(effects.borderWidth > 0 && effects.borderStyle !== "none")) return null;
    // An inline picture (no slide geometry) keeps its CSS frame, placed
    // likewise (`imageEffectsCss`); the frame around it would not fit it.
    if (!props.fillParent && !normalizePictureClipShape(clipShape) && !clipCustomPath) return null;
    const line = props.block as { borderCompound?: unknown; borderJoin?: unknown; pictureEffects?: unknown };
    const compound = officePictureLineCompound(line.borderCompound);
    return {
      width: effects.borderWidth,
      color: effects.borderColor,
      style: effects.borderStyle,
      ...(compound ? { compound } : {}),
      join: officePictureLineJoin(line.borderJoin),
      outset: officePictureLineOutset(effects.borderWidth, line.pictureEffects),
      radius: normalizePictureClipShape(clipShape) || clipCustomPath ? 0 : effects.cornerRadius,
    };
  }, [clipShape, clipCustomPath, props.block, props.fillParent]);
  const block = useMemo(
    () =>
      shapeStroke
        ? ({ ...displayBlock, borderWidth: 0, borderStyle: "none", clipShape: undefined } as PresentationImageBlock)
        : displayBlock,
    [displayBlock, shapeStroke],
  );
  // Crop to Shape (PPT-A132) inside, Picture Effects (Glow, Reflection, Soft
  // Edges, Bevel, 3-D Rotation) framing the picture's whole drawing (PPT-A127).
  return (
    <PresentationPictureEffectsFrame block={props.block} fillParent={props.fillParent}>
      <PresentationClipShapeFrame
        clipShape={clipShape}
        adjustments={(props.block as { clipShapeAdjustments?: unknown }).clipShapeAdjustments}
        customPath={clipCustomPath}
        width={props.block.width}
        height={props.block.height}
        fillParent={props.fillParent}
        stroke={shapeStroke}
      >
        <CroppedImageDrawing {...props} block={block} />
      </PresentationClipShapeFrame>
    </PresentationPictureEffectsFrame>
  );
}

function CroppedImageDrawing({
  block,
  imgStyle,
  cropOverride,
  fillParent,
  themeColors,
  emptySlot = "icon",
}: {
  block: PresentationImageBlock;
  /** The deck's theme: a Recolor tile's colours (Accent 1 Light ...). */
  themeColors?: OfficeThemeGridColors | null;
  /**
   * How a SmartArt picture slot that holds no picture is drawn: with the
   * "insert picture" icon while editing, as its bare slot colour everywhere
   * else (`smartArtPictureOutputSrc`, TRIAGE S22).
   */
  emptySlot?: "icon" | "fill";
  imgStyle?: CSSProperties;
  // Live crop preview (drag in progress). When provided it overrides the
  // persisted `block.cropRect` so the image tracks the drag before commit.
  cropOverride?: CropRect | null;
  // True when the parent figure has an explicit box (a positioned/geometry
  // block, or a present-mode geometry block): the crop wrapper fills 100% of it.
  // False for an inline (non-positioned) image: the wrapper instead derives an
  // `aspect-ratio` from the crop + the block's width/height hints so it never
  // collapses to zero height inside an auto-sized grid row.
  fillParent?: boolean;
}) {
  const recolorFilterId = `presentation-picture-recolor-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const alt = block.decorative === true ? "" : block.alt || "";
  if (nativePictureStyle(block.pictureStylePreset)) {
    return (
      <PresentationPictureStyleGraphic
        block={block}
        imgStyle={imgStyle}
        cropOverride={cropOverride}
        fillParent={fillParent}
      />
    );
  }
  // Resolve optional visual effects (shadow / frame / rounded corners) once and
  // layer them onto the visible image element. `hasEffects` is false for an
  // image with no effects, so the spread is a no-op and the render is unchanged.
  const effects = resolveImageEffects({
    ...block,
    cornerRadius: effectivePresentationImageCornerRadius(block),
    // Picture Effects > Shadow states the shadow in full and draws it on the
    // effects frame; the older switch does not draw a second one.
    ...(block.pictureEffects?.shadow ? { shadow: false } : {}),
  });
  const effectsCss: CSSProperties = {
    ...imageEffectsCss(effects, {
      lineOutset: officePictureLineOutset(effects.borderWidth, block.pictureEffects),
    }),
    // Crop to Shape > Oval: the bitmap shows inside the ellipse of its
    // frame and the corners show the slide (PPT-B364).
    ...((block as { clipShape?: unknown }).clipShape === "ellipse"
      ? { clipPath: "ellipse(50% 50% at 50% 50%)" }
      : {}),
  };
  // Picture Format > Artistic Effects: drawn first, the colour adjustments
  // after it, as Office applies them (a file's own rendered blip draws as is).
  const artisticFilter = officeArtisticEffectCss(block.artisticEffect, block.artisticEffectRendered === true);
  // An Office Recolor tile beyond Grayscale (Sepia, Black and White, Dark /
  // Light) read from the file: drawn before the corrections, as Office does.
  const recolorSteps = pictureRecolorPresetSteps(block, themeColors);
  const imageFilter =
    [artisticFilter, recolorSteps.length ? `url(#${recolorFilterId})` : "", effectsCss.filter].filter(Boolean).join(" ") ||
    undefined;
  // Recolor, brightness, contrast and transparency change the PICTURE, not the
  // frame around it: a grey picture keeps its red border. On one element a
  // CSS filter greys both (PPT-B135), so a framed picture with any of them
  // draws its frame on a wrapper and the adjustments on the image inside --
  // the structure a cropped picture already has.
  const {
    filter: contentFilter,
    opacity: contentOpacity,
    ...frameCss
  } = effectsCss;
  const frameApart =
    (frameCss.outline !== undefined || frameCss.boxShadow !== undefined) &&
    (imageFilter !== undefined || contentOpacity !== undefined);
  // A recolour draws through an SVG filter defined beside the picture, in
  // the wrapper a cropped picture already has.
  const recolorApart = recolorSteps.length > 0;
  // Format Picture > Fill: drawn under the picture, inside its outline (the
  // clip frame around this drawing), where the picture is transparent or
  // does not reach. The picture's corrections and transparency are not the
  // fill's, so with any of them the fill is the wrapper's background.
  const pictureFill = presentationPictureFillColor(block);
  const fillApart = pictureFill !== null && (imageFilter !== undefined || contentOpacity !== undefined);
  const effectiveCrop =
    cropOverride ??
    block.cropRect ??
    (frameApart || recolorApart || fillApart ? { x: 0, y: 0, w: 1, h: 1 } : undefined);
  // An EMF's words over its render, drawn by nobody (readings row 864).
  const textRuns = metafileTextRuns(block.source);
  // An EMF's lone SRCPAINT / SRCAND bitmap, ORed / ANDed into the slide
  // under the picture as Windows PowerPoint applies it (readings row 1021).
  const blendLayer = metafileBlendLayer(block);
  if (!effectiveCrop || (isIdentityCrop(effectiveCrop) && !frameApart && !recolorApart && !fillApart)) {
    const whole = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={(emptySlot === "fill" ? smartArtPictureOutputSrc : smartArtPictureDisplaySrc)(block.src, (block as { smartArtSlotFill?: unknown }).smartArtSlotFill)}
        alt={alt}
        draggable={false}
        // An uncropped picture fills its frame as a cropped one does: the
        // slide show used to draw it at its natural pixels (PPT-B243).
        style={{
          border: 0,
          borderRadius: 0,
          ...presentationPictureOrientationCss(block),
          ...imgStyle,
          ...(fillParent ? { width: "100%", height: "100%" } : {}),
          ...effectsCss,
          filter: imageFilter,
          ...(pictureFill ? { backgroundColor: pictureFill } : {}),
        }}
        data-testid="presentation-image-el"
        data-artistic-effect={normalizeOfficeArtisticEffect(block.artisticEffect) ?? undefined}
      />
    );
    if ((!textRuns.length && !blendLayer) || !fillParent) return whole;
    return (
      <span style={{ position: "relative", display: "block", width: "100%", height: "100%" }}>
        {whole}
        {blendLayer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blendLayer.src}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              border: 0,
              borderRadius: 0,
              maxWidth: "none",
              maxHeight: "none",
              ...presentationPictureOrientationCss(block),
              ...(contentOpacity !== undefined ? { opacity: contentOpacity } : {}),
              mixBlendMode: blendLayer.mode,
              pointerEvents: "none",
            }}
            data-testid="presentation-metafile-blend-layer"
            data-blend-mode={blendLayer.mode}
          />
        ) : null}
        <PresentationMetafileTextLayer runs={textRuns} orientation={presentationPictureOrientationCss(block)} />
      </span>
    );
  }
  const css = cropToCss(effectiveCrop);
  const normalized = normalizeSignedCropRect(effectiveCrop) ?? {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };
  // Inline (non-fill) wrapper sizing: width tracks the same maxWidth the plain
  // img would use; height comes from an aspect ratio of the visible crop box. The
  // crop box's aspect = (sourceW * cropW) / (sourceH * cropH); we approximate the
  // source dims with the block's width/height hints (else a 4:3 fallback) — only
  // used for inline images, which carry these hints from import.
  const wrapperStyle: CSSProperties = fillParent
    ? { width: "100%", height: "100%" }
    : (() => {
        const baseW =
          typeof block.width === "number" && block.width > 0 ? block.width : 4;
        const baseH =
          typeof block.height === "number" && block.height > 0
            ? block.height
            : 3;
        const ratio = (baseW * normalized.w) / (baseH * normalized.h);
        return {
          width: imgStyle?.maxWidth ?? "100%",
          maxWidth: imgStyle?.maxWidth,
          aspectRatio:
            Number.isFinite(ratio) && ratio > 0 ? `${ratio}` : "4 / 3",
        };
      })();
  return (
    <span
      className="presentation-window__image-crop"
      data-testid="presentation-image-crop"
      // Effects layer on the visible crop wrapper (which already clips with
      // `overflow: hidden`) so the frame / rounded corners / shadow surround the
      // visible region, not the scaled-up source image inside it.
      style={{
        position: "relative",
        display: "block",
        overflow: "hidden",
        borderRadius: 0,
        boxSizing: "border-box",
        ...wrapperStyle,
        ...frameCss,
        ...(pictureFill ? { backgroundColor: pictureFill } : {}),
      }}
    >
      <OfficeAdjustSvgFilter id={recolorFilterId} steps={recolorSteps} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={(emptySlot === "fill" ? smartArtPictureOutputSrc : smartArtPictureDisplaySrc)(block.src, (block as { smartArtSlotFill?: unknown }).smartArtSlotFill)}
        alt={alt}
        draggable={false}
        // `maxWidth: none` defeats the stylesheet's `.presentation-present__image
        // img { max-width: 100% }` (and editor equivalents) which would otherwise
        // clamp the scaled-up cropped image and break the deterministic crop.
        style={{
          ...(css as CSSProperties),
          ...presentationPictureOrientationCss(block),
          border: 0,
          borderRadius: 0,
          maxWidth: "none",
          maxHeight: "none",
          ...(imageFilter ? { filter: imageFilter } : {}),
          ...(contentOpacity !== undefined ? { opacity: contentOpacity } : {}),
        }}
        data-artistic-effect={normalizeOfficeArtisticEffect(block.artisticEffect) ?? undefined}
      />
      {blendLayer ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blendLayer.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          // Laid exactly where the picture's render is (its crop's box), over it.
          style={{
            ...(css as CSSProperties),
            ...presentationPictureOrientationCss(block),
            border: 0,
            borderRadius: 0,
            maxWidth: "none",
            maxHeight: "none",
            ...(contentOpacity !== undefined ? { opacity: contentOpacity } : {}),
            mixBlendMode: blendLayer.mode,
            pointerEvents: "none",
          }}
          data-testid="presentation-metafile-blend-layer"
          data-blend-mode={blendLayer.mode}
        />
      ) : null}
      <PresentationMetafileTextLayer
        runs={textRuns}
        box={css as CSSProperties}
        orientation={presentationPictureOrientationCss(block)}
      />
    </span>
  );
}
