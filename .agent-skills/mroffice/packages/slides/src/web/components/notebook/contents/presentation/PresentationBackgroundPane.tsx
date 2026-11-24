"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Format Background task pane (fill, background picture, hide background
 * graphics, Reset Background, Apply to All), rendered while the pane is open.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { PRESENTATION_PANE_CHROME } from "../../../../lib/presentation/window-constants";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeTaskPaneTabs } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  X,
  Square,
  Layers,
  Grid3x3,
  Image as ImageIcon,
  ImagePlus,
  Repeat,
  RotateCcw,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  resolveSlideBackgroundKindCapability,
  importedPictureBackgroundUsesLocalFileOnly,
  SLIDE_BG_PICTURE_FITS,
  type SlideBackgroundCapabilityDecision,
  type SlideBgKind,
} from "@mrnote/core/web/lib/presentation-slide-bg.ts";
import { PresentationBackgroundFillFields } from "./PresentationBackgroundFillFields";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { PresentationTaskPaneDock } from "../../../../lib/presentation/presentationTaskPaneDock";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationBackgroundPaneCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  backgroundRecentColors: string[];
  setBackgroundRecentColors: Dispatch<SetStateAction<string[]>>;
  backgroundPaneRef: RefObject<HTMLElement | null>;
  closeBackgroundPane: (returnFocus?: boolean) => void;
  activeSlide: SlideModel;
  updateActiveSlide: (patch: Partial<SlideModel>, coalesceKey?: string) => void;
  setHideBackgroundGraphics: (hidden: boolean) => void;
  setActiveSlideBgKind: (kind: SlideBgKind) => void;
  updateActiveSlidePicture: (patch: { url?: string; fit?: string; }) => void;
  updateActiveSlidePattern: (patch: { pattern?: string; color?: string; background?: string; }) => void;
  activeSlideBgKind: "none" | "solid" | "gradient" | "picture" | "pattern";
  backgroundPictureCapability: SlideBackgroundCapabilityDecision;
  backgroundActiveKindCapability: SlideBackgroundCapabilityDecision;
  backgroundGraphicsCapability: SlideBackgroundCapabilityDecision;
  backgroundApplyAllCapability: SlideBackgroundCapabilityDecision;
  taskPaneDock: PresentationTaskPaneDock;
  taskPaneTabsLabel: string;
  beginSlideBgPictureUpload: () => void;
  applyBackgroundToAll: () => void;
  resetActiveSlideBackground: () => void;
}

