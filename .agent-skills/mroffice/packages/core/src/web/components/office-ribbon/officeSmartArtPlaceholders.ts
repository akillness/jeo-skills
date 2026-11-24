"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import { useTranslations } from "../../../host/next-intl";

import type { OfficeSmartArtPlaceholders } from "../../lib/office-smartart/catalog";
import type { OfficeSmartArtDesignTabLabels } from "./OfficeSmartArtDesignTab";
import type { OfficeSmartArtTextPaneLabels } from "./OfficeSmartArtTextPane";
import type { OfficeSmartArtContextMenuLabels } from "./OfficeSmartArtContextMenu";

/**
 * The SmartArt words every MRAI editor shows, from ONE set of keys. Kept in
 * its own module (type-only imports) so the worksheet can call it without
 * loading the gallery chunk.
 */

/**
 * The placeholder words every editor seeds: "Item {index}" for an item and
 * "Main idea" for a layout whose first item is the tree root.
 *
 * Docs used to seed "Item n" with "Item 1" as its root, the worksheet "Item n"
 * with "Main idea", the deck its own "条目 n" key, and the gallery cards drew a
 * fourth word ("Text") — so the card a user picked never showed what the pick
 * inserted, and a diagram read differently in each editor.
 */
/**
 * The words an inserted graphic's shapes start with: NONE, as Office inserts
 * them (Microsoft Support, "Create a SmartArt graphic from scratch": the
 * graphic comes with placeholder text to replace). Office's placeholder is
 * the `[Text]` PROMPT of an empty point (`dgm:prSet phldr="1"`), which every
 * editor draws over an empty shape and its Text Pane row, and which is never
 * saved, exported, printed or drawn in a thumbnail. MRAI used to seed real
 * words ("项目 1", "中心主题") that were saved and exported as the author's.
 * The same empty words name an imported diagram's empty points and the
 * gallery's cards, whose shapes Office's gallery shows without words.
 */
const EMPTY_SMARTART_PLACEHOLDERS: OfficeSmartArtPlaceholders = Object.freeze({
  itemLabel: () => "",
  rootLabel: "",
});

export function useOfficeSmartArtPlaceholders(): OfficeSmartArtPlaceholders {
  return EMPTY_SMARTART_PLACEHOLDERS;
}

/**
 * The name and description of an Insert gallery ALIAS card (an Office alias
 * PowerPoint lists as a layout of its own: Continuous Block Process beside
 * Basic Process), by its urn suffix: the same name Change Layout gives it.
 * Read by the shared gallery itself, so no host maps an alias card's id.
 */
export function useOfficeSmartArtAliasCardWords(): {
  readonly name: (suffix: string) => string;
  readonly description: (suffix: string) => string;
} {
  const t = useTranslations("console-notebooks");
  return useMemo(
    () => ({
      name: (suffix: string) =>
        t(`toolbar.smartArtAliasLayoutName_${suffix}` as "toolbar.smartArtAliasLayoutName_hProcess9"),
      description: (suffix: string) =>
        t(`toolbar.smartArtAliasLayoutDesc_${suffix}` as "toolbar.smartArtAliasLayoutDesc_hProcess9"),
    }),
    [t],
  );
}

/**
 * Every word of the SmartArt Design tab (`OfficeSmartArtDesignTab`).
 *
 * Docs read `toolbar.smartartContext.*` and the deck and the worksheet
 * `presentation.smartartContext.*`: two translations of one tab. They had
 * drifted — the deck titled its Layouts group with the SLIDE-layout word
 * ("幻灯片版式", "スライドのレイアウト"), and Japanese Docs named the quick
 * styles with words that are not Office's ("パステル" for Subtle Effect). One
 * set now: the tab's own keys where both existed, the Docs-only keys (picture
 * slots, the group captions) where only Docs had them.
 */
