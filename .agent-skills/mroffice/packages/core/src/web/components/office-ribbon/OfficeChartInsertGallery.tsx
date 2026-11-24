"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Check } from "./icons/houseIcons";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import { RibbonDropdownMenuSubContent } from "./CupertinoRibbonMenu";
import {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
  CHART_SUBTYPES_BY_FAMILY,
  chartInsertSections,
  type ChartFamily,
  type ChartSubtype,
} from "../../lib/office-charts/catalog";
import { OfficeChartSchematic as ChartSchematic } from "./OfficeChartSchematic";
import styles from "./OfficeInsertGallery.module.css";

export {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
  chartInsertSections,
};

/**
 * The host whose accent the gallery paints. Purely presentational: the catalog
 * is the same in every application, so a host never filters leaves here.
 */
export type OfficeChartGalleryApplication =
  | "docs"
  | "presentation"
  | "spreadsheet";

/** What one family flyout draws: the sections and cards, without the flyout. */
export interface OfficeChartFamilySectionsProps {
  application?: OfficeChartGalleryApplication;
  disabled: boolean;
  /** The families to draw, in the order the host wants them. */
  families: readonly ChartFamily[];
  selectedFamily?: ChartFamily;
  selectedSubtype?: ChartSubtype;
  familyLabel: (family: ChartFamily) => string;
  subtypeLabel: (family: ChartFamily, subtype: ChartSubtype) => string;
  onSelect: (family: ChartFamily, subtype: ChartSubtype) => void;
  /**
   * A leaf this host offers but cannot write back. The card stays in the menu
   * (Office's catalog is the same everywhere) and is rendered disabled with
   * {@link OfficeChartFamilySectionsProps.leafDisabledTitle} as its reason, so
   * nothing silently degrades into a different chart.
   */
  leafDisabled?: (family: ChartFamily, subtype: ChartSubtype) => boolean;
  /**
   * Why that leaf is disabled. A FUNCTION rather than one string because the
   * reasons differ per leaf ("this sheet cannot export it" vs "the selected
   * range has no data for it") and a card must say which one applies to it.
   */
  leafDisabledTitle?: (
    family: ChartFamily,
    subtype: ChartSubtype,
  ) => string | undefined;
  testIdPrefix: string;
}

/**
 * The body of one family's flyout: Office's 2D / 3D (or specialized) sections
 * of subtype cards. Split out of {@link OfficeChartInsertGallery} because a
 * host whose ribbon already has PER-FAMILY buttons (Excel's Insert ▸ Charts)
 * needs these sections directly in the button's dropdown, with no second
 * family level. Both callers therefore render the same cards and test ids.
 */
