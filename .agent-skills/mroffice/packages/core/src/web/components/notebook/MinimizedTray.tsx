"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { touchScale } from "../../lib/css-zoom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";
import {
  useWindowManagerActions,
  useWindowManagerSemanticState,
} from "./WindowManager";
import type { WindowSemanticState } from "./WindowManager";
import { WindowGlyph } from "./WindowGlyph";
import { useNotebookInterior } from "./notebook-interior-context";
import { isClassicTabWindow } from "../../lib/notebook-interior-mode";
import { VibePresetArt } from "../../__cut__/mddf52c57d5";
import { PageThumbnail } from "./page-thumbnails/PageThumbnail";
import { DockThumbnail } from "./page-thumbnails/DockThumbnail";
import { requestCollaborationShellAction } from "../../lib/collaboration-windows/shell-policy";
import { listVibeWindows } from "../../__cut__/m404f0841db";
import {
  flyIntoDockTile,
  noteDockReturn,
} from "../../lib/window-dock-motion";
import { announceUserClosedWindow } from "../../__cut__/mb9a777d2ef";

/**
 * The minimized windows, as tiles under the sidebar: an AI window shows its
 * own card picture (animated while pointed at), a page's window the page
 * itself drawn small on a stack of paper (DockThumbnail, its glyph until
 * that is ready), every other window its glyph. Pointing at a tile opens a
 * small preview beside the sidebar (the page itself, drawn small, for a page
 * window). A window minimizing flies
 * into its tile and flies back out when the tile is pressed
 * (lib/window-dock-motion), as on a Mac's Dock.
 */

/** A pointer resting this long on a tile opens its preview. */
const PREVIEW_DELAY_MS = 220;
/** The preview stays this long after the pointer leaves, so moving between
 *  tiles swaps it instead of blinking it. */
const PREVIEW_LINGER_MS = 90;
const PREVIEW_WIDTH = 208;
const PREVIEW_GAP = 14;

type VibeArt = { templateId?: string; cover?: unknown };

/* ---- an AI window's picture: the library's own listing, per notebook ---- */

const ART_TTL_MS = 60_000;
const artCache = new Map<
  string,
  { at: number; art: Promise<Map<string, VibeArt>> }
>();

function vibeArtFor(notebookId: string): Promise<Map<string, VibeArt>> {
  const cached = artCache.get(notebookId);
  if (cached && Date.now() - cached.at < ART_TTL_MS) return cached.art;
  const art = listVibeWindows(notebookId)
    .then(
      (entries) =>
        new Map(
          entries.map((entry) => [
            entry.page_id,
            { templateId: entry.template_id, cover: entry.cover },
          ]),
        ),
    )
    .catch(() => new Map<string, VibeArt>());
  artCache.set(notebookId, { at: Date.now(), art });
  return art;
}

function useVibeArt(windows: readonly WindowSemanticState[]): Map<string, VibeArt> {
  const notebookId = windows.find(
    (w) => w.type === "vibe_window" && typeof w.meta.notebookId === "string",
  )?.meta.notebookId as string | undefined;
  const [art, setArt] = useState<Map<string, VibeArt>>(() => new Map());
  useEffect(() => {
    if (!notebookId) return;
    let live = true;
    void vibeArtFor(notebookId).then((next) => {
      if (live) setArt(next);
    });
    return () => {
      live = false;
    };
  }, [notebookId]);
  return art;
}

/**
 * The page a page-bound window shows. Someone else's shared window carries
 * no page id in its meta (the desk state never names it), but its verified
 * locator does; the tray only looks it up in what this member can read.
 */
const pageIdOf = (w: WindowSemanticState): string | null => {
  if (typeof w.meta.pageId === "string") return w.meta.pageId;
  const locator = w.collaboration as { resourceLocator?: unknown } | undefined;
  return typeof locator?.resourceLocator === "string" ? locator.resourceLocator : null;
};

/* ------------------------------------------------------------- preview */