export function useOfficeSmartArtDesignLabels(): OfficeSmartArtDesignTabLabels {
  const t = useTranslations("console-notebooks");
  return useMemo(
    () => ({
      createGraphicGroup: t("presentation.smartartContext.createGraphicGroup"),
      convertToEditable: t("presentation.smartartContext.convertToEditable"),
      layoutsGroupLabel: t("toolbar.smartartContext.layoutsGroupLabel"),
      layoutCategoryName: (category) =>
        t(`toolbar.smartArtCategory_${category}` as "toolbar.smartArtCategory_list"),
      layoutsGroup: t("presentation.smartartContext.layoutsGroup"),
      layoutName: (layout) =>
        t(layout.nameKey as "toolbar.smartArtLayoutName_basic-list"),
      // An aligned Office alias under its own Office name (PowerPoint's).
      aliasLayoutName: (suffix) =>
        t(`toolbar.smartArtAliasLayoutName_${suffix}` as "toolbar.smartArtAliasLayoutName_hProcess9"),
      pictureLayoutPreserveReason: t(
        "presentation.smartartContext.pictureLayoutPreserveReason",
      ),
      currentLayoutUnavailable: t(
        "presentation.smartartContext.currentLayoutUnavailable",
      ),
      insertPicture: t("toolbar.smartartContext.insertPicture"),
      pictureSlotName: (slot) =>
        t(
          slot.filled
            ? "toolbar.smartartContext.pictureSlotFilled"
            : "toolbar.smartartContext.pictureSlotEmpty",
          { index: slot.ordinal },
        ),
      pictureSlotUnexportable: t(
        "toolbar.smartartContext.pictureSlotUnexportable",
      ),
      quickOverflow: t("toolbar.quickOverflow"),
      textPane: t("presentation.smartartContext.textPane"),
      addShape: t("presentation.smartartContext.addShape"),
      addShapeAfter: t("presentation.smartartContext.addShapeAfter"),
      addShapeBefore: t("presentation.smartartContext.addShapeBefore"),
      addShapeAbove: t("presentation.smartartContext.addShapeAbove"),
      addShapeBelow: t("presentation.smartartContext.addShapeBelow"),
      addAssistant: t("presentation.smartartContext.addAssistant"),
      addBullet: t("presentation.smartartContext.addBullet"),
      addAssistantUnavailable: t(
        "presentation.smartartContext.addAssistantUnavailable",
      ),
      addAssistantNotOrgChart: t(
        "presentation.smartartContext.addAssistantNotOrgChart",
      ),
      orgChartLayout: t("presentation.smartartContext.orgChartLayout"),
      orgChartLayoutStandard: t("presentation.smartartContext.orgChartLayoutStandard"),
      orgChartLayoutBoth: t("presentation.smartartContext.orgChartLayoutBoth"),
      orgChartLayoutLeftHanging: t("presentation.smartartContext.orgChartLayoutLeftHanging"),
      orgChartLayoutRightHanging: t("presentation.smartartContext.orgChartLayoutRightHanging"),
      orgChartLayoutNotOrgChart: t("presentation.smartartContext.orgChartLayoutNotOrgChart"),
      moveUp: t("presentation.smartartContext.moveUp"),
      moveDown: t("presentation.smartartContext.moveDown"),
      convert: t("presentation.smartartContext.convert"),
      convertToShapes: t("presentation.smartartContext.convertToShapes"),
      convertToText: t("presentation.smartartContext.convertToText"),
      readOnlyReason: t("presentation.smartartContext.readOnlyReason"),
      noShapeSelectedReason: t(
        "presentation.smartartContext.noShapeSelectedReason",
      ),
      commandUnavailableReason: t(
        "presentation.smartartContext.commandUnavailableReason",
      ),
      nativeStructureUnavailable: t(
        "presentation.smartartContext.menu.nativeStructureUnavailable",
      ),
      shapesGroup: t("presentation.smartartContext.shapesGroup"),
      larger: t("presentation.smartartContext.larger"),
      smaller: t("presentation.smartartContext.smaller"),
      promote: t("presentation.smartartContext.promote"),
      demote: t("presentation.smartartContext.demote"),
      rightToLeft: t("presentation.smartartContext.rightToLeft"),
      stylesGroup: t("presentation.smartartContext.stylesGroup"),
      changeColors: t("presentation.smartartContext.changeColors"),
      colorName: (variant) =>
        t(
          `presentation.smartartContext.color.${variant.name}` as "presentation.smartartContext.color.coloredFill",
          {
            accent: variant.accent ?? 0,
            from: variant.from ?? 0,
            to: variant.to ?? 0,
          },
        ),
      colorGroupName: (group) =>
        group.accent !== undefined
          ? t("presentation.smartartContext.colorGroup.accent", {
              accent: group.accent,
            })
          : t(
              `presentation.smartartContext.colorGroup.${group.id}` as "presentation.smartartContext.colorGroup.primary",
            ),
      styleName: (styleId) =>
        t(
          `presentation.smartartContext.style.${styleId}` as "presentation.smartartContext.style.simple1",
        ),
      styleSection: (sectionId) =>
        t(
          `presentation.smartartContext.styleSection.${sectionId}` as "presentation.smartartContext.styleSection.bestMatch",
        ),
      resetGroupLabel: t("toolbar.smartartContext.resetGroupLabel"),
      resetGraphic: t("presentation.smartartContext.resetGraphic"),
      propertiesGroup: t("presentation.smartartContext.propertiesGroup"),
      altText: t("presentation.smartartContext.altText"),
    }),
    [t],
  );
}

