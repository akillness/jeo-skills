"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The body of the Reuse Slides task pane (PPT-B029). PowerPoint's Reuse
 * Slides is a pane at the right of the window (Microsoft Support, "Reuse
 * (import) slides from another presentation"): the author browses to a
 * presentation, its slides are listed as thumbnails, a slide goes in at the
 * insertion point (its own right-click Insert Slide, or Insert All Slides for
 * every one), and a Keep source formatting check box at the bottom decides
 * whether a slide keeps its own theme. The presentations here are the
 * notebook's own; a thumbnail click also marks slides for one insertion of
 * several, and double-click inserts that slide alone. The window owns the
 * data and the commands; this component lays them out.
 */

import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useState, type ReactNode } from "react";

import { Loader2 } from "lucide-react";
import { PointerContextMenu } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { Check, ChevronLeft, Square } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

export interface PresentationReuseSlidesPaneLabels {
  readonly browse: string;
  readonly loading: string;
  readonly empty: string;
  readonly untitled: string;
  readonly chooseDeck: string;
  readonly keepSourceFormatting: string;
  readonly insertSlide: string;
  readonly insertAll: string;
  readonly insertSelected: string;
  readonly untitledSlide: string;
}

export interface PresentationReuseSlidesPaneProps {
  readonly labels: PresentationReuseSlidesPaneLabels;
  readonly error: string | null;
  readonly busy: boolean;
  readonly pages: ReadonlyArray<{ readonly id: string; readonly title?: string | null }>;
  readonly sourceTitle: string | null;
  readonly slides: ReadonlyArray<{ readonly id: string; readonly title?: string | null }>;
  readonly selection: ReadonlySet<string>;
  readonly keepSourceFormatting: boolean;
  readonly renderThumbnail: (slideId: string) => ReactNode;
  readonly onChooseDeck: (pageId: string) => void;
  readonly onBack: () => void;
  readonly onToggle: (slideId: string) => void;
  readonly onInsertOne: (slideId: string) => void;
  readonly onInsertSelected: () => void;
  readonly onInsertAll: () => void;
  readonly onKeepSourceFormatting: (keep: boolean) => void;
  /** MRAI's own row (ask the AI about the selection); absent hides it. */
  readonly extraActions?: ReactNode;
  /** Inserted slides still being written into the PowerPoint file (TRIAGE 55):
   * a status line at the pane's foot while it lasts. */
  readonly writingStatus?: string | null;
}






export const REUSE_SLIDES_TEXT_BUTTON_STYLE = {
  width: "auto",
  height: "auto",
  minHeight: 28,
  padding: "4px 10px",
  gap: 5,
  whiteSpace: "nowrap",
  // A flex row's basis beats `width` (PRESENTATION_RIBBON_LABELED_BUTTON_STYLE).
  flexBasis: "auto",
  flexShrink: 0,
} as const;

