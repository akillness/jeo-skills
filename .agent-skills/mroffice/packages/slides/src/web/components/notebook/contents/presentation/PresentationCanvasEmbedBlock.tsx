"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One embed (video, audio, web) block as the edit canvas draws it.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { normalizeEmbedKind, EMBED_KINDS, presentationOnlineVideo, type PresentationMediaPlaybackSettings } from "@mrnote/core/web/lib/presentation-embed.ts";
import { PresentationEmbedAddressInput } from "./PresentationEmbedAddressInput";
import { PresentationEmbedContent } from "./PresentationMediaContent";
import { withVideoStyle } from "../../../../lib/presentation-video-format";
import { hasLayoutGeometry } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { PresentationMediaControlBar } from "./PresentationMediaControlBar";
import { Trash2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { OfficeVideoStyleId } from "@mrnote/core/web/lib/office-video-styles/catalog.ts";
import type { PresentationBlock, PresentationEmbedBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { Dispatch, SetStateAction } from "react";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationCanvasEmbedBlockCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  videoStylePreview: { blockId: string; styleId: OfficeVideoStyleId; } | null;
  mediaControlBarInside: (block: PresentationBlock) => boolean;
  deckThemeGridColors: Readonly<Record<"accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6" | "bg1" | "tx1" | "bg2" | "tx2", string>>;
  contextualMediaBlock: PresentationEmbedBlock | null;
  contextualMediaKind: "iframe" | "video" | "audio" | null;
  contextualMediaPlaybackSettings: PresentationMediaPlaybackSettings | null;
  deleteBlock: (blockId: string) => void;
  updateEmbedBlock: (blockId: string, patch: Partial<PresentationEmbedBlock>) => void;
  selectedMediaBookmark: { blockId: string; name: string; } | null;
  setSelectedMediaBookmark: Dispatch<SetStateAction<{ blockId: string; name: string; } | null>>;
  canvasMediaElement: (blockId: string) => HTMLMediaElement | null;
  block: PresentationEmbedBlock;
}

export function PresentationCanvasEmbedBlock({ ctl }: { ctl: PresentationCanvasEmbedBlockCtl }) {
  const {
    t,
    videoStylePreview,
    mediaControlBarInside,
    deckThemeGridColors,
    contextualMediaBlock,
    contextualMediaKind,
    contextualMediaPlaybackSettings,
    deleteBlock,
    updateEmbedBlock,
    selectedMediaBookmark,
    setSelectedMediaBookmark,
    canvasMediaElement,
    block,
  } = ctl;
  const assetBacked = (block as { sourceKind?: unknown }).sourceKind === "asset";
  return (
                    <div
                      className="presentation-window__embed-block"
                      data-testid="presentation-embed-block"
                      data-embed-kind={normalizeEmbedKind(block.kind)}
                    >
                      <div className="presentation-window__embed-preview">
                        <PresentationEmbedContent
                          block={
                            videoStylePreview?.blockId === block.id
                              ? (withVideoStyle(block, videoStylePreview.styleId) ?? block)
                              : block
                          }
                          fillParent={hasLayoutGeometry(block)}
                          interactive={false}
                          t={t}
                          themeColors={deckThemeGridColors}
                        />
                      </div>
                      {contextualMediaBlock?.id === block.id &&
                      contextualMediaPlaybackSettings &&
                      contextualMediaKind !== "iframe" &&
                      // An online video plays in its provider's player, with
                      // that player's controls; the bar drives a clip only.
                      !presentationOnlineVideo(block) &&
                      hasLayoutGeometry(block) ? (
                        // PowerPoint's media control bar under the selected
                        // clip (PPT-A157): as wide as the clip, on its lower
                        // edge. A clip that reaches the slide's foot keeps
                        // the bar inside its own frame, on the slide.
                        <div
                          data-testid="presentation-media-control-bar-anchor"
                          data-placement={
                            mediaControlBarInside(block) ? "inside" : "below"
                          }
                          style={{
                            left: 0,
                            position: "absolute",
                            right: 0,
                            ...(mediaControlBarInside(block)
                              ? { bottom: 0 }
                              : { top: "calc(100% + 2px)" }),
                            zIndex: 2,
                          }}
                        >
                          <PresentationMediaControlBar
                            mediaKey={block.id}
                            getMedia={() => canvasMediaElement(block.id)}
                            bookmarks={contextualMediaPlaybackSettings.bookmarks}
                            selectedBookmarkName={
                              selectedMediaBookmark?.blockId === block.id
                                ? selectedMediaBookmark.name
                                : null
                            }
                            onSelectBookmark={(name) =>
                              setSelectedMediaBookmark(
                                name ? { blockId: block.id, name } : null,
                              )
                            }
                            labels={{
                              play: t("presentation.media.controlPlay"),
                              pause: t("presentation.media.controlPause"),
                              position: t("presentation.media.controlBar"),
                              back: t("presentation.media.controlBack"),
                              forward: t("presentation.media.controlForward"),
                              mute: t("presentation.media.controlMute"),
                              unmute: t("presentation.media.controlUnmute"),
                              volume: t("presentation.media.controlVolume"),
                            }}
                          />
                        </div>
                      ) : null}
                      {!hasLayoutGeometry(block) ? (
                        <>
                          <select
                            value={normalizeEmbedKind(block.kind)}
                            // A stored clip is its kind.
                            disabled={assetBacked}
                            onChange={(event) =>
                              updateEmbedBlock(block.id, {
                                kind: normalizeEmbedKind(event.target.value),
                              })
                            }
                            aria-label={t("presentation.embedKindLabel")}
                            data-testid="presentation-embed-kind"
                          >
                            {EMBED_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {t(`presentation.embed.kind.${kind}`)}
                              </option>
                            ))}
                          </select>
                          <PresentationEmbedAddressInput
                            kind={block.kind}
                            url={block.url}
                            disabled={assetBacked}
                            placeholder={t("presentation.embedUrlPlaceholder")}
                            onCommit={(url) => updateEmbedBlock(block.id, { url })}
                          />
                          <input
                            value={block.title || ""}
                            onChange={(event) =>
                              updateEmbedBlock(block.id, {
                                title: event.target.value,
                              })
                            }
                            placeholder={t(
                              "presentation.embedTitlePlaceholder",
                            )}
                            data-testid="presentation-embed-title"
                          />
                          <button
                            type="button"
                            onClick={() => deleteBlock(block.id)}
                            data-testid="presentation-delete-block"
                          >
                            <Trash2 size={13} />
                            {t("presentation.deleteBlock")}
                          </button>
                        </>
                      ) : null}
                    </div>
  );
}