/** The SmartArt right-click menu's own words (`OfficeSmartArtContextMenu`). */
export function useOfficeSmartArtContextMenuLabels(): OfficeSmartArtContextMenuLabels {
  const t = useTranslations("console-notebooks");
  return useMemo(
    () => ({
      menu: t("presentation.smartartContext.menu.label"),
      cut: t("presentation.smartartContext.menu.cut"),
      copy: t("presentation.smartartContext.menu.copy"),
      paste: t("presentation.smartartContext.menu.paste"),
      editText: t("presentation.smartartContext.menu.editText"),
      changeLayout: t("presentation.smartartContext.menu.changeLayout"),
      showTextPane: t("presentation.smartartContext.menu.showTextPane"),
      hideTextPane: t("presentation.smartartContext.menu.hideTextPane"),
      bringToFront: t("presentation.smartartContext.menu.bringToFront"),
      sendToBack: t("presentation.smartartContext.menu.sendToBack"),
      sizeAndPosition: t("presentation.smartartContext.menu.sizeAndPosition"),
      formatObject: t("presentation.smartartContext.menu.formatObject"),
      formatShape: t("presentation.smartartContext.menu.formatShape"),
      changePicture: t("presentation.pictureRibbon.changePicture"),
      resetShape: t("presentation.smartartContext.menu.resetShape"),
      nativeStructureUnavailable: t(
        "presentation.smartartContext.menu.nativeStructureUnavailable",
      ),
    }),
    [t],
  );
}

/**
 * The Text Pane's words (`OfficeSmartArtTextPane`). The deck and the worksheet
 * built "Delete Item n" by gluing two keys together, which no language but
 * English orders that way; Docs had whole sentences for it.
 */
export function useOfficeSmartArtTextPaneLabels(): OfficeSmartArtTextPaneLabels {
  const t = useTranslations("console-notebooks");
  return useMemo(
    () => ({
      title: t("toolbar.smartartContext.textPaneTitle"),
      close: t("toolbar.smartartContext.textPaneClose"),
      item: (n: number) => t("toolbar.smartartContext.textPaneItem", { n }),
      deleteItem: (n: number) =>
        t("toolbar.smartartContext.textPaneDeleteItem", { n }),
      placeholder: t("toolbar.smartartContext.textPanePlaceholder"),
      toolbar: {
        add: t("toolbar.smartartContext.textPaneAdd"),
        remove: t("toolbar.smartartContext.textPaneRemove"),
        promote: t("toolbar.smartartContext.textPanePromote"),
        demote: t("toolbar.smartartContext.textPaneDemote"),
        moveDown: t("toolbar.smartartContext.textPaneMoveDown"),
        moveUp: t("toolbar.smartartContext.textPaneMoveUp"),
      },
      menu: {
        label: t("toolbar.smartartContext.textPaneTitle"),
        cut: t("presentation.smartartContext.menu.cut"),
        copy: t("presentation.smartartContext.menu.copy"),
      },
    }),
    [t],
  );
}