function TrayPreview({
  window: w,
  art,
  note,
  style,
}: {
  window: WindowSemanticState;
  art: VibeArt | undefined;
  note: string;
  style: CSSProperties;
}) {
  const pageId = pageIdOf(w);
  const pageType =
    typeof w.meta.pageType === "string" ? w.meta.pageType : "document";
  let stage;
  if (w.type === "vibe_window") {
    stage = (
      <span className="wm-tray-preview__art" data-art-host="">
        <VibePresetArt templateId={art?.templateId} cover={art?.cover} />
      </span>
    );
  } else if (w.type === "note" && pageId) {
    stage = (
      <PageThumbnail
        page={{ id: pageId, title: w.title, page_type: pageType }}
        variant="strip"
        className="wm-tray-preview__thumb"
      />
    );
  } else {
    stage = (
      <span className="wm-tray-preview__glyph">
        <WindowGlyph
          type={w.type}
          meta={w.meta as Record<string, unknown>}
          size={34}
          artworkClassName="wm-tray-preview__artwork"
        />
      </span>
    );
  }
  return (
    <div
      className="wm-tray-preview"
      style={style}
      aria-hidden="true"
      data-testid="tray-preview"
    >
      <div className="wm-tray-preview__stage">{stage}</div>
      <strong className="wm-tray-preview__title">{w.title}</strong>
      <small className="wm-tray-preview__note">{note}</small>
    </div>
  );
}

/* ----------------------------------------------------------------- tile */

/** A tile's face: a page's window shows the page, any other its glyph. */
function TileFace({ window: w }: { window: WindowSemanticState }) {
  const glyph = (
    <WindowGlyph
      type={w.type}
      meta={w.meta as Record<string, unknown>}
      size={22}
      artworkClassName="wm-tray-tile__artwork"
      iconClassName="wm-tray-tile__icon"
    />
  );
  const pageId = w.type === "note" ? pageIdOf(w) : null;
  if (!pageId) return glyph;
  const variant = w.meta.pageVariant ?? w.meta.page_variant;
  return (
    <DockThumbnail
      page={{
        id: pageId,
        title: w.title,
        page_type: typeof w.meta.pageType === "string" ? w.meta.pageType : "document",
        page_variant: typeof variant === "string" ? variant : null,
      }}
      fallback={glyph}
      className="wm-tray-thumb"
    />
  );
}

/* ----------------------------------------------------------------- tray */