export function PresentationReuseSlidesPane({
  labels,
  error,
  busy,
  pages,
  sourceTitle,
  slides,
  selection,
  keepSourceFormatting,
  renderThumbnail,
  onChooseDeck,
  onBack,
  onToggle,
  onInsertOne,
  onInsertSelected,
  onInsertAll,
  onKeepSourceFormatting,
  extraActions,
  writingStatus = null,
}: PresentationReuseSlidesPaneProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; slideId: string } | null>(null);
  return (
    <div
      data-testid="presentation-reuse-slides-dialog"
      style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1, fontSize: 12 }}
    >
      {error ? (
        <p role="alert" style={{ color: "#b91c1c", margin: 0 }} data-testid="presentation-reuse-slides-error">
          {error}
        </p>
      ) : null}
      {sourceTitle === null ? (
        <>
          <strong>{labels.browse}</strong>
          {busy && pages.length === 0 ? (
            <EditorLoadingState kind="presentation" minimal label={labels.loading} />
          ) : null}
          {!busy && pages.length === 0 && !error ? (
            <p style={{ margin: 0 }} data-testid="presentation-reuse-slides-empty">
              {labels.empty}
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
            {pages.map((item) => (
              <button
                key={item.id}
                type="button"
                className="office-ribbon-control note-editor-office-toolbar__button"
                data-office-control-part="button"
                style={{ ...REUSE_SLIDES_TEXT_BUTTON_STYLE, justifyContent: "flex-start", width: "100%", padding: "8px 10px", whiteSpace: "normal", textAlign: "start" }}
                disabled={busy}
                onClick={() => onChooseDeck(item.id)}
                data-testid={`presentation-reuse-slides-${item.id}`}
              >
                {item.title || labels.untitled}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="office-ribbon-control note-editor-office-toolbar__button"
              data-office-control-part="button"
              onClick={onBack}
              title={labels.chooseDeck}
              aria-label={labels.chooseDeck}
              data-testid="presentation-reuse-slides-back"
            >
              <ChevronLeft size={14} />
            </button>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sourceTitle || labels.untitled}
            </strong>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0, flex: 1, padding: 2 }}
            data-testid="presentation-reuse-slides-gallery"
          >
            {slides.map((slide, index) => {
              const selected = selection.has(slide.id);
              return (
                <div
                  key={slide.id}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, slideId: slide.id });
                  }}
                >
                  <button
                    type="button"
                    className="office-ribbon-control note-editor-office-toolbar__button"
                    data-office-control-part="button"
                    aria-pressed={selected}
                    onClick={() => onToggle(slide.id)}
                    onDoubleClick={() => onInsertOne(slide.id)}
                    data-testid={`presentation-reuse-slide-${slide.id}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 6,
                      padding: 6,
                      width: "100%",
                      height: "auto",
                      flexBasis: "auto",
                      flexShrink: 0,
                      textAlign: "start",
                      borderColor: selected ? "#d24726" : undefined,
                      background: selected ? "rgba(210,71,38,0.08)" : undefined,
                    }}
                  >
                    {renderThumbnail(slide.id)}
                    <span style={{ display: "flex", gap: 5, fontSize: 11, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ flex: "none" }}>{selected ? <Check size={12} /> : <Square size={12} />}</span>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        {index + 1}. {slide.title || labels.untitledSlide}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {extraActions}
            <button
              type="button"
              className="office-ribbon-control note-editor-office-toolbar__button"
              data-office-control-part="button"
              disabled={busy || slides.length === 0}
              style={REUSE_SLIDES_TEXT_BUTTON_STYLE}
              onClick={onInsertAll}
              data-testid="presentation-reuse-slides-insert-all"
            >
              {labels.insertAll}
            </button>
            <button
              type="button"
              className="office-ribbon-control note-editor-office-toolbar__button"
              data-office-control-part="button"
              disabled={busy || selection.size === 0}
              style={REUSE_SLIDES_TEXT_BUTTON_STYLE}
              onClick={onInsertSelected}
              data-testid="presentation-reuse-slides-insert"
            >
              {labels.insertSelected}
            </button>
          </div>
          {/* PowerPoint keeps Keep source formatting at the bottom of the pane. */}
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <input
              type="checkbox"
              data-testid="presentation-reuse-theme-source"
              checked={keepSourceFormatting}
              onChange={(event) => onKeepSourceFormatting(event.target.checked)}
            />
            {labels.keepSourceFormatting}
          </label>
        </>
      )}
      {writingStatus ? (
        // As PDF's Insert Page dialog says its own long write (PdfInsertPageDialog).
        <div
          className="flex items-start gap-2"
          role="status"
          aria-live="polite"
          data-testid="presentation-reuse-slides-writing"
          style={{ margin: 0 }}
        >
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{writingStatus}</span>
        </div>
      ) : null}
      {menu ? (
        <PointerContextMenu
          x={menu.x}
          y={menu.y}
          label={labels.insertSlide}
          entries={[
            {
              id: "insert-slide",
              label: labels.insertSlide,
              disabled: busy,
              testId: "presentation-reuse-slides-menu-insert",
              onSelect: () => onInsertOne(menu.slideId),
            },
            {
              id: "insert-all",
              label: labels.insertAll,
              disabled: busy,
              testId: "presentation-reuse-slides-menu-insert-all",
              onSelect: onInsertAll,
            },
          ]}
          onClose={() => setMenu(null)}
          testId="presentation-reuse-slides-menu"
        />
      ) : null}
    </div>
  );
}
