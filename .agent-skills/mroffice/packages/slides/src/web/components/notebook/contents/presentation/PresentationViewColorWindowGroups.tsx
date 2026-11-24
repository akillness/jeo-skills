"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * View ▸ Color/Grayscale and View ▸ Window (PPT-A109), the groups desktop
 * PowerPoint puts after Zoom.
 *
 * Color/Grayscale: Color, Grayscale, Pure Black and White. PowerPoint uses
 * them to see how slides read printed or projected without colour; they
 * change only what the editor shows, never the deck. Here they are a preview
 * of the slide and the thumbnails (presentation-view-color-mode.ts). In
 * Grayscale and Pure Black and White the group offers PowerPoint's Change
 * Selected Object gallery (Automatic, Grayscale, Light Grayscale ... Don't
 * Show): how the selected objects render in those views, kept on each object
 * (presentation-black-white-mode.ts); Color is PowerPoint's Back To Color View.
 *
 * Window: New Window, Arrange All, Cascade and Switch Windows over this
 * deck's windows in the workspace, with the shared Office window commands
 * the Spreadsheet and Code editors use (lib/office-window-commands). Move
 * Split has no counterpart: a slide window has no split panes.
 */
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import type { PresentationViewColorMode } from "@mrnote/core/web/lib/presentation/presentation-view-color-mode.ts";
import {
  PRESENTATION_BLACK_WHITE_MODES,
  type PresentationBlackWhiteMode,
} from "@mrnote/core/web/lib/presentation/presentation-black-white-mode.ts";

export interface PresentationViewWindowChoice {
  readonly id: string;
  readonly title: string;
  readonly current: boolean;
}

export function PresentationViewColorWindowGroups({
  labels,
  colorMode,
  onColorMode,
  windows,
  selectedObject,
}: {
  readonly labels: {
    readonly colorGroup: string;
    readonly color: string;
    readonly grayscale: string;
    readonly pureBlackAndWhite: string;
    readonly windowGroup: string;
    readonly newWindow: string;
    readonly arrangeAll: string;
    readonly cascade: string;
    readonly switchWindows: string;
    readonly windowsUnavailable: string;
  };
  readonly colorMode: PresentationViewColorMode;
  readonly onColorMode: (mode: PresentationViewColorMode) => void;
  /**
   * Change Selected Object (PPT-A109): the selection's mode (null when the
   * selected objects differ) and its writer; `disabledReason` when nothing
   * that takes a mode is selected.
   */
  readonly selectedObject?: {
    readonly label: string;
    readonly modeLabels: Readonly<Record<PresentationBlackWhiteMode, string>>;
    readonly mode: PresentationBlackWhiteMode | null;
    readonly disabledReason?: string;
    readonly onChange: (mode: PresentationBlackWhiteMode) => void;
  };
  /** Null when the editor is not in a workspace window (a guest, a preview). */
  readonly windows: {
    readonly choices: () => readonly PresentationViewWindowChoice[];
    readonly onNewWindow: () => void;
    readonly onArrangeAll: () => void;
    readonly onCascade: () => void;
    readonly onSwitch: (id: string) => void;
  } | null;
}) {
  const unavailable = windows === null;
  const reason = unavailable ? labels.windowsUnavailable : undefined;
  return (
    <>
      <OfficeHomeRibbonGroup
        label={labels.colorGroup}
        ribbon="view"
        testId="presentation-ribbon-view-color-group"
      >
        <OfficeHomeCommandRow>
          {(
            [
              ["color", labels.color, "view.lightMode"],
              ["grayscale", labels.grayscale, "image.color"],
              ["blackWhite", labels.pureBlackAndWhite, "view.darkMode"],
            ] as const
          ).map(([mode, label, icon]) => (
            <OfficeHomeCommand
              key={mode}
              variant="large"
              active={colorMode === mode}
              icon={<OfficeSemanticIcon semanticId={icon} size={24} />}
              label={label}
              onClick={() => onColorMode(mode)}
              controlId={`PPTCTL.RIBBON.VIEW.COLOR.${mode.toUpperCase()}`}
              testId={`presentation-ribbon-view-color-${mode}`}
            />
          ))}
          {selectedObject && colorMode !== "color" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger
                  variant="large"
                  hasMenuIndicator
                  icon={<OfficeSemanticIcon semanticId="image.color" size={24} />}
                  label={selectedObject.label}
                  disabled={selectedObject.disabledReason !== undefined}
                  disabledReason={selectedObject.disabledReason}
                  controlId="PPTCTL.RIBBON.VIEW.COLOR.CHANGE_SELECTED_OBJECT"
                  testId="presentation-ribbon-view-bw-object"
                />
              </DropdownMenuTrigger>
              <RibbonDropdownMenuContent align="start" data-testid="presentation-ribbon-view-bw-object-menu">
                {PRESENTATION_BLACK_WHITE_MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode}
                    role="menuitemradio"
                    aria-checked={selectedObject.mode === mode}
                    onSelect={() => selectedObject.onChange(mode)}
                    data-testid={`presentation-ribbon-view-bw-object-${mode}`}
                  >
                    {selectedObject.modeLabels[mode]}
                  </DropdownMenuItem>
                ))}
              </RibbonDropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>
      <OfficeHomeRibbonGroup
        label={labels.windowGroup}
        ribbon="view"
        testId="presentation-ribbon-view-window-group"
      >
        <OfficeHomeCommandRow>
          <OfficeHomeCommand
            variant="large"
            icon={<OfficeSemanticIcon semanticId="view.window" size={24} />}
            label={labels.newWindow}
            onClick={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("New Window"))}
            controlId="PPTCTL.RIBBON.VIEW.WINDOW.NEW"
            testId="presentation-ribbon-view-new-window"
          />
          <OfficeHomeCommand
            variant="large"
            icon={<OfficeSemanticIcon semanticId="view.tiles" size={24} />}
            label={labels.arrangeAll}
            onClick={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Arrange All"))}
            controlId="PPTCTL.RIBBON.VIEW.WINDOW.ARRANGE_ALL"
            testId="presentation-ribbon-view-arrange-all"
          />
          <OfficeHomeCommand
            variant="large"
            icon={<OfficeSemanticIcon semanticId="view.grid" size={24} />}
            label={labels.cascade}
            onClick={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Cascade"))}
            controlId="PPTCTL.RIBBON.VIEW.WINDOW.CASCADE"
            testId="presentation-ribbon-view-cascade"
          />
          <DropdownMenu>
              <OfficeHomeMenuTrigger
                variant="large"
                hasMenuIndicator
                icon={<OfficeSemanticIcon semanticId="view.window" size={24} />}
                label={labels.switchWindows}
                onClick={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Switch Windows"))}
                controlId="PPTCTL.RIBBON.VIEW.WINDOW.SWITCH"
                testId="presentation-ribbon-view-switch-windows"
              />
            <RibbonDropdownMenuContent
              align="start"
              data-testid="presentation-ribbon-view-switch-windows-menu"
            >
              {(windows?.choices() ?? []).map((choice, index) => (
                <DropdownMenuItem
                  key={choice.id}
                  role="menuitemradio"
                  aria-checked={choice.current}
                  onSelect={() => windows?.onSwitch(choice.id)}
                  data-testid={`presentation-ribbon-view-switch-window-${index}`}
                >
                  {`${index + 1} ${choice.title}`}
                </DropdownMenuItem>
              ))}
            </RibbonDropdownMenuContent>
          </DropdownMenu>
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>
    </>
  );
}
