"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The slide rail right-click menu content (slide and gap menus); the menu
 * root, its key and its anchor stay in the window.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { RibbonDropdownMenuContent as DropdownMenuContent, RibbonDropdownMenuSubContent as DropdownMenuSubContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import {
  OFFICE_CONTEXT_MENU_CLASS,
  OFFICE_CONTEXT_MENU_PART,
  officeContextMenuClassName,
  officeShortcut,
} from "@mrnote/core/web/lib/office-context-menu.ts";
import {
  IconNewSlide,
  IconDuplicateSlide,
  IconSlideLayout,
  IconSlideShowHideSlide,
  IconSlideShowFromCurrent,
} from "../PresentationRibbonIcons";
import { presentationDesktopShortcutLabel } from "../../../../lib/presentation-desktop-shortcuts";
import { PresentationSectionIcon } from "./PresentationSectionIcons";
import {
  Trash2,
  LayoutTemplate,
  Link2,
  MessageSquare,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { presentationSlideLayoutCommandsAreWritable } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { PresentationCommandAdapter, PresentationSlideVisibilityCommandAdapter } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import type { LayoutDefinition } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type { ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { JSX } from "react/jsx-runtime";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationSlideRailMenuContentCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  openBackgroundPane: () => void;
  slides: SlideModel[];
  rootRef: RefObject<HTMLDivElement | null>;
  slideRailMenu: { kind: "slide"; slideId: string; slideIds?: readonly string[]; x: number; y: number; } | { kind: "gap"; afterSlideId: string; x: number; y: number; };
  slidesRef: RefObject<SlideModel[]>;
  activeLayoutChoiceIsWritable: (layoutValue: string) => boolean;
  createSectionAtSlide: (slideIndex: number) => void;
  setCommentsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setCommentComposerOpen: Dispatch<SetStateAction<boolean>>;
  duplicateSlideCommand: PresentationCommandAdapter<"slides.duplicate">;
  selectSlideForRailCommand: (slideId: string) => number | null;
  deleteSlideAtIndex: (index: number) => boolean;
  deleteSlidesByIds: (ids: readonly string[]) => boolean;
  copySlideToClipboard: (slideId: string) => boolean;
  cutSlideToClipboard: (slideId: string) => boolean;
  pasteSlideAfter: (afterSlideId: string) => boolean;
  duplicateSlidesByIds: (ids: readonly string[]) => boolean;
  slideVisibilityCommand: PresentationSlideVisibilityCommandAdapter;
  addSlideFromLayout: (layoutValue?: string, afterSlideId?: string) => void;
  copyInternalSlideLink: (slideId: string) => Promise<boolean>;
  presentationLayoutListName: (layout: { id: string; nameKey: string; }) => string;
  deckLayoutDefinitions: LayoutDefinition[];
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
  toggleActiveSlideVisibility: () => void;
  executeHomeLayout: (layoutId: string) => void;
  slideRailMenuAfterSlideId: string | null;
  slideRailMenuTargetSlide: SlideModel | undefined;
  slideRailMenuSectionIndex: number;
  slideRailMenuCanAddSlide: boolean;
  slideRailMenuSelectedIds: readonly string[] | null;
  slideRailMenuCanDuplicate: boolean;
  slideRailMenuCanCut: boolean;
  slideRailMenuCanPaste: boolean;
  slideRailMenuCanAddSection: boolean;
  slideRailMenuCanOpenCommentComposer: boolean;
  slideRailMenuCanCopyLink: boolean;
  contextMenuNewCommentShortcut: string;
  slideRailMenuIcon: (node: ReactNode) => JSX.Element;
}

export function PresentationSlideRailMenuContent({ ctl }: { ctl: PresentationSlideRailMenuContentCtl }) {
  const {
    t,
    openBackgroundPane,
    slides,
    rootRef,
    slideRailMenu,
    slidesRef,
    activeLayoutChoiceIsWritable,
    createSectionAtSlide,
    setCommentsPanelOpen,
    setCommentComposerOpen,
    duplicateSlideCommand,
    selectSlideForRailCommand,
    deleteSlideAtIndex,
    deleteSlidesByIds,
    copySlideToClipboard,
    cutSlideToClipboard,
    pasteSlideAfter,
    duplicateSlidesByIds,
    slideVisibilityCommand,
    addSlideFromLayout,
    copyInternalSlideLink,
    presentationLayoutListName,
    deckLayoutDefinitions,
    featureDecision,
    executePresentationFeature,
    toggleActiveSlideVisibility,
    executeHomeLayout,
    slideRailMenuAfterSlideId,
    slideRailMenuTargetSlide,
    slideRailMenuSectionIndex,
    slideRailMenuCanAddSlide,
    slideRailMenuSelectedIds,
    slideRailMenuCanDuplicate,
    slideRailMenuCanCut,
    slideRailMenuCanPaste,
    slideRailMenuCanAddSection,
    slideRailMenuCanOpenCommentComposer,
    slideRailMenuCanCopyLink,
    contextMenuNewCommentShortcut,
    slideRailMenuIcon,
  } = ctl;
  return (
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={2}
                // The thumbnail pane's right-click menu is a right-click menu
                // like every other: the one size specification
                // (office-context-menu, styles/office-context-menu.css).
                className={OFFICE_CONTEXT_MENU_CLASS}
                data-testid={
                  slideRailMenu.kind === "gap"
                    ? "presentation-slide-gap-menu"
                    : "presentation-slide-context-menu"
                }
                data-kind={slideRailMenu.kind}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const selector =
                    slideRailMenu.kind === "slide"
                      ? '[data-testid="presentation-slide-tab"]'
                      : '[data-testid="presentation-slide-insert-gap"]';
                  const identity =
                    slideRailMenu.kind === "slide"
                      ? slideRailMenu.slideId
                      : slideRailMenu.afterSlideId;
                  const focusTarget = Array.from(
                    rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
                  ).find((element) =>
                    slideRailMenu.kind === "slide"
                      ? element.dataset.slideId === identity
                      : element.dataset.afterSlideId === identity,
                  );
                  focusTarget?.focus({ preventScroll: true });
                }}
              >
                {slideRailMenu.kind === "gap" ? (
                  <>
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanPaste}
                      data-testid="presentation-slide-gap-paste"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? pasteSlideAfter(slideRailMenuAfterSlideId)
                          : false
                      }
                    >
                      {slideRailMenuIcon(
                        <DocsHomeIcon name="paste" size={20} />,
                      )}
                      <span>{t("toolbar.paste")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {officeShortcut("paste")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanAddSlide}
                      data-testid="presentation-slide-gap-new"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? addSlideFromLayout(
                              "title-content",
                              slideRailMenuAfterSlideId,
                            )
                          : undefined
                      }
                    >
                      {slideRailMenuIcon(<IconNewSlide home size={20} />)}
                      <span>{t("presentation.addSlide")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanAddSection}
                      data-testid="presentation-slide-gap-section"
                      onSelect={() =>
                        createSectionAtSlide(slideRailMenuSectionIndex)
                      }
                    >
                      {slideRailMenuIcon(<PresentationSectionIcon name="add" />)}
                      <span>{t("presentation.desktopMenu.addSection")}</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanCut}
                      data-testid="presentation-slide-context-cut"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? cutSlideToClipboard(slideRailMenuAfterSlideId)
                          : false
                      }
                    >
                      {slideRailMenuIcon(<DocsHomeIcon name="cut" size={20} />)}
                      <span>{t("toolbar.cut")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {officeShortcut("cut")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!slideRailMenuTargetSlide}
                      data-testid="presentation-slide-context-copy"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? copySlideToClipboard(slideRailMenuAfterSlideId)
                          : false
                      }
                    >
                      {slideRailMenuIcon(<DocsHomeIcon name="copy" size={20} />)}
                      <span>{t("toolbar.copy")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {officeShortcut("copy")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanPaste}
                      data-testid="presentation-slide-context-paste"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? pasteSlideAfter(slideRailMenuAfterSlideId)
                          : false
                      }
                    >
                      {slideRailMenuIcon(
                        <DocsHomeIcon name="paste" size={20} />,
                      )}
                      <span>{t("toolbar.paste")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {officeShortcut("paste")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanAddSlide}
                      data-testid="presentation-slide-context-new"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? addSlideFromLayout(
                              "title-content",
                              slideRailMenuAfterSlideId,
                            )
                          : undefined
                      }
                    >
                      {slideRailMenuIcon(<IconNewSlide home size={20} />)}
                      <span>{t("presentation.addSlide")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {presentationDesktopShortcutLabel("newSlide")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanDuplicate}
                      data-testid="presentation-slide-context-duplicate"
                      onSelect={() => {
                        // The Slide Sorter's selection goes together (PPT-B401).
                        if (slideRailMenuSelectedIds) {
                          duplicateSlidesByIds(slideRailMenuSelectedIds);
                          return;
                        }
                        if (
                          slideRailMenuAfterSlideId &&
                          selectSlideForRailCommand(
                            slideRailMenuAfterSlideId,
                          ) !== null
                        ) {
                          duplicateSlideCommand.execute();
                        }
                      }}
                    >
                      {slideRailMenuIcon(
                        <IconDuplicateSlide home size={20} />,
                      )}
                      <span>{t("presentation.duplicateSlide")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {presentationDesktopShortcutLabel("duplicateSlide")}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      // Every slide selected: the deck keeps one, so Delete
                      
                      disabled={
                        slides.length <= 1 ||
                        (slideRailMenuSelectedIds?.length ?? 0) >= slides.length
                      }
                      title={
                        slides.length <= 1 ||
                        (slideRailMenuSelectedIds?.length ?? 0) >= slides.length
                          ? t("presentation.deleteSlideKeepOne")
                          : undefined
                      }
                      data-danger="true"
                      data-testid="presentation-slide-context-delete"
                      onSelect={() => {
                        // The Slide Sorter's selection goes together (PPT-B401).
                        if (slideRailMenuSelectedIds) {
                          deleteSlidesByIds(slideRailMenuSelectedIds);
                          return;
                        }
                        const index = slideRailMenuAfterSlideId
                          ? slidesRef.current.findIndex(
                              (slide) => slide.id === slideRailMenuAfterSlideId,
                            )
                          : -1;
                        if (index >= 0) deleteSlideAtIndex(index);
                      }}
                    >
                      {slideRailMenuIcon(<Trash2 size={20} />)}
                      <span>{t("presentation.deleteSlide")}</span>
                    </DropdownMenuItem>
                    {/* PowerPoint's thumbnail menu: Add Section sits with the
                        slide commands (PPT-C014). */}
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanAddSection}
                      data-testid="presentation-slide-context-section"
                      onSelect={() =>
                        createSectionAtSlide(slideRailMenuSectionIndex)
                      }
                    >
                      {slideRailMenuIcon(<PresentationSectionIcon name="add" />)}
                      <span>{t("presentation.desktopMenu.addSection")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        disabled={
                          !presentationSlideLayoutCommandsAreWritable(
                            slideRailMenuTargetSlide,
                          )
                        }
                        data-testid="presentation-slide-context-layout"
                      >
                        {slideRailMenuIcon(<IconSlideLayout home size={20} />)}
                        <span>{t("presentation.layoutLabel")}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className={officeContextMenuClassName({ submenu: true })}
                      >
                        {deckLayoutDefinitions.map((layout) => (
                          <DropdownMenuItem
                            key={layout.id}
                            disabled={!activeLayoutChoiceIsWritable(layout.id)}
                            data-testid={`presentation-slide-context-layout-${layout.id}`}
                            onSelect={() => {
                              if (
                                slideRailMenuAfterSlideId &&
                                selectSlideForRailCommand(
                                  slideRailMenuAfterSlideId,
                                ) !== null
                              ) {
                                executeHomeLayout(layout.id);
                              }
                            }}
                          >
                            {slideRailMenuIcon(
                              <LayoutTemplate size={18} />,
                            )}
                            <span>
                              {presentationLayoutListName(layout)}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      data-testid="presentation-slide-context-format-background"
                      onSelect={() => {
                        if (
                          slideRailMenuAfterSlideId &&
                          selectSlideForRailCommand(
                            slideRailMenuAfterSlideId,
                          ) !== null
                        ) {
                          openBackgroundPane();
                        }
                      }}
                    >
                      {slideRailMenuIcon(officeContextMenuIcon("background"))}
                      <span>{t("presentation.contextMenu.formatBackground")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideVisibilityCommand.canExecute()}
                      data-testid="presentation-slide-context-hide"
                      onSelect={() => {
                        if (
                          slideRailMenuAfterSlideId &&
                          selectSlideForRailCommand(
                            slideRailMenuAfterSlideId,
                          ) !== null
                        ) {
                          toggleActiveSlideVisibility();
                        }
                      }}
                    >
                      {slideRailMenuIcon(
                        <IconSlideShowHideSlide home size={20} />,
                      )}
                      <span>
                        {isSlideHidden(slideRailMenuTargetSlide)
                          ? t("presentation.desktopMenu.unhideSlide")
                          : t("presentation.hideSlide")}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanCopyLink}
                      data-testid="presentation-slide-context-link"
                      onSelect={() =>
                        slideRailMenuAfterSlideId
                          ? void copyInternalSlideLink(
                              slideRailMenuAfterSlideId,
                            )
                          : undefined
                      }
                    >
                      {slideRailMenuIcon(<Link2 size={20} />)}
                      <span>{t("presentation.linkSlideLabel")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!featureDecision("slideshow.fromCurrent").enabled}
                      data-testid="presentation-slide-context-slide-show"
                      onSelect={() => {
                        if (
                          slideRailMenuAfterSlideId &&
                          selectSlideForRailCommand(
                            slideRailMenuAfterSlideId,
                          ) !== null
                        ) {
                          executePresentationFeature("slideshow.fromCurrent");
                        }
                      }}
                    >
                      {slideRailMenuIcon(<IconSlideShowFromCurrent home size={20} />)}
                      <span>{t("presentation.desktopMenu.slideShow")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!slideRailMenuCanOpenCommentComposer}
                      data-testid="presentation-slide-context-comment"
                      onSelect={() => {
                        if (
                          slideRailMenuAfterSlideId &&
                          selectSlideForRailCommand(
                            slideRailMenuAfterSlideId,
                          ) !== null
                        ) {
                          setCommentsPanelOpen(true);
                          setCommentComposerOpen(true);
                        }
                      }}
                    >
                      {slideRailMenuIcon(<MessageSquare size={20} />)}
                      <span>{t("presentation.review.newComment")}</span>
                      <DropdownMenuShortcut
                        className={OFFICE_CONTEXT_MENU_PART.shortcut}
                      >
                        {contextMenuNewCommentShortcut}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
  );
}