export function PresentationBackgroundPane({ ctl }: { ctl: PresentationBackgroundPaneCtl }) {
  const {
    t,
    backgroundRecentColors,
    setBackgroundRecentColors,
    backgroundPaneRef,
    closeBackgroundPane,
    activeSlide,
    updateActiveSlide,
    setHideBackgroundGraphics,
    setActiveSlideBgKind,
    updateActiveSlidePicture,
    updateActiveSlidePattern,
    activeSlideBgKind,
    backgroundPictureCapability,
    backgroundActiveKindCapability,
    backgroundGraphicsCapability,
    backgroundApplyAllCapability,
    taskPaneDock,
    taskPaneTabsLabel,
    beginSlideBgPictureUpload,
    applyBackgroundToAll,
    resetActiveSlideBackground,
  } = ctl;
  return (
            <aside
              ref={backgroundPaneRef}
              className={`${presentationChrome.taskPane} ${PRESENTATION_PANE_CHROME}`}
              role="dialog"
              aria-modal="false"
              aria-labelledby="presentation-background-pane-title"
              data-testid="presentation-background-pane"
              // Behind another pane of the dock: kept (its fields survive),
              // not shown, and not announced as a dialog.
              hidden={!taskPaneDock.isFront("background") || undefined}
              aria-hidden={!taskPaneDock.isFront("background") || undefined}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                closeBackgroundPane();
              }}
            >
              <header className={`${presentationChrome.taskPaneHeader} ${dialogParts.header}`}>
                <span>
                  <OfficeTaskPaneTabs
                    tabs={taskPaneDock.tabs("background")}
                    label={taskPaneTabsLabel}
                    selectedId="presentation-background-pane-title"
                  />
                </span>
                <button
                  type="button"
                  className={`${presentationChrome.taskPaneClose} ${dialogParts.close}`}
                  onClick={() => closeBackgroundPane()}
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  data-testid="presentation-background-pane-close"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>

              <section className={presentationChrome.taskPaneSection}>
                <span className={presentationChrome.taskPaneSectionLabel}>
                  {t("presentation.bgFillLabel")}
                </span>
                <div
                  className={presentationChrome.backgroundKindGrid}
                  role="radiogroup"
                  aria-label={t("presentation.bgFillLabel")}
                >
                  {/* PowerPoint's Format Background fills, in its order
                      (PPT-B024): desktop PowerPoint's Solid, Gradient,
                      Picture or texture and Pattern (E036; the web app has
                      only Solid and Picture). A slide with none of its own
                      shows the master's, and Reset Background returns it
                      there. */}
                  {(["solid", "gradient", "picture", "pattern"] as const).map((kind) => {
                    const decision = resolveSlideBackgroundKindCapability(activeSlide.source, kind);
                    const label = t(
                      `presentation.backgroundPane.fill.${kind}` as "presentation.backgroundPane.fill.solid",
                    );
                    const unavailable =
                      decision.reason ===
                      "imported-picture-patchback-unavailable"
                        ? t(
                            "presentation.backgroundPane.pictureImportedUnavailable",
                          )
                        : decision.reason ===
                            "imported-background-fill-preserve-only"
                          ? // The fill is the import's, kept as it is; the
                            // hide-graphics sentence was shown here before.
                            t("presentation.backgroundPane.advancedPreserved")
                          : null;
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={activeSlideBgKind === kind}
                        disabled={!decision.enabled}
                        className={presentationChrome.backgroundKindButton}
                        data-selected={
                          activeSlideBgKind === kind ? "true" : "false"
                        }
                        data-presentation-background-kind={kind}
                        data-testid={`presentation-background-${kind}`}
                        title={unavailable ?? label}
                        onClick={() => setActiveSlideBgKind(kind)}
                      >
                        {kind === "solid" ? (
                          <Square size={18} aria-hidden="true" />
                        ) : kind === "gradient" ? (
                          <Layers size={18} aria-hidden="true" />
                        ) : kind === "pattern" ? (
                          <Grid3x3 size={18} aria-hidden="true" />
                        ) : (
                          <ImageIcon size={18} aria-hidden="true" />
                        )}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className={presentationChrome.taskPaneSection}>
                {activeSlideBgKind === "none" ? (
                  <p className={presentationChrome.taskPaneHint}>
                    {t("presentation.backgroundPane.themeInherited")}
                  </p>
                ) : null}
                {activeSlideBgKind !== "none" &&
                !backgroundActiveKindCapability.enabled ? (
                  // An imported fill the writer can only keep as it is.
                  <p
                    className={presentationChrome.backgroundCapabilityNotice}
                    data-testid="presentation-background-advanced-preserved"
                  >
                    {t("presentation.backgroundPane.advancedPreserved")}
                  </p>
                ) : null}
                {activeSlideBgKind === "solid" ||
                activeSlideBgKind === "gradient" ||
                activeSlideBgKind === "pattern" ? (
                  <PresentationBackgroundFillFields
                    kind={activeSlideBgKind}
                    backgroundColor={activeSlide.backgroundColor}
                    backgroundTransparency={activeSlide.backgroundTransparency}
                    backgroundGradient={activeSlide.backgroundGradient}
                    backgroundPattern={activeSlide.backgroundPattern}
                    disabled={!backgroundActiveKindCapability.enabled}
                    recents={backgroundRecentColors}
                    paletteLabels={{
                      themeColors: t("spreadsheet.themeColors"),
                      standardColors: t("spreadsheet.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: t("spreadsheet.moreColors"),
                    }}
                    onSolidColor={(color) => updateActiveSlide({ backgroundColor: color })}
                    onTransparency={(percent) =>
                      updateActiveSlide(
                        { backgroundTransparency: percent > 0 ? percent : undefined },
                        "background-transparency",
                      )
                    }
                    onGradient={(gradient) =>
                      updateActiveSlide({ backgroundGradient: gradient }, "background-gradient")
                    }
                    onPattern={updateActiveSlidePattern}
                    onRecentColor={(color) =>
                      setBackgroundRecentColors((current) =>
                        [color, ...current.filter((value) => value !== color)].slice(0, 8),
                      )
                    }
                    t={t}
                  />
                ) : null}
                {activeSlideBgKind === "picture" ? (
                  <div
                    className={presentationChrome.backgroundFieldGrid}
                    data-testid="presentation-slide-bg-picture"
                  >
                    {!backgroundPictureCapability.enabled ? (
                      <p
                        className={presentationChrome.backgroundCapabilityNotice}
                        data-testid="presentation-background-picture-unavailable"
                      >
                        {t(
                          "presentation.backgroundPane.pictureImportedUnavailable",
                        )}
                      </p>
                    ) : null}
                    <label className={presentationChrome.backgroundWideField}>
                      <span>{t("presentation.bgPictureUrlPlaceholder")}</span>
                      <input
                        type="text"
                        value={(activeSlide.backgroundImage?.url as string) ?? ""}
                        onChange={(event) =>
                          updateActiveSlidePicture({ url: event.target.value })
                        }
                        disabled={
                          !backgroundPictureCapability.enabled ||
                          importedPictureBackgroundUsesLocalFileOnly(
                            activeSlide.source,
                          )
                        }
                        placeholder={t("presentation.bgPictureUrlPlaceholder")}
                        data-testid="presentation-slide-bg-picture-url"
                      />
                    </label>
                    <label>
                      <span>{t("presentation.bgPictureFitLabel")}</span>
                      <select
                        value={
                          // An imported stretch is PowerPoint's Fill.
                          activeSlide.backgroundImage?.fit === "stretch"
                            ? "cover"
                            : ((activeSlide.backgroundImage?.fit as string) ?? "cover")
                        }
                        onChange={(event) =>
                          updateActiveSlidePicture({ fit: event.target.value })
                        }
                        disabled={
                          !backgroundPictureCapability.enabled ||
                          importedPictureBackgroundUsesLocalFileOnly(
                            activeSlide.source,
                          )
                        }
                        data-testid="presentation-slide-bg-picture-fit"
                      >
                        {SLIDE_BG_PICTURE_FITS.map((fit) => (
                          <option key={fit} value={fit}>
                            {t(
                              `presentation.bgPictureFit.${fit}` as "presentation.bgPictureFit.cover",
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={presentationChrome.backgroundUploadButton}
                      onClick={beginSlideBgPictureUpload}
                      disabled={!backgroundPictureCapability.enabled}
                      data-testid="presentation-slide-bg-picture-upload"
                    >
                      <ImagePlus size={16} aria-hidden="true" />
                      {t("presentation.bgPictureUpload")}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className={presentationChrome.taskPaneSection}>
                <label
                  className={presentationChrome.backgroundGraphicsToggle}
                  title={
                    backgroundGraphicsCapability.enabled
                      ? undefined
                      : t("presentation.backgroundPane.hideGraphicsUnavailable")
                  }
                >
                  <input
                    type="checkbox"
                    checked={activeSlide.hideBackgroundGraphics === true}
                    disabled={!backgroundGraphicsCapability.enabled}
                    onChange={(event) =>
                      setHideBackgroundGraphics(event.target.checked)
                    }
                    data-testid="presentation-background-hide-graphics"
                  />
                  <span>
                    <strong>
                      {t("presentation.backgroundPane.hideGraphics")}
                    </strong>
                    {backgroundGraphicsCapability.enabled ? null : (
                      <small>
                        {t(
                          "presentation.backgroundPane.hideGraphicsUnavailable",
                        )}
                      </small>
                    )}
                  </span>
                </label>
              </section>

              <footer className={presentationChrome.taskPaneFooter}>
                <button
                  type="button"
                  className={dialogParts.primaryButton}
                  onClick={applyBackgroundToAll}
                  disabled={!backgroundApplyAllCapability.enabled}
                  title={
                    backgroundApplyAllCapability.reason ===
                    "imported-picture-patchback-unavailable"
                      ? t(
                          "presentation.backgroundPane.pictureImportedUnavailable",
                        )
                      : backgroundApplyAllCapability.reason ===
                          "imported-background-fill-preserve-only"
                        ? t("presentation.backgroundPane.advancedPreserved")
                        : t("presentation.backgroundApplyAll")
                  }
                  data-testid="presentation-background-apply-all"
                >
                  <Repeat size={16} aria-hidden="true" />
                  {t("presentation.backgroundApplyAll")}
                </button>
                <button
                  type="button"
                  className={dialogParts.button}
                  onClick={resetActiveSlideBackground}
                  disabled={
                    // Any fill resets to the master's. An imported fill the
                    // writer keeps as it is does not: the write-back refuses to replace a
                    // background element it cannot read, so the button says
                    // why instead of failing the save.
                    !resolveSlideBackgroundKindCapability(activeSlide.source, "none").enabled ||
                    activeSlideBgKind === "none"
                  }
                  title={
                    resolveSlideBackgroundKindCapability(activeSlide.source, "none").enabled
                      ? undefined
                      : t("presentation.backgroundPane.advancedPreserved")
                  }
                  data-testid="presentation-background-reset"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {t("presentation.backgroundMenu.reset")}
                </button>
              </footer>
            </aside>
  );
}
