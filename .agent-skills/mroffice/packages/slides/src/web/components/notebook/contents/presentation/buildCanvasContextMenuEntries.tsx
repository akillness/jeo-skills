/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The entries of the slide canvas's right-click menu (empty canvas).
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import type { PointerContextMenuEntry, PointerContextMenuAction } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { officeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import { IconNewSlide, IconDuplicateSlide, IconSlideShowHideSlide } from "../PresentationRibbonIcons";
import { presentationDesktopShortcutLabel } from "../../../../lib/presentation-desktop-shortcuts";
import { presentationSlideLayoutCommandsAreWritable } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { RefObject } from "react";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { PresentationCommandAdapter, PresentationSlideVisibilityCommandAdapter } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import type { PresentationViewAidCommandAuthority, ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { LayoutDefinition } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type { PresentationViewAidKind } from "@mrnote/core/web/lib/presentation-feature-capabilities.ts";
import {
  PRESENTATION_GRID_SPACING_PRESETS,
  type PresentationViewSettings,
} from "@mrnote/core/web/lib/presentation-grid.ts";

/** The window bindings this reads, passed through unchanged. */
export interface BuildCanvasContextMenuEntriesCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  openBackgroundPane: () => void;
  /** Display smart guides when shapes are aligned, the deck's own. */
  smartGuidesOn: boolean;
  /** View > Grid Settings > Snap objects to grid, the deck's own. */
  snapToGrid: boolean;
  /** View > Grid Settings > Snap objects to other objects. */
  snapToObjects: boolean;
  /** Opens View > Grid Settings…. */
  openGridSettings: () => void;
  /** The grid's spacing, EMU. */
  gridSpacingEmu: number;
  applyViewSettings: (patch: Partial<PresentationViewSettings>) => void;
  slides: SlideModel[];
  clipboardHasContent: boolean;
  showRuler: boolean;
  showGridlines: boolean;
  showGuides: boolean;
  activeIndexRef: RefObject<number>;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  activeSlide: SlideModel;
  activeLayoutChoiceIsWritable: (layoutValue: string) => boolean;
  duplicateSlideCommand: PresentationCommandAdapter<"slides.duplicate">;
  deleteSlideAtIndex: (index: number) => boolean;
  slideVisibilityCommand: PresentationSlideVisibilityCommandAdapter;
  viewAidCommandAuthority: PresentationViewAidCommandAuthority;
  pasteBlocks: () => boolean;
  presentationLayoutListName: (layout: { id: string; nameKey: string; }) => string;
  deckLayoutDefinitions: LayoutDefinition[];
  togglePresentationViewAid: (kind: PresentationViewAidKind) => void;
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
  toggleActiveSlideVisibility: () => void;
  executeHomeLayout: (layoutId: string) => void;
  contextMenuSeparator: (id: string) => PointerContextMenuEntry;
  contextMenuNewCommentEntry: () => PointerContextMenuAction;
  desktopMenuLabel: (key: string) => string;
  contextMenuSlideShowEntry: () => PointerContextMenuAction;
  contextMenuZoomEntry: () => PointerContextMenuAction;
}

export function buildCanvasContextMenuEntries(ctl: BuildCanvasContextMenuEntriesCtl) {
  const {
    t,
    openBackgroundPane,
    smartGuidesOn,
    snapToGrid,
    snapToObjects,
    openGridSettings,
    gridSpacingEmu,
    applyViewSettings,
    slides,
    clipboardHasContent,
    showRuler,
    showGridlines,
    showGuides,
    activeIndexRef,
    autosave,
    activeSlide,
    activeLayoutChoiceIsWritable,
    duplicateSlideCommand,
    deleteSlideAtIndex,
    slideVisibilityCommand,
    viewAidCommandAuthority,
    pasteBlocks,
    presentationLayoutListName,
    deckLayoutDefinitions,
    togglePresentationViewAid,
    featureDecision,
    executePresentationFeature,
    toggleActiveSlideVisibility,
    executeHomeLayout,
    contextMenuSeparator,
    contextMenuNewCommentEntry,
    desktopMenuLabel,
    contextMenuSlideShowEntry,
    contextMenuZoomEntry,
  } = ctl;
  const canvasContextMenuEntries = (): PointerContextMenuEntry[] => {
    const readOnly = autosave.readOnly;
    const hidden = isSlideHidden(activeSlide);
    return [
      {
        id: "cut",
        label: t("toolbar.cut"),
        icon: officeContextMenuIcon("cut"),
        shortcut: officeShortcut("cut"),
        disabled: true,
        disabledReason: t("presentation.altTextPane.noObject"),
        testId: "presentation-context-cut",
        onSelect: () => undefined,
      },
      {
        id: "copy",
        label: t("presentation.contextMenu.copy"),
        icon: officeContextMenuIcon("copy"),
        shortcut: officeShortcut("copy"),
        disabled: true,
        disabledReason: t("presentation.altTextPane.noObject"),
        testId: "presentation-context-copy",
        onSelect: () => undefined,
      },
      {
        id: "paste",
        label: t("presentation.contextMenu.paste"),
        icon: officeContextMenuIcon("paste"),
        shortcut: officeShortcut("paste"),
        disabled: !clipboardHasContent,
        disabledReason: t("presentation.contextMenu.clipboardEmpty"),
        testId: "presentation-context-paste",
        onSelect: () => {
          pasteBlocks();
        },
      },
      contextMenuSeparator("slides"),
      {
        id: "new-slide",
        label: t("presentation.addSlide"),
        icon: <IconNewSlide home size={16} />,
        shortcut: presentationDesktopShortcutLabel("newSlide"),
        disabled: !featureDecision("slides.new").enabled,
        testId: "presentation-context-new-slide",
        onSelect: () => executePresentationFeature("slides.new"),
      },
      {
        id: "duplicate-slide",
        label: t("presentation.duplicateSlide"),
        icon: <IconDuplicateSlide home size={16} />,
        shortcut: presentationDesktopShortcutLabel("duplicateSlide"),
        disabled: !featureDecision(duplicateSlideCommand.featureId).enabled,
        testId: "presentation-context-duplicate-slide",
        onSelect: () => executePresentationFeature(duplicateSlideCommand.featureId),
      },
      {
        id: "delete-slide",
        label: t("presentation.deleteSlide"),
        icon: officeContextMenuIcon("delete"),
        disabled: readOnly || slides.length <= 1,
        testId: "presentation-context-delete-slide",
        onSelect: () => deleteSlideAtIndex(activeIndexRef.current),
      },
      contextMenuSeparator("hide-slide"),
      {
        id: "hide-slide",
        label: hidden ? desktopMenuLabel("unhideSlide") : t("presentation.hideSlide"),
        icon: <IconSlideShowHideSlide home size={16} />,
        disabled: !slideVisibilityCommand.canExecute(),
        testId: "presentation-context-hide-slide",
        onSelect: toggleActiveSlideVisibility,
      },
      contextMenuSeparator("layout"),
      {
        // PowerPoint for Windows' Layout ▸ on the same menu.
        id: "layout-menu",
        label: t("presentation.layoutLabel"),
        icon: officeContextMenuIcon("layout"),
        disabled: !presentationSlideLayoutCommandsAreWritable(activeSlide),
        testId: "presentation-context-layout-menu",
        onSelect: () => undefined,
        submenu: deckLayoutDefinitions.map((layout) => ({
          id: `layout-${layout.id}`,
          label: presentationLayoutListName(layout),
          icon: officeContextMenuIcon("layout"),
          disabled: !activeLayoutChoiceIsWritable(layout.id),
          testId: `presentation-context-layout-${layout.id}`,
          onSelect: () => {
            executeHomeLayout(layout.id);
          },
        })),
      },
      contextMenuSeparator("view-aids"),
      {
        id: "ruler",
        label: t("toolbar.ruler"),
        icon: officeContextMenuIcon("ruler"),
        checked: showRuler,
        testId: "presentation-context-ruler",
        onSelect: () => togglePresentationViewAid("ruler"),
      },
      {
        id: "grid-and-guides",
        label: desktopMenuLabel("gridAndGuides"),
        icon: officeContextMenuIcon("table"),
        disabled: !viewAidCommandAuthority.isEnabled(),
        testId: "presentation-context-grid-and-guides",
        onSelect: () => undefined,
        submenu: [
          {
            id: "smart-guides",
            label: desktopMenuLabel("smartGuides"),
            checked: smartGuidesOn,
            testId: "presentation-context-smart-guides",
            onSelect: () => applyViewSettings({ smartGuides: !smartGuidesOn }),
          },
          {
            id: "snap-to-grid",
            label: t("presentation.view.snapToGrid"),
            checked: snapToGrid,
            testId: "presentation-context-snap-to-grid",
            onSelect: () => applyViewSettings({ snapToGrid: !snapToGrid }),
          },
          {
            id: "snap-to-objects",
            label: t("presentation.gridSettings.snapToObjects"),
            checked: snapToObjects,
            testId: "presentation-context-snap-to-objects",
            onSelect: () => applyViewSettings({ snapToObjects: !snapToObjects }),
          },
          {
            id: "guides",
            label: t("presentation.view.guides"),
            checked: showGuides,
            testId: "presentation-context-guides",
            onSelect: () => togglePresentationViewAid("guides"),
          },
          {
            id: "gridlines",
            label: t("presentation.view.gridlines"),
            checked: showGridlines,
            testId: "presentation-context-gridlines",
            onSelect: () => togglePresentationViewAid("gridlines"),
          },
          {
            id: "grid-settings",
            label: t("presentation.gridSettings.menuItem"),
            testId: "presentation-context-grid-settings",
            onSelect: openGridSettings,
          },
        ],
      },
      {
        // Grid Settings' Spacing (PowerPoint's dialog list), its own
        // submenu: this menu opens one level of submenus.
        id: "grid-spacing",
        label: t("presentation.view.gridSpacing"),
        icon: officeContextMenuIcon("table"),
        disabled: !viewAidCommandAuthority.isEnabled(),
        testId: "presentation-context-grid-spacing",
        onSelect: () => undefined,
        submenu: PRESENTATION_GRID_SPACING_PRESETS.map((preset) => ({
          id: `grid-spacing-${preset.emu}`,
          label: preset.label,
          checked: preset.emu === gridSpacingEmu,
          testId: `presentation-context-grid-spacing-${preset.emu}`,
          onSelect: () => applyViewSettings({ gridSpacingEmu: preset.emu }),
        })),
      },
      contextMenuZoomEntry(),
      contextMenuSeparator("background"),
      {
        id: "format-background",
        label: t("presentation.contextMenu.formatBackground"),
        icon: officeContextMenuIcon("background"),
        testId: "presentation-context-format-background",
        onSelect: openBackgroundPane,
      },
      contextMenuSeparator("slide-show"),
      contextMenuSlideShowEntry(),
      contextMenuSeparator("comment"),
      contextMenuNewCommentEntry(),
    ];
  };
  return canvasContextMenuEntries;
}
