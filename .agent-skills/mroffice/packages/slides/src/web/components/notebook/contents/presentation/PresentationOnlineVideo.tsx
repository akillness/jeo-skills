"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An online video (YouTube, Vimeo) on a slide, as PowerPoint plays one.
 *
 *  - Editing canvas: the poster frame (or a dark frame) with a Play button,
 *    as PowerPoint's Normal view draws it; Play loads the provider's player
 *    in place and starts it, Stop returns to the poster. Nothing is fetched
 *    from the provider until the author presses Play.
 *  - Slide show: the provider's player with its own controls.
 *  - Fallback (poster + "Open in new tab"): the viewer is offline, the page's
 *    policy blocked the player (`securitypolicyviolation` for its origin), or
 *    the player said its owner does not allow embedding (YouTube `onError`
 *    100/101/150, Vimeo `error`).
 *
 * The frame is the provider's privacy-enhanced player only
 * (lib/online-video `onlineVideoEmbedUrl`), sandboxed with
 * ONLINE_VIDEO_IFRAME_SANDBOX and an origin-only referrer.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributeReferrerPolicy,
  type SyntheticEvent,
} from "react";
import { ExternalLink, Play, Square } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  ONLINE_VIDEO_IFRAME_REFERRER_POLICY,
  ONLINE_VIDEO_IFRAME_SANDBOX,
  onlineVideoEmbedUrl,
  onlineVideoFrameOrigin,
  onlineVideoIframeAllow,
  onlineVideoListenMessage,
  onlineVideoPlayerSignal,
  onlineVideoProviderName,
  type OnlineVideo,
} from "@mrnote/core/web/lib/online-video.ts";
import { PresentationVideoPlaceholder } from "./PresentationMediaStaticFace";

/** How often, and how many times, the slide asks a loaded player to report. */
const LISTEN_INTERVAL_MS = 500;
const LISTEN_ATTEMPTS = 20;

type Unplayable = "offline" | "blocked" | "refused";

function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

