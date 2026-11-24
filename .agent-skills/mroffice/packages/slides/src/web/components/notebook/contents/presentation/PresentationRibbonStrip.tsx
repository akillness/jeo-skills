"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The presentation Ribbon strip: a thin adapter over the shared Office ribbon
 * chassis that lays out the active tab's groups.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { useDeferredValue, useMemo, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { OFFICE_HOME_METRICS } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeRibbonSurfaceStrip } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonSurfaceStrip.tsx";
import type { PresentationWebRibbonTab } from "../../../../lib/presentation/ribbon-tabs";

/**
 * Presentation-owned wrapper around the Note Editor ribbon-strip contract.
 * The command band never wraps: narrow windows page the complete row instead
 * of clipping later groups. Geometry comes from the shared Docs helpers.
 */
/**
 * Thin adapter over the SHARED Office ribbon chassis
 * (`components/office-ribbon/OfficeRibbonChassis`). The scaffold used to live
 * here as a parallel copy of the docs implementation; it now renders the one
 * chassis both editors converge on — props kept so call sites are untouched.
 */
export function PresentationRibbonStrip(props: {
  activeTab: PresentationWebRibbonTab;
  ariaLabel: string;
  children: ReactNode;
}) {
  // While words are typed on the slide, the groups follow in a deferred
  // render: a keystroke commits without drawing the whole ribbon again, and
  // the ribbon catches up in a render the next keystroke interrupts. At any
  // other time (another tab, a command on the ribbon, the moment an insert
  // finishes) the ribbon is drawn at once: a control left a render behind
  // answered the next press with its old state (a Screenshot button still
  // disabled by the capture that had just ended ignored the next Enter).
  const current = useMemo(
    () => ({ tab: props.activeTab, children: props.children }),
    [props.activeTab, props.children],
  );
  const shown = useDeferredValue(current);
  const children = shown.tab === props.activeTab && typingOutsideTheRibbon()
    ? shown.children
    : props.children;
  return (
    <div style={{ display: "contents" }} data-presentation-ribbon-strip="">
      <PresentationRibbonStripBody activeTab={props.activeTab} ariaLabel={props.ariaLabel}>
        {children}
      </PresentationRibbonStripBody>
    </div>
  );
}

/** Words are being typed somewhere other than the ribbon (a text box, a
 * shape's words, a table cell or the notes): the focus is in an editable
 * text field outside every ribbon strip. */
function typingOutsideTheRibbon(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active.closest("[data-presentation-ribbon-strip]")) return false;
  return active.isContentEditable || active.tagName === "TEXTAREA";
}

function PresentationRibbonStripBody({
  activeTab,
  ariaLabel,
  children,
}: {
  activeTab: PresentationWebRibbonTab;
  ariaLabel: string;
  children: ReactNode;
}) {
  const t = useTranslations("console-notebooks");
  const sharedProps = {
    activeTab,
    ariaLabel,
    testIdPrefix: "presentation",
    panelId: "presentation-ribbon-panel",
    panelLabelledBy: `presentation-ribbon-tab-${activeTab}`,
    scrollLeftLabel: t("presentation.ui.ribbon.scrollLeft"),
    scrollRightLabel: t("presentation.ui.ribbon.scrollRight"),
  } as const;
  // Which band anatomy and skin each tab wears. Every tab renders the ONE
  // strip below (OfficeRibbonSurfaceStrip): a different strip component per
  // anatomy unmounted the whole ribbon, its observers and its scroller, at
  // each crossing.
  const insertAnatomy =
    activeTab === "insert" ||
    false ||
    false ||
    false ||
    false ||
    false;
  // A tab not named here is a secondary Home band, never a bare strip:
  // Chart Design and SmartArt Format used to fall through to a bare
  // `OfficeRibbonStrip`, where the generic window button skins
  // (`.note-editor-ribbon-big` padding, `.native-page-window button` border)
  // won and every large menu command drew as a bordered card with an inset
  // 10px chevron pill instead of the Insert tab's 52px face over a full-width
  // 14px rail.
  const className =
    activeTab === "home"
      ? presentationChrome.homeRibbonSurface
      : activeTab === "insert"
        ? presentationChrome.insertRibbonSurface
        : presentationChrome.secondaryRibbonSurface;
  return (
    <OfficeRibbonSurfaceStrip
      surface={insertAnatomy ? "insert" : "home"}
      density="office"
      bandHeight={OFFICE_HOME_METRICS.office.bandHeight}
      className={className}
      {...sharedProps}
    >
      {children}
    </OfficeRibbonSurfaceStrip>
  );
}
