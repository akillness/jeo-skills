"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The shared SmartArt insert gallery: one category flyout per Office tab, one
 * card per layout. Every host (Docs, Presentation, Spreadsheet) renders THIS
 * component — it takes its groups, labels and test ids from the host, so no
 * host-specific layout filtering lives inside it.
 *
 * Previews always draw the ACTUAL engine scene ({@link OfficeSmartArtSeedPreview})
 * from the catalog seed and the host's placeholder words
 * (`useOfficeSmartArtPlaceholders`), so the card shows exactly what insertion
 * produces in every editor. There is no host renderer: the three editors draw
 * one card.
 */

import { useEffect } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import { RibbonDropdownMenuSubContent } from "./CupertinoRibbonMenu";

import {
  OfficeSmartArtSeedPreview,
  prefetchOfficeSmartArtSeedPreviews,
} from "./OfficeSmartArtSeedPreview";
import {
  OFFICE_SMARTART_GALLERY_GROUPS,
  type OfficeSmartArtPlaceholders,
} from "../../lib/office-smartart/catalog";
import { useOfficeSmartArtAliasCardWords } from "./officeSmartArtPlaceholders";
// One stylesheet draws both Office insert galleries (chart families and
// SmartArt categories share the trigger / flyout / card chrome).
import styles from "./OfficeInsertGallery.module.css";

export type SmartArtGalleryApplication = "docs" | "presentation" | "spreadsheet";

export interface SmartArtInsertGalleryLayout {
  /**
   * What the card hands `onSelect`: a canonical layout id
   * (`lib/office-smartart/catalog.ts`), or an alias card's
   * `<layout id>@<urn suffix>` (`OfficeSmartArtGalleryCard`).
   */
  id: string;
  /** An alias card's catalog layout and urn, which its preview draws. */
  layoutId?: string;
  layoutUrn?: string;
  /** An alias card's urn suffix, which names it (`smartArtAliasLayoutName_*`). */
  aliasSuffix?: string;
}

export interface SmartArtInsertGalleryGroup {
  id: string;
  layouts: readonly SmartArtInsertGalleryLayout[];
}

export interface OfficeSmartArtInsertGalleryProps {
  application?: SmartArtGalleryApplication;
  disabled: boolean;
  unavailableTitle?: string;
  /** The words the insert seeds, so the card draws what the pick inserts. */
  placeholders: OfficeSmartArtPlaceholders;
  /** The frame the insert lays the diagram out in (the slide, for a deck). */
  previewBounds?: { width: number; height: number };
  categoryLabel: (category: string) => string;
  /** A catalog layout's name and description; an alias card names itself. */
  layoutLabel: (layoutId: string) => string;
  layoutDescription: (layoutId: string) => string;
  /** The card's id: a layout id or an alias card id (`officeSmartArtSeed` reads both). */
  onSelect: (layoutId: string) => void;
  groups?: readonly SmartArtInsertGalleryGroup[];
  layoutTestId?: (layoutId: string) => string;
  testIdPrefix?: string;
}