export function OfficeChartFamilySections(
  props: OfficeChartFamilySectionsProps,
) {
  const multiFamily = props.families.length > 1;
  return (
    <>
      {props.families.map((family) =>
        chartInsertSections(family).map((section) => {
          const familyLabel = props.familyLabel(family);
          // Excel titles a multi-family dropdown's sections with the family
          // ("2D Line", "3D Area"); inside a single family's flyout the family
          // is already the trigger, so Office shows the bare dimension.
          const dimension =
            section.kind === "twoDimensional"
              ? "2D"
              : section.kind === "threeDimensional"
                ? "3D"
                : null;
          const heading = !dimension
            ? familyLabel
            : multiFamily
              ? `${dimension} ${familyLabel}`
              : dimension;
          return (
            <section
              key={`${family}-${section.kind}`}
              className={styles.section}
              // The section's name is its title in full ("2D Line" even in a
              // family's own flyout), never the catalogue's key (live audit
              // S-181: "twoDimensional: 折线图").
              aria-label={dimension ? `${dimension} ${familyLabel}` : familyLabel}
            >
              <div className={styles.sectionHeading}>{heading}</div>
              <div className={styles.grid}>
                {section.subtypes.map((subtype) => {
                  const selected =
                    props.selectedFamily === family &&
                    props.selectedSubtype === subtype;
                  const unsupported =
                    props.leafDisabled?.(family, subtype) === true;
                  const unsupportedTitle = unsupported
                    ? props.leafDisabledTitle?.(family, subtype)
                    : undefined;
                  return (
                    <DropdownMenuItem
                      key={subtype}
                      className={`${styles.card}${selected ? ` ${styles.selected}` : ""}`}
                      data-testid={`${props.testIdPrefix}-leaf-${family}-${subtype}`}
                      disabled={props.disabled || unsupported}
                      onSelect={() => {
                        if (!props.disabled && !unsupported) props.onSelect(family, subtype);
                      }}
                      {...(unsupportedTitle ? {
                        title: unsupportedTitle,
                        "aria-label": `${props.subtypeLabel(family, subtype)}: ${unsupportedTitle}`,
                        // The menu primitive disables pointer hit-testing. Keep
                        // this disabled item hoverable so its reason is visible;
                        // Radix and the explicit guard still prevent selection.
                        style: { pointerEvents: "auto" as const, cursor: "not-allowed" },
                      } : {})}
                    >
                      <ChartSchematic family={family} subtype={subtype} />
                      <span>{props.subtypeLabel(family, subtype)}</span>
                      {selected ? (
                        <Check className={styles.check} aria-hidden />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </section>
          );
        }),
      )}
    </>
  );
}

export interface OfficeChartInsertGalleryProps {
  /**
   * The host ribbon this gallery is mounted in. Only paints the accent; it
   * never narrows the catalog, because Office offers the same chart catalog in
   * every application.
   */
  application?: OfficeChartGalleryApplication;
  disabled: boolean;
  selectedFamily: ChartFamily;
  selectedSubtype: ChartSubtype;
  familyLabel: (family: ChartFamily) => string;
  subtypeLabel: (family: ChartFamily, subtype: ChartSubtype) => string;
  onSelect: (family: ChartFamily, subtype: ChartSubtype) => void;
  /**
   * Escape hatch for a host that must offer a subset (or a different order) of
   * the catalog. Rendered as one undivided list; the default two-block layout
   * with Office's divider applies when it is absent.
   */
  families?: readonly ChartFamily[];
  leafDisabled?: OfficeChartFamilySectionsProps["leafDisabled"];
  leafDisabledTitle?: OfficeChartFamilySectionsProps["leafDisabledTitle"];
  /**
   * Entries that each hold several families' flyout sections, in this order
   * (PowerPoint for Mac's nine, `OFFICE_MAC_CHART_MENU_GROUPS`). An entry is
   * named and drawn as its `family` and keeps that family's test ids.
   */
  familyGroups?: readonly {
    readonly family: ChartFamily;
    readonly families: readonly ChartFamily[];
  }[];
  testIdPrefix?: string;
}

export function OfficeChartInsertGallery(props: OfficeChartInsertGalleryProps) {
  const application = props.application;
  const testIdPrefix = props.testIdPrefix ?? "document-toolbar-chart-gallery";
  const renderFamily = (
    family: ChartFamily,
    families: readonly ChartFamily[] = [family],
  ) => (
    <DropdownMenuSub key={family}>
      <DropdownMenuSubTrigger
        className={application ? styles.familyTrigger : undefined}
        data-smartart-gallery-application={application}
        data-testid={`${testIdPrefix}-family-${family}`}
        disabled={props.disabled}
      >
        <ChartSchematic
          family={family}
          subtype={CHART_SUBTYPES_BY_FAMILY[family][0]}
          compact
        />
        <span className={styles.familyLabel}>{props.familyLabel(family)}</span>
      </DropdownMenuSubTrigger>
      <RibbonDropdownMenuSubContent
        className={styles.flyout}
        data-smartart-gallery-application={application}
        data-testid={`${testIdPrefix}-flyout-${family}`}
      >
        <OfficeChartFamilySections
          application={application}
          disabled={props.disabled}
          families={families}
          familyLabel={props.familyLabel}
          leafDisabled={props.leafDisabled}
          leafDisabledTitle={props.leafDisabledTitle}
          onSelect={props.onSelect}
          selectedFamily={props.selectedFamily}
          selectedSubtype={props.selectedSubtype}
          subtypeLabel={props.subtypeLabel}
          testIdPrefix={testIdPrefix}
        />
      </RibbonDropdownMenuSubContent>
    </DropdownMenuSub>
  );
  if (props.familyGroups)
    return (
      <>
        {props.familyGroups.map((group) =>
          renderFamily(group.family, group.families),
        )}
      </>
    );
  if (props.families)
    return <>{props.families.map((family) => renderFamily(family))}</>;
  return (
    <>
      {CHART_INSERT_OFFICE_FAMILIES.map((family) => renderFamily(family))}
      <DropdownMenuSeparator />
      {CHART_INSERT_ENHANCEMENT_FAMILIES.map((family) => renderFamily(family))}
    </>
  );
}

export { OfficeChartSchematic } from "./OfficeChartSchematic";
