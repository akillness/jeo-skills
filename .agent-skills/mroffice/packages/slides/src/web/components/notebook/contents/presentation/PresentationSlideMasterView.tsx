"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Slide Master view's body (PPT-B030): PowerPoint's thumbnail pane -- "the
 * slide master is always the top thumbnail, and the other slide layouts are
 * beneath it" (Microsoft Support, "Edit and re-apply a slide layout") -- and
 * the selected master or layout drawn at stage size. The window builds each
 * card's preview with the slide renderer and owns what selecting one means;
 * this component only lays them out and reports the pick.
 */

import type { ReactNode } from "react";

import styles from "./PresentationSlideMasterView.module.css";

export interface PresentationSlideMasterViewCard {
  readonly key: string;
  readonly kind: "master" | "layout";
  /** The name a hover shows: the master's or the layout's. */
  readonly label: string;
  /** "Used by N slides", as PowerPoint's hover says. */
  readonly usage: string;
  readonly preview: ReactNode;
}

export interface PresentationSlideMasterViewProps {
  readonly cards: readonly PresentationSlideMasterViewCard[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
  readonly treeLabel: string;
  /** The selected card at stage size. */
  readonly stage: ReactNode;
}

export function PresentationSlideMasterView({
  cards,
  selectedKey,
  onSelect,
  treeLabel,
  stage,
}: PresentationSlideMasterViewProps) {
  const selected = cards.find((card) => card.key === selectedKey) ?? cards[0];
  return (
    <div className={styles.view} data-testid="presentation-master-view-office">
      <div
        className={styles.tree}
        role="listbox"
        aria-label={treeLabel}
        data-testid="presentation-master-view-tree"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const index = cards.findIndex((card) => card.key === selected?.key);
          const next = cards[index + (event.key === "ArrowDown" ? 1 : -1)];
          if (next) onSelect(next.key);
        }}
      >
        {cards.map((card, index) => {
          const isSelected = card.key === selected?.key;
          // Masters are numbered 1, 2, ... in the pane, as PowerPoint numbers
          // each master above its layouts (PPT-B030).
          const masterNumber = cards.slice(0, index + 1).filter((candidate) => candidate.kind === "master").length;
          return (
            <button
              key={card.key}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={styles.card}
              data-kind={card.kind}
              data-testid={
                card.kind === "master"
                  ? "presentation-master-view-master"
                  : "presentation-master-view-layout"
              }
              data-layout-id={card.kind === "layout" ? card.key : undefined}
              data-master-key={card.kind === "master" ? card.key : undefined}
              title={`${card.label}: ${card.usage}`}
              onClick={() => onSelect(card.key)}
            >
              <span className={styles.cardIndex}>{card.kind === "master" ? masterNumber : ""}</span>
              <span className={styles.cardPreview}>{card.preview}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.stage} data-testid="presentation-master-view-stage">
        <div className={styles.stageFrame}>{stage}</div>
        {selected ? (
          <span className={styles.stageCaption} data-testid="presentation-master-view-caption">
            {`${selected.label}: ${selected.usage}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