function SmartArtGalleryPreview({
  placeholders,
  bounds,
  compact = false,
  familyId,
  layoutId,
  layoutUrn,
}: {
  placeholders: OfficeSmartArtPlaceholders;
  bounds?: { width: number; height: number };
  compact?: boolean;
  familyId?: string;
  /** The catalog id this card inserts. */
  layoutId: string;
  /** …drawn as this Office alias of it (an alias card). */
  layoutUrn?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${styles.preview}${compact ? ` ${styles.familyPreview}` : ""}`}
      data-smartart-family-preview={compact ? familyId : undefined}
      data-smartart-menu-preview={compact ? undefined : "true"}
      style={{ overflow: "hidden" }}
    >
      <OfficeSmartArtSeedPreview
        layoutId={layoutId}
        {...(layoutUrn ? { layoutUrn } : {})}
        itemLabel={placeholders.itemLabel}
        rootLabel={placeholders.rootLabel}
        bounds={bounds}
        fit="content"
        labels="lines"
      />
    </span>
  );
}

/**
 * Asks the engine for the category cards while the ribbon shows the SmartArt
 * button, so the menu opens on drawn cards: the engine lays them out on the
 * server, and asked only when the menu opened they arrived seconds later on
 * a busy host -- eight blank tiles in the meantime. Renders nothing.
 */
export function OfficeSmartArtGalleryPrefetch({
  groups = OFFICE_SMARTART_GALLERY_GROUPS,
  placeholders,
  previewBounds,
}: {
  groups?: readonly SmartArtInsertGalleryGroup[];
  placeholders: OfficeSmartArtPlaceholders;
  previewBounds?: { width: number; height: number };
}) {
  const width = previewBounds?.width;
  const height = previewBounds?.height;
  useEffect(() => {
    prefetchOfficeSmartArtSeedPreviews(
      groups.flatMap((group) => {
        const emblem = familyPreviewLayout(group);
        return emblem
          ? [
              {
                layoutId: emblem.layoutId ?? emblem.id,
                ...(emblem.layoutUrn ? { layoutUrn: emblem.layoutUrn } : {}),
                itemLabel: placeholders.itemLabel,
                rootLabel: placeholders.rootLabel,
                bounds: width !== undefined && height !== undefined ? { width, height } : undefined,
              },
            ]
          : [];
      }),
    );
    // The cards' words and frame are what is asked for; a new function
    // identity for the same words asks nothing new (the cache is by content).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, width, height, placeholders.rootLabel]);
  return null;
}

/**
 * The card a category shows beside its name: the layout that reads as the
 * category at icon size. Relationship's first layout (Opposing Arrows) is two
 * thin arrows at 40 px; Basic Venn is the category's emblem.
 */
const FAMILY_EMBLEM_LAYOUT: Readonly<Record<string, string>> = {
  relationship: "venn",
};

function familyPreviewLayout(group: SmartArtInsertGalleryGroup): SmartArtInsertGalleryLayout | undefined {
  const emblem = FAMILY_EMBLEM_LAYOUT[group.id];
  return group.layouts.find((layout) => layout.id === emblem) ?? group.layouts[0];
}

export function OfficeSmartArtInsertGallery(
  props: OfficeSmartArtInsertGalleryProps,
) {
  const application = props.application;
  const groups = props.groups ?? OFFICE_SMARTART_GALLERY_GROUPS;
  const testIdPrefix = props.testIdPrefix ?? "document-toolbar-smartart-menu";
  const aliasWords = useOfficeSmartArtAliasCardWords();
  return (
    <>
      {groups.map((group) => {
        const familyPreview = familyPreviewLayout(group);
        if (!familyPreview) return null;
        const categoryLabel = props.categoryLabel(group.id);
        return (
          <DropdownMenuSub key={group.id}>
            <DropdownMenuSubTrigger
              className={styles.familyTrigger}
              aria-label={categoryLabel}
              data-smartart-gallery-application={application}
              data-testid={`${testIdPrefix}-category-${group.id}`}
              disabled={props.disabled}
              title={props.disabled ? props.unavailableTitle : categoryLabel}
            >
              <SmartArtGalleryPreview
                compact
                familyId={group.id}
                placeholders={props.placeholders}
                bounds={props.previewBounds}
                layoutId={familyPreview.layoutId ?? familyPreview.id}
                layoutUrn={familyPreview.layoutUrn}
              />
              <span className={styles.familyLabel}>{categoryLabel}</span>
            </DropdownMenuSubTrigger>
            <RibbonDropdownMenuSubContent
              className={styles.flyout}
              data-smartart-gallery-application={application}
              data-smartart-gallery-flyout={group.id}
              data-testid={`${testIdPrefix}-flyout-${group.id}`}
            >
              <section className={styles.section} aria-label={categoryLabel}>
                <div className={styles.sectionHeading}>{categoryLabel}</div>
                <div
                  className={styles.grid}
                  data-testid={`${testIdPrefix}-layouts-${group.id}`}
                  role="group"
                  aria-label={categoryLabel}
                >
                  {group.layouts.map((layout) => {
                    const layoutLabel = layout.aliasSuffix
                      ? aliasWords.name(layout.aliasSuffix)
                      : props.layoutLabel(layout.id);
                    const description = layout.aliasSuffix
                      ? aliasWords.description(layout.aliasSuffix)
                      : props.layoutDescription(layout.id);
                    return (
                      <DropdownMenuItem
                        aria-label={layoutLabel}
                        className={styles.card}
                        data-testid={
                          props.layoutTestId?.(layout.id) ??
                          `${testIdPrefix}-layout-${layout.id}`
                        }
                        disabled={props.disabled}
                        key={layout.id}
                        onSelect={() => props.onSelect(layout.id)}
                        title={description}
                      >
                        <SmartArtGalleryPreview
                          placeholders={props.placeholders}
                          bounds={props.previewBounds}
                          layoutId={layout.layoutId ?? layout.id}
                          layoutUrn={layout.layoutUrn}
                        />
                        <span>{layoutLabel}</span>
                        <span hidden data-smartart-menu-description>
                          {description}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </section>
            </RibbonDropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}