export default function MinimizedTray() {
  // Hydration gate: WindowManager hydrates from localStorage on mount, so
  // server-rendered windows[] is always empty while client may have
  // persisted minimized entries. Rendering nothing on both sides until
  // mount avoids the "<div> inside <a>"-style mismatch that surfaces
  // when the surrounding Sidebar re-orders sibling nodes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const t = useTranslations("console-notebooks");
  const { windows } = useWindowManagerSemanticState();
  const { restoreWindow, closeWindow } = useWindowManagerActions();
  // Restoring a shared window is the owner's canonical call: its minimized
  // flag comes from the canonical record, so nothing local can honestly
  // un-minimize it here. The tile used to swallow that refusal whole. Record
  // it instead, so the preview says why the click did nothing.
  const [restoreRefusedId, setRestoreRefusedId] = useState<string | null>(null);
  // The classic interior shows its minimized pages as tabs; only what is
  // not a tab there (the assistant) waits here.
  const classic = useNotebookInterior().mode === "classic";
  const minimized = windows.filter(
    (w) => w.minimized && !(classic && isClassicTabWindow(w)),
  );
  const vibeArt = useVibeArt(minimized);

  const trayRef = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  // A window that just minimized flies into its new tile; the tile shows as
  // the picture lands. Windows already minimized when the tray appears just
  // sit there.
  const seen = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    if (!mounted) return;
    const ids = new Set(minimized.map((w) => w.id));
    const before = seen.current;
    seen.current = ids;
    if (!before) return;
    for (const id of ids) {
      if (before.has(id)) continue;
      const tile = tiles.current.get(id);
      if (!tile) continue;
      // The tray scrolls when it is full: bring the new tile into view
      // before the picture flies to it.
      tile.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const flies = flyIntoDockTile(id, tile, () => {
        tile.removeAttribute("data-arriving");
        tile.setAttribute("data-landed", "");
        window.setTimeout(() => tile.removeAttribute("data-landed"), 420);
      });
      if (flies) tile.setAttribute("data-arriving", "");
    }
  });

  const [preview, setPreview] = useState<{ id: string; top: number; left: number } | null>(null);
  const previewTimer = useRef<number | null>(null);
  const clearPreviewTimer = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };
  const placePreview = useCallback((id: string, tile: HTMLElement) => {
    const tileBox = tile.getBoundingClientRect();
    const trayBox = (trayRef.current ?? tile).getBoundingClientRect();
    // the card is drawn a quarter larger under a finger (styles/touch-sizing.css)
    const scale = touchScale();
    const top = Math.max(
      12,
      Math.min(
        window.innerHeight - 200 * scale,
        tileBox.top + tileBox.height / 2 - 92 * scale,
      ),
    );
    setPreview({ id, top, left: Math.max(tileBox.right, trayBox.right) + PREVIEW_GAP });
  }, []);
  const showPreview = (id: string, tile: HTMLElement, at = PREVIEW_DELAY_MS) => {
    clearPreviewTimer();
    // Moving from one tile to the next swaps the open preview at once.
    if (preview) {
      placePreview(id, tile);
      return;
    }
    previewTimer.current = window.setTimeout(() => placePreview(id, tile), at);
  };
  const hidePreview = (now = false) => {
    clearPreviewTimer();
    if (now) {
      setPreview(null);
      return;
    }
    previewTimer.current = window.setTimeout(() => setPreview(null), PREVIEW_LINGER_MS);
  };
  useEffect(() => () => clearPreviewTimer(), []);

  if (!mounted) return null;
  if (minimized.length === 0) return null;

  const previewed = preview
    ? minimized.find((w) => w.id === preview.id)
    : undefined;

  return (
    <div className="wm-minimized-tray" ref={trayRef} data-testid="minimized-tray">
      {minimized.map((w) => {
        const vibe = w.type === "vibe_window";
        const art = vibe ? vibeArt.get(pageIdOf(w) ?? "") : undefined;
        const restoreRefused = restoreRefusedId === w.id;
        return (
          <button
            key={w.id}
            ref={(node) => {
              if (node) tiles.current.set(w.id, node);
              else tiles.current.delete(w.id);
            }}
            type="button"
            className={`wm-tray-tile${vibe ? " wm-tray-tile--art" : ""}`}
            data-tray-window={w.id}
            data-art-host={vibe ? "" : undefined}
            aria-label={`${w.title} · ${t("tray.rightClickClose")}`}
            onClick={(event) => {
              hidePreview(true);
              noteDockReturn(w.id, event.currentTarget);
              if (w.collaboration) {
                const applied = requestCollaborationShellAction(w.id, "restore");
                setRestoreRefusedId(applied ? null : w.id);
                // A shared window comes back once the canonical restore
                // lands (a round trip): the tile breathes until it goes.
                if (applied) event.currentTarget.setAttribute("data-restoring", "");
                return;
              }
              restoreWindow(w.id);
            }}
            onContextMenu={(e) => {
              // Spec §19.5 — right-click closes the minimized window directly.
              e.preventDefault();
              hidePreview(true);
              if (w.collaboration) {
                // The canvas falls back to a local dismissal when the
                // canonical close is not this member's to send, so this
                // always removes the tile one way or the other.
                requestCollaborationShellAction(w.id, "close");
                return;
              }
              announceUserClosedWindow(w);
              closeWindow(w.id);
            }}
            onPointerEnter={(event) => {
              // A finger has no hover: a tap restores, a hold closes.
              if (event.pointerType === "mouse" || event.pointerType === "pen") {
                showPreview(w.id, event.currentTarget);
              }
            }}
            onPointerLeave={() => hidePreview()}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                showPreview(w.id, event.currentTarget, 0);
              }
            }}
            onBlur={() => hidePreview()}
            data-restore-refused={restoreRefused ? "true" : undefined}
            data-testid="tray-pill"
          >
            {vibe ? (
              <VibePresetArt templateId={art?.templateId} cover={art?.cover} crop />
            ) : (
              <TileFace window={w} />
            )}
          </button>
        );
      })}
      {preview && previewed && typeof document !== "undefined"
        ? createPortal(
            <TrayPreview
              window={previewed}
              art={
                previewed.type === "vibe_window"
                  ? vibeArt.get(pageIdOf(previewed) ?? "")
                  : undefined
              }
              note={
                restoreRefusedId === previewed.id
                  ? t("tray.restoreOwnerOnly")
                  : t("tray.rightClickClose")
              }
              // screen pixels, over the card's own zoom under a finger
              style={{
                top: `calc(${preview.top}px / var(--touch-preview-zoom, 1))`,
                left: `calc(${preview.left}px / var(--touch-preview-zoom, 1))`,
                width: PREVIEW_WIDTH,
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