/** The poster frame the author set or the file brought, else a dark frame. */
function OnlineVideoFace({
  posterSrc,
  title,
  style,
}: {
  posterSrc: string | null;
  title: string;
  style: CSSProperties;
}) {
  return posterSrc ? (
    <span
      className="presentation-window__video-poster"
      data-testid="presentation-video-poster"
      data-poster-source="online"
      style={{ position: "absolute", inset: 0, display: "block" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterSrc}
        alt={title}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
      />
    </span>
  ) : (
    <span style={{ position: "absolute", inset: 0, display: "block" }}>
      <PresentationVideoPlaceholder
        label={title}
        style={style}
        testId="presentation-online-video-placeholder"
      />
    </span>
  );
}

export function PresentationOnlineVideo({
  video,
  title,
  posterSrc,
  interactive,
  frameStyle,
  t,
}: {
  video: OnlineVideo;
  title: string;
  posterSrc: string | null;
  /** True in the slide show; false on the editing canvas. */
  interactive: boolean;
  frameStyle: CSSProperties;
  t: (key: string) => string;
}) {
  const frameOrigin = onlineVideoFrameOrigin(video.provider);
  const providerName = onlineVideoProviderName(video.provider);
  const channelId = useId();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [online, setOnline] = useState(browserOnline);
  // What stopped this video, for the address it was found for (a new address
  // gets a fresh try).
  const [stopped, setStopped] = useState<{ url: string; reason: "blocked" | "refused" } | null>(null);
  // Editing canvas: the author's Play, for the address it was pressed for.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const playing = interactive || playingUrl === video.linkUrl;
  const unplayable: Unplayable | null = !online
    ? "offline"
    : stopped?.url === video.linkUrl
      ? stopped.reason
      : null;
  // The player is only ever mounted after a client-side action (the show
  // opened, Play pressed), never in server HTML, so the page's origin is read
  // as it renders.
  const embedOrigin = typeof window === "undefined" ? null : window.location.origin;

  useEffect(() => {
    const update = () => setOnline(browserOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // The page's own policy refused the player frame (an older tab, a page
  // outside the workspace): say so instead of the browser's blocked frame.
  useEffect(() => {
    if (!playing) return;
    const linkUrl = video.linkUrl;
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      const directive = event.effectiveDirective || event.violatedDirective || "";
      if (!directive.startsWith("frame-src") && !directive.startsWith("child-src")) return;
      const blocked = event.blockedURI || "";
      if (blocked === frameOrigin || blocked.startsWith(`${frameOrigin}/`)) {
        setStopped({ url: linkUrl, reason: "blocked" });
      }
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [frameOrigin, playing, video.linkUrl]);

  // The player's reports: only from this frame's window and the provider's
  // player origin; a refusal (embedding disallowed, removed, private) turns
  // the slide to its fallback.
  const readyRef = useRef(false);
  useEffect(() => {
    if (!playing || unplayable) return;
    readyRef.current = false;
    const linkUrl = video.linkUrl;
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.origin !== frameOrigin || event.source !== frame.contentWindow) {
        return;
      }
      const signal = onlineVideoPlayerSignal(video.provider, event.data);
      if (signal === "refused") {
        setStopped({ url: linkUrl, reason: "refused" });
      } else if (signal === "ready" && !readyRef.current) {
        readyRef.current = true;
        // Vimeo answers `ready` first; its error events need a subscription.
        if (video.provider === "vimeo") {
          frame.contentWindow?.postMessage(
            onlineVideoListenMessage("vimeo", channelId),
            frameOrigin,
          );
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [channelId, frameOrigin, playing, unplayable, video.linkUrl, video.provider]);

  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (listenTimerRef.current !== null) clearInterval(listenTimerRef.current);
    },
    [],
  );
  const handleFrameLoad = useCallback(() => {
    if (listenTimerRef.current !== null) clearInterval(listenTimerRef.current);
    let attempts = 0;
    const listen = () => {
      const target = iframeRef.current?.contentWindow;
      attempts += 1;
      if (!target || readyRef.current || attempts > LISTEN_ATTEMPTS) {
        if (listenTimerRef.current !== null) clearInterval(listenTimerRef.current);
        listenTimerRef.current = null;
        return;
      }
      target.postMessage(onlineVideoListenMessage(video.provider, channelId), frameOrigin);
    };
    listen();
    listenTimerRef.current = setInterval(listen, LISTEN_INTERVAL_MS);
  }, [channelId, frameOrigin, video.provider]);

  const boxStyle: CSSProperties = {
    position: "relative",
    display: "block",
    overflow: "hidden",
    ...frameStyle,
  };

  if (unplayable) {
    const message =
      unplayable === "offline"
        ? t("presentation.onlineVideo.offline")
        : unplayable === "refused"
          ? t("presentation.onlineVideo.refused")
          : t("presentation.onlineVideo.blocked");
    return (
      <span
        className="presentation-online-video"
        data-testid="presentation-online-video-fallback"
        data-online-video-provider={video.provider}
        data-unplayable={unplayable}
        style={boxStyle}
      >
        <OnlineVideoFace posterSrc={posterSrc} title={title} style={frameStyle} />
        <span className="presentation-online-video__notice" role="status">
          <span>{message}</span>
          <a
            href={video.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="presentation-online-video__open"
            data-testid="presentation-online-video-open"
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={stop}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t("presentation.onlineVideo.openInNewTab")}
            <span className="sr-only"> ({providerName})</span>
          </a>
        </span>
      </span>
    );
  }

  if (!playing) {
    return (
      <span
        className="presentation-online-video"
        data-testid="presentation-online-video"
        data-online-video-provider={video.provider}
        data-online-video-state="poster"
        style={boxStyle}
      >
        <OnlineVideoFace posterSrc={posterSrc} title={title} style={frameStyle} />
        <button
          type="button"
          className="presentation-online-video__play"
          data-testid="presentation-online-video-play"
          aria-label={`${t("presentation.onlineVideo.play")}: ${title}`}
          title={t("presentation.onlineVideo.play")}
          onPointerDown={stop}
          onMouseDown={stop}
          onDoubleClick={stop}
          onClick={(event) => {
            event.stopPropagation();
            setPlayingUrl(video.linkUrl);
          }}
        >
          <Play size={22} aria-hidden="true" />
        </button>
        <span className="presentation-online-video__provider" aria-hidden="true">
          {providerName}
        </span>
      </span>
    );
  }

  return (
    <span
      className="presentation-online-video"
      data-testid="presentation-online-video"
      data-online-video-provider={video.provider}
      data-online-video-state="player"
      style={boxStyle}
    >
      {embedOrigin !== null ? (
        <iframe
          ref={iframeRef}
          // Set as the src attribute only; built from the recognised id.
          src={onlineVideoEmbedUrl(video, {
            origin: embedOrigin,
            autoplay: !interactive,
          })}
          title={title}
          sandbox={ONLINE_VIDEO_IFRAME_SANDBOX}
          referrerPolicy={ONLINE_VIDEO_IFRAME_REFERRER_POLICY as HTMLAttributeReferrerPolicy}
          allow={onlineVideoIframeAllow(!interactive)}
          allowFullScreen
          loading={interactive ? "lazy" : "eager"}
          onLoad={handleFrameLoad}
          data-testid="presentation-embed-iframe"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      ) : null}
      {!interactive ? (
        <button
          type="button"
          className="presentation-online-video__stop"
          data-testid="presentation-online-video-stop"
          aria-label={`${t("presentation.onlineVideo.stop")}: ${title}`}
          title={t("presentation.onlineVideo.stop")}
          onPointerDown={stop}
          onMouseDown={stop}
          onDoubleClick={stop}
          onClick={(event) => {
            event.stopPropagation();
            setPlayingUrl(null);
          }}
        >
          <Square size={14} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
